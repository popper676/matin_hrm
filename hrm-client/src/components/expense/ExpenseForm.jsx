import {expenseRoutePolicy} from '../../../../shared/expenseRouting.js';
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useLanguage } from "../../context/LanguageContext";
import api from "../../api/client";
import Modal from "../experience/Modal";
import Icon from "../common/Icon";
import {
  BUSINESS_UNITS,
  EXPENSE_CATEGORIES,
  expenseDisplayFields,
  expenseInput,
} from "../../../../shared/expenseForm.js";
import "../../styles/leave-form.css";
import "../../styles/expense-form.css";
const money = (v, c) =>
  `${Number(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c || ""}`;
function useWords() {
  const { language } = useLanguage();
  return (en, my) => (language === "my" ? my : en);
}

const bangkokToday = () => new Date().toLocaleDateString("sv-SE", {timeZone:"Asia/Bangkok"});
const softwareCategories = ["AI Tools / Software","CRM","Cloud/Hosting"];

export function ExpenseForm({onClose,onDone}) {
 const l=useWords();
 const [input,setInput]=useState({
  business_unit:"",category:"",description:"",requested_amount:"",
  currency:"THB",expense_date:bangkokToday(),urgency:"Normal",
  vendor:"",required_payment_date:"",urgency_reason:"",
  destination:"",travel_date:"",service_name:"",
  is_recurring:"false",subscription_period:"",
  event_name:"",has_scheduled_date:"false",planned_date:""
 });
 const [files,setFiles]=useState([]);
 const [key]=useState(()=>crypto.randomUUID());
 const [error,setError]=useState("");
 const set=(field,value)=>setInput(current=>({...current,[field]:value}));
 const meta=useQuery({queryKey:["expense-meta"],queryFn:()=>api.get("/expense-forms/meta").then(r=>r.data)});
 const save=useMutation({
  mutationFn:async()=>{
   const clean=expenseInput(input,meta.data.business_units||BUSINESS_UNITS);
   const fd=new FormData();
   Object.entries(clean).forEach(([k,v])=>fd.append(k,String(v)));
   fd.append("submission_key",key);
   files.forEach(file=>fd.append("attachments",file));
   return api.post("/expense-forms/submit",fd,{headers:{"Content-Type":undefined}});
  },
  onSuccess:r=>onDone(r.data.reward),
  onError:e=>setError(e.response?.data?.error||e.message)
 });
 const routePreview=useMutation({mutationFn:()=>api.post("/expense-forms/preview",{currency:input.currency,amount:input.requested_amount}).then(r=>r.data)});
 const routePolicy=meta.data?.routing?.mode==="amount"&&Number(input.requested_amount)>0
  ?expenseRoutePolicy(meta.data.routing,input.currency,input.requested_amount):null;
 const urgent=input.urgency!=="Normal";
 const software=softwareCategories.includes(input.category);
 const scheduled=input.category==="Training"||input.category==="Events";
 return (
  <Modal open onClose={onClose} busy={save.isPending} wide
   title={l("Request an expense","အသုံးစရိတ် တောင်းဆိုရန်")}
   description={l("Fast request · additional details appear only when needed","လိုအပ်သော အချက်အလက်များကိုသာ ဖြည့်ရန်")}>
   <form className="leave-form expense-form" onSubmit={e=>{e.preventDefault();setError("");save.mutate();}}>
    <div className="ux-modal-body">
     {meta.isLoading?<p>{l("Loading…","ဖတ်နေသည်…")}</p>:meta.error?
      <p role="alert">{meta.error.response?.data?.error||meta.error.message}</p>:<>
      <div className="leave-form-identity">
       <strong>{meta.data.employee?.name||l("Link your employee record first","ဝန်ထမ်းမှတ်တမ်းနှင့် အရင်ချိတ်ဆက်ပါ")}</strong>
       <span>{meta.data.employee?.employee_number} · {meta.data.employee?.department||"—"}</span>
       <small>{l("Request ID and submission date are generated on submit.","Request ID နှင့် တင်သွင်းရက်ကို System က အလိုအလျောက်ထုတ်ပေးသည်။")}</small>
      </div>
      {!meta.data.workflow_enabled&&<p role="alert" className="ux-form-error">{l("Ask the Owner to activate expense approvals.","Owner က Expense Approvals ဖွင့်ပေးရန်လိုသည်။")}</p>}
      <div className="ux-form-grid leave-form-grid">
       <label>{l("Expense business","အသုံးစရိတ်လုပ်ငန်း")} *
        <select required value={input.business_unit} onChange={e=>set("business_unit",e.target.value)}>
         <option value="">{l("Choose…","ရွေးပါ…")}</option>
         {(meta.data.business_units||BUSINESS_UNITS).map(unit=><option key={unit[0]} value={unit[0]}>{unit[1]}</option>)}
        </select>
       </label>
       <label>{l("Expense category","အသုံးစရိတ်အမျိုးအစား")} *
        <select required value={input.category} onChange={e=>set("category",e.target.value)}>
         <option value="">{l("Choose…","ရွေးပါ…")}</option>
         {EXPENSE_CATEGORIES.map(category=><option key={category} value={category}>{category}</option>)}
        </select>
       </label>
       <label className="expense-wide">{input.category==="Procurement"
         ?l("Item / service details and reason","ပစ္စည်း / ဝန်ဆောင်မှု အသေးစိတ်နှင့် အကြောင်းရင်း")
         :l("What is this expense for?","ဘာအတွက် အသုံးပြုမှာလဲ")} *
        <textarea rows={3} required maxLength={4000} value={input.description} onChange={e=>set("description",e.target.value)}/>
       </label>
       <label>{l("Requested amount","တောင်းဆိုငွေ")} *
        <input type="number" required min="0.01" step="0.01" value={input.requested_amount} onChange={e=>set("requested_amount",e.target.value)}/>
       </label>
       <label>{l("Currency","ငွေကြေး")} *
        <input required type="text" list="expense-currency-suggestions" pattern="[A-Z]{3}" maxLength={3}
         value={input.currency} onChange={e=>set("currency",e.target.value.toUpperCase())}/>
        <datalist id="expense-currency-suggestions">
         {["THB","MMK","USD","SGD"].map(code=><option key={code} value={code}/>)}
        </datalist>
       </label>
       {input.category==="Travel & Transportation"&&<>
        <label>{l("Destination","သွားမည့်နေရာ")} *
         <input required maxLength={250} value={input.destination} onChange={e=>set("destination",e.target.value)}/>
        </label>
        <label>{l("Travel date","ခရီးသွားမည့်ရက်")} *
         <input required type="date" value={input.travel_date} onChange={e=>set("travel_date",e.target.value)}/>
        </label>
       </>}
       {software&&<>
        <label className="expense-wide">{l("Software / service name","Software / ဝန်ဆောင်မှုအမည်")} *
         <input required maxLength={250} value={input.service_name} onChange={e=>set("service_name",e.target.value)}/>
        </label>
        <label>{l("Payment type","ပေးချေမှုပုံစံ")}
         <select value={input.is_recurring} onChange={e=>set("is_recurring",e.target.value)}>
          <option value="false">{l("One-time","တစ်ကြိမ်တည်း")}</option>
          <option value="true">{l("Recurring","ထပ်တလဲလဲပေးချေမှု")}</option>
         </select>
        </label>
        {input.is_recurring==="true"&&<label>{l("Subscription / billing period","ပေးချေမှုကာလ")} *
         <input required maxLength={250} placeholder="November 2026" value={input.subscription_period} onChange={e=>set("subscription_period",e.target.value)}/>
        </label>}
       </>}
       {scheduled&&<>
        <label className="expense-wide">{input.category==="Training"
         ?l("Training name","သင်တန်းအမည်"):l("Event name","ပွဲအမည်")} *
         <input required maxLength={250} value={input.event_name} onChange={e=>set("event_name",e.target.value)}/>
        </label>
        <label>{l("Is the date confirmed?","ရက်ချိန်းအတည်ပြုပြီးပြီလား")}
         <select value={input.has_scheduled_date} onChange={e=>set("has_scheduled_date",e.target.value)}>
          <option value="false">{l("Not yet","မသတ်မှတ်ရသေး")}</option>
          <option value="true">{l("Yes","အတည်ပြုပြီး")}</option>
         </select>
        </label>
        {input.has_scheduled_date==="true"&&<label>{l("Scheduled date","သတ်မှတ်ထားသောရက်")} *
         <input required type="date" value={input.planned_date} onChange={e=>set("planned_date",e.target.value)}/>
        </label>}
       </>}
      </div>
      <details className="expense-extra-details">
       <summary>{l("Additional details (optional)","နောက်ထပ် အချက်အလက်များ (Optional)")}</summary>
       <div className="ux-form-grid leave-form-grid">
        <label>{l("Expense date","အသုံးစရိတ်ရက်စွဲ")}
         <input required type="date" value={input.expense_date} onChange={e=>set("expense_date",e.target.value)}/>
         <small>{l("Defaults to today. Change if different.","ယနေ့ရက်ကို ထည့်ထားသည်။ မတူလျှင် ပြင်ပါ။")}</small>
        </label>
        <label>{l("Vendor / payee","ပေးချေရမည့်သူ / ဆိုင်")}
         <input maxLength={250} value={input.vendor} onChange={e=>set("vendor",e.target.value)}/>
        </label>
        <label>{l("Urgency","အရေးပေါ်အဆင့်")}
         <select value={input.urgency} onChange={e=>set("urgency",e.target.value)}>
          <option value="Normal">{l("Normal","ပုံမှန်")}</option>
          <option value="Urgent">{l("Urgent","အရေးကြီး")}</option>
          <option value="Critical">{l("Critical","အလွန်အရေးကြီး")}</option>
         </select>
        </label>
        <label>{l("Required payment date","ပေးချေရန်လိုသည့်ရက်")}{urgent?" *":""}
         <input type="date" required={urgent} value={input.required_payment_date} onChange={e=>set("required_payment_date",e.target.value)}/>
        </label>
        {urgent&&<label className="expense-wide">{l("Urgency reason","အရေးတကြီးဖြစ်ရသည့်အကြောင်း")} *
         <textarea required rows={2} maxLength={4000} value={input.urgency_reason} onChange={e=>set("urgency_reason",e.target.value)}/>
        </label>}
       </div>
      </details>
      <label>{l("Quotation / receipt (always optional)","ဈေးနှုန်းစာ / ပြေစာ (အမြဲ Optional)")}
       <input type="file" multiple accept="application/pdf,image/jpeg,image/png" onChange={e=>{
        const chosen=[...e.target.files];
        if(chosen.length>5||chosen.some(file=>file.size>10485760)){
         setError(l("Up to 5 files, max 10 MB each.","ဖိုင် ၅ ဖိုင်အထိ၊ တစ်ဖိုင် 10 MB အများဆုံး။"));
         e.target.value="";setFiles([]);return;
        }
        setError("");setFiles(chosen);
       }}/>
       <small>PDF / JPEG / PNG · 5 files · 10 MB each</small>
      </label>
      {meta.data.routing?.mode==="amount"&&input.currency.length===3&&Number(input.requested_amount)>0&&
       <div className="expense-route-preview-action">
        <button type="button" className="ux-button ux-button-secondary" disabled={routePreview.isPending} onClick={()=>routePreview.mutate()}>{l("See assigned reviewers","အတည်ပြုမည့်သူများ ကြည့်ရန်")}</button>
        {routePreview.error&&<p role="alert">{routePreview.error.response?.data?.error||routePreview.error.message}</p>}
        {routePreview.data&&Number(routePreview.data.policy.requested_amount)===Number(input.requested_amount)&&routePreview.data.policy.currency===input.currency&&
         <ol className="expense-reviewer-preview">{routePreview.data.stages.map(stage=><li key={stage.key}><strong>{stage.label}</strong><span>{stage.assignee_name}</span></li>)}</ol>}
       </div>}
      {routePolicy&&<section className="expense-route-summary" aria-label={l("Approval route","အတည်ပြုလမ်းကြောင်း")}>
       <Icon name="handover" size={21}/>
       <div>
        <strong>{l(routePolicy.ceo_required?"CEO review is required":"Within the AGM approval limit",routePolicy.ceo_required?"CEO အတည်ပြုရန် လိုအပ်သည်":"AGM အတည်ပြုနိုင်သော ပမာဏအတွင်း ဖြစ်သည်")}</strong>
        <p>{routePolicy.agm_limit==null?l("No AGM limit is configured for this currency.","ဤငွေကြေးအတွက် AGM limit မသတ်မှတ်ထားပါ။"):"AGM limit: "+money(routePolicy.agm_limit,input.currency)}</p>
        <small>{l("The original requested amount sets the route. Finance payment is recorded separately.","မူလတောင်းဆိုငွေဖြင့် Approval အဆင့် သတ်မှတ်သည်။ Finance ငွေပေးချေမှု သီးခြားမှတ်တမ်းတင်မည်။")}</small>
       </div>
      </section>}
      <p className="expense-policy">{l("Submit before spending. Attachments are always optional. Approval and payment are separate.","အသုံးမပြုမီ တင်ပါ။ ပြေစာ အမြဲ Optional ဖြစ်သည်။ Approval နှင့် Payment သီးခြားဖြစ်သည်။")}</p>
     </>}
     {error&&<p role="alert" className="ux-form-error">{error}</p>}
    </div>
    <footer className="ux-modal-footer">
     <button type="button" className="ux-button ux-button-secondary" disabled={save.isPending} onClick={onClose}>{l("Cancel","မလုပ်တော့ပါ")}</button>
     <button className="ux-button ux-button-primary" disabled={save.isPending||!meta.data?.employee||!meta.data?.workflow_enabled}>{save.isPending?l("Submitting…","တင်နေသည်…"):l("Submit expense","အသုံးစရိတ် တင်သွင်းရန်")}</button>
    </footer>
   </form>
  </Modal>
 );
}
export function ExpenseReview({ id, showHistory = true }) {
  const l = useWords(),
    q = useQuery({
      queryKey: ["expense-form", id],
      queryFn: () => api.get(`/expense-forms/${id}`).then((r) => r.data),
    });
  if (q.isLoading) return <p>{l("Loading…", "ဖတ်နေသည်…")}</p>;
  if (q.error)
    return (
      <p role="alert">{q.error.response?.data?.error || q.error.message}</p>
    );
  const { request: r, approval: a } = q.data,
    f = r.form_snapshot,
    i = f.input;
  return (
    <article className="expense-review leave-form-review">
      <div className="expense-review-head">
        <span className="access-eyebrow">{r.request_number}</span>
        <a
          className="ux-button ux-button-secondary"
          href={`/api/expense-forms/${r.id}/pdf`}
          target="_blank"
          rel="noreferrer"
        >
          {l("Download PDF", "PDF ဒေါင်းလုဒ်")}
        </a>
      </div>
      {f.routing?.mode==='amount'&&<div className="expense-route-summary"><Icon name="handover" size={20}/><div><strong>{l('Saved approval policy','တင်စဉ်က အတည်ပြုမူဝါဒ')}</strong><p>{l(f.routing.ceo_required?'AGM → CEO → payment':'AGM → payment',f.routing.ceo_required?'AGM → CEO → ငွေပေးချေမှု':'AGM → ငွေပေးချေမှု')} · {l('Policy version ','မူဝါဒ version ')}{f.routing.version}</p><small>{l('Based on the original requested amount; later policy edits do not change this route.','မူလတောင်းဆိုပမာဏဖြင့် သတ်မှတ်ထားသည်။ နောက်မှ မူဝါဒပြောင်းလည်း ဤလမ်းကြောင်း မပြောင်းပါ။')}</small></div></div>}
      <h3>{l("Request details", "တောင်းဆိုမှု အသေးစိတ်")}</h3>
      <dl className="access-facts">
        <div>
          <dt>{l("Requested by", "တောင်းဆိုသူ")}</dt>
          <dd>
            {f.employee.name} · {f.employee.employee_number}
          </dd>
        </div>
        <div>
          <dt>{l("Department", "ဌာန")}</dt>
          <dd>{f.employee.department || "—"}</dd>
        </div>
        <div>
          <dt>{l("Request date", "တောင်းဆိုသည့်ရက်")}</dt>
          <dd>{f.request_date}</dd>
        </div>
        <div>
          <dt>{l("Status", "အခြေအနေ")}</dt>
          <dd>
            {r.status === "APPROVED"
              ? l(
                  "Approved · awaiting Finance payment",
                  "အတည်ပြုပြီး · ငွေပေးချေရန် ကျန်သည်",
                )
              : r.status}
          </dd>
        </div>
        {expenseDisplayFields(i).map(([k, en, my]) => (
          <div key={k}>
            <dt>{l(en, my)}</dt>
            <dd>
              {k === "business_unit"
                ? r.form_snapshot.business_name||BUSINESS_UNITS.find((b) => b[0] === i[k])?.[1]||i[k]
                : k.endsWith("_amount")
                  ? money(i[k], r.currency)
                  : i[k]}
            </dd>
          </div>
        ))}
        {f.budget_remaining != null && <div>
          <dt>{l("Historical budget remaining", "ယခင် Budget လက်ကျန်")}</dt>
          <dd>{money(f.budget_remaining, r.currency)}</dd>
        </div>}
        <div>
          <dt>{l("Latest authorized amount", "လက်ရှိ အတည်ပြုပမာဏ")}</dt>
          <dd>
            {r.approved_amount == null
              ? "—"
              : money(r.approved_amount, r.currency)}
          </dd>
        </div>
        {r.status === "PAID" && (
          <>
            <div>
              <dt>{l("Final paid amount", "နောက်ဆုံး ပေးချေသည့်ပမာဏ")}</dt>
              <dd>{money(r.paid_amount, r.currency)}</dd>
            </div>
            <div>
              <dt>
                {l("Payment date / reference", "ပေးချေရက် / မှတ်တမ်းအမှတ်")}
              </dt>
              <dd>
                {r.payment_date} · {r.payment_reference}
              </dd>
            </div>
          </>
        )}
      </dl>
      {f.budget_remaining != null && <p className="expense-policy">
        {l("Historical requester reference only, not an accounting budget balance.", "ယခင် ဝန်ထမ်းထည့်ခဲ့သော Budget ရည်ညွှန်းချက်သာဖြစ်သည်။")}
      </p>}
      {!!f.documents?.length && (
        <section>
          <h3>{l("Quotations / receipts", "ဈေးနှုန်းစာ / ပြေစာများ")}</h3>
          <ul className="expense-files">
            {f.documents.map((d) => (
              <li key={d.id}>
                <a
                  href={`/api/expense-forms/${r.id}/documents/${d.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon name="documents" size={16} />
                  {d.name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {showHistory && (
        <section>
          <h3>
            {l(
              "Approval route & management notes",
              "အတည်ပြုအဆင့်များနှင့် မှတ်ချက်များ",
            )}
          </h3>
          <ol className="access-history">
            {a?.stages.map((s) => {
              const h = a.history.find((h) => h.stage === s.key);
              return (
                <li key={s.key}>
                  <strong>{s.label}</strong>
                  <span>{h?.actor_name || s.assignee_name}</span>
                  <small>
                    {h
                      ? `${h.decision} · ${new Date(h.at).toLocaleString("en-GB", { timeZone: "Asia/Bangkok" })} (Bangkok)`
                      : l("Not completed", "မပြီးသေးပါ")}
                  </small>
                  {h?.approved_amount != null && (
                    <p>{money(h.approved_amount, r.currency)}</p>
                  )}
                  {h?.comment && <p>{h.comment}</p>}
                  {h?.conditions && <p>{h.conditions}</p>}
                  {h?.payment && (
                    <p>
                      {money(h.payment.amount, r.currency)} · {h.payment.method}{" "}
                      · {h.payment.date} · {h.payment.reference}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </article>
  );
}
export default function ExpenseWorkspace({ records = [], canSubmit = true }) {
  const l = useWords(),
    qc = useQueryClient(),
    [open, setOpen] = useState(false),
    [selected, setSelected] = useState(()=>new URLSearchParams(window.location.search).get("expense")||"");
  const expenses = records.filter((r) => r.form_version === 2);
  return (
    <section className="expense-workspace">
      <div className="ux-section-toolbar">
        <div>
          <h2>{l("Expense requests", "အသုံးစရိတ် တောင်းဆိုမှုများ")}</h2>
          <p>
            {l(
              "Track approval and the final payment separately.",
              "အတည်ပြုမှုနှင့် နောက်ဆုံးငွေပေးချေမှုကို ကြည့်ပါ။",
            )}
          </p>
        </div>
        {canSubmit && (
          <button
            className="ux-button ux-button-primary"
            onClick={() => setOpen(true)}
          >
            <Icon name="add" size={17} />
            {l("Request an expense", "အသုံးစရိတ် တောင်းဆိုရန်")}
          </button>
        )}
      </div>
      {!expenses.length ? (
        <p className="expense-policy">
          {l("No expense requests yet.", "အသုံးစရိတ် တောင်းဆိုမှု မရှိသေးပါ။")}
        </p>
      ) : (
        <div className="expense-cards">
          {expenses.map((r) => (
            <button
              key={r.id}
              className="expense-card"
              onClick={() => setSelected(r.id)}
            >
              <span className="access-eyebrow">{r.request_number}</span>
              <strong>{r.description}</strong>
              <span>{money(r.requested_amount, r.currency)}</span>
              <small>
                {r.status === "APPROVED"
                  ? l(
                      "Approved · awaiting payment",
                      "အတည်ပြုပြီး · ပေးချေရန် ကျန်သည်",
                    )
                  : r.status}
              </small>
              {r.status === "PAID" && (
                <small>
                  {l("Paid", "ပေးချေပြီး")}: {money(r.paid_amount, r.currency)}{" "}
                  · {r.payment_date}
                </small>
              )}
              <span className="expense-card-link">
                {l("Form, decisions & PDF", "Form၊ ဆုံးဖြတ်ချက်နှင့် PDF")} ↗
              </span>
            </button>
          ))}
        </div>
      )}
      {open && (
        <ExpenseForm
          onClose={() => setOpen(false)}
          onDone={(r) => {
            setOpen(false);
            setSelected(r.id);
            qc.invalidateQueries();
            toast.success(
              l("Expense submitted", "အသုံးစရိတ် တင်သွင်းပြီးပါပြီ"),
            );
          }}
        />
      )}
      {!!selected && (
        <Modal
          open
          onClose={() => setSelected("")}
          wide
          title={l("Expense request", "အသုံးစရိတ် တောင်းဆိုမှု")}
        >
          <div className="ux-modal-body">
            <ExpenseReview id={selected} />
          </div>
        </Modal>
      )}
    </section>
  );
}
