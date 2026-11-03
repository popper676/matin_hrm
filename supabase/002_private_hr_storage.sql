-- Run after 001 in the NEW project's SQL Editor. No objects are imported.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.hr_instance WHERE purpose='lm-hr-fresh') THEN
    RAISE EXCEPTION 'Initialize the new HR instance first';
  END IF;
END $$;
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
 ('avatars','avatars',false,10485760),
 ('resumes','resumes',false,10485760),
 ('leave_documents','leave_documents',false,10485760),
 ('handover_documents','handover_documents',false,10485760),
 ('sop_videos','sop_videos',false,52428800),
 ('company_documents','company_documents',false,10485760)
ON CONFLICT (id) DO NOTHING;
COMMIT;
