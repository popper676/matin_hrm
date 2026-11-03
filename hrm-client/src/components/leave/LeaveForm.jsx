import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Modal from "../experience/Modal";
import { useLanguage } from "../../context/LanguageContext";
import api from "../../api/client";
import {
  LEAVE_POLICY_NOTES,
  LEAVE_SESSIONS,
} from "../../../../shared/leavePolicy";
import "../../styles/leave-form.css";
export function useLeaveWords() {
  const { language } = useLanguage();
  return (en, my) => (language === "my" ? my : en);
}
const message = (e) => e.response?.data?.error || e.message;
const stamp = (value) =>
  value
    ? new Date(value).toLocaleString("en-GB", {
        timeZone: "Asia/Bangkok",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
export function LeaveBalances({ rows, final = false }) {
  const l = useLeaveWords();
  return (
    <div className="leave-form-table">
      <table>
        <thead>
          <tr>
            {[
              l("Leave type / Year", "ခွင့်အမျိုးအစား / နှစ်"),
              l("Before", "မတင်မီ"),
              l(final ? "Used" : "Requested", final ? "အသုံးပြု" : "တောင်းဆို"),
              l(
                final ? "After" : "Projected after",
                final ? "ပြီးနောက်" : "ခန့်မှန်းကျန်ရက်",
              ),
            ].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((b, i) => (
            <tr key={`${b.type_id || ""}-${b.year}-${i}`}>
              <td>
                {b.type_name} <small>{b.year}</small>
              </td>
              <td>{b.before ?? "—"}</td>
              <td>{b.requested ?? b.deducted}</td>
              <td>{b.after ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Policy() {
  const l = useLeaveWords();
  return (
    <details className="leave-form-policy">
      <summary>
        {l("Company leave policy", "ကုမ္ပဏီ ခွင့်စည်းမျဉ်းများ")}
      </summary>
      <ol>
        {LEAVE_POLICY_NOTES.map(([en, my], i) => (
          <li key={i}>{l(en, my)}</li>
        ))}
      </ol>
    </details>
  );
}
export default function LeaveForm({ onClose, onSubmitted }) {
  const l = useLeaveWords(),
    qc = useQueryClient();
  const { data, error, isLoading } = useQuery({
    queryKey: ["leave-form-meta"],
    queryFn: () => api.get("/leave/form/meta").then((r) => r.data),
    retry: false,
  });
  const [input, setInput] = useState({
      leave_type_id: "",
      start_date: "",
      end_date: "",
      session: "FULL",
      reason: "",
      business_unit: "",
      signature: "",
      declaration: false,
    }),
    [file, setFile] = useState(null),
    [medical, setMedical] = useState(false),
    [key] = useState(() => crypto.randomUUID());
  const valid =
    input.leave_type_id &&
    input.start_date &&
    input.end_date &&
    input.end_date >= input.start_date;
  const quote = useQuery({
    queryKey: [
      "leave-form-quote",
      input.leave_type_id,
      input.start_date,
      input.end_date,
      input.session,
    ],
    queryFn: () =>
      api.post("/leave/form/quote", input).then((r) => r.data.quote),
    enabled: !!valid,
    retry: false,
  });
  const q = quote.data,
    fields = (k, v) => setInput((p) => ({ ...p, [k]: v }));
  const submit = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(input)) fd.append(k, String(v));
      fd.set("contact_phone", input.contact_phone ?? data.employee.phone ?? "");
      fd.set("contact_email", input.contact_email ?? data.employee.email ?? "");
      fd.set("submission_key", key);
      fd.set("fingerprint", q.fingerprint);
      fd.set("medical_certificate", String(medical));
      if (file) fd.append("attachment", file);
      return api.post("/leave/form/submit", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: (r) => {
      qc.invalidateQueries();
      toast.success(
        l("Sent to Manager and HR", "Manager နှင့် HR ထံ တင်ပြီးပါပြီ"),
      );
      onSubmitted?.(r.data.request);
      onClose();
    },
    onError: (e) => {
      toast.error(message(e));
      quote.refetch();
    },
  });
  const blocked =
    submit.isPending ||
    !data?.employee ||
    !data.workflow_enabled ||
    !q ||
    quote.isFetching ||
    q.issues.length > 0 ||
    (q.medical_required && (!file || !medical)) ||
    !input.declaration ||
    !input.signature.trim();
  return (
    <Modal
      open
      onClose={onClose}
      wide
      busy={submit.isPending}
      title={l("Request leave", "ခွင့်တောင်းဆိုရန်")}
      description={l(
        "One form. Manager review, then HR approval.",
        "Form တစ်ခုတည်းဖြင့် Manager စစ်ဆေးပြီး HR အတည်ပြုမည်။",
      )}
    >
      <form
        className="leave-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!blocked) submit.mutate();
        }}
      >
        <div className="ux-modal-body">
          {isLoading ? (
            <p>{l("Loading…", "ဖတ်နေသည်…")}</p>
          ) : error ? (
            <p role="alert">{message(error)}</p>
          ) : !data.employee ? (
            <p role="alert">
              {l(
                "Link your account to an employee record first.",
                "Account ကို ဝန်ထမ်းမှတ်တမ်းနှင့် အရင်ချိတ်ပါ။",
              )}
            </p>
          ) : (
            <>
              <div className="leave-form-identity">
                <strong>{data.employee.name}</strong>
                <span>
                  {data.employee.employee_number} ·{" "}
                  {data.employee.position || "—"}
                </span>
                <small>
                  {l("Manager / Supervisor", "Manager / တာဝန်ခံ")}:{" "}
                  {data.employee.manager || "—"}
                </small>
              </div>
              <fieldset disabled={submit.isPending}>
                <div className="ux-form-grid">
                  <label>
                    {l("Business unit", "လုပ်ငန်းအမည်")}
                    <input
                      maxLength={150}
                      value={input.business_unit}
                      onChange={(e) => fields("business_unit", e.target.value)}
                    />
                  </label>
                  <label>
                    {l("Leave type", "ခွင့်အမျိုးအစား")} *
                    <select
                      required
                      value={input.leave_type_id}
                      onChange={(e) => fields("leave_type_id", e.target.value)}
                    >
                      <option value="">
                        {l("Choose type", "အမျိုးအစားရွေးပါ")}
                      </option>
                      {data.types.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.type_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {l("Start date", "ခွင့်စရက်")} *
                    <input
                      type="date"
                      required
                      value={input.start_date}
                      onChange={(e) =>
                        setInput((p) => ({
                          ...p,
                          start_date: e.target.value,
                          end_date:
                            p.session !== "FULL" || p.end_date < e.target.value
                              ? e.target.value
                              : p.end_date,
                        }))
                      }
                    />
                  </label>
                  <label>
                    {l("End date", "ခွင့်ဆုံးရက်")} *
                    <input
                      type="date"
                      required
                      min={input.start_date || undefined}
                      disabled={input.session !== "FULL"}
                      value={input.end_date}
                      onChange={(e) => fields("end_date", e.target.value)}
                    />
                  </label>
                  <label className="ux-span-two">
                    {l("Full or partial day", "ရက်ပြည့် / ရက်ဝက်")}
                    <select
                      value={input.session}
                      onChange={(e) =>
                        setInput((p) => ({
                          ...p,
                          session: e.target.value,
                          end_date:
                            e.target.value === "FULL"
                              ? p.end_date
                              : p.start_date,
                        }))
                      }
                    >
                      {LEAVE_SESSIONS.map(([v, en, my]) => (
                        <option key={v} value={v}>
                          {l(en, my)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {l(
                      "Contact phone while away",
                      "ခွင့်ကာလအတွင်း ဆက်သွယ်ရန်ဖုန်း",
                    )}
                    <input
                      type="tel"
                      maxLength={100}
                      value={input.contact_phone ?? data.employee.phone ?? ""}
                      onChange={(e) => fields("contact_phone", e.target.value)}
                    />
                  </label>
                  <label>
                    {l("Contact email", "ဆက်သွယ်ရန် Email")}
                    <input
                      type="email"
                      maxLength={250}
                      value={input.contact_email ?? data.employee.email ?? ""}
                      onChange={(e) => fields("contact_email", e.target.value)}
                    />
                  </label>
                  <label className="ux-span-two">
                    {l("Reason for leave", "ခွင့်တောင်းရသည့်အကြောင်းရင်း")} *
                    <textarea
                      required
                      rows={3}
                      maxLength={4000}
                      value={input.reason}
                      onChange={(e) => fields("reason", e.target.value)}
                    />
                  </label>
                </div>
                {quote.isFetching ? (
                  <p role="status">
                    {l(
                      "Calculating schedule and balance…",
                      "အလုပ်ချိန်နှင့် လက်ကျန်ရက် တွက်နေသည်…",
                    )}
                  </p>
                ) : quote.error ? (
                  <p className="leave-form-alert" role="alert">
                    {message(quote.error)}
                  </p>
                ) : (
                  q && (
                    <section className="leave-form-preview">
                      <header>
                        <div>
                          <span>
                            {l(
                              "Working time requested",
                              "တောင်းဆိုသည့် အလုပ်လုပ်ရက်",
                            )}
                          </span>
                          <strong>
                            {q.working_days} <small>{l("days", "ရက်")}</small>
                          </strong>
                        </div>
                        <button type="button" onClick={() => quote.refetch()}>
                          {l("Refresh preview", "ပြန်တွက်ရန်")}
                        </button>
                      </header>
                      <p>
                        {l("Scheduled leave starts", "သတ်မှတ်ခွင့်စချိန်")}:{" "}
                        {stamp(q.start_at)} (Bangkok)
                      </p>
                      {q.notice_cutoff && (
                        <p>
                          {l("Submit by", "နောက်ဆုံးတင်ရမည့်ရက်")}:{" "}
                          {q.notice_cutoff} (Bangkok)
                        </p>
                      )}
                      <LeaveBalances rows={q.balances} />
                      <small>
                        {l(
                          "Only final HR approval deducts the balance. Other pending requests are not deducted. — means an unpaid balance is not tracked.",
                          "HR နောက်ဆုံးအတည်ပြုပြီးမှ လက်ကျန်ရက် လျော့မည်။ စောင့်ဆိုင်းနေသော အခြားတောင်းဆိုမှုများကို မနှုတ်ရသေးပါ။ — သည် လစာမဲ့ခွင့်လက်ကျန် မသတ်မှတ်ထားခြင်း ဖြစ်သည်။",
                        )}
                      </small>
                      {q.issues.length > 0 && (
                        <ul className="leave-form-alert" role="alert">
                          {q.issues.map((v) => (
                            <li key={v}>{v}</li>
                          ))}
                        </ul>
                      )}
                      <details>
                        <summary>
                          {l("See working dates", "အလုပ်လုပ်ရက်များကြည့်ရန်")}
                        </summary>
                        <ul className="leave-form-days">
                          {q.days.map((d) => (
                            <li key={d.date}>
                              <span>{d.date}</span>
                              <strong>
                                {d.working
                                  ? `${d.units} · ${d.session}`
                                  : l("Off day", "ရုံးပိတ်ရက်")}
                              </strong>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </section>
                  )
                )}
                <div className="ux-form-grid leave-form-documents">
                  <label className="ux-span-two">
                    {l(
                      q?.medical_required
                        ? "Medical certificate required"
                        : "Medical certificate / supporting file",
                      q?.medical_required
                        ? "ဆေးထောက်ခံစာ လိုအပ်သည်"
                        : "ဆေးထောက်ခံစာ / အထောက်အထားဖိုင်",
                    )}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const f = e.target.files[0];
                        if (f && f.size > 10485760) {
                          toast.error(
                            l(
                              "File must be 10 MB or smaller",
                              "ဖိုင်အရွယ်အစား 10 MB ထက် မကျော်ရပါ",
                            ),
                          );
                          e.target.value = "";
                          setFile(null);
                          return;
                        }
                        setFile(f || null);
                      }}
                    />
                    <small>PDF / JPEG / PNG · 10 MB</small>
                  </label>
                </div>
                {file && (
                  <label className="leave-form-check">
                    <input
                      type="checkbox"
                      checked={medical}
                      onChange={(e) => setMedical(e.target.checked)}
                    />
                    <span>
                      {l(
                        "This attachment is my medical certificate.",
                        "ဤဖိုင်သည် မိမိ၏ ဆေးထောက်ခံစာဖြစ်ပါသည်။",
                      )}
                    </span>
                  </label>
                )}
                <Policy />
                <label className="leave-form-check">
                  <input
                    type="checkbox"
                    checked={input.declaration}
                    onChange={(e) => fields("declaration", e.target.checked)}
                  />
                  <span>
                    {l(
                      "I confirm the details are accurate, accept the leave policy and understand that Manager and HR approval are required.",
                      "အချက်အလက်များ မှန်ကန်ကြောင်း အတည်ပြုပြီး ခွင့်စည်းမျဉ်းများကို လက်ခံပါသည်။ Manager နှင့် HR အတည်ပြုချက် လိုအပ်ကြောင်း နားလည်ပါသည်။",
                    )}
                  </span>
                </label>
                <label>
                  {l(
                    "Your full name as signature",
                    "လက်မှတ်အဖြစ် အမည်အပြည့်အစုံ",
                  )}{" "}
                  *
                  <input
                    required
                    maxLength={250}
                    value={input.signature}
                    onChange={(e) => fields("signature", e.target.value)}
                  />
                </label>
              </fieldset>
              {!data.workflow_enabled && (
                <p className="leave-form-alert">
                  {l(
                    "The owner needs to activate Leave in Approval Setup before you can submit.",
                    "မတင်မီ Owner က Approval Setup တွင် Leave လုပ်ငန်းစဉ်ကို ဖွင့်ပေးရပါမည်။",
                  )}
                </p>
              )}
            </>
          )}
        </div>
        <footer className="ux-modal-footer">
          <button
            type="button"
            className="ux-button ux-button-secondary"
            disabled={submit.isPending}
            onClick={onClose}
          >
            {l("Cancel", "ပယ်ဖျက်ရန်")}
          </button>
          <button
            type="submit"
            className="ux-button ux-button-primary"
            disabled={blocked}
          >
            {submit.isPending
              ? l("Submitting…", "တင်နေသည်…")
              : l("Sign & submit", "လက်မှတ်ထိုးပြီး တင်ရန်")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function LeaveFormReview({ id, showHistory = true }) {
  const l = useLeaveWords(),
    qc = useQueryClient(),
    [ack, setAck] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["leave-form-record", id],
    queryFn: () => api.get(`/leave/form/${id}`).then((r) => r.data),
    refetchInterval: 30000,
  });
  const acknowledge = useMutation({
    mutationFn: () =>
      api.post(`/leave/form/${id}/acknowledge`, { acknowledged: true }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success(
        l(
          "Conditions acknowledged",
          "သတ်မှတ်ချက်များကို ဖတ်ရှုကြောင်း မှတ်တမ်းတင်ပြီးပါပြီ",
        ),
      );
    },
    onError: (e) => toast.error(message(e)),
  });
  if (isLoading)
    return <p>{l("Loading leave form…", "ခွင့် Form ဖတ်နေသည်…")}</p>;
  if (error) return <p role="alert">{message(error)}</p>;
  const r = data.request,
    s = r.form_snapshot,
    e = s.employee;
  return (
    <div className="leave-form leave-form-review">
      <div className="leave-form-review-heading">
        <span className="uyf-eyebrow">UYF · {id.slice(0, 8)}</span>
        <a
          className="ux-button ux-button-secondary"
          href={`/api/leave/form/${id}/pdf`}
        >
          {l("Download PDF", "PDF ဒေါင်းလုဒ်")}
        </a>
      </div>
      <section>
        <h3>{l("Employee information", "ဝန်ထမ်းအချက်အလက်")}</h3>
        <dl>
          {[
            [l("Name", "အမည်"), e.name],
            [l("Employee ID", "ဝန်ထမ်းအမှတ်"), e.employee_number],
            [l("Business unit", "လုပ်ငန်းအမည်"), e.business_unit],
            [l("Job title", "ရာထူး"), e.position],
            [l("Department", "ဌာန"), e.department],
            [l("Manager", "Manager"), e.manager],
            [l("Phone", "ဖုန်း"), e.phone],
            [l("Email", "Email"), e.email],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v || "—"}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h3>{l("Leave details", "ခွင့်အချက်အလက်")}</h3>
        <p>
          <strong>{s.type_name}</strong> · {r.start_date} → {r.end_date} ·{" "}
          {r.session} ·{" "}
          <strong>
            {r.working_days} {l("working days", "အလုပ်လုပ်ရက်")}
          </strong>
        </p>
        <p className="leave-form-text">{r.reason}</p>
        {s.document && (
          <a
            href={`/api/leave/form/${id}/document`}
            target="_blank"
            rel="noreferrer"
          >
            {s.document.name} ↗
          </a>
        )}
      </section>
      <section>
        <h3>{l("Balance at submission", "တင်သွင်းချိန် လက်ကျန်ရက်")}</h3>
        <LeaveBalances rows={s.balances} />
        {s.final_balances && (
          <>
            <h3>{l("Balance at HR approval", "HR အတည်ပြုချိန် လက်ကျန်ရက်")}</h3>
            <LeaveBalances
              rows={s.final_balances.map((b) => ({
                ...b,
                type_name: s.type_name,
              }))}
              final
            />
          </>
        )}
      </section>
      <section>
        <h3>{l("Employee declaration", "ဝန်ထမ်းအတည်ပြုချက်")}</h3>
        <p>
          {s.input.signature} · {stamp(s.declared_at)} (Bangkok)
        </p>
      </section>
      <section>
        <h3>{l("Decision", "ဆုံးဖြတ်ချက်")}</h3>
        <strong>
          {r.status === "Approved" && r.conditions
            ? l(
                "Approved with conditions",
                "သတ်မှတ်ချက်များဖြင့် အတည်ပြုထားသည်",
              )
            : r.status}
        </strong>
        {r.conditions && (
          <div className="leave-form-conditions">
            <p className="leave-form-text">{r.conditions}</p>
            <small>
              {r.conditions_acknowledged_at
                ? `${l("Acknowledged", "ဖတ်ရှုကြောင်း အတည်ပြုထားသည်")} · ${stamp(r.conditions_acknowledged_at)}`
                : r.status === "Approved"
                  ? l(
                      "Employee acknowledgment pending",
                      "ဝန်ထမ်း ဖတ်ရှုအတည်ပြုရန် ကျန်ရှိသည်",
                    )
                  : r.status === "Rejected"
                    ? l(
                        "Request denied; these conditions are not an approval.",
                        "ခွင့်ငြင်းပယ်ထားသဖြင့် ဤသတ်မှတ်ချက်များသည် ခွင့်အတည်ပြုချက် မဟုတ်ပါ။",
                      )
                    : l(
                        "Awaiting final HR decision",
                        "HR နောက်ဆုံးဆုံးဖြတ်ချက်ကို စောင့်နေသည်",
                      )}
            </small>
          </div>
        )}
        {data.can_ack && (
          <>
            <label className="leave-form-check">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              <span>
                {l(
                  "I have read the approval conditions.",
                  "အတည်ပြုချက်ပါ သတ်မှတ်ချက်များကို ဖတ်ရှုပြီးပါပြီ။",
                )}
              </span>
            </label>
            <button
              className="ux-button ux-button-primary"
              disabled={!ack || acknowledge.isPending}
              onClick={() => acknowledge.mutate()}
            >
              {l("Acknowledge conditions", "ဖတ်ရှုပြီးကြောင်း အတည်ပြုရန်")}
            </button>
          </>
        )}
      </section>
      {showHistory && data.approval && (
        <section>
          <h3>{l("Approval history", "အတည်ပြုမှုမှတ်တမ်း")}</h3>
          <ol>
            {data.approval.stages.map((stage) => {
              const h = data.approval.history.find(
                (h) => h.stage === stage.key,
              );
              return (
                <li key={stage.key}>
                  <strong>{stage.label}</strong>
                  <p>
                    {h
                      ? `${h.actor_name} · ${h.decision} · ${stamp(h.at)}`
                      : stage.assignee_name}
                  </p>
                  {h?.comment && <p className="leave-form-text">{h.comment}</p>}
                </li>
              );
            })}
          </ol>
        </section>
      )}
      <Policy />
    </div>
  );
}
