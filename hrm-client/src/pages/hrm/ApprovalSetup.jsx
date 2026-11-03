import ExpenseRoutingSettings from '../../components/expense/ExpenseRoutingSettings';
import LeaveCalendar from "../../components/leave/LeaveCalendar";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Layout from "../../components/layout/Layout";
import Icon from "../../components/common/Icon";
import { useLanguage } from "../../context/LanguageContext";
import api from "../../api/client";
import "../../styles/access.css";
export default function ApprovalSetup() {
  const { language } = useLanguage(),
    my = language === "my",
    l = (en, mm) => (my ? mm : en),
    qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["people-access"],
    queryFn: () => api.get("/access").then((r) => r.data),
  });
  const [expenseMode,setExpenseMode]=useState("standard"),[routingDirty,setRoutingDirty]=useState(false);
  const [key, setKey] = useState(""),
    [stages, setStages] = useState([]),
    [enabled, setEnabled] = useState(false),
    [version, setVersion] = useState(0),
    [dirty, setDirty] = useState(false),
    [requester, setRequester] = useState(""),
    [preview, setPreview] = useState(null);
  const def = data?.workflows[key],
    live = ["employee_information", "leave", "expense", "probation", "warning"].includes(key);
  function select(next) {
    if (
      (dirty||routingDirty) &&
      !window.confirm(
        l(
          "Discard unsaved workflow changes?",
          "မသိမ်းရသေးသော ပြင်ဆင်ချက်များကို ပယ်ဖျက်မလား။",
        ),
      )
    )
      return;
    const value = data.settings.find((s) => s.workflow_key === next);
    setKey(next);
    setRoutingDirty(false);
    setStages(
      structuredClone(
        value?.stages ||
          data.workflows[next].stages.map(([k, label, action]) => ({
            key: k,
            label,
            action,
            assignee_id: "",
            alternate_id: "",
          })),
      ),
    );
    setVersion(value?.version || 0);
    setEnabled(value?.enabled || false);
    setDirty(false);
    setPreview(null);
  }
  const save = useMutation({
    mutationFn: () =>
      api.put(`/access/workflows/${key}`, { stages, enabled, version }),
    onSuccess: (r) => {
      setVersion(r.data.setting.version);
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["people-access"] });
      toast.success(l("Workflow saved", "လုပ်ငန်းစဉ် သိမ်းပြီးပါပြီ"));
    },
    onError: (e) => toast.error(e.response?.data?.error || e.message),
  });
  const test = useMutation({
    mutationFn: () =>
      api.post(`/access/workflows/${key}/preview`, {
        stages,
        requester_id: requester,
      }),
    onSuccess: (r) => setPreview(r.data),
    onError: (e) => toast.error(e.response?.data?.error || e.message),
  });
  function change(i, field, id) {
    setStages(stages.map((s, n) => (n === i ? { ...s, [field]: id } : s)));
    setDirty(true);
    setPreview(null);
  }
  return (
    <Layout
      title={l("Approval Setup", "အတည်ပြုအဆင့် သတ်မှတ်ရန်")}
      subtitle={l(
        "Choose a person for every step in the approved forms.",
        "အတည်ပြုပြီးသော Form များ၏ အဆင့်တိုင်းအတွက် တာဝန်ယူသူ ရွေးပါ။",
      )}
    >
      <div className="access-topline">
        <span className="access-pill">
          <Icon name="orgchart" size={16} />
          {l("People, not job titles", "ရာထူးထက် တာဝန်ယူသူကို ရွေးပါ")}
        </span>
        <Link to="/people-access">
          {l("People & Access", "လူများနှင့် သုံးခွင့်")} →
        </Link>
      </div>
      {isLoading ? (
        <div className="access-empty">{l("Loading…", "ဖတ်နေသည်…")}</div>
      ) : error ? (
        <div className="access-empty" role="alert">
          {error.response?.data?.error || error.message}
        </div>
      ) : (
        <>
          <nav className="access-workflow-tabs" aria-label="Workflow">
            {Object.entries(data.workflows).map(([k, w]) => (
              <button
                key={k}
                aria-pressed={key === k}
                onClick={() => select(k)}
              >
                <Icon
                  name={
                    k === "expense"
                      ? "payroll"
                      : k === "leave"
                        ? "leave"
                        : "documents"
                  }
                  size={20}
                />
                <strong>{my ? w.my : w.label}</strong>
                <small>
                  {k==='expense'&&data.expense_routing?.mode==='amount'?l("Amount policy", "ပမာဏအလိုက်"):<>{w.stages.length} {l("steps", "ဆင့်")}</>} ·{" "}
                  {(k==='expense'&&data.expense_routing?.mode==='amount')||data.settings.find((s) => s.workflow_key === k)?.enabled
                    ? l("Active", "အသုံးပြုနေသည်")
                    : l("Setup", "သတ်မှတ်ရန်")}
                </small>
              </button>
            ))}
          </nav>
          {key==='expense'&&<ExpenseRoutingSettings users={data.users} onModeChange={setExpenseMode} onDirty={setRoutingDirty}/>}
          {key==='expense'&&expenseMode==='amount'?null:!def ? (
            <div className="access-empty">
              <h2>{l("Choose a workflow", "လုပ်ငန်းစဉ်တစ်ခု ရွေးပါ")}</h2>
              <p>
                {l(
                  "Preview the route before activating it.",
                  "အသုံးမပြုမီ တောင်းဆိုမှုသွားမည့်လမ်းကြောင်းကို စမ်းကြည့်ပါ။",
                )}
              </p>
            </div>
          ) : (
            <div className="access-flow-layout">
              <section className="access-editor">
                <header className="access-editor-head">
                  <div>
                    <span className="access-eyebrow">
                      {l("APPROVAL ROUTE", "အတည်ပြု လမ်းကြောင်း")}
                    </span>
                    <h2>{my ? def.my : def.label}</h2>
                    <p>
                      {l(
                        "Existing requests retain their saved approvers. Changes apply to new requests.",
                        "ရှိပြီးသားတောင်းဆိုမှုများတွင် မူလတာဝန်ယူသူများကို ထိန်းထားမည်။ အသစ်များတွင်သာ ပြောင်းလဲမှုသက်ရောက်မည်။",
                      )}
                    </p>
                  </div>
                </header>
                <div className="access-stages">
                  {stages.map((s, i) => (
                    <article className="access-stage" key={s.key}>
                      <span className="access-stage-number">{i + 1}</span>
                      <div>
                        <h3>{s.label}</h3>
                        <p>
                          {s.action === "pay"
                            ? l(
                                "Record the actual payment",
                                "အမှန်တကယ်ငွေပေးချေမှု မှတ်တမ်းတင်ရန်",
                              )
                            : l("Review and decide", "စစ်ဆေးဆုံးဖြတ်ရန်")}
                        </p>
                        <div className="access-stage-selects">
                          {[
                            ["assignee_id", "Responsible person", "တာဝန်ယူသူ"],
                            [
                              "alternate_id",
                              "Alternate for own requests",
                              "ကိုယ့်တောင်းဆိုမှုအတွက် အစားထိုးသူ",
                            ],
                          ].map(([field, en, mm]) => (
                            <label key={field}>
                              {my ? mm : en}
                              <select
                                value={s[field] || ""}
                                onChange={(e) =>
                                  change(i, field, e.target.value)
                                }
                                aria-label={`${s.label} ${en}`}
                              >
                                <option value="">
                                  {l("Choose a person", "လူရွေးပါ")}
                                </option>
                                {data.users
                                  .filter((u) => u.is_active)
                                  .map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.full_name || u.username}
                                    </option>
                                  ))}
                              </select>
                            </label>
                          ))}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="access-section">
                  {live ? (
                    <label className="access-activation">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => {
                          setEnabled(e.target.checked);
                          setDirty(true);
                        }}
                      />
                      <span>
                        <strong>
                          {l(
                            "Activate for new requests",
                            "အသစ်တင်မည့် တောင်းဆိုမှုများတွင် အသုံးပြုရန်",
                          )}
                        </strong>
                        <small>
                          {l(
                            "Every configured stage must be completed. Payment is a separate step.",
                            "သတ်မှတ်ထားသည့် အဆင့်အားလုံး ပြီးရပါမည်။ ငွေပေးချေခြင်းကို သီးခြားမှတ်တမ်းတင်ရပါမည်။",
                          )}
                        </small>
                      </span>
                    </label>
                  ) : (
                    <p className="access-note">
                      {l(
                        "Save and preview assignments now. This form’s full submission screen will be connected in the next form upgrade.",
                        "ယခု တာဝန်ယူသူများကို သိမ်းပြီး လမ်းကြောင်းစမ်းနိုင်ပါသည်။ ဤ Form ၏ တင်သွင်းသည့်မျက်နှာပြင်ကို နောက် Form အဆင့်မြှင့်တင်မှုတွင် ချိတ်ဆက်မည်။",
                      )}
                    </p>
                  )}
                </div>
                {key==='leave'&&<div className="access-section"><LeaveCalendar/></div>}
                <footer className="access-savebar">
                  <span>
                    {dirty
                      ? l("Unsaved changes", "မသိမ်းရသေးသော ပြင်ဆင်ချက်များ")
                      : l("Saved settings", "သိမ်းထားသော Settings")}
                  </span>
                  <button
                    className="access-primary"
                    disabled={!dirty || save.isPending}
                    onClick={() => save.mutate()}
                  >
                    {save.isPending
                      ? l("Saving…", "သိမ်းနေသည်…")
                      : l("Save workflow", "လုပ်ငန်းစဉ် သိမ်းရန်")}
                  </button>
                </footer>
              </section>
              <aside className="access-preview">
                <Icon name="handover" size={26} />
                <h2>
                  {l("Preview a request", "တောင်းဆိုမှု လမ်းကြောင်းစမ်းရန်")}
                </h2>
                <p>
                  {l(
                    "No request is created and no notification is sent.",
                    "တောင်းဆိုမှုအသစ် မဖန်တီးဘဲ Notification မပို့ဘဲ စမ်းသပ်နိုင်သည်။",
                  )}
                </p>
                <label>
                  {l("Submitted by", "တင်သွင်းမည့်သူ")}
                  <select
                    value={requester}
                    onChange={(e) => {
                      setRequester(e.target.value);
                      setPreview(null);
                    }}
                  >
                    <option value="">{l("Choose a person", "လူရွေးပါ")}</option>
                    {data.users
                      .filter((u) => u.is_active)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name || u.username}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  disabled={!requester || test.isPending}
                  onClick={() => test.mutate()}
                >
                  {l("Preview route", "လမ်းကြောင်း စမ်းကြည့်ရန်")}
                </button>
                {preview && (
                  <div aria-live="polite">
                    <strong
                      className={
                        preview.ready ? "access-ready" : "access-needs-setup"
                      }
                    >
                      {preview.ready
                        ? l("Route ready", "လမ်းကြောင်း အဆင်သင့်")
                        : l(
                            "Setup needs attention",
                            "သတ်မှတ်ချက် ပြင်ရန်လိုသည်",
                          )}
                    </strong>
                    <ol>
                      {preview.stages.map((s) => (
                        <li key={s.key}>
                          <strong>{s.label}</strong>
                          <span>{s.name || "—"}</span>
                          {s.state !== "ready" && (
                            <small>
                              {l(
                                {
                                  needs_alternate:
                                    "Choose a different alternate.",
                                  missing_permission:
                                    "Grant this person the required action in People & Access.",
                                  unavailable: "Account unavailable.",
                                }[s.state],
                                "တာဝန်ယူသူ၊ အစားထိုးသူနှင့် သုံးခွင့်ကို စစ်ဆေးပါ။",
                              )}
                            </small>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </aside>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
