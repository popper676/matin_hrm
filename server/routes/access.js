import {normalizeExpenseRouting} from '../../shared/expenseRouting.js';
import express from "express";
import { canReviewInformation } from "../../shared/employeeInformation.js";
import { verifyToken } from "../middleware/auth.js";
import { systemDb } from "../shared/db/index.js";
import {
  loadAccount,
  normalizePolicy,
  MODULES,
  PERSONAL_APPS,
  WORKFLOWS,
  can,
} from "../lib/accessControl.js";
import { emptyPolicy, UUID } from "../../shared/accessPolicy.js";
const router = express.Router();
router.use(verifyToken);
const check = (r) => {
  if (r.error) throw r.error;
  return r.data;
};
const fail = (res, e) =>
  res
    .status(e.message?.includes("changed") ? 409 : 400)
    .json({ error: e.message });
router.get("/me", (req, res) => res.json({ user: req.user }));
router.get("/", async (req, res) => {
  try {
    const [users, employees, policies, settings, expenseRouting] = await Promise.all([
      systemDb
        .from("sys_users")
        .select("id,username,full_name,role,employee_id,is_active,is_owner")
        .order("full_name"),
      systemDb
        .from("Employees")
        .select("id,employee_id,Full_name,Dept_id")
        .order("Full_name"),
      systemDb.from("hr_access_policies").select("*"),
      systemDb.from("hr_workflow_settings").select("*"),
      systemDb.from("hr_expense_routing").select("*").eq("id",true).single(),
    ]);
    res.json({
      users: check(users),
      employees: check(employees),
      policies: check(policies),
      settings: check(settings),
      expense_routing:check(expenseRouting),
      modules: MODULES,
      personal_apps: PERSONAL_APPS,
      workflows: WORKFLOWS,
      default_policy: emptyPolicy(),
    });
  } catch (e) {
    fail(res, e);
  }
});
router.get('/expense-routing',async(req,res)=>{try{res.set('Cache-Control','no-store').json({setting:check(await systemDb.from('hr_expense_routing').select('*').eq('id',true).single())});}catch(e){fail(res,e);}});
router.put('/expense-routing',async(req,res)=>{try{
 if(!Number.isInteger(req.body.version))throw new Error('Reload the current expense configuration.');
 const config=normalizeExpenseRouting(req.body.config);
 const setting=check(await systemDb.rpc('hr_save_expense_routing',{p_actor:req.user.id,p_config:config,p_version:req.body.version}));
 res.json({setting:Array.isArray(setting)?setting[0]:setting});
}catch(e){fail(res,e);}});
router.post('/expense-routing/preview',async(req,res)=>{try{
 if(!UUID.test(req.body.requester_id||''))throw new Error('Choose the requester.');
 const config=normalizeExpenseRouting(req.body.config);
 const route=check(await systemDb.rpc('hr_expense_route',{p_requester:req.body.requester_id,p_currency:req.body.currency,p_amount:req.body.amount,p_config:{...config,version:req.body.version||1}}));
 res.json(Array.isArray(route)?route[0]:route);
}catch(e){fail(res,e);}});
router.put("/people/:id", async (req, res) => {
  try {
    if (!UUID.test(req.params.id) || !Number.isInteger(req.body.version))
      throw new Error("Invalid account or version");
    const policy = normalizePolicy(req.body.policy);
    if (policy.employee_ids.length) {
      const rows = check(
        await systemDb
          .from("Employees")
          .select("id")
          .in("id", policy.employee_ids),
      );
      if (rows.length !== policy.employee_ids.length)
        throw new Error("An employee selection no longer exists");
    }
    const result = check(
      await systemDb.rpc("hr_save_access", {
        p_actor: req.user.id,
        p_user: req.params.id,
        p_policy: policy,
        p_version: req.body.version,
      }),
    );
    res.json({ policy: Array.isArray(result) ? result[0] : result });
  } catch (e) {
    fail(res, e);
  }
});
router.put("/workflows/:key", async (req, res) => {
  try {
    const def = WORKFLOWS[req.params.key];
    if (!def) throw new Error("Unknown workflow");
    const { stages, enabled, version } = req.body;
    if (
      enabled &&
      !["employee_information", "leave", "expense", "probation", "warning"].includes(req.params.key)
    )
      throw new Error(
        "Assignments can be saved now; this form will be connected in the next upgrade.",
      );
    if (
      !Array.isArray(stages) ||
      stages.length !== def.stages.length ||
      !Number.isInteger(version) ||
      typeof enabled !== "boolean"
    )
      throw new Error("Invalid workflow settings");
    const checked = [];
    for (let i = 0; i < def.stages.length; i++) {
      const [key, label, action] = def.stages[i],
        s = stages[i];
      if (s.key !== key)
        throw new Error("The approved form stages must remain in order");
      for (const id of [s.assignee_id, s.alternate_id].filter(Boolean)) {
        if (!UUID.test(id)) throw new Error("Invalid approver");
        const account = await loadAccount(id);
        if (!can(account, def.module, action))
          throw new Error(
            `${account.full_name || account.username} needs ${def.module}: ${action} access first`,
          );
      }
      if (enabled && !s.assignee_id)
        throw new Error(`Choose an approver for ${label}`);
      if (s.assignee_id && s.assignee_id === s.alternate_id)
        throw new Error("The alternate must be a different person");
      if (req.params.key === "employee_information") {
        for (const id of [s.assignee_id, s.alternate_id].filter(Boolean)) {
          if (!canReviewInformation(await loadAccount(id)))
            throw new Error(
              "Employee information reviewers need Employees approval, Salary, Bank and Identity permission.",
            );
        }
      }
      checked.push({
        key,
        label,
        action,
        assignee_id: s.assignee_id || null,
        alternate_id: s.alternate_id || null,
      });
    }
    const result = check(
      await systemDb.rpc("hr_save_workflow", {
        p_actor: req.user.id,
        p_key: req.params.key,
        p_stages: checked,
        p_enabled: enabled,
        p_version: version,
      }),
    );
    res.json({ setting: Array.isArray(result) ? result[0] : result });
  } catch (e) {
    fail(res, e);
  }
});
router.post("/workflows/:key/preview", async (req, res) => {
  try {
    const def = WORKFLOWS[req.params.key];
    if (!def) throw new Error("Unknown workflow");
    const requester = await loadAccount(req.body.requester_id);
    const stages = req.body.stages;
    if (!Array.isArray(stages) || stages.length !== def.stages.length)
      throw new Error("Set all stages");
    const result = [];
    for (let i = 0; i < def.stages.length; i++) {
      const stage = stages[i],
        id =
          stage.assignee_id === requester.id
            ? stage.alternate_id
            : stage.assignee_id;
      let state = "ready",
        name = null;
      if (!id || id === requester.id) state = "needs_alternate";
      else {
        try {
          const account = await loadAccount(id);
          name = account.full_name || account.username;
          if (
            ["employee_information", "leave"].includes(req.params.key) &&
            account.employee_id &&
            account.employee_id === requester.employee_id
          )
            state = "needs_alternate";
          if (
            !can(account, def.module, def.stages[i][2]) ||
            (req.params.key === "employee_information" &&
              !canReviewInformation(account))
          )
            state = "missing_permission";
        } catch {
          state = "unavailable";
        }
      }
      result.push({
        key: def.stages[i][0],
        label: def.stages[i][1],
        action: def.stages[i][2],
        assignee_id: id || null,
        name,
        state,
      });
    }
    res.json({
      stages: result,
      ready: result.every((s) => s.state === "ready"),
    });
  } catch (e) {
    fail(res, e);
  }
});
export default router;
