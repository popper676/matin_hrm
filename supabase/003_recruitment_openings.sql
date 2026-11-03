-- UYF Recruitment upgrade. Run in the EXISTING UYF HR project's SQL Editor.
-- Preserves users, employees, positions and candidates. Safe to run again.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.hr_instance WHERE purpose = 'lm-hr-fresh') THEN
  RAISE EXCEPTION 'This upgrade requires the initialized UYF HR database';
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.job_openings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 position_id uuid NOT NULL REFERENCES public.positions(id),
 title text NOT NULL,
 department text NOT NULL DEFAULT '',
 job_description text NOT NULL DEFAULT '',
 required_requirements text NOT NULL DEFAULT '',
 preferred_requirements text NOT NULL DEFAULT '',
 employment_type text NOT NULL DEFAULT 'Full-Time',
 work_mode text NOT NULL DEFAULT 'On-site',
 location text NOT NULL DEFAULT '',
 work_schedule text NOT NULL DEFAULT '',
 salary_min numeric, salary_max numeric,
 currency text NOT NULL DEFAULT 'THB',
 salary_visible boolean NOT NULL DEFAULT false,
 benefits text NOT NULL DEFAULT '',
 vacancies integer NOT NULL DEFAULT 1 CHECK (vacancies BETWEEN 1 AND 1000),
 deadline date,
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
 revision integer NOT NULL DEFAULT 0,
 published_snapshot jsonb,
 published_at timestamptz,
 created_by uuid REFERENCES public.sys_users(id),
 updated_by uuid REFERENCES public.sys_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (salary_min IS NULL OR salary_min >= 0),
 CHECK (salary_max IS NULL OR salary_max >= 0),
 CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_max >= salary_min)
);
CREATE TABLE IF NOT EXISTS public.job_opening_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 opening_id uuid NOT NULL REFERENCES public.job_openings(id) ON DELETE CASCADE,
 file_name text NOT NULL,
 storage_path text NOT NULL UNIQUE,
 mime_type text NOT NULL,
 size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
 extracted_text text NOT NULL DEFAULT '',
 extraction_status text NOT NULL CHECK (extraction_status IN ('ready','empty','failed','truncated')),
 uploaded_by uuid REFERENCES public.sys_users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.recruitment_candidates
 ADD COLUMN IF NOT EXISTS opening_id uuid REFERENCES public.job_openings(id),
 ADD COLUMN IF NOT EXISTS opening_snapshot jsonb,
 ADD COLUMN IF NOT EXISTS ai_evaluation jsonb,
 ADD COLUMN IF NOT EXISTS resume_text text,
 ADD COLUMN IF NOT EXISTS form_data jsonb;
CREATE INDEX IF NOT EXISTS job_openings_status_idx ON public.job_openings(status);
CREATE INDEX IF NOT EXISTS job_opening_files_opening_idx ON public.job_opening_files(opening_id);
CREATE INDEX IF NOT EXISTS recruitment_candidates_opening_idx ON public.recruitment_candidates(opening_id);
ALTER TABLE public.job_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_opening_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_openings, public.job_opening_files FROM anon, authenticated;
GRANT ALL ON public.job_openings, public.job_opening_files TO service_role;
-- Files stay private. Careers exposes approved text, never source attachments.
DO $$ BEGIN
 IF to_regclass('storage.buckets') IS NOT NULL THEN
  INSERT INTO storage.buckets(id,name,public,file_size_limit)
   VALUES ('recruitment_documents','recruitment_documents',false,10485760)
   ON CONFLICT (id) DO UPDATE SET public=false, file_size_limit=10485760;
 END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
