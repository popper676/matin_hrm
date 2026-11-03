import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expenseInput } from "../../shared/expenseForm.js";
const input = {
  business_unit: "UYF",
  category: "Office/Admin",
  description: "ရုံးသုံး ပစ္စည်းများ",
  purpose: "Office supplies",
  vendor: "Synthetic shop",
  expense_date: "2026-10-20",
  required_payment_date: "2026-10-21",
  urgency: "Normal",
  payment_method: "Bank Transfer",
  currency: "THB",
  requested_amount: 350.25,
  budget_amount: 1000,
};
test("MOD-004 quick expense requires only core fields, with category-specific server validation", () => {
 const basic={business_unit:"UYF",category:"Office/Admin",description:"Office stationery",requested_amount:"350.25",currency:"THB",expense_date:"2026-10-22"};
 const result=expenseInput(basic);
 assert.equal(result.urgency,"Normal");
 assert.equal(result.requested_amount,350.25);
 assert.equal(result.budget_amount,undefined);
 assert.equal(result.payment_method,undefined);
 for(const patch of [
  {requested_amount:0},{requested_amount:0.001},{business_unit:"Fake"},
  {category:"Fake"},{description:""},{currency:"THB<script>"},
  {expense_date:"2026-02-30"},{urgency:"Skip approval"},
  {urgency:"Urgent"},{category:"Travel & Transportation"},
  {category:"AI Tools / Software"},{category:"Events"}
 ])assert.throws(()=>expenseInput({...basic,...patch}));
 const urgent=expenseInput({...basic,urgency:"Urgent",urgency_reason:"Urgent",required_payment_date:"2026-10-23"});
 assert.equal(urgent.urgency_reason,"Urgent");
 assert.equal(expenseInput({...basic,category:"Travel & Transportation",destination:"Bangkok",travel_date:"2026-11-01"}).destination,"Bangkok");
 assert.throws(()=>expenseInput({...basic,category:"Travel & Transportation",destination:"Bangkok",travel_date:"2026-02-30"}));
 assert.equal(expenseInput({...basic,category:"AI Tools / Software",service_name:"Demo",is_recurring:"true",subscription_period:"Nov 2026"}).is_recurring,true);
 assert.throws(()=>expenseInput({...basic,category:"AI Tools / Software",service_name:"Demo",is_recurring:"true"}));
 assert.equal(expenseInput({...basic,category:"Training",event_name:"Demo",has_scheduled_date:"false"}).planned_date,undefined);
 assert.throws(()=>expenseInput({...basic,category:"Events",event_name:"Demo",has_scheduled_date:"true"}));
 assert.equal(expenseInput({...basic,budget_amount:5000}).budget_amount,undefined);
});
async function setup() {
  const db = new PGlite();
  await db.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;",
  );
  for (const file of [
    "001_fresh_hr_schema.sql",
    "003_recruitment_openings.sql",
    "004_people_access_approvals.sql",
    "005_employee_information.sql",
    "006_leave_forms.sql",
    "007_expense_forms.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../../supabase/" + file, import.meta.url),
        "utf8",
      ),
    );
  const e = (
    await db.query(
      'INSERT INTO "Employees"(employee_id,"Full_name") VALUES($1,$2) RETURNING id',
      ["EXP-001", "Synthetic Employee"],
    )
  ).rows[0].id;
  const user = (
    await db.query(
      "INSERT INTO sys_users(username,password_hash,full_name,role,employee_id) VALUES('requester','hash','Employee','employee',$1) RETURNING id",
      [e],
    )
  ).rows[0].id;
  const reviewer = (
    await db.query(
      "INSERT INTO sys_users(username,password_hash,full_name,role) VALUES('reviewer','hash','Reviewer','employee') RETURNING id",
    )
  ).rows[0].id;
  const stages = ["department", "agm", "coo", "finance"].map((key, i) => ({
    key,
    label: key,
    action: i === 3 ? "pay" : "approve",
    assignee_id: reviewer,
  }));
  await db.query(
    "INSERT INTO hr_access_policies(user_id,policy) VALUES($1,$2)",
    [
      reviewer,
      JSON.stringify({
        modules: { rewards: ["view", "approve", "pay"] },
        scope: "own",
        personal: [],
      }),
    ],
  );
  await db.query(
    "INSERT INTO hr_workflow_settings(workflow_key,enabled,stages) VALUES('expense',true,$1)",
    [JSON.stringify(stages)],
  );
  const submit = async (i = input, key = crypto.randomUUID()) =>
    (
      await db.query("SELECT * FROM hr_submit_expense_form($1,$2,$3,$4)", [
        user,
        key,
        JSON.stringify(i),
        "[]",
      ])
    ).rows[0];
  const decide = async (
    id,
    version,
    decision = "approve",
    amount = 350.25,
    comment = "",
    conditions = "",
    payment = null,
  ) =>
    (
      await db.query(
        "SELECT * FROM hr_decide_expense_form($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          reviewer,
          id,
          decision,
          comment,
          version,
          amount,
          conditions,
          payment && JSON.stringify(payment),
        ],
      )
    ).rows[0];
  return { db, e, user, reviewer, stages, submit, decide };
}
test("expense transaction preserves authorization ceilings, conditions, final settlement and immutable history", async () => {
  const { db, submit, decide, user } = await setup();
  try {
    const r = await submit(),
      a = (
        await db.query(
          "SELECT * FROM hr_approval_requests WHERE resource_id=$1",
          [r.id],
        )
      ).rows[0];
    await assert.rejects(db.query('SELECT hr_decide_approval($1,$2,$3,$4,$5)',[a.stages[0].assignee_id,a.id,'approve','',1]),/complete expense approval/);
    assert.equal((await db.query('SELECT current_stage FROM hr_approval_requests WHERE id=$1',[a.id])).rows[0].current_stage,0);
    assert.equal(r.form_snapshot.budget_remaining, 649.75);
    assert.match(r.request_number, /^UYF_\d{4}_001$/);
    assert.equal((await submit(input, r.id)).id, r.id);
    await assert.rejects(
      submit({ ...input, purpose: "Changed" }, r.id),
      /already exists/,
    );
    await assert.rejects(
      db.query("SELECT hr_decide_expense_form($1,$2,$3,$4,$5,$6)", [
        user,
        a.id,
        "approve",
        "",
        1,
        350,
      ]),
      /own request/,
    );
    await assert.rejects(
      decide(a.id, 1, "pay", null, "", "", {
        amount: 350,
        currency: "THB",
        date: "2026-10-19",
        method: "Cash",
        reference: "X",
      }),
      /Wrong action/,
    );
    await assert.rejects(
      decide(a.id, 1, "approve", 351),
      /previous authorized/,
    );
    await decide(
      a.id,
      1,
      "approve_with_conditions",
      300,
      "Reviewed",
      "Attach final receipt",
    );
    await assert.rejects(decide(a.id, 1, "approve", 300), /changed/);
    await assert.rejects(
      decide(a.id, 2, "approve", 301),
      /previous authorized/,
    );
    await decide(a.id, 2, "approve", 290);
    await decide(a.id, 3, "approve", 280);
    assert.equal(
      (
        await db.query("SELECT status FROM rewards_and_claims WHERE id=$1", [
          r.id,
        ])
      ).rows[0].status,
      "APPROVED",
    );
    const p = {
      amount: 280,
      currency: "THB",
      date: "2026-10-19",
      method: "Bank Transfer",
      reference: "SYNTHETIC-001",
    };
    await assert.rejects(
      decide(a.id, 4, "pay", null, "", "", { ...p, amount: 281 }),
      /within approval/,
    );
    await assert.rejects(
      decide(a.id, 4, "pay", null, "", "", { ...p, currency: "USD" }),
      /matching currency/,
    );
    await assert.rejects(
      decide(a.id, 4, "pay", null, "", "", { ...p, date: "2099-01-01" }),
      /future/,
    );
    await assert.rejects(
      decide(a.id, 4, "pay", null, "", "", { ...p, amount: 270 }),
      /Explain/,
    );
    await decide(a.id, 4, "pay", null, "Final invoice lower", "", {
      ...p,
      amount: 270,
    });
    const settled = (
      await db.query("SELECT * FROM rewards_and_claims WHERE id=$1", [r.id])
    ).rows[0];
    assert.equal(settled.status, "PAID");
    assert.equal(Number(settled.paid_amount), 270);
    assert.equal(Number(settled.approved_amount), 280);
    const final = (
      await db.query("SELECT * FROM hr_approval_requests WHERE id=$1", [a.id])
    ).rows[0];
    assert.equal(final.history.length, 4);
    assert.equal(final.history[0].conditions, "Attach final receipt");
    await assert.rejects(decide(a.id, 5, "pay", null, "", "", p), /completed/);
    await assert.rejects(
      db.query("UPDATE rewards_and_claims SET requested_amount=1 WHERE id=$1", [
        r.id,
      ]),
      /complete expense/,
    );
    await assert.rejects(
      db.query("DELETE FROM rewards_and_claims WHERE id=$1", [r.id]),
      /retained/,
    );
    await db.exec(
      await readFile(
        new URL("../../supabase/007_expense_forms.sql", import.meta.url),
        "utf8",
      ),
    );
    assert.equal(
      Number(
        (
          await db.query(
            "SELECT paid_amount FROM rewards_and_claims WHERE id=$1",
            [r.id],
          )
        ).rows[0].paid_amount,
      ),
      270,
    );
    assert.equal(
      (await submit({ ...input, business_unit: "BBD" })).request_number.replace(
        /^BBD_\d{4}_/,
        "",
      ),
      "001",
    );
    assert.equal(
      (await submit()).request_number.replace(/^UYF_\d{4}_/, ""),
      "002",
    );
  } finally {
    await db.close();
  }
});
test("expense routing honors current permissions, independent employee identities, rejection and disabled templates", async () => {
  const { db, user, reviewer, e, submit, decide, stages } = await setup();
  try {
    const r = await submit(),
      a = (
        await db.query(
          "SELECT * FROM hr_approval_requests WHERE resource_id=$1",
          [r.id],
        )
      ).rows[0];
    await db.query("UPDATE hr_access_policies SET policy=$1 WHERE user_id=$2", [
      JSON.stringify({ modules: { rewards: ["view"] } }),
      reviewer,
    ]);
    await assert.rejects(decide(a.id, 1), /permission/);
    await assert.rejects(submit(), /permission/);
    await db.query("UPDATE hr_access_policies SET policy=$1 WHERE user_id=$2", [
      JSON.stringify({ modules: { rewards: ["view", "approve", "pay"] } }),
      reviewer,
    ]);
    await assert.rejects(decide(a.id, 1, "reject", null), /reason/);
    await decide(a.id, 1, "reject", null, "Not required");
    assert.equal(
      (
        await db.query("SELECT status FROM rewards_and_claims WHERE id=$1", [
          r.id,
        ])
      ).rows[0].status,
      "REJECTED",
    );
    await db.query(
      "UPDATE hr_workflow_settings SET enabled=false WHERE workflow_key='expense'",
    );
    await assert.rejects(submit(), /activate/);
    await db.query(
      "UPDATE hr_workflow_settings SET enabled=true,stages=$1 WHERE workflow_key='expense'",
      [
        JSON.stringify(
          stages.map((s) => ({
            ...s,
            assignee_id: user,
            alternate_id: reviewer,
          })),
        ),
      ],
    );
    const alt = await submit(),
      route = (
        await db.query(
          "SELECT stages FROM hr_approval_requests WHERE resource_id=$1",
          [alt.id],
        )
      ).rows[0].stages;
    assert(route.every((s) => s.assignee_id === reviewer));
    await db.query("UPDATE sys_users SET employee_id=NULL WHERE id=$1", [user]);
    await db.query("UPDATE sys_users SET employee_id=$1 WHERE id=$2", [
      e,
      reviewer,
    ]);
    await assert.rejects(
      db.query("SELECT hr_decide_expense_form($1,$2,$3,$4,$5,$6)", [
        reviewer,
        (
          await db.query(
            "SELECT id FROM hr_approval_requests WHERE resource_id=$1",
            [alt.id],
          )
        ).rows[0].id,
        "approve",
        "",
        1,
        300,
      ]),
      /own request/,
    );
    assert.equal(
      (
        await db.query(
          "SELECT has_function_privilege('authenticated','hr_submit_expense_form(uuid,uuid,jsonb,jsonb)','EXECUTE') AS ok",
        )
      ).rows[0].ok,
      false,
    );
    assert.equal(
      (
        await db.query(
          "SELECT has_table_privilege('anon','hr_expense_counters','SELECT') AS ok",
        )
      ).rows[0].ok,
      false,
    );
  } finally {
    await db.close();
  }
});
