import {
  UUID,
  can,
  personalCan,
  employeeScope,
} from "../../shared/accessPolicy.js";
import { LEAVE_KINDS } from "../../shared/leavePolicy.js";
export const LEAVE_BUCKET = "leave_form_documents";
export const validDate = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
export function leaveInput(body, submit = false) {
  const out = {};
  if (!UUID.test(body.leave_type_id || ""))
    throw new Error("Choose a leave type");
  out.leave_type_id = body.leave_type_id;
  if (
    !validDate(body.start_date) ||
    !validDate(body.end_date) ||
    body.end_date < body.start_date ||
    (Date.parse(body.end_date) - Date.parse(body.start_date)) / 86400000 > 365
  )
    throw new Error("Choose valid start/end dates, up to 366 days");
  Object.assign(out, {
    start_date: body.start_date,
    end_date: body.end_date,
    session: body.session || "FULL",
  });
  if (
    !["FULL", "AM", "PM"].includes(out.session) ||
    (out.session !== "FULL" && out.start_date !== out.end_date)
  )
    throw new Error("A half-day request must use one shift date");
  if (!submit) return out;
  for (const [key, max] of [
    ["reason", 4000],
    ["business_unit", 150],
    ["contact_phone", 100],
    ["contact_email", 250],
    ["signature", 250],
  ]) {
    if (body[key] !== undefined && typeof body[key] !== "string")
      throw new Error(`${key} must be text`);
    out[key] = (body[key] || "").trim();
    if (out[key].length > max) throw new Error(`${key} is too long`);
  }
  if (!out.reason || !out.signature)
    throw new Error("Enter a reason and your signature name");
  if (
    out.contact_email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.contact_email)
  )
    throw new Error("Enter a valid contact email");
  if (!["true", true].includes(body.declaration))
    throw new Error("Read and accept the employee declaration");
  out.declaration = true;
  return out;
}
export function leaveVisible(user, row, approval) {
  if (user.is_owner) return true;
  if (
    personalCan(user, "leave") &&
    (user.id === row.requester_id || user.employee_id === row.employee_id)
  )
    return true;
  const scope = employeeScope(user);
  if (can(user, "leave") && (scope === null || scope.includes(row.employee_id)))
    return true;
  return (
    can(user, "leave", "approve") &&
    !!approval?.stages.some((s) => s.assignee_id === user.id)
  );
}
export function cleanCalendar(body) {
  const s = body.settings,
    dates = body.dates;
  if (
    !Number.isInteger(body.version) ||
    !s ||
    !Array.isArray(s.weekly_holidays) ||
    s.weekly_holidays.length > 6 ||
    s.weekly_holidays.some((d) => !Number.isInteger(d) || d < 0 || d > 6) ||
    new Set(s.weekly_holidays).size !== s.weekly_holidays.length
  )
    throw new Error("Choose zero to six weekly off days");
  for (const k of ["default_start", "default_end"])
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s[k] || ""))
      throw new Error("Set valid company start and end hours");
  if (s.default_start === s.default_end)
    throw new Error("Start and end hours must differ");
  if (!Array.isArray(dates) || dates.length > 366)
    throw new Error("Enter up to 366 company date exceptions");
  const seen = new Set();
  const checked = dates.map((d) => {
    if (
      !validDate(d.date) ||
      typeof d.is_working !== "boolean" ||
      typeof d.label !== "string" ||
      d.label.length > 150 ||
      seen.has(d.date)
    )
      throw new Error(
        "Each calendar date must be unique, with a valid date, working/off choice and short label",
      );
    seen.add(d.date);
    return { date: d.date, is_working: d.is_working, label: d.label.trim() };
  });
  return {
    settings: {
      weekly_holidays: [...s.weekly_holidays].sort(),
      default_start: s.default_start,
      default_end: s.default_end,
    },
    dates: checked,
  };
}
export function cleanLeaveType(body) {
  if (
    typeof body.type_name !== "string" ||
    !body.type_name.trim() ||
    body.type_name.length > 150
  )
    throw new Error("Enter a leave type name up to 150 characters");
  const n = Number(body.default_days || 0);
  if (!Number.isFinite(n) || n < 0 || n > 3660 || n * 2 !== Math.trunc(n * 2))
    throw new Error("Default entitlement must use half-day units");
  if (
    !LEAVE_KINDS.some((k) => k[0] === body.kind) ||
    typeof body.is_paid !== "boolean"
  )
    throw new Error(
      "Choose the policy category and whether this is paid leave",
    );
  if (
    body.description !== undefined &&
    (typeof body.description !== "string" || body.description.length > 4000)
  )
    throw new Error("Description must be text, up to 4000 characters");
  return {
    type_name: body.type_name.trim(),
    kind: body.kind,
    is_paid: body.is_paid,
    default_days: n,
    description: (body.description || "").trim(),
  };
}
