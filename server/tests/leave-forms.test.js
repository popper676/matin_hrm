import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { leaveInput, cleanCalendar } from "../lib/leaveForms.js";
import { summarizeLeaveUnits } from "../lib/leaveUnits.js";
const uid = () => crypto.randomUUID();
test("half-day payroll preserves presence credit, unpaid units and month/year boundaries", () => {
  const modern = (days, paid) => ({
    form_version: 2,
    calendar_snapshot: days.map(([date, units]) => ({ date, units })),
    form_snapshot: { is_paid: paid },
  });
  let summary = summarizeLeaveUnits(
    [
      modern(
        [
          ["2030-12-31", 0.5],
          ["2031-01-01", 1],
        ],
        false,
      ),
    ],
    "2030-12-01",
    "2030-12-31",
    new Set(["2030-12-31"]),
    new Set(["2030-12-31"]),
  );
  assert.deepEqual(summary, {
    approved_leave_days: 0.5,
    unpaid_leave_days: 0.5,
    actual_attendance: 1,
    on_time_count: 0.5,
  });
  summary = summarizeLeaveUnits(
    [
      modern(
        [
          ["2030-12-31", 0.5],
          ["2031-01-01", 1],
        ],
        false,
      ),
    ],
    "2031-01-01",
    "2031-01-31",
  );
  assert.equal(summary.unpaid_leave_days, 1);
  assert.equal(summary.actual_attendance, 1);
  summary = summarizeLeaveUnits(
    [modern([["2030-12-31", 0.5]], true), modern([["2030-12-31", 0.5]], false)],
    "2030-12-01",
    "2030-12-31",
    new Set(["2030-12-31"]),
    new Set(["2030-12-31"]),
  );
  assert.equal(summary.actual_attendance, 1);
  assert.equal(summary.unpaid_leave_days, 0.5);
  assert.equal(summary.on_time_count, 0);
  const old = {
    start_date: "2026-09-12",
    end_date: "2026-09-14",
    leave_type_id: "unpaid",
  };
  summary = summarizeLeaveUnits(
    [old],
    "2026-09-01",
    "2026-09-30",
    new Set(["2026-09-14"]),
    new Set(["2026-09-14"]),
    new Set(["unpaid"]),
  );
  assert.equal(summary.approved_leave_days, 1);
  assert.equal(summary.unpaid_leave_days, 1);
  assert.equal(summary.actual_attendance, 2);
  for (const tz of ["Asia/Bangkok", "UTC", "America/New_York"]) {
    const oldTz = process.env.TZ;
    try {
      process.env.TZ = tz;
      assert.equal(
        summarizeLeaveUnits([old], "2026-09-01", "2026-09-30")
          .approved_leave_days,
        2,
      );
    } finally {
      if (oldTz === undefined) delete process.env.TZ;
      else process.env.TZ = oldTz;
    }
  }
});
test("leave input rejects impossible dates, multiple-date halves and invalid calendar settings", () => {
  const body = {
    leave_type_id: uid(),
    start_date: "2030-02-01",
    end_date: "2030-02-01",
    session: "PM",
  };
  assert.equal(leaveInput(body).session, "PM");
  assert.throws(
    () => leaveInput({ ...body, start_date: "2030-02-30" }),
    /valid/,
  );
  assert.throws(
    () => leaveInput({ ...body, end_date: "2030-02-02" }),
    /half-day/,
  );
  assert.throws(
    () =>
      cleanCalendar({
        version: 1,
        settings: { weekly_holidays: [0, 1, 2, 3, 4, 5, 6] },
        dates: [],
      }),
    /off days/,
  );
  assert.throws(
    () =>
      cleanCalendar({
        version: 1,
        settings: {
          weekly_holidays: [0],
          default_start: "09:00",
          default_end: "09:00",
        },
        dates: [],
      }),
    /differ/,
  );
});
test("leave calendar precedence, notice/certificate rules, snapshots and multi-year approval are transactional", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;",
    );
    for (const f of [
      "001_fresh_hr_schema.sql",
      "003_recruitment_openings.sql",
      "004_people_access_approvals.sql",
      "005_employee_information.sql",
      "006_leave_forms.sql",
    ])
      await db.exec(
        await readFile(new URL("../../supabase/" + f, import.meta.url), "utf8"),
      );
    const employee = uid(),
      owner = uid(),
      manager = uid(),
      worker = uid(),
      paid = uid(),
      unpaid = uid(),
      sick = uid(),
      bereavement = uid(),
      shift = uid(),
      night = uid();
    await db.query(
      'INSERT INTO "Employees"(id,employee_id,"Full_name") VALUES($1,$2,$3)',
      [employee, "CAL-001", "Calendar Employee"],
    );
    await db.query(
      "INSERT INTO sys_users(id,username,password_hash,role,full_name,is_owner,employee_id) VALUES($1,$2,$3,$4,$5,true,NULL),($6,$7,$3,$4,$8,true,NULL),($9,$10,$3,$4,$11,false,$12)",
      [
        owner,
        "calowner",
        "test-only",
        "employee",
        "Owner",
        manager,
        "calmanager",
        "Manager",
        worker,
        "calworker",
        "Employee",
        employee,
      ],
    );
    await db.query(
      'INSERT INTO "Leave_type"(id,type_name,kind,is_paid) VALUES($1,$2,$3,true),($4,$5,$6,false),($7,$8,$9,false),($10,$11,$12,false)',
      [
        paid,
        "Annual",
        "annual",
        unpaid,
        "Unpaid",
        "unpaid",
        sick,
        "Sick",
        "sick",
        bereavement,
        "Bereavement",
        "bereavement",
      ],
    );
    await db.query(
      "INSERT INTO shifts(id,shift_name,start_time,end_time) VALUES($1,$2,$3,$4),($5,$6,$7,$8)",
      [shift, "Day", "09:00", "17:00", night, "Night", "21:00", "06:00"],
    );
    await db.query('UPDATE "Employees" SET default_shift_id=$1 WHERE id=$2', [
      shift,
      employee,
    ]);
    const setting = {
      weekly_holidays: [0, 6],
      default_start: "09:00",
      default_end: "18:00",
    };
    await db.query("SELECT hr_save_leave_calendar($1,1,$2,$3)", [
      owner,
      JSON.stringify(setting),
      "[]",
    ]);
    const date = "2031-05-05",
      dow = new Date(date + "T12:00:00Z").getUTCDay();
    await db.query(
      "INSERT INTO hr_leave_calendar_dates(work_date,is_working,label) VALUES($1,false,$2)",
      [date, "Company holiday"],
    );
    const day = async () =>
      (await db.query("SELECT hr_leave_workday($1,$2) AS d", [employee, date]))
        .rows[0].d;
    assert.equal((await day()).working, false);
    await db.query(
      "INSERT INTO employee_rosters(employee_id,day_of_week,is_off_day) VALUES($1,$2,false)",
      [employee, dow],
    );
    assert.equal(
      (await day()).working,
      false,
      "company holiday overrides weekly roster",
    );
    await db.query(
      "INSERT INTO employee_daily_schedules(employee_id,schedule_date,shift_id,is_off_day) VALUES($1,$2,$3,false)",
      [employee, date, shift],
    );
    assert.equal(
      (await day()).working,
      true,
      "explicit daily assignment overrides company holiday",
    );
    await db.query("DELETE FROM employee_daily_schedules");
    await db.query("DELETE FROM hr_leave_calendar_dates");
    await db.query("UPDATE employee_rosters SET is_off_day=true");
    assert.equal((await day()).working, false, "roster overrides company week");
    await db.query("DELETE FROM employee_rosters");
    await db.query(
      "INSERT INTO employee_daily_schedules(employee_id,schedule_date,shift_id,is_off_day) VALUES($1,$2,$3,false)",
      [employee, date, night],
    );
    const pm = (
      await db.query("SELECT hr_leave_days($1,$2,$2,$3) AS d", [
        employee,
        date,
        "PM",
      ])
    ).rows[0].d[0];
    assert.equal(Number(pm.units), 0.5);
    assert.equal(
      new Date(pm.leave_start_at).toISOString(),
      "2031-05-05T18:30:00.000Z",
      "second half begins at 01:30 Bangkok the next day",
    );
    const quote = async (type, start, end, session, now) =>
      (
        await db.query("SELECT hr_leave_quote($1,$2,$3,$4,$5,$6) AS q", [
          employee,
          type,
          start,
          end,
          session,
          now,
        ])
      ).rows[0].q;
    const exact = new Date(
      new Date(pm.leave_start_at).getTime() - 86400000,
    ).toISOString();
    assert.equal(
      (await quote(unpaid, date, date, "PM", exact)).issues.length,
      0,
      "exactly 24 hours is sufficient",
    );
    assert.match(
      (
        await quote(
          unpaid,
          date,
          date,
          "PM",
          new Date(new Date(exact).getTime() + 1).toISOString(),
        )
      ).issues[0],
      /24 hours/,
    );
    assert.equal(
      (await quote(sick, date, date, "PM", "2031-05-07T00:00:00Z")).issues
        .length,
      0,
      "short sick leave has no 24-hour notice rule",
    );
    assert.equal(
      (await quote(bereavement, date, date, "PM", "2031-05-07T00:00:00Z"))
        .issues.length,
      0,
    );
    await db.query("DELETE FROM employee_daily_schedules");
    const long = await quote(
      sick,
      date,
      "2031-05-08",
      "FULL",
      "2031-01-01T00:00:00Z",
    );
    assert.equal(Number(long.working_days), 4);
    assert.equal(long.medical_required, true);
    assert.equal(
      (
        await quote(
          sick,
          date,
          "2031-05-08",
          "FULL",
          long.notice_cutoff + "T23:59:59+07:00",
        )
      ).issues.length,
      0,
    );
    const late = new Date(
      Date.parse(long.notice_cutoff + "T00:00:00+07:00") + 86400000,
    ).toISOString();
    assert.match(
      (await quote(sick, date, "2031-05-08", "FULL", late)).issues[0],
      /7 working/,
    );
    const stages = [
      {
        key: "manager",
        label: "Manager",
        action: "approve",
        assignee_id: manager,
      },
      { key: "hr", label: "HR", action: "approve", assignee_id: owner },
    ];
    await db.query("SELECT hr_save_workflow($1,$2,$3,true,0)", [
      owner,
      "leave",
      JSON.stringify(stages),
    ]);
    let year = new Date().getUTCFullYear() + 2;
    while (
      [0, 6].includes(new Date(`${year}-12-31T12:00:00Z`).getUTCDay()) ||
      [0, 6].includes(new Date(`${year + 1}-01-01T12:00:00Z`).getUTCDay())
    )
      year++;
    const from = `${year}-12-31`,
      to = `${year + 1}-01-01`;
    for (const y of [year, year + 1])
      await db.query("SELECT hr_set_leave_entitlement($1,$2,$3,$4,2,0)", [
        owner,
        employee,
        paid,
        y,
      ]);
    const currentQuote = async () =>
      (
        await db.query("SELECT hr_leave_quote($1,$2,$3,$4,$5) AS q", [
          employee,
          paid,
          from,
          to,
          "FULL",
        ])
      ).rows[0].q;
    const q = await currentQuote(),
      input = {
        leave_type_id: paid,
        start_date: from,
        end_date: to,
        session: "FULL",
        reason: "Cross-year leave",
        business_unit: "UYF",
        signature: "Calendar Employee",
        declaration: true,
      },
      key = uid();
    await db.query("SELECT hr_submit_leave_form($1,$2,$3,$4,NULL)", [
      worker,
      key,
      JSON.stringify(input),
      q.fingerprint,
    ]);
    const approval = (
      await db.query(
        "SELECT id FROM hr_approval_requests WHERE resource_id=$1",
        [key],
      )
    ).rows[0].id;
    await db.query("SELECT hr_decide_leave_form($1,$2,$3,$4,1,$5)", [
      manager,
      approval,
      "approve",
      "Checked",
      "",
    ]);
    await db.query("SELECT hr_set_leave_entitlement($1,$2,$3,$4,0,1)", [
      owner,
      employee,
      paid,
      year + 1,
    ]);
    await assert.rejects(
      db.query("SELECT hr_decide_leave_form($1,$2,$3,$4,2,$5)", [
        owner,
        approval,
        "approve",
        "Final",
        "",
      ]),
      /Insufficient/,
    );
    assert(
      (await db.query('SELECT used_days FROM "Leave_balances"')).rows.every(
        (b) => Number(b.used_days) === 0,
      ),
      "a failure in year two rolls back year one",
    );
    assert.equal(
      (
        await db.query("SELECT version FROM hr_approval_requests WHERE id=$1", [
          approval,
        ])
      ).rows[0].version,
      2,
    );
    await db.query("SELECT hr_set_leave_entitlement($1,$2,$3,$4,2,2)", [
      owner,
      employee,
      paid,
      year + 1,
    ]);
    await db.query(
      "INSERT INTO hr_leave_calendar_dates(work_date,is_working) VALUES($1,false)",
      [from],
    );
    await assert.rejects(
      db.query("SELECT hr_decide_leave_form($1,$2,$3,$4,2,$5)", [
        owner,
        approval,
        "approve",
        "Final",
        "",
      ]),
      /Calendar changed/,
    );
    await db.query("DELETE FROM hr_leave_calendar_dates");
    await db.query("SELECT hr_decide_leave_form($1,$2,$3,$4,2,$5)", [
      owner,
      approval,
      "approve",
      "Final",
      "",
    ]);
    assert(
      (await db.query('SELECT used_days FROM "Leave_balances"')).rows.every(
        (b) => Number(b.used_days) === 1,
      ),
    );
    await assert.rejects(
      db.query('UPDATE "Leave_Request" SET status=$1 WHERE id=$2', [
        "Pending",
        key,
      ]),
      /staged leave/,
    );
    // Handover linkage remains compatible with immutable form fields.
    await db.query(
      'UPDATE "Leave_Request" SET coverage_handover_id=$1 WHERE id=$2',
      [uid(), key],
    );
    await db.query('UPDATE "Leave_type" SET kind=$1 WHERE id=$2', [
      "other",
      sick,
    ]);
    await db.exec(
      await readFile(
        new URL("../../supabase/006_leave_forms.sql", import.meta.url),
        "utf8",
      ),
    );
    assert.equal(
      (await db.query('SELECT kind FROM "Leave_type" WHERE id=$1', [sick]))
        .rows[0].kind,
      "other",
      "reruns preserve explicit catalog choices",
    );
    assert.equal(
      (
        await db.query(
          "SELECT has_table_privilege('authenticated','hr_leave_calendar','UPDATE') AS allowed",
        )
      ).rows[0].allowed,
      false,
    );
  } finally {
    await db.close();
  }
});
