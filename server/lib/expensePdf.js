import {DEFAULT_BRANDING} from '../../shared/branding.js';
import {drawBrandHeader} from './brandPresentation.js';
import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";
import {
  expenseDisplayFields,
  EXPENSE_INSTRUCTIONS,
  BUSINESS_UNITS,
} from "../../shared/expenseForm.js";
export function expensePdf(record, approval, branding=DEFAULT_BRANDING) {
  const doc = new PDFDocument({
      size: "A4",
      margin: 46,
      bufferPages: true,
      info: { Title: record.request_number, Author: branding.name },
    }),
    chunks = [];
  const result = new Promise((resolve, reject) => {
    doc.on("data", (b) => chunks.push(b));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.font(
    fileURLToPath(new URL("../fonts/Padauk-Regular.ttf", import.meta.url)),
  );
  const room = (h) => {
    if (doc.y + h > 770) doc.addPage();
  };
  const heading = (text) => {
    room(55);
    doc
      .moveDown(0.7)
      .fontSize(13)
      .fillColor("#294d66")
      .text(text)
      .moveDown(0.3);
  };
  const line = (label, value) => {
    doc.fontSize(10).fillColor("#243247");
    const s = `${label}: ${value ?? "-"}`;
    room(doc.heightOfString(s, { width: 500 }) + 12);
    doc.text(s, { width: 500, lineGap: 3 }).moveDown(0.35);
  };
  const stamp = (v) =>
    new Date(v).toLocaleString("en-GB", {
      timeZone: "Asia/Bangkok",
      hour12: false,
    });
  const f = record.form_snapshot,
    i = f.input;
  drawBrandHeader(doc,branding,11);
  doc.fontSize(25).fillColor("#15263a").text("Expense request");
  line("Request ID", record.request_number);
  line("Request date", f.request_date);
  line(
    "Status",
    record.status === "APPROVED"
      ? "APPROVED - awaiting Finance payment"
      : record.status,
  );
  line("Generated", stamp(new Date()) + " (Bangkok)");
  if(f.routing?.mode==='amount'){
    heading('Approval policy at submission');line('Policy version',f.routing.version);line('Route',f.routing.ceo_required?'AGM -> CEO -> Finance payment':'AGM -> Finance payment');line('Original requested amount',f.routing.requested_amount+' '+f.routing.currency);line('AGM limit',f.routing.agm_limit==null?'Not configured: CEO review required':f.routing.agm_limit+' '+f.routing.currency);
  }
  heading("Request details");
  line("Requested by", f.employee.name);
  line("Employee ID", f.employee.employee_number);
  line("Department", f.employee.department || "-");
  for (const [key, label] of expenseDisplayFields(i))
    line(
      label,
      key === "business_unit"
        ? f.business_name||BUSINESS_UNITS.find((b) => b[0] === i[key])?.[1]||i[key]
        : i[key],
    );
  if (f.budget_remaining != null) {
    line("Historical budget remaining", f.budget_remaining);
    line("Budget basis", "Historical requester reference, not a company ledger balance.");
  }
  heading("Supporting documents");
  for (const d of f.documents || []) line("Quotation / receipt", d.name);
  if (!f.documents?.length) line("Attachments", "None");
  room(150);
  heading("Approvals and management comments");
  for (const s of approval?.stages || []) {
    const e = approval.history.find((h) => h.stage === s.key);
    line(
      s.label,
      e
        ? `${e.actor_name} | ${e.decision} | ${stamp(e.at)} (Bangkok)`
        : `${s.assignee_name} | ${approval.status === "rejected" ? "Not completed" : "Awaiting decision"}`,
    );
    if (e?.approved_amount != null)
      line("Amount approved", `${e.approved_amount} ${record.currency}`);
    if (e?.comment) line("Comments / reason", e.comment);
    if (e?.conditions) line("Conditions", e.conditions);
    if (e?.payment) {
      line("Final paid amount", `${e.payment.amount} ${e.payment.currency}`);
      line("Payment date", e.payment.date);
      line("Payment method", e.payment.method);
      line("Payment reference", e.payment.reference);
    }
  }
  heading("Instructions");
  line("Policy", EXPENSE_INSTRUCTIONS);
  const pages = doc.bufferedPageRange();
  for (let p = pages.start; p < pages.start + pages.count; p++) {
    doc.switchToPage(p);
    const bottom=doc.page.margins.bottom;
    doc.page.margins.bottom=0;
    doc
      .fontSize(8)
      .fillColor("#68788b")
      .text(
        `${record.request_number} | Confidential | ${p + 1} / ${pages.count}`,
        46,
        795,
        { width: 500, lineBreak: false },
      );
  }
  doc.end();
  return result;
}
