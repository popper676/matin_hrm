-- Existing installations: fix calendar mutations without changing database safety settings.
-- Apply after 017. This changes function definitions only; it does not seed or clear data.
BEGIN;
DO $$ BEGIN IF to_regprocedure('public.hr_install_client_demo(uuid,uuid,uuid,jsonb)') IS NULL THEN RAISE EXCEPTION 'Apply migration 017 before 018.';END IF;END $$;
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
REVOKE ALL ON FUNCTION public.hr_install_client_demo(uuid,uuid,uuid,jsonb),public.hr_save_leave_calendar(uuid,integer,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_install_client_demo(uuid,uuid,uuid,jsonb),public.hr_save_leave_calendar(uuid,integer,jsonb,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
