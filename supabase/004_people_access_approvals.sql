-- Run in the EXISTING UYF HR project after 003. Keeps all existing HR records.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.hr_instance WHERE purpose='lm-hr-fresh') THEN RAISE EXCEPTION 'UYF HR instance required'; END IF;
END $$;
ALTER TABLE public.sys_users ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;
-- Establish one owner once, using the earliest active owner/admin account.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.sys_users WHERE is_owner) THEN
  UPDATE public.sys_users SET is_owner=true WHERE id=(SELECT id FROM public.sys_users WHERE is_active AND role IN ('boss','admin') ORDER BY created_at,id LIMIT 1);
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.hr_access_policies (
 user_id uuid PRIMARY KEY REFERENCES public.sys_users(id) ON DELETE CASCADE,
 policy jsonb NOT NULL, version integer NOT NULL DEFAULT 1,
 updated_by uuid REFERENCES public.sys_users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.hr_workflow_settings (
 workflow_key text PRIMARY KEY CHECK(workflow_key IN ('employee_information','leave','expense','probation','warning')),
 stages jsonb NOT NULL DEFAULT '[]', enabled boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1, updated_by uuid REFERENCES public.sys_users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.hr_approval_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workflow_key text NOT NULL,
 resource_id uuid, requester_id uuid NOT NULL REFERENCES public.sys_users(id), employee_id uuid,
 title text NOT NULL, snapshot jsonb NOT NULL DEFAULT '{}', stages jsonb NOT NULL,
 current_stage integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','paid','cancelled')),
 history jsonb NOT NULL DEFAULT '[]', version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workflow_key,resource_id)
);
CREATE INDEX IF NOT EXISTS hr_approval_requester_idx ON public.hr_approval_requests(requester_id);
CREATE INDEX IF NOT EXISTS hr_approval_pending_idx ON public.hr_approval_requests(status);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['hr_access_policies','hr_workflow_settings','hr_approval_requests'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $$;
-- Compare-and-swap settings writes: a stale owner tab cannot overwrite newer settings.
CREATE OR REPLACE FUNCTION public.hr_save_access(p_actor uuid,p_user uuid,p_policy jsonb,p_version integer)
RETURNS public.hr_access_policies LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_access_policies; BEGIN
 IF NOT EXISTS(SELECT 1 FROM sys_users WHERE id=p_actor AND is_owner AND is_active) THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF EXISTS(SELECT 1 FROM sys_users WHERE id=p_user AND is_owner) THEN RAISE EXCEPTION 'Owner access cannot be restricted'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_user::text));
 SELECT * INTO r FROM hr_access_policies WHERE user_id=p_user FOR UPDATE;
 IF COALESCE(r.version,0)<>p_version THEN RAISE EXCEPTION 'Settings changed. Reload and try again.'; END IF;
 INSERT INTO hr_access_policies(user_id,policy,updated_by) VALUES(p_user,p_policy,p_actor)
 ON CONFLICT(user_id) DO UPDATE SET policy=p_policy,updated_by=p_actor,version=hr_access_policies.version+1,updated_at=now() RETURNING * INTO r;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'UPDATE','People & Access','Access updated for account '||p_user||' version '||r.version);
 RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.hr_save_workflow(p_actor uuid,p_key text,p_stages jsonb,p_enabled boolean,p_version integer)
RETURNS public.hr_workflow_settings LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_workflow_settings; BEGIN
 IF NOT EXISTS(SELECT 1 FROM sys_users WHERE id=p_actor AND is_owner AND is_active) THEN RAISE EXCEPTION 'Owner access required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_key));
 SELECT * INTO r FROM hr_workflow_settings WHERE workflow_key=p_key FOR UPDATE;
 IF COALESCE(r.version,0)<>p_version THEN RAISE EXCEPTION 'Settings changed. Reload and try again.'; END IF;
 INSERT INTO hr_workflow_settings(workflow_key,stages,enabled,updated_by) VALUES(p_key,p_stages,p_enabled,p_actor)
 ON CONFLICT(workflow_key) DO UPDATE SET stages=p_stages,enabled=p_enabled,updated_by=p_actor,version=hr_workflow_settings.version+1,updated_at=now() RETURNING * INTO r;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'UPDATE','Approval Setup','Workflow '||p_key||' version '||r.version);
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.hr_save_access(uuid,uuid,jsonb,integer),public.hr_save_workflow(uuid,text,jsonb,boolean,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_save_access(uuid,uuid,jsonb,integer),public.hr_save_workflow(uuid,text,jsonb,boolean,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.bootstrap_hr_owner(expected_instance uuid, owner_username text, owner_name text, owner_password_hash text)
RETURNS uuid LANGUAGE plpgsql SET search_path=public AS $$
DECLARE owner_id uuid; BEGIN
 PERFORM pg_advisory_xact_lock(7319462);
 IF NOT EXISTS(SELECT 1 FROM hr_instance WHERE id=expected_instance AND purpose='lm-hr-fresh') THEN RAISE EXCEPTION 'Wrong HR instance'; END IF;
 IF EXISTS(SELECT 1 FROM sys_users) OR EXISTS(SELECT 1 FROM "Employees") THEN RAISE EXCEPTION 'Owner setup requires empty users and employees. Existing records will not be deleted.'; END IF;
 INSERT INTO sys_users(username,password_hash,role,full_name,is_active,is_owner) VALUES(owner_username,owner_password_hash,'boss',owner_name,true,true) RETURNING id INTO owner_id;
 RETURN owner_id;
END $$;
ALTER TABLE public.rewards_and_claims ADD COLUMN IF NOT EXISTS currency text;
CREATE OR REPLACE FUNCTION public.hr_decide_approval(p_actor uuid,p_id uuid,p_decision text,p_comment text,p_version integer,p_payment jsonb DEFAULT NULL)
RETURNS public.hr_approval_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_approval_requests; u sys_users; stage jsonb; module_key text; access_policy jsonb; next_index integer; next_status text; last_stage boolean; leave_row "Leave_Request"; bal "Leave_balances"; days numeric; paid boolean;
BEGIN
 SELECT * INTO u FROM sys_users WHERE id=p_actor;
 IF NOT FOUND OR NOT u.is_active THEN RAISE EXCEPTION 'Account is disabled'; END IF;
 SELECT * INTO r FROM hr_approval_requests WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
 IF r.status<>'pending' THEN RAISE EXCEPTION 'Request already completed'; END IF;
 IF r.version<>p_version THEN RAISE EXCEPTION 'Request changed. Reload and try again.'; END IF;
 IF r.requester_id=p_actor THEN RAISE EXCEPTION 'Cannot decide your own request'; END IF;
 stage=r.stages->r.current_stage;
 IF stage->>'assignee_id'<>p_actor::text THEN RAISE EXCEPTION 'This stage is assigned to someone else'; END IF;
 module_key=CASE r.workflow_key WHEN 'expense' THEN 'rewards' WHEN 'employee_information' THEN 'employees' WHEN 'probation' THEN 'performance' WHEN 'warning' THEN 'documents' ELSE r.workflow_key END;
 SELECT policy INTO access_policy FROM hr_access_policies WHERE user_id=p_actor;
 IF NOT u.is_owner AND NOT COALESCE((access_policy->'modules'->module_key) ? (stage->>'action'),false) THEN RAISE EXCEPTION 'Approval permission has been removed'; END IF;
 IF p_decision NOT IN ('approve','reject','pay') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
 IF p_decision='reject' AND length(trim(COALESCE(p_comment,'')))=0 THEN RAISE EXCEPTION 'Rejection reason required'; END IF;
 IF p_decision<>'reject' AND ((stage->>'action'='pay')<>(p_decision='pay')) THEN RAISE EXCEPTION 'Wrong action for this stage'; END IF;
 IF p_decision='pay' AND (p_payment IS NULL OR COALESCE((p_payment->>'amount')::numeric,0)<=0 OR COALESCE(p_payment->>'reference','')='' OR COALESCE(p_payment->>'currency','') NOT IN ('THB','MMK','USD') OR COALESCE(p_payment->>'date','')='') THEN RAISE EXCEPTION 'Payment details required'; END IF;
 next_index=r.current_stage+1;last_stage=next_index>=jsonb_array_length(r.stages);
 next_status=CASE WHEN p_decision='reject' THEN 'rejected' WHEN last_stage AND p_decision='pay' THEN 'paid' WHEN last_stage THEN 'approved' ELSE 'pending' END;
 IF r.workflow_key='leave' AND r.resource_id IS NOT NULL AND next_status IN ('approved','rejected') THEN
  SELECT * INTO leave_row FROM "Leave_Request" WHERE id=r.resource_id FOR UPDATE;
  IF NOT FOUND OR leave_row.status<>'Pending' THEN RAISE EXCEPTION 'Leave request changed'; END IF;
  IF next_status='approved' THEN
   SELECT count(*) INTO days FROM generate_series(leave_row.start_date::timestamp,leave_row.end_date::timestamp,interval '1 day') d WHERE extract(dow FROM d)<>0;
   SELECT * INTO bal FROM "Leave_balances" WHERE employee_id=leave_row.employee_id AND leave_type_id=leave_row.leave_type_id AND year=extract(year FROM leave_row.start_date)::integer FOR UPDATE;
   SELECT is_paid INTO paid FROM "Leave_type" WHERE id=leave_row.leave_type_id;
   IF COALESCE(paid,true) AND (bal.id IS NULL OR bal.entitled_days-bal.used_days<days) THEN RAISE EXCEPTION 'Insufficient leave balance'; END IF;
   IF bal.id IS NOT NULL THEN UPDATE "Leave_balances" SET used_days=used_days+days,remain_days=entitled_days-used_days-days WHERE id=bal.id; END IF;
  END IF;
  UPDATE "Leave_Request" SET status=CASE WHEN next_status='approved' THEN 'Approved' ELSE 'Rejected' END,e_signature=u.full_name,updated_at=now() WHERE id=r.resource_id;
 END IF;
 IF r.workflow_key='expense' AND r.resource_id IS NOT NULL THEN
  IF p_decision='reject' THEN UPDATE rewards_and_claims SET status='REJECTED',admin_remarks=p_comment,approved_by=p_actor WHERE id=r.resource_id;
  ELSIF stage->>'key'='coo' THEN UPDATE rewards_and_claims SET status='APPROVED',approved_amount=requested_amount,approved_by=p_actor WHERE id=r.resource_id;
  ELSIF p_decision='pay' THEN UPDATE rewards_and_claims SET status='PAID',currency=p_payment->>'currency' WHERE id=r.resource_id; END IF;
 END IF;
 UPDATE hr_approval_requests SET status=next_status,current_stage=CASE WHEN next_status='pending' THEN next_index ELSE current_stage END,
 history=history||jsonb_build_array(jsonb_build_object('stage',stage->>'key','label',stage->>'label','actor_id',p_actor,'actor_name',u.full_name,'decision',p_decision,'comment',p_comment,'payment',p_payment,'at',now())),version=version+1,updated_at=now() WHERE id=p_id RETURNING * INTO r;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,upper(p_decision),'Approvals',r.workflow_key||' request '||r.id||' stage '||(stage->>'key'));
 INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES(r.requester_id,'Request updated',r.title||': '||next_status,'/approvals');
 IF next_status='pending' THEN INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES((r.stages->r.current_stage->>'assignee_id')::uuid,'Approval needed',r.title,'/approvals'); END IF;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.hr_decide_approval(uuid,uuid,text,text,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_decide_approval(uuid,uuid,text,text,integer,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
