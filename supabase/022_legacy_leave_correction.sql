-- AUD-008/009: retire new legacy approvals and allow only audited, atomic
-- Owner corrections of already-approved pre-v2 leave history.
-- Additive migration: no existing leave requests or balances are modified here.
BEGIN;
CREATE OR REPLACE FUNCTION public.hr_correct_legacy_leave(
  p_actor uuid, p_id uuid, p_status text, p_signature text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  r public."Leave_Request";
  b public."Leave_balances";
  yr record;
  balance_count integer;
  is_paid boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.sys_users
    WHERE id=p_actor AND is_active=true AND is_owner=true
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Only the active Owner may correct legacy leave history';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('Rejected','Pending') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='New legacy approvals are disabled. Use the modern staged leave workflow';
  END IF;
  IF p_signature IS NOT NULL AND length(p_signature)>1000 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Signature is too long';
  END IF;

  SELECT * INTO r FROM public."Leave_Request" WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Legacy leave request not found';
  END IF;
  IF COALESCE(r.form_version,1)>=2 OR EXISTS (
    SELECT 1 FROM public.hr_approval_requests
    WHERE workflow_key='leave' AND resource_id=r.id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Use the configured staged leave approval workflow';
  END IF;
  IF r.status IS DISTINCT FROM 'Approved' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Only an existing Approved legacy leave may be corrected';
  END IF;
  IF r.start_date IS NULL OR r.end_date IS NULL OR r.end_date<r.start_date
     OR r.end_date-r.start_date>366 OR r.leave_type_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Legacy leave requires a manual history review';
  END IF;
  IF r.coverage_handover_id IS NOT NULL OR r.return_handover_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Review linked handover history before correcting leave';
  END IF;
  SELECT COALESCE(t.is_paid,true) INTO is_paid
  FROM public."Leave_type" t WHERE t.id=r.leave_type_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Leave type is unavailable';
  END IF;

  -- Match the original legacy rule (all days except Sunday) while allocating
  -- each year's deduction to its own employee/type/year balance.
  FOR yr IN
    SELECT EXTRACT(YEAR FROM d.day)::integer AS leave_year,COUNT(*)::numeric AS charged_days
    FROM generate_series(r.start_date::timestamp,r.end_date::timestamp,INTERVAL '1 day') AS d(day)
    WHERE EXTRACT(DOW FROM d.day)<>0
    GROUP BY 1 ORDER BY 1
  LOOP
    SELECT COUNT(*) INTO balance_count FROM public."Leave_balances"
    WHERE employee_id=r.employee_id AND leave_type_id=r.leave_type_id AND year=yr.leave_year;
    IF balance_count>1 THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Duplicate annual balances need manual review';
    END IF;
    SELECT * INTO b FROM public."Leave_balances"
    WHERE employee_id=r.employee_id AND leave_type_id=r.leave_type_id AND year=yr.leave_year
    FOR UPDATE;
    IF NOT FOUND THEN
      IF is_paid THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Annual paid leave balance is missing; review historical deduction';
      END IF;
      CONTINUE;
    END IF;
    IF COALESCE(b.used_days,0)<yr.charged_days THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Recorded leave usage is insufficient; review history before correction';
    END IF;
    UPDATE public."Leave_balances"
    SET used_days=COALESCE(used_days,0)-yr.charged_days,
        remain_days=COALESCE(entitled_days,0)-(COALESCE(used_days,0)-yr.charged_days)
    WHERE id=b.id;
  END LOOP;

  UPDATE public."Leave_Request"
  SET status=p_status,e_signature=COALESCE(p_signature,e_signature),updated_at=now()
  WHERE id=r.id RETURNING * INTO r;
  INSERT INTO public.sys_audit_logs(user_id,action,module,details)
  VALUES(p_actor,'CORRECT_LEGACY_LEAVE','Leave Mgmt',
    'Corrected legacy leave '||r.id||' from Approved to '||p_status||' (annual balances reconciled)');
  RETURN jsonb_build_object('id',r.id,'employee_id',r.employee_id,'status',r.status);
END $$;
REVOKE ALL ON FUNCTION public.hr_correct_legacy_leave(uuid,uuid,text,text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_correct_legacy_leave(uuid,uuid,text,text)
TO service_role;
COMMIT;
