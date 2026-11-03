-- Existing HR project: run after 010. Configuration only; preserves employees, routes and business history.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.hr_instance WHERE purpose='lm-hr-fresh') OR to_regclass('public.hr_employee_business_sets') IS NULL THEN RAISE EXCEPTION 'Install HR migrations through 010 first'; END IF;
END $$;
SELECT set_config('hr.brand_write','on',true);
CREATE TABLE IF NOT EXISTS public.hr_brand_settings(
 id boolean PRIMARY KEY DEFAULT true CHECK(id),settings jsonb NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),updated_by uuid REFERENCES public.sys_users(id),updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.hr_brand_settings(id,settings) VALUES(true,'{"name":"Unlock Your Future","tagline":"People & HR","accent":"#d21d3c","website_url":"","interview_subject":"Interview invitation — {{position}} at {{company}}","interview_body":"Dear {{candidate}},\n\nYou are invited to interview for {{position}} at {{company}}.\n\n{{meeting_details}}\n\nPlease reply if you need to reschedule or ask a question.\n\n{{signature}}","email_signature":"Human Resources\n{{company}}","logo":null}') ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.hr_owner_setup_reviews(
 step text PRIMARY KEY CHECK(step IN ('branding','businesses','employees','access','approvals','leave','payroll')),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),version integer NOT NULL DEFAULT 1 CHECK(version>0),
 reviewed_by uuid NOT NULL REFERENCES public.sys_users(id),reviewed_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['hr_brand_settings','hr_owner_setup_reviews'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
 IF to_regclass('storage.buckets') IS NOT NULL THEN
  INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  VALUES('branding_assets','branding_assets',false,2097152,ARRAY['image/png','image/jpeg'])
  ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=2097152,allowed_mime_types=EXCLUDED.allowed_mime_types;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.hr_guard_brand_settings() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' OR current_setting('hr.brand_write',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Use Owner branding and setup settings'; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_brand_settings ON public.hr_brand_settings;
CREATE TRIGGER guard_brand_settings BEFORE INSERT OR UPDATE OR DELETE ON public.hr_brand_settings FOR EACH ROW EXECUTE FUNCTION public.hr_guard_brand_settings();
DROP TRIGGER IF EXISTS guard_owner_setup ON public.hr_owner_setup_reviews;
CREATE TRIGGER guard_owner_setup BEFORE INSERT OR UPDATE OR DELETE ON public.hr_owner_setup_reviews FOR EACH ROW EXECUTE FUNCTION public.hr_guard_brand_settings();
CREATE OR REPLACE FUNCTION public.hr_save_branding(p_actor uuid,p_settings jsonb,p_version integer) RETURNS public.hr_brand_settings
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_brand_settings; BEGIN
 IF NOT EXISTS(SELECT 1 FROM sys_users WHERE id=p_actor AND is_owner AND is_active) THEN RAISE EXCEPTION 'Owner permission required';END IF;
 SELECT * INTO r FROM hr_brand_settings WHERE id FOR UPDATE;
 IF p_version IS NULL OR r.id IS NULL OR r.version<>p_version THEN RAISE EXCEPTION 'Branding changed. Reload before saving';END IF;
 IF jsonb_typeof(p_settings) IS DISTINCT FROM 'object' OR length(trim(COALESCE(p_settings->>'name','')))<2 OR length(p_settings->>'name')>80 OR length(COALESCE(p_settings->>'tagline',''))>80 OR COALESCE(p_settings->>'accent','') !~ '^#[a-fA-F0-9]{6}$' OR length(COALESCE(p_settings->>'website_url',''))>300 OR length(COALESCE(p_settings->>'interview_subject','')) NOT BETWEEN 1 AND 180 OR length(COALESCE(p_settings->>'interview_body','')) NOT BETWEEN 1 AND 6000 OR length(COALESCE(p_settings->>'email_signature','')) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid branding settings';END IF;
 PERFORM set_config('hr.brand_write','on',true);
 UPDATE hr_brand_settings SET settings=p_settings,version=version+1,updated_by=p_actor,updated_at=now() WHERE id RETURNING * INTO r;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'SAVE','Branding','version '||r.version);RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.hr_review_owner_setup(p_actor uuid,p_step text,p_fingerprint text,p_version integer) RETURNS public.hr_owner_setup_reviews
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r hr_owner_setup_reviews; BEGIN
 IF NOT EXISTS(SELECT 1 FROM sys_users WHERE id=p_actor AND is_owner AND is_active) THEN RAISE EXCEPTION 'Owner permission required';END IF;
 IF p_step NOT IN ('branding','businesses','employees','access','approvals','leave','payroll') OR p_fingerprint !~ '^[a-f0-9]{64}$' OR p_fingerprint IS NULL THEN RAISE EXCEPTION 'Invalid setup review';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('owner-setup:'||p_step));
 SELECT * INTO r FROM hr_owner_setup_reviews WHERE step=p_step FOR UPDATE;
 IF p_version IS NULL OR p_version<0 OR COALESCE(r.version,0)<>p_version THEN RAISE EXCEPTION 'Setup review changed. Reload before saving';END IF;
 PERFORM set_config('hr.brand_write','on',true);
 INSERT INTO hr_owner_setup_reviews(step,fingerprint,reviewed_by) VALUES(p_step,p_fingerprint,p_actor)
 ON CONFLICT(step) DO UPDATE SET fingerprint=EXCLUDED.fingerprint,version=hr_owner_setup_reviews.version+1,reviewed_by=p_actor,reviewed_at=now() RETURNING * INTO r;
 INSERT INTO sys_audit_logs(user_id,action,module,details) VALUES(p_actor,'REVIEW','Owner setup',p_step||' version '||r.version);RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.hr_guard_brand_settings(),public.hr_save_branding(uuid,jsonb,integer),public.hr_review_owner_setup(uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_save_branding(uuid,jsonb,integer),public.hr_review_owner_setup(uuid,text,text,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
