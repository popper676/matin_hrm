import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { supabaseAdmin, dbFetchOne, systemDb } from "../lib/supabase.js";
import { HR_BUCKETS, hrFileUrl } from "../lib/hrStorage.js";
import { can,personalCan,employeeScope, WORKFLOWS } from "../../shared/accessPolicy.js";
const router = express.Router();
router.use(verifyToken);
router.get("/:bucket", async (req, res) => {
  try {
    const { bucket } = req.params,
      filePath = req.query.path;
    if (
      !HR_BUCKETS.includes(bucket) ||
      typeof filePath !== "string" ||
      !filePath ||
      filePath.includes("..")
    )
      return res.sendStatus(400);
    const url = hrFileUrl(bucket, filePath);
    let allowed = !!req.user.is_owner;
    if(!allowed&&bucket==='attendance_photos'){
      const records=await Promise.all(['check_in_photo_url','check_out_photo_url'].map(column=>systemDb.from('attendance_records').select('employee_id').eq(column,url)));
      if(records.some(r=>r.error))throw new Error('Unable to check photo access');
      const scope=employeeScope(req.user);
      allowed=records.flatMap(r=>r.data||[]).some(r=>
        r.employee_id===req.user.employee_id&&(personalCan(req.user,'attendance')||personalCan(req.user,'checkin'))||
        can(req.user,'attendance')&&(scope===null||scope.includes(r.employee_id)));
    }
    const lookup = {
      avatars: ["Employees", "avatar_url"],
      resumes: ["recruitment_candidates", "resume_url"],
      leave_documents: ["Leave_Request", "document_url"],
      sop_videos: ["daily_sops", "proof_video_url"],
    };
    if (!allowed && lookup[bucket]) {
      const [table, column] = lookup[bucket];
      allowed = !!(await dbFetchOne(table, "id", { [column]: url }));
    }
    if (
      !allowed &&
      bucket === "recruitment_documents" &&
      can(req.user, "recruitment")
    )
      allowed = !!(await dbFetchOne("job_opening_files", "id", {
        storage_path: filePath,
      }));
    if (!allowed && bucket === "handover_documents")
      allowed = !!(await dbFetchOne("handover_attachments", "id", {
        file_url: url,
      }));
    if (!allowed && bucket === "leave_documents") {
      const { data } = await systemDb
        .from("hr_approval_requests")
        .select("requester_id,stages,snapshot,workflow_key")
        .eq("workflow_key", "leave");
      allowed = (data || []).some(
        (r) =>
          r.snapshot.document_url === url &&
          (r.requester_id === req.user.id ||
            r.stages.some(
              (s) =>
                s.assignee_id === req.user.id &&
                can(req.user, WORKFLOWS[r.workflow_key].module, s.action),
            )),
      );
    }
    if (!allowed) return res.sendStatus(403);
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(filePath, 60);
    if (error) throw error;
    res.redirect(data.signedUrl);
  } catch {
    res.status(500).json({ error: "Unable to open HR attachment" });
  }
});
export default router;
