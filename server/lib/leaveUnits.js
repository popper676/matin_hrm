// Approved version-2 requests carry immutable day units. Presence on the other
// half of a shift does not erase half-day leave or its unpaid deduction.
export function summarizeLeaveUnits(
  leaves,
  start,
  end,
  attendance = new Set(),
  onTime = new Set(),
  unpaidTypes = new Set(),
  holidays = new Set([0]),
) {
  const byDate = new Map();
  const day = (key) => {
    if (!byDate.has(key))
      byDate.set(key, {
        modern: 0,
        modernUnpaid: 0,
        legacy: 0,
        legacyUnpaid: 0,
      });
    return byDate.get(key);
  };
  for (const leave of leaves) {
    if (leave.form_version === 2 && Array.isArray(leave.calendar_snapshot)) {
      for (const d of leave.calendar_snapshot) {
        if (
          d.date < start ||
          d.date > end ||
          !Number.isFinite(Number(d.units)) ||
          Number(d.units) <= 0
        )
          continue;
        const v = day(d.date);
        v.modern += Number(d.units);
        if (leave.form_snapshot?.is_paid === false)
          v.modernUnpaid += Number(d.units);
      }
    } else {
      const from = leave.start_date > start ? leave.start_date : start,
        to = leave.end_date < end ? leave.end_date : end;
      if (!from || !to || from > to) continue;
      const last = new Date(`${to}T12:00:00Z`);
      for (
        let d = new Date(`${from}T12:00:00Z`);
        d <= last;
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        if (holidays.has(d.getUTCDay())) continue;
        const v = day(d.toISOString().slice(0, 10));
        v.legacy = 1;
        if (unpaidTypes.has(leave.leave_type_id)) v.legacyUnpaid = 1;
      }
    }
  }
  let approved = 0,
    unpaid = 0,
    actual = 0,
    punctual = 0;
  for (const date of new Set([...attendance, ...byDate.keys()])) {
    if (date < start || date > end) continue;
    const v = byDate.get(date) || {
        modern: 0,
        modernUnpaid: 0,
        legacy: 0,
        legacyUnpaid: 0,
      },
      modern = Math.min(1, v.modern);
    const leaveCredit = Math.min(
      1,
      modern + (attendance.has(date) ? 0 : v.legacy),
    );
    approved += leaveCredit;
    unpaid += Math.min(
      1,
      v.modernUnpaid + (attendance.has(date) ? 0 : v.legacyUnpaid),
    );
    actual +=
      (attendance.has(date) ? Math.max(0, 1 - modern) : 0) + leaveCredit;
    punctual += onTime.has(date) ? Math.max(0, 1 - modern) : 0;
  }
  return {
    approved_leave_days: approved,
    unpaid_leave_days: unpaid,
    actual_attendance: actual,
    on_time_count: punctual,
  };
}
