-- Additive upgrade in the existing HR project AFTER 008. Preserves all prior records.
BEGIN;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.hr_instance WHERE purpose='lm-hr-fresh') OR to_regprocedure('public.hr_decide_probation(uuid,uuid,text,text,integer,jsonb,jsonb,jsonb)') IS NULL THEN RAISE EXCEPTION 'Existing HR instance with migration 008 required';END IF;END $$;
CREATE TABLE IF NOT EXISTS public.hr_warning_forms(
 id uuid PRIMARY KEY,employee_id uuid NOT NULL REFERENCES public."Employees"(id),creator_id uuid NOT NULL REFERENCES public.sys_users(id),
 letter_number text UNIQUE,status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','issued','rejected')),
 data jsonb NOT NULL,employee_snapshot jsonb NOT NULL,submitted_at timestamptz,issued_at timestamptz,issuance jsonb,
 employee_comment jsonb,acknowledgment jsonb,external_receipts jsonb NOT NULL DEFAULT '[]',hr_records jsonb NOT NULL DEFAULT '[]',
 version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.hr_warning_counters(letter_year integer PRIMARY KEY,last_number integer NOT NULL CHECK(last_number>0));
ALTER TABLE public.hr_warning_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_warning_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_warning_forms,public.hr_warning_counters FROM anon,authenticated;
GRANT ALL ON public.hr_warning_forms,public.hr_warning_counters TO service_role;
CREATE OR REPLACE FUNCTION public.hr_warning_can(p_actor uuid,p_employee uuid,p_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE((SELECT u.is_active AND (u.is_owner OR ((p.policy->'modules'->'warnings') ? p_action AND (p.policy->>'scope'='all' OR (p.policy->>'scope'='own' AND u.employee_id=p_employee) OR (p.policy->>'scope'='selected' AND (p.policy->'employee_ids') ? p_employee::text)))) FROM sys_users u LEFT JOIN hr_access_policies p ON p.user_id=u.id WHERE u.id=p_actor),false)
$$;
CREATE OR REPLACE FUNCTION public.hr_warning_personal(p_employee uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT u.id FROM sys_users u LEFT JOIN hr_access_policies p ON p.user_id=u.id WHERE u.employee_id=p_employee AND u.is_active AND (u.is_owner OR p.user_id IS NULL OR COALESCE(p.policy->'personal','[]') ? 'warnings') LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.hr_guard_warning() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN IF current_setting('hr.warning_write',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Use the assigned warning form workflow; records must be retained';END IF;IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END $$;
DROP TRIGGER IF EXISTS guard_warning ON public.hr_warning_forms;
CREATE TRIGGER guard_warning BEFORE INSERT OR UPDATE OR DELETE ON public.hr_warning_forms FOR EACH ROW EXECUTE FUNCTION public.hr_guard_warning();
CREATE OR REPLACE FUNCTION public.hr_guard_warning_approval() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE ref uuid;prior uuid;relevant boolean;
BEGIN
 IF TG_OP='DELETE' THEN ref=OLD.resource_id;ELSIF TG_OP='INSERT' THEN ref=NEW.resource_id;ELSE ref=NEW.resource_id;prior=OLD.resource_id;END IF;
 relevant=CASE WHEN TG_OP='INSERT' THEN NEW.workflow_key='warning' WHEN TG_OP='DELETE' THEN OLD.workflow_key='warning' ELSE NEW.workflow_key='warning' OR OLD.workflow_key='warning' END;
 IF relevant AND EXISTS(SELECT 1 FROM hr_warning_forms WHERE id=ref OR id=prior) AND current_setting('hr.warning_write',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Use the complete warning approval workflow';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_warning_approval ON public.hr_approval_requests;
CREATE TRIGGER guard_warning_approval BEFORE INSERT OR UPDATE OR DELETE ON public.hr_approval_requests FOR EACH ROW EXECUTE FUNCTION public.hr_guard_warning_approval();
CREATE OR REPLACE FUNCTION public.hr_save_warning(p_actor uuid,p_id uuid,p_employee uuid,p_data jsonb,p_version integer) RETURNS public.hr_warning_forms LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_warning_forms;u sys_users;e "Employees";
BEGIN
 SELECT * INTO u FROM sys_users WHERE id=p_actor AND is_active;IF NOT FOUND OR u.employee_id=p_employee THEN RAISE EXCEPTION 'An independent warning preparer is required';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('warning:'||p_id::text));
 SELECT * INTO r FROM hr_warning_forms WHERE id=p_id FOR UPDATE;
 IF r.id IS NULL THEN IF NOT hr_warning_can(p_actor,p_employee,'create') OR p_version<>0 THEN RAISE EXCEPTION 'Scoped Warnings create permission is required';END IF;
 ELSE IF r.employee_id<>p_employee OR r.status<>'draft' THEN RAISE EXCEPTION 'Submitted warning cannot be edited';END IF;IF NOT hr_warning_can(p_actor,p_employee,'edit') THEN RAISE EXCEPTION 'Scoped Warnings edit permission is required';END IF;IF r.version<>p_version THEN RAISE EXCEPTION 'Warning changed. Reload before saving';END IF;END IF;
 SELECT * INTO e FROM "Employees" WHERE id=p_employee AND deleted_at IS NULL;IF NOT FOUND THEN RAISE EXCEPTION 'Choose an active employee record';END IF;
 IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR length(p_data::text)>50000 THEN RAISE EXCEPTION 'Invalid warning details';END IF;
 PERFORM set_config('hr.warning_write','on',true);
 IF r.id IS NULL THEN INSERT INTO hr_warning_forms(id,employee_id,creator_id,data,employee_snapshot) VALUES(p_id,p_employee,p_actor,p_data,jsonb_build_object('name',e."Full_name",'employee_number',e.employee_id,'department',(SELECT "Department_name" FROM "Departments" WHERE id=e."Dept_id"),'position',(SELECT title FROM positions WHERE id=e.position_id),'manager',(SELECT "Full_name" FROM "Employees" WHERE id=e."Manager_id"))) RETURNING * INTO r;
 ELSE UPDATE hr_warning_forms SET data=p_data,version=version+1,updated_at=now() WHERE id=p_id RETURNING * INTO r;END IF;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'SAVE','Warnings',r.id::text||' version '||r.version);RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.hr_submit_warning(p_actor uuid,p_id uuid,p_version integer) RETURNS public.hr_warning_forms LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_warning_forms;cfg hr_workflow_settings;s jsonb;stages jsonb='[]';reviewer sys_users;pol jsonb;assigned uuid;idx integer=0;field text;yr integer;num integer;today date=(now() AT TIME ZONE 'Asia/Bangkok')::date;
BEGIN
 SELECT * INTO r FROM hr_warning_forms WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT hr_warning_can(p_actor,r.employee_id,'edit') OR EXISTS(SELECT 1 FROM sys_users WHERE id=p_actor AND employee_id=r.employee_id) THEN RAISE EXCEPTION 'Independent scoped Warnings edit permission is required';END IF;
 IF r.status<>'draft' OR r.version<>p_version THEN RAISE EXCEPTION 'Warning changed or already submitted';END IF;
 FOREACH field IN ARRAY ARRAY['level','letter_date','incident_date','description','policy','location','target_date'] LOOP IF length(trim(COALESCE(r.data->>field,'')))=0 THEN RAISE EXCEPTION 'Complete the warning details and review date';END IF;END LOOP;
 IF r.data->>'level' NOT IN ('first','second','final') OR r.data->>'previous_action' NOT IN ('none','verbal','written','other') OR r.data->>'previous_action' IS NULL THEN RAISE EXCEPTION 'Choose warning level and previous action';END IF;
 IF (r.data->>'letter_date')::date>today OR (r.data->>'incident_date')::date>(r.data->>'letter_date')::date OR (r.data->>'target_date')::date<(r.data->>'letter_date')::date THEN RAISE EXCEPTION 'Incident, letter and review dates do not reconcile';END IF;
 IF jsonb_typeof(r.data->'categories') IS DISTINCT FROM 'array' OR jsonb_typeof(r.data->'actions') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Choose valid categories and actions';END IF;
 IF jsonb_array_length(r.data->'categories')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(r.data->'categories') c WHERE c NOT IN ('attendance','performance','policy','instructions','conduct','negligence','safety','other')) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(r.data->'actions') c WHERE c NOT IN ('correct','policies','standards','training')) THEN RAISE EXCEPTION 'Choose valid categories and actions';END IF;
 IF (r.data->'categories' ? 'other' AND length(trim(COALESCE(r.data->>'other_category','')))=0) OR (r.data->>'previous_action'<>'none' AND length(trim(COALESCE(r.data->>'previous_details','')))=0) OR (jsonb_array_length(r.data->'actions')=0 AND length(trim(COALESCE(r.data->>'corrective_other','')))=0) THEN RAISE EXCEPTION 'Complete other category, previous action and corrective expectations';END IF;
 SELECT * INTO cfg FROM hr_workflow_settings WHERE workflow_key='warning' FOR SHARE;
 IF NOT FOUND OR NOT cfg.enabled OR jsonb_array_length(cfg.stages)<>2 THEN RAISE EXCEPTION 'Activate the Supervisor and HR workflow first';END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(cfg.stages) LOOP
  IF s->>'key' IS DISTINCT FROM (ARRAY['supervisor','hr'])[idx+1] THEN RAISE EXCEPTION 'Both approved warning stages are required';END IF;
  assigned=(s->>'assignee_id')::uuid;IF EXISTS(SELECT 1 FROM sys_users WHERE id=assigned AND employee_id=r.employee_id) THEN assigned=(s->>'alternate_id')::uuid;END IF;
  SELECT * INTO reviewer FROM sys_users WHERE id=assigned AND is_active;SELECT policy INTO pol FROM hr_access_policies WHERE user_id=assigned;
  IF reviewer.id IS NULL OR reviewer.employee_id=r.employee_id THEN RAISE EXCEPTION 'An independent assigned approver is required';END IF;
  IF NOT reviewer.is_owner AND NOT COALESCE(pol->'modules'->'warnings','[]') ? 'approve' THEN RAISE EXCEPTION 'Assigned approver permission is missing';END IF;
  stages=stages||jsonb_build_array(s||jsonb_build_object('assignee_id',assigned,'assignee_name',COALESCE(reviewer.full_name,reviewer.username),'action','approve'));idx=idx+1;
 END LOOP;
 yr=extract(year FROM (r.data->>'letter_date')::date)::integer;
 INSERT INTO hr_warning_counters(letter_year,last_number) VALUES(yr,1) ON CONFLICT(letter_year) DO UPDATE SET last_number=hr_warning_counters.last_number+1 RETURNING last_number INTO num;
 PERFORM set_config('hr.warning_write','on',true);
 UPDATE hr_warning_forms SET status='pending',letter_number='UYF-WARN-'||yr||'-'||lpad(num::text,5,'0'),submitted_at=now(),version=version+1,updated_at=now() WHERE id=p_id RETURNING * INTO r;
 INSERT INTO hr_approval_requests(workflow_key,resource_id,requester_id,employee_id,title,snapshot,stages) VALUES('warning',r.id,r.creator_id,r.employee_id,r.letter_number||': '||(r.employee_snapshot->>'name'),jsonb_build_object('warning_id',r.id,'employee_name',r.employee_snapshot->>'name','letter_number',r.letter_number),stages);
 INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES((stages->0->>'assignee_id')::uuid,'Warning review needed',r.letter_number,'/approvals');
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'SUBMIT','Warnings',r.id::text);RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.hr_decide_warning(p_actor uuid,p_id uuid,p_decision text,p_comment text,p_version integer,p_issue jsonb DEFAULT NULL,p_hr jsonb DEFAULT NULL) RETURNS public.hr_approval_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a hr_approval_requests;r hr_warning_forms;u sys_users;pol jsonb;s jsonb;today date=(now() AT TIME ZONE 'Asia/Bangkok')::date;target uuid;state text;informed date;delivered date;entry jsonb;
BEGIN
 SELECT * INTO u FROM sys_users WHERE id=p_actor AND is_active;IF NOT FOUND THEN RAISE EXCEPTION 'Account is disabled';END IF;
 SELECT * INTO a FROM hr_approval_requests WHERE id=p_id AND workflow_key='warning' FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Warning not found';END IF;
 IF a.status<>'pending' OR a.version<>p_version THEN RAISE EXCEPTION 'Warning changed or already completed';END IF;
 SELECT * INTO r FROM hr_warning_forms WHERE id=a.resource_id FOR UPDATE;IF NOT FOUND OR r.status<>'pending' THEN RAISE EXCEPTION 'Warning changed';END IF;
 IF u.employee_id=r.employee_id THEN RAISE EXCEPTION 'Cannot decide your own warning';END IF;
 s=a.stages->a.current_stage;IF s->>'assignee_id' IS DISTINCT FROM p_actor::text THEN RAISE EXCEPTION 'This stage is assigned to someone else';END IF;
 SELECT policy INTO pol FROM hr_access_policies WHERE user_id=p_actor;
 IF NOT u.is_owner AND NOT COALESCE(pol->'modules'->'warnings','[]') ? 'approve' THEN RAISE EXCEPTION 'Approval permission has been removed';END IF;
 IF p_decision NOT IN ('approve','reject') OR length(COALESCE(p_comment,''))>5000 THEN RAISE EXCEPTION 'Invalid decision';END IF;
 IF p_decision='reject' AND length(trim(COALESCE(p_comment,'')))=0 THEN RAISE EXCEPTION 'Return reason required';END IF;
 state=CASE WHEN p_decision='reject' THEN 'rejected' WHEN s->>'key'='hr' THEN 'approved' ELSE 'pending' END;
 IF state='approved' THEN
  informed=(p_issue->>'informed_date')::date;
  IF informed IS NULL OR informed<(r.data->>'incident_date')::date OR informed>today OR COALESCE(p_issue->>'opportunity_confirmed','false')<>'true' OR length(trim(COALESCE(p_issue->>'explanation_note','')))=0 THEN RAISE EXCEPTION 'Record the actual explanation date and employee opportunity to comment';END IF;
  IF COALESCE(p_issue->>'delivery','') NOT IN ('portal','offline') THEN RAISE EXCEPTION 'Choose portal or outside delivery';END IF;
  target=hr_warning_personal(r.employee_id);
  IF p_issue->>'delivery'='portal' AND target IS NULL THEN RAISE EXCEPTION 'Enable the employee account and personal Warnings app for portal delivery';END IF;
  IF p_issue->>'delivery'='offline' THEN
   delivered=(p_issue->>'delivered_on')::date;
   IF delivered IS NULL OR delivered<(r.data->>'letter_date')::date OR delivered>today OR length(trim(COALESCE(p_issue->>'delivery_reference','')))=0 THEN RAISE EXCEPTION 'Record actual outside delivery date and reference';END IF;
  END IF;
  IF length(trim(COALESCE(p_hr->>'file_reference','')))=0 OR COALESCE(p_hr->>'review_date','')='' THEN RAISE EXCEPTION 'Enter the HR file reference and follow-up review date';END IF;
  IF (p_hr->>'review_date')::date<(r.data->>'letter_date')::date THEN RAISE EXCEPTION 'Follow-up cannot precede the letter';END IF;
  entry=p_hr||jsonb_build_object('actor_id',p_actor,'actor_name',u.full_name,'at',now());
 END IF;
 PERFORM set_config('hr.warning_write','on',true);
 UPDATE hr_approval_requests SET status=state,current_stage=CASE WHEN state='pending' THEN current_stage+1 ELSE current_stage END,history=history||jsonb_build_array(jsonb_build_object('stage',s->>'key','label',s->>'label','actor_id',p_actor,'actor_name',u.full_name,'decision',p_decision,'comment',trim(COALESCE(p_comment,'')),'at',now())),version=version+1,updated_at=now() WHERE id=a.id RETURNING * INTO a;
 IF state='approved' THEN
  UPDATE hr_warning_forms SET status='issued',issuance=p_issue||jsonb_build_object('actor_id',p_actor,'actor_name',u.full_name,'at',now()),issued_at=now(),hr_records=hr_records||jsonb_build_array(entry),version=version+1,updated_at=now() WHERE id=r.id;
  IF target IS NOT NULL THEN INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES(target,'Warning letter available',r.letter_number||': read the letter, add comments and acknowledge receipt.','/portal/warnings');END IF;
 ELSIF state='rejected' THEN UPDATE hr_warning_forms SET status='rejected',version=version+1,updated_at=now() WHERE id=r.id;
 ELSE UPDATE hr_warning_forms SET version=version+1,updated_at=now() WHERE id=r.id;INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES((a.stages->a.current_stage->>'assignee_id')::uuid,'Warning review needed',r.letter_number,'/approvals');END IF;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,upper(p_decision),'Warnings',r.id::text||' stage '||(s->>'key'));RETURN a;
END $$;
CREATE OR REPLACE FUNCTION public.hr_respond_warning(p_actor uuid,p_id uuid,p_body jsonb,p_version integer) RETURNS public.hr_warning_forms LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_warning_forms;reviewer uuid;v text;ack boolean=COALESCE(p_body->>'acknowledged','false')='true';
BEGIN
 SELECT * INTO r FROM hr_warning_forms WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR hr_warning_personal(r.employee_id) IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Personal Warnings permission is required for your own letter';END IF;
 IF r.status<>'issued' OR r.version<>p_version THEN RAISE EXCEPTION 'Warning changed or not issued';END IF;
 v=trim(COALESCE(p_body->>'comments',''));IF length(v)>6000 OR (v='' AND NOT ack) THEN RAISE EXCEPTION 'Add comments or confirm receipt';END IF;
 IF v<>'' AND r.employee_comment IS NOT NULL THEN RAISE EXCEPTION 'Employee comments already recorded';END IF;
 IF ack AND (r.acknowledgment IS NOT NULL OR length(trim(COALESCE(p_body->>'signature','')))=0 OR length(p_body->>'signature')>250 OR COALESCE(p_body->>'explained','false')<>'true' OR COALESCE(p_body->>'opportunity','false')<>'true') THEN RAISE EXCEPTION 'Receipt already recorded or explanation, opportunity and signature missing';END IF;
 PERFORM set_config('hr.warning_write','on',true);
 UPDATE hr_warning_forms SET employee_comment=CASE WHEN v<>'' THEN jsonb_build_object('comments',v,'actor_id',p_actor,'at',now()) ELSE employee_comment END,acknowledgment=CASE WHEN ack THEN jsonb_build_object('signature',trim(p_body->>'signature'),'explained',true,'opportunity',true,'actor_id',p_actor,'at',now()) ELSE acknowledgment END,version=version+1,updated_at=now() WHERE id=p_id RETURNING * INTO r;
 SELECT (stages->1->>'assignee_id')::uuid INTO reviewer FROM hr_approval_requests WHERE workflow_key='warning' AND resource_id=p_id;
 INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES(reviewer,'Warning employee response',r.letter_number,'/warnings');
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'RESPOND','Warnings',r.id::text);RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.hr_warning_hr_record(p_actor uuid,p_id uuid,p_action text,p_body jsonb,p_version integer) RETURNS public.hr_warning_forms LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_warning_forms;u sys_users;pol jsonb;reviewer uuid;entry jsonb;received date;today date=(now() AT TIME ZONE 'Asia/Bangkok')::date;
BEGIN
 SELECT * INTO u FROM sys_users WHERE id=p_actor AND is_active;SELECT policy INTO pol FROM hr_access_policies WHERE user_id=p_actor;
 SELECT * INTO r FROM hr_warning_forms WHERE id=p_id FOR UPDATE;
 SELECT (stages->1->>'assignee_id')::uuid INTO reviewer FROM hr_approval_requests WHERE workflow_key='warning' AND resource_id=p_id;
 IF r.id IS NULL OR u.id IS NULL OR u.employee_id=r.employee_id OR (NOT u.is_owner AND (p_actor IS DISTINCT FROM reviewer OR NOT COALESCE(pol->'modules'->'warnings','[]') ? 'approve')) THEN RAISE EXCEPTION 'Assigned HR approval permission is required';END IF;
 IF r.status<>'issued' OR r.version<>p_version THEN RAISE EXCEPTION 'Warning changed or not issued';END IF;
 IF jsonb_typeof(p_body) IS DISTINCT FROM 'object' OR length(p_body::text)>15000 THEN RAISE EXCEPTION 'Invalid HR record';END IF;
 entry=p_body||jsonb_build_object('actor_id',p_actor,'actor_name',u.full_name,'at',now());
 IF p_action='follow-up' THEN
  IF length(trim(COALESCE(p_body->>'file_reference','')))=0 OR COALESCE(p_body->>'review_date','')='' OR length(trim(COALESCE(p_body->>'notes','')))=0 THEN RAISE EXCEPTION 'Record HR file reference, review date and notes';END IF;
  IF (p_body->>'review_date')::date<(r.data->>'letter_date')::date THEN RAISE EXCEPTION 'Follow-up cannot precede the letter';END IF;
 ELSIF p_action='record-receipt' THEN
  received=(p_body->>'received_date')::date;
  IF received IS NULL OR received<(r.data->>'letter_date')::date OR received>today OR COALESCE(p_body->>'status','') NOT IN ('signed','refused','unavailable') OR COALESCE(p_body->>'confirmed','false')<>'true' OR length(trim(COALESCE(p_body->>'reference','')))=0 OR (p_body->>'status'='signed' AND length(trim(COALESCE(p_body->>'signature','')))=0) THEN RAISE EXCEPTION 'Record actual receipt status, date, evidence and signed name when applicable';END IF;
  IF p_body->>'status'<>'signed' THEN entry=entry||jsonb_build_object('signature','');END IF;
 ELSE RAISE EXCEPTION 'Invalid HR action';END IF;
 PERFORM set_config('hr.warning_write','on',true);
 IF p_action='follow-up' THEN UPDATE hr_warning_forms SET hr_records=hr_records||jsonb_build_array(entry),version=version+1,updated_at=now() WHERE id=p_id RETURNING * INTO r;
 ELSE UPDATE hr_warning_forms SET external_receipts=external_receipts||jsonb_build_array(entry),version=version+1,updated_at=now() WHERE id=p_id RETURNING * INTO r;END IF;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,upper(p_action),'Warnings',r.id::text);RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.hr_warning_can(uuid,uuid,text),public.hr_warning_personal(uuid),public.hr_guard_warning(),public.hr_guard_warning_approval(),public.hr_save_warning(uuid,uuid,uuid,jsonb,integer),public.hr_submit_warning(uuid,uuid,integer),public.hr_decide_warning(uuid,uuid,text,text,integer,jsonb,jsonb),public.hr_respond_warning(uuid,uuid,jsonb,integer),public.hr_warning_hr_record(uuid,uuid,text,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_warning_can(uuid,uuid,text),public.hr_warning_personal(uuid),public.hr_save_warning(uuid,uuid,uuid,jsonb,integer),public.hr_submit_warning(uuid,uuid,integer),public.hr_decide_warning(uuid,uuid,text,text,integer,jsonb,jsonb),public.hr_respond_warning(uuid,uuid,jsonb,integer),public.hr_warning_hr_record(uuid,uuid,text,jsonb,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
