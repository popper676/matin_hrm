-- LM Group HR: run ONCE on a NEW Supabase project in SQL Editor.
-- Refuses to run if ANY public application table already exists.
-- Contains no employees, users, passwords, attendance, payrolls, or imported data.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE')
  THEN RAISE EXCEPTION 'Fresh HR setup requires an empty public schema. STOP: choose a NEW Supabase project.';
  END IF;
END $$;
CREATE TABLE public.hr_instance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean UNIQUE NOT NULL DEFAULT true CHECK (singleton),
  purpose text NOT NULL CHECK (purpose = 'lm-hr-fresh'),
  schema_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.hr_instance (purpose) VALUES ('lm-hr-fresh');

CREATE TABLE public."Departments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "Department_name" text NOT NULL,
  "Descriptions" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."shifts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shift_name" text NOT NULL,
  "start_time" time,
  "end_time" time,
  "break_minutes" integer DEFAULT 0,
  "grace_minutes" integer DEFAULT 0,
  "grace_period_minutes" integer DEFAULT 15,
  "is_active" boolean DEFAULT true,
  "description" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."positions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "team" text,
  "level" text,
  "base_salary" numeric DEFAULT 0,
  "is_hiring" boolean DEFAULT false,
  "description" text,
  "department_id" uuid,
  "required_skills" text,
  "reports_to" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."Employees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" text UNIQUE NOT NULL,
  "Full_name" text NOT NULL,
  "email" text,
  "phone" text,
  "Dept_id" uuid,
  "position_id" uuid,
  "Manager_id" uuid,
  "default_shift_id" uuid,
  "hire_date" date,
  "date_of_birth" date,
  "national_id" text,
  "address" text,
  "employment_type" text DEFAULT 'Full-Time',
  "status" text DEFAULT 'Active',
  "employment_status" text DEFAULT 'Active',
  "salary" numeric DEFAULT 0,
  "avatar_url" text,
  "resign_code" text,
  "resign_date" date,
  "resign_reason" text,
  "deleted_at" timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."sys_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "username" text UNIQUE NOT NULL,
  "password_hash" text NOT NULL,
  "role" text NOT NULL CHECK (role IN ('boss','admin','hr_manager','general_manager','finance','manager','employee')),
  "full_name" text,
  "employee_id" uuid UNIQUE,
  "is_active" boolean DEFAULT true,
  "bot_linking_code" text,
  "telegram_chat_id" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."sys_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid,
  "user_name" text,
  "action" text,
  "module" text,
  "details" text,
  "ip_address" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."system_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "recipient_user_id" uuid,
  "recipient_role" text,
  "title" text,
  "message" text,
  "link_url" text,
  "is_read" boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."Leave_type" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "type_name" text NOT NULL,
  "is_paid" boolean DEFAULT true,
  "default_days" numeric DEFAULT 0,
  "entitled_days" numeric DEFAULT 0,
  "description" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."Leave_balances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" uuid NOT NULL,
  "leave_type_id" uuid NOT NULL,
  "year" integer,
  "entitled_days" numeric DEFAULT 0,
  "used_days" numeric DEFAULT 0,
  "remain_days" numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."Leave_Request" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" uuid NOT NULL,
  "leave_type_id" uuid,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "reason" text,
  "status" text DEFAULT 'Pending',
  "document_url" text,
  "e_signature" text,
  "coverage_handover_id" uuid,
  "return_handover_id" uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."attendance_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" uuid NOT NULL,
  "check_in" timestamptz,
  "check_out" timestamptz,
  "overtime_hours" numeric DEFAULT 0,
  "attendance_method" text DEFAULT 'Manual',
  "is_late" boolean DEFAULT false,
  "claimed_shift_id" uuid,
  "shift_approval_status" text,
  "special_shift_reason" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."employee_daily_schedules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" uuid NOT NULL,
  "schedule_date" date NOT NULL,
  "shift_id" uuid,
  "is_off_day" boolean DEFAULT false,
  "notes" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."employee_rosters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" uuid NOT NULL,
  "day_of_week" integer,
  "shift_id" uuid,
  "is_off_day" boolean DEFAULT false,
  "start_date" date,
  "end_date" date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."qr_attendance_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" uuid NOT NULL,
  "token" text UNIQUE NOT NULL,
  "expires_at" timestamptz,
  "used" boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."biometric_device" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "device_name" text,
  "name" text,
  "serial_number" text,
  "ip_address" text,
  "port" integer,
  "location" text,
  "is_active" boolean DEFAULT true,
  "api_key" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."biometric_employees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "biometric_id" text UNIQUE,
  "employee_id" uuid,
  "device_id" uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."biometric_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "device_id" uuid,
  "employee_id" uuid,
  "raw_time" timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."overtime_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" uuid NOT NULL,
  "ot_date" date,
  "start_time" time,
  "end_time" time,
  "requested_hours" numeric DEFAULT 0,
  "reason" text,
  "requested_by" text,
  "status" text DEFAULT 'Pending_Boss_Approval',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."kpis" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" uuid NOT NULL,
  "recent_period" text,
  "target_score" numeric DEFAULT 100,
  "actual_score" numeric DEFAULT 0,
  "review_comment" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."boss_kpi_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "description" text,
  "assigned_to_id" uuid,
  "assigned_to_name" text,
  "deadline" date,
  "status" text DEFAULT 'Assigned',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."payrolls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" uuid NOT NULL,
  "month" text NOT NULL,
  "basic_salary" numeric DEFAULT 0,
  "allowances" numeric DEFAULT 0,
  "deductions" numeric DEFAULT 0,
  "bonus" numeric DEFAULT 0,
  "net_salary" numeric DEFAULT 0,
  "kpi_id" uuid,
  "final_kpi_score" numeric,
  "payment_status" text DEFAULT 'Pending',
  "notes" text,
  "calculation_source" text DEFAULT 'auto',
  "workspace_notes" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."company_payroll_policy" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" text UNIQUE NOT NULL,
  "salary_divisor" integer DEFAULT 26 CHECK (salary_divisor BETWEEN 1 AND 365),
  "weekly_holidays" text[] DEFAULT ARRAY['SUNDAY'],
  "timezone" text DEFAULT 'Asia/Bangkok',
  "approved_leave_counts_as_punctual" boolean DEFAULT true,
  "peer_score_max_stars" integer DEFAULT 5,
  "default_sop_score" numeric DEFAULT 100,
  "default_peer_score" numeric DEFAULT 100,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."kpi_settings" (
  "id" integer PRIMARY KEY,
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."recruitment_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "position_id" uuid,
  "full_name" text NOT NULL,
  "email" text,
  "phone" text,
  "notes" text,
  "status" text DEFAULT 'Applied',
  "resume_url" text,
  "ai_score" numeric,
  "ai_reasoning" text,
  "interview_guide" text,
  "interview_date" timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."employee_onboarding" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" uuid NOT NULL,
  "status" text DEFAULT 'Pre-boarding',
  "start_date" date,
  "notes" text,
  "completion_pct" integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."onboarding_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_name" text NOT NULL,
  "category" text,
  "assigned_to_role" text,
  "due_days_after_hire" integer DEFAULT 1,
  "is_preboarding" boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."onboarding_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "onboarding_id" uuid NOT NULL,
  "task_id" uuid,
  "status" text DEFAULT 'Pending',
  "due_date" date,
  "completed_at" timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."corporate_offboarding" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" uuid NOT NULL,
  "last_working_date" date,
  "last_working_day" date,
  "termination_reason" text,
  "reason" text,
  "exit_type" text,
  "resignation_date" date,
  "settlement_status" text DEFAULT 'Hold',
  "handover_id" uuid,
  "handover_required" boolean DEFAULT true,
  "handover_waived_reason" text,
  "handover_waived_by" uuid,
  "knowledge_transfer" boolean DEFAULT false,
  "assets_returned" boolean DEFAULT false,
  "laptop_returned" boolean DEFAULT false,
  "access_card_returned" boolean DEFAULT false,
  "access_revoked" boolean DEFAULT false,
  "exit_interview_done" boolean DEFAULT false,
  "final_payroll_done" boolean DEFAULT false,
  "nda_signed" boolean DEFAULT false,
  "notes" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."offboarding_case_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "offboarding_id" uuid NOT NULL,
  "task_name" text,
  "category" text,
  "responsible" text,
  "status" text DEFAULT 'Pending',
  "due_date" date,
  "completed_at" timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."exit_interviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "offboarding_id" uuid NOT NULL,
  "employee_id" uuid,
  "reason_for_leaving" text,
  "job_satisfaction" integer,
  "work_environment" integer,
  "management_rating" integer,
  "compensation_benefits" integer,
  "career_growth" integer,
  "recommend_company" boolean,
  "return_future" boolean,
  "additional_comments" text,
  "highlights" text,
  "improvements" text,
  "interviewer_name" text,
  "interview_date" date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."employee_handovers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "outgoing_employee_id" uuid NOT NULL,
  "successor_employee_id" uuid,
  "successor_type" text DEFAULT 'existing',
  "trigger_type" text DEFAULT 'exit',
  "offboarding_id" uuid,
  "effective_date" date,
  "handover_deadline" date,
  "status" text DEFAULT 'draft',
  "completion_pct" integer DEFAULT 0,
  "created_by_user_id" uuid,
  "approved_by_user_id" uuid,
  "approved_at" timestamptz,
  "waived_by_user_id" uuid,
  "waived_at" timestamptz,
  "waived_reason" text,
  "submitted_at" timestamptz,
  "notes" text,
  "leave_request_id" uuid,
  "expected_return_date" date,
  "parent_handover_id" uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."handover_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "handover_id" uuid NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "category" text DEFAULT 'knowledge_transfer',
  "owner_role" text DEFAULT 'outgoing',
  "sort_order" integer DEFAULT 0,
  "is_required" boolean DEFAULT true,
  "status" text DEFAULT 'pending',
  "outgoing_notes" text,
  "evidence_url" text,
  "successor_acknowledged" boolean DEFAULT false,
  "successor_ack_at" timestamptz,
  "completed_at" timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."handover_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "handover_id" uuid NOT NULL,
  "handover_item_id" uuid,
  "uploaded_by_user_id" uuid,
  "file_name" text,
  "file_url" text,
  "file_type" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."employee_career_timeline" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" uuid NOT NULL,
  "event_type" text,
  "title" text,
  "description" text,
  "previous_position" text,
  "new_position" text,
  "previous_salary" numeric,
  "new_salary" numeric,
  "effective_date" date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."sop_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "position_id" uuid UNIQUE,
  "task_description" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."daily_sops" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" uuid NOT NULL,
  "task_description" text,
  "content" text,
  "title" text,
  "assigned_date" date,
  "assigned_by" uuid,
  "is_completed" boolean DEFAULT false,
  "completed_at" timestamptz,
  "proof_video_url" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."peer_voting_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "voter_id" uuid,
  "nominee_id" uuid,
  "score" numeric,
  "comment" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."peer_votes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "voter_id" uuid,
  "nominee_id" uuid,
  "score" numeric,
  "attendance_score" numeric,
  "punctuality_score" numeric,
  "sop_score" numeric,
  "peer_score" numeric,
  "initiative_score" numeric,
  "comment" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."announcements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "content" text,
  "priority" text DEFAULT 'Normal',
  "target_role" text DEFAULT 'All',
  "is_pinned" boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."employee_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" uuid,
  "title" text NOT NULL,
  "doc_type" text,
  "category" text,
  "description" text,
  "file_url" text,
  "effective_date" date,
  "status" text DEFAULT 'ACTIVE',
  "uploaded_by_user_id" uuid,
  "requested_by_user_id" uuid,
  "boss_signature" text,
  "boss_signed_at" timestamptz,
  "hr_signature" text,
  "hr_signed_at" timestamptz,
  "rejection_reason" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."doc_approval_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" uuid,
  "title" text NOT NULL,
  "doc_type" text,
  "category" text,
  "description" text,
  "file_url" text,
  "effective_date" date,
  "status" text DEFAULT 'PENDING_BOSS',
  "requested_by_user_id" uuid,
  "boss_signature" text,
  "boss_signed_at" timestamptz,
  "hr_signature" text,
  "hr_signed_at" timestamptz,
  "rejection_reason" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."rewards_and_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" uuid NOT NULL,
  "claim_type" text,
  "custom_type" text,
  "requested_amount" numeric DEFAULT 0,
  "approved_amount" numeric,
  "description" text,
  "proof_image_url" text,
  "status" text DEFAULT 'PENDING',
  "requested_by" text,
  "approved_by" uuid,
  "admin_remarks" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."hrm_manual_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "order_index" integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."hrm_manual_articles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "category_id" uuid,
  "title" text NOT NULL,
  "draft_content" text,
  "published_content" text,
  "status" text DEFAULT 'draft',
  "version" integer DEFAULT 0,
  "order_index" integer DEFAULT 0,
  "created_by" uuid,
  "updated_by" uuid,
  "published_by" uuid,
  "published_at" timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."hrm_manual_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "article_id" uuid NOT NULL,
  "content" text,
  "version" integer,
  "created_by" uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."hrm_manual_permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" uuid UNIQUE NOT NULL,
  "can_edit" boolean DEFAULT false,
  "can_publish" boolean DEFAULT false,
  "can_manage_editors" boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."boss_chat_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "title" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public."boss_chat_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL,
  "role" text,
  "content" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public."Employees" ADD FOREIGN KEY ("Dept_id") REFERENCES public."Departments" (id) ON DELETE NO ACTION;
ALTER TABLE public."Employees" ADD FOREIGN KEY ("position_id") REFERENCES public."positions" (id) ON DELETE NO ACTION;
ALTER TABLE public."Employees" ADD FOREIGN KEY ("Manager_id") REFERENCES public."Employees" (id) ON DELETE NO ACTION;
ALTER TABLE public."Employees" ADD FOREIGN KEY ("default_shift_id") REFERENCES public."shifts" (id) ON DELETE NO ACTION;
ALTER TABLE public."sys_users" ADD FOREIGN KEY ("employee_id") REFERENCES public."Employees" (id) ON DELETE NO ACTION;
ALTER TABLE public."Leave_balances" ADD FOREIGN KEY ("employee_id") REFERENCES public."Employees" (id) ON DELETE NO ACTION;
ALTER TABLE public."Leave_balances" ADD FOREIGN KEY ("leave_type_id") REFERENCES public."Leave_type" (id) ON DELETE NO ACTION;
ALTER TABLE public."Leave_Request" ADD FOREIGN KEY ("employee_id") REFERENCES public."Employees" (id) ON DELETE NO ACTION;
ALTER TABLE public."Leave_Request" ADD FOREIGN KEY ("leave_type_id") REFERENCES public."Leave_type" (id) ON DELETE NO ACTION;
ALTER TABLE public."attendance_records" ADD FOREIGN KEY ("employee_id") REFERENCES public."Employees" (id) ON DELETE NO ACTION;
ALTER TABLE public."employee_daily_schedules" ADD FOREIGN KEY ("employee_id") REFERENCES public."Employees" (id) ON DELETE NO ACTION;
ALTER TABLE public."employee_daily_schedules" ADD FOREIGN KEY ("shift_id") REFERENCES public."shifts" (id) ON DELETE NO ACTION;
ALTER TABLE public."employee_rosters" ADD FOREIGN KEY ("employee_id") REFERENCES public."Employees" (id) ON DELETE NO ACTION;
ALTER TABLE public."employee_rosters" ADD FOREIGN KEY ("shift_id") REFERENCES public."shifts" (id) ON DELETE NO ACTION;
ALTER TABLE public."payrolls" ADD FOREIGN KEY ("employee_id") REFERENCES public."Employees" (id) ON DELETE NO ACTION;
ALTER TABLE public."recruitment_candidates" ADD FOREIGN KEY ("position_id") REFERENCES public."positions" (id) ON DELETE NO ACTION;
ALTER TABLE public."onboarding_assignments" ADD FOREIGN KEY ("onboarding_id") REFERENCES public."employee_onboarding" (id) ON DELETE NO ACTION;
ALTER TABLE public."onboarding_assignments" ADD FOREIGN KEY ("task_id") REFERENCES public."onboarding_tasks" (id) ON DELETE NO ACTION;
ALTER TABLE public."handover_items" ADD FOREIGN KEY ("handover_id") REFERENCES public."employee_handovers" (id) ON DELETE CASCADE;
ALTER TABLE public."handover_attachments" ADD FOREIGN KEY ("handover_id") REFERENCES public."employee_handovers" (id) ON DELETE CASCADE;
ALTER TABLE public."hrm_manual_articles" ADD FOREIGN KEY ("category_id") REFERENCES public."hrm_manual_categories" (id) ON DELETE NO ACTION;
ALTER TABLE public."hrm_manual_articles" ADD FOREIGN KEY ("updated_by") REFERENCES public."sys_users" (id) ON DELETE NO ACTION;
ALTER TABLE public."hrm_manual_versions" ADD FOREIGN KEY ("article_id") REFERENCES public."hrm_manual_articles" (id) ON DELETE NO ACTION;
ALTER TABLE public."hrm_manual_versions" ADD FOREIGN KEY ("created_by") REFERENCES public."sys_users" (id) ON DELETE NO ACTION;
ALTER TABLE public."hrm_manual_permissions" ADD FOREIGN KEY ("employee_id") REFERENCES public."Employees" (id) ON DELETE NO ACTION;
ALTER TABLE public."boss_chat_sessions" ADD FOREIGN KEY ("user_id") REFERENCES public."sys_users" (id) ON DELETE CASCADE;
ALTER TABLE public."boss_chat_messages" ADD FOREIGN KEY ("session_id") REFERENCES public."boss_chat_sessions" (id) ON DELETE CASCADE;
CREATE UNIQUE INDEX ON public."payrolls" ("employee_id", "month");
CREATE UNIQUE INDEX ON public."employee_daily_schedules" ("employee_id", "schedule_date");
CREATE UNIQUE INDEX ON public."employee_rosters" ("employee_id", "day_of_week");
CREATE UNIQUE INDEX ON public."Leave_balances" ("employee_id", "leave_type_id", "year");
CREATE SEQUENCE public.hr_resign_sequence;
CREATE FUNCTION public.generate_resign_code() RETURNS text LANGUAGE sql SET search_path=public AS $$
 SELECT 'RES-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.hr_resign_sequence')::text, 5, '0')
$$;
ALTER TABLE public."hr_instance" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."hr_instance" FROM anon, authenticated;
GRANT ALL ON public."hr_instance" TO service_role;
ALTER TABLE public."Departments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."Departments" FROM anon, authenticated;
GRANT ALL ON public."Departments" TO service_role;
ALTER TABLE public."shifts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."shifts" FROM anon, authenticated;
GRANT ALL ON public."shifts" TO service_role;
ALTER TABLE public."positions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."positions" FROM anon, authenticated;
GRANT ALL ON public."positions" TO service_role;
ALTER TABLE public."Employees" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."Employees" FROM anon, authenticated;
GRANT ALL ON public."Employees" TO service_role;
ALTER TABLE public."sys_users" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."sys_users" FROM anon, authenticated;
GRANT ALL ON public."sys_users" TO service_role;
ALTER TABLE public."sys_audit_logs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."sys_audit_logs" FROM anon, authenticated;
GRANT ALL ON public."sys_audit_logs" TO service_role;
ALTER TABLE public."system_notifications" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."system_notifications" FROM anon, authenticated;
GRANT ALL ON public."system_notifications" TO service_role;
ALTER TABLE public."Leave_type" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."Leave_type" FROM anon, authenticated;
GRANT ALL ON public."Leave_type" TO service_role;
ALTER TABLE public."Leave_balances" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."Leave_balances" FROM anon, authenticated;
GRANT ALL ON public."Leave_balances" TO service_role;
ALTER TABLE public."Leave_Request" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."Leave_Request" FROM anon, authenticated;
GRANT ALL ON public."Leave_Request" TO service_role;
ALTER TABLE public."attendance_records" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."attendance_records" FROM anon, authenticated;
GRANT ALL ON public."attendance_records" TO service_role;
ALTER TABLE public."employee_daily_schedules" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."employee_daily_schedules" FROM anon, authenticated;
GRANT ALL ON public."employee_daily_schedules" TO service_role;
ALTER TABLE public."employee_rosters" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."employee_rosters" FROM anon, authenticated;
GRANT ALL ON public."employee_rosters" TO service_role;
ALTER TABLE public."qr_attendance_tokens" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."qr_attendance_tokens" FROM anon, authenticated;
GRANT ALL ON public."qr_attendance_tokens" TO service_role;
ALTER TABLE public."biometric_device" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."biometric_device" FROM anon, authenticated;
GRANT ALL ON public."biometric_device" TO service_role;
ALTER TABLE public."biometric_employees" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."biometric_employees" FROM anon, authenticated;
GRANT ALL ON public."biometric_employees" TO service_role;
ALTER TABLE public."biometric_logs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."biometric_logs" FROM anon, authenticated;
GRANT ALL ON public."biometric_logs" TO service_role;
ALTER TABLE public."overtime_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."overtime_requests" FROM anon, authenticated;
GRANT ALL ON public."overtime_requests" TO service_role;
ALTER TABLE public."kpis" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."kpis" FROM anon, authenticated;
GRANT ALL ON public."kpis" TO service_role;
ALTER TABLE public."boss_kpi_assignments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."boss_kpi_assignments" FROM anon, authenticated;
GRANT ALL ON public."boss_kpi_assignments" TO service_role;
ALTER TABLE public."payrolls" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."payrolls" FROM anon, authenticated;
GRANT ALL ON public."payrolls" TO service_role;
ALTER TABLE public."company_payroll_policy" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."company_payroll_policy" FROM anon, authenticated;
GRANT ALL ON public."company_payroll_policy" TO service_role;
ALTER TABLE public."kpi_settings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."kpi_settings" FROM anon, authenticated;
GRANT ALL ON public."kpi_settings" TO service_role;
ALTER TABLE public."recruitment_candidates" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."recruitment_candidates" FROM anon, authenticated;
GRANT ALL ON public."recruitment_candidates" TO service_role;
ALTER TABLE public."employee_onboarding" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."employee_onboarding" FROM anon, authenticated;
GRANT ALL ON public."employee_onboarding" TO service_role;
ALTER TABLE public."onboarding_tasks" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."onboarding_tasks" FROM anon, authenticated;
GRANT ALL ON public."onboarding_tasks" TO service_role;
ALTER TABLE public."onboarding_assignments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."onboarding_assignments" FROM anon, authenticated;
GRANT ALL ON public."onboarding_assignments" TO service_role;
ALTER TABLE public."corporate_offboarding" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."corporate_offboarding" FROM anon, authenticated;
GRANT ALL ON public."corporate_offboarding" TO service_role;
ALTER TABLE public."offboarding_case_tasks" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."offboarding_case_tasks" FROM anon, authenticated;
GRANT ALL ON public."offboarding_case_tasks" TO service_role;
ALTER TABLE public."exit_interviews" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."exit_interviews" FROM anon, authenticated;
GRANT ALL ON public."exit_interviews" TO service_role;
ALTER TABLE public."employee_handovers" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."employee_handovers" FROM anon, authenticated;
GRANT ALL ON public."employee_handovers" TO service_role;
ALTER TABLE public."handover_items" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."handover_items" FROM anon, authenticated;
GRANT ALL ON public."handover_items" TO service_role;
ALTER TABLE public."handover_attachments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."handover_attachments" FROM anon, authenticated;
GRANT ALL ON public."handover_attachments" TO service_role;
ALTER TABLE public."employee_career_timeline" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."employee_career_timeline" FROM anon, authenticated;
GRANT ALL ON public."employee_career_timeline" TO service_role;
ALTER TABLE public."sop_templates" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."sop_templates" FROM anon, authenticated;
GRANT ALL ON public."sop_templates" TO service_role;
ALTER TABLE public."daily_sops" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."daily_sops" FROM anon, authenticated;
GRANT ALL ON public."daily_sops" TO service_role;
ALTER TABLE public."peer_voting_records" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."peer_voting_records" FROM anon, authenticated;
GRANT ALL ON public."peer_voting_records" TO service_role;
ALTER TABLE public."peer_votes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."peer_votes" FROM anon, authenticated;
GRANT ALL ON public."peer_votes" TO service_role;
ALTER TABLE public."announcements" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."announcements" FROM anon, authenticated;
GRANT ALL ON public."announcements" TO service_role;
ALTER TABLE public."employee_documents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."employee_documents" FROM anon, authenticated;
GRANT ALL ON public."employee_documents" TO service_role;
ALTER TABLE public."doc_approval_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."doc_approval_requests" FROM anon, authenticated;
GRANT ALL ON public."doc_approval_requests" TO service_role;
ALTER TABLE public."rewards_and_claims" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."rewards_and_claims" FROM anon, authenticated;
GRANT ALL ON public."rewards_and_claims" TO service_role;
ALTER TABLE public."hrm_manual_categories" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."hrm_manual_categories" FROM anon, authenticated;
GRANT ALL ON public."hrm_manual_categories" TO service_role;
ALTER TABLE public."hrm_manual_articles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."hrm_manual_articles" FROM anon, authenticated;
GRANT ALL ON public."hrm_manual_articles" TO service_role;
ALTER TABLE public."hrm_manual_versions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."hrm_manual_versions" FROM anon, authenticated;
GRANT ALL ON public."hrm_manual_versions" TO service_role;
ALTER TABLE public."hrm_manual_permissions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."hrm_manual_permissions" FROM anon, authenticated;
GRANT ALL ON public."hrm_manual_permissions" TO service_role;
ALTER TABLE public."boss_chat_sessions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."boss_chat_sessions" FROM anon, authenticated;
GRANT ALL ON public."boss_chat_sessions" TO service_role;
ALTER TABLE public."boss_chat_messages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."boss_chat_messages" FROM anon, authenticated;
GRANT ALL ON public."boss_chat_messages" TO service_role;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.hr_resign_sequence TO service_role;
REVOKE ALL ON FUNCTION public.generate_resign_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_resign_code() TO service_role;
CREATE FUNCTION public.bootstrap_hr_owner(expected_instance uuid, owner_username text, owner_name text, owner_password_hash text)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE owner_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(7319462);
  IF NOT EXISTS (SELECT 1 FROM public.hr_instance WHERE id=expected_instance AND purpose='lm-hr-fresh') THEN
    RAISE EXCEPTION 'Wrong HR instance';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sys_users) OR EXISTS (SELECT 1 FROM public."Employees") THEN
    RAISE EXCEPTION 'Owner setup requires empty users and employees. Existing records will not be deleted.';
  END IF;
  INSERT INTO public.sys_users (username,password_hash,role,full_name,is_active)
  VALUES (owner_username,owner_password_hash,'boss',owner_name,true) RETURNING id INTO owner_id;
  RETURN owner_id;
END $$;
REVOKE ALL ON FUNCTION public.bootstrap_hr_owner(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_hr_owner(uuid,text,text,text) TO service_role;
COMMIT;
-- Copy this ID into server/.env as HR_INSTANCE_ID:
SELECT id AS hr_instance_id, purpose, schema_version FROM public.hr_instance;
NOTIFY pgrst, 'reload schema';
