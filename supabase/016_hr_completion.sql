-- Existing HR database: apply after 015. New rules apply only to new requests.
BEGIN;
DO $$ BEGIN IF to_regprocedure('public.hr_create_lifecycle(uuid,text,jsonb,jsonb)') IS NULL THEN RAISE EXCEPTION 'Apply migration 015 before 016.';END IF;END $$;
CREATE TABLE IF NOT EXISTS public.hr_expense_routing(
 id boolean PRIMARY KEY DEFAULT true CHECK(id),mode text NOT NULL DEFAULT 'standard' CHECK(mode IN ('standard','amount')),
 limits jsonb NOT NULL DEFAULT '{}',stages jsonb NOT NULL DEFAULT '[]',version integer NOT NULL DEFAULT 1,
 updated_by uuid REFERENCES public.sys_users(id),updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.hr_expense_routing(id) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE public.hr_expense_routing ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_expense_routing FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.hr_expense_routing TO service_role;
CREATE OR REPLACE FUNCTION public.hr_validate_expense_routing(p_config jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE entry record;s jsonb;idx integer=0;person uuid;u sys_users;pol jsonb;agm uuid;agm_emp uuid;BEGIN
 IF jsonb_typeof(p_config)<>'object' OR coalesce(p_config->>'mode','') NOT IN ('standard','amount') OR jsonb_typeof(p_config->'limits') IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_config->'limits'))>30 THEN RAISE EXCEPTION 'Choose a valid expense route and currency limits.';END IF;
 FOR entry IN SELECT * FROM jsonb_each_text(p_config->'limits') LOOP
  IF entry.key!~'^[A-Z]{3}$' OR entry.value!~'^\d{1,12}(\.\d{1,2})?$' THEN RAISE EXCEPTION 'Invalid currency limit: use a non-negative amount with 2 decimals.';END IF;
 END LOOP;
 IF p_config->>'mode'='standard' THEN RETURN;END IF;
 IF jsonb_typeof(p_config->'stages') IS DISTINCT FROM 'array' OR jsonb_array_length(p_config->'stages')<>3 THEN RAISE EXCEPTION 'Assign AGM, CEO and Finance.';END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(p_config->'stages') LOOP
  idx=idx+1;
  IF s->>'key' IS DISTINCT FROM (ARRAY['agm','ceo','finance'])[idx] OR s->>'action' IS DISTINCT FROM (CASE WHEN idx=3 THEN 'pay' ELSE 'approve' END) OR nullif(s->>'assignee_id','') IS NULL OR s->>'assignee_id'=s->>'alternate_id' THEN RAISE EXCEPTION 'Invalid responsible person or stage.';END IF;
  FOR person IN SELECT (s->>'assignee_id')::uuid UNION SELECT nullif(s->>'alternate_id','')::uuid LOOP
   IF person IS NULL THEN CONTINUE;END IF;
   SELECT * INTO u FROM sys_users WHERE id=person AND is_active;SELECT policy INTO pol FROM hr_access_policies WHERE user_id=person;
   IF u.id IS NULL OR (NOT u.is_owner AND (NOT coalesce(pol->'modules'->'rewards','[]') ? 'view' OR NOT coalesce(pol->'modules'->'rewards','[]') ? (s->>'action'))) THEN RAISE EXCEPTION 'Assigned reviewer needs active Expenses View and the required Approve or Pay permission.';END IF;
  END LOOP;
  IF idx=1 THEN agm=(s->>'assignee_id')::uuid;SELECT employee_id INTO agm_emp FROM sys_users WHERE id=agm;END IF;
  IF idx=2 AND (agm=(s->>'assignee_id')::uuid OR (agm_emp IS NOT NULL AND EXISTS(SELECT 1 FROM sys_users WHERE id=(s->>'assignee_id')::uuid AND employee_id=agm_emp))) THEN RAISE EXCEPTION 'Choose an independent CEO reviewer from the AGM.';END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.hr_save_expense_routing(p_actor uuid,p_config jsonb,p_version integer) RETURNS public.hr_expense_routing
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_expense_routing;BEGIN
 IF NOT EXISTS(SELECT 1 FROM sys_users WHERE id=p_actor AND is_active AND is_owner) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Owner access is required.';END IF;
 SELECT * INTO r FROM hr_expense_routing WHERE id FOR UPDATE;
 IF p_version IS NULL OR p_version<>r.version THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Expense settings changed. Reload before saving.';END IF;
 PERFORM hr_validate_expense_routing(p_config);
 UPDATE hr_expense_routing SET mode=p_config->>'mode',limits=p_config->'limits',stages=p_config->'stages',version=version+1,updated_by=p_actor,updated_at=now() WHERE id RETURNING * INTO r;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'CONFIGURE','Expense routing',jsonb_build_object('mode',r.mode,'version',r.version,'limits',r.limits,'stages',r.stages)::text);RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.hr_expense_route(p_requester uuid,p_currency text,p_amount numeric,p_config jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg jsonb;legacy hr_workflow_settings;u sys_users;reviewer sys_users;pol jsonb;s jsonb;stages jsonb='[]';chosen uuid;cap numeric;ceo boolean;agm uuid;agm_emp uuid;reason text;idx integer=0;BEGIN
 SELECT * INTO u FROM sys_users WHERE id=p_requester AND is_active;
 IF u.id IS NULL OR u.employee_id IS NULL THEN RAISE EXCEPTION 'Choose an active requester with an employee profile.';END IF;
 IF NOT EXISTS(SELECT 1 FROM "Employees" WHERE id=u.employee_id AND deleted_at IS NULL AND coalesce(status,'Active')='Active') THEN RAISE EXCEPTION 'Choose an active requester employee.';END IF;
 IF p_currency IS NULL OR p_currency!~'^[A-Z]{3}$' OR p_amount IS NULL OR p_amount<=0 OR p_amount<>round(p_amount,2) OR p_amount>999999999999.99 THEN RAISE EXCEPTION 'Enter a positive request amount and 3-letter currency.';END IF;
 IF p_config IS NULL THEN SELECT to_jsonb(r) INTO cfg FROM hr_expense_routing r WHERE id FOR SHARE;ELSE cfg=p_config;END IF;
 PERFORM hr_validate_expense_routing(cfg);
 IF cfg->>'mode'='standard' THEN
  SELECT * INTO legacy FROM hr_workflow_settings WHERE workflow_key='expense' FOR SHARE;
  IF NOT FOUND OR NOT legacy.enabled OR jsonb_array_length(legacy.stages)<>4 THEN RAISE EXCEPTION 'Ask the Owner to activate the standard Expense workflow or configure amount routing.';END IF;
  cfg=jsonb_set(cfg,'{stages}',legacy.stages);reason='standard';
 ELSE
  cap=(cfg->'limits'->>p_currency)::numeric;ceo=cap IS NULL OR p_amount>cap;
  reason=CASE WHEN cap IS NULL THEN 'currency_unconfigured' WHEN ceo THEN 'above_limit' ELSE 'within_limit' END;
 END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(cfg->'stages') LOOP
  idx=idx+1;
  IF cfg->>'mode'='standard' THEN
   IF s->>'key' IS DISTINCT FROM (ARRAY['department','agm','coo','finance'])[idx] THEN RAISE EXCEPTION 'Department, AGM, COO and Finance stages must remain in order.';END IF;
   s=s||jsonb_build_object('action',CASE WHEN idx=4 THEN 'pay' ELSE 'approve' END);
  END IF;
  IF cfg->>'mode'='amount' AND s->>'key'='ceo' AND NOT ceo THEN CONTINUE;END IF;
  chosen=(s->>'assignee_id')::uuid;
  IF chosen=p_requester OR EXISTS(SELECT 1 FROM sys_users WHERE id=chosen AND employee_id=u.employee_id) THEN chosen=nullif(s->>'alternate_id','')::uuid;END IF;
  SELECT * INTO reviewer FROM sys_users WHERE id=chosen AND is_active;SELECT policy INTO pol FROM hr_access_policies WHERE user_id=chosen;
  IF reviewer.id IS NULL OR chosen=p_requester OR reviewer.employee_id=u.employee_id THEN RAISE EXCEPTION 'An independent assigned approver is required; set an alternate.';END IF;
  IF NOT reviewer.is_owner AND (NOT coalesce(pol->'modules'->'rewards','[]') ? 'view' OR NOT coalesce(pol->'modules'->'rewards','[]') ? (s->>'action')) THEN RAISE EXCEPTION 'Assigned approver permission is missing.';END IF;
  IF cfg->>'mode'='amount' AND s->>'key'='agm' THEN agm=chosen;agm_emp=reviewer.employee_id;END IF;
  IF cfg->>'mode'='amount' AND s->>'key'='ceo' AND (chosen=agm OR reviewer.employee_id=agm_emp) THEN RAISE EXCEPTION 'An independent CEO reviewer is required after AGM review.';END IF;
  stages=stages||jsonb_build_array(s||jsonb_build_object('assignee_id',chosen,'assignee_name',coalesce(reviewer.full_name,reviewer.username)));
 END LOOP;
 RETURN jsonb_build_object('stages',stages,'policy',jsonb_build_object('mode',cfg->>'mode','version',cfg->'version','currency',p_currency,'requested_amount',p_amount,'agm_limit',cap,'ceo_required',ceo,'reason',reason));
END $$;
CREATE OR REPLACE FUNCTION public.hr_submit_expense_form(p_actor uuid,p_key uuid,p_input jsonb,p_documents jsonb DEFAULT '[]') RETURNS public.rewards_and_claims LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u sys_users;e "Employees";pol jsonb;r rewards_and_claims;cfg hr_workflow_settings;s jsonb;stages jsonb='[]';assigned uuid;reviewer sys_users;apol jsonb;n integer;yr integer;day date;amount numeric;budget numeric;field text;idx integer=0;route jsonb;
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
 route=hr_expense_route(p_actor,p_input->>'currency',amount);stages=route->'stages';
 day=(now() AT TIME ZONE 'Asia/Bangkok')::date;yr=extract(year FROM day)::integer;
 INSERT INTO hr_expense_counters(business_unit,request_year,last_number) VALUES(p_input->>'business_unit',yr,1) ON CONFLICT(business_unit,request_year) DO UPDATE SET last_number=hr_expense_counters.last_number+1 RETURNING last_number INTO n;
 PERFORM set_config('hr.expense_write','on',true);
 INSERT INTO rewards_and_claims(id,employee_id,claim_type,requested_amount,description,currency,status,requested_by,form_version,requester_id,request_number,form_snapshot)
 VALUES(p_key,u.employee_id,'Expense Claim',amount,p_input->>'description',p_input->>'currency','PENDING','EMPLOYEE',2,p_actor,(p_input->>'business_unit')||'_'||yr||'_'||CASE WHEN n<1000 THEN lpad(n::text,3,'0') ELSE n::text END,
 jsonb_build_object('routing',route->'policy','input',p_input,'employee',jsonb_build_object('name',e."Full_name",'employee_number',e.employee_id,'department',(SELECT "Department_name" FROM "Departments" WHERE id=e."Dept_id")),'business_name',(SELECT name FROM hr_business_units WHERE key=p_input->>'business_unit'),'request_date',day,'submitted_at',now(),'budget_remaining',budget-amount,'documents',p_documents)) RETURNING * INTO r;
 INSERT INTO hr_approval_requests(workflow_key,resource_id,requester_id,employee_id,title,snapshot,stages) VALUES('expense',r.id,p_actor,u.employee_id,r.request_number||': '||left(r.description,100),jsonb_build_object('routing',route->'policy','expense_form_id',r.id,'request_number',r.request_number,'requested_amount',amount,'currency',r.currency),stages);
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
 UPDATE rewards_and_claims SET status=CASE WHEN p_decision='reject' THEN 'REJECTED' WHEN p_decision='pay' THEN 'PAID' WHEN a.stages->(a.current_stage+1)->>'action'='pay' THEN 'APPROVED' ELSE status END,
 approved_amount=CASE WHEN p_decision IN ('approve','approve_with_conditions') THEN p_amount ELSE approved_amount END,approved_by=p_actor,admin_remarks=trim(COALESCE(p_comment,'')),paid_amount=CASE WHEN p_decision='pay' THEN paid ELSE paid_amount END,payment_date=CASE WHEN p_decision='pay' THEN payment_day ELSE payment_date END,payment_reference=CASE WHEN p_decision='pay' THEN trim(p_payment->>'reference') ELSE payment_reference END,updated_at=now() WHERE id=r.id;
 UPDATE hr_approval_requests SET status=next_status,current_stage=CASE WHEN next_status='pending' THEN current_stage+1 ELSE current_stage END,history=history||jsonb_build_array(event),version=version+1,updated_at=now() WHERE id=a.id RETURNING * INTO a;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,upper(p_decision),'Expense',r.request_number||' stage '||(s->>'key'));
 INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES(a.requester_id,'Expense updated',r.request_number||': '||next_status,'/portal/rewards');
 IF next_status='pending' THEN INSERT INTO system_notifications(recipient_user_id,title,message,link_url) VALUES((a.stages->a.current_stage->>'assignee_id')::uuid,'Expense approval needed',r.request_number,'/approvals');END IF;
 RETURN a;
END $$;
REVOKE ALL ON FUNCTION public.hr_validate_expense_routing(jsonb),public.hr_save_expense_routing(uuid,jsonb,integer),public.hr_expense_route(uuid,text,numeric,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_validate_expense_routing(jsonb),public.hr_save_expense_routing(uuid,jsonb,integer),public.hr_expense_route(uuid,text,numeric,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
