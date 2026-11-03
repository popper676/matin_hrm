import {BrandText} from '../common/Brand';
import { useEffect, useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "../../api/client";
import { useLanguage } from "../../context/LanguageContext";
import {
  INFORMATION_SECTIONS,
  INFORMATION_DOCUMENTS,
  FAMILY_FIELDS,
} from "../../../../shared/employeeInformation";
import "../../styles/employee-information.css";
const employmentLabels = [
  ["employee_number", "Employee ID", "ဝန်ထမ်းအမှတ်"],
  ["department", "Department", "ဌာန"],
  ["position", "Position", "ရာထူး"],
  ["supervisor", "Supervisor", "တာဝန်ခံ"],
  ["employment_type", "Employment type", "ခန့်အပ်မှုပုံစံ"],
  ["hire_date", "Date joined", "စတင်ဝင်ရောက်ရက်"],
  ["probation_period", "Probation period", "အစမ်းခန့်ကာလ"],
  ["work_location", "Work location", "လုပ်ငန်းတည်နေရာ"],
  ["employment_status", "Employment status", "ဝန်ထမ်းအခြေအနေ"],
  ["salary", "Salary (recorded amount)", "လစာ (မှတ်တမ်းပါပမာဏ)"],
];
function useWords() {
  const { language } = useLanguage();
  return (en, my) => (language === "my" ? my : en);
}
const errorText = (e) => e.response?.data?.error || e.message;
function Fact({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value === undefined ? "—" : String(value || "—")}</dd>
    </div>
  );
}
function Employment({ values }) {
  const l = useWords();
  return (
    <section className="info-section">
      <h3>{l("Employment record", "အလုပ်အကိုင်မှတ်တမ်း")}</h3>
      <p>
        {l(
          "Managed by HR. Submitting this form does not change your salary, position or account access.",
          "HR က ထိန်းချုပ်ထားသည်။ ဤ Form ဖြင့် လစာ၊ ရာထူးနှင့် Account သုံးခွင့် ပြောင်းလဲမည်မဟုတ်ပါ။",
        )}
      </p>
      <dl className="info-facts">
        {employmentLabels
          .filter(([k]) => k in (values || {}))
          .map(([k, en, my]) => (
            <Fact key={k} label={l(en, my)} value={values[k]} />
          ))}
      </dl>
    </section>
  );
}
function Files({ record, onRemove, disabled }) {
  const l = useWords();
  return (
    <ul className="info-files">
      {(record.attachments || []).map((f) => (
        <li key={f.id}>
          <div>
            <small>
              {l(
                ...(INFORMATION_DOCUMENTS.find(
                  (d) => d[0] === f.category,
                )?.slice(1, 3) || ["Document", "ဖိုင်"]),
              )}
            </small>
            <a
              href={`/api/employee-information/${record.id}/files/${f.id}`}
              target="_blank"
              rel="noreferrer"
            >
              {f.name} ↗
            </a>
            <span>{Math.ceil(f.size / 1024)} KB</span>
          </div>
          {onRemove && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRemove(f.id)}
              aria-label={`${l("Remove", "ဖယ်ရှားရန်")} ${f.name}`}
            >
              {l("Remove", "ဖယ်ရှားရန်")}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
export function InformationDetails({ record }) {
  const l = useWords(),
    p = record.payload || {};
  return (
    <div className="employee-information info-readonly">
      <Employment values={record.employment_snapshot} />
      {INFORMATION_SECTIONS.map(([key, en, my, fields]) => (
        <section className="info-section" key={key}>
          <h3>{l(en, my)}</h3>
          <dl className="info-facts">
            {fields
              .filter(([k]) => k in p)
              .map(([k, a, b]) => (
                <Fact key={k} label={l(a, b)} value={p[k]} />
              ))}
          </dl>
          {!fields.some(([k]) => k in p) && (
            <p>
              {l(
                "These fields are restricted by your access settings.",
                "ဤအချက်အလက်များအတွက် သုံးခွင့် ကန့်သတ်ထားပါသည်။",
              )}
            </p>
          )}
        </section>
      ))}
      <section className="info-section">
        <h3>{l("Family & languages", "မိသားစုနှင့် ဘာသာစကား")}</h3>
        {(p.family || []).map((r, i) => (
          <dl className="info-facts" key={i}>
            {FAMILY_FIELDS.map(([k, a, b]) => (
              <Fact key={k} label={l(a, b)} value={r[k]} />
            ))}
          </dl>
        ))}
        <p>
          {[...(p.languages || []), p.other_language]
            .filter(Boolean)
            .join(" · ") || "—"}
        </p>
      </section>
      <section className="info-section">
        <h3>{l("Supporting documents", "အထောက်အထားဖိုင်များ")}</h3>
        <Files record={record} />
        <p>
          {p.missing_documents_note ||
            l("No document note.", "ဖိုင်မှတ်ချက် မရှိပါ။")}
        </p>
      </section>
      {(record.review_history || []).length > 0 && (
        <section className="info-section">
          <h3>
            {l(
              "HR check & authorized approval",
              "HR စစ်ဆေးမှုနှင့် နောက်ဆုံးအတည်ပြုမှု",
            )}
          </h3>
          {record.review_history.map((h, i) => (
            <dl className="info-facts" key={i}>
              <Fact
                label={h.label}
                value={`${h.actor_name} · ${h.decision} · ${new Date(h.at).toLocaleString()}`}
              />
              {h.comment && (
                <Fact label={l("Comment", "မှတ်ချက်")} value={h.comment} />
              )}
            </dl>
          ))}
        </section>
      )}
      <section className="info-section">
        <h3>{l("Employee declaration", "ဝန်ထမ်းအတည်ပြုချက်")}</h3>
        <p>
          {l(
            "I declare that this information is accurate and will inform HR when it changes.",
            "အချက်အလက်များ မှန်ကန်ကြောင်း အတည်ပြုပြီး ပြောင်းလဲမှုရှိပါက HR ကို အသိပေးပါမည်။",
          )}
        </p>
        <dl className="info-facts">
          <Fact
            label={l("Signed by", "လက်မှတ်ထိုးသူ")}
            value={record.declaration_name}
          />
          <Fact
            label={l("Signed at", "လက်မှတ်ထိုးချိန်")}
            value={
              record.declared_at
                ? new Date(record.declared_at).toLocaleString()
                : ""
            }
          />
          <Fact label={l("Form reference", "Form အမှတ်")} value={record.id} />
        </dl>
      </section>
    </div>
  );
}
export function InformationReview({ id }) {
  const l = useWords();
  const { data, error, isLoading } = useQuery({
    queryKey: ["employee-information-record", id],
    queryFn: () => api.get(`/employee-information/${id}`).then((r) => r.data),
  });
  return isLoading ? (
    <p>{l("Loading employee information…", "ဝန်ထမ်းအချက်အလက် ဖတ်နေသည်…")}</p>
  ) : error ? (
    <p role="alert">{errorText(error)}</p>
  ) : (
    <InformationDetails record={data.record} />
  );
}
function InformationEditor({ record, employment, enabled, onRecord }) {
  const l = useWords(),
    [payload, setPayload] = useState(record.payload),
    [section, setSection] = useState("basic"),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [signature, setSignature] = useState(""),
    [declaration, setDeclaration] = useState(false),
    [category, setCategory] = useState("passport"),
    [file, setFile] = useState(null);
  const fileInput = useRef(null);
  const [draftVersion, setDraftVersion] = useState(record.version);
  const adopt = (r) => {
    setDraftVersion(r.version);
    onRecord(r);
  };
  useEffect(() => {
    const warn = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const field = (k, v) => {
    setPayload((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };
  async function save() {
    const r = (
      await api.put(`/employee-information/${record.id}`, {
        payload,
        version: draftVersion,
      })
    ).data.record;
    adopt(r);
    setDirty(false);
    return r;
  }
  async function perform(action) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function upload() {
    if (!file) return;
    const saved = await save(),
      fd = new FormData();
    fd.append("version", String(saved.version));
    fd.append("category", category);
    fd.append("file", file);
    const r = (
      await api.post(`/employee-information/${record.id}/files`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      })
    ).data.record;
    adopt(r);
    setFile(null);
    if (fileInput.current) fileInput.current.value = "";
    toast.success(l("Document attached", "ဖိုင်တွဲပြီးပါပြီ"));
  }
  const active = INFORMATION_SECTIONS.find((s) => s[0] === section);
  return (
    <div className="info-workspace">
      <nav
        className="info-nav"
        aria-label={l("Form sections", "Form အပိုင်းများ")}
      >
        {[
          ...INFORMATION_SECTIONS.map((s) => [s[0], s[1], s[2]]),
          ["family", "Family & languages", "မိသားစုနှင့် ဘာသာစကား"],
          ["employment", "Employment record", "အလုပ်အကိုင်မှတ်တမ်း"],
          ["files", "Documents", "အထောက်အထားများ"],
          ["declare", "Review & submit", "စစ်ဆေးပြီး တင်ရန်"],
        ].map(([k, en, my], i) => (
          <button
            key={k}
            type="button"
            aria-pressed={section === k}
            onClick={() => setSection(k)}
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            {l(en, my)}
          </button>
        ))}
      </nav>
      <div className="info-body">
        <fieldset className="info-editor-section" disabled={busy}>
          {active && (
            <>
              <h3>{l(active[1], active[2])}</h3>
              <p>
                {l(
                  "Fields marked * are required when submitting.",
                  "* ပါသော အချက်အလက်များကို တင်သွင်းချိန်တွင် ဖြည့်ရပါမည်။",
                )}
              </p>
              <div className="info-input-grid">
                {active[3].map(
                  ([k, en, my, type = "text", required, options]) => (
                    <label
                      key={k}
                      className={type === "textarea" ? "info-wide" : ""}
                    >
                      {l(en, my)}
                      {required ? " *" : ""}
                      {type === "textarea" ? (
                        <textarea
                          value={payload[k] || ""}
                          rows={3}
                          maxLength={4000}
                          onChange={(e) => field(k, e.target.value)}
                        />
                      ) : type === "select" ? (
                        <select
                          value={payload[k] || ""}
                          onChange={(e) => field(k, e.target.value)}
                        >
                          <option value="">—</option>
                          {options.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={type}
                          autoComplete="off"
                          value={payload[k] || ""}
                          maxLength={250}
                          onChange={(e) => field(k, e.target.value)}
                        />
                      )}
                    </label>
                  ),
                )}
              </div>
            </>
          )}
          {section === "family" && (
            <>
              <h3>{l("Family members", "မိသားစုဝင်များ")}</h3>
              {(payload.family || []).map((r, i) => (
                <div className="info-family" key={i}>
                  <div className="info-input-grid">
                    {FAMILY_FIELDS.map(([k, en, my]) => (
                      <label key={k}>
                        {l(en, my)}
                        <input
                          value={r[k] || ""}
                          maxLength={250}
                          onChange={(e) =>
                            field(
                              "family",
                              payload.family.map((x, j) =>
                                j === i ? { ...x, [k]: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      field(
                        "family",
                        payload.family.filter((_, j) => j !== i),
                      )
                    }
                  >
                    {l("Remove member", "မိသားစုဝင် ဖယ်ရန်")}
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={(payload.family || []).length >= 20}
                onClick={() => field("family", [...(payload.family || []), {}])}
              >
                + {l("Add family member", "မိသားစုဝင် ထည့်ရန်")}
              </button>
              <h3>{l("Languages", "ဘာသာစကားများ")}</h3>
              <div className="info-checks">
                {["Myanmar", "Thai", "English"].map((v) => (
                  <label key={v}>
                    <input
                      type="checkbox"
                      checked={(payload.languages || []).includes(v)}
                      onChange={(e) =>
                        field(
                          "languages",
                          e.target.checked
                            ? [...(payload.languages || []), v]
                            : (payload.languages || []).filter((x) => x !== v),
                        )
                      }
                    />
                    {v}
                  </label>
                ))}
              </div>
              <label>
                {l("Other languages", "အခြားဘာသာစကား")}
                <input
                  value={payload.other_language || ""}
                  onChange={(e) => field("other_language", e.target.value)}
                  maxLength={250}
                />
              </label>
            </>
          )}
          {section === "employment" && <Employment values={employment} />}
          {section === "files" && (
            <>
              <h3>{l("Supporting documents", "အထောက်အထားဖိုင်များ")}</h3>
              <p>
                {l(
                  "PDF, JPEG or PNG · Up to 10 MB each · 16 files maximum. Uploads are private.",
                  "PDF၊ JPEG သို့မဟုတ် PNG · တစ်ဖိုင် 10 MB အထိ · အများဆုံး 16 ဖိုင်။ ဖိုင်များကို သီးသန့်သိမ်းပါသည်။",
                )}
              </p>
              <div className="info-document-checklist">
                {INFORMATION_DOCUMENTS.map(([k, en, my]) => (
                  <span
                    key={k}
                    className={
                      record.attachments.some((f) => f.category === k)
                        ? "is-attached"
                        : ""
                    }
                  >
                    {record.attachments.some((f) => f.category === k)
                      ? "✓"
                      : "○"}{" "}
                    {l(en, my)}
                  </span>
                ))}
              </div>
              <div className="info-upload">
                <label>
                  {l("Document type", "ဖိုင်အမျိုးအစား")}
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {INFORMATION_DOCUMENTS.map(([k, en, my]) => (
                      <option key={k} value={k}>
                        {l(en, my)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {l("Choose file", "ဖိုင်ရွေးရန်")}
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => setFile(e.target.files[0] || null)}
                  />
                </label>
                <button
                  type="button"
                  disabled={!file || busy}
                  onClick={() => perform(upload)}
                >
                  {l("Attach file", "ဖိုင်တွဲရန်")}
                </button>
              </div>
              <Files
                record={record}
                disabled={busy}
                onRemove={(id) =>
                  perform(async () => {
                    const saved = await save();
                    adopt(
                      (
                        await api.delete(
                          `/employee-information/${record.id}/files/${id}`,
                          { data: { version: saved.version } },
                        )
                      ).data.record,
                    );
                  })
                }
              />
              <label>
                {l(
                  "Missing / other documents — note for HR",
                  "မပြည့်စုံသော / အခြားဖိုင်များ — HR အတွက် မှတ်ချက်",
                )}
                <textarea
                  rows={3}
                  maxLength={4000}
                  value={payload.missing_documents_note || ""}
                  onChange={(e) =>
                    field("missing_documents_note", e.target.value)
                  }
                />
              </label>
            </>
          )}
          {section === "declare" && (
            <>
              <h3>{l("Review before submitting", "မတင်မီ စစ်ဆေးရန်")}</h3>
              <p>
                {l(
                  "HR review → Authorized approval. Your current profile stays in place until both steps are approved. Submitted forms and files are locked.",
                  "HR စစ်ဆေးခြင်း → နောက်ဆုံးအတည်ပြုခြင်း။ နှစ်ဆင့်လုံး အတည်ပြုပြီးမှ လက်ရှိ Profile ကို ပြောင်းမည်။ တင်ပြီးသော Form နှင့် ဖိုင်များကို ပြင်မရပါ။",
                )}
              </p>
              <details>
                <summary>
                  {l("Preview all answers", "ဖြည့်ထားသမျှ ကြည့်ရန်")}
                </summary>
                <InformationDetails
                  record={{
                    ...record,
                    payload,
                    employment_snapshot: employment,
                  }}
                />
              </details>
              <label className="info-declaration">
                <input
                  type="checkbox"
                  checked={declaration}
                  onChange={(e) => setDeclaration(e.target.checked)}
                />
                <span>
                  {l(
                    "I declare this information is accurate and will notify HR of changes. I understand my typed name records my declaration.",
                    "အချက်အလက်များ မှန်ကန်ကြောင်း အတည်ပြု၍ ပြောင်းလဲမှုရှိပါက HR ကို အသိပေးပါမည်။ ရေးသွင်းသည့် အမည်ကို မိမိအတည်ပြုချက်အဖြစ် မှတ်တမ်းတင်မည်ကို နားလည်ပါသည်။",
                  )}
                </span>
              </label>
              <label>
                {l(
                  "Your full name as signature",
                  "အတည်ပြုလက်မှတ်အဖြစ် အမည်အပြည့်အစုံ",
                )}
                <input
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  maxLength={250}
                />
              </label>
              {!enabled && (
                <p role="status" className="info-notice">
                  {l(
                    "Drafts can be saved. The owner needs to activate Employee information in Approval Setup before you can submit.",
                    "Draft ကို သိမ်းနိုင်ပါသည်။ တင်ရန် Owner က Approval Setup တွင် Employee information ကို ဖွင့်ပေးရပါမည်။",
                  )}
                </p>
              )}
              <button
                type="button"
                className="access-primary"
                disabled={!enabled || !declaration || !signature.trim() || busy}
                onClick={() =>
                  perform(async () => {
                    const saved = await save();
                    adopt(
                      (
                        await api.post(
                          `/employee-information/${record.id}/submit`,
                          {
                            version: saved.version,
                            declaration: true,
                            signature,
                          },
                        )
                      ).data.record,
                    );
                    toast.success(
                      l("Submitted for HR review", "HR စစ်ဆေးရန် တင်ပြီးပါပြီ"),
                    );
                  })
                }
              >
                {l("Sign & submit", "လက်မှတ်ထိုးပြီး တင်ရန်")}
              </button>
            </>
          )}
        </fieldset>
        <footer className="info-savebar">
          <span aria-live="polite">
            {busy
              ? l("Saving…", "သိမ်းနေသည်…")
              : dirty
                ? l("Unsaved changes", "မသိမ်းရသေးပါ")
                : l("Draft saved", "Draft သိမ်းပြီးပါပြီ")}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              perform(async () => {
                await save();
                toast.success(l("Draft saved", "Draft သိမ်းပြီးပါပြီ"));
              })
            }
          >
            {l("Save draft", "Draft သိမ်းရန်")}
          </button>
        </footer>
      </div>
    </div>
  );
}
export default function EmployeeInformation({ employeeId }) {
  const l = useWords(),
    qc = useQueryClient(),
    queryKey = ["employee-information", employeeId || "me"];
  const { data, error, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      api
        .get("/employee-information", {
          params: employeeId ? { employee_id: employeeId } : {},
        })
        .then((r) => r.data),
  });
  const [selected, setSelected] = useState("");
  const record =
    data?.records.find((r) => r.id === selected) ||
    data?.records.find((r) => ["draft", "submitted"].includes(r.status)) ||
    data?.records[0];
  const accept = (r) => {
    qc.setQueryData(queryKey, (old) => ({
      ...old,
      records: [r, ...old.records.filter((x) => x.id !== r.id)],
    }));
    setSelected(r.id);
  };
  const create = useMutation({
    mutationFn: () => api.post("/employee-information", { payload: data.seed }),
    onSuccess: (r) => accept(r.data.record),
    onError: (e) => {
      toast.error(errorText(e));
      qc.invalidateQueries({ queryKey });
    },
  });
  return (
    <section className="employee-information info-shell">
      <header className="info-heading">
        <div>
          <span className="access-eyebrow"><BrandText/> · PEOPLE</span>
          <h2>{l("Employee information", "ဝန်ထမ်းအချက်အလက် Form")}</h2>
          <p>
            {l(
              "Keep one verified profile, with a clear record of every update.",
              "အချက်အလက်ပြင်ဆင်မှုတိုင်းကို မှတ်တမ်းတင်၍ အတည်ပြုထားသော Profile တစ်ခုတည်း ထားရှိပါ။",
            )}
          </p>
        </div>
        {record && (
          <span className={`info-status info-${record.status}`}>
            {l(
              {
                draft: "Draft",
                submitted: "In review",
                approved: "Approved",
                rejected: "Rejected",
              }[record.status],
              {
                draft: "Draft",
                submitted: "စစ်ဆေးနေသည်",
                approved: "အတည်ပြုပြီး",
                rejected: "ငြင်းပယ်ထားသည်",
              }[record.status],
            )}
          </span>
        )}
      </header>
      {isLoading ? (
        <p>{l("Loading…", "ဖတ်နေသည်…")}</p>
      ) : error ? (
        <p role="alert" className="info-notice">
          {errorText(error)}
        </p>
      ) : !data.employee ? (
        <p>
          {l(
            "Link your account to an employee record first.",
            "ပထမဦးစွာ Account ကို ဝန်ထမ်းမှတ်တမ်းနှင့် ချိတ်ဆက်ပါ။",
          )}
        </p>
      ) : (
        <>
          <div className="info-record-tools">
            {data.records.length > 1 && (
              <label>
                {l("Form history", "Form မှတ်တမ်း")}
                <select
                  value={record?.id || ""}
                  onChange={(e) => {
                    if (
                      record?.status === "draft" &&
                      !window.confirm(
                        l(
                          "Save your draft before switching forms. Continue?",
                          "မပြောင်းမီ Draft ကို သိမ်းပါ။ ဆက်လုပ်မလား။",
                        ),
                      )
                    )
                      return;
                    setSelected(e.target.value);
                  }}
                >
                  {data.records.map((r) => (
                    <option key={r.id} value={r.id}>
                      {new Date(r.created_at).toLocaleDateString()} · {r.status}{" "}
                      · {r.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {data.can_start &&
              !data.records.some((r) =>
                ["draft", "submitted"].includes(r.status),
              ) && (
                <button
                  type="button"
                  className="access-primary"
                  disabled={create.isPending}
                  onClick={() => create.mutate()}
                >
                  {l(
                    record
                      ? "Request a profile update"
                      : "Start employee information",
                    record
                      ? "အချက်အလက်ပြင်ရန် Form အသစ်တင်ပါ"
                      : "ဝန်ထမ်းအချက်အလက် စဖြည့်ရန်",
                  )}
                </button>
              )}
          </div>
          {!record ? (
            <div className="info-empty">
              <h3>
                {l(
                  "Your verified profile starts here",
                  "အတည်ပြုထားသော Profile ကို စတင်ပါ",
                )}
              </h3>
              <p>
                {l(
                  "Add your personal details and private documents, then send them to HR. You can save and continue later.",
                  "ကိုယ်ရေးအချက်အလက်နှင့် အထောက်အထားဖိုင်များ ဖြည့်ပြီး HR ဆီ တင်ပါ။ Draft သိမ်း၍ နောက်မှ ဆက်ဖြည့်နိုင်ပါသည်။",
                )}
              </p>
            </div>
          ) : record.can_edit ? (
            <InformationEditor
              key={record.id}
              record={record}
              employment={data.employment}
              enabled={data.workflow_enabled}
              onRecord={accept}
            />
          ) : (
            <>
              <InformationDetails record={record} />
              {record.approval_id && (
                <a className="info-route-link" href="/approvals">
                  {l(
                    "View approval progress & comments",
                    "အတည်ပြုအဆင့်နှင့် မှတ်ချက်များကြည့်ရန်",
                  )}{" "}
                  ↗
                </a>
              )}
            </>
          )}
          {data.can_edit_employment && (
            <EmploymentSettings
              employee={data.employee.id}
              values={data.employment}
              onSaved={() => qc.invalidateQueries({ queryKey })}
            />
          )}
        </>
      )}
    </section>
  );
}
function EmploymentSettings({ employee, values, onSaved }) {
  const l = useWords(),
    [period, setPeriod] = useState(values.probation_period || ""),
    [location, setLocation] = useState(values.work_location || "");
  const save = useMutation({
    mutationFn: () =>
      api.put(`/employee-information/employment/${employee}`, {
        probation_period: period,
        work_location: location,
      }),
    onSuccess: () => {
      onSaved();
      toast.success(
        l("Employment details updated", "အလုပ်အကိုင်အချက်အလက် ပြင်ပြီးပါပြီ"),
      );
    },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <details className="info-section info-employment-settings">
      <summary>
        {l(
          "HR: manage probation period & work location",
          "HR: အစမ်းခန့်ကာလနှင့် လုပ်ငန်းတည်နေရာ ပြင်ရန်",
        )}
      </summary>
      <div className="info-input-grid">
        <label>
          {l("Probation period", "အစမ်းခန့်ကာလ")}
          <input
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            maxLength={250}
          />
        </label>
        <label>
          {l("Work location", "လုပ်ငန်းတည်နေရာ")}
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={250}
          />
        </label>
      </div>
      <button disabled={save.isPending} onClick={() => save.mutate()}>
        {l("Save employment details", "အလုပ်အကိုင်အချက်အလက် သိမ်းရန်")}
      </button>
    </details>
  );
}
