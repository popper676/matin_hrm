-- Additive fixes for existing installations through migration 012.
BEGIN;
UPDATE public.daily_sops SET assigned_date=(created_at AT TIME ZONE 'Asia/Bangkok')::date WHERE assigned_date IS NULL;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS check_in_photo_url text;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS check_out_photo_url text;
ALTER TABLE public.system_notifications ADD COLUMN IF NOT EXISTS employee_id uuid;
ALTER TABLE public.doc_approval_requests ADD COLUMN IF NOT EXISTS generated_snapshot jsonb;
CREATE TABLE IF NOT EXISTS public.hr_notification_receipts (
 notification_id uuid NOT NULL REFERENCES public.system_notifications(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.sys_users(id) ON DELETE CASCADE,
 read_at timestamptz,
 dismissed_at timestamptz,
 PRIMARY KEY(notification_id,user_id)
);
ALTER TABLE public.hr_notification_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_notification_receipts FROM anon,authenticated;
GRANT ALL ON public.hr_notification_receipts TO service_role;
CREATE OR REPLACE FUNCTION public.hr_record_notification_receipt(p_user uuid,p_notification uuid,p_dismiss boolean DEFAULT false) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 INSERT INTO hr_notification_receipts(notification_id,user_id,read_at,dismissed_at)
 VALUES(p_notification,p_user,now(),CASE WHEN p_dismiss THEN now() END)
 ON CONFLICT(notification_id,user_id) DO UPDATE SET
 read_at=coalesce(hr_notification_receipts.read_at,excluded.read_at),
 dismissed_at=coalesce(hr_notification_receipts.dismissed_at,excluded.dismissed_at);
$$;
REVOKE ALL ON FUNCTION public.hr_record_notification_receipt(uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_record_notification_receipt(uuid,uuid,boolean) TO service_role;
DO $$ BEGIN
 IF to_regclass('storage.buckets') IS NOT NULL THEN
  INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  VALUES('attendance_photos','attendance_photos',false,2097152,ARRAY['image/png','image/jpeg'])
  ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=2097152,allowed_mime_types=excluded.allowed_mime_types;
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.hr_auth_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.sys_users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS hr_auth_sessions_user_idx ON public.hr_auth_sessions(user_id, expires_at);
CREATE OR REPLACE FUNCTION public.hr_create_auth_session(p_user uuid,p_expected_hash text,p_session uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE account sys_users;
BEGIN
 SELECT * INTO account FROM sys_users WHERE id=p_user FOR UPDATE;
 IF account.id IS NULL OR NOT account.is_active OR account.password_hash IS DISTINCT FROM p_expected_hash THEN
  RAISE EXCEPTION USING ERRCODE='28000',MESSAGE='Credentials changed. Please sign in again.';
 END IF;
 DELETE FROM hr_auth_sessions WHERE user_id=p_user AND expires_at<now();
 INSERT INTO hr_auth_sessions(id,user_id,expires_at) VALUES(p_session,p_user,now()+interval '7 days');
 RETURN p_session;
END $$;
REVOKE ALL ON FUNCTION public.hr_create_auth_session(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_create_auth_session(uuid,text,uuid) TO service_role;
ALTER TABLE public.hr_auth_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_auth_sessions FROM anon, authenticated;
GRANT ALL ON public.hr_auth_sessions TO service_role;
CREATE OR REPLACE FUNCTION public.hr_revoke_changed_credentials() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.password_hash IS DISTINCT FROM OLD.password_hash OR NOT NEW.is_active THEN
  UPDATE hr_auth_sessions SET revoked_at=now() WHERE user_id=NEW.id AND revoked_at IS NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hr_revoke_changed_credentials() FROM PUBLIC;
DROP TRIGGER IF EXISTS hr_changed_credentials ON public.sys_users;
CREATE TRIGGER hr_changed_credentials AFTER UPDATE OF password_hash,is_active ON public.sys_users
 FOR EACH ROW EXECUTE FUNCTION public.hr_revoke_changed_credentials();
CREATE OR REPLACE FUNCTION public.hr_submit_peer_vote(p_actor uuid,p_nominee uuid,p_score integer,p_comment text DEFAULT NULL)
RETURNS public.peer_voting_records LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor sys_users; result peer_voting_records; month_start timestamptz; month_end timestamptz;
BEGIN
 SELECT * INTO actor FROM sys_users WHERE id=p_actor AND is_active;
 IF actor.id IS NULL OR actor.employee_id IS NULL OR NOT (actor.is_owner OR EXISTS(
  SELECT 1 FROM hr_access_policies WHERE user_id=p_actor AND policy->'personal' ? 'voting'))
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
REVOKE ALL ON FUNCTION public.hr_submit_peer_vote(uuid,uuid,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_submit_peer_vote(uuid,uuid,integer,text) TO service_role;
COMMIT;
