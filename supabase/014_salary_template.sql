-- Additive after 013. Existing payrolls and employee salaries are retained.
BEGIN;
ALTER TABLE public.payrolls ADD COLUMN IF NOT EXISTS salary_template jsonb;

CREATE OR REPLACE FUNCTION public.hr_guard_salary_template()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF (NEW.salary_template IS NOT NULL OR (TG_OP='UPDATE' AND OLD.salary_template IS NOT NULL))
 AND current_setting('hr.salary_template_write',true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Use the Salary Template workflow to change this payroll.';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hr_salary_template_guard ON public.payrolls;
CREATE TRIGGER hr_salary_template_guard BEFORE INSERT OR UPDATE ON public.payrolls FOR EACH ROW EXECUTE FUNCTION public.hr_guard_salary_template();

CREATE OR REPLACE FUNCTION public.hr_save_salary_template(p_actor uuid,p_employee uuid,p_month text,p_version integer,p_input jsonb,p_notes text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r payrolls; e "Employees"; s jsonb; k text; v numeric; days integer; first_day date;
 basic numeric; fixed numeric; ot numeric; special numeric; scarcity numeric; ssb numeric; employer numeric; tax numeric; loan numeric; unpaid_days numeric; other_ded numeric;
 total numeric; unpaid numeric; ot_amount numeric; gross numeric; deduction_total numeric; net numeric; dept text;
BEGIN
 IF p_month!~'^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$' OR p_version<0 OR p_version IS NULL OR jsonb_typeof(p_input)<>'object' OR length(p_notes)>4000 THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid salary month, version or notes.';
 END IF;
 IF NOT hr_integrity_can(p_actor,'payroll','view',p_employee) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Payroll, Salary and employee scope are required.';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('salary-template:'||p_employee||':'||p_month,0));
 SELECT * INTO r FROM payrolls WHERE employee_id=p_employee AND month=p_month FOR UPDATE;
 IF r.id IS NOT NULL THEN
  IF NOT hr_integrity_can(p_actor,'payroll','edit',p_employee) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Payroll Edit is required.';END IF;
  IF r.payment_status='Paid' OR r.salary_template IS NULL OR (r.salary_template->>'version')::integer<>p_version THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Payroll is paid, legacy, or changed in another tab. Reload before continuing.';
  END IF;
 ELSE
  IF NOT hr_integrity_can(p_actor,'payroll','create',p_employee) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Payroll Create is required.';END IF;
  IF p_version<>0 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Payroll changed. Reload before continuing.';END IF;
 END IF;
 SELECT * INTO e FROM "Employees" WHERE id=p_employee AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Employee is unavailable.';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_input) key WHERE key<>ALL(ARRAY['basic_salary','fixed_allowance','ot_hours','special_allowance','scarcity_allowance','ssb_employee','ssb_employer','income_tax','staff_loan','unpaid_leave_days','other_deduction'])) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Unexpected salary input.';
 END IF;
 FOREACH k IN ARRAY ARRAY['basic_salary','fixed_allowance','ot_hours','special_allowance','scarcity_allowance','ssb_employee','ssb_employer','income_tax','staff_loan','unpaid_leave_days','other_deduction'] LOOP
  IF jsonb_typeof(p_input->k)<>'number' OR p_input->k IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Every salary input must be numeric.';END IF;
  v=(p_input->>k)::numeric;
  IF v<0 OR v>100000000 OR round(v,2)<>v THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Salary inputs must be non-negative with up to two decimals.';END IF;
 END LOOP;
 first_day=(p_month||'-01')::date;days=extract(day FROM first_day+interval '1 month'-interval '1 day');
 basic=(p_input->>'basic_salary')::numeric;fixed=(p_input->>'fixed_allowance')::numeric;ot=(p_input->>'ot_hours')::numeric;
 special=(p_input->>'special_allowance')::numeric;scarcity=(p_input->>'scarcity_allowance')::numeric;
 ssb=(p_input->>'ssb_employee')::numeric;employer=(p_input->>'ssb_employer')::numeric;tax=(p_input->>'income_tax')::numeric;loan=(p_input->>'staff_loan')::numeric;
 unpaid_days=(p_input->>'unpaid_leave_days')::numeric;other_ded=(p_input->>'other_deduction')::numeric;
 IF unpaid_days>days OR unpaid_days*2<>trunc(unpaid_days*2) OR ot>days*24 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid unpaid days or OT hours.';END IF;
 total=basic+fixed;unpaid=round(total/30*unpaid_days,2);ot_amount=round(basic*12/(52*48)*ot*2,2);
 gross=total+ot_amount+special+scarcity;deduction_total=ssb+tax+loan+unpaid+other_ded;net=gross-deduction_total;
 IF net<0 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Deductions exceed gross salary. Review the entered amounts.';END IF;
 SELECT "Department_name" INTO dept FROM "Departments" WHERE id=e."Dept_id";
 s=p_input||jsonb_build_object('version',p_version+1,'currency','THB','period_start',first_day,'period_end',(first_day+interval '1 month'-interval '1 day')::date,'period_days',days,
 'employee_code',e.employee_id,'employee_name',e."Full_name",'department',coalesce(dept,''),'hire_date',e.hire_date,
 'total_salary',total,'attendance_days',days-unpaid_days,'salary_after_attendance',round(basic/days*(days-unpaid_days),2),
 'ot_amount',ot_amount,'unpaid_leave',unpaid,'gross_salary',gross,'total_deduction',deduction_total,'net_salary',net);
 PERFORM set_config('hr.salary_template_write','on',true);
 IF r.id IS NULL THEN
  INSERT INTO payrolls(employee_id,month,basic_salary,allowances,bonus,deductions,net_salary,payment_status,calculation_source,salary_template,notes)
  VALUES(p_employee,p_month,basic,fixed+ot_amount+special+scarcity,0,deduction_total,net,'Pending','salary_template',s,p_notes) RETURNING * INTO r;
 ELSE
  UPDATE payrolls SET basic_salary=basic,allowances=fixed+ot_amount+special+scarcity,bonus=0,deductions=deduction_total,net_salary=net,salary_template=s,notes=p_notes,updated_at=now() WHERE id=r.id RETURNING * INTO r;
 END IF;
 PERFORM set_config('hr.salary_template_write','off',true);
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'SAVE_SALARY_TEMPLATE','Payroll','Saved salary template '||r.id||' version '||(p_version+1));
 RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.hr_pay_salary_template(p_actor uuid,p_payroll uuid,p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r payrolls;BEGIN
 SELECT * INTO r FROM payrolls WHERE id=p_payroll FOR UPDATE;
 IF r.id IS NULL OR NOT hr_integrity_can(p_actor,'payroll','pay',r.employee_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Payroll payment access is required.';END IF;
 IF r.payment_status<>'Pending' OR r.salary_template IS NULL OR p_version IS NULL OR (r.salary_template->>'version')::integer<>p_version THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Payroll changed or is already paid. Reload before continuing.';END IF;
 PERFORM set_config('hr.salary_template_write','on',true);
 UPDATE payrolls SET payment_status='Paid',updated_at=now() WHERE id=r.id RETURNING * INTO r;
 PERFORM set_config('hr.salary_template_write','off',true);
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'PAY_SALARY_TEMPLATE','Payroll','Recorded paid salary '||r.id||' version '||p_version);
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION public.hr_save_salary_template(uuid,uuid,text,integer,jsonb,text),public.hr_pay_salary_template(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_save_salary_template(uuid,uuid,text,integer,jsonb,text),public.hr_pay_salary_template(uuid,uuid,integer) TO service_role;
COMMIT;
