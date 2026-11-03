-- Optional client presentation data. Apply after 016; this migration seeds no people.
BEGIN;
DO $$ BEGIN IF to_regprocedure('public.hr_expense_route(uuid,text,numeric,jsonb)') IS NULL THEN RAISE EXCEPTION 'Apply migration 016 before 017.';END IF;END $$;
CREATE TABLE IF NOT EXISTS public.hr_demo_runs(
 id uuid PRIMARY KEY,instance_id uuid NOT NULL REFERENCES public.hr_instance(id),owner_id uuid NOT NULL REFERENCES public.sys_users(id),
 label text NOT NULL,state text NOT NULL CHECK(state IN ('installing','active','cleared')),anchor_day date NOT NULL,
 before_settings jsonb NOT NULL DEFAULT '{}',summary jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),cleared_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS hr_one_active_demo ON public.hr_demo_runs((true)) WHERE state IN ('installing','active');
CREATE TABLE IF NOT EXISTS public.hr_demo_rows(
 run_id uuid NOT NULL REFERENCES public.hr_demo_runs(id),table_name text NOT NULL,row_key jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(run_id,table_name,row_key)
);
CREATE TABLE IF NOT EXISTS public.hr_demo_files(
 run_id uuid NOT NULL REFERENCES public.hr_demo_runs(id),bucket text NOT NULL,path text NOT NULL,deleted_at timestamptz,
 PRIMARY KEY(run_id,bucket,path),CHECK(path NOT LIKE '%..%')
);
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['hr_demo_runs','hr_demo_rows','hr_demo_files'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
END LOOP;END $$;

CREATE OR REPLACE FUNCTION public.hr_demo_key(p_table text,p_row jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_object_agg(a.attname,p_row->a.attname) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=ANY(i.indkey)
 WHERE n.nspname='public' AND c.relname=p_table AND i.indisprimary
$$;
CREATE OR REPLACE FUNCTION public.hr_demo_fence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM pg_advisory_xact_lock_shared(7319478);IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END $$;
CREATE OR REPLACE FUNCTION public.hr_demo_track() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE batch uuid;k jsonb;BEGIN
 SELECT id INTO batch FROM hr_demo_runs WHERE state IN ('installing','active');IF batch IS NULL THEN RETURN NEW;END IF;
 -- Owner identity and Owner login sessions are never disposable demo records.
 IF TG_TABLE_NAME='sys_users' AND coalesce((to_jsonb(NEW)->>'is_owner')::boolean,false) THEN RETURN NEW;END IF;
 IF TG_TABLE_NAME='hr_auth_sessions' AND EXISTS(SELECT 1 FROM sys_users WHERE id=(to_jsonb(NEW)->>'user_id')::uuid AND is_owner) THEN RETURN NEW;END IF;
 k=hr_demo_key(TG_TABLE_NAME,to_jsonb(NEW));IF k IS NULL THEN RAISE EXCEPTION 'Demo tracking requires a primary key: %',TG_TABLE_NAME;END IF;
 INSERT INTO hr_demo_rows(run_id,table_name,row_key) VALUES(batch,TG_TABLE_NAME,k) ON CONFLICT DO NOTHING;RETURN NEW;
END $$;
-- Capture files uploaded during the presentation too. Storage deletion still uses its API.
CREATE OR REPLACE FUNCTION public.hr_demo_track_storage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE batch uuid;BEGIN
 SELECT id INTO batch FROM hr_demo_runs WHERE state IN ('installing','active');
 IF batch IS NOT NULL AND NEW.bucket_id IN ('avatars','resumes','recruitment_documents','leave_documents','handover_documents','expense_documents','employee_information','company_documents','sop_videos','attendance_photos') THEN
  INSERT INTO hr_demo_files(run_id,bucket,path) VALUES(batch,NEW.bucket_id,NEW.name) ON CONFLICT DO NOTHING;
 END IF;RETURN NEW;
END $$;
DO $$ BEGIN IF to_regclass('storage.objects') IS NOT NULL THEN
 EXECUTE 'DROP TRIGGER IF EXISTS hr_demo_storage_fence ON storage.objects';
 EXECUTE 'CREATE TRIGGER hr_demo_storage_fence BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.hr_demo_fence()';
 EXECUTE 'DROP TRIGGER IF EXISTS hr_demo_storage_tracking ON storage.objects';
 EXECUTE 'CREATE TRIGGER hr_demo_storage_tracking AFTER INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.hr_demo_track_storage()';
END IF;END $$;
CREATE OR REPLACE FUNCTION public.hr_demo_cleanup_row(p_table text,p_row jsonb) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM hr_demo_rows d JOIN hr_demo_runs r ON r.id=d.run_id
 JOIN sys_users u ON u.id::text=current_setting('hr.demo_actor',true) AND u.is_owner AND u.is_active
 WHERE r.state='cleared' AND r.id::text=current_setting('hr.demo_cleanup',true)
 AND d.table_name=p_table AND d.row_key=hr_demo_key(p_table,p_row)
 AND NOT(p_table='sys_users' AND coalesce((p_row->>'is_owner')::boolean,false)))
$$;
-- Guard overrides appended below apply only to tracked rows during the Owner cleanup transaction.
CREATE OR REPLACE FUNCTION public.hr_guard_brand_settings()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
 IF TG_OP='DELETE' AND public.hr_demo_cleanup_row(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD;END IF;
 IF TG_OP='DELETE' OR current_setting('hr.brand_write',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Use Owner branding and setup settings'; END IF; RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.hr_guard_document_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
 IF TG_OP='DELETE' AND public.hr_demo_cleanup_row(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD;END IF;
 IF TG_TABLE_NAME='employee_documents' THEN
  IF OLD.status='COMPLETED_AND_ISSUED' OR EXISTS(SELECT 1 FROM doc_approval_requests WHERE issued_document_id=OLD.id OR legacy_document_id=OLD.id OR file_url=OLD.file_url) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Retain documents referenced by approval or issued history.';END IF;
 ELSE
  IF OLD.issued_document_id IS NOT NULL OR jsonb_array_length(OLD.approval_history)>0 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Retain reviewed and issued document history.';END IF;
 END IF;
 RETURN OLD;
END $function$
;
CREATE OR REPLACE FUNCTION public.hr_guard_expense_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE ref uuid;prior_ref uuid;expense boolean;
BEGIN
 IF TG_OP='DELETE' AND public.hr_demo_cleanup_row(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD;END IF;
 IF TG_OP='DELETE' THEN ref=OLD.resource_id;expense=OLD.workflow_key='expense';
 ELSIF TG_OP='INSERT' THEN ref=NEW.resource_id;expense=NEW.workflow_key='expense';
 ELSE ref=NEW.resource_id;prior_ref=OLD.resource_id;expense=NEW.workflow_key='expense' OR OLD.workflow_key='expense';END IF;
 IF expense AND EXISTS(SELECT 1 FROM rewards_and_claims WHERE (id=ref OR id=prior_ref) AND form_version=2) AND current_setting('hr.expense_write',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Use the complete expense approval workflow';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.hr_guard_expense_form()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
 IF TG_OP='DELETE' AND public.hr_demo_cleanup_row(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD;END IF;
 IF TG_OP='DELETE' THEN
  IF OLD.form_version=2 THEN RAISE EXCEPTION 'Submitted expense forms must be retained';END IF;RETURN OLD;
 END IF;
 IF (NEW.form_version=2 OR (TG_OP='UPDATE' AND OLD.form_version=2)) AND current_setting('hr.expense_write',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Use the complete expense form and assigned approval workflow';END IF;
 IF TG_OP='INSERT' AND NEW.claim_type='Expense Claim' AND NEW.form_version<>2 THEN RAISE EXCEPTION 'Use the complete expense request form';END IF;
 IF TG_OP='UPDATE' AND OLD.claim_type IS DISTINCT FROM 'Expense Claim' AND NEW.claim_type='Expense Claim' AND NEW.form_version<>2 THEN RAISE EXCEPTION 'Use the complete expense request form';END IF;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.hr_guard_handover()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
 IF TG_OP='DELETE' AND public.hr_demo_cleanup_row(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD;END IF;
 IF OLD.status IN ('completed','waived','cancelled') AND (TG_OP='DELETE' OR NEW IS DISTINCT FROM OLD) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Completed handover history is read-only.';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 NEW.version=OLD.version+1;NEW.updated_at=now();
 IF NEW.successor_employee_id IS DISTINCT FROM OLD.successor_employee_id THEN
  UPDATE handover_items SET successor_acknowledged=false,successor_ack_at=NULL WHERE handover_id=OLD.id;
 END IF;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.hr_guard_handover_child()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE h employee_handovers; reference uuid; content_changed boolean=false; BEGIN
 IF TG_OP='DELETE' AND public.hr_demo_cleanup_row(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD;END IF;
 reference=CASE WHEN TG_OP='DELETE' THEN OLD.handover_id ELSE NEW.handover_id END;
 SELECT * INTO h FROM employee_handovers WHERE id=reference FOR UPDATE;
 IF h.id IS NULL OR h.status IN ('completed','waived','cancelled') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Completed handover history is read-only.';END IF;
 IF TG_OP='UPDATE' AND NEW.handover_id IS DISTINCT FROM OLD.handover_id THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Handover association cannot change.';END IF;
 IF TG_TABLE_NAME='handover_items' AND TG_OP='UPDATE' THEN
  content_changed=(to_jsonb(NEW)-'successor_acknowledged'-'successor_ack_at'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'successor_acknowledged'-'successor_ack_at'-'updated_at');
  IF content_changed THEN NEW.successor_acknowledged=false;NEW.successor_ack_at=NULL;END IF;
 ELSE content_changed=true;END IF;
 IF content_changed AND h.status='pending_review' THEN UPDATE employee_handovers SET status='in_progress' WHERE id=h.id;END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.hr_guard_operations_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
 IF TG_OP='DELETE' AND public.hr_demo_cleanup_row(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD;END IF; IF TG_OP<>'INSERT' OR current_setting('hr.operations_write',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Use the HR operations workflow; history is retained';END IF;RETURN NEW;END $function$
;
CREATE OR REPLACE FUNCTION public.hr_guard_paid_payroll()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
 IF TG_OP='DELETE' AND public.hr_demo_cleanup_row(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD;END IF;
 IF OLD.payment_status='Paid' AND (TG_OP='DELETE' OR NEW IS DISTINCT FROM OLD) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Paid payroll is immutable. Record a separate adjustment instead.';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.hr_guard_probation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
 IF TG_OP='DELETE' AND public.hr_demo_cleanup_row(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD;END IF; IF current_setting('hr.probation_write',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Use the assigned probation form workflow; records must be retained';END IF;IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END $function$
;
CREATE OR REPLACE FUNCTION public.hr_guard_probation_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE ref uuid;prior uuid;relevant boolean;
BEGIN
 IF TG_OP='DELETE' AND public.hr_demo_cleanup_row(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD;END IF;
 IF TG_OP='DELETE' THEN ref=OLD.resource_id;ELSIF TG_OP='INSERT' THEN ref=NEW.resource_id;ELSE ref=NEW.resource_id;prior=OLD.resource_id;END IF;
 relevant=CASE WHEN TG_OP='INSERT' THEN NEW.workflow_key='probation' WHEN TG_OP='DELETE' THEN OLD.workflow_key='probation' ELSE NEW.workflow_key='probation' OR OLD.workflow_key='probation' END;
 IF relevant AND EXISTS(SELECT 1 FROM hr_probation_forms WHERE id=ref OR id=prior) AND current_setting('hr.probation_write',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Use the complete probation approval workflow';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.hr_guard_released_tasks()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE case_id uuid; released boolean; BEGIN
 IF TG_OP='DELETE' AND public.hr_demo_cleanup_row(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD;END IF;
 case_id=CASE WHEN TG_OP='DELETE' THEN OLD.offboarding_id ELSE NEW.offboarding_id END;
 SELECT settlement_status='Released' INTO released FROM corporate_offboarding WHERE id=case_id FOR UPDATE;
 IF released AND (TG_OP='DELETE' OR NEW.status IS DISTINCT FROM 'Completed') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Released settlement clearance cannot be undone.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.hr_guard_warning()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
 IF TG_OP='DELETE' AND public.hr_demo_cleanup_row(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD;END IF; IF current_setting('hr.warning_write',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Use the assigned warning form workflow; records must be retained';END IF;IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END $function$
;
CREATE OR REPLACE FUNCTION public.hr_guard_warning_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE ref uuid;prior uuid;relevant boolean;
BEGIN
 IF TG_OP='DELETE' AND public.hr_demo_cleanup_row(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD;END IF;
 IF TG_OP='DELETE' THEN ref=OLD.resource_id;ELSIF TG_OP='INSERT' THEN ref=NEW.resource_id;ELSE ref=NEW.resource_id;prior=OLD.resource_id;END IF;
 relevant=CASE WHEN TG_OP='INSERT' THEN NEW.workflow_key='warning' WHEN TG_OP='DELETE' THEN OLD.workflow_key='warning' ELSE NEW.workflow_key='warning' OR OLD.workflow_key='warning' END;
 IF relevant AND EXISTS(SELECT 1 FROM hr_warning_forms WHERE id=ref OR id=prior) AND current_setting('hr.warning_write',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Use the complete warning approval workflow';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.hr_protect_leave_form()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
 IF TG_OP='DELETE' AND public.hr_demo_cleanup_row(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD;END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'coverage_handover_id'-'return_handover_id'-'updated_at') IS NOT DISTINCT FROM (to_jsonb(OLD)-'coverage_handover_id'-'return_handover_id'-'updated_at') THEN RETURN NEW;END IF;
 IF OLD.form_version>=2 AND COALESCE(current_setting('hr.leave_write',true),'')<>'on' THEN RAISE EXCEPTION 'Use the staged leave workflow; submitted forms must be retained';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $function$
;

DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['Departments','Employees','Leave_Request','Leave_balances','Leave_type','announcements','attendance_records','biometric_device','biometric_employees','biometric_logs','boss_chat_messages','boss_chat_sessions','boss_kpi_assignments','corporate_offboarding','daily_sops','doc_approval_requests','employee_career_timeline','employee_daily_schedules','employee_documents','employee_handovers','employee_onboarding','employee_rosters','exit_interviews','handover_attachments','handover_items','hr_access_policies','hr_ai_action_proposals','hr_approval_requests','hr_auth_sessions','hr_birthday_deliveries','hr_business_units','hr_employee_business_sets','hr_employee_information','hr_employee_profiles','hr_expense_counters','hr_expense_receipts','hr_expense_routing','hr_leave_calendar','hr_leave_calendar_dates','hr_notification_receipts','hr_owner_setup_reviews','hr_probation_forms','hr_reminder_deliveries','hr_reminder_runs','hr_warning_counters','hr_warning_forms','hr_workflow_settings','hrm_manual_articles','hrm_manual_categories','hrm_manual_permissions','hrm_manual_versions','job_opening_files','job_openings','kpis','offboarding_case_tasks','onboarding_assignments','onboarding_tasks','overtime_requests','payrolls','peer_votes','peer_voting_records','positions','qr_attendance_tokens','recruitment_candidates','rewards_and_claims','shifts','sop_templates','sys_audit_logs','sys_users','system_notifications'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS hr_demo_write_fence ON public.%I',t);
 EXECUTE format('CREATE TRIGGER hr_demo_write_fence BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.hr_demo_fence()',t);
 EXECUTE format('DROP TRIGGER IF EXISTS hr_demo_track_insert ON public.%I',t);
 EXECUTE format('CREATE TRIGGER hr_demo_track_insert AFTER INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.hr_demo_track()',t);
 END LOOP;END $$;
CREATE OR REPLACE FUNCTION public.hr_install_client_demo(p_actor uuid,p_instance uuid,p_run uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE batch hr_demo_runs;entry jsonb;item jsonb;record_data jsonb;t text;cols text;k jsonb;v integer;f jsonb;q jsonb;a hr_approval_requests;
 eid uuid;uid uuid;rid uuid;rec jsonb;target text;step jsonb;amt numeric;actor uuid;ver integer;cnt integer=0;
 allowed text[]=ARRAY['Departments','shifts','positions','Employees','sys_users','hr_access_policies','hr_business_units','hr_employee_business_sets','Leave_type','Leave_balances','attendance_records','employee_daily_schedules','employee_rosters','overtime_requests','kpis','boss_kpi_assignments','payrolls','job_openings','job_opening_files','recruitment_candidates','employee_onboarding','onboarding_tasks','onboarding_assignments','corporate_offboarding','offboarding_case_tasks','exit_interviews','employee_handovers','handover_items','handover_attachments','employee_career_timeline','rewards_and_claims','sop_templates','daily_sops','peer_votes','peer_voting_records','announcements','employee_documents','doc_approval_requests','hrm_manual_categories','hrm_manual_articles','hrm_manual_versions','boss_chat_sessions','boss_chat_messages','system_notifications'];
BEGIN
 PERFORM pg_advisory_xact_lock(7319478);
 IF NOT EXISTS(SELECT 1 FROM hr_instance WHERE id=p_instance AND purpose='lm-hr-fresh') OR NOT EXISTS(SELECT 1 FROM sys_users WHERE id=p_actor AND is_owner AND is_active) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='An active Owner in the selected HR instance is required.';END IF;
 SELECT * INTO batch FROM hr_demo_runs WHERE state IN ('installing','active');
 IF batch.id IS NOT NULL THEN IF batch.id=p_run AND batch.state='active' THEN RETURN batch.summary;END IF;RAISE EXCEPTION 'A demo is already active. Clear it before creating another; no duplicate data was added.';END IF;
 IF EXISTS(SELECT 1 FROM hr_demo_runs WHERE id=p_run) THEN RAISE EXCEPTION 'This demo reference was already used.';END IF;
 IF jsonb_typeof(p_payload->'scenarios') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'scenarios')>100 OR jsonb_typeof(p_payload->'files') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'files')>100 THEN RAISE EXCEPTION 'Invalid demo scenarios or files.';END IF;
 IF jsonb_typeof(p_payload->'records') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'records')>5000 OR octet_length(p_payload::text)>5000000 THEN RAISE EXCEPTION 'Invalid demo package.';END IF;
 IF (p_payload->>'day')::date<>(now() AT TIME ZONE 'Asia/Bangkok')::date THEN RAISE EXCEPTION 'Demo date changed. Re-run setup to generate current dates.';END IF;
 INSERT INTO hr_demo_runs(id,instance_id,owner_id,label,state,anchor_day,before_settings)
 VALUES(p_run,p_instance,p_actor,'Client presentation · fictional HR records','installing',(p_payload->>'day')::date,jsonb_build_object(
  'workflows',coalesce((SELECT jsonb_agg(to_jsonb(w)) FROM hr_workflow_settings w),'[]'),
  'expense',(SELECT to_jsonb(e) FROM hr_expense_routing e WHERE id),
  'calendar',(SELECT to_jsonb(c) FROM hr_leave_calendar c WHERE id),
  'calendar_dates',coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM hr_leave_calendar_dates d),'[]')));
 FOREACH t IN ARRAY ARRAY['expense','leave','probation','warning','salary_template','operations','handover','brand'] LOOP PERFORM set_config('hr.'||t||'_write','on',true);END LOOP;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_payload->'records') LOOP
  t=entry->>'table';record_data=entry->'data';
  IF t IS NULL OR NOT t=ANY(allowed) OR jsonb_typeof(record_data) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Unsupported demo table: %',t;END IF;
  IF t='sys_users' AND (coalesce((record_data->>'is_owner')::boolean,false) OR record_data->>'role' IS DISTINCT FROM 'employee' OR record_data->>'username' !~ '^demo[.]' OR record_data->>'password_hash' !~ '^\$2[aby]\$12\$[./A-Za-z0-9]{53}$') THEN RAISE EXCEPTION 'Demo accounts must be non-Owner accounts with generated password hashes.';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(record_data) key WHERE NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name=key)) THEN RAISE EXCEPTION 'Unknown demo field in %',t;END IF;
  SELECT string_agg(format('%I',key),',' ORDER BY key) INTO cols FROM jsonb_object_keys(record_data) key;
  EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1)',t,cols,cols,t) USING record_data;
  cnt=cnt+1;
 END LOOP;
 -- Finish the circular case link only for newly inserted demo records.
 UPDATE corporate_offboarding o SET handover_id=h.id FROM employee_handovers h WHERE h.offboarding_id=o.id AND EXISTS(SELECT 1 FROM hr_demo_rows d WHERE d.run_id=p_run AND d.table_name='corporate_offboarding' AND d.row_key=jsonb_build_object('id',o.id)) AND EXISTS(SELECT 1 FROM hr_demo_rows d WHERE d.run_id=p_run AND d.table_name='employee_handovers' AND d.row_key=jsonb_build_object('id',h.id));
 -- Original settings stay in the run for the later, explicit cleanup.
 FOR entry IN SELECT value FROM jsonb_array_elements(p_payload->'workflows') LOOP
  SELECT coalesce((SELECT version FROM hr_workflow_settings WHERE workflow_key=entry->>'key'),0) INTO v;
  PERFORM hr_save_workflow(p_actor,entry->>'key',entry->'stages',true,v);
 END LOOP;
 SELECT version INTO v FROM hr_expense_routing WHERE id;
 PERFORM hr_save_expense_routing(p_actor,p_payload->'expense_routing',v);
 SELECT version INTO v FROM hr_leave_calendar WHERE id;
 -- Demo dates use a predictable calendar; restore the original overrides on clear.
 -- Delete only dates captured for this run; keep Supabase safe-update protection enabled.
 DELETE FROM hr_leave_calendar_dates d
 WHERE d.work_date IN (
  SELECT (saved->>'work_date')::date
  FROM hr_demo_runs r CROSS JOIN LATERAL jsonb_array_elements(r.before_settings->'calendar_dates') saved
  WHERE r.id=p_run
 );
 UPDATE hr_leave_calendar SET settings=p_payload->'calendar',version=v+1,updated_by=p_actor,updated_at=now() WHERE id;
 FOR f IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'files','[]')) LOOP
  IF f->>'bucket' NOT IN ('resumes','recruitment_documents','leave_documents','handover_documents','expense_documents') OR left(f->>'path',length('demo/'||p_run||'/'))<>'demo/'||p_run||'/' OR f->>'path' LIKE '%..%' THEN RAISE EXCEPTION 'Invalid demo attachment namespace.';END IF;
  INSERT INTO hr_demo_files(run_id,bucket,path) VALUES(p_run,f->>'bucket',f->>'path');
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'scenarios','[]')) LOOP
  uid=(item->>'actor')::uuid;eid=(item->>'employee')::uuid;rid=(item->>'id')::uuid;target=item->>'target';
  IF NOT EXISTS(SELECT 1 FROM hr_demo_rows WHERE run_id=p_run AND table_name='sys_users' AND row_key=jsonb_build_object('id',uid)) THEN RAISE EXCEPTION 'Scenario actors must belong to this demo.';END IF;
  IF NOT EXISTS(SELECT 1 FROM hr_demo_rows WHERE run_id=p_run AND table_name='Employees' AND row_key=jsonb_build_object('id',eid)) THEN RAISE EXCEPTION 'Scenario employees must belong to this demo.';END IF;
  IF item->>'kind'='document' THEN
   IF NOT EXISTS(SELECT 1 FROM hr_demo_rows WHERE run_id=p_run AND table_name='doc_approval_requests' AND row_key=jsonb_build_object('id',rid)) THEN RAISE EXCEPTION 'Document must belong to this demo.';END IF;
   IF target<>'pending' THEN PERFORM hr_sign_document((item->>'reviewer')::uuid,rid,'boss','APPROVE','DEMO SIGNATURE — NOT VALID');END IF;
   IF target='issued' THEN PERFORM hr_sign_document(uid,rid,'hr','APPROVE','DEMO SIGNATURE — NOT VALID');END IF;
   CONTINUE;
  ELSIF item->>'kind'='expense' THEN
   PERFORM hr_submit_expense_form(uid,rid,item->'input',coalesce(item->'documents','[]'));
  ELSIF item->>'kind'='leave' THEN
   q=hr_leave_quote(eid,(item->'input'->>'leave_type_id')::uuid,(item->'input'->>'start_date')::date,(item->'input'->>'end_date')::date,item->'input'->>'session');
   PERFORM hr_submit_leave_form(uid,rid,item->'input',q->>'fingerprint',NULL);
  ELSIF item->>'kind'='information' THEN
   rec=to_jsonb(hr_save_information(uid,NULL,0,item->'input',NULL,NULL));
   rid=(rec->>'id')::uuid;
   PERFORM hr_submit_information(uid,rid,(rec->>'version')::integer,item->>'signature');
  ELSIF item->>'kind'='probation' THEN
   rec=to_jsonb(hr_save_probation(uid,rid,eid,item->'input',0));
   rec=to_jsonb(hr_invite_probation(uid,rid,(p_payload->>'day')::date+3,(rec->>'version')::integer));
   IF target='invited' THEN CONTINUE;END IF;
   rec=to_jsonb(hr_respond_probation((item->>'subject_user')::uuid,rid,item->'self_response',(rec->>'version')::integer));
   PERFORM hr_submit_probation(uid,rid,(rec->>'version')::integer);
  ELSIF item->>'kind'='warning' THEN
   rec=to_jsonb(hr_save_warning(uid,rid,eid,item->'input',0));
   PERFORM hr_submit_warning(uid,rid,(rec->>'version')::integer);
  ELSE RAISE EXCEPTION 'Unsupported demo scenario.';END IF;
  LOOP
   SELECT * INTO a FROM hr_approval_requests WHERE resource_id=rid AND workflow_key=CASE WHEN item->>'kind'='information' THEN 'employee_information' ELSE item->>'kind' END;
   EXIT WHEN a.status<>'pending' OR target IN ('pending','pending_agm') OR (target='pending_ceo' AND a.current_stage=1);
   step=a.stages->a.current_stage;actor=(step->>'assignee_id')::uuid;
   IF item->>'kind'='expense' THEN
    EXIT WHEN step->>'action'='pay' AND target NOT IN ('paid','rejected');
    amt=(item->'input'->>'requested_amount')::numeric;
    PERFORM hr_decide_expense_form(actor,a.id,CASE WHEN target='rejected' THEN 'reject' WHEN step->>'action'='pay' THEN 'pay' WHEN target='conditions' AND a.current_stage=0 THEN 'approve_with_conditions' ELSE 'approve' END,'DEMO: fictional presentation decision',a.version,amt,'DEMO: attach final receipt before payment',jsonb_build_object('amount',amt::text,'currency',item->'input'->>'currency','date',p_payload->>'day','method','Cash','reference','DEMO-SETTLEMENT'));
   ELSIF item->>'kind'='leave' THEN
    PERFORM hr_decide_leave_form(actor,a.id,CASE WHEN target='rejected' THEN 'reject' ELSE 'approve' END,'DEMO: fictional leave decision',a.version,'');
   ELSIF item->>'kind'='information' THEN
    PERFORM hr_decide_information(actor,a.id,'approve','DEMO: fictional information review',a.version);
   ELSIF item->>'kind'='probation' THEN
    PERFORM hr_decide_probation(actor,a.id,'approve','DEMO: fictional evaluation',a.version,jsonb_build_object('outcome','confirmed','effective_date',p_payload->>'day','benefits_date',p_payload->>'day','late_reason','DEMO: historical evaluation for a presentation','employment_status_updated',false),'{}',jsonb_build_object('kind','no_change'));
   ELSE
    PERFORM hr_decide_warning(actor,a.id,'approve','DEMO: fictional warning review',a.version,jsonb_build_object('informed_date',p_payload->>'day','explanation_note','DEMO: fictional explanation and opportunity to respond','opportunity_confirmed',true,'delivery','portal'),jsonb_build_object('file_reference','DEMO-HR-FILE','review_date',p_payload->>'day','notes','DEMO: no real disciplinary record'));
   END IF;
  END LOOP;
  IF item->>'kind'='warning' AND target='issued' THEN
   SELECT version INTO ver FROM hr_warning_forms WHERE id=rid;
   PERFORM hr_respond_warning((item->>'subject_user')::uuid,rid,jsonb_build_object('comments','DEMO: sample employee receipt','acknowledged',true,'explained',true,'opportunity',true,'signature',item->>'signature'),ver);
  END IF;
  IF item->>'kind'='expense' AND target='paid' THEN PERFORM hr_record_expense_receipt(actor,gen_random_uuid(),rid,'DEMO-RECEIPT','Fictional presentation receipt','[]',coalesce(item->'documents','[]'));END IF;
 END LOOP;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'INSTALL_DEMO','Client demo','Fictional demo batch '||p_run||'; Owner credentials retained');
 SELECT jsonb_object_agg(table_name,n) INTO k FROM(SELECT table_name,count(*) n FROM hr_demo_rows WHERE run_id=p_run GROUP BY table_name)x;
 UPDATE hr_demo_runs SET state='active',summary=jsonb_build_object('run_id',p_run,'day',p_payload->>'day','counts',k,'seed_rows',cnt,'accounts',(SELECT count(*) FROM hr_demo_rows WHERE run_id=p_run AND table_name='sys_users')) WHERE id=p_run RETURNING * INTO batch;
 RETURN batch.summary;
END $$;
CREATE OR REPLACE FUNCTION public.hr_clear_client_demo(p_actor uuid,p_instance uuid,p_run uuid,p_apply boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE batch hr_demo_runs;t text;entry jsonb;old jsonb;v integer;remaining bigint;removed bigint;progress bigint;counts jsonb;files jsonb;has_reference boolean;BEGIN
 PERFORM pg_advisory_xact_lock(7319478);
 IF NOT EXISTS(SELECT 1 FROM sys_users WHERE id=p_actor AND is_owner AND is_active) OR NOT EXISTS(SELECT 1 FROM hr_instance WHERE id=p_instance AND purpose='lm-hr-fresh') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Owner access in the selected HR instance is required.';END IF;
 SELECT * INTO batch FROM hr_demo_runs WHERE id=p_run AND instance_id=p_instance FOR UPDATE;IF batch.id IS NULL THEN RAISE EXCEPTION 'Demo run not found in this instance.';END IF;
 SELECT jsonb_object_agg(table_name,n) INTO counts FROM(SELECT table_name,count(*) n FROM hr_demo_rows WHERE run_id=p_run GROUP BY table_name)x;
 SELECT coalesce(jsonb_agg(jsonb_build_object('bucket',bucket,'path',path)),'[]') INTO files FROM hr_demo_files WHERE run_id=p_run AND deleted_at IS NULL;
 IF NOT p_apply OR batch.state='cleared' THEN RETURN jsonb_build_object('run_id',p_run,'state',batch.state,'apply',false,'tracked_counts',counts,'files',files,'owners_preserved',true);END IF;
 IF batch.state<>'active' THEN RAISE EXCEPTION 'Demo setup has not completed.';END IF;
 IF EXISTS(SELECT 1 FROM sys_users u JOIN hr_demo_rows d ON d.run_id=p_run AND d.table_name='sys_users' AND d.row_key=jsonb_build_object('id',u.id) WHERE u.is_owner) THEN RAISE EXCEPTION 'A demo account was made an Owner. Resolve that account before clearing; every Owner is protected.';END IF;
 UPDATE hr_demo_runs SET state='cleared',cleared_at=now() WHERE id=p_run;
 -- Restore the saved configuration with fresh versions, so an old browser tab cannot overwrite it.
 FOR entry IN SELECT value FROM jsonb_array_elements(batch.before_settings->'workflows') LOOP
  SELECT coalesce((SELECT version FROM hr_workflow_settings WHERE workflow_key=entry->>'workflow_key'),0) INTO v;
  INSERT INTO hr_workflow_settings(workflow_key,enabled,stages,version,updated_by,updated_at) VALUES(entry->>'workflow_key',(entry->>'enabled')::boolean,entry->'stages',v+1,p_actor,now()) ON CONFLICT(workflow_key) DO UPDATE SET enabled=excluded.enabled,stages=excluded.stages,version=excluded.version,updated_by=p_actor,updated_at=now();
 END LOOP;
 old=batch.before_settings->'expense';SELECT version INTO v FROM hr_expense_routing WHERE id;
 -- Preserve original settings even if a formerly assigned account was later disabled.
 UPDATE hr_expense_routing SET mode=old->>'mode',limits=old->'limits',stages=old->'stages',version=v+1,updated_by=p_actor,updated_at=now() WHERE id;
 old=batch.before_settings->'calendar';UPDATE hr_leave_calendar SET settings=old->'settings',version=version+1,updated_by=p_actor,updated_at=now() WHERE id;
 DELETE FROM hr_leave_calendar_dates d WHERE EXISTS(SELECT 1 FROM hr_demo_rows r WHERE r.run_id=p_run AND r.table_name='hr_leave_calendar_dates' AND r.row_key=hr_demo_key('hr_leave_calendar_dates',to_jsonb(d)));
 INSERT INTO hr_leave_calendar_dates SELECT * FROM jsonb_populate_recordset(NULL::hr_leave_calendar_dates,coalesce(batch.before_settings->'calendar_dates','[]'));
 -- An Owner may have linked a presentation employee during the demonstration. Keep the account.
 UPDATE sys_users u SET employee_id=NULL WHERE u.is_owner AND EXISTS(SELECT 1 FROM hr_demo_rows d WHERE d.run_id=p_run AND d.table_name='Employees' AND d.row_key=jsonb_build_object('id',u.employee_id));
 -- Refuse to orphan retained pre-demo records, including the legacy schema's logical UUID links.
 FOR t IN SELECT c.relname FROM pg_trigger tr JOIN pg_class c ON c.oid=tr.tgrelid WHERE tr.tgname='hr_demo_write_fence' LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I r WHERE NOT EXISTS(SELECT 1 FROM hr_demo_rows d WHERE d.run_id=$1 AND d.table_name=$2 AND d.row_key=hr_demo_key($2,to_jsonb(r))) AND EXISTS(SELECT 1 FROM hr_demo_rows e CROSS JOIN LATERAL jsonb_each_text(e.row_key) k WHERE e.run_id=$1 AND k.value ~ ''^[0-9a-f-]{36}$'' AND to_jsonb(r)::text LIKE ''%%''||k.value||''%%'') OR NOT EXISTS(SELECT 1 FROM hr_demo_rows d WHERE d.run_id=$1 AND d.table_name=$2 AND d.row_key=hr_demo_key($2,to_jsonb(r))) AND EXISTS(SELECT 1 FROM hr_demo_files f WHERE f.run_id=$1 AND (position(lower(f.path) in lower(to_jsonb(r)::text))>0 OR position(lower(replace(f.path,''/'',''%%2F'')) in lower(to_jsonb(r)::text))>0)))',t) INTO has_reference USING p_run,t;
  IF has_reference THEN RAISE EXCEPTION 'Retained records in % reference demo data. Remove those links before clearing; no data was deleted.',t;END IF;
 END LOOP;
 UPDATE hr_demo_runs SET state='cleared',cleared_at=now() WHERE id=p_run;
 PERFORM set_config('hr.demo_cleanup',p_run::text,true);PERFORM set_config('hr.demo_actor',p_actor::text,true);
 -- FK-safe passes also handle information forms whose approval is linked after creation.
 LOOP
  progress=0;remaining=0;
  FOR t IN SELECT DISTINCT table_name FROM hr_demo_rows WHERE run_id=p_run LOOP
   BEGIN
    EXECUTE format('DELETE FROM public.%I r WHERE EXISTS(SELECT 1 FROM hr_demo_rows d WHERE d.run_id=$1 AND d.table_name=$2 AND d.row_key=hr_demo_key($2,to_jsonb(r)))',t) USING p_run,t;
    GET DIAGNOSTICS removed=ROW_COUNT;progress=progress+removed;
   EXCEPTION WHEN foreign_key_violation THEN remaining=remaining+1;
   END;
  END LOOP;
  EXIT WHEN remaining=0;
  IF progress=0 THEN RAISE EXCEPTION 'Retained records still reference demo records. Cleanup rolled back; resolve the references first.';END IF;
 END LOOP;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'CLEAR_DEMO','Client demo','Cleared fictional batch '||p_run||'; Owner accounts and pre-demo data retained');
 RETURN jsonb_build_object('run_id',p_run,'state','cleared','apply',true,'tracked_counts',counts,'files',files,'owners_preserved',true);
END $$;
REVOKE ALL ON FUNCTION public.hr_demo_track_storage() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_demo_track_storage() TO service_role;
REVOKE ALL ON FUNCTION public.hr_demo_key(text,jsonb),public.hr_demo_fence(),public.hr_demo_track(),public.hr_demo_cleanup_row(text,jsonb),public.hr_install_client_demo(uuid,uuid,uuid,jsonb),public.hr_clear_client_demo(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_demo_key(text,jsonb),public.hr_demo_fence(),public.hr_demo_track(),public.hr_demo_cleanup_row(text,jsonb),public.hr_install_client_demo(uuid,uuid,uuid,jsonb),public.hr_clear_client_demo(uuid,uuid,uuid,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
