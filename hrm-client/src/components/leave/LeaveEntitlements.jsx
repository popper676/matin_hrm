import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "../../api/client";
import { useLeaveWords } from "./LeaveForm";
export default function LeaveEntitlements({ employees, types, balances }) {
  const l = useLeaveWords(),
    qc = useQueryClient(),
    [v, setV] = useState({
      employee: "",
      type: "",
      year: new Date().getFullYear(),
      days: "",
      version: 0,
    });
  function select(key, value) {
    setV((old) => {
      const next = { ...old, [key]: value },
        b = balances.find(
          (b) =>
            b.employee_id === next.employee &&
            b.leave_type_id === next.type &&
            Number(b.year) === Number(next.year),
        );
      return {
        ...next,
        days: b?.entitled_days ?? "",
        version: b?.version || 0,
      };
    });
  }
  const save = useMutation({
    mutationFn: () =>
      api.put(`/leave/balances/${v.employee}/${v.type}/${v.year}`, {
        days: Number(v.days),
        version: v.version,
      }),
    onSuccess: (r) => {
      setV((old) => ({ ...old, version: r.data.balance.version }));
      qc.invalidateQueries();
      toast.success(l("Entitlement saved", "ခွင့်ရပိုင်ခွင့် သိမ်းပြီးပါပြီ"));
    },
    onError: (e) => toast.error(e.response?.data?.error || e.message),
  });
  return (
    <details className="leave-form leave-calendar">
      <summary>
        {l(
          "Set employee leave entitlement",
          "ဝန်ထမ်း၏ ခွင့်ရပိုင်ခွင့် သတ်မှတ်ရန်",
        )}
      </summary>
      <fieldset disabled={save.isPending}>
        <div className="ux-form-grid">
          <label>
            {l("Employee", "ဝန်ထမ်း")}
            <select
              value={v.employee}
              onChange={(e) => select("employee", e.target.value)}
            >
              <option value="">—</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.Full_name} · {e.employee_id}
                </option>
              ))}
            </select>
          </label>
          <label>
            {l("Leave type", "ခွင့်အမျိုးအစား")}
            <select
              value={v.type}
              onChange={(e) => select("type", e.target.value)}
            >
              <option value="">—</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.type_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {l("Year", "နှစ်")}
            <input
              type="number"
              min={2000}
              max={2100}
              value={v.year}
              onChange={(e) => select("year", Number(e.target.value))}
            />
          </label>
          <label>
            {l("Total entitled days", "စုစုပေါင်း ရပိုင်ခွင့်ရက်")}
            <input
              type="number"
              min="0"
              step="0.5"
              max="3660"
              value={v.days}
              onChange={(e) => setV({ ...v, days: e.target.value })}
            />
          </label>
        </div>
        <p>
          {l(
            "Existing used days stay recorded. Changing a type’s default does not overwrite an employee’s yearly entitlement.",
            "အသုံးပြုပြီးရက်များကို ထိန်းသိမ်းထားသည်။ Leave Type ၏ Default ကို ပြောင်းလဲရုံဖြင့် ဝန်ထမ်း၏ နှစ်စဉ်ရပိုင်ခွင့်ကို မပြောင်းပါ။",
          )}
        </p>
        <button
          className="ux-button ux-button-primary"
          disabled={!v.employee || !v.type || v.days === "" || save.isPending}
          onClick={() => save.mutate()}
        >
          {l("Save entitlement", "ရပိုင်ခွင့် သိမ်းရန်")}
        </button>
      </fieldset>
    </details>
  );
}
