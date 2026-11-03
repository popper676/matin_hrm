import {pdfBranding} from '../lib/branding.js';
import {allRows} from '../lib/operationsData.js';
import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import { systemDb } from "../shared/db/index.js";
import { UUID, personalCan } from "../../shared/accessPolicy.js";
import { expenseInput } from "../../shared/expenseForm.js";
import { expenseVisible, EXPENSE_BUCKET } from "../lib/expenseForms.js";
import { validateInformationFile } from "../lib/employeeInformation.js";
import { expensePdf } from "../lib/expensePdf.js";
const router = express.Router();
const checked = (r) => {
  if (r.error) throw r.error;
  return r.data;
};
const fail = (res, e) =>
  res
    .status(
      e.status ||
        (/changed|already|completed/.test(e.message)
          ? 409
          : /permission|outside|active linked|assigned/.test(e.message)
            ? 403
            : 400),
    )
    .json({ error: e.message });
async function formFor(req) {
  if (!UUID.test(req.params.id || ""))
    throw new Error("Invalid expense reference");
  const row = checked(
    await systemDb
      .from("rewards_and_claims")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle(),
  );
  if (!row || row.form_version !== 2)
    throw Object.assign(new Error("Expense form not found"), { status: 404 });
  const approval = checked(
    await systemDb
      .from("hr_approval_requests")
      .select("*")
      .eq("workflow_key", "expense")
      .eq("resource_id", row.id)
      .maybeSingle(),
  );
  if (!expenseVisible(req.user, row, approval))
    throw Object.assign(new Error("This expense is outside your access"), {
      status: 403,
    });
  return { request: row, approval };
}
router.get("/meta", async (req, res) => {
  try {
    if (!personalCan(req.user, "rewards")) return res.sendStatus(403);
    const employee = req.user.employee_id
      ? checked(
          await systemDb
            .from("Employees")
            .select("id,Full_name,employee_id,Dept_id")
            .eq("id", req.user.employee_id)
            .is("deleted_at", null)
            .maybeSingle(),
        )
      : null;
    const department = employee?.Dept_id
      ? checked(
          await systemDb
            .from("Departments")
            .select("Department_name")
            .eq("id", employee.Dept_id)
            .maybeSingle(),
        )?.Department_name
      : null;
    const cfg = checked(
      await systemDb
        .from("hr_workflow_settings")
        .select("enabled")
        .eq("workflow_key", "expense")
        .maybeSingle(),
    );
    const routing=checked(await systemDb.from("hr_expense_routing").select("mode,limits").eq("id",true).single());
    const businesses=await allRows("hr_business_units");
    res.json({
      business_units:businesses.filter(b=>b.is_active).map(b=>[b.key,b.name]),
      employee: employee
        ? {
            name: employee.Full_name,
            employee_number: employee.employee_id,
            department,
          }
        : null,
      workflow_enabled: routing.mode==='amount'||!!cfg?.enabled,
      routing,
    });
  } catch (e) {
    fail(res, e);
  }
});
router.post('/preview',async(req,res)=>{try{
 if(!req.user.employee_id||!personalCan(req.user,'rewards'))return res.sendStatus(403);
 const raw=checked(await systemDb.rpc('hr_expense_route',{p_requester:req.user.id,p_currency:req.body.currency,p_amount:req.body.amount}));
 const route=Array.isArray(raw)?raw[0]:raw;
 res.set('Cache-Control','no-store').json({policy:route.policy,stages:route.stages.map(({key,label,action,assignee_name})=>({key,label,action,assignee_name}))});
}catch(e){fail(res,e);}});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 5, fileSize: 10485760, fields: 20, fieldSize: 8000 },
}).array("attachments", 5);
router.post(
  "/submit",
  (req, res, next) => {
    if (!req.user.employee_id || !personalCan(req.user, "rewards"))
      return res
        .status(403)
        .json({
          error:
            "An active linked employee account with Expenses access is required",
        });
    upload(req, res, (e) =>
      e
        ? res
            .status(400)
            .json({
              error: "Attach up to 5 PDF, JPEG or PNG files, each up to 10 MB",
            })
        : next(),
    );
  },
  async (req, res) => {
    const uploaded = [];
    try {
      const units=(await allRows("hr_business_units")).filter(b=>b.is_active).map(b=>[b.key,b.name]);
      const input = expenseInput(req.body,units),
        key = req.body.submission_key;
      if (!UUID.test(key || "")) throw new Error("Open a fresh expense form");
      const documents = [];
      // Validate every file before uploading any of them.
      const files = (req.files || []).map((file) => ({
        ...validateInformationFile(file, "other"),
        file,
      }));
      for (const { mime, ext, file } of files) {
        const id = crypto.randomUUID(),
          path = `${req.user.employee_id}/${key}/${id}.${ext}`;
        checked(
          await systemDb.storage
            .from(EXPENSE_BUCKET)
            .upload(path, file.buffer, { contentType: mime, upsert: false }),
        );
        uploaded.push(path);
        documents.push({
          id,
          ext,
          mime,
          size: file.size,
          name: Buffer.from(file.originalname, "latin1")
            .toString("utf8")
            .replace(/[\u0000-\u001f\u007f/\\]/g, "_")
            .slice(0, 250),
        });
      }
      const result = checked(
        await systemDb.rpc("hr_submit_expense_form", {
          p_actor: req.user.id,
          p_key: key,
          p_input: input,
          p_documents: documents,
        }),
      );
      const record = Array.isArray(result) ? result[0] : result;
      const kept = new Set(
        (record.form_snapshot.documents || []).map((d) => d.id),
      );
      const unused = uploaded.filter(
        (p) => !kept.has(p.split("/").pop().split(".")[0]),
      );
      uploaded.length = 0;
      if (unused.length)
        await systemDb.storage.from(EXPENSE_BUCKET).remove(unused);
      res.json({ success: true, reward: record });
    } catch (e) {
      if (uploaded.length)
        try {
          await systemDb.storage.from(EXPENSE_BUCKET).remove(uploaded);
        } catch {
          /* no form was committed */
        }
      fail(res, e);
    }
  },
);
router.get("/:id", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store").json(await formFor(req));
  } catch (e) {
    fail(res, e);
  }
});
router.get("/:id/documents/:document", async (req, res) => {
  try {
    const { request: r } = await formFor(req),
      d = r.form_snapshot.documents.find((d) => d.id === req.params.document);
    if (!d) return res.sendStatus(404);
    const path = `${r.employee_id}/${r.id}/${d.id}.${d.ext}`,
      signed = checked(
        await systemDb.storage
          .from(EXPENSE_BUCKET)
          .createSignedUrl(path, 60, { download: d.name }),
      );
    res.set("Cache-Control", "no-store").redirect(signed.signedUrl);
  } catch (e) {
    fail(res, e);
  }
});
router.get("/:id/pdf", async (req, res) => {
  try {
    const { request: r, approval } = await formFor(req),
      bytes = await expensePdf(r, approval,await pdfBranding());
    res
      .set({
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${r.request_number}.pdf"`,
      })
      .send(bytes);
  } catch (e) {
    fail(res, e);
  }
});
export default router;
