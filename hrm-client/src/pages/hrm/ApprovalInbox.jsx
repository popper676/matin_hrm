import {useSearchParams} from 'react-router-dom';
import {WarningReview,WarningDecision} from "../../components/warnings/WarningForm";
import {ProbationReview,ProbationDecision} from "../../components/probation/ProbationForm";
import { ExpenseReview } from "../../components/expense/ExpenseForm";
import { PAYMENT_METHODS } from "../../../../shared/expenseForm.js";
import { LeaveFormReview } from "../../components/leave/LeaveForm";
import { InformationReview } from "../../components/employee/EmployeeInformation";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import Layout from "../../components/layout/Layout";
import Icon from "../../components/common/Icon";
import api from "../../api/client";
import "../../styles/access.css";
export default function ApprovalInbox() {
  const { user } = useAuth(),
    { language } = useLanguage(),
    my = language === "my",
    l = (en, mm) => (my ? mm : en),
    qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["approval-inbox"],
    queryFn: () => api.get("/approvals").then((r) => r.data),
    refetchInterval: 30000,
  });
  const [deepLink]=useSearchParams();
  const [filter, setFilter] = useState("waiting"),
    [selected, setSelected] = useState(()=>deepLink.get("request")||""),
    [comment, setComment] = useState(""),
    [leaveDecision, setLeaveDecision] = useState("approve"),
    [conditions, setConditions] = useState(""),
    [approvedAmount, setApprovedAmount] = useState(""),
    [payment, setPayment] = useState({
      amount: "",
      currency: "",
      date: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Bangkok",
      }).format(new Date()),
      reference: "",
      method: "",
    });
  useEffect(()=>{if(deepLink.get("request")){setSelected(deepLink.get("request"));setFilter("all");}},[deepLink]);
  const requests = data?.requests || [],
    item = requests.find((r) => r.id === selected),
    stage = item?.stages[item.current_stage];
  const itemId = item?.id, itemStage = item?.current_stage,
    paymentCap = item?.history.filter((h) => h.approved_amount != null).at(-1)?.approved_amount ?? item?.snapshot.requested_amount ?? "",
    paymentCurrency = item?.snapshot.currency || "";
  useEffect(() => {
    if (!itemId) return;
    setApprovedAmount(paymentCap);
    setPayment((p) => ({
      ...p,
      amount: paymentCap,
      currency: paymentCurrency,
      reference: "",
      method: "",
    }));
  }, [itemId, itemStage, paymentCap, paymentCurrency]);
  const visible = requests.filter((r) =>
    filter === "waiting"
      ? r.can_act
      : filter === "mine"
        ? r.requester_id === user.id
        : filter === "completed"
          ? r.status !== "pending"
          : true,
  );
  const decide = useMutation({
    mutationFn: (decision) =>
      api.post(`/approvals/${item.id}/decision`, {
        decision,
        comment,
        version: item.version,
        payment,
        approved_amount: approvedAmount,
        conditions,
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      setComment("");
      setConditions("");
      setLeaveDecision("approve");
      toast.success(
        l("Decision recorded", "ဆုံးဖြတ်ချက် မှတ်တမ်းတင်ပြီးပါပြီ"),
      );
    },
    onError: (e) => {
      toast.error(e.response?.data?.error || e.message);
      qc.invalidateQueries({ queryKey: ["approval-inbox"] });
    },
  });
  return (
    <Layout
      title={l("Approvals", "အတည်ပြုရန်")}
      subtitle={l(
        "See what needs you, and follow every decision.",
        "မိမိဆောင်ရွက်ရန်လိုအပ်သော အဆင့်နှင့် ဆုံးဖြတ်ချက်များကို ကြည့်ပါ။",
      )}
    >
      <div className="access-inbox-filters">
        {[
          ["waiting", "Waiting for me", "မိမိလုပ်ရန်"],
          ["mine", "My requests", "မိမိတောင်းဆိုမှု"],
          ["all", "All visible", "ကြည့်ခွင့်ရှိသမျှ"],
          ["completed", "Completed", "ပြီးဆုံးမှု"],
        ].map(([key, en, mm]) => (
          <button
            key={key}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {my ? mm : en}
            {key === "waiting" && (
              <span>{requests.filter((r) => r.can_act).length}</span>
            )}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="access-empty">{l("Loading…", "ဖတ်နေသည်…")}</div>
      ) : error ? (
        <div className="access-empty" role="alert">
          {error.response?.data?.error || error.message}
        </div>
      ) : (
        <div className="access-inbox-layout">
          <section className="access-request-list">
            {!visible.length ? (
              <div className="access-empty">
                <Icon name="active" size={30} />
                <h2>{l("You’re up to date", "လုပ်စရာ အသစ်မရှိသေးပါ")}</h2>
                <p>
                  {l(
                    "New requests will appear here after their workflow is activated.",
                    "လုပ်ငန်းစဉ် အသုံးပြုရန် ဖွင့်ပြီးနောက် တင်လာသော တောင်းဆိုမှုများကို ဤနေရာတွင် ပြမည်။",
                  )}
                </p>
              </div>
            ) : (
              visible.map((r) => (
                <button
                  key={r.id}
                  className="access-request"
                  aria-pressed={selected === r.id}
                  onClick={() => {
                    setSelected(r.id);
                    setComment("");
                    setConditions("");
                    setLeaveDecision("approve");
                    const last = r.history
                      .filter((h) => h.approved_amount != null)
                      .at(-1);
                    const cap =
                      last?.approved_amount ??
                      r.snapshot.requested_amount ??
                      "";
                    setApprovedAmount(cap);
                    setPayment((p) => ({
                      ...p,
                      amount: cap,
                      currency: r.snapshot.currency || "",
                      reference: "",
                      method: "",
                    }));
                  }}
                >
                  <span className="access-eyebrow">
                    {r.workflow_key.replaceAll("_", " ")}
                  </span>
                  <strong>{r.title}</strong>
                  <span>
                    {r.status === "pending"
                      ? r.stages[r.current_stage]?.label
                      : r.status}
                  </span>
                  <small>{new Date(r.created_at).toLocaleDateString()}</small>
                </button>
              ))
            )}
          </section>
          {item ? (
            <section className="access-editor">
              <header className="access-editor-head">
                <div>
                  <span className="access-eyebrow">{item.status}</span>
                  <h2>{item.title}</h2>
                  <p>{item.id}</p>
                </div>
              </header>
              <div className="access-section">
                {item.snapshot.warning_id ? <WarningReview id={item.snapshot.warning_id} showHistory={false}/> : item.snapshot.probation_id ? <ProbationReview id={item.snapshot.probation_id} showHistory={false}/> : item.snapshot.expense_form_id ? (
                  <ExpenseReview
                    id={item.snapshot.expense_form_id}
                    showHistory={false}
                  />
                ) : item.snapshot.leave_form_id ? (
                  <LeaveFormReview
                    id={item.snapshot.leave_form_id}
                    showHistory={false}
                  />
                ) : item.workflow_key === "employee_information" &&
                  item.snapshot.information_id ? (
                  <InformationReview id={item.snapshot.information_id} />
                ) : (
                  <>
                    <dl className="access-facts">
                      {Object.entries(item.snapshot)
                        .filter(([k]) => !k.includes("url"))
                        .map(([k, v]) => (
                          <div key={k}>
                            <dt>{k.replaceAll("_", " ")}</dt>
                            <dd>{String(v ?? "—")}</dd>
                          </div>
                        ))}
                    </dl>
                    {item.snapshot.document_url?.startsWith(
                      "/api/hr-files/",
                    ) && (
                      <a
                        href={item.snapshot.document_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {l("Open attachment", "တွဲထားသောဖိုင် ဖွင့်ရန်")} ↗
                      </a>
                    )}
                    {/^data:image\/(png|jpeg|webp|gif);base64,/.test(
                      item.snapshot.proof_image_url || "",
                    ) && (
                      <img
                        className="access-proof"
                        src={item.snapshot.proof_image_url}
                        alt={l("Expense proof", "အသုံးစရိတ် အထောက်အထား")}
                      />
                    )}
                  </>
                )}
              </div>
              <div className="access-section">
                <h3>{l("Approval route", "အတည်ပြု လမ်းကြောင်း")}</h3>
                <ol className="access-history">
                  {item.stages.map((s, i) => {
                    const event = item.history.find((h) => h.stage === s.key);
                    return (
                      <li
                        key={s.key}
                        className={
                          i === item.current_stage && item.status === "pending"
                            ? "is-current"
                            : ""
                        }
                      >
                        <strong>{s.label}</strong>
                        <span>{s.assignee_name}</span>
                        <small>
                          {event
                            ? `${event.decision} · ${event.actor_name} · ${new Date(event.at).toLocaleString()}`
                            : i === item.current_stage &&
                                item.status === "pending"
                              ? l("Waiting", "စောင့်နေသည်")
                              : l("Not reached", "မရောက်သေးပါ")}
                        </small>
                        {event?.comment && <p>{event.comment}</p>}
                        {event?.approved_amount != null && (
                          <p>
                            {l("Amount approved", "အတည်ပြုပမာဏ")}:{" "}
                            {event.approved_amount} {event.currency}
                          </p>
                        )}
                        {event?.conditions && (
                          <p className="leave-form-text">{event.conditions}</p>
                        )}
                        {event?.payment && (
                          <p>
                            {event.payment.amount} {event.payment.currency} ·{" "}
                            {event.payment.date} · {event.payment.reference}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
              {item.snapshot.warning_id&&<div className="access-section"><WarningDecision id={item.snapshot.warning_id}/></div>}
              {item.snapshot.probation_id&&<div className="access-section"><ProbationDecision id={item.snapshot.probation_id}/></div>}
              {item.can_act && !item.snapshot.probation_id && !item.snapshot.warning_id && (
                <form
                  className="access-section"
                  onSubmit={(e) => {
                    e.preventDefault();
                    decide.mutate(
                      stage.action === "pay"
                        ? "pay"
                        : item.snapshot.leave_form_id ||
                            item.snapshot.expense_form_id
                          ? leaveDecision
                          : "approve",
                    );
                  }}
                >
                  <h3>{l("Your decision", "သင့်ဆုံးဖြတ်ချက်")}</h3>
                  <label className="access-label" htmlFor="approval-comment">
                    {l("Comment / reason", "မှတ်ချက် / အကြောင်းပြချက်")}
                  </label>
                  <textarea
                    id="approval-comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                    maxLength={5000}
                  />
                  {(item.snapshot.leave_form_id ||
                    item.snapshot.expense_form_id) &&
                    stage.action !== "pay" && (
                      <div className="leave-form">
                        <label>
                          {l("Decision", "ဆုံးဖြတ်ချက်")}
                          <select
                            value={leaveDecision}
                            onChange={(e) => setLeaveDecision(e.target.value)}
                          >
                            <option value="approve">
                              {l("Approve", "အတည်ပြုရန်")}
                            </option>
                            <option value="approve_with_conditions">
                              {l(
                                "Approve with conditions",
                                "သတ်မှတ်ချက်များဖြင့် အတည်ပြုရန်",
                              )}
                            </option>
                          </select>
                        </label>
                        {leaveDecision === "approve_with_conditions" && (
                          <label>
                            {l(
                              "Approval conditions",
                              "အတည်ပြုချက်ပါ သတ်မှတ်ချက်များ",
                            )}{" "}
                            *
                            <textarea
                              required
                              rows={3}
                              maxLength={4000}
                              value={conditions}
                              onChange={(e) => setConditions(e.target.value)}
                            />
                          </label>
                        )}
                      </div>
                    )}
                  {item.snapshot.expense_form_id && stage.action !== "pay" && (
                    <label className="leave-form">
                      {l("Amount approved", "အတည်ပြုပမာဏ")} (
                      {item.snapshot.currency})
                      <input
                        type="number"
                        required
                        min="0.01"
                        step="0.01"
                        max={
                          item.history
                            .filter((h) => h.approved_amount != null)
                            .at(-1)?.approved_amount ??
                          item.snapshot.requested_amount
                        }
                        value={approvedAmount}
                        onChange={(e) => setApprovedAmount(e.target.value)}
                      />
                    </label>
                  )}
                  {stage.action === "pay" && (
                    <div className="access-payment-grid">
                      {item.snapshot.expense_form_id && (
                        <p style={{ gridColumn: "1/-1" }}>
                          {l(
                            "Record one final settlement. Explain a lower amount in the comment; payment cannot exceed approval.",
                            "နောက်ဆုံးငွေပေးချေမှုကို မှတ်တမ်းတင်ပါ။ အတည်ပြုပမာဏထက် နည်းပါက မှတ်ချက်တွင် ရှင်းပြပါ။ ပိုပေး၍ မရပါ။",
                          )}
                        </p>
                      )}
                      <label>
                        {l("Paid amount", "ပေးချေသည့်ပမာဏ")}
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          required
                          value={payment.amount}
                          onChange={(e) =>
                            setPayment({ ...payment, amount: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        {l("Currency", "ငွေကြေး")}
                        {item.snapshot.expense_form_id ? (
                          <input
                            value={payment.currency}
                            readOnly
                            aria-label="Payment currency"
                          />
                        ) : (
                          <select
                            required
                            value={payment.currency}
                            onChange={(e) =>
                              setPayment({
                                ...payment,
                                currency: e.target.value,
                              })
                            }
                          >
                            <option value="">—</option>
                            {["THB", "MMK", "USD"].map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                        )}
                      </label>
                      {item.snapshot.expense_form_id && (
                        <label>
                          {l("Actual payment method", "အမှန်တကယ် ပေးချေနည်း")}
                          <select
                            required
                            value={payment.method}
                            onChange={(e) =>
                              setPayment({ ...payment, method: e.target.value })
                            }
                          >
                            <option value="">—</option>
                            {PAYMENT_METHODS.map((m) => (
                              <option key={m}>{m}</option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label>
                        {l("Payment date", "ငွေပေးချေသည့်ရက်")}
                        <input
                          type="date"
                          required
                          value={payment.date}
                          onChange={(e) =>
                            setPayment({ ...payment, date: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        {l("Payment reference", "ငွေပေးချေမှုအမှတ်")}
                        <input
                          required
                          value={payment.reference}
                          onChange={(e) =>
                            setPayment({
                              ...payment,
                              reference: e.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                  )}
                  <div className="access-decision-actions">
                    <button
                      type="button"
                      disabled={decide.isPending || !comment.trim()}
                      onClick={() => decide.mutate("reject")}
                    >
                      {l(
                        "Reject with reason",
                        "အကြောင်းပြချက်ဖြင့် ငြင်းပယ်ရန်",
                      )}
                    </button>
                    <button
                      type="submit"
                      disabled={
                        decide.isPending ||
                        ((item.snapshot.leave_form_id ||
                          item.snapshot.expense_form_id) &&
                          leaveDecision === "approve_with_conditions" &&
                          !conditions.trim())
                      }
                      className="access-primary"
                    >
                      {stage.action === "pay"
                        ? l("Record payment", "ငွေပေးချေမှု မှတ်တမ်းတင်ရန်")
                        : l("Approve this step", "ဤအဆင့် အတည်ပြုရန်")}
                    </button>
                  </div>
                </form>
              )}
            </section>
          ) : (
            <section className="access-empty">
              <Icon name="documents" size={30} />
              <h2>{l("Select a request", "တောင်းဆိုမှုတစ်ခု ရွေးပါ")}</h2>
              <p>
                {l(
                  "Its details and decision history will appear here.",
                  "အသေးစိတ်အချက်အလက်နှင့် ဆုံးဖြတ်ချက်မှတ်တမ်းကို ဤနေရာတွင် ပြမည်။",
                )}
              </p>
            </section>
          )}
        </div>
      )}
    </Layout>
  );
}
