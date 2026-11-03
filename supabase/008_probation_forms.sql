-- Additive upgrade in the EXISTING HR project after 007.
BEGIN;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.hr_instance WHERE purpose='lm-hr-fresh') OR to_regprocedure('public.hr_decide_expense_form(uuid,uuid,text,text,integer,numeric,text,jsonb)') IS NULL THEN RAISE EXCEPTION 'Existing HR instance with migration 007 required';END IF;END $$;
CREATE TABLE IF NOT EXISTS public.hr_probation_forms(
 id uuid PRIMARY KEY,employee_id uuid NOT NULL REFERENCES public."Employees"(id),creator_id uuid NOT NULL REFERENCES public.sys_users(id),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','decided','rejected')),data jsonb NOT NULL,employee_snapshot jsonb NOT NULL,anchor jsonb NOT NULL,
 self_invited_at timestamptz,self_due_date date,self_response jsonb,self_responded_at timestamptz,submitted_at timestamptz,
 final_decision jsonb,legal_review jsonb,salary_adjustment jsonb,decision_at timestamptz,shared_at timestamptz,share_due date,appeal_due date,
 acknowledged_at timestamptz,appeal jsonb,appeal_response jsonb,version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS probation_open_employee_idx ON public.hr_probation_forms(employee_id) WHERE status IN ('draft','pending');
ALTER TABLE public.hr_probation_forms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_probation_forms FROM anon,authenticated;
GRANT ALL ON public.hr_probation_forms TO service_role;
CREATE OR REPLACE FUNCTION public.hr_probation_can(p_actor uuid,p_employee uuid,p_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE((SELECT u.is_active AND (u.is_owner OR ((p.policy->'modules'->'probation') ? p_action AND (p.policy->>'scope'='all' OR (p.policy->>'scope'='own' AND u.employee_id=p_employee) OR (p.policy->>'scope'='selected' AND (p.policy->'employee_ids') ? p_employee::text)))) FROM sys_users u LEFT JOIN hr_access_policies p ON p.user_id=u.id WHERE u.id=p_actor),false)
$$;
CREATE OR REPLACE FUNCTION public.hr_probation_personal(p_employee uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT u.id FROM sys_users u LEFT JOIN hr_access_policies p ON p.user_id=u.id WHERE u.employee_id=p_employee AND u.is_active AND (u.is_owner OR p.user_id IS NULL OR COALESCE(p.policy->'personal','[]') ? 'probation')
$$;
CREATE OR REPLACE FUNCTION public.hr_probation_workdays(p_employee uuid,p_start date,p_n integer) RETURNS date LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE d date=p_start;n integer=0;i integer=0;
BEGIN WHILE n<p_n LOOP d=d+1;i=i+1;IF i>366 THEN RAISE EXCEPTION 'Configure a working calendar for this employee';END IF;IF (hr_leave_workday(p_employee,d)->>'working')::boolean THEN n=n+1;END IF;END LOOP;RETURN d;END $$;
CREATE OR REPLACE FUNCTION public.hr_guard_probation() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN IF current_setting('hr.probation_write',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Use the assigned probation form workflow; records must be retained';END IF;IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END $$;
DROP TRIGGER IF EXISTS guard_probation ON public.hr_probation_forms;
CREATE TRIGGER guard_probation BEFORE INSERT OR UPDATE OR DELETE ON public.hr_probation_forms FOR EACH ROW EXECUTE FUNCTION public.hr_guard_probation();
CREATE OR REPLACE FUNCTION public.hr_guard_probation_approval() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE ref uuid;prior uuid;relevant boolean;
BEGIN
 IF TG_OP='DELETE' THEN ref=OLD.resource_id;ELSIF TG_OP='INSERT' THEN ref=NEW.resource_id;ELSE ref=NEW.resource_id;prior=OLD.resource_id;END IF;
 relevant=CASE WHEN TG_OP='INSERT' THEN NEW.workflow_key='probation' WHEN TG_OP='DELETE' THEN OLD.workflow_key='probation' ELSE NEW.workflow_key='probation' OR OLD.workflow_key='probation' END;
 IF relevant AND EXISTS(SELECT 1 FROM hr_probation_forms WHERE id=ref OR id=prior) AND current_setting('hr.probation_write',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Use the complete probation approval workflow';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_probation_approval ON public.hr_approval_requests;
CREATE TRIGGER guard_probation_approval BEFORE INSERT OR UPDATE OR DELETE ON public.hr_approval_requests FOR EACH ROW EXECUTE FUNCTION public.hr_guard_probation_approval();
CREATE OR REPLACE FUNCTION public.hr_save_probation(p_actor uuid,p_id uuid,p_employee uuid,p_data jsonb,p_version integer) RETURNS public.hr_probation_forms LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_probation_forms;previous hr_probation_forms;u sys_users;e "Employees";a jsonb;finish date;cap date;kind text;
BEGIN
 SELECT * INTO u FROM sys_users WHERE id=p_actor AND is_active;IF NOT FOUND OR u.employee_id=p_employee THEN RAISE EXCEPTION 'An independent evaluator is required';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('probation:'||p_employee::text));
 SELECT * INTO r FROM hr_probation_forms WHERE id=p_id FOR UPDATE;
 IF r.id IS NULL THEN IF NOT hr_probation_can(p_actor,p_employee,'create') OR p_version<>0 THEN RAISE EXCEPTION 'Scoped Probation create permission is required';END IF;
 ELSE IF r.employee_id<>p_employee OR r.status<>'draft' THEN RAISE EXCEPTION 'Submitted evaluation cannot be edited';END IF;IF NOT hr_probation_can(p_actor,p_employee,'edit') THEN RAISE EXCEPTION 'Scoped Probation edit permission is required';END IF;IF r.version<>p_version THEN RAISE EXCEPTION 'Evaluation changed. Reload before saving';END IF;END IF;
 SELECT * INTO e FROM "Employees" WHERE id=p_employee AND deleted_at IS NULL;
 IF NOT FOUND OR e.hire_date IS NULL THEN RAISE EXCEPTION 'Set the employee hire date before evaluating probation';END IF;
 SELECT * INTO previous FROM hr_probation_forms WHERE employee_id=p_employee AND status='decided' AND anchor->>'hire_date'=e.hire_date::text ORDER BY decision_at DESC,id DESC LIMIT 1;
 IF previous.id IS NOT NULL AND previous.final_decision->>'outcome'<>'extended' THEN RAISE EXCEPTION 'This employment period already has a final probation outcome';END IF;
 kind=p_data->>'period';IF kind NOT IN ('3','6','other') THEN RAISE EXCEPTION 'Choose the original probation period';END IF;
 IF previous.id IS NOT NULL THEN
  a=previous.anchor||jsonb_build_object('current_end',previous.final_decision->>'new_end');
  IF kind IS DISTINCT FROM a->>'period' THEN RAISE EXCEPTION 'Further reviews must retain the original probation period';END IF;
 ELSIF r.self_invited_at IS NOT NULL THEN a=r.anchor;IF kind IS DISTINCT FROM a->>'period' OR (kind='other' AND p_data->>'original_end' IS DISTINCT FROM a->>'original_end') THEN RAISE EXCEPTION 'The invited probation period is frozen';END IF;
 ELSE
  IF kind='other' THEN finish=(p_data->>'original_end')::date;IF finish IS NULL OR finish<e.hire_date OR finish-e.hire_date>1095 THEN RAISE EXCEPTION 'Enter a valid custom probation end date';END IF;cap=finish+floor((finish-e.hire_date+1)/2.0)::integer;
  ELSE finish=(e.hire_date+make_interval(months=>kind::integer)-interval '1 day')::date;cap=(finish+make_interval(months=>kind::integer)*0.5)::date;END IF;
  a=jsonb_build_object('hire_date',e.hire_date,'period',kind,'original_end',finish,'current_end',finish,'max_extension_end',cap);
 END IF;
 PERFORM set_config('hr.probation_write','on',true);
 IF r.id IS NULL THEN
  INSERT INTO hr_probation_forms(id,employee_id,creator_id,data,anchor,employee_snapshot) VALUES(p_id,p_employee,p_actor,p_data,a,jsonb_build_object('name',e."Full_name",'employee_number',e.employee_id,'department',(SELECT "Department_name" FROM "Departments" WHERE id=e."Dept_id"),'position',(SELECT title FROM positions WHERE id=e.position_id),'hire_date',e.hire_date,'manager',(SELECT "Full_name" FROM "Employees" WHERE id=e."Manager_id"))) RETURNING * INTO r;
 ELSE UPDATE hr_probation_forms SET data=p_data,anchor=a,version=version+1,updated_at=now() WHERE id=p_id RETURNING * INTO r;END IF;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'SAVE','Probation',r.id::text||' version '||r.version);
 RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.hr_invite_probation(p_actor uuid,p_id uuid,p_due date,p_version integer) RETURNS public.hr_probation_forms LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_probation_forms;target uuid;BEGIN
 SELECT * INTO r FROM hr_probation_forms WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT hr_probation_can(p_actor,r.employee_id,'edit') OR EXISTS(SELECT 1 FROM sys_users WHERE id=p_actor AND employee_id=r.employee_id) THEN RAISE EXCEPTION 'Independent scoped Probation edit permission is required';END IF;
 IF r.status<>'draft' OR r.self_invited_at IS NOT NULL OR r.version<>p_version THEN RAISE EXCEPTION 'Evaluation changed or invitation already sent';END IF;
 IF p_due IS NULL OR p_due<=(now() AT TIME ZONE 'Asia/Bangkok')::date THEN RAISE EXCEPTION 'Give the employee a future response deadline';END IF;
 target=hr_probation_personal(r.employee_id);IF target IS NULL THEN RAISE EXCEPTION 'Enable the employee account and personal Probation app before inviting';END IF;
 PERFORM set_config('hr.probation_write','on',true);
 UPDATE hr_probation_forms SET self_invited_at=now(),self_due_date=p_due,version=version+1,updated_at=now() WHERE id=p_id RETURNING * INTO r;
 INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES(target,'Probation self-assessment','Please add your comments by '||p_due,'/portal/probation');
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'INVITE','Probation',r.id::text);RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.hr_respond_probation(p_actor uuid,p_id uuid,p_response jsonb,p_version integer) RETURNS public.hr_probation_forms LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_probation_forms;BEGIN
 SELECT * INTO r FROM hr_probation_forms WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR hr_probation_personal(r.employee_id) IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Personal Probation permission is required for your own evaluation';END IF;
 IF r.status NOT IN ('draft','pending') OR r.self_invited_at IS NULL OR r.self_response IS NOT NULL OR r.version<>p_version THEN RAISE EXCEPTION 'Evaluation changed or response already recorded';END IF;
 IF COALESCE(p_response->>'status','') NOT IN ('submitted','declined') OR length(trim(COALESCE(p_response->>'signature','')))=0 THEN RAISE EXCEPTION 'Sign your self-assessment response';END IF;
 PERFORM set_config('hr.probation_write','on',true);
 IF p_response->>'status'='declined' THEN p_response=p_response||jsonb_build_object('performance','','challenges','','support','');END IF;
 UPDATE hr_probation_forms SET self_response=p_response||jsonb_build_object('actor_id',p_actor,'at',now()),self_responded_at=now(),version=version+1,updated_at=now() WHERE id=p_id RETURNING * INTO r;
 INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES(r.creator_id,'Probation response received',r.employee_snapshot->>'name','/performance/probation');
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'RESPOND','Probation',r.id::text);RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.hr_submit_probation(p_actor uuid,p_id uuid,p_version integer) RETURNS public.hr_probation_forms LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_probation_forms;cfg hr_workflow_settings;s jsonb;stages jsonb='[]';reviewer sys_users;pol jsonb;assigned uuid;idx integer=0;field text;n numeric;today date=(now() AT TIME ZONE 'Asia/Bangkok')::date;
BEGIN
 SELECT * INTO r FROM hr_probation_forms WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT hr_probation_can(p_actor,r.employee_id,'edit') OR EXISTS(SELECT 1 FROM sys_users WHERE id=p_actor AND employee_id=r.employee_id) THEN RAISE EXCEPTION 'Independent scoped Probation edit permission is required';END IF;
 IF r.status<>'draft' OR r.version<>p_version THEN RAISE EXCEPTION 'Evaluation changed or already submitted';END IF;
 IF r.self_invited_at IS NULL THEN RAISE EXCEPTION 'Invite the employee to provide self-assessment before submission';END IF;
 FOREACH field IN ARRAY ARRAY['strengths','improvements','summary','growth','recommendation'] LOOP IF length(trim(COALESCE(r.data->>field,'')))=0 THEN RAISE EXCEPTION 'Complete the evaluation and recommendation';END IF;END LOOP;
 FOREACH field IN ARRAY ARRAY['attendance_rating','performance_rating','cultural_fit'] LOOP IF COALESCE(r.data->>field,'') !~ '^[1-5]$' THEN RAISE EXCEPTION 'Complete all ratings';END IF;END LOOP;
 FOREACH field IN ARRAY ARRAY['knowledge','quality','productivity','communication','teamwork','initiative','adaptability','time','stakeholders','conduct'] LOOP IF COALESCE(r.data->'competencies'->field->>'rating','') !~ '^[1-5]$' THEN RAISE EXCEPTION 'Rate all ten competencies';END IF;END LOOP;
 FOREACH field IN ARRAY ARRAY['working','present','absent','late','early','unexcused'] LOOP IF COALESCE(r.data->'attendance'->>field,'') !~ '^\d+(\.5|\.0)?$' THEN RAISE EXCEPTION 'Complete attendance counts';END IF;END LOOP;
 IF (r.data->'attendance'->>'present')::numeric+(r.data->'attendance'->>'absent')::numeric>(r.data->'attendance'->>'working')::numeric OR (r.data->'attendance'->>'unexcused')::numeric>(r.data->'attendance'->>'absent')::numeric THEN RAISE EXCEPTION 'Attendance totals do not reconcile';END IF;
 IF r.data->>'recommendation' NOT IN ('confirmed','extended','terminated') THEN RAISE EXCEPTION 'Choose the recommendation';END IF;
 IF r.data->>'recommendation'<>'confirmed' AND length(trim(COALESCE(r.data->>'reason','')))=0 THEN RAISE EXCEPTION 'Extension or termination reason required';END IF;
 IF r.data->>'recommendation'='extended' AND (COALESCE(r.data->>'new_end','')='' OR (r.data->>'new_end')::date<=(r.anchor->>'current_end')::date OR (r.data->>'new_end')::date>(r.anchor->>'max_extension_end')::date OR length(trim(COALESCE(r.data->>'new_goals','')))=0) THEN RAISE EXCEPTION 'Extension must stay within half the original period and include new goals';END IF;
 IF today>(r.anchor->>'current_end')::date-14 AND length(trim(COALESCE(r.data->>'late_reason','')))=0 THEN RAISE EXCEPTION 'Explain the missed two-week evaluation deadline';END IF;
 SELECT * INTO cfg FROM hr_workflow_settings WHERE workflow_key='probation' FOR SHARE;
 IF NOT FOUND OR NOT cfg.enabled OR jsonb_array_length(cfg.stages)<>3 THEN RAISE EXCEPTION 'Activate the Manager, Department Head and HR workflow first';END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(cfg.stages) LOOP
  IF s->>'key' IS DISTINCT FROM (ARRAY['manager','department_head','hr'])[idx+1] THEN RAISE EXCEPTION 'All approved probation stages are required';END IF;
  assigned=(s->>'assignee_id')::uuid;
  IF EXISTS(SELECT 1 FROM sys_users WHERE id=assigned AND employee_id=r.employee_id) THEN assigned=(s->>'alternate_id')::uuid;END IF;
  SELECT * INTO reviewer FROM sys_users WHERE id=assigned AND is_active;SELECT policy INTO pol FROM hr_access_policies WHERE user_id=assigned;
  IF reviewer.id IS NULL OR reviewer.employee_id=r.employee_id THEN RAISE EXCEPTION 'An independent assigned approver is required';END IF;
  IF NOT reviewer.is_owner AND NOT COALESCE(pol->'modules'->'probation','[]') ? 'approve' THEN RAISE EXCEPTION 'Assigned approver permission is missing';END IF;
  stages=stages||jsonb_build_array(s||jsonb_build_object('assignee_id',assigned,'assignee_name',COALESCE(reviewer.full_name,reviewer.username),'action','approve'));idx=idx+1;
 END LOOP;
 PERFORM set_config('hr.probation_write','on',true);
 UPDATE hr_probation_forms SET status='pending',submitted_at=now(),version=version+1,updated_at=now() WHERE id=p_id RETURNING * INTO r;
 INSERT INTO hr_approval_requests(workflow_key,resource_id,requester_id,employee_id,title,snapshot,stages) VALUES('probation',r.id,r.creator_id,r.employee_id,'Probation: '||(r.employee_snapshot->>'name'),jsonb_build_object('probation_id',r.id,'employee_name',r.employee_snapshot->>'name'),stages);
 INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES((stages->0->>'assignee_id')::uuid,'Probation review needed',r.employee_snapshot->>'name','/approvals');
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'SUBMIT','Probation',r.id::text);RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.hr_decide_probation(p_actor uuid,p_id uuid,p_decision text,p_comment text,p_version integer,p_final jsonb DEFAULT NULL,p_legal jsonb DEFAULT NULL,p_salary jsonb DEFAULT NULL) RETURNS public.hr_approval_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a hr_approval_requests;r hr_probation_forms;u sys_users;pol jsonb;s jsonb;outcome text;today date=(now() AT TIME ZONE 'Asia/Bangkok')::date;effective date;target uuid;state text;final jsonb;
BEGIN
 SELECT * INTO u FROM sys_users WHERE id=p_actor AND is_active;IF NOT FOUND THEN RAISE EXCEPTION 'Account is disabled';END IF;
 SELECT * INTO a FROM hr_approval_requests WHERE id=p_id AND workflow_key='probation' FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Evaluation not found';END IF;
 IF a.status<>'pending' OR a.version<>p_version THEN RAISE EXCEPTION 'Evaluation changed or already completed';END IF;
 SELECT * INTO r FROM hr_probation_forms WHERE id=a.resource_id FOR UPDATE;IF NOT FOUND OR r.status<>'pending' THEN RAISE EXCEPTION 'Evaluation changed';END IF;
 IF u.employee_id=r.employee_id THEN RAISE EXCEPTION 'Cannot decide your own evaluation';END IF;
 s=a.stages->a.current_stage;IF s->>'assignee_id' IS DISTINCT FROM p_actor::text THEN RAISE EXCEPTION 'This stage is assigned to someone else';END IF;
 SELECT policy INTO pol FROM hr_access_policies WHERE user_id=p_actor;
 IF NOT u.is_owner AND NOT COALESCE(pol->'modules'->'probation','[]') ? 'approve' THEN RAISE EXCEPTION 'Approval permission has been removed';END IF;
 IF p_decision NOT IN ('approve','reject') OR length(COALESCE(p_comment,''))>5000 THEN RAISE EXCEPTION 'Invalid decision';END IF;
 IF p_decision='reject' AND length(trim(COALESCE(p_comment,'')))=0 THEN RAISE EXCEPTION 'Rejection reason required';END IF;
 state=CASE WHEN p_decision='reject' THEN 'rejected' WHEN s->>'key'='hr' THEN 'approved' ELSE 'pending' END;
 IF state='approved' THEN
  target=hr_probation_personal(r.employee_id);IF target IS NULL THEN RAISE EXCEPTION 'Enable personal Probation access so the final copy can be shared';END IF;
  IF r.self_response IS NULL AND (today<=r.self_due_date OR COALESCE(p_final->>'opportunity_confirmed','false')<>'true' OR length(trim(COALESCE(p_final->>'no_response_note','')))=0) THEN RAISE EXCEPTION 'Allow the employee to respond before the final decision; after the deadline document the opportunity and no response';END IF;
  outcome=p_final->>'outcome';IF outcome IS NULL OR outcome NOT IN ('confirmed','extended','terminated') THEN RAISE EXCEPTION 'Choose the HR final outcome';END IF;
  effective=(p_final->>'effective_date')::date;IF effective IS NULL THEN RAISE EXCEPTION 'Enter the confirmation or extension effective date';END IF;
  IF outcome<>'confirmed' AND length(trim(COALESCE(p_final->>'reason','')))=0 THEN RAISE EXCEPTION 'Explain the final extension or termination';END IF;
  IF outcome='extended' AND (COALESCE(p_final->>'new_end','')='' OR (p_final->>'new_end')::date<=(r.anchor->>'current_end')::date OR (p_final->>'new_end')::date>(r.anchor->>'max_extension_end')::date OR length(trim(COALESCE(p_final->>'new_goals','')))=0) THEN RAISE EXCEPTION 'Final extension must respect the original cap and include new goals';END IF;
  IF outcome='confirmed' AND (p_final->>'benefits_date')::date IS DISTINCT FROM effective THEN RAISE EXCEPTION 'Full benefits must start on the confirmation date';END IF;
  IF today>(r.anchor->>'current_end')::date-14 AND length(trim(COALESCE(p_final->>'late_reason','')))=0 THEN RAISE EXCEPTION 'Document the late final evaluation';END IF;
  IF outcome='terminated' AND (COALESCE(p_legal->>'confirmed','false')<>'true' OR length(trim(COALESCE(p_legal->>'reviewer','')))=0 OR length(trim(COALESCE(p_legal->>'reference','')))=0 OR COALESCE(p_legal->>'date','')='' OR (p_legal->>'date')::date>today) THEN RAISE EXCEPTION 'Record completed HR and legal review before communicating termination';END IF;
  IF COALESCE(p_salary->>'kind','no_change') NOT IN ('no_change','adjusted') THEN RAISE EXCEPTION 'Invalid salary adjustment';END IF;
  IF p_salary->>'kind'='adjusted' THEN
   IF NOT u.is_owner AND COALESCE(pol->'sensitive'->>'salary','false')<>'true' THEN RAISE EXCEPTION 'Salary field permission is required';END IF;
   IF COALESCE(p_salary->>'amount','') !~ '^\d{1,12}(\.\d{1,2})?$' OR (p_salary->>'amount')::numeric<=0 OR COALESCE(p_salary->>'currency','') !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Enter the authorized salary amount and currency';END IF;
  END IF;
  IF COALESCE(p_final->>'employment_status_updated','false')='true' AND length(trim(COALESCE(p_final->>'employment_update_reference','')))=0 THEN RAISE EXCEPTION 'Record where the employment status was updated';END IF;
  final=p_final||jsonb_build_object('reviewer_id',p_actor,'reviewer_name',u.full_name,'at',now(),'new_end',CASE WHEN outcome='extended' THEN p_final->>'new_end' ELSE '' END,'conditions',CASE WHEN outcome='extended' THEN p_final->>'conditions' ELSE '' END,'new_goals',CASE WHEN outcome='extended' THEN p_final->>'new_goals' ELSE '' END,'benefits_date',CASE WHEN outcome='confirmed' THEN p_final->>'benefits_date' ELSE '' END,'reason',CASE WHEN outcome='confirmed' THEN '' ELSE p_final->>'reason' END);
 END IF;
 PERFORM set_config('hr.probation_write','on',true);
 UPDATE hr_approval_requests SET status=state,current_stage=CASE WHEN state='pending' THEN current_stage+1 ELSE current_stage END,history=history||jsonb_build_array(jsonb_build_object('stage',s->>'key','label',s->>'label','actor_id',p_actor,'actor_name',u.full_name,'decision',p_decision,'comment',trim(COALESCE(p_comment,'')),'at',now())),version=version+1,updated_at=now() WHERE id=a.id RETURNING * INTO a;
 IF state='approved' THEN
  UPDATE hr_probation_forms SET status='decided',final_decision=final,legal_review=CASE WHEN outcome='terminated' THEN p_legal ELSE NULL END,salary_adjustment=COALESCE(p_salary,'{"kind":"no_change"}'),decision_at=now(),shared_at=now(),share_due=hr_probation_workdays(employee_id,today,5),appeal_due=hr_probation_workdays(employee_id,today,10),version=version+1,updated_at=now() WHERE id=r.id;
  INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES(target,'Probation decision available','Your finalized evaluation and PDF copy are available. You may acknowledge receipt or send a written appeal.','/portal/probation');
 ELSIF state='rejected' THEN UPDATE hr_probation_forms SET status='rejected',version=version+1,updated_at=now() WHERE id=r.id;
 ELSE UPDATE hr_probation_forms SET version=version+1,updated_at=now() WHERE id=r.id;INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES((a.stages->a.current_stage->>'assignee_id')::uuid,'Probation review needed',r.employee_snapshot->>'name','/approvals');END IF;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,upper(p_decision),'Probation',r.id::text||' stage '||(s->>'key'));RETURN a;
END $$;
CREATE OR REPLACE FUNCTION public.hr_probation_employee_action(p_actor uuid,p_id uuid,p_action text,p_body jsonb,p_version integer) RETURNS public.hr_probation_forms LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_probation_forms;reviewer uuid;
BEGIN
 SELECT * INTO r FROM hr_probation_forms WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR hr_probation_personal(r.employee_id) IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Personal Probation permission is required for your own evaluation';END IF;
 IF r.status<>'decided' OR r.version<>p_version THEN RAISE EXCEPTION 'Evaluation changed or not finalized';END IF;
 PERFORM set_config('hr.probation_write','on',true);
 IF p_action='acknowledge' THEN
  IF COALESCE(p_body->>'confirmed','false')<>'true' THEN RAISE EXCEPTION 'Confirm receipt of the evaluation';END IF;
  IF r.acknowledged_at IS NOT NULL THEN RETURN r;END IF;
  UPDATE hr_probation_forms SET acknowledged_at=now(),version=version+1,updated_at=now() WHERE id=p_id RETURNING * INTO r;
 ELSIF p_action='appeal' THEN
  IF r.appeal IS NOT NULL THEN RAISE EXCEPTION 'Appeal already recorded';END IF;
  IF (now() AT TIME ZONE 'Asia/Bangkok')::date>r.appeal_due THEN RAISE EXCEPTION 'The ten-working-day appeal deadline has passed';END IF;
  IF length(trim(COALESCE(p_body->>'statement','')))=0 OR length(p_body->>'statement')>8000 OR length(trim(COALESCE(p_body->>'signature','')))=0 THEN RAISE EXCEPTION 'Write and sign the appeal';END IF;
  UPDATE hr_probation_forms SET appeal=p_body||jsonb_build_object('actor_id',p_actor,'at',now()),version=version+1,updated_at=now() WHERE id=p_id RETURNING * INTO r;
  SELECT (stages->2->>'assignee_id')::uuid INTO reviewer FROM hr_approval_requests WHERE workflow_key='probation' AND resource_id=r.id;
  INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES(reviewer,'Probation appeal received',r.employee_snapshot->>'name','/performance/probation');
 ELSE RAISE EXCEPTION 'Invalid employee action';END IF;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,upper(p_action),'Probation',r.id::text);RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.hr_record_probation_appeal(p_actor uuid,p_id uuid,p_body jsonb,p_version integer) RETURNS public.hr_probation_forms LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_probation_forms;u sys_users;pol jsonb;reviewer uuid;received date;
BEGIN
 SELECT * INTO u FROM sys_users WHERE id=p_actor AND is_active;SELECT policy INTO pol FROM hr_access_policies WHERE user_id=p_actor;
 SELECT * INTO r FROM hr_probation_forms WHERE id=p_id FOR UPDATE;
 SELECT (stages->2->>'assignee_id')::uuid INTO reviewer FROM hr_approval_requests WHERE workflow_key='probation' AND resource_id=p_id;
 IF r.id IS NULL OR u.id IS NULL OR u.employee_id=r.employee_id OR (NOT u.is_owner AND (p_actor IS DISTINCT FROM reviewer OR NOT COALESCE(pol->'modules'->'probation','[]') ? 'approve')) THEN RAISE EXCEPTION 'Assigned HR approval permission is required';END IF;
 IF r.status<>'decided' OR r.appeal IS NOT NULL OR r.version<>p_version THEN RAISE EXCEPTION 'Appeal changed or already recorded';END IF;
 received=(p_body->>'received_date')::date;
 IF received IS NULL OR received<(r.decision_at AT TIME ZONE 'Asia/Bangkok')::date OR received>r.appeal_due OR received>(now() AT TIME ZONE 'Asia/Bangkok')::date THEN RAISE EXCEPTION 'Written appeal must have been received within the ten-working-day window';END IF;
 IF COALESCE(p_body->>'confirmed','false')<>'true' OR length(trim(COALESCE(p_body->>'statement','')))=0 OR length(p_body->>'statement')>8000 OR length(trim(COALESCE(p_body->>'signature','')))=0 OR length(trim(COALESCE(p_body->>'reference','')))=0 THEN RAISE EXCEPTION 'Record the received written appeal, signed name and evidence reference';END IF;
 PERFORM set_config('hr.probation_write','on',true);
 UPDATE hr_probation_forms SET appeal=p_body||jsonb_build_object('recorded_by',p_actor,'recorded_by_name',u.full_name,'at',now()),version=version+1,updated_at=now() WHERE id=p_id RETURNING * INTO r;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'RECORD_WRITTEN_APPEAL','Probation',r.id::text);RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.hr_record_probation_appeal(uuid,uuid,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_record_probation_appeal(uuid,uuid,jsonb,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.hr_reply_probation_appeal(p_actor uuid,p_id uuid,p_response text,p_version integer) RETURNS public.hr_probation_forms LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_probation_forms;u sys_users;pol jsonb;reviewer uuid;
BEGIN
 SELECT * INTO u FROM sys_users WHERE id=p_actor AND is_active;SELECT policy INTO pol FROM hr_access_policies WHERE user_id=p_actor;
 SELECT * INTO r FROM hr_probation_forms WHERE id=p_id FOR UPDATE;
 SELECT (stages->2->>'assignee_id')::uuid INTO reviewer FROM hr_approval_requests WHERE workflow_key='probation' AND resource_id=p_id;
 IF r.id IS NULL OR u.id IS NULL OR u.employee_id=r.employee_id OR (NOT u.is_owner AND (p_actor IS DISTINCT FROM reviewer OR NOT COALESCE(pol->'modules'->'probation','[]') ? 'approve')) THEN RAISE EXCEPTION 'Assigned HR approval permission is required';END IF;
 IF r.appeal IS NULL OR r.appeal_response IS NOT NULL OR r.version<>p_version THEN RAISE EXCEPTION 'Appeal changed or response already recorded';END IF;
 IF length(trim(COALESCE(p_response,'')))=0 OR length(p_response)>8000 THEN RAISE EXCEPTION 'Write the HR appeal response';END IF;
 PERFORM set_config('hr.probation_write','on',true);
 UPDATE hr_probation_forms SET appeal_response=jsonb_build_object('statement',trim(p_response),'actor_id',p_actor,'actor_name',u.full_name,'at',now()),version=version+1,updated_at=now() WHERE id=p_id RETURNING * INTO r;
 INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES(hr_probation_personal(r.employee_id),'Probation appeal response','HR has responded to your appeal.','/portal/probation');
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'APPEAL_RESPONSE','Probation',r.id::text);RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.hr_probation_can(uuid,uuid,text),public.hr_probation_personal(uuid),public.hr_probation_workdays(uuid,date,integer),public.hr_guard_probation(),public.hr_guard_probation_approval(),public.hr_save_probation(uuid,uuid,uuid,jsonb,integer),public.hr_invite_probation(uuid,uuid,date,integer),public.hr_respond_probation(uuid,uuid,jsonb,integer),public.hr_submit_probation(uuid,uuid,integer),public.hr_decide_probation(uuid,uuid,text,text,integer,jsonb,jsonb,jsonb),public.hr_probation_employee_action(uuid,uuid,text,jsonb,integer),public.hr_reply_probation_appeal(uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_probation_can(uuid,uuid,text),public.hr_probation_personal(uuid),public.hr_probation_workdays(uuid,date,integer),public.hr_save_probation(uuid,uuid,uuid,jsonb,integer),public.hr_invite_probation(uuid,uuid,date,integer),public.hr_respond_probation(uuid,uuid,jsonb,integer),public.hr_submit_probation(uuid,uuid,integer),public.hr_decide_probation(uuid,uuid,text,text,integer,jsonb,jsonb,jsonb),public.hr_probation_employee_action(uuid,uuid,text,jsonb,integer),public.hr_reply_probation_appeal(uuid,uuid,text,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
