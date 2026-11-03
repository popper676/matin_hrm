import express from 'express';
import { dbFetch, dbFetchOne, supabase, dbInsert, dbUpdate } from '../lib/supabase.js';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { hrmModule } from '../modules/hrm/index.js';
import { getBkkDateString } from '../lib/dateUtils.js';
import {
  DEFAULT_SALARY_DIVISOR,
  calculateDailyRate,
  calculateUnpaidDeduction,
  calculateKpiContribution,
  calculateBonus,
  calculateNetSalary,
} from '../modules/hrm/engine/payrollCalculationEngine.js';

export const defaultSettings = Object.freeze({target_bonus_percentage:15,auto_weights:{attendance:40,punctuality:0,sops:40,peer_voting:20},manual_metrics:[]});
export function validateKpiSettings(value) {
  const fail=message=>{throw Object.assign(new Error(message),{status:400});};
  if(!value||typeof value!=='object'||Array.isArray(value)||!value.auto_weights||!Array.isArray(value.manual_metrics))fail('KPI settings require auto_weights and manual_metrics.');
  const number=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
  if(!number(value.target_bonus_percentage,0,100))fail('Target bonus must be between 0 and 100.');
  const weights={};
  for(const key of ['attendance','punctuality','sops','peer_voting']) {
    if(!number(value.auto_weights[key],0,100))fail('Each automatic weight must be between 0 and 100.');
    weights[key]=value.auto_weights[key];
  }
  if(value.manual_metrics.length>30)fail('At most 30 manual metrics are allowed.');
  const metrics=value.manual_metrics.map(m=>{
    if(!m||typeof m.name!=='string'||!m.name.trim()||m.name.length>200||!number(m.weight,0,100))fail('Manual metrics require a name and weight between 0 and 100.');
    return {name:m.name.trim(),weight:m.weight};
  });
  if(Object.values(weights).reduce((a,b)=>a+b,0)+metrics.reduce((a,b)=>a+b.weight,0)>100.000001)fail('Total KPI weights cannot exceed 100%.');
  return {target_bonus_percentage:value.target_bonus_percentage,auto_weights:weights,manual_metrics:metrics};
}
export async function getSettings(source=supabase) {
  const {data,error}=await source.from('kpi_settings').select('settings').eq('id',1).single();
  if(error&&error.code!=='PGRST116')throw Object.assign(new Error('KPI settings could not be loaded. Please retry.'),{status:503});
  if(!data)return structuredClone(defaultSettings);
  try{return validateKpiSettings(data.settings);}catch {throw Object.assign(new Error('Saved KPI settings are invalid. Ask the Owner to review them.'),{status:409});}
}
export async function saveSettings(settings) {
  const checked=validateKpiSettings(settings);
  const {error}=await supabase.from('kpi_settings').upsert({id:1,settings:checked},{onConflict:'id'});
  if(error)throw error;
}

export async function calculatePayroll(employee_id, month, req_working_days = null) {
  const context = await hrmModule.getEmployeeCompensationContext(employee_id, month, req_working_days);
  const base_salary = context.base_salary;
  const working_days = context.working_days;

  // Fetch Settings
  const settings = await getSettings();
  const w_att   = settings.auto_weights.attendance    || 0;
  const w_punct = settings.auto_weights.punctuality   || 0;
  const w_sops  = settings.auto_weights.sops          || 0;
  const w_peer  = settings.auto_weights.peer_voting   || 0;

  const {
    actual_attendance,
    on_time_count,
    attendance_score,
    punctuality_score,
    completed_sops_count,
    total_sops_count,
    sop_score,
    peer_votes_count,
    peer_score,
    unpaid_leave_days
  } = context;

  const daily_rate              = calculateDailyRate(base_salary || 0, working_days);
  const unpaid_leave_deduction  = calculateUnpaidDeduction(daily_rate, unpaid_leave_days || 0);

  // 4. Calculate Final KPI & Salary
  const auto_kpi_contribution = calculateKpiContribution(
    { attendance: attendance_score, punctuality: punctuality_score, sop: sop_score, peer: peer_score },
    { attendance: w_att, punctuality: w_punct, sops: w_sops, peer_voting: w_peer }
  );

  return {
    success: true,
    employee_id,
    month,
    base_salary: parseFloat(base_salary.toFixed(2)),
    auto_kpi_contribution: parseFloat(auto_kpi_contribution.toFixed(2)),
    expected_working_days: working_days,
    actual_attendance,
    on_time_count,
    attendance_score: parseFloat(attendance_score.toFixed(2)),
    punctuality_score: parseFloat(punctuality_score.toFixed(2)),
    completed_sops_count,
    total_sops_count,
    sop_score: parseFloat(sop_score.toFixed(2)),
    peer_votes_count,
    peer_score: parseFloat(peer_score.toFixed(2)),
    unpaid_leave_days,
    unpaid_leave_deduction,
    auto_weights: settings.auto_weights,
    manual_metrics: settings.manual_metrics || [],
    target_bonus_percentage: settings.target_bonus_percentage ?? 15
  };
}

const router = express.Router();
router.use(verifyToken);
router.use(requireAdmin);

// GET /api/payroll-engine/settings
router.get('/settings', async (req, res) => {
  try { res.json(await getSettings()); } catch(e) {res.status(e.status||500).json({error:e.message});}
});

// POST /api/payroll-engine/settings
router.post('/settings', async (req, res) => {
  try {
    await saveSettings(req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /api/payroll-engine/calculate/:employee_id/:month
router.get('/calculate/:employee_id/:month', async (req, res) => {
  try {
    const data = await calculatePayroll(req.params.employee_id, req.params.month, req.query.working_days);
    return res.json(data);
  } catch (e) {
    console.error('[PAYROLL ENGINE]', e);
    return res.status(e.status || 500).json({ error: e.message });
  }
});

export default router;
