-- Existing HR project: apply AFTER 009. New catalogs are configuration, not imported employee records.
BEGIN;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.hr_instance WHERE purpose='lm-hr-fresh') OR to_regprocedure('public.hr_decide_warning(uuid,uuid,text,text,integer,jsonb,jsonb)') IS NULL THEN RAISE EXCEPTION 'Existing HR instance with migration 009 required';END IF;END $$;
CREATE TABLE IF NOT EXISTS public.hr_business_units(
 key text PRIMARY KEY CHECK(key ~ '^[A-Z][A-Z0-9_]{1,31}$'),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),name_my text NOT NULL DEFAULT '',color text NOT NULL DEFAULT '#dd123d',is_active boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1,updated_by uuid REFERENCES public.sys_users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.hr_business_units(key,name) VALUES('UYF','UYF'),('AI_AUTONO','AI Autono'),('WISE_INVEST','Wise Invest'),('BBD','Busy Boss Diet (BBD)'),('LM_HOSTEL','LM Hostel') ON CONFLICT(key) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.hr_employee_business_sets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),employee_id uuid NOT NULL REFERENCES public."Employees"(id),effective_from date NOT NULL,items jsonb NOT NULL DEFAULT '[]',note text NOT NULL DEFAULT '',version integer NOT NULL,created_by uuid NOT NULL REFERENCES public.sys_users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(employee_id,version)
);
CREATE INDEX IF NOT EXISTS hr_business_employee_date_idx ON public.hr_employee_business_sets(employee_id,effective_from DESC,version DESC);
CREATE TABLE IF NOT EXISTS public.hr_operations_settings(id boolean PRIMARY KEY DEFAULT true CHECK(id),settings jsonb NOT NULL,version integer NOT NULL DEFAULT 1,updated_by uuid REFERENCES public.sys_users(id),updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.hr_operations_settings(id,settings) VALUES(true,'{"enabled":false,"due_soon_days":7,"expiry_lead_days":30,"approval_after_days":2,"repeat_days":3}') ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.hr_reminder_deliveries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),recipient_user_id uuid NOT NULL REFERENCES public.sys_users(id),source_key text NOT NULL,bucket date NOT NULL,context jsonb NOT NULL,notification_id uuid UNIQUE REFERENCES public.system_notifications(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(recipient_user_id,source_key,bucket)
);
CREATE TABLE IF NOT EXISTS public.hr_reminder_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),status text NOT NULL,delivered integer NOT NULL DEFAULT 0,skipped integer NOT NULL DEFAULT 0,failed integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.hr_expense_receipts(
 id uuid PRIMARY KEY,expense_id uuid NOT NULL REFERENCES public.rewards_and_claims(id),created_by uuid NOT NULL REFERENCES public.sys_users(id),reference text NOT NULL DEFAULT '',notes text NOT NULL DEFAULT '',existing_document_ids jsonb NOT NULL DEFAULT '[]',documents jsonb NOT NULL DEFAULT '[]',created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['hr_business_units','hr_employee_business_sets','hr_operations_settings','hr_reminder_deliveries','hr_reminder_runs','hr_expense_receipts'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);EXECUTE format('GRANT ALL ON public.%I TO service_role',t);END LOOP;END $$;
CREATE OR REPLACE FUNCTION public.hr_operations_can(p_actor uuid,p_employee uuid,p_module text,p_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE((SELECT u.is_active AND (u.is_owner OR ((p.policy->'modules'->p_module) ? p_action AND (p.policy->>'scope'='all' OR (p.policy->>'scope'='own' AND u.employee_id=p_employee) OR (p.policy->>'scope'='selected' AND (p.policy->'employee_ids') ? p_employee::text)))) FROM sys_users u LEFT JOIN hr_access_policies p ON p.user_id=u.id WHERE u.id=p_actor),false)
$$;
CREATE OR REPLACE FUNCTION public.hr_guard_operations_history() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN IF TG_OP<>'INSERT' OR current_setting('hr.operations_write',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Use the HR operations workflow; history is retained';END IF;RETURN NEW;END $$;
DROP TRIGGER IF EXISTS guard_business_sets ON public.hr_employee_business_sets;
CREATE TRIGGER guard_business_sets BEFORE INSERT OR UPDATE OR DELETE ON public.hr_employee_business_sets FOR EACH ROW EXECUTE FUNCTION public.hr_guard_operations_history();
DROP TRIGGER IF EXISTS guard_expense_receipts ON public.hr_expense_receipts;
CREATE TRIGGER guard_expense_receipts BEFORE INSERT OR UPDATE OR DELETE ON public.hr_expense_receipts FOR EACH ROW EXECUTE FUNCTION public.hr_guard_operations_history();
CREATE OR REPLACE FUNCTION public.hr_save_business_unit(p_actor uuid,p_data jsonb,p_version integer) RETURNS public.hr_business_units LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_business_units;k text=p_data->>'key';BEGIN
 IF NOT EXISTS(SELECT 1 FROM sys_users WHERE id=p_actor AND is_owner AND is_active) THEN RAISE EXCEPTION 'Owner permission required';END IF;
 IF k IS NULL OR k !~ '^[A-Z][A-Z0-9_]{1,31}$' OR length(trim(COALESCE(p_data->>'name','')))=0 OR length(p_data->>'name')>80 OR length(COALESCE(p_data->>'name_my',''))>120 OR COALESCE(p_data->>'color','') !~ '^#[0-9a-fA-F]{6}$' OR jsonb_typeof(p_data->'is_active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid business details';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('business:'||k));SELECT * INTO r FROM hr_business_units WHERE key=k FOR UPDATE;
 IF COALESCE(r.version,0)<>p_version THEN RAISE EXCEPTION 'Business changed. Reload before saving';END IF;
 INSERT INTO hr_business_units(key,name,name_my,color,is_active,updated_by) VALUES(k,trim(p_data->>'name'),COALESCE(p_data->>'name_my',''),p_data->>'color',(p_data->>'is_active')::boolean,p_actor) ON CONFLICT(key) DO UPDATE SET name=EXCLUDED.name,name_my=EXCLUDED.name_my,color=EXCLUDED.color,is_active=EXCLUDED.is_active,version=hr_business_units.version+1,updated_by=p_actor,updated_at=now() RETURNING * INTO r;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'SAVE','Business setup',k||' version '||r.version);RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.hr_save_business_assignments(p_actor uuid,p_employee uuid,p_effective date,p_items jsonb,p_note text,p_version integer) RETURNS public.hr_employee_business_sets LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_employee_business_sets;u sys_users;pol jsonb;v jsonb;latest integer;n integer=0;total numeric=0;allocated integer=0;keys text[]='{}';today date=(now() AT TIME ZONE 'Asia/Bangkok')::date;
BEGIN
 SELECT * INTO u FROM sys_users WHERE id=p_actor AND is_active;SELECT policy INTO pol FROM hr_access_policies WHERE user_id=p_actor;
 IF u.id IS NULL OR NOT hr_operations_can(p_actor,p_employee,'employees','edit') THEN RAISE EXCEPTION 'Scoped Employees edit permission required';END IF;
 PERFORM 1 FROM "Employees" WHERE id=p_employee AND deleted_at IS NULL FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found';END IF;
 SELECT COALESCE(max(version),0) INTO latest FROM hr_employee_business_sets WHERE employee_id=p_employee;IF latest<>p_version THEN RAISE EXCEPTION 'Business assignments changed. Reload before saving';END IF;
 IF p_effective IS NULL OR length(COALESCE(p_note,''))>2000 OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)>20 THEN RAISE EXCEPTION 'Invalid business assignments';END IF;
 IF p_effective<today AND (NOT u.is_owner OR length(trim(COALESCE(p_note,'')))=0) THEN RAISE EXCEPTION 'Only Owner may backdate assignments, with a reason';END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF COALESCE(v->>'business_key','')=ANY(keys) OR NOT EXISTS(SELECT 1 FROM hr_business_units WHERE key=v->>'business_key' AND (is_active OR EXISTS(SELECT 1 FROM hr_employee_business_sets b WHERE b.employee_id=p_employee AND b.items @> jsonb_build_array(jsonb_build_object('business_key',v->>'business_key'))))) OR length(COALESCE(v->>'role',''))>120 THEN RAISE EXCEPTION 'Choose valid nonduplicate businesses';END IF;
  keys=array_append(keys,v->>'business_key');n=n+1;
  IF v->>'allocation_percent' IS NOT NULL THEN
   IF COALESCE(v->>'allocation_percent','') !~ '^\d{1,3}(\.\d{1,2})?$' OR (v->>'allocation_percent')::numeric>100 THEN RAISE EXCEPTION 'Invalid cost percentage';END IF;
   allocated=allocated+1;total=total+(v->>'allocation_percent')::numeric;
  END IF;
 END LOOP;
 IF allocated>0 AND (allocated<>n OR total<>100) THEN RAISE EXCEPTION 'Every cost share must total exactly 100 percent';END IF;
 IF (allocated>0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE((SELECT b.items FROM hr_employee_business_sets b WHERE b.employee_id=p_employee AND b.effective_from<=p_effective ORDER BY b.effective_from DESC,b.version DESC LIMIT 1),'[]')) i WHERE i->>'allocation_percent' IS NOT NULL)) AND NOT u.is_owner AND COALESCE(pol->'sensitive'->>'salary','false')<>'true' THEN RAISE EXCEPTION 'Salary field permission is required to set cost shares';END IF;
 PERFORM set_config('hr.operations_write','on',true);
 INSERT INTO hr_employee_business_sets(employee_id,effective_from,items,note,version,created_by) VALUES(p_employee,p_effective,p_items,trim(COALESCE(p_note,'')),latest+1,p_actor) RETURNING * INTO r;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'ASSIGN','Businesses',p_employee::text||' effective '||p_effective||' version '||r.version);RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.hr_save_operations_settings(p_actor uuid,p_settings jsonb,p_version integer) RETURNS public.hr_operations_settings LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_operations_settings;BEGIN
 IF NOT EXISTS(SELECT 1 FROM sys_users WHERE id=p_actor AND is_owner AND is_active) THEN RAISE EXCEPTION 'Owner permission required';END IF;
 SELECT * INTO r FROM hr_operations_settings WHERE id FOR UPDATE;IF r.version<>p_version THEN RAISE EXCEPTION 'Settings changed. Reload before saving';END IF;
 IF jsonb_typeof(p_settings->'enabled') IS DISTINCT FROM 'boolean' OR COALESCE(p_settings->>'due_soon_days','') !~ '^\d+$' OR (p_settings->>'due_soon_days')::integer NOT BETWEEN 1 AND 60 OR COALESCE(p_settings->>'expiry_lead_days','') !~ '^\d+$' OR (p_settings->>'expiry_lead_days')::integer NOT BETWEEN 1 AND 180 OR COALESCE(p_settings->>'approval_after_days','') !~ '^\d+$' OR (p_settings->>'approval_after_days')::integer NOT BETWEEN 1 AND 30 OR COALESCE(p_settings->>'repeat_days','') !~ '^\d+$' OR (p_settings->>'repeat_days')::integer NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Invalid reminder settings';END IF;
 UPDATE hr_operations_settings SET settings=p_settings,version=version+1,updated_by=p_actor,updated_at=now() WHERE id RETURNING * INTO r;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'SAVE','Reminder settings','version '||r.version);RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.hr_deliver_operations_reminder(p_user uuid,p_access_version integer,p_key text,p_bucket date,p_title text,p_message text,p_link text,p_context jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE notification uuid=gen_random_uuid();BEGIN
 IF NOT EXISTS(SELECT 1 FROM sys_users WHERE id=p_user AND is_active) OR COALESCE((SELECT version FROM hr_access_policies WHERE user_id=p_user),0)<>p_access_version THEN RETURN false;END IF;
 IF NOT EXISTS(SELECT 1 FROM hr_operations_settings WHERE id AND settings->>'enabled'='true') THEN RETURN false;END IF;
 IF EXISTS(SELECT 1 FROM hr_reminder_deliveries WHERE recipient_user_id=p_user AND source_key=p_key AND bucket=p_bucket) THEN RETURN false;END IF;
 -- Serialize a recipient/source/bucket; concurrent worker processes cannot deliver twice.
 PERFORM pg_advisory_xact_lock(hashtext(p_user::text||p_key||p_bucket::text));
 IF NOT EXISTS(SELECT 1 FROM sys_users WHERE id=p_user AND is_active) OR COALESCE((SELECT version FROM hr_access_policies WHERE user_id=p_user),0)<>p_access_version OR NOT EXISTS(SELECT 1 FROM hr_operations_settings WHERE id AND settings->>'enabled'='true') THEN RETURN false;END IF;
 IF EXISTS(SELECT 1 FROM hr_reminder_deliveries WHERE recipient_user_id=p_user AND source_key=p_key AND bucket=p_bucket) THEN RETURN false;END IF;
 INSERT INTO system_notifications(id,recipient_user_id,title,message,link_url) VALUES(notification,p_user,p_title,p_message,p_link);
 INSERT INTO hr_reminder_deliveries(recipient_user_id,source_key,bucket,context,notification_id) VALUES(p_user,p_key,p_bucket,p_context,notification);RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.hr_record_expense_receipt(p_actor uuid,p_id uuid,p_expense uuid,p_reference text,p_notes text,p_existing jsonb,p_documents jsonb) RETURNS public.hr_expense_receipts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_expense_receipts;e rewards_and_claims;u sys_users;pol jsonb;allowed boolean=false;v jsonb;a hr_approval_requests;
BEGIN
 SELECT * INTO u FROM sys_users WHERE id=p_actor AND is_active;SELECT policy INTO pol FROM hr_access_policies WHERE user_id=p_actor;
 SELECT * INTO e FROM rewards_and_claims WHERE id=p_expense AND form_version=2 FOR SHARE;IF e.id IS NULL OR u.id IS NULL THEN RAISE EXCEPTION 'Expense or account not found';END IF;
 SELECT * INTO a FROM hr_approval_requests WHERE workflow_key='expense' AND resource_id=p_expense;
 allowed=u.is_owner OR hr_operations_can(p_actor,e.employee_id,'rewards','edit') OR hr_operations_can(p_actor,e.employee_id,'rewards','pay') OR (a.stages->3->>'assignee_id'=p_actor::text AND COALESCE(pol->'modules'->'rewards','[]') ? 'pay');
 IF NOT COALESCE(allowed,false) THEN RAISE EXCEPTION 'Scoped Expense edit or Finance payment permission required';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('expense-receipt:'||p_id::text));SELECT * INTO r FROM hr_expense_receipts WHERE id=p_id;
 IF FOUND THEN IF r.expense_id=p_expense AND r.created_by=p_actor AND r.reference=COALESCE(p_reference,'') AND r.notes=COALESCE(p_notes,'') AND r.existing_document_ids=p_existing THEN RETURN r;END IF;RAISE EXCEPTION 'Receipt reference already exists';END IF;
 IF length(COALESCE(p_reference,''))>1000 OR length(COALESCE(p_notes,''))>4000 OR jsonb_typeof(p_existing) IS DISTINCT FROM 'array' OR jsonb_typeof(p_documents) IS DISTINCT FROM 'array' OR jsonb_array_length(p_existing)>5 OR jsonb_array_length(p_documents)>5 THEN RAISE EXCEPTION 'Invalid receipt evidence';END IF;
 IF length(trim(COALESCE(p_reference,'')))=0 AND jsonb_array_length(p_existing)=0 AND jsonb_array_length(p_documents)=0 THEN RAISE EXCEPTION 'Attach a receipt, select existing evidence, or record an outside receipt reference';END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(p_existing) LOOP IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(e.form_snapshot->'documents') d WHERE d->>'id'=v#>>'{}') THEN RAISE EXCEPTION 'Receipt attachment does not belong to this expense';END IF;END LOOP;
 PERFORM set_config('hr.operations_write','on',true);
 INSERT INTO hr_expense_receipts(id,expense_id,created_by,reference,notes,existing_document_ids,documents) VALUES(p_id,p_expense,p_actor,trim(COALESCE(p_reference,'')),trim(COALESCE(p_notes,'')),p_existing,p_documents) RETURNING * INTO r;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'RECEIPT','Expense',e.request_number);RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.hr_operations_can(uuid,uuid,text,text),public.hr_guard_operations_history(),public.hr_save_business_unit(uuid,jsonb,integer),public.hr_save_business_assignments(uuid,uuid,date,jsonb,text,integer),public.hr_save_operations_settings(uuid,jsonb,integer),public.hr_deliver_operations_reminder(uuid,integer,text,date,text,text,text,jsonb),public.hr_record_expense_receipt(uuid,uuid,uuid,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_operations_can(uuid,uuid,text,text),public.hr_save_business_unit(uuid,jsonb,integer),public.hr_save_business_assignments(uuid,uuid,date,jsonb,text,integer),public.hr_save_operations_settings(uuid,jsonb,integer),public.hr_deliver_operations_reminder(uuid,integer,text,date,text,text,text,jsonb),public.hr_record_expense_receipt(uuid,uuid,uuid,text,text,jsonb,jsonb) TO service_role;
-- The upgraded expense submit function below retains all existing approval and idempotency rules.
CREATE OR REPLACE FUNCTION public.hr_submit_expense_form(p_actor uuid,p_key uuid,p_input jsonb,p_documents jsonb DEFAULT '[]') RETURNS public.rewards_and_claims LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u sys_users;e "Employees";pol jsonb;r rewards_and_claims;cfg hr_workflow_settings;s jsonb;stages jsonb='[]';assigned uuid;reviewer sys_users;apol jsonb;n integer;yr integer;day date;amount numeric;budget numeric;field text;idx integer=0;
BEGIN
 SELECT * INTO u FROM sys_users WHERE id=p_actor AND is_active;
 IF NOT FOUND OR u.employee_id IS NULL THEN RAISE EXCEPTION 'An active linked employee account is required';END IF;
 SELECT policy INTO pol FROM hr_access_policies WHERE user_id=p_actor;
 IF NOT u.is_owner AND pol IS NOT NULL AND NOT COALESCE(pol->'personal','[]') ? 'rewards' THEN RAISE EXCEPTION 'Expense permission has been removed';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('expense:'||p_actor::text));
 SELECT * INTO r FROM rewards_and_claims WHERE id=p_key;
 IF FOUND THEN
  IF r.form_version=2 AND r.requester_id=p_actor AND r.form_snapshot->'input'=p_input THEN RETURN r;END IF;
  RAISE EXCEPTION 'Request reference already exists; open a fresh form';
 END IF;
 FOREACH field IN ARRAY ARRAY['business_unit','category','description','purpose','vendor','expense_date','required_payment_date','urgency','payment_method','currency'] LOOP
  IF length(trim(COALESCE(p_input->>field,'')))=0 OR length(p_input->>field)>(CASE WHEN field IN ('description','purpose') THEN 4000 ELSE 250 END) THEN RAISE EXCEPTION 'Complete all expense form fields';END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM hr_business_units WHERE key=p_input->>'business_unit' AND is_active) OR p_input->>'urgency' NOT IN ('Normal','Urgent','Critical') OR p_input->>'payment_method' NOT IN ('Cash','Bank Transfer','Mobile Payment','Other') OR p_input->>'currency' !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Invalid expense choices';END IF;
 IF p_input->>'category' NOT IN ('HR/Staff','Sales & Marketing','Training','Travel & Transportation','Office/Admin','AI Tools / Software','CRM','Finance/Bank Charges','Cloud/Hosting','Customer Support','Utilities','Maintenance','Events','Procurement','Petty Cash','Other') THEN RAISE EXCEPTION 'Invalid expense category';END IF;
 IF p_input->>'expense_date' !~ '^\d{4}-\d{2}-\d{2}$' OR p_input->>'required_payment_date' !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Valid expense and payment dates are required';END IF;
 PERFORM (p_input->>'expense_date')::date,(p_input->>'required_payment_date')::date;
 IF COALESCE(p_input->>'requested_amount','') !~ '^\d{1,12}(\.\d{1,2})?$' OR COALESCE(p_input->>'budget_amount','') !~ '^\d{1,12}(\.\d{1,2})?$' THEN RAISE EXCEPTION 'Invalid amount or budget';END IF;
 amount=(p_input->>'requested_amount')::numeric;budget=(p_input->>'budget_amount')::numeric;
 IF amount<=0 THEN RAISE EXCEPTION 'Requested amount must be positive';END IF;
 IF jsonb_typeof(p_documents)<>'array' OR jsonb_array_length(p_documents)>5 THEN RAISE EXCEPTION 'Attach up to 5 supporting documents';END IF;
 SELECT * INTO e FROM "Employees" WHERE id=u.employee_id AND deleted_at IS NULL AND COALESCE(status,'Active')='Active';
 IF NOT FOUND THEN RAISE EXCEPTION 'An active employee record is required';END IF;
 SELECT * INTO cfg FROM hr_workflow_settings WHERE workflow_key='expense' FOR SHARE;
 IF NOT FOUND OR NOT cfg.enabled OR jsonb_array_length(cfg.stages)<>4 THEN RAISE EXCEPTION 'Ask the owner to activate the four-stage Expense approval workflow';END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(cfg.stages) LOOP
  IF s->>'key' IS DISTINCT FROM (ARRAY['department','agm','coo','finance'])[idx+1] THEN RAISE EXCEPTION 'Department, AGM, COO and Finance stages are required';END IF;
  assigned=(s->>'assignee_id')::uuid;
  IF assigned=p_actor OR EXISTS(SELECT 1 FROM sys_users WHERE id=assigned AND employee_id=u.employee_id) THEN assigned=(s->>'alternate_id')::uuid;END IF;
  SELECT * INTO reviewer FROM sys_users WHERE id=assigned AND is_active;
  SELECT policy INTO apol FROM hr_access_policies WHERE user_id=assigned;
  IF reviewer.id IS NULL OR assigned=p_actor OR reviewer.employee_id=u.employee_id THEN RAISE EXCEPTION 'An independent assigned approver is required; set an alternate';END IF;
  IF NOT reviewer.is_owner AND NOT COALESCE(apol->'modules'->'rewards','[]') ? (CASE WHEN idx=3 THEN 'pay' ELSE 'approve' END) THEN RAISE EXCEPTION 'Assigned approver permission is missing';END IF;
  stages=stages||jsonb_build_array(s||jsonb_build_object('assignee_id',assigned,'assignee_name',COALESCE(reviewer.full_name,reviewer.username),'action',CASE WHEN idx=3 THEN 'pay' ELSE 'approve' END));idx=idx+1;
 END LOOP;
 day=(now() AT TIME ZONE 'Asia/Bangkok')::date;yr=extract(year FROM day)::integer;
 INSERT INTO hr_expense_counters(business_unit,request_year,last_number) VALUES(p_input->>'business_unit',yr,1) ON CONFLICT(business_unit,request_year) DO UPDATE SET last_number=hr_expense_counters.last_number+1 RETURNING last_number INTO n;
 PERFORM set_config('hr.expense_write','on',true);
 INSERT INTO rewards_and_claims(id,employee_id,claim_type,requested_amount,description,currency,status,requested_by,form_version,requester_id,request_number,form_snapshot)
 VALUES(p_key,u.employee_id,'Expense Claim',amount,p_input->>'description',p_input->>'currency','PENDING','EMPLOYEE',2,p_actor,(p_input->>'business_unit')||'_'||yr||'_'||CASE WHEN n<1000 THEN lpad(n::text,3,'0') ELSE n::text END,
 jsonb_build_object('input',p_input,'employee',jsonb_build_object('name',e."Full_name",'employee_number',e.employee_id,'department',(SELECT "Department_name" FROM "Departments" WHERE id=e."Dept_id")),'business_name',(SELECT name FROM hr_business_units WHERE key=p_input->>'business_unit'),'request_date',day,'submitted_at',now(),'budget_remaining',budget-amount,'documents',p_documents)) RETURNING * INTO r;
 INSERT INTO hr_approval_requests(workflow_key,resource_id,requester_id,employee_id,title,snapshot,stages) VALUES('expense',r.id,p_actor,u.employee_id,r.request_number||': '||left(r.description,100),jsonb_build_object('expense_form_id',r.id,'request_number',r.request_number,'requested_amount',amount,'currency',r.currency),stages);
 INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES((stages->0->>'assignee_id')::uuid,'Expense approval needed',r.request_number,'/approvals');
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'SUBMIT','Expense',r.request_number);
 RETURN r;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
