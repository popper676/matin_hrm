import {DEFAULT_BRANDING} from '../../shared/branding.js';
import {drawBrandHeader} from './brandPresentation.js';
import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";
import { LEAVE_POLICY_NOTES } from "../../shared/leavePolicy.js";
const font = fileURLToPath(
  new URL("../fonts/Padauk-Regular.ttf", import.meta.url),
);
export function leavePdf(record, approval, branding=DEFAULT_BRANDING) {
  const doc = new PDFDocument({
      size: "A4",
      margin: 46,
      bufferPages: true,
      info: { Title: branding.name+' Leave Request', Author: branding.name },
    }),
    chunks = [];
  const result = new Promise((resolve, reject) => {
    doc.on("data", (b) => chunks.push(b));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.font(font);
  const e = record.form_snapshot.employee,
    i = record.form_snapshot.input;
  const stamp = (value) =>
    value
      ? new Date(value).toLocaleString("en-GB", {
          timeZone: "Asia/Bangkok",
          hour12: false,
        })
      : "-";
  const space = (h) => {
    if (doc.y + h > 770) doc.addPage();
  };
  const heading = (text) => {
    space(50);
    doc
      .moveDown(0.8)
      .fontSize(13)
      .fillColor("#294d66")
      .text(text)
      .moveDown(0.35);
  };
  const line = (label, value) => {
    const text = `${label}: ${value ?? "-"}`;
    doc.fontSize(9).fillColor("#243247");
    space(doc.heightOfString(text, { width: 500 }) + 12);
    doc.text(text, { width: 500, lineGap: 3 }).moveDown(0.45);
  };
  drawBrandHeader(doc,branding,11);
  doc.fontSize(25).fillColor("#15263a").text("Leave request");
  doc
    .fontSize(9)
    .fillColor("#68788b")
    .text(`Reference ${record.id}\nGenerated ${stamp(new Date())} (Bangkok)`)
    .moveDown();
  heading("Employee information");
  for (const [label, k] of [
    ["Full name", "name"],
    ["Employee ID", "employee_number"],
    ["Business unit", "business_unit"],
    ["Department", "department"],
    ["Job title", "position"],
    ["Manager / Supervisor", "manager"],
    ["Contact number", "phone"],
    ["Email", "email"],
  ])
    line(label, e[k] || "-");
  heading("Leave details");
  line("Type", record.form_snapshot.type_name);
  line("Dates", `${record.start_date} to ${record.end_date}`);
  line(
    "Session",
    record.session === "FULL"
      ? "Full working days"
      : `${record.session} - ${record.session === "AM" ? "first" : "second"} half of scheduled shift`,
  );
  line("Working days requested", record.working_days);
  line("Reason", record.reason);
  line(
    "Medical / supporting document",
    record.form_snapshot.document?.name || "Not attached",
  );
  heading("Balance at submission");
  for (const b of record.form_snapshot.balances || [])
    line(
      `${b.type_name} (${b.year})`,
      `Before ${b.before ?? "Not tracked"} | Requested ${b.requested} | Projected after ${b.after ?? "Not tracked"}`,
    );
  if (record.form_snapshot.final_balances) {
    heading("Balance at final approval");
    for (const b of record.form_snapshot.final_balances)
      line(
        String(b.year),
        `Before ${b.before ?? "Not tracked"} | Used ${b.deducted} | After ${b.after ?? "Not tracked"}`,
      );
  }
  space(110);
  heading("Employee declaration");
  line(
    "Declaration",
    "I confirm these details are accurate, accept the leave policy, and understand leave needs Manager and HR approval.",
  );
  line("Signed name", i.signature);
  line("Signed at", `${stamp(record.form_snapshot.declared_at)} (Bangkok)`);
  heading("Approvals and final decision");
  line(
    "Decision",
    record.status === "Approved" && record.conditions
      ? "Approved with conditions"
      : record.status,
  );
  for (const s of approval?.stages || []) {
    const event = approval.history.find((h) => h.stage === s.key);
    line(
      s.label,
      event
        ? `${event.actor_name} | ${event.decision} | ${stamp(event.at)} (Bangkok)`
        : `${s.assignee_name} | ${record.status === "Rejected" ? "Not completed" : "Awaiting decision"}`,
    );
    if (event?.comment) line("Comment / reason", event.comment);
    if (event?.conditions) line("Conditions", event.conditions);
  }
  if (record.conditions) {
    line("All approval conditions", record.conditions);
    line(
      "Employee acknowledgment",
      record.conditions_acknowledged_at
        ? `${stamp(record.conditions_acknowledged_at)} (Bangkok)`
        : record.status === "Approved"
          ? "Awaiting acknowledgment"
          : "Not required before final approval",
    );
  }
  heading("Company leave policy");
  for (const [en] of LEAVE_POLICY_NOTES) line("Policy", en);
  const pages = doc.bufferedPageRange();
  for (let p = pages.start; p < pages.start + pages.count; p++) {
    doc.switchToPage(p);
    doc
      .fontSize(8)
      .fillColor("#68788b")
      .text(
        `Confidential personnel record | ${record.id.slice(0, 8)} | Page ${p + 1} of ${pages.count}`,
        46,
        800,
        { lineBreak: false },
      );
  }
  doc.end();
  return result;
}
