-- Run in the EXISTING UYF HR project after 006. Preserves previous records.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.hr_instance WHERE purpose='lm-hr-fresh') OR to_regprocedure('public.hr_decide_leave_form(uuid,uuid,text,text,integer,text)') IS NULL THEN RAISE EXCEPTION 'Existing HR instance with migration 006 required';END IF;
END $$;
ALTER TABLE public.rewards_and_claims ADD COLUMN IF NOT EXISTS form_version integer NOT NULL DEFAULT 1;
ALTER TABLE public.rewards_and_claims ADD COLUMN IF NOT EXISTS requester_id uuid REFERENCES public.sys_users(id);
ALTER TABLE public.rewards_and_claims ADD COLUMN IF NOT EXISTS request_number text;
ALTER TABLE public.rewards_and_claims ADD COLUMN IF NOT EXISTS form_snapshot jsonb;
ALTER TABLE public.rewards_and_claims ADD COLUMN IF NOT EXISTS paid_amount numeric;
ALTER TABLE public.rewards_and_claims ADD COLUMN IF NOT EXISTS payment_date date;
ALTER TABLE public.rewards_and_claims ADD COLUMN IF NOT EXISTS payment_reference text;
CREATE UNIQUE INDEX IF NOT EXISTS expense_request_number_idx ON public.rewards_and_claims(request_number) WHERE request_number IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.hr_expense_counters(business_unit text NOT NULL,request_year integer NOT NULL,last_number integer NOT NULL,PRIMARY KEY(business_unit,request_year));
ALTER TABLE public.hr_expense_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_expense_counters FROM anon,authenticated;
GRANT ALL ON public.hr_expense_counters TO service_role;
DO $$ BEGIN
 IF to_regclass('storage.buckets') IS NOT NULL THEN
  INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('expense_documents','expense_documents',false,10485760,ARRAY['application/pdf','image/jpeg','image/png']) ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=10485760,allowed_mime_types=EXCLUDED.allowed_mime_types;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.hr_guard_expense_form() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.form_version=2 THEN RAISE EXCEPTION 'Submitted expense forms must be retained';END IF;RETURN OLD;
 END IF;
 IF (NEW.form_version=2 OR (TG_OP='UPDATE' AND OLD.form_version=2)) AND current_setting('hr.expense_write',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Use the complete expense form and assigned approval workflow';END IF;
 IF TG_OP='INSERT' AND NEW.claim_type='Expense Claim' AND NEW.form_version<>2 THEN RAISE EXCEPTION 'Use the complete expense request form';END IF;
 IF TG_OP='UPDATE' AND OLD.claim_type IS DISTINCT FROM 'Expense Claim' AND NEW.claim_type='Expense Claim' AND NEW.form_version<>2 THEN RAISE EXCEPTION 'Use the complete expense request form';END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_expense_form ON public.rewards_and_claims;
CREATE TRIGGER guard_expense_form BEFORE INSERT OR UPDATE OR DELETE ON public.rewards_and_claims FOR EACH ROW EXECUTE FUNCTION public.hr_guard_expense_form();
-- Also protect intermediate decisions: a legacy RPC must not advance the
-- first stages without recording the updated form's authorized amounts.
CREATE OR REPLACE FUNCTION public.hr_guard_expense_approval() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE ref uuid;prior_ref uuid;expense boolean;
BEGIN
 IF TG_OP='DELETE' THEN ref=OLD.resource_id;expense=OLD.workflow_key='expense';
 ELSIF TG_OP='INSERT' THEN ref=NEW.resource_id;expense=NEW.workflow_key='expense';
 ELSE ref=NEW.resource_id;prior_ref=OLD.resource_id;expense=NEW.workflow_key='expense' OR OLD.workflow_key='expense';END IF;
 IF expense AND EXISTS(SELECT 1 FROM rewards_and_claims WHERE (id=ref OR id=prior_ref) AND form_version=2) AND current_setting('hr.expense_write',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Use the complete expense approval workflow';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_expense_approval ON public.hr_approval_requests;
CREATE TRIGGER guard_expense_approval BEFORE INSERT OR UPDATE OR DELETE ON public.hr_approval_requests FOR EACH ROW EXECUTE FUNCTION public.hr_guard_expense_approval();
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
 IF p_input->>'business_unit' NOT IN ('UYF','AI_AUTONO','WISE_INVEST','BBD','LM_HOSTEL') OR p_input->>'urgency' NOT IN ('Normal','Urgent','Critical') OR p_input->>'payment_method' NOT IN ('Cash','Bank Transfer','Mobile Payment','Other') OR p_input->>'currency' !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Invalid expense choices';END IF;
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
 jsonb_build_object('input',p_input,'employee',jsonb_build_object('name',e."Full_name",'employee_number',e.employee_id,'department',(SELECT "Department_name" FROM "Departments" WHERE id=e."Dept_id")),'request_date',day,'submitted_at',now(),'budget_remaining',budget-amount,'documents',p_documents)) RETURNING * INTO r;
 INSERT INTO hr_approval_requests(workflow_key,resource_id,requester_id,employee_id,title,snapshot,stages) VALUES('expense',r.id,p_actor,u.employee_id,r.request_number||': '||left(r.description,100),jsonb_build_object('expense_form_id',r.id,'request_number',r.request_number,'requested_amount',amount,'currency',r.currency),stages);
 INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES((stages->0->>'assignee_id')::uuid,'Expense approval needed',r.request_number,'/approvals');
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'SUBMIT','Expense',r.request_number);
 RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.hr_decide_expense_form(p_actor uuid,p_id uuid,p_decision text,p_comment text,p_version integer,p_amount numeric DEFAULT NULL,p_conditions text DEFAULT '',p_payment jsonb DEFAULT NULL) RETURNS public.hr_approval_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a hr_approval_requests;r rewards_and_claims;u sys_users;pol jsonb;s jsonb;cap numeric;paid numeric;next_status text;event jsonb;payment_day date;
BEGIN
 SELECT * INTO u FROM sys_users WHERE id=p_actor AND is_active;IF NOT FOUND THEN RAISE EXCEPTION 'Account is disabled';END IF;
 SELECT * INTO a FROM hr_approval_requests WHERE id=p_id AND workflow_key='expense' FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Expense request not found';END IF;
 IF a.status<>'pending' THEN RAISE EXCEPTION 'Request already completed';END IF;
 IF a.version<>p_version THEN RAISE EXCEPTION 'Request changed. Reload and try again.';END IF;
 SELECT * INTO r FROM rewards_and_claims WHERE id=a.resource_id AND form_version=2 FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Updated expense form required';END IF;
 IF a.requester_id=p_actor OR u.employee_id=r.employee_id THEN RAISE EXCEPTION 'Cannot decide your own request';END IF;
 s=a.stages->a.current_stage;
 IF s->>'assignee_id' IS DISTINCT FROM p_actor::text THEN RAISE EXCEPTION 'This stage is assigned to someone else';END IF;
 SELECT policy INTO pol FROM hr_access_policies WHERE user_id=p_actor;
 IF NOT u.is_owner AND NOT COALESCE(pol->'modules'->'rewards','[]') ? (s->>'action') THEN RAISE EXCEPTION 'Approval permission has been removed';END IF;
 IF p_decision NOT IN ('approve','approve_with_conditions','reject','pay') OR length(COALESCE(p_comment,''))>5000 OR length(COALESCE(p_conditions,''))>4000 THEN RAISE EXCEPTION 'Invalid decision';END IF;
 IF p_decision='reject' AND length(trim(COALESCE(p_comment,'')))=0 THEN RAISE EXCEPTION 'Rejection reason required';END IF;
 IF p_decision='approve_with_conditions' AND length(trim(COALESCE(p_conditions,'')))=0 THEN RAISE EXCEPTION 'Enter the approval conditions';END IF;
 IF p_decision<>'reject' AND ((s->>'action'='pay')<>(p_decision='pay')) THEN RAISE EXCEPTION 'Wrong action for this stage';END IF;
 cap=COALESCE(r.approved_amount,r.requested_amount);
 IF p_decision IN ('approve','approve_with_conditions') AND (p_amount IS NULL OR p_amount<=0 OR p_amount>cap OR p_amount<>round(p_amount,2)) THEN RAISE EXCEPTION 'Approved amount must be positive and no higher than the previous authorized amount';END IF;
 IF p_decision='pay' THEN
  IF p_payment IS NULL OR COALESCE(p_payment->>'amount','') !~ '^\d{1,12}(\.\d{1,2})?$' OR p_payment->>'currency' IS DISTINCT FROM r.currency OR COALESCE(trim(p_payment->>'reference'),'')='' OR length(p_payment->>'reference')>250 OR COALESCE(p_payment->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' OR COALESCE(p_payment->>'method','') NOT IN ('Cash','Bank Transfer','Mobile Payment','Other') THEN RAISE EXCEPTION 'Enter payment amount, matching currency, date, method and reference';END IF;
  paid=(p_payment->>'amount')::numeric;payment_day=(p_payment->>'date')::date;
  IF paid<=0 OR paid>cap OR payment_day>(now() AT TIME ZONE 'Asia/Bangkok')::date THEN RAISE EXCEPTION 'Payment must be positive, within approval and not dated in the future';END IF;
  IF paid<cap AND length(trim(COALESCE(p_comment,'')))=0 THEN RAISE EXCEPTION 'Explain the lower final settlement amount';END IF;
 END IF;
 next_status=CASE WHEN p_decision='reject' THEN 'rejected' WHEN p_decision='pay' THEN 'paid' ELSE 'pending' END;
 event=jsonb_build_object('stage',s->>'key','label',s->>'label','actor_id',p_actor,'actor_name',u.full_name,'decision',p_decision,'comment',trim(COALESCE(p_comment,'')),'conditions',CASE WHEN p_decision='approve_with_conditions' THEN trim(p_conditions) ELSE '' END,'approved_amount',CASE WHEN p_decision IN ('approve','approve_with_conditions') THEN p_amount ELSE NULL END,'currency',r.currency,'payment',CASE WHEN p_decision='pay' THEN p_payment ELSE NULL END,'at',now());
 PERFORM set_config('hr.expense_write','on',true);
 UPDATE rewards_and_claims SET status=CASE WHEN p_decision='reject' THEN 'REJECTED' WHEN p_decision='pay' THEN 'PAID' WHEN s->>'key'='coo' THEN 'APPROVED' ELSE status END,
 approved_amount=CASE WHEN p_decision IN ('approve','approve_with_conditions') THEN p_amount ELSE approved_amount END,approved_by=p_actor,admin_remarks=trim(COALESCE(p_comment,'')),paid_amount=CASE WHEN p_decision='pay' THEN paid ELSE paid_amount END,payment_date=CASE WHEN p_decision='pay' THEN payment_day ELSE payment_date END,payment_reference=CASE WHEN p_decision='pay' THEN trim(p_payment->>'reference') ELSE payment_reference END,updated_at=now() WHERE id=r.id;
 UPDATE hr_approval_requests SET status=next_status,current_stage=CASE WHEN next_status='pending' THEN current_stage+1 ELSE current_stage END,history=history||jsonb_build_array(event),version=version+1,updated_at=now() WHERE id=a.id RETURNING * INTO a;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,upper(p_decision),'Expense',r.request_number||' stage '||(s->>'key'));
 INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES(a.requester_id,'Expense updated',r.request_number||': '||next_status,'/portal/rewards');
 IF next_status='pending' THEN INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES((a.stages->a.current_stage->>'assignee_id')::uuid,'Expense approval needed',r.request_number,'/approvals');END IF;
 RETURN a;
END $$;
REVOKE ALL ON FUNCTION public.hr_guard_expense_form(),public.hr_guard_expense_approval(),public.hr_submit_expense_form(uuid,uuid,jsonb,jsonb),public.hr_decide_expense_form(uuid,uuid,text,text,integer,numeric,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_submit_expense_form(uuid,uuid,jsonb,jsonb),public.hr_decide_expense_form(uuid,uuid,text,text,integer,numeric,text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
