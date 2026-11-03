-- Additive: run once after 011 in the existing HR project. Safe to rerun.
BEGIN;
CREATE OR REPLACE FUNCTION public.hr_integrity_can(p_actor uuid,p_module text,p_action text,p_employee uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM sys_users u LEFT JOIN hr_access_policies a ON a.user_id=u.id
 WHERE u.id=p_actor AND u.is_active AND (u.is_owner OR (
 COALESCE(a.policy->'modules'->p_module,'[]'::jsonb) ? 'view'
 AND COALESCE(a.policy->'modules'->p_module,'[]'::jsonb) ? p_action
 AND (p_module<>'payroll' OR a.policy->'sensitive'->>'salary'='true')
 AND (p_employee IS NULL OR a.policy->>'scope'='all'
 OR (a.policy->>'scope'='own' AND u.employee_id=p_employee)
 OR (a.policy->>'scope'='selected' AND COALESCE(a.policy->'employee_ids','[]'::jsonb) ? p_employee::text))
 )));
$$;
-- A paid record is a financial receipt. Every write path, including racing
-- legacy requests and performance synchronization, observes this guard.
CREATE OR REPLACE FUNCTION public.hr_guard_paid_payroll()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF OLD.payment_status='Paid' AND (TG_OP='DELETE' OR NEW IS DISTINCT FROM OLD) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Paid payroll is immutable. Record a separate adjustment instead.';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hr_paid_payroll_guard ON public.payrolls;
CREATE TRIGGER hr_paid_payroll_guard BEFORE UPDATE OR DELETE ON public.payrolls FOR EACH ROW EXECUTE FUNCTION public.hr_guard_paid_payroll();

ALTER TABLE public.recruitment_candidates ADD COLUMN IF NOT EXISTS converted_employee_id uuid REFERENCES public."Employees"(id);
CREATE OR REPLACE FUNCTION public.hr_convert_candidate(p_actor uuid,p_candidate uuid,p_code text,p_password_hash text,p_shift uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c recruitment_candidates; e uuid; u uuid; chosen_shift uuid; role_title text; BEGIN
 IF NOT hr_integrity_can(p_actor,'recruitment','create') OR NOT EXISTS(
 SELECT 1 FROM sys_users x LEFT JOIN hr_access_policies a ON a.user_id=x.id WHERE x.id=p_actor AND (x.is_owner OR a.policy->>'scope'='all'))
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Recruitment create and All employees scope are required to convert a candidate.'; END IF;
 SELECT * INTO c FROM recruitment_candidates WHERE id=p_candidate FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found'; END IF;
 IF c.converted_employee_id IS NOT NULL THEN
  RETURN jsonb_build_object('employee_id',c.converted_employee_id,'already_converted',true,'username',(SELECT username FROM sys_users WHERE employee_id=c.converted_employee_id));
 END IF;
 IF c.status<>'Hired' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Candidate must be in Hired status'; END IF;
 IF p_code!~'^EMP-[A-Fa-f0-9-]{36}$' OR p_password_hash NOT LIKE 'MUST_CHANGE:$2%' THEN RAISE EXCEPTION 'Invalid account provisioning'; END IF;
 chosen_shift=p_shift;
 IF chosen_shift IS NULL AND c.position_id IS NOT NULL THEN
  SELECT lower(title) INTO role_title FROM positions WHERE id=c.position_id;
  SELECT id INTO chosen_shift FROM shifts WHERE lower(shift_name) LIKE CASE WHEN role_title LIKE '%reception%' THEN '%reception%' WHEN role_title LIKE '%kitchen%' THEN '%kitchen%' WHEN role_title LIKE '%housekeep%' THEN '%housekeep%' ELSE '%office%' END LIMIT 1;
  IF chosen_shift IS NULL THEN SELECT id INTO chosen_shift FROM shifts WHERE lower(shift_name) LIKE '%office%' LIMIT 1; END IF;
 END IF;
 INSERT INTO "Employees"(employee_id,"Full_name",email,phone,position_id,default_shift_id,status,employment_type)
 VALUES(p_code,c.full_name,c.email,c.phone,c.position_id,chosen_shift,'Active','Full-Time') RETURNING id INTO e;
 INSERT INTO sys_users(username,password_hash,role,employee_id,full_name) VALUES(lower(p_code),p_password_hash,'employee',e,c.full_name) RETURNING id INTO u;
 UPDATE recruitment_candidates SET status='Converted',converted_employee_id=e,updated_at=now() WHERE id=c.id;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'CONVERT','Recruitment','Candidate '||c.id||' converted to employee '||e);
 RETURN jsonb_build_object('employee_id',e,'username',lower(p_code),'already_converted',false);
END $$;

-- Permanent deletion is limited to a pristine record. Historical links,
-- including future foreign keys, block deletion before either account is lost.
CREATE OR REPLACE FUNCTION public.hr_delete_pristine_employee(p_actor uuid,p_employee uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; linked boolean; BEGIN
 IF NOT EXISTS(SELECT 1 FROM sys_users WHERE id=p_actor AND is_active AND is_owner) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Owner access required'; END IF;
 PERFORM 1 FROM "Employees" WHERE id=p_employee FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;
 IF EXISTS(SELECT 1 FROM sys_users WHERE employee_id=p_employee AND is_owner) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='The owner employee record cannot be removed.'; END IF;
 FOR r IN SELECT n.nspname,c.relname,a.attname FROM pg_constraint f
 JOIN pg_class c ON c.oid=f.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=ANY(f.conkey)
 WHERE f.contype='f' AND f.confrelid='public."Employees"'::regclass AND c.relname<>'sys_users'
 LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I=$1)',r.nspname,r.relname,r.attname) INTO linked USING p_employee;
  IF linked THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Employee has retained HR history or assignments. Use deactivate instead.'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM hr_approval_requests WHERE employee_id=p_employee) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Employee has retained approval history. Use deactivate instead.'; END IF;
 DELETE FROM sys_users WHERE employee_id=p_employee;
 DELETE FROM "Employees" WHERE id=p_employee;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'DELETE_PRISTINE','Employees','Removed unused employee '||p_employee);
 RETURN true;
END $$;

ALTER TABLE public.doc_approval_requests ADD COLUMN IF NOT EXISTS issued_document_id uuid REFERENCES public.employee_documents(id);
ALTER TABLE public.doc_approval_requests ADD COLUMN IF NOT EXISTS legacy_document_id uuid UNIQUE REFERENCES public.employee_documents(id);
-- Preserve pre-migration requests that used the original vault fallback.
INSERT INTO public.doc_approval_requests(id,employee_id,title,doc_type,category,description,file_url,effective_date,status,requested_by_user_id,boss_signature,boss_signed_at,hr_signature,hr_signed_at,rejection_reason,created_at,updated_at,legacy_document_id)
SELECT id,employee_id,title,doc_type,category,description,file_url,effective_date,status,requested_by_user_id,boss_signature,boss_signed_at,hr_signature,hr_signed_at,rejection_reason,created_at,updated_at,id
FROM public.employee_documents WHERE status IN ('PENDING_BOSS','APPROVED_BY_BOSS','REJECTED_BY_BOSS') ON CONFLICT(id) DO NOTHING;
ALTER TABLE public.doc_approval_requests ADD COLUMN IF NOT EXISTS approval_history jsonb NOT NULL DEFAULT '[]';
CREATE OR REPLACE FUNCTION public.hr_sign_document(p_actor uuid,p_request uuid,p_stage text,p_action text,p_signature text,p_reason text DEFAULT NULL)
RETURNS public.doc_approval_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r doc_approval_requests; d uuid; BEGIN
 SELECT * INTO r FROM doc_approval_requests WHERE id=p_request FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Document request not found'; END IF;
 IF NOT hr_integrity_can(p_actor,'documents','approve',r.employee_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document approval access required'; END IF;
 IF p_stage NOT IN ('boss','hr') OR p_action NOT IN ('APPROVE','REJECT') OR (p_stage='hr' AND p_action<>'APPROVE') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid signature action'; END IF;
 IF r.status='COMPLETED_AND_ISSUED' AND p_stage='hr' AND r.issued_document_id IS NOT NULL THEN RETURN r; END IF;
 IF (p_stage='boss' AND r.status<>'PENDING_BOSS') OR (p_stage='hr' AND r.status<>'APPROVED_BY_BOSS') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Document approval stage has changed. Reload the request.'; END IF;
 IF p_action='APPROVE' AND length(trim(COALESCE(p_signature,'')))=0 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='A signature is required'; END IF;
 IF p_action='REJECT' AND length(trim(COALESCE(p_reason,'')))=0 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='A rejection reason is required'; END IF;
 IF p_stage='boss' THEN
  UPDATE doc_approval_requests SET status=CASE WHEN p_action='REJECT' THEN 'REJECTED_BY_BOSS' ELSE 'APPROVED_BY_BOSS' END,
  boss_signature=CASE WHEN p_action='APPROVE' THEN p_signature ELSE NULL END,boss_signed_at=CASE WHEN p_action='APPROVE' THEN now() ELSE NULL END,
  rejection_reason=p_reason,updated_at=now() WHERE id=r.id;
 ELSE
  IF r.boss_signed_at IS NULL OR r.boss_signature IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Boss signature is required before HR issue'; END IF;
  IF r.legacy_document_id IS NOT NULL THEN
   UPDATE employee_documents SET boss_signature=r.boss_signature,boss_signed_at=r.boss_signed_at,hr_signature=p_signature,hr_signed_at=now(),status='COMPLETED_AND_ISSUED',updated_at=now() WHERE id=r.legacy_document_id RETURNING id INTO d;
  ELSE
  INSERT INTO employee_documents(employee_id,title,category,description,file_url,effective_date,boss_signature,boss_signed_at,hr_signature,hr_signed_at,status,uploaded_by_user_id)
  VALUES(r.employee_id,r.title,r.category,r.description,r.file_url,r.effective_date,r.boss_signature,r.boss_signed_at,p_signature,now(),'COMPLETED_AND_ISSUED',p_actor) RETURNING id INTO d;
  END IF;
  UPDATE doc_approval_requests SET status='COMPLETED_AND_ISSUED',hr_signature=p_signature,hr_signed_at=now(),issued_document_id=d,updated_at=now() WHERE id=r.id;
  IF r.employee_id IS NOT NULL THEN
   INSERT INTO employee_career_timeline(employee_id,event_type,title,description,effective_date)
   VALUES(r.employee_id,'OTHER','Official Document Issued: '||r.title,r.description,COALESCE(r.effective_date,current_date));
   INSERT INTO system_notifications(recipient_user_id,title,message,link_url)
   SELECT id,'Official Document Issued: '||r.title,'Your signed document is available in your Document Vault.','/portal/documents' FROM sys_users WHERE employee_id=r.employee_id;
  END IF;
 END IF;
 IF p_stage='boss' AND r.legacy_document_id IS NOT NULL THEN
  UPDATE employee_documents d SET status=q.status,boss_signature=q.boss_signature,boss_signed_at=q.boss_signed_at,rejection_reason=q.rejection_reason,updated_at=now()
  FROM doc_approval_requests q WHERE q.id=r.id AND d.id=r.legacy_document_id;
 END IF;
 IF p_stage='boss' AND r.requested_by_user_id IS NOT NULL THEN
  INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES(r.requested_by_user_id,'Document approval reviewed',r.title||': '||p_action,'/documents');
 END IF;
 UPDATE doc_approval_requests SET approval_history=approval_history||jsonb_build_array(jsonb_build_object('actor',p_actor,'stage',p_stage,'action',p_action,'at',now())) WHERE id=r.id RETURNING * INTO r;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'DOCUMENT_SIGN','Document Vault',p_stage||' '||p_action||' request '||r.id);
 RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.hr_guard_settlement_release()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.settlement_status='Released' AND (TG_OP='INSERT' OR OLD.settlement_status IS DISTINCT FROM 'Released') AND COALESCE(current_setting('hr.release_case',true),'')<>NEW.id::text THEN
 RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Use the settlement release action after clearance and handover checks.';
 END IF;
 IF TG_OP='UPDATE' AND OLD.settlement_status='Released' AND NEW.settlement_status IS DISTINCT FROM OLD.settlement_status THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Released settlement is final.'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hr_settlement_release_guard ON public.corporate_offboarding;
CREATE TRIGGER hr_settlement_release_guard BEFORE INSERT OR UPDATE ON public.corporate_offboarding FOR EACH ROW EXECUTE FUNCTION public.hr_guard_settlement_release();
CREATE OR REPLACE FUNCTION public.hr_release_settlement(p_actor uuid,p_case uuid)
RETURNS public.corporate_offboarding LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r corporate_offboarding; h text; BEGIN
 SELECT * INTO r FROM corporate_offboarding WHERE id=p_case FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
 IF NOT hr_integrity_can(p_actor,'offboarding','approve',r.employee_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Offboarding approval access required'; END IF;
 IF r.settlement_status='Released' THEN RETURN r; END IF;
 PERFORM 1 FROM offboarding_case_tasks WHERE offboarding_id=r.id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM offboarding_case_tasks WHERE offboarding_id=r.id) OR EXISTS(SELECT 1 FROM offboarding_case_tasks WHERE offboarding_id=r.id AND status IS DISTINCT FROM 'Completed') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Complete all offboarding tasks before releasing settlement'; END IF;
 IF r.handover_required IS DISTINCT FROM false THEN
  SELECT status INTO h FROM employee_handovers WHERE id=r.handover_id FOR SHARE;
  IF h IS NULL OR h NOT IN ('completed','waived') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Handover must be completed or waived before releasing final settlement'; END IF;
 END IF;
 PERFORM set_config('hr.release_case',r.id::text,true);
 UPDATE corporate_offboarding SET settlement_status='Released',updated_at=now() WHERE id=r.id RETURNING * INTO r;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'RELEASE','Offboarding','Settlement released for case '||r.id);
 RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.hr_guard_released_tasks()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE case_id uuid; released boolean; BEGIN
 case_id=CASE WHEN TG_OP='DELETE' THEN OLD.offboarding_id ELSE NEW.offboarding_id END;
 SELECT settlement_status='Released' INTO released FROM corporate_offboarding WHERE id=case_id FOR UPDATE;
 IF released AND (TG_OP='DELETE' OR NEW.status IS DISTINCT FROM 'Completed') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Released settlement clearance cannot be undone.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hr_released_tasks_guard ON public.offboarding_case_tasks;
CREATE TRIGGER hr_released_tasks_guard BEFORE INSERT OR UPDATE OR DELETE ON public.offboarding_case_tasks FOR EACH ROW EXECUTE FUNCTION public.hr_guard_released_tasks();

REVOKE ALL ON FUNCTION public.hr_integrity_can(uuid,text,text,uuid),public.hr_convert_candidate(uuid,uuid,text,text,uuid),public.hr_delete_pristine_employee(uuid,uuid),public.hr_sign_document(uuid,uuid,text,text,text,text),public.hr_release_settlement(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_integrity_can(uuid,text,text,uuid),public.hr_convert_candidate(uuid,uuid,text,text,uuid),public.hr_delete_pristine_employee(uuid,uuid),public.hr_sign_document(uuid,uuid,text,text,text,text),public.hr_release_settlement(uuid,uuid) TO service_role;

-- AI proposals contain an immutable payload. Only an explicit Owner UI action
-- can execute one; chat text and model function calls cannot confirm proposals.
CREATE TABLE IF NOT EXISTS public.hr_ai_action_proposals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL REFERENCES public.sys_users(id),
 session_id uuid NOT NULL REFERENCES public.boss_chat_sessions(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('create_kpi_task','send_team_announcement','send_employee_warning')),
 payload jsonb NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled','expired')),
 result jsonb,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 decided_at timestamptz
);
ALTER TABLE public.hr_ai_action_proposals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_ai_action_proposals FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.hr_ai_action_proposals TO service_role;
CREATE OR REPLACE FUNCTION public.hr_propose_ai_action(p_actor uuid,p_session uuid,p_kind text,p_payload jsonb)
RETURNS public.hr_ai_action_proposals LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_ai_action_proposals; BEGIN
 IF NOT EXISTS(SELECT 1 FROM sys_users WHERE id=p_actor AND is_owner AND is_active) OR NOT EXISTS(SELECT 1 FROM boss_chat_sessions WHERE id=p_session AND user_id=p_actor) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Owner session required'; END IF;
 INSERT INTO hr_ai_action_proposals(actor_id,session_id,kind,payload) VALUES(p_actor,p_session,p_kind,p_payload) RETURNING * INTO r;
 RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.hr_decide_ai_action(p_actor uuid,p_session uuid,p_proposal uuid,p_confirm boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_ai_action_proposals; target uuid; output jsonb; BEGIN
 IF NOT EXISTS(SELECT 1 FROM sys_users WHERE id=p_actor AND is_owner AND is_active) OR NOT EXISTS(SELECT 1 FROM boss_chat_sessions WHERE id=p_session AND user_id=p_actor) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Current Owner session required'; END IF;
 SELECT * INTO r FROM hr_ai_action_proposals WHERE id=p_proposal AND actor_id=p_actor AND session_id=p_session FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Proposal unavailable in this Owner session'; END IF;
 IF r.status='completed' THEN RETURN jsonb_build_object('executed_now',false,'status',r.status,'result',r.result); END IF;
 IF r.status<>'pending' OR r.expires_at<=now() THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Proposal expired or was cancelled. Request a fresh proposal.'; END IF;
 IF p_confirm IS DISTINCT FROM true THEN
  UPDATE hr_ai_action_proposals SET status='cancelled',decided_at=now() WHERE id=r.id;
  RETURN jsonb_build_object('executed_now',false,'status','cancelled');
 END IF;
 IF r.kind='create_kpi_task' THEN
  IF NOT EXISTS(SELECT 1 FROM "Employees" WHERE id=(r.payload->>'employee_id')::uuid AND status='Active' AND deleted_at IS NULL) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Selected employee is no longer active'; END IF;
  INSERT INTO boss_kpi_assignments(title,description,assigned_to_id,deadline,status)
  VALUES(r.payload->>'title',r.payload->>'description',(r.payload->>'employee_id')::uuid,NULLIF(r.payload->>'due_date','')::date,'Assigned') RETURNING id INTO target;
  output=jsonb_build_object('task_id',target);
 ELSIF r.kind='send_team_announcement' THEN
  INSERT INTO announcements(title,content,priority,target_role,is_pinned)
  VALUES(r.payload->>'title',(r.payload->>'content')||'___EXPIRY:'||(current_date+7)::text,r.payload->>'priority','All',true) RETURNING id INTO target;
  INSERT INTO system_notifications(recipient_role,title,message,link_url) VALUES('All','AI Announcement: '||(r.payload->>'title'),r.payload->>'content','/portal');
  output=jsonb_build_object('announcement_id',target);
 ELSE
  -- This sends an informational alert to the Owner; official disciplinary
  -- decisions remain in the signed Warning workflow.
  output=jsonb_build_object('owner_alert',true);
 END IF;
 UPDATE hr_ai_action_proposals SET status='completed',result=output,decided_at=now() WHERE id=r.id;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'CONFIRM_AI_ACTION','Owner AI',jsonb_build_object('proposal_id',r.id,'kind',r.kind,'payload',r.payload,'result',output)::text);
 RETURN jsonb_build_object('executed_now',true,'status','completed','result',output,'kind',r.kind,'payload',r.payload);
END $$;
REVOKE ALL ON FUNCTION public.hr_propose_ai_action(uuid,uuid,text,jsonb),public.hr_decide_ai_action(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_propose_ai_action(uuid,uuid,text,jsonb),public.hr_decide_ai_action(uuid,uuid,uuid,boolean) TO service_role;

COMMIT;
