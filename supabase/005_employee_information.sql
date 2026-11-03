-- Existing UYF HR project: run once after 004. Additive and safe to rerun.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.hr_instance WHERE purpose='lm-hr-fresh') OR to_regclass('public.hr_approval_requests') IS NULL THEN RAISE EXCEPTION 'Run HR migrations 001–004 first'; END IF;
END $$;
ALTER TABLE public."Employees" ADD COLUMN IF NOT EXISTS probation_period text, ADD COLUMN IF NOT EXISTS work_location text;
CREATE TABLE IF NOT EXISTS public.hr_employee_profiles (
 employee_id uuid PRIMARY KEY REFERENCES public."Employees"(id),
 data jsonb NOT NULL DEFAULT '{}', version integer NOT NULL DEFAULT 1,
 source_id uuid, approved_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.hr_employee_information (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid NOT NULL REFERENCES public."Employees"(id),
 created_by uuid NOT NULL REFERENCES public.sys_users(id), payload jsonb NOT NULL DEFAULT '{}',
 attachments jsonb NOT NULL DEFAULT '[]', employment_snapshot jsonb NOT NULL DEFAULT '{}',
 base_contacts jsonb NOT NULL DEFAULT '{}', base_profile_version integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','rejected')),
 version integer NOT NULL DEFAULT 1, approval_id uuid REFERENCES public.hr_approval_requests(id),
 declaration_name text, declared_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS hr_information_open_idx ON public.hr_employee_information(employee_id) WHERE status IN ('draft','submitted');
CREATE INDEX IF NOT EXISTS hr_information_employee_idx ON public.hr_employee_information(employee_id,created_at DESC);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['hr_employee_profiles','hr_employee_information'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
 IF to_regclass('storage.buckets') IS NOT NULL THEN
  INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  VALUES('employee_information','employee_information',false,10485760,ARRAY['application/pdf','image/jpeg','image/png'])
  ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=10485760,allowed_mime_types=EXCLUDED.allowed_mime_types;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.hr_information_reviewer(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE((SELECT u.is_active AND (u.is_owner OR (
  COALESCE(p.policy->'modules'->'employees','[]') ? 'approve'
  AND p.policy->'sensitive'->>'salary'='true' AND p.policy->'sensitive'->>'bank'='true' AND p.policy->'sensitive'->>'identity'='true'
 )) FROM sys_users u LEFT JOIN hr_access_policies p ON p.user_id=u.id WHERE u.id=p_user),false)
$$;
CREATE OR REPLACE FUNCTION public.hr_save_information(p_actor uuid,p_id uuid,p_version integer,p_payload jsonb,p_add_file jsonb DEFAULT NULL,p_remove_file uuid DEFAULT NULL)
RETURNS public.hr_employee_information LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_employee_information; u sys_users; pol jsonb; e "Employees";
BEGIN
 SELECT * INTO u FROM sys_users WHERE id=p_actor AND is_active;
 IF NOT FOUND OR u.employee_id IS NULL THEN RAISE EXCEPTION 'An active employee account is required'; END IF;
 SELECT policy INTO pol FROM hr_access_policies WHERE user_id=p_actor;
 IF NOT u.is_owner AND pol IS NOT NULL AND NOT COALESCE(pol->'personal','[]') ? 'profile' THEN RAISE EXCEPTION 'Profile permission has been removed'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(u.employee_id::text));
 IF p_id IS NULL THEN
  IF p_version<>0 THEN RAISE EXCEPTION 'Invalid draft version'; END IF;
  IF EXISTS(SELECT 1 FROM hr_employee_information WHERE employee_id=u.employee_id AND status IN ('draft','submitted')) THEN RAISE EXCEPTION 'An open form already exists. Reload your profile.'; END IF;
  SELECT * INTO e FROM "Employees" WHERE id=u.employee_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee record is unavailable'; END IF;
  INSERT INTO hr_employee_information(employee_id,created_by,payload,base_profile_version)
  VALUES(u.employee_id,p_actor,p_payload,COALESCE((SELECT version FROM hr_employee_profiles WHERE employee_id=u.employee_id),0)) RETURNING * INTO r;
 ELSE
  SELECT * INTO r FROM hr_employee_information WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR r.employee_id<>u.employee_id OR r.created_by<>p_actor THEN RAISE EXCEPTION 'This form is outside your access'; END IF;
  IF r.status<>'draft' THEN RAISE EXCEPTION 'Submitted forms cannot be edited'; END IF;
  IF r.version<>p_version THEN RAISE EXCEPTION 'Form changed. Reload before saving.'; END IF;
  UPDATE hr_employee_information SET payload=COALESCE(p_payload,payload),version=version+1,updated_at=now() WHERE id=p_id RETURNING * INTO r;
 END IF;
 IF p_add_file IS NOT NULL THEN
  IF jsonb_array_length(r.attachments)>=16 THEN RAISE EXCEPTION 'Maximum 16 attachments per form'; END IF;
  UPDATE hr_employee_information SET attachments=attachments||jsonb_build_array(p_add_file) WHERE id=r.id RETURNING * INTO r;
 END IF;
 IF p_remove_file IS NOT NULL THEN
  UPDATE hr_employee_information SET attachments=COALESCE((SELECT jsonb_agg(f) FROM jsonb_array_elements(attachments) f WHERE f->>'id'<>p_remove_file::text),'[]') WHERE id=r.id RETURNING * INTO r;
 END IF;
 RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.hr_submit_information(p_actor uuid,p_id uuid,p_version integer,p_declaration text)
RETURNS public.hr_employee_information LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_employee_information; u sys_users; pol jsonb; setting hr_workflow_settings; s jsonb; stages jsonb='[]'; assigned uuid; approver sys_users; a hr_approval_requests; e "Employees"; employment jsonb;
BEGIN
 SELECT * INTO u FROM sys_users WHERE id=p_actor AND is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account is disabled'; END IF;
 SELECT policy INTO pol FROM hr_access_policies WHERE user_id=p_actor;
 IF NOT u.is_owner AND pol IS NOT NULL AND NOT COALESCE(pol->'personal','[]') ? 'profile' THEN RAISE EXCEPTION 'Profile permission has been removed'; END IF;
 SELECT * INTO r FROM hr_employee_information WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR r.employee_id IS DISTINCT FROM u.employee_id OR r.created_by<>p_actor THEN RAISE EXCEPTION 'This form is outside your access'; END IF;
 IF r.status<>'draft' OR r.version<>p_version THEN RAISE EXCEPTION 'Form changed or was already submitted. Reload.'; END IF;
 IF length(trim(COALESCE(p_declaration,'')))=0 OR length(p_declaration)>250 THEN RAISE EXCEPTION 'Employee declaration signature is required'; END IF;
 SELECT * INTO setting FROM hr_workflow_settings WHERE workflow_key='employee_information' FOR SHARE;
 IF NOT FOUND OR NOT setting.enabled THEN RAISE EXCEPTION 'Ask the owner to activate Employee information in Approval Setup'; END IF;
 IF jsonb_array_length(setting.stages)<>2 OR setting.stages->0->>'key'<>'hr_review' OR setting.stages->1->>'key'<>'final_approval' THEN RAISE EXCEPTION 'The HR review and final approval stages are required'; END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(setting.stages) LOOP
  assigned=(CASE WHEN s->>'assignee_id'=p_actor::text THEN s->>'alternate_id' ELSE s->>'assignee_id' END)::uuid;
  IF assigned IS NULL OR assigned=p_actor THEN RAISE EXCEPTION 'An independent approver is required. Ask the owner to set an alternate.'; END IF;
  IF NOT hr_information_reviewer(assigned) THEN RAISE EXCEPTION 'Assigned reviewers need active Employees approval, Salary, Bank and Identity permission'; END IF;
  SELECT * INTO approver FROM sys_users WHERE id=assigned;
  IF approver.employee_id IS NOT NULL AND approver.employee_id=u.employee_id THEN RAISE EXCEPTION 'An independent employee must review this form'; END IF;
  stages=stages||jsonb_build_array(s||jsonb_build_object('assignee_id',assigned,'assignee_name',COALESCE(approver.full_name,approver.username),'action','approve'));
 END LOOP;
 SELECT * INTO e FROM "Employees" WHERE id=r.employee_id AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee record is unavailable'; END IF;
 employment=jsonb_build_object('employee_number',e.employee_id,'position',COALESCE((SELECT title FROM positions WHERE id=e.position_id),''),'department',COALESCE((SELECT "Department_name" FROM "Departments" WHERE id=e."Dept_id"),''),'supervisor',COALESCE((SELECT "Full_name" FROM "Employees" WHERE id=e."Manager_id"),''),'employment_type',e.employment_type,'hire_date',e.hire_date,'employment_status',e.employment_status,'salary',e.salary,'probation_period',e.probation_period,'work_location',e.work_location);
 INSERT INTO hr_approval_requests(workflow_key,resource_id,requester_id,employee_id,title,snapshot,stages)
 VALUES('employee_information',r.id,p_actor,r.employee_id,'Employee information · '||(r.payload->>'full_name'),jsonb_build_object('information_id',r.id,'employee',r.payload->>'full_name','employee_number',e.employee_id,'declaration_name',trim(p_declaration),'declared_at',now()),stages) RETURNING * INTO a;
 UPDATE hr_employee_information SET status='submitted',version=version+1,approval_id=a.id,declaration_name=trim(p_declaration),declared_at=now(),employment_snapshot=employment,
 base_contacts=jsonb_build_object('full_name',e."Full_name",'phone',e.phone,'email',e.email,'address',e.address,'date_of_birth',e.date_of_birth,'national_id',e.national_id),updated_at=now() WHERE id=r.id RETURNING * INTO r;
 INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES((stages->0->>'assignee_id')::uuid,'Employee information review',a.title,'/approvals');
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'SUBMIT','Employee information','Form '||r.id);
 RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.hr_decide_information(p_actor uuid,p_id uuid,p_decision text,p_comment text,p_version integer)
RETURNS public.hr_approval_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a hr_approval_requests; r hr_employee_information; e "Employees"; contact jsonb; current_profile_version integer;
BEGIN
 SELECT * INTO a FROM hr_approval_requests WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR a.workflow_key<>'employee_information' THEN RAISE EXCEPTION 'Employee information request not found'; END IF;
 IF EXISTS(SELECT 1 FROM sys_users WHERE id=p_actor AND employee_id IS NOT NULL AND employee_id=a.employee_id) THEN RAISE EXCEPTION 'Cannot decide your own employee information'; END IF;
 IF NOT hr_information_reviewer(p_actor) THEN RAISE EXCEPTION 'Employees approval, Salary, Bank and Identity permission are required'; END IF;
 SELECT * INTO r FROM hr_employee_information WHERE id=a.resource_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'submitted' THEN RAISE EXCEPTION 'Form already completed or unavailable'; END IF;
 IF p_decision='approve' AND a.current_stage=1 THEN
  SELECT * INTO e FROM "Employees" WHERE id=r.employee_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee record is unavailable'; END IF;
  contact=jsonb_build_object('full_name',e."Full_name",'phone',e.phone,'email',e.email,'address',e.address,'date_of_birth',e.date_of_birth,'national_id',e.national_id);
  SELECT COALESCE(version,0) INTO current_profile_version FROM hr_employee_profiles WHERE employee_id=r.employee_id FOR UPDATE;
  IF contact IS DISTINCT FROM r.base_contacts OR COALESCE(current_profile_version,0)<>r.base_profile_version THEN RAISE EXCEPTION 'Employee profile changed after this draft was created. Reject and request a fresh form.'; END IF;
 END IF;
 a=hr_decide_approval(p_actor,p_id,p_decision,p_comment,p_version,NULL);
 IF a.status='approved' THEN
  INSERT INTO hr_employee_profiles(employee_id,data,source_id) VALUES(r.employee_id,r.payload,r.id)
  ON CONFLICT(employee_id) DO UPDATE SET data=EXCLUDED.data,source_id=EXCLUDED.source_id,version=hr_employee_profiles.version+1,approved_at=now();
  UPDATE "Employees" SET "Full_name"=r.payload->>'full_name',phone=NULLIF(r.payload->>'phone',''),email=NULLIF(r.payload->>'email',''),address=NULLIF(r.payload->>'address',''),date_of_birth=NULLIF(r.payload->>'date_of_birth','')::date,national_id=NULLIF(r.payload->>'national_id',''),updated_at=now() WHERE id=r.employee_id;
  UPDATE sys_users SET full_name=r.payload->>'full_name' WHERE employee_id=r.employee_id;
  UPDATE hr_employee_information SET status='approved',version=version+1,updated_at=now() WHERE id=r.id;
 ELSIF a.status='rejected' THEN
  UPDATE hr_employee_information SET status='rejected',version=version+1,updated_at=now() WHERE id=r.id;
 END IF;
 RETURN a;
END $$;
CREATE OR REPLACE FUNCTION public.hr_update_information_employment(p_actor uuid,p_employee uuid,p_period text,p_location text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u sys_users; pol jsonb;
BEGIN
 SELECT * INTO u FROM sys_users WHERE id=p_actor AND is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account is disabled'; END IF;
 SELECT policy INTO pol FROM hr_access_policies WHERE user_id=p_actor;
 IF NOT u.is_owner AND NOT COALESCE((pol->'modules'->'employees') ? 'edit' AND (
  pol->>'scope'='all' OR (pol->>'scope'='own' AND u.employee_id=p_employee) OR (pol->>'scope'='selected' AND (pol->'employee_ids') ? p_employee::text)
 ),false) THEN RAISE EXCEPTION 'Employee editing permission is required'; END IF;
 IF length(COALESCE(p_period,''))>250 OR length(COALESCE(p_location,''))>250 THEN RAISE EXCEPTION 'Employment details are too long'; END IF;
 UPDATE "Employees" SET probation_period=trim(p_period),work_location=trim(p_location),updated_at=now() WHERE id=p_employee AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'UPDATE','Employee information','Employment details updated for employee '||p_employee);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.hr_update_information_employment(uuid,uuid,text,text),public.hr_information_reviewer(uuid),public.hr_save_information(uuid,uuid,integer,jsonb,jsonb,uuid),public.hr_submit_information(uuid,uuid,integer,text),public.hr_decide_information(uuid,uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_update_information_employment(uuid,uuid,text,text),public.hr_information_reviewer(uuid),public.hr_save_information(uuid,uuid,integer,jsonb,jsonb,uuid),public.hr_submit_information(uuid,uuid,integer,text),public.hr_decide_information(uuid,uuid,text,text,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
