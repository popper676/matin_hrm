-- Audit BUG-002: authorize the actual Finance payment stage in expense evidence.
-- Applies AFTER 019.  Preserves all existing expense, payment and receipt records.
-- Rerunnable: only replaces the receipt RPC, without changing table data.
BEGIN;
CREATE OR REPLACE FUNCTION public.hr_record_expense_receipt(p_actor uuid,p_id uuid,p_expense uuid,p_reference text,p_notes text,p_existing jsonb,p_documents jsonb) RETURNS public.hr_expense_receipts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_expense_receipts;e rewards_and_claims;u sys_users;pol jsonb;allowed boolean=false;v jsonb;a hr_approval_requests;
BEGIN
 SELECT * INTO u FROM sys_users WHERE id=p_actor AND is_active;SELECT policy INTO pol FROM hr_access_policies WHERE user_id=p_actor;
 SELECT * INTO e FROM rewards_and_claims WHERE id=p_expense AND form_version=2 FOR SHARE;IF e.id IS NULL OR u.id IS NULL THEN RAISE EXCEPTION 'Expense or account not found';END IF;
 SELECT * INTO a FROM hr_approval_requests WHERE workflow_key='expense' AND resource_id=p_expense;
 allowed=u.is_owner OR hr_operations_can(p_actor,e.employee_id,'rewards','edit') OR hr_operations_can(p_actor,e.employee_id,'rewards','pay') OR (EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(a.stages,'[]'::jsonb)) AS stage WHERE stage->>'key'='finance' AND stage->>'action'='pay' AND stage->>'assignee_id'=p_actor::text) AND COALESCE(pol->'modules'->'rewards','[]'::jsonb) ? 'pay');
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
REVOKE ALL ON FUNCTION public.hr_record_expense_receipt(uuid,uuid,uuid,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_record_expense_receipt(uuid,uuid,uuid,text,text,jsonb,jsonb) TO service_role;
COMMIT;
