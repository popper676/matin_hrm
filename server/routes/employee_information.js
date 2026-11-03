import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import { verifyToken } from "../middleware/auth.js";
import { systemDb } from "../shared/db/index.js";
import { UUID, can, employeeScope } from "../../shared/accessPolicy.js";
import {
  cleanInformation,
  ownInformation,
  informationVisible,
  documentVisible,
  redactInformation,
  validateInformationFile,
  canReviewInformation,
  INFORMATION_BUCKET,
} from "../lib/employeeInformation.js";
const router = express.Router();
router.use(verifyToken);
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
const checked = (r) => {
  if (r.error) throw r.error;
  return r.data;
};
const first = (r) => (Array.isArray(r) ? r[0] : r);
const fail = (res, e) =>
  res
    .status(
      e.status ||
        (/Form changed|profile changed|already|open form|cannot be edited/.test(
          e.message,
        )
          ? 409
          : /permission|outside your access|assigned|account is disabled|active employee account/.test(
                e.message,
              )
            ? 403
            : 400),
    )
    .json({ error: e.message });
async function recordFor(req) {
  if (!UUID.test(req.params.id || ""))
    throw Object.assign(new Error("Invalid form"), { status: 400 });
  const record = checked(
    await systemDb
      .from("hr_employee_information")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle(),
  );
  if (!record)
    throw Object.assign(new Error("Form not found"), { status: 404 });
  let assigned = false;
  if (record.approval_id) {
    const approval = checked(
      await systemDb
        .from("hr_approval_requests")
        .select("stages,history,status,current_stage")
        .eq("id", record.approval_id)
        .maybeSingle(),
    );
    record.review_history = approval?.history || [];
    record.review_status = approval?.status;
    assigned =
      (canReviewInformation(req.user) &&
        approval?.stages.some((s) => s.assignee_id === req.user.id)) ||
      false;
  }
  if (!informationVisible(req.user, record) && !assigned)
    throw Object.assign(new Error("This form is outside your access"), {
      status: 403,
    });
  return { record, assigned };
}
async function employeeSnapshot(id) {
  const e = checked(
    await systemDb
      .from("Employees")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
  );
  if (!e) throw Object.assign(new Error("Employee not found"), { status: 404 });
  const [dept, pos, manager] = await Promise.all([
    e.Dept_id
      ? systemDb
          .from("Departments")
          .select("Department_name")
          .eq("id", e.Dept_id)
          .maybeSingle()
      : null,
    e.position_id
      ? systemDb
          .from("positions")
          .select("title")
          .eq("id", e.position_id)
          .maybeSingle()
      : null,
    e.Manager_id
      ? systemDb
          .from("Employees")
          .select("Full_name")
          .eq("id", e.Manager_id)
          .maybeSingle()
      : null,
  ]);
  return {
    employee: e,
    employment: {
      employee_number: e.employee_id,
      department: dept ? checked(dept)?.Department_name : "",
      position: pos ? checked(pos)?.title : "",
      supervisor: manager ? checked(manager)?.Full_name : "",
      employment_type: e.employment_type,
      hire_date: e.hire_date,
      employment_status: e.employment_status,
      salary: e.salary,
      probation_period: e.probation_period,
      work_location: e.work_location,
    },
  };
}
router.get("/", async (req, res) => {
  try {
    const id = req.query.employee_id || req.user.employee_id;
    if (!id)
      return res.json({
        employee: null,
        records: [],
        seed: {},
        employment: {},
        workflow_enabled: false,
      });
    if (!UUID.test(id)) throw new Error("Invalid employee");
    if (!informationVisible(req.user, { employee_id: id }))
      return res.sendStatus(403);
    const [info, profile, rows, setting] = await Promise.all([
      employeeSnapshot(id),
      systemDb
        .from("hr_employee_profiles")
        .select("*")
        .eq("employee_id", id)
        .maybeSingle(),
      systemDb
        .from("hr_employee_information")
        .select("*")
        .eq("employee_id", id)
        .order("created_at", { ascending: false }),
      systemDb
        .from("hr_workflow_settings")
        .select("enabled")
        .eq("workflow_key", "employee_information")
        .maybeSingle(),
    ]);
    const e = info.employee,
      approved = checked(profile),
      employment = info.employment;
    const seed = {
      ...approved?.data,
      full_name: e.Full_name,
      phone: e.phone || "",
      email: e.email || "",
      address: e.address || "",
      date_of_birth: e.date_of_birth || "",
      national_id: e.national_id || "",
    };
    const records = checked(rows);
    const approvalIds = records.map((r) => r.approval_id).filter(Boolean);
    const approvals = approvalIds.length
      ? checked(
          await systemDb
            .from("hr_approval_requests")
            .select("id,history,status")
            .in("id", approvalIds),
        )
      : [];
    for (const r of records) {
      const a = approvals.find((a) => a.id === r.approval_id);
      r.review_history = a?.history || [];
      r.review_status = a?.status;
    }
    const safe = redactInformation(
      {
        employee_id: id,
        payload: seed,
        employment_snapshot: employment,
        attachments: [],
        status: "approved",
      },
      req.user,
    );
    res.json({
      employee: { id, employee_number: e.employee_id, full_name: e.Full_name },
      seed: safe.payload,
      employment: safe.employment_snapshot,
      records: records.map((r) => redactInformation(r, req.user)),
      workflow_enabled: !!checked(setting)?.enabled,
      can_start: ownInformation(req.user, id),
      can_edit_employment: can(req.user, "employees", "edit"),
      profile_version: approved?.version || 0,
    });
  } catch (e) {
    fail(res, e);
  }
});
router.put("/employment/:employee", async (req, res) => {
  try {
    const id = req.params.employee,
      scope = employeeScope(req.user);
    if (
      !UUID.test(id) ||
      !can(req.user, "employees", "edit") ||
      (scope !== null && !scope.includes(id))
    )
      return res.sendStatus(403);
    const { probation_period, work_location } = req.body;
    if (
      [probation_period, work_location].some(
        (v) => typeof v !== "string" || v.length > 250,
      ) ||
      Object.keys(req.body).some(
        (k) => !["probation_period", "work_location"].includes(k),
      )
    )
      throw new Error(
        "Enter a probation period and work location up to 250 characters",
      );
    checked(
      await systemDb.rpc("hr_update_information_employment", {
        p_actor: req.user.id,
        p_employee: id,
        p_period: probation_period,
        p_location: work_location,
      }),
    );
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
});
router.post("/", async (req, res) => {
  try {
    const payload = cleanInformation(req.body.payload);
    const record = first(
      checked(
        await systemDb.rpc("hr_save_information", {
          p_actor: req.user.id,
          p_id: null,
          p_version: 0,
          p_payload: payload,
        }),
      ),
    );
    res.json({ record: redactInformation(record, req.user) });
  } catch (e) {
    fail(res, e);
  }
});
router.get("/:id", async (req, res) => {
  try {
    const { record, assigned } = await recordFor(req);
    res.json({ record: redactInformation(record, req.user, assigned) });
  } catch (e) {
    fail(res, e);
  }
});
router.put("/:id", async (req, res) => {
  try {
    const { record } = await recordFor(req);
    if (!Number.isInteger(req.body.version))
      throw new Error("Invalid form version");
    const payload = cleanInformation(req.body.payload);
    const saved = first(
      checked(
        await systemDb.rpc("hr_save_information", {
          p_actor: req.user.id,
          p_id: record.id,
          p_version: req.body.version,
          p_payload: payload,
        }),
      ),
    );
    res.json({ record: redactInformation(saved, req.user) });
  } catch (e) {
    fail(res, e);
  }
});
router.post("/:id/submit", async (req, res) => {
  try {
    const { record } = await recordFor(req);
    if (
      !Number.isInteger(req.body.version) ||
      req.body.declaration !== true ||
      typeof req.body.signature !== "string"
    )
      throw new Error("Read the declaration and enter your name to sign");
    cleanInformation(record.payload, true);
    const saved = first(
      checked(
        await systemDb.rpc("hr_submit_information", {
          p_actor: req.user.id,
          p_id: record.id,
          p_version: req.body.version,
          p_declaration: req.body.signature.trim(),
        }),
      ),
    );
    res.json({ record: redactInformation(saved, req.user) });
  } catch (e) {
    fail(res, e);
  }
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10485760, files: 1, fields: 3, fieldSize: 1000 },
}).single("file");
router.post(
  "/:id/files",
  (req, res, next) =>
    upload(req, res, (e) =>
      e
        ? res.status(400).json({
            error:
              e.code === "LIMIT_FILE_SIZE"
                ? "File must be 10 MB or smaller"
                : "Choose one PDF, JPEG or PNG file",
          })
        : next(),
    ),
  async (req, res) => {
    let path;
    try {
      const { record } = await recordFor(req);
      if (
        record.status !== "draft" ||
        !ownInformation(req.user, record.employee_id) ||
        record.created_by !== req.user.id
      )
        return res.sendStatus(403);
      if (!/^\d+$/.test(req.body.version || ""))
        throw new Error("Invalid form version");
      const { mime, ext } = validateInformationFile(
          req.file,
          req.body.category,
        ),
        id = crypto.randomUUID();
      if (record.attachments.length >= 16)
        throw new Error("Maximum 16 attachments per form");
      path = `${record.employee_id}/${record.id}/${id}.${ext}`;
      checked(
        await systemDb.storage
          .from(INFORMATION_BUCKET)
          .upload(path, req.file.buffer, { contentType: mime, upsert: false }),
      );
      const name = Buffer.from(req.file.originalname, "latin1")
        .toString("utf8")
        .replace(/[\u0000-\u001f\u007f/\\]/g, "_")
        .slice(0, 250);
      const saved = first(
        checked(
          await systemDb.rpc("hr_save_information", {
            p_actor: req.user.id,
            p_id: record.id,
            p_version: Number(req.body.version),
            p_payload: null,
            p_add_file: {
              id,
              path,
              category: req.body.category,
              name,
              mime,
              size: req.file.size,
              uploaded_at: new Date().toISOString(),
            },
          }),
        ),
      );
      path = null;
      res.json({ record: redactInformation(saved, req.user) });
    } catch (e) {
      if (path) await systemDb.storage.from(INFORMATION_BUCKET).remove([path]);
      fail(res, e);
    }
  },
);
router.get("/:id/files/:file", async (req, res) => {
  try {
    const { record } = await recordFor(req),
      doc = record.attachments.find((f) => f.id === req.params.file);
    if (!doc) return res.sendStatus(404);
    if (!documentVisible(req.user, record, doc)) return res.sendStatus(403);
    const signed = checked(
      await systemDb.storage
        .from(INFORMATION_BUCKET)
        .createSignedUrl(doc.path, 60, { download: doc.name }),
    );
    res.set("Cache-Control", "no-store").redirect(signed.signedUrl);
  } catch (e) {
    fail(res, e);
  }
});
router.delete("/:id/files/:file", async (req, res) => {
  try {
    const { record } = await recordFor(req),
      doc = record.attachments.find((f) => f.id === req.params.file);
    if (!doc) return res.sendStatus(404);
    if (!Number.isInteger(req.body.version))
      throw new Error("Invalid form version");
    const saved = first(
      checked(
        await systemDb.rpc("hr_save_information", {
          p_actor: req.user.id,
          p_id: record.id,
          p_version: req.body.version,
          p_payload: null,
          p_remove_file: doc.id,
        }),
      ),
    );
    // Revoke the database reference before deleting storage; a failed cleanup cannot expose a file.
    await systemDb.storage.from(INFORMATION_BUCKET).remove([doc.path]);
    res.json({ record: redactInformation(saved, req.user) });
  } catch (e) {
    fail(res, e);
  }
});
export default router;
