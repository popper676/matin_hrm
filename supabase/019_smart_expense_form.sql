-- MOD-004: Smart Expense Request. Apply once after migration 018 to the existing HR database.
-- Non-destructive. Replaces the submit function only; no table, role, seed, or prior request is changed.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.hr_expense_route(uuid,text,numeric,jsonb)') IS NULL
 THEN RAISE EXCEPTION 'Apply migration 016 before 019.';END IF;
END $$;
CREATE OR REPLACE FUNCTION public.hr_submit_expense_form(p_actor uuid,p_key uuid,p_input jsonb,p_documents jsonb DEFAULT '[]') RETURNS public.rewards_and_claims LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u sys_users;e "Employees";pol jsonb;r rewards_and_claims;cfg hr_workflow_settings;s jsonb;stages jsonb='[]';assigned uuid;reviewer sys_users;apol jsonb;n integer;yr integer;day date;amount numeric;field text;idx integer=0;route jsonb;
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
 FOREACH field IN ARRAY ARRAY['business_unit','category','description','expense_date','urgency','currency'] LOOP
  IF length(trim(COALESCE(p_input->>field,'')))=0 OR length(p_input->>field)>(CASE WHEN field='description' THEN 4000 ELSE 250 END) THEN RAISE EXCEPTION 'Complete all expense form fields';END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM hr_business_units WHERE key=p_input->>'business_unit' AND is_active) OR p_input->>'urgency' NOT IN ('Normal','Urgent','Critical') OR p_input->>'currency' !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Invalid expense choices';END IF;
 IF p_input->>'category' NOT IN ('HR/Staff','Sales & Marketing','Training','Travel & Transportation','Office/Admin','AI Tools / Software','CRM','Finance/Bank Charges','Cloud/Hosting','Customer Support','Utilities','Maintenance','Events','Procurement','Petty Cash','Other') THEN RAISE EXCEPTION 'Invalid expense category';END IF;
 IF p_input->>'expense_date' !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Expense date is required';END IF;
 PERFORM (p_input->>'expense_date')::date;
 IF nullif(p_input->>'required_payment_date','') IS NOT NULL THEN
  IF p_input->>'required_payment_date' !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Invalid required payment date';END IF;
  PERFORM (p_input->>'required_payment_date')::date;
 END IF;
 IF p_input->>'urgency' IN ('Urgent','Critical') AND
   (nullif(trim(coalesce(p_input->>'urgency_reason','')),'') IS NULL OR nullif(p_input->>'required_payment_date','') IS NULL)
   THEN RAISE EXCEPTION 'Urgent requests require payment date and reason';END IF;
 IF p_input->>'category'='Travel & Transportation' THEN
  IF nullif(trim(coalesce(p_input->>'destination','')),'') IS NULL OR p_input->>'travel_date' !~ '^\d{4}-\d{2}-\d{2}$'
   THEN RAISE EXCEPTION 'Travel requires destination and travel date';END IF;
  PERFORM (p_input->>'travel_date')::date;
 END IF;
 IF p_input->>'category' IN ('AI Tools / Software','CRM','Cloud/Hosting') THEN
  IF nullif(trim(coalesce(p_input->>'service_name','')),'') IS NULL OR
   coalesce(p_input->>'is_recurring','false') NOT IN ('true','false')
   THEN RAISE EXCEPTION 'Service name and payment type are required';END IF;
  IF p_input->>'is_recurring'='true' AND nullif(trim(coalesce(p_input->>'subscription_period','')),'') IS NULL
   THEN RAISE EXCEPTION 'Recurring services require a billing period';END IF;
 END IF;
 IF p_input->>'category' IN ('Training','Events') THEN
  IF nullif(trim(coalesce(p_input->>'event_name','')),'') IS NULL OR
   coalesce(p_input->>'has_scheduled_date','false') NOT IN ('true','false')
   THEN RAISE EXCEPTION 'Event name and date status are required';END IF;
  IF p_input->>'has_scheduled_date'='true' THEN
   IF p_input->>'planned_date' !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Confirmed event needs a scheduled date';END IF;
   PERFORM (p_input->>'planned_date')::date;
  END IF;
 END IF;
 FOR field IN SELECT jsonb_object_keys(p_input) LOOP
  IF field IN ('vendor','destination','service_name','subscription_period','event_name','urgency_reason')
   AND length(coalesce(p_input->>field,''))>(CASE WHEN field='urgency_reason' THEN 4000 ELSE 250 END)
   THEN RAISE EXCEPTION 'Expense detail exceeds allowed length';END IF;
 END LOOP;
 IF coalesce(p_input->>'requested_amount','') !~ '^\d{1,12}(\.\d{1,2})?$'
 THEN RAISE EXCEPTION 'Enter a valid requested amount';END IF;
 amount=(p_input->>'requested_amount')::numeric;
 IF amount<=0 THEN RAISE EXCEPTION 'Requested amount must be positive';END IF;
 IF jsonb_typeof(p_documents)<>'array' OR jsonb_array_length(p_documents)>5 THEN RAISE EXCEPTION 'Attach up to 5 supporting documents';END IF;
 SELECT * INTO e FROM "Employees" WHERE id=u.employee_id AND deleted_at IS NULL AND COALESCE(status,'Active')='Active';
 IF NOT FOUND THEN RAISE EXCEPTION 'An active employee record is required';END IF;
 route=hr_expense_route(p_actor,p_input->>'currency',amount);stages=route->'stages';
 day=(now() AT TIME ZONE 'Asia/Bangkok')::date;yr=extract(year FROM day)::integer;
 INSERT INTO hr_expense_counters(business_unit,request_year,last_number) VALUES(p_input->>'business_unit',yr,1) ON CONFLICT(business_unit,request_year) DO UPDATE SET last_number=hr_expense_counters.last_number+1 RETURNING last_number INTO n;
 PERFORM set_config('hr.expense_write','on',true);
 INSERT INTO rewards_and_claims(id,employee_id,claim_type,requested_amount,description,currency,status,requested_by,form_version,requester_id,request_number,form_snapshot)
 VALUES(p_key,u.employee_id,'Expense Claim',amount,p_input->>'description',p_input->>'currency','PENDING','EMPLOYEE',2,p_actor,(p_input->>'business_unit')||'_'||yr||'_'||CASE WHEN n<1000 THEN lpad(n::text,3,'0') ELSE n::text END,
 jsonb_build_object('routing',route->'policy','input',p_input,'employee',jsonb_build_object('name',e."Full_name",'employee_number',e.employee_id,'department',(SELECT "Department_name" FROM "Departments" WHERE id=e."Dept_id")),'business_name',(SELECT name FROM hr_business_units WHERE key=p_input->>'business_unit'),'request_date',day,'submitted_at',now(),'documents',p_documents)) RETURNING * INTO r;
 INSERT INTO hr_approval_requests(workflow_key,resource_id,requester_id,employee_id,title,snapshot,stages) VALUES('expense',r.id,p_actor,u.employee_id,r.request_number||': '||left(r.description,100),jsonb_build_object('routing',route->'policy','expense_form_id',r.id,'request_number',r.request_number,'requested_amount',amount,'currency',r.currency),stages);
 INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES((stages->0->>'assignee_id')::uuid,'Expense approval needed',r.request_number,'/approvals');
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'SUBMIT','Expense',r.request_number);
 RETURN r;
END $$;

REVOKE ALL ON FUNCTION public.hr_submit_expense_form(uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_submit_expense_form(uuid,uuid,jsonb,jsonb) TO service_role;
COMMIT;
