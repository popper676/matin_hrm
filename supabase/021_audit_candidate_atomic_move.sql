-- AUD-013: Atomic move to Talent Pool, preserving every candidate or none.
-- Apply only to the existing UYF HR project after approval. No existing rows are updated by this migration.
BEGIN;
CREATE OR REPLACE FUNCTION public.hr_bulk_move_talent_pool(p_actor uuid,p_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE expected integer; selected integer; changed integer;
BEGIN
 IF NOT hr_integrity_can(p_actor,'recruitment','edit') THEN
   RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Recruitment Edit permission required';
 END IF;
 expected=cardinality(p_ids);
 IF p_ids IS NULL OR expected<1 OR expected>1000 OR array_position(p_ids,NULL) IS NOT NULL THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Choose between 1 and 1000 candidates';
 END IF;
 IF (SELECT count(DISTINCT candidate_id) FROM unnest(p_ids) AS x(candidate_id))<>expected THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Duplicate candidate references';
 END IF;
 -- Lock selected candidates first; every candidate must still be in the active pipeline.
 PERFORM 1 FROM recruitment_candidates WHERE id=ANY(p_ids) ORDER BY id FOR UPDATE;
 SELECT count(*) INTO selected FROM recruitment_candidates
 WHERE id=ANY(p_ids) AND status IN ('Applied','Screening','Interview','Offer') AND converted_employee_id IS NULL;
 IF selected<>expected THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Candidate pipeline changed. Refresh and try again.';
 END IF;
 UPDATE recruitment_candidates SET status='Rejected',updated_at=now()
 WHERE id=ANY(p_ids) AND status IN ('Applied','Screening','Interview','Offer') AND converted_employee_id IS NULL;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>expected THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Candidate pipeline changed. Refresh and try again.';
 END IF;
 INSERT INTO sys_audit_logs(user_id,action,module,details)
 VALUES(p_actor,'UPDATE_BULK','Recruitment','Moved '||changed||' candidates to Talent Pool');
 RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.hr_bulk_move_talent_pool(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_bulk_move_talent_pool(uuid,uuid[]) TO service_role;
COMMIT;
