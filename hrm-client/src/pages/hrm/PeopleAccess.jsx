import useAppCatalog from "../../hooks/useAppCatalog";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import Layout from "../../components/layout/Layout";
import Icon from "../../components/common/Icon";
import { useLanguage } from "../../context/LanguageContext";
import api from "../../api/client";
import "../../styles/access.css";
const labels = {
  view: ["View", "ကြည့်"],
  create: ["Create", "အသစ်တင်"],
  edit: ["Edit", "ပြင်"],
  approve: ["Approve", "အတည်ပြု"],
  pay: ["Record payment", "ငွေပေးချေမှုမှတ်တမ်း"],
  delete: ["Delete", "ဖျက်"],
};
export default function PeopleAccess() {
  const personalNames = Object.fromEntries(
    useAppCatalog(true).map((app) => [app.id, app.label]),
  );
  const { language } = useLanguage(),
    my = language === "my",
    l = (en, mm) => (my ? mm : en),
    qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["people-access"],
    queryFn: () => api.get("/access").then((r) => r.data),
  });
  const [selected, setSelected] = useState(""),
    [search, setSearch] = useState(""),
    [policy, setPolicy] = useState(null),
    [version, setVersion] = useState(0),
    [dirty, setDirty] = useState(false),
    [copyId, setCopyId] = useState("");
  const person = data?.users.find((u) => u.id === selected);
  function choose(id) {
    if (
      dirty &&
      !window.confirm(
        l(
          "Discard unsaved access changes?",
          "မသိမ်းရသေးသော ပြင်ဆင်ချက်များကို ပယ်ဖျက်မလား။",
        ),
      )
    )
      return;
    const row = data.policies.find((p) => p.user_id === id);
    setSelected(id);
    setPolicy(structuredClone(row?.policy || data.default_policy));
    setVersion(row?.version || 0);
    setDirty(false);
    setCopyId("");
  }
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const save = useMutation({
    mutationFn: () =>
      api.put(`/access/people/${selected}`, { policy, version }),
    onSuccess: (r) => {
      setVersion(r.data.policy.version);
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["people-access"] });
      toast.success(l("Access saved", "သုံးခွင့် သိမ်းပြီးပါပြီ"));
    },
    onError: (e) => toast.error(e.response?.data?.error || e.message),
  });
  const change = (next) => {
    setPolicy(next);
    setDirty(true);
  };
  function toggle(module, action) {
    const actions = policy.modules[module] || [];
    const next = actions.includes(action)
      ? actions.filter((a) => a !== action)
      : [...actions, action];
    change({
      ...policy,
      modules: {
        ...policy.modules,
        [module]:
          action === "view" && !next.includes("view")
            ? []
            : [...new Set([...next, ...(next.length ? ["view"] : [])])],
      },
    });
  }
  return (
    <Layout
      title={l("People & Access", "လူများနှင့် သုံးခွင့်")}
      subtitle={l(
        "Give each person the tools they need.",
        "လူတစ်ယောက်ချင်းစီအတွက် လိုအပ်သော သုံးခွင့်များ ပေးပါ။",
      )}
    >
      <div className="access-topline">
        <span className="access-pill">
          <Icon name="lock" size={16} />
          {l("Owner controls", "Owner ထိန်းချုပ်မှု")}
        </span>
        <Link to="/approval-setup">
          {l("Approval setup", "အတည်ပြုအဆင့် သတ်မှတ်ရန်")} →
        </Link>
      </div>
      {isLoading ? (
        <div className="access-empty">
          {l("Loading people…", "အချက်အလက် ဖတ်နေသည်…")}
        </div>
      ) : error ? (
        <div role="alert" className="access-empty">
          {error.response?.data?.error || error.message}
        </div>
      ) : (
        <div className="access-workspace">
          <aside className="access-people">
            <label className="access-label" htmlFor="people-search">
              {l("Find a person", "လူရှာရန်")}
            </label>
            <input
              id="people-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={l("Name or username", "အမည် သို့မဟုတ် Username")}
            />
            <div className="access-person-list">
              {data.users
                .filter((u) =>
                  `${u.full_name} ${u.username}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    aria-pressed={selected === u.id}
                    onClick={() => choose(u.id)}
                  >
                    <span className="access-avatar">
                      {(u.full_name || u.username).slice(0, 1)}
                    </span>
                    <span>
                      <strong>{u.full_name || u.username}</strong>
                      <small>
                        {u.is_owner
                          ? l("Owner · full access", "Owner · သုံးခွင့်အပြည့်")
                          : u.is_active
                            ? u.username
                            : l("Disabled account", "ပိတ်ထားသော Account")}
                      </small>
                    </span>
                    <Icon name="arrowRight" size={15} />
                  </button>
                ))}
            </div>
          </aside>
          {!person ? (
            <section className="access-empty">
              <Icon name="users" size={32} />
              <h2>
                {l("Select a person to begin", "စတင်ရန် လူတစ်ယောက်ရွေးပါ")}
              </h2>
              <p>
                {l(
                  "Their job title will not decide their access.",
                  "ရာထူးအမည်ကြောင့် သုံးခွင့် အလိုအလျောက် ရမည်မဟုတ်ပါ။",
                )}
              </p>
            </section>
          ) : person.is_owner ? (
            <section className="access-empty">
              <Icon name="lock" size={32} />
              <h2>{person.full_name}</h2>
              <p>
                {l(
                  "The owner retains full access and manages everyone’s permissions.",
                  "Owner သည် သုံးခွင့်အပြည့်ရှိပြီး အခြားသူများ၏ သုံးခွင့်များကို စီမံနိုင်သည်။",
                )}
              </p>
            </section>
          ) : (
            <section className="access-editor">
              <header className="access-editor-head">
                <div>
                  <span className="access-eyebrow">
                    {l("ACCOUNT ACCESS", "ACCOUNT သုံးခွင့်")}
                  </span>
                  <h2>{person.full_name || person.username}</h2>
                  <p>
                    {l(
                      "Changes apply to the next server request.",
                      "သိမ်းပြီးနောက် Server သို့ နောက်တစ်ကြိမ်တောင်းဆိုချိန်တွင် သက်ရောက်မည်။",
                    )}
                  </p>
                </div>
                <span className="access-count">
                  {
                    Object.values(policy.modules).filter((a) =>
                      a.includes("view"),
                    ).length
                  }{" "}
                  {l("apps", "Apps")}
                </span>
              </header>
              <div className="access-copy">
                <label htmlFor="copy-person">
                  {l("Copy access from", "သုံးခွင့် ကူးယူရန်")}
                </label>
                <select
                  id="copy-person"
                  value={copyId}
                  onChange={(e) => setCopyId(e.target.value)}
                >
                  <option value="">
                    {l("Choose a person", "လူတစ်ယောက်ရွေးပါ")}
                  </option>
                  {data.users
                    .filter((u) => !u.is_owner && u.id !== selected)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.username}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  disabled={!copyId}
                  onClick={() =>
                    change(
                      structuredClone(
                        data.policies.find((p) => p.user_id === copyId)
                          ?.policy || data.default_policy,
                      ),
                    )
                  }
                >
                  {l("Copy", "ကူးယူ")}
                </button>
              </div>
              <fieldset className="access-section">
                <legend>{l("1. Personal apps", "၁။ ကိုယ်ပိုင် Apps")}</legend>
                <p>
                  {l(
                    "These apps only show the person’s own records.",
                    "ဤ Apps များတွင် မိမိအချက်အလက်များကိုသာ ပြမည်။",
                  )}
                </p>
                <div className="access-check-grid">
                  {data.personal_apps.map((key) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={policy.personal.includes(key)}
                        onChange={() =>
                          change({
                            ...policy,
                            personal: policy.personal.includes(key)
                              ? policy.personal.filter((x) => x !== key)
                              : [...policy.personal, key],
                          })
                        }
                      />
                      {personalNames[key] || key.replaceAll("-", " ")}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="access-section">
                <legend>
                  {l(
                    "2. Management apps & actions",
                    "၂။ Management Apps နှင့် လုပ်ပိုင်ခွင့်များ",
                  )}
                </legend>
                <div className="access-permissions">
                  {data.modules.map(([key, en, mm, actions]) => (
                    <div className="access-permission-row" key={key}>
                      <strong>{my ? mm : en}</strong>
                      <div>
                        {actions.map((action) => (
                          <label key={action}>
                            <input
                              type="checkbox"
                              checked={
                                policy.modules[key]?.includes(action) || false
                              }
                              onChange={() => toggle(key, action)}
                            />
                            {labels[action][my ? 1 : 0]}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>
              <fieldset className="access-section">
                <legend>
                  {l(
                    "3. Employee records they can access",
                    "၃။ ကြည့်နိုင်သည့် ဝန်ထမ်းအချက်အလက်များ",
                  )}
                </legend>
                <div className="access-scope-options">
                  {[
                    ["own", "Own records", "မိမိအချက်အလက်"],
                    ["selected", "Selected employees", "ရွေးထားသောဝန်ထမ်းများ"],
                    ["all", "All employees", "ဝန်ထမ်းအားလုံး"],
                  ].map(([key, en, mm]) => (
                    <label key={key}>
                      <input
                        type="radio"
                        name="scope"
                        checked={policy.scope === key}
                        onChange={() => change({ ...policy, scope: key })}
                      />
                      {my ? mm : en}
                    </label>
                  ))}
                </div>
                {policy.scope === "selected" && (
                  <div className="access-employee-picks">
                    {data.employees.map((e) => (
                      <label key={e.id}>
                        <input
                          type="checkbox"
                          checked={policy.employee_ids.includes(e.id)}
                          onChange={() =>
                            change({
                              ...policy,
                              employee_ids: policy.employee_ids.includes(e.id)
                                ? policy.employee_ids.filter(
                                    (id) => id !== e.id,
                                  )
                                : [...policy.employee_ids, e.id],
                            })
                          }
                        />
                        {e.Full_name} <small>{e.employee_id}</small>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
              <fieldset className="access-section">
                <legend>
                  {l("4. Confidential fields", "၄။ လျှို့ဝှက်အချက်အလက်များ")}
                </legend>
                <p>
                  {l(
                    "For other employees. Document access also permits reading the attached files in scope.",
                    "အခြားဝန်ထမ်းများအတွက်ဖြစ်သည်။ Document သုံးခွင့်ပေးလျှင် သက်ဆိုင်ရာ တွဲထားသောဖိုင်များကိုပါ ဖတ်နိုင်မည်။",
                  )}
                </p>
                <div className="access-check-grid">
                  {[
                    ["salary", "Salary", "လစာ"],
                    ["bank", "Bank details", "ဘဏ်အချက်အလက်"],
                    [
                      "identity",
                      "Identity documents",
                      "မှတ်ပုံတင်/Passport အချက်အလက်",
                    ],
                  ].map(([key, en, mm]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={policy.sensitive[key]}
                        onChange={() =>
                          change({
                            ...policy,
                            sensitive: {
                              ...policy.sensitive,
                              [key]: !policy.sensitive[key],
                            },
                          })
                        }
                      />
                      {my ? mm : en}
                    </label>
                  ))}
                </div>
              </fieldset>
              <footer className="access-savebar">
                <span aria-live="polite">
                  {dirty
                    ? l("Unsaved changes", "မသိမ်းရသေးသော ပြင်ဆင်ချက်များ")
                    : l("All changes saved", "သိမ်းပြီးပါပြီ")}
                </span>
                <button
                  className="access-primary"
                  disabled={!dirty || save.isPending}
                  onClick={() => save.mutate()}
                >
                  {save.isPending
                    ? l("Saving…", "သိမ်းနေသည်…")
                    : l("Save access", "သုံးခွင့် သိမ်းရန်")}
                </button>
              </footer>
            </section>
          )}
        </div>
      )}
    </Layout>
  );
}
