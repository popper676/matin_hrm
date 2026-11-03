-- Existing UYF HR project, after 005. Preserves earlier leave requests and balances.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.hr_employee_information') IS NULL THEN RAISE EXCEPTION 'Install HR migrations through 005 first'; END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Leave_type' AND column_name='kind') THEN
ALTER TABLE public."Leave_type" ADD COLUMN kind text NOT NULL DEFAULT 'other';
-- Classify existing catalogs once, without inventing entitlements or renaming types.
UPDATE public."Leave_type" SET kind=CASE
 WHEN lower(type_name) IN ('sick','sick leave','medical','medical leave') THEN 'sick'
 WHEN lower(type_name) IN ('bereavement','bereavement leave','compassionate leave') THEN 'bereavement'
 WHEN lower(type_name) IN ('annual','annual leave') THEN 'annual'
 WHEN lower(type_name) IN ('personal','personal leave','casual','casual leave') THEN 'personal'
 WHEN lower(type_name) IN ('unpaid','unpaid leave','unpaid/special leave') THEN 'unpaid'
 ELSE kind END WHERE kind='other';
 END IF;
END $$;
ALTER TABLE public."Leave_balances" ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public."Leave_Request"
 ADD COLUMN IF NOT EXISTS form_version integer NOT NULL DEFAULT 1,
 ADD COLUMN IF NOT EXISTS requester_id uuid,
 ADD COLUMN IF NOT EXISTS session text NOT NULL DEFAULT 'FULL',
 ADD COLUMN IF NOT EXISTS working_days numeric,
 ADD COLUMN IF NOT EXISTS calendar_snapshot jsonb,
 ADD COLUMN IF NOT EXISTS form_snapshot jsonb,
 ADD COLUMN IF NOT EXISTS conditions text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS conditions_acknowledged_at timestamptz,
 ADD COLUMN IF NOT EXISTS conditions_acknowledged_by uuid,
 ADD COLUMN IF NOT EXISTS approved_at timestamptz;
CREATE TABLE IF NOT EXISTS public.hr_leave_calendar (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), settings jsonb NOT NULL,
 version integer NOT NULL DEFAULT 1, updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.hr_leave_calendar_dates (
 work_date date PRIMARY KEY, is_working boolean NOT NULL, label text NOT NULL DEFAULT ''
);
INSERT INTO public.hr_leave_calendar(id,settings)
 SELECT true,jsonb_build_object('weekly_holidays',COALESCE((SELECT jsonb_agg(CASE upper(v) WHEN 'SUNDAY' THEN 0 WHEN 'MONDAY' THEN 1 WHEN 'TUESDAY' THEN 2 WHEN 'WEDNESDAY' THEN 3 WHEN 'THURSDAY' THEN 4 WHEN 'FRIDAY' THEN 5 WHEN 'SATURDAY' THEN 6 END) FROM company_payroll_policy c,jsonb_array_elements_text(to_jsonb(c.weekly_holidays)) v WHERE c.company_id='lm'),'[0]'), 'default_start',NULL,'default_end',NULL)
 ON CONFLICT(id) DO NOTHING;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['hr_leave_calendar','hr_leave_calendar_dates'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
 IF to_regclass('storage.buckets') IS NOT NULL THEN
  INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  VALUES('leave_form_documents','leave_form_documents',false,10485760,ARRAY['application/pdf','image/jpeg','image/png'])
  ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=10485760,allowed_mime_types=EXCLUDED.allowed_mime_types;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.hr_leave_balance_version() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.version=OLD.version+1;NEW.updated_at=now();RETURN NEW;END $$;
DROP TRIGGER IF EXISTS hr_leave_balance_version ON public."Leave_balances";
CREATE TRIGGER hr_leave_balance_version BEFORE UPDATE ON public."Leave_balances" FOR EACH ROW EXECUTE FUNCTION public.hr_leave_balance_version();
CREATE OR REPLACE FUNCTION public.hr_leave_scoped(p_actor uuid,p_employee uuid,p_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE((SELECT u.is_active AND (u.is_owner OR (
 (p.policy->'modules'->'leave') ? p_action AND (p.policy->>'scope'='all' OR (p.policy->>'scope'='own' AND u.employee_id=p_employee) OR (p.policy->>'scope'='selected' AND (p.policy->'employee_ids') ? p_employee::text))
 )) FROM sys_users u LEFT JOIN hr_access_policies p ON p.user_id=u.id WHERE u.id=p_actor),false)
$$;
-- Daily assignment > company date exception > dated weekly roster > company week.
CREATE OR REPLACE FUNCTION public.hr_leave_workday(p_employee uuid,p_date date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE e "Employees"; daily employee_daily_schedules; roster employee_rosters; special hr_leave_calendar_dates; cfg jsonb; working boolean; shift_id uuid; sh shifts; source text; st time; en time; starts timestamp; ends timestamp;
BEGIN
 SELECT * INTO e FROM "Employees" WHERE id=p_employee AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee record is unavailable'; END IF;
 SELECT settings INTO cfg FROM hr_leave_calendar WHERE id;
 SELECT * INTO daily FROM employee_daily_schedules WHERE employee_id=p_employee AND schedule_date=p_date ORDER BY updated_at DESC,id DESC LIMIT 1;
 SELECT * INTO special FROM hr_leave_calendar_dates WHERE work_date=p_date;
 SELECT * INTO roster FROM employee_rosters WHERE employee_id=p_employee AND day_of_week=extract(dow FROM p_date)::integer AND (start_date IS NULL OR start_date<=p_date) AND (end_date IS NULL OR end_date>=p_date) ORDER BY updated_at DESC,id DESC LIMIT 1;
 IF daily.id IS NOT NULL THEN working=NOT COALESCE(daily.is_off_day,false);shift_id=COALESCE(daily.shift_id,e.default_shift_id);source='daily schedule';
 ELSIF special.work_date IS NOT NULL THEN working=special.is_working;shift_id=e.default_shift_id;source='company date';
 ELSIF roster.id IS NOT NULL THEN working=NOT COALESCE(roster.is_off_day,false);shift_id=COALESCE(roster.shift_id,e.default_shift_id);source='weekly roster';
 ELSE working=NOT COALESCE(cfg->'weekly_holidays','[0]') @> to_jsonb(ARRAY[extract(dow FROM p_date)::integer]);shift_id=e.default_shift_id;source='company week';END IF;
 IF NOT working THEN RETURN jsonb_build_object('date',p_date,'working',false,'source',source,'label',COALESCE(special.label,''));END IF;
 IF shift_id IS NOT NULL THEN SELECT * INTO sh FROM shifts WHERE id=shift_id;st=sh.start_time;en=sh.end_time; END IF;
 st=COALESCE(st,NULLIF(cfg->>'default_start','')::time);en=COALESCE(en,NULLIF(cfg->>'default_end','')::time);
 IF st IS NULL OR en IS NULL OR st=en THEN RAISE EXCEPTION 'Assign a shift with hours or ask the owner to set default hours in Leave Calendar'; END IF;
 starts=p_date+st;ends=p_date+en;IF ends<=starts THEN ends=ends+interval '1 day';END IF;
 RETURN jsonb_build_object('date',p_date,'working',true,'start_at',starts AT TIME ZONE 'Asia/Bangkok','end_at',ends AT TIME ZONE 'Asia/Bangkok','source',source,'label',COALESCE(special.label,''));
END $$;
CREATE OR REPLACE FUNCTION public.hr_leave_days(p_employee uuid,p_start date,p_end date,p_session text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE days jsonb='[]'; d date; day jsonb; first_at timestamptz; last_at timestamptz;
BEGIN
 IF p_start IS NULL OR p_end IS NULL OR p_end<p_start OR p_end-p_start>365 OR p_session NOT IN ('FULL','AM','PM') OR (p_session<>'FULL' AND p_start<>p_end) THEN RAISE EXCEPTION 'Choose a valid date range (up to 366 days); half days use a single shift date';END IF;
 FOR d IN SELECT generate_series(p_start,p_end,interval '1 day')::date LOOP
  day=hr_leave_workday(p_employee,d);
  IF (day->>'working')::boolean THEN
   first_at=(day->>'start_at')::timestamptz;last_at=(day->>'end_at')::timestamptz;
   IF p_session='AM' THEN last_at=first_at+(last_at-first_at)/2;
   ELSIF p_session='PM' THEN first_at=first_at+(last_at-first_at)/2;END IF;
   days=days||jsonb_build_array(day||jsonb_build_object('units',CASE WHEN p_session='FULL' THEN 1 ELSE 0.5 END,'session',p_session,'leave_start_at',first_at,'leave_end_at',last_at));
  ELSE days=days||jsonb_build_array(day||jsonb_build_object('units',0,'session',p_session));END IF;
 END LOOP;
 RETURN days;
END $$;
CREATE OR REPLACE FUNCTION public.hr_leave_day_signature(p_days jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT md5(COALESCE(jsonb_agg(jsonb_build_object('date',d->>'date','units',d->'units','start',d->'leave_start_at','end',d->'leave_end_at') ORDER BY d->>'date'),'[]')::text) FROM jsonb_array_elements(p_days) d
$$;
CREATE OR REPLACE FUNCTION public.hr_leave_quote(p_employee uuid,p_type uuid,p_start date,p_end date,p_session text,p_now timestamptz DEFAULT now()) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE days jsonb; units numeric; lt "Leave_type"; balances jsonb; selected_balances jsonb; issues jsonb='[]'; starts timestamptz; today date=(p_now AT TIME ZONE 'Asia/Bangkok')::date; cutoff date; notice integer=0; walk integer=0; d jsonb; fingerprint text;
BEGIN
 SELECT * INTO lt FROM "Leave_type" WHERE id=p_type;IF NOT FOUND THEN RAISE EXCEPTION 'Choose a leave type';END IF;
 days=hr_leave_days(p_employee,p_start,p_end,p_session);
 SELECT sum((x->>'units')::numeric),min((x->>'leave_start_at')::timestamptz) INTO units,starts FROM jsonb_array_elements(days) x;
 IF units<=0 THEN issues=issues||jsonb_build_array('The selected dates contain no scheduled working time');END IF;
 IF p_end-p_start+1>3 THEN
  cutoff=p_start;
  WHILE notice<7 AND walk<370 LOOP cutoff=cutoff-1;walk=walk+1;d=hr_leave_workday(p_employee,cutoff);IF (d->>'working')::boolean THEN notice=notice+1;END IF;END LOOP;
  IF notice<7 OR today>cutoff THEN issues=issues||jsonb_build_array('More than 3 consecutive calendar days requires submission at least 7 working dates before the start date');END IF;
 ELSIF lt.kind NOT IN ('sick','bereavement') AND starts<p_now+interval '24 hours' THEN
  issues=issues||jsonb_build_array('This leave requires at least 24 hours notice before the scheduled leave start');
 END IF;
 IF EXISTS(SELECT 1 FROM "Leave_balances" WHERE employee_id=p_employee AND year BETWEEN extract(year FROM p_start)::integer AND extract(year FROM p_end)::integer GROUP BY leave_type_id,year HAVING count(*)>1) THEN RAISE EXCEPTION 'HR must resolve duplicate balances for this employee, leave type and year';END IF;
 WITH years AS(SELECT DISTINCT extract(year FROM (x->>'date')::date)::integer y FROM jsonb_array_elements(days) x WHERE (x->>'units')::numeric>0), requested AS(SELECT extract(year FROM (x->>'date')::date)::integer y,sum((x->>'units')::numeric) n FROM jsonb_array_elements(days) x GROUP BY 1)
 SELECT COALESCE(jsonb_agg(jsonb_build_object('type_id',t.id,'type_name',t.type_name,'year',y.y,'is_paid',t.is_paid,'before',CASE WHEN NOT COALESCE(t.is_paid,true) THEN NULL ELSE COALESCE(b.entitled_days-b.used_days,0) END,'requested',CASE WHEN t.id=p_type THEN COALESCE(r.n,0) ELSE 0 END,'after',CASE WHEN NOT COALESCE(t.is_paid,true) THEN NULL ELSE COALESCE(b.entitled_days-b.used_days,0)-CASE WHEN t.id=p_type THEN COALESCE(r.n,0) ELSE 0 END END,'balance_version',COALESCE(b.version,0)) ORDER BY y.y,t.type_name,t.id),'[]') INTO balances
 FROM years y CROSS JOIN "Leave_type" t LEFT JOIN requested r ON r.y=y.y LEFT JOIN "Leave_balances" b ON b.employee_id=p_employee AND b.leave_type_id=t.id AND b.year=y.y;
 SELECT COALESCE(jsonb_agg(b ORDER BY b->>'year'),'[]') INTO selected_balances FROM jsonb_array_elements(balances) b WHERE b->>'type_id'=p_type::text;
 IF COALESCE(lt.is_paid,true) AND EXISTS(SELECT 1 FROM jsonb_array_elements(selected_balances) b WHERE (b->>'after')::numeric<0) THEN issues=issues||jsonb_build_array('Insufficient leave balance for one or more years');END IF;
 fingerprint=md5(hr_leave_day_signature(days)||selected_balances::text||lt.kind||COALESCE(lt.is_paid::text,'true'));
 RETURN jsonb_build_object('days',days,'working_days',units,'balances',balances,'medical_required',lt.kind='sick' AND units>3,'issues',issues,'notice_cutoff',cutoff,'start_at',starts,'type_name',lt.type_name,'kind',lt.kind,'is_paid',lt.is_paid,'fingerprint',fingerprint,'quoted_at',p_now);
END $$;
CREATE OR REPLACE FUNCTION public.hr_leave_overlap(p_employee uuid,p_days jsonb,p_exclude uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM "Leave_Request" r,jsonb_array_elements(p_days) d WHERE r.employee_id=p_employee AND r.id IS DISTINCT FROM p_exclude AND r.status IN ('Pending','Approved') AND (d->>'units')::numeric>0 AND (d->>'date')::date BETWEEN r.start_date AND r.end_date AND (r.form_version<2 OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.calendar_snapshot) old WHERE old->>'date'=d->>'date' AND (old->>'units')::numeric>0 AND (old->>'session'='FULL' OR d->>'session'='FULL' OR old->>'session'=d->>'session'))))
$$;
-- Only transaction functions may change a submitted version-2 form.
CREATE OR REPLACE FUNCTION public.hr_protect_leave_form() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'coverage_handover_id'-'return_handover_id'-'updated_at') IS NOT DISTINCT FROM (to_jsonb(OLD)-'coverage_handover_id'-'return_handover_id'-'updated_at') THEN RETURN NEW;END IF;
 IF OLD.form_version>=2 AND COALESCE(current_setting('hr.leave_write',true),'')<>'on' THEN RAISE EXCEPTION 'Use the staged leave workflow; submitted forms must be retained';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hr_protect_leave_form ON public."Leave_Request";
CREATE TRIGGER hr_protect_leave_form BEFORE UPDATE OR DELETE ON public."Leave_Request" FOR EACH ROW EXECUTE FUNCTION public.hr_protect_leave_form();
CREATE OR REPLACE FUNCTION public.hr_submit_leave_form(p_actor uuid,p_key uuid,p_input jsonb,p_expected text,p_document jsonb DEFAULT NULL) RETURNS public."Leave_Request" LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u sys_users; pol jsonb; r "Leave_Request"; e "Employees"; q jsonb; setting hr_workflow_settings; s jsonb; stages jsonb='[]'; assigned uuid; approver sys_users; apol jsonb; a hr_approval_requests; employee_info jsonb;
BEGIN
 SELECT * INTO u FROM sys_users WHERE id=p_actor AND is_active;IF NOT FOUND OR u.employee_id IS NULL THEN RAISE EXCEPTION 'An active linked employee account is required';END IF;
 SELECT policy INTO pol FROM hr_access_policies WHERE user_id=p_actor;
 IF NOT u.is_owner AND pol IS NOT NULL AND NOT COALESCE(pol->'personal','[]') ? 'leave' THEN RAISE EXCEPTION 'Leave permission has been removed';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('leave:'||u.employee_id::text));
 SELECT * INTO r FROM "Leave_Request" WHERE id=p_key;
 IF FOUND THEN IF r.requester_id=p_actor AND r.form_version=2 AND r.form_snapshot->'input'=p_input THEN RETURN r;ELSE RAISE EXCEPTION 'Request reference already exists; open a fresh request';END IF;END IF;
 IF length(trim(COALESCE(p_input->>'signature','')))=0 OR COALESCE(p_input->>'declaration','false')<>'true' THEN RAISE EXCEPTION 'Read the declaration and sign your name';END IF;
 q=hr_leave_quote(u.employee_id,(p_input->>'leave_type_id')::uuid,(p_input->>'start_date')::date,(p_input->>'end_date')::date,p_input->>'session');
 IF jsonb_array_length(q->'issues')>0 THEN RAISE EXCEPTION '%',q->'issues'->>0;END IF;
 IF p_expected IS DISTINCT FROM q->>'fingerprint' THEN RAISE EXCEPTION 'Calendar or balance changed. Refresh the leave preview.';END IF;
 IF (q->>'medical_required')::boolean AND (p_document IS NULL OR COALESCE(p_document->>'medical_certificate','false')<>'true') THEN RAISE EXCEPTION 'A medical certificate is required for sick leave exceeding 3 working days';END IF;
 IF hr_leave_overlap(u.employee_id,q->'days') THEN RAISE EXCEPTION 'This request overlaps pending or approved leave';END IF;
 SELECT * INTO setting FROM hr_workflow_settings WHERE workflow_key='leave' FOR SHARE;
 IF NOT FOUND OR NOT setting.enabled THEN RAISE EXCEPTION 'Ask the owner to activate Manager and HR approval in Approval Setup';END IF;
 IF jsonb_array_length(setting.stages)<>2 OR setting.stages->0->>'key'<>'manager' OR setting.stages->1->>'key'<>'hr' THEN RAISE EXCEPTION 'Manager and HR stages are required';END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(setting.stages) LOOP
  assigned=(CASE WHEN s->>'assignee_id'=p_actor::text THEN s->>'alternate_id' ELSE s->>'assignee_id' END)::uuid;
  IF assigned IS NULL OR assigned=p_actor THEN RAISE EXCEPTION 'An independent approver is required; set an alternate';END IF;
  SELECT * INTO approver FROM sys_users WHERE id=assigned AND is_active;
  SELECT policy INTO apol FROM hr_access_policies WHERE user_id=assigned;
  IF approver.id IS NULL OR (NOT approver.is_owner AND NOT COALESCE(apol->'modules'->'leave','[]') ? 'approve') THEN RAISE EXCEPTION 'Assigned approvers need active Leave approval permission';END IF;
  IF approver.employee_id IS NOT NULL AND approver.employee_id=u.employee_id THEN RAISE EXCEPTION 'An independent employee must approve this leave';END IF;
  stages=stages||jsonb_build_array(s||jsonb_build_object('assignee_id',assigned,'assignee_name',COALESCE(approver.full_name,approver.username),'action','approve'));
 END LOOP;
 SELECT * INTO e FROM "Employees" WHERE id=u.employee_id AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee record is unavailable';END IF;
 employee_info=jsonb_build_object('name',e."Full_name",'employee_number',e.employee_id,'business_unit',p_input->>'business_unit','position',(SELECT title FROM positions WHERE id=e.position_id),'manager',(SELECT "Full_name" FROM "Employees" WHERE id=e."Manager_id"),'department',(SELECT "Department_name" FROM "Departments" WHERE id=e."Dept_id"),'phone',p_input->>'contact_phone','email',p_input->>'contact_email');
 INSERT INTO "Leave_Request"(id,employee_id,leave_type_id,start_date,end_date,reason,status,document_url,form_version,requester_id,session,working_days,calendar_snapshot,form_snapshot)
 VALUES(p_key,u.employee_id,(p_input->>'leave_type_id')::uuid,(p_input->>'start_date')::date,(p_input->>'end_date')::date,p_input->>'reason','Pending',p_document->>'url',2,p_actor,p_input->>'session',(q->>'working_days')::numeric,q->'days',jsonb_build_object('input',p_input,'employee',employee_info,'type_name',q->>'type_name','kind',q->>'kind','is_paid',q->'is_paid','balances',q->'balances','document',p_document,'declared_at',now(),'notice_cutoff',q->'notice_cutoff')) RETURNING * INTO r;
 INSERT INTO hr_approval_requests(workflow_key,resource_id,requester_id,employee_id,title,snapshot,stages) VALUES('leave',r.id,p_actor,u.employee_id,e."Full_name"||': '||r.start_date||' - '||r.end_date,jsonb_build_object('leave_form_id',r.id,'start_date',r.start_date,'end_date',r.end_date,'working_days',r.working_days,'type_name',q->>'type_name'),stages) RETURNING * INTO a;
 INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES((stages->0->>'assignee_id')::uuid,'Leave approval needed',a.title,'/approvals');
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'SUBMIT','Leave','Form '||r.id);
 RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.hr_decide_leave_form(p_actor uuid,p_id uuid,p_decision text,p_comment text,p_version integer,p_conditions text DEFAULT '') RETURNS public.hr_approval_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a hr_approval_requests; r "Leave_Request"; u sys_users; pol jsonb; stage jsonb; next_status text; final boolean; days jsonb; yr record; bal "Leave_balances"; lt "Leave_type"; combined text; before_rows jsonb='[]';
BEGIN
 SELECT * INTO u FROM sys_users WHERE id=p_actor AND is_active;IF NOT FOUND THEN RAISE EXCEPTION 'Account is disabled';END IF;
 SELECT * INTO a FROM hr_approval_requests WHERE id=p_id AND workflow_key='leave' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Leave request not found';END IF;
 SELECT * INTO r FROM "Leave_Request" WHERE id=a.resource_id AND form_version=2 FOR UPDATE;
 IF NOT FOUND OR a.status<>'pending' OR r.status<>'Pending' THEN RAISE EXCEPTION 'Request already completed or unavailable';END IF;
 IF a.version<>p_version THEN RAISE EXCEPTION 'Request changed. Reload and try again.';END IF;
 IF a.requester_id=p_actor OR (u.employee_id IS NOT NULL AND u.employee_id=r.employee_id) THEN RAISE EXCEPTION 'Cannot decide your own leave request';END IF;
 stage=a.stages->a.current_stage;
 IF stage->>'assignee_id'<>p_actor::text THEN RAISE EXCEPTION 'This stage is assigned to someone else';END IF;
 SELECT policy INTO pol FROM hr_access_policies WHERE user_id=p_actor;
 IF NOT u.is_owner AND NOT COALESCE(pol->'modules'->'leave','[]') ? 'approve' THEN RAISE EXCEPTION 'Leave approval permission has been removed';END IF;
 IF p_decision NOT IN ('approve','approve_with_conditions','reject') THEN RAISE EXCEPTION 'Invalid leave decision';END IF;
 IF p_decision='reject' AND length(trim(COALESCE(p_comment,'')))=0 THEN RAISE EXCEPTION 'Rejection reason required';END IF;
 IF p_decision='approve_with_conditions' AND length(trim(COALESCE(p_conditions,'')))=0 THEN RAISE EXCEPTION 'Enter the approval conditions';END IF;
 IF length(COALESCE(p_conditions,''))>4000 OR length(COALESCE(p_comment,''))>5000 THEN RAISE EXCEPTION 'Decision text is too long';END IF;
 final=a.current_stage+1>=jsonb_array_length(a.stages);
 next_status=CASE WHEN p_decision='reject' THEN 'rejected' WHEN final THEN 'approved' ELSE 'pending' END;
 combined=COALESCE(r.conditions,'');IF p_decision='approve_with_conditions' THEN combined=concat_ws(E'\n\n',NULLIF(combined,''),(stage->>'label')||' - '||COALESCE(u.full_name,u.username)||E':\n'||trim(p_conditions));END IF;
 PERFORM pg_advisory_xact_lock(hashtext('leave:'||r.employee_id::text));
 IF next_status='approved' THEN
  days=hr_leave_days(r.employee_id,r.start_date,r.end_date,r.session);
  IF hr_leave_day_signature(days)<>hr_leave_day_signature(r.calendar_snapshot) THEN RAISE EXCEPTION 'Calendar changed after submission. Reject this form and request a fresh one.';END IF;
  SELECT * INTO lt FROM "Leave_type" WHERE id=r.leave_type_id;
  IF lt.id IS NULL OR lt.kind<>r.form_snapshot->>'kind' OR COALESCE(lt.is_paid,true)<>COALESCE((r.form_snapshot->>'is_paid')::boolean,true) THEN RAISE EXCEPTION 'Leave type policy changed after submission. Request a fresh form.';END IF;
  IF hr_leave_overlap(r.employee_id,days,r.id) THEN RAISE EXCEPTION 'This request overlaps other pending or approved leave';END IF;
  FOR yr IN SELECT extract(year FROM (d->>'date')::date)::integer y,sum((d->>'units')::numeric) n FROM jsonb_array_elements(days) d WHERE (d->>'units')::numeric>0 GROUP BY 1 ORDER BY 1 LOOP
   IF (SELECT count(*) FROM "Leave_balances" WHERE employee_id=r.employee_id AND leave_type_id=r.leave_type_id AND year=yr.y)>1 THEN RAISE EXCEPTION 'HR must resolve duplicate balances';END IF;
   SELECT * INTO bal FROM "Leave_balances" WHERE employee_id=r.employee_id AND leave_type_id=r.leave_type_id AND year=yr.y FOR UPDATE;
   IF COALESCE(lt.is_paid,true) AND (bal.id IS NULL OR bal.entitled_days-bal.used_days<yr.n) THEN RAISE EXCEPTION 'Insufficient leave balance for year %',yr.y;END IF;
   before_rows=before_rows||jsonb_build_array(jsonb_build_object('year',yr.y,'before',CASE WHEN bal.id IS NULL OR NOT COALESCE(lt.is_paid,true) THEN NULL ELSE bal.entitled_days-bal.used_days END,'deducted',yr.n,'after',CASE WHEN bal.id IS NULL OR NOT COALESCE(lt.is_paid,true) THEN NULL ELSE bal.entitled_days-bal.used_days-yr.n END));
   IF bal.id IS NOT NULL THEN UPDATE "Leave_balances" SET used_days=used_days+yr.n,remain_days=CASE WHEN COALESCE(lt.is_paid,true) THEN entitled_days-used_days-yr.n ELSE GREATEST(0,entitled_days-used_days-yr.n) END WHERE id=bal.id;END IF;
  END LOOP;
 END IF;
 PERFORM set_config('hr.leave_write','on',true);
 UPDATE "Leave_Request" SET status=CASE WHEN next_status='approved' THEN 'Approved' WHEN next_status='rejected' THEN 'Rejected' ELSE 'Pending' END,conditions=combined,e_signature=CASE WHEN next_status='approved' THEN COALESCE(u.full_name,u.username) ELSE e_signature END,approved_at=CASE WHEN next_status='approved' THEN now() ELSE approved_at END,form_snapshot=CASE WHEN next_status='approved' THEN form_snapshot||jsonb_build_object('final_balances',before_rows) ELSE form_snapshot END,updated_at=now() WHERE id=r.id;
 UPDATE hr_approval_requests SET status=next_status,current_stage=CASE WHEN next_status='pending' THEN current_stage+1 ELSE current_stage END,version=version+1,updated_at=now(),history=history||jsonb_build_array(jsonb_build_object('stage',stage->>'key','label',stage->>'label','actor_id',p_actor,'actor_name',COALESCE(u.full_name,u.username),'decision',p_decision,'comment',trim(p_comment),'conditions',CASE WHEN p_decision='approve_with_conditions' THEN trim(p_conditions) ELSE '' END,'at',now())) WHERE id=p_id RETURNING * INTO a;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,upper(p_decision),'Leave approvals','Form '||r.id||' stage '||(stage->>'key'));
 INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES(a.requester_id,'Leave request updated',a.title||': '||next_status,'/portal/leaves');
 IF next_status='pending' THEN INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES((a.stages->a.current_stage->>'assignee_id')::uuid,'Leave approval needed',a.title,'/approvals');END IF;
 RETURN a;
END $$;
CREATE OR REPLACE FUNCTION public.hr_ack_leave_conditions(p_actor uuid,p_id uuid) RETURNS public."Leave_Request" LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r "Leave_Request"; u sys_users; pol jsonb;
BEGIN
 SELECT * INTO u FROM sys_users WHERE id=p_actor AND is_active;SELECT policy INTO pol FROM hr_access_policies WHERE user_id=p_actor;
 IF u.id IS NULL OR (NOT u.is_owner AND pol IS NOT NULL AND NOT COALESCE(pol->'personal','[]') ? 'leave') THEN RAISE EXCEPTION 'Leave permission is required';END IF;
 SELECT * INTO r FROM "Leave_Request" WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR r.employee_id IS DISTINCT FROM u.employee_id OR r.requester_id<>p_actor THEN RAISE EXCEPTION 'This request is outside your access';END IF;
 IF r.form_version<>2 OR r.status<>'Approved' OR length(r.conditions)=0 THEN RAISE EXCEPTION 'No approved conditions to acknowledge';END IF;
 IF r.conditions_acknowledged_at IS NOT NULL THEN RETURN r;END IF;
 PERFORM set_config('hr.leave_write','on',true);
 UPDATE "Leave_Request" SET conditions_acknowledged_at=now(),conditions_acknowledged_by=p_actor WHERE id=p_id RETURNING * INTO r;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'ACKNOWLEDGE','Leave','Conditions received for form '||r.id);
 RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.hr_save_leave_calendar(p_actor uuid,p_version integer,p_settings jsonb,p_dates jsonb) RETURNS public.hr_leave_calendar LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg hr_leave_calendar; item jsonb; previous_dates date[];
BEGIN
 IF NOT EXISTS(SELECT 1 FROM sys_users WHERE id=p_actor AND is_owner AND is_active) THEN RAISE EXCEPTION 'Owner permission is required';END IF;
 SELECT * INTO cfg FROM hr_leave_calendar WHERE id FOR UPDATE;
 IF cfg.version<>p_version THEN RAISE EXCEPTION 'Calendar changed. Reload before saving.';END IF;
 UPDATE hr_leave_calendar SET settings=p_settings,version=version+1,updated_at=now(),updated_by=p_actor WHERE id RETURNING * INTO cfg;
 SELECT array_agg(work_date) INTO previous_dates FROM hr_leave_calendar_dates;
 DELETE FROM hr_leave_calendar_dates WHERE work_date=ANY(previous_dates);
 FOR item IN SELECT value FROM jsonb_array_elements(p_dates) LOOP INSERT INTO hr_leave_calendar_dates(work_date,is_working,label) VALUES((item->>'date')::date,(item->>'is_working')::boolean,item->>'label');END LOOP;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'UPDATE','Leave calendar','Calendar version '||cfg.version);
 RETURN cfg;
END $$;
CREATE OR REPLACE FUNCTION public.hr_set_leave_entitlement(p_actor uuid,p_employee uuid,p_type uuid,p_year integer,p_days numeric,p_version integer) RETURNS public."Leave_balances" LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b "Leave_balances";
BEGIN
 IF NOT hr_leave_scoped(p_actor,p_employee,'edit') THEN RAISE EXCEPTION 'Scoped Leave editing permission is required';END IF;
 IF p_year<2000 OR p_year>2100 OR p_days<0 OR p_days>3660 OR p_days*2<>trunc(p_days*2) THEN RAISE EXCEPTION 'Enter a valid year and entitlement in half-day units';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('leave:'||p_employee::text));
 IF (SELECT count(*) FROM "Leave_balances" WHERE employee_id=p_employee AND leave_type_id=p_type AND year=p_year)>1 THEN RAISE EXCEPTION 'HR must resolve duplicate balances';END IF;
 SELECT * INTO b FROM "Leave_balances" WHERE employee_id=p_employee AND leave_type_id=p_type AND year=p_year FOR UPDATE;
 IF COALESCE(b.version,0)<>p_version THEN RAISE EXCEPTION 'Balance changed. Reload before saving.';END IF;
 IF p_days<COALESCE(b.used_days,0) THEN RAISE EXCEPTION 'Entitlement cannot be below already used leave';END IF;
 IF NOT EXISTS(SELECT 1 FROM "Employees" WHERE id=p_employee AND deleted_at IS NULL) OR NOT EXISTS(SELECT 1 FROM "Leave_type" WHERE id=p_type) THEN RAISE EXCEPTION 'Employee or leave type is unavailable';END IF;
 IF b.id IS NULL THEN INSERT INTO "Leave_balances"(employee_id,leave_type_id,year,entitled_days,used_days,remain_days) VALUES(p_employee,p_type,p_year,p_days,0,p_days) RETURNING * INTO b;
 ELSE UPDATE "Leave_balances" SET entitled_days=p_days,remain_days=p_days-used_days WHERE id=b.id RETURNING * INTO b;END IF;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'UPDATE','Leave entitlement','Employee '||p_employee||', type '||p_type||', year '||p_year||', balance version '||b.version);
 RETURN b;
END $$;
REVOKE ALL ON FUNCTION public.hr_leave_scoped(uuid,uuid,text),public.hr_leave_workday(uuid,date),public.hr_leave_days(uuid,date,date,text),public.hr_leave_day_signature(jsonb),public.hr_leave_quote(uuid,uuid,date,date,text,timestamptz),public.hr_leave_overlap(uuid,jsonb,uuid),public.hr_submit_leave_form(uuid,uuid,jsonb,text,jsonb),public.hr_decide_leave_form(uuid,uuid,text,text,integer,text),public.hr_ack_leave_conditions(uuid,uuid),public.hr_save_leave_calendar(uuid,integer,jsonb,jsonb),public.hr_set_leave_entitlement(uuid,uuid,uuid,integer,numeric,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_leave_scoped(uuid,uuid,text),public.hr_leave_workday(uuid,date),public.hr_leave_days(uuid,date,date,text),public.hr_leave_day_signature(jsonb),public.hr_leave_quote(uuid,uuid,date,date,text,timestamptz),public.hr_leave_overlap(uuid,jsonb,uuid),public.hr_submit_leave_form(uuid,uuid,jsonb,text,jsonb),public.hr_decide_leave_form(uuid,uuid,text,text,integer,text),public.hr_ack_leave_conditions(uuid,uuid),public.hr_save_leave_calendar(uuid,integer,jsonb,jsonb),public.hr_set_leave_entitlement(uuid,uuid,uuid,integer,numeric,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
