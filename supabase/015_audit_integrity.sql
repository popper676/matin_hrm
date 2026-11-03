-- Additive after 014 in the existing HR project. No paid payroll or history is recalculated.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payrolls' AND column_name='salary_template') THEN RAISE EXCEPTION 'Apply migrations through 014 first';END IF;
END $$;



ALTER TABLE public.daily_sops ADD COLUMN IF NOT EXISTS manual_report text NOT NULL DEFAULT '';
ALTER TABLE public.daily_sops ALTER COLUMN assigned_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Bangkok')::date);
UPDATE public.daily_sops SET assigned_date=(created_at AT TIME ZONE 'Asia/Bangkok')::date WHERE assigned_date IS NULL;
UPDATE public.exit_interviews e SET employee_id=o.employee_id FROM public.corporate_offboarding o WHERE o.id=e.offboarding_id AND e.employee_id IS NULL;
CREATE OR REPLACE FUNCTION public.hr_exit_interview_employee() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE subject uuid; BEGIN
 SELECT employee_id INTO subject FROM corporate_offboarding WHERE id=NEW.offboarding_id;
 IF subject IS NULL OR (NEW.employee_id IS NOT NULL AND NEW.employee_id<>subject) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Exit interview must match its offboarding employee.';END IF;
 NEW.employee_id=subject;RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hr_exit_employee ON public.exit_interviews;
CREATE TRIGGER hr_exit_employee BEFORE INSERT OR UPDATE ON public.exit_interviews FOR EACH ROW EXECUTE FUNCTION public.hr_exit_interview_employee();

-- Detect both foreign-key references and legacy UUID employee associations.
CREATE OR REPLACE FUNCTION public.hr_delete_pristine_employee(p_actor uuid,p_employee uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; linked boolean; BEGIN
 IF NOT EXISTS(SELECT 1 FROM sys_users WHERE id=p_actor AND is_active AND is_owner) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Owner access required'; END IF;
 PERFORM 1 FROM "Employees" WHERE id=p_employee FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;
 IF EXISTS(SELECT 1 FROM sys_users WHERE employee_id=p_employee AND is_owner) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='The owner employee record cannot be removed.'; END IF;
 FOR r IN
  SELECT DISTINCT n.nspname,c.relname,a.attname FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
  WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped AND c.relname<>'sys_users'
  AND (EXISTS(SELECT 1 FROM pg_constraint f WHERE f.contype='f' AND f.conrelid=c.oid AND f.confrelid='public."Employees"'::regclass AND a.attnum=ANY(f.conkey))
    OR a.atttypid='uuid'::regtype AND a.attname IN ('employee_id','outgoing_employee_id','successor_employee_id','assigned_to_id','nominee_id','voter_id'))
 LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I=$1)',r.nspname,r.relname,r.attname) INTO linked USING p_employee;
  IF linked THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Employee has retained HR history or assignments. Use deactivate instead.';END IF;
 END LOOP;
 DELETE FROM sys_users WHERE employee_id=p_employee;DELETE FROM "Employees" WHERE id=p_employee;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'DELETE_PRISTINE','Employees','Removed unused employee '||p_employee);RETURN true;
END $$;

-- No terminal handover, evidence or acknowledgment can be silently rewritten.
ALTER TABLE public.employee_handovers ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
CREATE OR REPLACE FUNCTION public.hr_guard_handover() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF OLD.status IN ('completed','waived','cancelled') AND (TG_OP='DELETE' OR NEW IS DISTINCT FROM OLD) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Completed handover history is read-only.';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 NEW.version=OLD.version+1;NEW.updated_at=now();
 IF NEW.successor_employee_id IS DISTINCT FROM OLD.successor_employee_id THEN
  UPDATE handover_items SET successor_acknowledged=false,successor_ack_at=NULL WHERE handover_id=OLD.id;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hr_handover_guard ON public.employee_handovers;
CREATE TRIGGER hr_handover_guard BEFORE UPDATE OR DELETE ON public.employee_handovers FOR EACH ROW EXECUTE FUNCTION public.hr_guard_handover();
CREATE OR REPLACE FUNCTION public.hr_guard_handover_child() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE h employee_handovers; reference uuid; content_changed boolean=false; BEGIN
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
END $$;
DROP TRIGGER IF EXISTS hr_handover_items_guard ON public.handover_items;
CREATE TRIGGER hr_handover_items_guard BEFORE INSERT OR UPDATE OR DELETE ON public.handover_items FOR EACH ROW EXECUTE FUNCTION public.hr_guard_handover_child();
DROP TRIGGER IF EXISTS hr_handover_attachments_guard ON public.handover_attachments;
CREATE TRIGGER hr_handover_attachments_guard BEFORE INSERT OR UPDATE OR DELETE ON public.handover_attachments FOR EACH ROW EXECUTE FUNCTION public.hr_guard_handover_child();
CREATE OR REPLACE FUNCTION public.hr_decide_handover(p_actor uuid,p_id uuid,p_version integer,p_decision text,p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h employee_handovers; BEGIN
 SELECT * INTO h FROM employee_handovers WHERE id=p_id FOR UPDATE;
 IF h.id IS NULL OR NOT hr_integrity_can(p_actor,'handovers','approve',h.outgoing_employee_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scoped handover approval permission required.';END IF;
 IF p_version IS NULL OR h.version<>p_version OR h.status IN ('completed','waived','cancelled') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Handover changed or is already complete. Reload before continuing.';END IF;
 PERFORM 1 FROM handover_items WHERE handover_id=h.id FOR UPDATE;
 IF p_decision='approve' THEN
  IF h.status<>'pending_review' OR NOT EXISTS(SELECT 1 FROM handover_items WHERE handover_id=h.id)
    OR EXISTS(SELECT 1 FROM handover_items WHERE handover_id=h.id AND is_required IS DISTINCT FROM false AND coalesce(status,'') NOT IN ('done','not_applicable')) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Submit every required handover item before approval.';END IF;
  IF h.successor_employee_id IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM handover_items WHERE handover_id=h.id AND status IN ('done','not_applicable')) OR EXISTS(SELECT 1 FROM handover_items WHERE handover_id=h.id AND status IN ('done','not_applicable') AND successor_acknowledged IS DISTINCT FROM true)) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='The successor must acknowledge the current handover items.';END IF;
  UPDATE employee_handovers SET status='completed',completion_pct=100,approved_by_user_id=p_actor,approved_at=now() WHERE id=h.id;
 ELSIF p_decision='waive' AND length(trim(p_reason)) BETWEEN 1 AND 4000 THEN
  UPDATE employee_handovers SET status='waived',waived_by_user_id=p_actor,waived_at=now(),waived_reason=trim(p_reason) WHERE id=h.id;
 ELSE RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Choose approval or enter a waiver reason.';END IF;
 IF h.offboarding_id IS NOT NULL THEN
  UPDATE corporate_offboarding SET knowledge_transfer=true,handover_required=CASE WHEN p_decision='waive' THEN false ELSE handover_required END,
   handover_waived_reason=CASE WHEN p_decision='waive' THEN trim(p_reason) ELSE handover_waived_reason END,handover_waived_by=CASE WHEN p_decision='waive' THEN p_actor ELSE handover_waived_by END,updated_at=now() WHERE id=h.offboarding_id;
  UPDATE offboarding_case_tasks SET status='Completed',completed_at=now() WHERE offboarding_id=h.offboarding_id AND (category='Knowledge Transfer' OR task_name LIKE '%Knowledge Transfer%' OR task_name LIKE '%Handover%');
 END IF;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,upper(p_decision),'Handover','Handover '||h.id||' version '||h.version);
 RETURN (SELECT to_jsonb(r) FROM employee_handovers r WHERE id=h.id);
END $$;

CREATE OR REPLACE FUNCTION public.hr_guard_document_delete() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='employee_documents' THEN
  IF OLD.status='COMPLETED_AND_ISSUED' OR EXISTS(SELECT 1 FROM doc_approval_requests WHERE issued_document_id=OLD.id OR legacy_document_id=OLD.id OR file_url=OLD.file_url) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Retain documents referenced by approval or issued history.';END IF;
 ELSE
  IF OLD.issued_document_id IS NOT NULL OR jsonb_array_length(OLD.approval_history)>0 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Retain reviewed and issued document history.';END IF;
 END IF;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS hr_vault_delete_guard ON public.employee_documents;
CREATE TRIGGER hr_vault_delete_guard BEFORE DELETE ON public.employee_documents FOR EACH ROW EXECUTE FUNCTION public.hr_guard_document_delete();
DROP TRIGGER IF EXISTS hr_document_request_delete_guard ON public.doc_approval_requests;
CREATE TRIGGER hr_document_request_delete_guard BEFORE DELETE ON public.doc_approval_requests FOR EACH ROW EXECUTE FUNCTION public.hr_guard_document_delete();

-- A payment changes state only; it never derives new monetary amounts.
CREATE OR REPLACE FUNCTION public.hr_pay_legacy_payroll(p_actor uuid,p_id uuid,p_expected timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r payrolls; BEGIN
 SELECT * INTO r FROM payrolls WHERE id=p_id FOR UPDATE;
 IF r.id IS NULL OR NOT hr_integrity_can(p_actor,'payroll','pay',r.employee_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Payroll Pay and employee scope are required.';END IF;
 IF r.salary_template IS NOT NULL OR r.payment_status<>'Pending' OR r.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Payroll changed or is paid. Reload before recording payment.';END IF;
 UPDATE payrolls SET payment_status='Paid',updated_at=now() WHERE id=r.id RETURNING * INTO r;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'PAY_LEGACY_PAYROLL','Payroll','Recorded paid salary '||r.id);RETURN to_jsonb(r);
END $$;
CREATE OR REPLACE FUNCTION public.hr_apply_payroll_workspace(p_actor uuid,p_employee uuid,p_month text,p_expected timestamptz,p_data jsonb,p_audit jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r payrolls; existed boolean; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('salary-template:'||p_employee||':'||p_month,0));
 SELECT * INTO r FROM payrolls WHERE employee_id=p_employee AND month=p_month FOR UPDATE;existed=r.id IS NOT NULL;
 IF NOT hr_integrity_can(p_actor,'payroll',CASE WHEN existed THEN 'edit' ELSE 'create' END,p_employee) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Payroll Create is required for a new salary; Edit for an existing salary.';END IF;
 IF existed AND (r.salary_template IS NOT NULL OR r.payment_status='Paid' OR r.updated_at IS DISTINCT FROM p_expected) OR NOT existed AND p_expected IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Payroll changed or is paid. Reload before applying.';END IF;
 IF p_month!~'^[0-9]{4}-(0[1-9]|1[0-2])$' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k<>ALL(ARRAY['basic_salary','allowances','deductions','bonus','net_salary','notes','workspace_notes'])) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid workspace result.';END IF;
 IF (p_data->>'basic_salary')::numeric<0 OR (p_data->>'net_salary')::numeric<0 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Salary amounts cannot be negative.';END IF;
 IF existed THEN
  UPDATE payrolls SET basic_salary=(p_data->>'basic_salary')::numeric,allowances=(p_data->>'allowances')::numeric,deductions=(p_data->>'deductions')::numeric,bonus=(p_data->>'bonus')::numeric,net_salary=(p_data->>'net_salary')::numeric,notes=p_data->>'notes',workspace_notes=p_data->>'workspace_notes',calculation_source='workspace',updated_at=now() WHERE id=r.id RETURNING * INTO r;
 ELSE
  INSERT INTO payrolls(employee_id,month,basic_salary,allowances,deductions,bonus,net_salary,notes,workspace_notes,calculation_source,payment_status)
  VALUES(p_employee,p_month,(p_data->>'basic_salary')::numeric,(p_data->>'allowances')::numeric,(p_data->>'deductions')::numeric,(p_data->>'bonus')::numeric,(p_data->>'net_salary')::numeric,p_data->>'notes',p_data->>'workspace_notes','workspace','Pending') RETURNING * INTO r;
 END IF;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'WORKSPACE_APPLY','Payroll Workspace',(p_audit||jsonb_build_object('employee_id',p_employee,'month',p_month,'payroll_id',r.id,'action',CASE WHEN existed THEN 'updated' ELSE 'created' END))::text);
 RETURN jsonb_build_object('payroll',to_jsonb(r),'action',CASE WHEN existed THEN 'updated' ELSE 'created' END);
END $$;

-- A failing account insert rolls back the employee and timeline for that import row.
CREATE OR REPLACE FUNCTION public.hr_import_employee(p_actor uuid,p_code text,p_name text,p_salary numeric,p_email text,p_phone text,p_password_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e "Employees"; username text=lower(trim(p_code)); BEGIN
 IF NOT EXISTS(SELECT 1 FROM sys_users WHERE id=p_actor AND is_active AND is_owner) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Owner access required for import.';END IF;
 IF length(trim(p_code)) NOT BETWEEN 1 AND 100 OR length(trim(p_name)) NOT BETWEEN 2 AND 200 OR p_salary<0 OR p_salary>100000000 OR p_password_hash NOT LIKE 'MUST_CHANGE:$2%' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid employee import row.';END IF;
 INSERT INTO "Employees"(employee_id,"Full_name",salary,email,phone) VALUES(trim(p_code),trim(p_name),p_salary,NULLIF(p_email,''),NULLIF(p_phone,'')) RETURNING * INTO e;
 INSERT INTO sys_users(username,password_hash,role,employee_id,full_name) VALUES(username,p_password_hash,'employee',e.id,e."Full_name");
 INSERT INTO employee_career_timeline(employee_id,event_type,title,description,new_salary,effective_date) VALUES(e.id,'HIRED','Joined Company','Employee account provisioned by import',e.salary,(now() AT TIME ZONE 'Asia/Bangkok')::date);
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'IMPORT','Employees','Created employee and account '||e.id);
 RETURN jsonb_build_object('employee',to_jsonb(e),'username',username);
END $$;

CREATE OR REPLACE FUNCTION public.hr_update_import_employee(p_actor uuid,p_id uuid,p_code text,p_name text,p_salary numeric,p_email text,p_phone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old "Employees";e "Employees";BEGIN
 IF NOT EXISTS(SELECT 1 FROM sys_users WHERE id=p_actor AND is_active AND is_owner) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Owner access required for import.';END IF;
 SELECT * INTO old FROM "Employees" WHERE id=p_id AND deleted_at IS NULL FOR UPDATE;
 IF old.id IS NULL OR length(trim(p_code)) NOT BETWEEN 1 AND 100 OR length(trim(p_name)) NOT BETWEEN 2 AND 200 OR p_salary<0 OR p_salary>100000000 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid employee import row.';END IF;
 UPDATE "Employees" SET employee_id=trim(p_code),"Full_name"=trim(p_name),salary=coalesce(p_salary,old.salary),email=coalesce(nullif(p_email,''),old.email),phone=coalesce(nullif(p_phone,''),old.phone),updated_at=now() WHERE id=p_id RETURNING * INTO e;
 IF old.employee_id IS DISTINCT FROM e.employee_id THEN UPDATE sys_users SET username=lower(e.employee_id) WHERE employee_id=e.id;END IF;
 IF old.salary IS DISTINCT FROM e.salary THEN
  INSERT INTO employee_career_timeline(employee_id,event_type,title,description,previous_salary,new_salary,effective_date) VALUES(e.id,'SALARY_CHANGE','Salary updated','Salary changed by bulk import',old.salary,e.salary,(now() AT TIME ZONE 'Asia/Bangkok')::date);
 END IF;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'IMPORT_UPDATE','Employees','Updated employee '||e.id);RETURN to_jsonb(e);
END $$;

-- Case, checklist, handover and notification creation share one transaction.
CREATE OR REPLACE FUNCTION public.hr_create_lifecycle(p_actor uuid,p_kind text,p_data jsonb,p_items jsonb DEFAULT '[]')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE emp uuid=(p_data->>'employee_id')::uuid; o employee_onboarding; x corporate_offboarding; h employee_handovers; anchor date; BEGIN
 IF p_kind NOT IN ('onboarding','offboarding') OR NOT hr_integrity_can(p_actor,p_kind,'create',emp) OR NOT EXISTS(SELECT 1 FROM "Employees" WHERE id=emp AND deleted_at IS NULL) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scoped lifecycle Create access is required.';END IF;
 IF p_kind='onboarding' THEN
  anchor=coalesce(nullif(p_data->>'start_date','')::date,(now() AT TIME ZONE 'Asia/Bangkok')::date);
  IF coalesce(p_data->>'status','Pre-boarding') NOT IN ('Pre-boarding','In Progress','Completed') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid onboarding status.';END IF;
  INSERT INTO employee_onboarding(employee_id,status,start_date,notes) VALUES(emp,coalesce(p_data->>'status','Pre-boarding'),anchor,p_data->>'notes') RETURNING * INTO o;
  INSERT INTO onboarding_assignments(onboarding_id,task_id,status,due_date) SELECT o.id,id,'Pending',anchor+coalesce(due_days_after_hire,1) FROM onboarding_tasks;
  INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'CREATE','Onboarding','Created case and checklist '||o.id);RETURN to_jsonb(o);
 END IF;
 anchor=coalesce(nullif(p_data->>'last_working_day',''),nullif(p_data->>'last_working_date',''))::date;
 INSERT INTO corporate_offboarding(employee_id,last_working_date,termination_reason,exit_type,resignation_date,settlement_status) VALUES(emp,anchor,coalesce(p_data->>'reason',p_data->>'termination_reason'),p_data->>'exit_type',nullif(p_data->>'resignation_date','')::date,'Hold') RETURNING * INTO x;
 INSERT INTO offboarding_case_tasks(offboarding_id,task_name,category,responsible,status,due_date)
 SELECT x.id,t.name,t.category,t.responsible,'Pending',anchor FROM (VALUES
 ('Return Laptop & Equipment','IT','IT'),('Revoke All System Access','IT','IT'),('Return Access Card & Keys','Facilities','Facilities'),('Sign NDA Exit Confirmation','Legal','HR'),('Complete Knowledge Transfer Doc','Knowledge Transfer','Manager'),('Handover Projects & Tasks','Knowledge Transfer','Manager'),('Clear Outstanding Expenses','Finance','Finance'),('Final Payroll Calculation','Finance','Finance'),('Return Company Documents','HR','HR'),('Schedule Exit Interview','HR','HR'))t(name,category,responsible);
 INSERT INTO employee_handovers(outgoing_employee_id,trigger_type,offboarding_id,effective_date,handover_deadline,status,successor_type,created_by_user_id) VALUES(emp,'exit',x.id,anchor,CASE WHEN anchor IS NOT NULL THEN greatest(anchor-3,(now() AT TIME ZONE 'Asia/Bangkok')::date) ELSE NULL END,'pending_successor','existing',p_actor) RETURNING * INTO h;
 IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Default handover items are required.';END IF;
 INSERT INTO handover_items(handover_id,title,category,owner_role,sort_order,is_required,status) SELECT h.id,v->>'title',v->>'category',v->>'owner_role',(v->>'sort_order')::integer,(v->>'is_required')::boolean,'pending' FROM jsonb_array_elements(p_items)v;
 UPDATE corporate_offboarding SET handover_id=h.id,handover_required=true WHERE id=x.id RETURNING * INTO x;
 INSERT INTO system_notifications(recipient_user_id,title,message,link_url) SELECT id,'Offboarding started — complete handover','Please complete your employee handover checklist before your last working day.','/portal/handover/outgoing' FROM sys_users WHERE employee_id=emp AND is_active;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'CREATE','Offboarding','Created case, checklist and handover '||x.id);RETURN to_jsonb(x);
END $$;

CREATE OR REPLACE FUNCTION public.hr_leave_workday(p_employee uuid,p_date date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE e "Employees"; daily employee_daily_schedules; roster employee_rosters; special hr_leave_calendar_dates; cfg jsonb; working boolean; shift_id uuid; sh shifts; source text; st time; en time; starts timestamp; ends timestamp;
BEGIN
 SELECT * INTO e FROM "Employees" WHERE id=p_employee AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee record is unavailable'; END IF;
 SELECT settings INTO cfg FROM hr_leave_calendar WHERE id;
 SELECT * INTO daily FROM employee_daily_schedules WHERE employee_id=p_employee AND schedule_date=p_date ORDER BY updated_at DESC,id DESC LIMIT 1;
 SELECT * INTO special FROM hr_leave_calendar_dates WHERE work_date=p_date;
 SELECT * INTO roster FROM employee_rosters WHERE employee_id=p_employee AND (day_of_week IS NULL OR day_of_week=extract(dow FROM p_date)::integer) AND (start_date IS NULL OR start_date<=p_date) AND (end_date IS NULL OR end_date>=p_date) ORDER BY updated_at DESC,id DESC LIMIT 1;
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

CREATE OR REPLACE FUNCTION public.hr_submit_peer_vote(p_actor uuid,p_nominee uuid,p_score integer,p_comment text DEFAULT NULL)
RETURNS public.peer_voting_records LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor sys_users; result peer_voting_records; month_start timestamptz; month_end timestamptz;
BEGIN
 SELECT * INTO actor FROM sys_users WHERE id=p_actor AND is_active;
 IF actor.id IS NULL OR actor.employee_id IS NULL OR (NOT actor.is_owner AND EXISTS(SELECT 1 FROM hr_access_policies WHERE user_id=p_actor AND NOT coalesce(policy->'personal','[]') ? 'voting'))
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Personal peer voting permission and an employee profile are required'; END IF;
 IF actor.employee_id=p_nominee OR p_score IS NULL OR p_score NOT BETWEEN 1 AND 5 OR length(coalesce(p_comment,''))>2000
 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Choose another employee and valid scores from 1 to 5'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "Employees" WHERE id=p_nominee AND status='Active' AND deleted_at IS NULL)
 THEN RAISE EXCEPTION USING ERRCODE='23503',MESSAGE='Active colleague not found'; END IF;
 month_start=date_trunc('month',now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok';
 month_end=(date_trunc('month',now() AT TIME ZONE 'Asia/Bangkok')+interval '1 month') AT TIME ZONE 'Asia/Bangkok';
 PERFORM pg_advisory_xact_lock(hashtextextended(actor.employee_id::text||':'||p_nominee::text||':'||month_start::text,0));
 IF EXISTS(SELECT 1 FROM peer_voting_records WHERE voter_id=actor.employee_id AND nominee_id=p_nominee AND created_at>=month_start AND created_at<month_end)
 THEN RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='You have already voted for this colleague this Bangkok month'; END IF;
 INSERT INTO peer_voting_records(voter_id,nominee_id,score,comment) VALUES(actor.employee_id,p_nominee,p_score,nullif(p_comment,'')) RETURNING * INTO result;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.hr_scan_qr(p_actor uuid,p_token text,p_open uuid,p_late boolean,p_ot numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE qr qr_attendance_tokens; actor sys_users; open_row attendance_records; latest attendance_records; result attendance_records; pol jsonb; action text; BEGIN
 SELECT * INTO actor FROM sys_users WHERE id=p_actor AND is_active;
 SELECT policy INTO pol FROM hr_access_policies WHERE user_id=p_actor;
 SELECT * INTO qr FROM qr_attendance_tokens WHERE token=p_token FOR UPDATE;
 IF actor.id IS NULL OR qr.id IS NULL OR actor.employee_id IS DISTINCT FROM qr.employee_id OR (NOT actor.is_owner AND pol IS NOT NULL AND NOT coalesce(pol->'personal','[]') ? 'checkin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Scan only your own employee QR with Check-in access.';END IF;
 IF qr.used OR qr.expires_at IS NULL OR qr.expires_at<=now() THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='QR token expired or was already used.';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('attendance:'||qr.employee_id,0));
 SELECT * INTO open_row FROM attendance_records WHERE employee_id=qr.employee_id AND check_in IS NOT NULL AND check_out IS NULL ORDER BY check_in DESC LIMIT 1 FOR UPDATE;
 SELECT * INTO latest FROM attendance_records WHERE employee_id=qr.employee_id AND check_in IS NOT NULL ORDER BY check_in DESC LIMIT 1;
 IF open_row.id IS NOT NULL AND (now()-open_row.check_in>interval '36 hours' OR open_row.check_in>now()) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='An earlier attendance is open. Ask a manager to correct it.';END IF;
 IF latest.id IS NOT NULL AND now()-coalesce(latest.check_out,latest.check_in)<interval '2 minutes' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Please wait at least 2 minutes between scans to prevent duplicates.';END IF;
 IF open_row.id IS DISTINCT FROM p_open THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Attendance changed. Refresh and scan again.';END IF;
 IF open_row.id IS NULL THEN
  INSERT INTO attendance_records(employee_id,check_in,attendance_method,is_late) VALUES(qr.employee_id,now(),'QR',coalesce(p_late,false)) RETURNING * INTO result;action='check-in';
 ELSE
  IF p_ot IS NULL OR p_ot<0 OR p_ot>36 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid overtime calculation.';END IF;
  UPDATE attendance_records SET check_out=now(),overtime_hours=p_ot WHERE id=open_row.id RETURNING * INTO result;action='check-out';
 END IF;
 UPDATE qr_attendance_tokens SET used=true WHERE id=qr.id;
 RETURN jsonb_build_object('employee_id',qr.employee_id,'action',action,'record',to_jsonb(result));
END $$;

CREATE TABLE IF NOT EXISTS public.hr_birthday_deliveries (
 employee_id uuid NOT NULL,recipient_user_id uuid NOT NULL REFERENCES public.sys_users(id) ON DELETE CASCADE,
 occurrence date NOT NULL,reminder_day date NOT NULL,notification_id uuid REFERENCES public.system_notifications(id) ON DELETE SET NULL,
 PRIMARY KEY(employee_id,recipient_user_id,occurrence,reminder_day)
);
ALTER TABLE public.hr_birthday_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_birthday_deliveries FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.hr_birthday_deliveries TO service_role;
CREATE OR REPLACE FUNCTION public.hr_notify_birthday(p_employee uuid,p_occurrence date,p_day date,p_title text,p_message text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE recipient sys_users; notification uuid; claim uuid; delivered integer=0; BEGIN
 IF p_occurrence-p_day NOT BETWEEN 0 AND 3 OR NOT EXISTS(SELECT 1 FROM "Employees" WHERE id=p_employee AND status='Active' AND deleted_at IS NULL) THEN RETURN 0;END IF;
 FOR recipient IN SELECT * FROM sys_users WHERE is_active AND employee_id IS DISTINCT FROM p_employee LOOP
  claim=NULL;
  INSERT INTO hr_birthday_deliveries(employee_id,recipient_user_id,occurrence,reminder_day) VALUES(p_employee,recipient.id,p_occurrence,p_day) ON CONFLICT DO NOTHING RETURNING recipient_user_id INTO claim;
  IF claim IS NOT NULL THEN
   INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES(recipient.id,p_title,p_message,'/portal') RETURNING id INTO notification;
   UPDATE hr_birthday_deliveries SET notification_id=notification WHERE employee_id=p_employee AND recipient_user_id=recipient.id AND occurrence=p_occurrence AND reminder_day=p_day;delivered=delivered+1;
  END IF;
 END LOOP;RETURN delivered;
END $$;
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('hr_exit_interview_employee','hr_guard_handover','hr_guard_handover_child','hr_decide_handover','hr_guard_document_delete','hr_pay_legacy_payroll','hr_apply_payroll_workspace','hr_import_employee','hr_update_import_employee','hr_create_lifecycle','hr_scan_qr','hr_notify_birthday') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
