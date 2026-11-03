import {pdfBranding} from '../lib/branding.js';
import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import { systemDb } from "../shared/db/index.js";
import {
  UUID,
  personalCan,
  can,
  employeeScope,
} from "../../shared/accessPolicy.js";
import {
  leaveInput,
  leaveVisible,
  cleanCalendar,
  LEAVE_BUCKET,
} from "../lib/leaveForms.js";
import { validateInformationFile } from "../lib/employeeInformation.js";
import { leavePdf } from "../lib/leavePdf.js";
const router = express.Router(),
  checked = (r) => {
    if (r.error) throw r.error;
    return r.data;
  },
  first = (d) => (Array.isArray(d) ? d[0] : d);
const fail = (res, e) =>
  res
    .status(
      e.status ||
        (/changed|already|overlap/.test(e.message)
          ? 409
          : /permission|outside|assigned|active linked/.test(e.message)
            ? 403
            : 400),
    )
    .json({ error: e.message });
async function formFor(req) {
  if (!UUID.test(req.params.id || ""))
    throw new Error("Invalid leave reference");
  const row = checked(
    await systemDb
      .from("Leave_Request")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle(),
  );
  if (!row || row.form_version !== 2)
    throw Object.assign(new Error("Leave form not found"), { status: 404 });
  const approval = checked(
    await systemDb
      .from("hr_approval_requests")
      .select("*")
      .eq("workflow_key", "leave")
      .eq("resource_id", row.id)
      .maybeSingle(),
  );
  if (!leaveVisible(req.user, row, approval))
    throw Object.assign(new Error("This leave form is outside your access"), {
      status: 403,
    });
  return {
    request: row,
    approval,
    can_ack:
      row.employee_id === req.user.employee_id &&
      row.requester_id === req.user.id &&
      personalCan(req.user, "leave") &&
      row.status === "Approved" &&
      !!row.conditions &&
      !row.conditions_acknowledged_at,
  };
}
router.get("/form/meta", async (req, res) => {
  try {
    const id = req.user.employee_id;
    const [employee, types, setting] = await Promise.all([
      id
        ? systemDb
            .from("Employees")
            .select(
              "id,Full_name,employee_id,phone,email,position_id,Manager_id,Dept_id",
            )
            .eq("id", id)
            .is("deleted_at", null)
            .maybeSingle()
        : null,
      systemDb
        .from("Leave_type")
        .select("id,type_name,kind,is_paid")
        .order("type_name"),
      systemDb
        .from("hr_workflow_settings")
        .select("enabled")
        .eq("workflow_key", "leave")
        .maybeSingle(),
    ]);
    const e = employee ? checked(employee) : null;
    const [pos, mgr] = await Promise.all([
      e?.position_id
        ? systemDb
            .from("positions")
            .select("title")
            .eq("id", e.position_id)
            .maybeSingle()
        : null,
      e?.Manager_id
        ? systemDb
            .from("Employees")
            .select("Full_name")
            .eq("id", e.Manager_id)
            .maybeSingle()
        : null,
    ]);
    res.json({
      employee: e
        ? {
            id: e.id,
            name: e.Full_name,
            employee_number: e.employee_id,
            phone: e.phone,
            email: e.email,
            position: pos ? checked(pos)?.title : "",
            manager: mgr ? checked(mgr)?.Full_name : "",
          }
        : null,
      types: checked(types),
      workflow_enabled: !!checked(setting)?.enabled,
    });
  } catch (e) {
    fail(res, e);
  }
});
router.post("/form/quote", async (req, res) => {
  try {
    if (!req.user.employee_id)
      return res
        .status(403)
        .json({ error: "Link your account to an employee record first" });
    const i = leaveInput(req.body);
    const quote = first(
      checked(
        await systemDb.rpc("hr_leave_quote", {
          p_employee: req.user.employee_id,
          p_type: i.leave_type_id,
          p_start: i.start_date,
          p_end: i.end_date,
          p_session: i.session,
        }),
      ),
    );
    res.json({ quote: quote.hr_leave_quote || quote });
  } catch (e) {
    fail(res, e);
  }
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10485760, files: 1, fields: 20, fieldSize: 6000 },
}).single("attachment");
export function leaveFormUpload(req, res, next) {
  upload(req, res, (e) =>
    e
      ? res
          .status(400)
          .json({ error: "Choose one PDF, JPEG or PNG file up to 10 MB" })
      : next(),
  );
}
export async function submitLeaveForm(req, res) {
  let path;
  try {
    const input = leaveInput(req.body, true),
      key = req.body.submission_key;
    if (
      !UUID.test(key || "") ||
      !/^[a-f0-9]{32}$/.test(req.body.fingerprint || "")
    )
      throw new Error("Refresh the leave preview before submitting");
    if (!req.user.employee_id || !personalCan(req.user, "leave"))
      return res
        .status(403)
        .json({
          error: "An active employee account with Leave access is required",
        });
    let document = null;
    if (req.file) {
      const { mime, ext } = validateInformationFile(req.file, "other"),
        id = crypto.randomUUID();
      path = `${req.user.employee_id}/${key}/${id}.${ext}`;
      checked(
        await systemDb.storage
          .from(LEAVE_BUCKET)
          .upload(path, req.file.buffer, { contentType: mime, upsert: false }),
      );
      document = {
        id,
        ext,
        mime,
        name: Buffer.from(req.file.originalname, "latin1")
          .toString("utf8")
          .replace(/[\u0000-\u001f\u007f/\\]/g, "_")
          .slice(0, 250),
        size: req.file.size,
        medical_certificate: ["true", true].includes(
          req.body.medical_certificate,
        ),
        url: `/api/leave/form/${key}/document`,
      };
    }
    const record = first(
      checked(
        await systemDb.rpc("hr_submit_leave_form", {
          p_actor: req.user.id,
          p_key: key,
          p_input: input,
          p_expected: req.body.fingerprint,
          p_document: document,
        }),
      ),
    );
    if (path && record.form_snapshot.document?.id !== document.id)
      await systemDb.storage.from(LEAVE_BUCKET).remove([path]);
    path = null;
    res.json({ success: true, request: record });
  } catch (e) {
    if (path) {
      try {
        await systemDb.storage.from(LEAVE_BUCKET).remove([path]);
      } catch {
        /* metadata was never committed */
      }
    }
    fail(res, e);
  }
}
router.post("/form/submit", leaveFormUpload, submitLeaveForm);
router.get("/form/:id", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store").json(await formFor(req));
  } catch (e) {
    fail(res, e);
  }
});
router.get("/form/:id/document", async (req, res) => {
  try {
    const { request: r } = await formFor(req),
      d = r.form_snapshot.document;
    if (!d) return res.sendStatus(404);
    const path = `${r.employee_id}/${r.id}/${d.id}.${d.ext}`,
      signed = checked(
        await systemDb.storage
          .from(LEAVE_BUCKET)
          .createSignedUrl(path, 60, { download: d.name }),
      );
    res.set("Cache-Control", "no-store").redirect(signed.signedUrl);
  } catch (e) {
    fail(res, e);
  }
});
router.get("/form/:id/pdf", async (req, res) => {
  try {
    const { request: r, approval } = await formFor(req);
    const bytes = await leavePdf(r, approval,await pdfBranding());
    res
      .set({
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="UYF-Leave-${r.id.slice(0, 8)}.pdf"`,
      })
      .send(bytes);
  } catch (e) {
    fail(res, e);
  }
});
router.post("/form/:id/acknowledge", async (req, res) => {
  try {
    await formFor(req);
    if (req.body.acknowledged !== true)
      throw new Error("Confirm you have read the approval conditions");
    const r = first(
      checked(
        await systemDb.rpc("hr_ack_leave_conditions", {
          p_actor: req.user.id,
          p_id: req.params.id,
        }),
      ),
    );
    res.json({ request: r });
  } catch (e) {
    fail(res, e);
  }
});
router.get("/calendar", async (req, res) => {
  try {
    if (!req.user.is_owner) return res.sendStatus(403);
    const [calendar, dates] = await Promise.all([
      systemDb.from("hr_leave_calendar").select("*").eq("id", true).single(),
      systemDb.from("hr_leave_calendar_dates").select("*").order("work_date"),
    ]);
    res.json({
      calendar: checked(calendar),
      dates: checked(dates).map((d) => ({
        date: d.work_date,
        is_working: d.is_working,
        label: d.label,
      })),
    });
  } catch (e) {
    fail(res, e);
  }
});
router.put("/calendar", async (req, res) => {
  try {
    if (!req.user.is_owner) return res.sendStatus(403);
    const clean = cleanCalendar(req.body);
    const c = first(
      checked(
        await systemDb.rpc("hr_save_leave_calendar", {
          p_actor: req.user.id,
          p_version: req.body.version,
          p_settings: clean.settings,
          p_dates: clean.dates,
        }),
      ),
    );
    res.json({ calendar: c });
  } catch (e) {
    fail(res, e);
  }
});
router.put("/balances/:employee/:type/:year", async (req, res) => {
  try {
    const { employee, type, year } = req.params,
      scope = employeeScope(req.user);
    if (
      !UUID.test(employee) ||
      !UUID.test(type) ||
      !/^\d{4}$/.test(year) ||
      !Number.isInteger(req.body.version) ||
      !Number.isFinite(req.body.days)
    )
      throw new Error("Enter a valid employee, type, year, days and version");
    if (
      !can(req.user, "leave", "edit") ||
      (scope !== null && !scope.includes(employee))
    )
      return res.sendStatus(403);
    const b = first(
      checked(
        await systemDb.rpc("hr_set_leave_entitlement", {
          p_actor: req.user.id,
          p_employee: employee,
          p_type: type,
          p_year: Number(year),
          p_days: req.body.days,
          p_version: req.body.version,
        }),
      ),
    );
    res.json({ balance: b });
  } catch (e) {
    fail(res, e);
  }
});
export default router;
