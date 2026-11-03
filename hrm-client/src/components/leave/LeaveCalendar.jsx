import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "../../api/client";
import { useLeaveWords } from "./LeaveForm";
import "../../styles/leave-form.css";
export default function LeaveCalendar() {
  const l = useLeaveWords();
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["leave-calendar"],
    queryFn: () => api.get("/leave/calendar").then((r) => r.data),
    retry: false,
  });
  return (
    <details className="leave-form leave-calendar">
      <summary>
        {l(
          "Leave calendar & default hours",
          "ခွင့်တွက်ရန် ပြက္ခဒိန်နှင့် ပုံမှန်အလုပ်ချိန်",
        )}
      </summary>
      {isLoading ? (
        <p>{l("Loading…", "ဖတ်နေသည်…")}</p>
      ) : error ? (
        <p role="alert">{error.response?.data?.error || error.message}</p>
      ) : (
        <CalendarEditor initial={data} refresh={refetch} />
      )}
    </details>
  );
}
function CalendarEditor({ initial, refresh }) {
  const l = useLeaveWords(),
    qc = useQueryClient(),
    [settings, setSettings] = useState(initial.calendar.settings),
    [dates, setDates] = useState(initial.dates),
    [version, setVersion] = useState(initial.calendar.version),
    [dirty, setDirty] = useState(false);
  const change = (k, v) => {
    setSettings((s) => ({ ...s, [k]: v }));
    setDirty(true);
  };
  const save = useMutation({
    mutationFn: () => api.put("/leave/calendar", { settings, dates, version }),
    onSuccess: (r) => {
      setVersion(r.data.calendar.version);
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["leave-form-quote"] });
      toast.success(
        l("Leave calendar saved", "ခွင့်တွက်ရန် ပြက္ခဒိန် သိမ်းပြီးပါပြီ"),
      );
      refresh();
    },
    onError: (e) => toast.error(e.response?.data?.error || e.message),
  });
  return (
    <fieldset disabled={save.isPending}>
      <p>
        {l(
          "Daily employee schedules override company date exceptions; exceptions override weekly rosters; rosters override the company week. Assigned shift hours take priority over default hours. AM/PM means the first/second half of that shift, including overnight shifts.",
          "နေ့စဉ်ဝန်ထမ်း Schedule ကို ဦးစားပေးပြီး Company ရက်သတ်မှတ်ချက်၊ Weekly Roster၊ Company ရုံးပိတ်ရက် အစဉ်အတိုင်း တွက်သည်။ Shift ရှိပါက ၎င်းအလုပ်ချိန်ကို သုံးသည်။ AM/PM သည် ညဆိုင်းအပါအဝင် Shift ၏ ပထမ/ဒုတိယ တစ်ဝက် ဖြစ်သည်။",
        )}
      </p>
      <div className="leave-calendar-week">
        {[
          ["Sunday", "တနင်္ဂနွေ"],
          ["Monday", "တနင်္လာ"],
          ["Tuesday", "အင်္ဂါ"],
          ["Wednesday", "ဗုဒ္ဓဟူး"],
          ["Thursday", "ကြာသပတေး"],
          ["Friday", "သောကြာ"],
          ["Saturday", "စနေ"],
        ].map(([en, my], d) => (
          <label className="leave-form-check" key={d}>
            <input
              type="checkbox"
              checked={settings.weekly_holidays.includes(d)}
              onChange={(e) =>
                change(
                  "weekly_holidays",
                  e.target.checked
                    ? [...settings.weekly_holidays, d]
                    : settings.weekly_holidays.filter((v) => v !== d),
                )
              }
            />
            <span>
              {l(en, my)} {l("off", "ပိတ်")}
            </span>
          </label>
        ))}
      </div>
      <div className="ux-form-grid">
        <label>
          {l("Default shift start", "ပုံမှန်အလုပ်စချိန်")}
          <input
            type="time"
            value={settings.default_start || ""}
            onChange={(e) => change("default_start", e.target.value)}
          />
        </label>
        <label>
          {l("Default shift end", "ပုံမှန်အလုပ်ဆုံးချိန်")}
          <input
            type="time"
            value={settings.default_end || ""}
            onChange={(e) => change("default_end", e.target.value)}
          />
        </label>
      </div>
      <h3>{l("Company date exceptions", "Company ၏ အထူးသတ်မှတ်ရက်များ")}</h3>
      {dates.map((d, i) => (
        <div className="leave-calendar-date" key={i}>
          <input
            aria-label={l("Date", "ရက်စွဲ")}
            type="date"
            value={d.date}
            onChange={(e) => {
              setDates((rows) =>
                rows.map((r, j) =>
                  j === i ? { ...r, date: e.target.value } : r,
                ),
              );
              setDirty(true);
            }}
          />
          <select
            aria-label={l("Working or off", "အလုပ်လုပ် / ရုံးပိတ်")}
            value={String(d.is_working)}
            onChange={(e) => {
              setDates((rows) =>
                rows.map((r, j) =>
                  j === i ? { ...r, is_working: e.target.value === "true" } : r,
                ),
              );
              setDirty(true);
            }}
          >
            <option value="false">{l("Off day", "ရုံးပိတ်ရက်")}</option>
            <option value="true">{l("Working day", "အလုပ်လုပ်ရက်")}</option>
          </select>
          <input
            aria-label={l("Label", "အမည်")}
            maxLength={150}
            placeholder={l("Holiday / reason", "ပိတ်ရက်အမည် / အကြောင်းရင်း")}
            value={d.label}
            onChange={(e) => {
              setDates((rows) =>
                rows.map((r, j) =>
                  j === i ? { ...r, label: e.target.value } : r,
                ),
              );
              setDirty(true);
            }}
          />
          <button
            type="button"
            onClick={() => {
              setDates((rows) => rows.filter((_, j) => j !== i));
              setDirty(true);
            }}
          >
            {l("Remove", "ဖယ်ရန်")}
          </button>
        </div>
      ))}
      <div className="leave-calendar-actions">
        <button
          type="button"
          disabled={dates.length >= 366}
          onClick={() => {
            setDates((rows) => [
              ...rows,
              { date: "", is_working: false, label: "" },
            ]);
            setDirty(true);
          }}
        >
          + {l("Add date", "ရက်ထည့်ရန်")}
        </button>
        <button
          type="button"
          className="access-primary"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          {l("Save calendar", "ပြက္ခဒိန် သိမ်းရန်")}
        </button>
      </div>
      <small>
        {l(
          "Changes affect new previews. Pending requests with changed working dates or hours must be resubmitted before final approval. Approved snapshots remain in their original records.",
          "အသစ်တွက်သော Preview များတွင် ပြောင်းလဲမှုကို သုံးမည်။ စောင့်ဆိုင်းနေသော Form ၏ အလုပ်လုပ်ရက် သို့မဟုတ် အချိန်ပြောင်းပါက နောက်ဆုံးအတည်ပြုမှုမတိုင်မီ အသစ်ပြန်တင်ရမည်။ အတည်ပြုပြီးသော မူရင်းမှတ်တမ်းကို ထိန်းသိမ်းထားမည်။",
        )}
      </small>
    </fieldset>
  );
}
