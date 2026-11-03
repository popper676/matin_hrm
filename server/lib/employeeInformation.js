import {
  INFORMATION_FIELDS,
  FAMILY_FIELDS,
  INFORMATION_DOCUMENTS,
} from "../../shared/employeeInformation.js";
import { personalCan, can, employeeScope } from "../../shared/accessPolicy.js";
import { canReviewInformation } from "../../shared/employeeInformation.js";
export { canReviewInformation };
export const INFORMATION_BUCKET = "employee_information";
export function cleanInformation(input, submit = false) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Enter employee information");
  const allowed = new Set([
    ...INFORMATION_FIELDS.map((f) => f[0]),
    "family",
    "languages",
    "missing_documents_note",
  ]);
  if (Object.keys(input).some((k) => !allowed.has(k)))
    throw new Error(
      "Employment, salary and account settings cannot be changed through this form",
    );
  const out = {};
  for (const [key, label, , type, required, options] of INFORMATION_FIELDS) {
    if (input[key] !== undefined && typeof input[key] !== "string")
      throw new Error(`${label} must be text`);
    const value = (input[key] || "").trim();
    if (value.length > (type === "textarea" ? 4000 : 250))
      throw new Error(`${label} is too long`);
    if (submit && required && !value) throw new Error(`${label} is required`);
    if (
      value &&
      type === "date" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    )
      throw new Error(`Enter a valid ${label.toLowerCase()}`);
    if (value && type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      throw new Error("Enter a valid email");
    if (value && options && !options.includes(value))
      throw new Error(`Choose a valid ${label.toLowerCase()}`);
    out[key] = value;
  }
  if (
    out.date_of_birth &&
    out.date_of_birth > new Date().toISOString().slice(0, 10)
  )
    throw new Error("Date of birth cannot be in the future");
  if (!Array.isArray(input.family || []) || (input.family || []).length > 20)
    throw new Error("Enter up to 20 family members");
  out.family = (input.family || [])
    .map((row) => {
      if (
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        Object.keys(row).some((k) => !FAMILY_FIELDS.some((f) => f[0] === k))
      )
        throw new Error("Invalid family member");
      return Object.fromEntries(
        FAMILY_FIELDS.map(([k]) => {
          if (row[k] !== undefined && typeof row[k] !== "string")
            throw new Error("Family details must be text");
          const v = (row[k] || "").trim();
          if (v.length > 250) throw new Error("Family details are too long");
          return [k, v];
        }),
      );
    })
    .filter((r) => Object.values(r).some(Boolean));
  if (
    !Array.isArray(input.languages || []) ||
    (input.languages || []).some(
      (l) => !["Myanmar", "Thai", "English"].includes(l),
    )
  )
    throw new Error("Invalid language");
  out.languages = [...new Set(input.languages || [])];
  if (
    input.missing_documents_note !== undefined &&
    typeof input.missing_documents_note !== "string"
  )
    throw new Error("Document note must be text");
  out.missing_documents_note = (input.missing_documents_note || "").trim();
  if (out.missing_documents_note.length > 4000)
    throw new Error("Document note is too long");
  if (
    submit &&
    out.payment_method === "Bank Transfer" &&
    (!out.bank_name || !out.bank_account_name || !out.bank_account_no)
  )
    throw new Error("Enter the bank name, account name and account number");
  return out;
}
export function ownInformation(user, employeeId) {
  return user.employee_id === employeeId && personalCan(user, "profile");
}
export function informationVisible(user, record) {
  if (user.is_owner || ownInformation(user, record.employee_id)) return true;
  const scope = employeeScope(user);
  return (
    can(user, "employees") &&
    (scope === null || scope.includes(record.employee_id))
  );
}
export function documentVisible(user, record, doc) {
  if (user.is_owner) return true;
  const own = ownInformation(user, record.employee_id);
  const flag = INFORMATION_DOCUMENTS.find((d) => d[0] === doc.category)?.[3];
  const has = (k) =>
    own
      ? k !== "salary" || personalCan(user, "payslips")
      : user.access.sensitive[k];
  return flag === "all"
    ? ["identity", "bank", "salary"].every(has)
    : !!flag && has(flag);
}
export function redactInformation(record, user, assigned = false) {
  const own = ownInformation(user, record.employee_id);
  const copy = structuredClone(record);
  if (!user.is_owner && !own) {
    for (const [section, , , fields] of INFORMATION_SECTIONS_FOR_REDACTION) {
      if (
        ["identity", "bank"].includes(section) &&
        !user.access.sensitive[section]
      )
        for (const [k] of fields) delete copy.payload[k];
    }
  }
  if (
    !user.is_owner &&
    !(own ? personalCan(user, "payslips") : user.access.sensitive.salary)
  )
    delete copy.employment_snapshot.salary;
  copy.attachments = (copy.attachments || [])
    .filter((d) => documentVisible(user, record, d))
    .map((d) => {
      const visible = { ...d };
      delete visible.path;
      return visible;
    });
  copy.review_history = (record.review_history || []).map((h) => ({
    stage: h.stage,
    label: h.label,
    actor_name: h.actor_name,
    decision: h.decision,
    at: h.at,
    ...(own || canReviewInformation(user) ? { comment: h.comment } : {}),
  }));
  delete copy.base_contacts;
  copy.can_edit =
    own && record.created_by === user.id && record.status === "draft";
  copy.can_review = assigned && canReviewInformation(user);
  return copy;
}
// Kept separate from redaction of ordinary Employees responses: this table is never exposed by generic routes.
const INFORMATION_SECTIONS_FOR_REDACTION = [
  [
    "identity",
    null,
    null,
    INFORMATION_FIELDS.filter((f) =>
      [
        "national_id",
        "passport_no",
        "work_permit_no",
        "visa_type",
        "visa_expiry_date",
        "work_permit_expiry_date",
      ].includes(f[0]),
    ),
  ],
  [
    "bank",
    null,
    null,
    INFORMATION_FIELDS.filter(
      (f) => f[0].startsWith("bank_") || f[0] === "payment_method",
    ),
  ],
];
export function validateInformationFile(file, category) {
  if (!INFORMATION_DOCUMENTS.some((d) => d[0] === category))
    throw new Error("Choose a document category");
  if (!file?.buffer?.length || file.size > 10485760)
    throw new Error("Choose a PDF, JPEG or PNG up to 10 MB");
  const b = file.buffer,
    ext = file.originalname.split(".").pop()?.toLowerCase();
  let mime;
  if (ext === "pdf" && b.subarray(0, 5).toString() === "%PDF-")
    mime = "application/pdf";
  if (
    ["jpg", "jpeg"].includes(ext) &&
    b[0] === 255 &&
    b[1] === 216 &&
    b[2] === 255
  )
    mime = "image/jpeg";
  if (
    ext === "png" &&
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    mime = "image/png";
  if (!mime || file.mimetype !== mime)
    throw new Error("The file content must match its PDF, JPEG or PNG type");
  return { mime, ext: ext === "jpeg" ? "jpg" : ext };
}
