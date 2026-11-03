import {approvalVisible,approvalCanAct} from '../lib/approvalAccess.js';
import express from 'express';
import {verifyToken} from '../middleware/auth.js';
import {systemDb} from '../shared/db/index.js';
import {UUID} from '../../shared/accessPolicy.js';
const router = express.Router();
router.use(verifyToken);
router.get("/", async (req, res) => {
  try {
    // Filter each database page to this actor before applying any result limit.
    const load=async kind=>{
      const out=[];
      for(let offset=0;offset<100000;offset+=500){
        let q=systemDb.from('hr_approval_requests').select('*').order('created_at',{ascending:false}).order('id');
        if(kind==='requester')q=q.eq('requester_id',req.user.id);
        if(kind==='assignee')q=q.contains('stages',JSON.stringify([{assignee_id:req.user.id}]));
        const {data,error}=await q.range(offset,offset+499);if(error)throw error;
        out.push(...data);if(data.length<500)return out;
      }
      throw new Error('Too many approval requests. Narrow or archive completed requests.');
    };
    const matches=req.user.is_owner?await load('owner'):(await Promise.all([load('requester'),load('assignee')])).flat();
    const rows=[...new Map(matches.map(r=>[r.id,r])).values()].filter(r=>approvalVisible(req.user,r)).sort((a,b)=>(a.status==='pending'?0:1)-(b.status==='pending'?0:1)||b.created_at.localeCompare(a.created_at));
    res.json({requests:rows.map(r=>({...r,can_act:approvalCanAct(req.user,r)}))});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
router.post("/:id/decision", async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) return res.sendStatus(400);
    const { decision, comment, version, payment } = req.body;
    if (
      !["approve", "approve_with_conditions", "reject", "pay"].includes(
        decision,
      ) ||
      !Number.isInteger(version) ||
      typeof comment !== "string" ||
      comment.length > 5000
    )
      throw new Error("Invalid decision");
    if (decision === "reject" && !comment.trim())
      throw new Error("Explain why this request is rejected");
    if (
      decision === "pay" &&
      (!Number.isFinite(Number(payment?.amount)) ||
        Number(payment.amount) <= 0 ||
        !String(payment.reference || "").trim() ||
        !/^\d{4}-\d{2}-\d{2}$/.test(payment.date || "") ||
        !/^[A-Z]{3}$/.test(payment.currency || ""))
    )
      throw new Error("Enter the payment amount, currency, date and reference");
    const lookup = await systemDb
      .from("hr_approval_requests")
      .select("workflow_key")
      .eq("id", req.params.id)
      .maybeSingle();
    if (lookup.error) throw lookup.error;
    if (!lookup.data) return res.sendStatus(404);
    if(lookup.data.workflow_key === "warning")return res.status(400).json({error:"Use the Warning Letter decision form"});
    if(lookup.data.workflow_key === "probation")return res.status(400).json({error:"Use the Probation evaluation decision form"});
    const information = lookup.data.workflow_key === "employee_information";
    let leaveForm = false;
    let expenseForm = false;
    if (lookup.data.workflow_key === "expense") {
      const ref = await systemDb
        .from("hr_approval_requests")
        .select("resource_id")
        .eq("id", req.params.id)
        .single();
      if (ref.error) throw ref.error;
      const row = await systemDb
        .from("rewards_and_claims")
        .select("form_version")
        .eq("id", ref.data.resource_id)
        .maybeSingle();
      if (row.error) throw row.error;
      expenseForm = row.data?.form_version === 2;
    }
    if (lookup.data.workflow_key === "leave") {
      const ref = await systemDb
        .from("hr_approval_requests")
        .select("resource_id")
        .eq("id", req.params.id)
        .single();
      if (ref.error) throw ref.error;
      const row = await systemDb
        .from("Leave_Request")
        .select("form_version")
        .eq("id", ref.data.resource_id)
        .maybeSingle();
      if (row.error) throw row.error;
      leaveForm = row.data?.form_version === 2;
    }
    if (decision === "approve_with_conditions" && !leaveForm && !expenseForm)
      throw new Error(
        "Conditions are available on updated Leave and Expense forms",
      );
    if (
      (leaveForm || expenseForm) &&
      (typeof (req.body.conditions ?? "") !== "string" ||
        (req.body.conditions || "").length > 4000)
    )
      throw new Error("Invalid approval conditions");
    const { data, error } = await systemDb.rpc(
      expenseForm
        ? "hr_decide_expense_form"
        : leaveForm
          ? "hr_decide_leave_form"
          : information
            ? "hr_decide_information"
            : "hr_decide_approval",
      {
        p_actor: req.user.id,
        p_id: req.params.id,
        p_decision: decision,
        p_comment: comment.trim(),
        p_version: version,
        ...(expenseForm
          ? {
              p_amount: req.body.approved_amount ?? null,
              p_conditions: req.body.conditions || "",
              p_payment: decision === "pay" ? payment : null,
            }
          : leaveForm
            ? { p_conditions: req.body.conditions || "" }
            : information
              ? {}
              : { p_payment: decision === "pay" ? payment : null }),
      },
    );
    if (error) throw error;
    res.json({ request: Array.isArray(data) ? data[0] : data });
  } catch (e) {
    const m = e.message || "Unable to record decision";
    res
      .status(
        /changed|completed/.test(m)
          ? 409
          : /permission|assigned|own request|disabled/.test(m)
            ? 403
            : 400,
      )
      .json({ error: m });
  }
});
export default router;
