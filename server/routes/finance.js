import express from 'express';
import { dbFetch } from '../lib/supabase.js';
import { verifyToken, requireFinance } from '../middleware/auth.js';
import { payrollModule } from '../modules/payroll/index.js';
import { hrmModule } from '../modules/hrm/index.js';

const router = express.Router();
router.use(verifyToken);
router.use(requireFinance); // Reusing requireAdmin for finance dashboard access control (Finance/Boss)

// GET /api/finance/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const userRole = req.user.role;
    if (!req.user.is_owner && !req.accessContext?.module) {
      return res.status(403).json({ error: 'Unauthorized access to finance dashboard' });
    }

    // Fetch data for aggregation
    const employees = await dbFetch('Employees', 'id, Full_name, salary, status');
    const activeEmployees = employees.filter(e => e.status === 'Active');

    const payrolls = await payrollModule.getFinancePayrolls();
    const depts = await dbFetch('Departments', 'id');
    const leaves = await hrmModule.getActiveLeaves();

    // Aggregation logic
    const headcount = activeEmployees.length;
    const baseSalaryTotal = activeEmployees.reduce((sum, e) => sum + parseFloat(e.salary || 0), 0);
    const departmentCount = depts.length;

    // Process payrolls for current month vs previous month (mock logic, relying on actual month strings)
    let currentMonthPayroll = 0;
    let previousMonthPayroll = 0;

    // Sort unique months
    const months = [...new Set(payrolls.map(p => p.month))].sort().reverse();
    if (months.length > 0) {
      const currentMonth = months[0];
      const [year,m]=currentMonth.split('-').map(Number);
      const previousMonth=new Date(Date.UTC(year,m-2,1)).toISOString().slice(0,7);

      currentMonthPayroll = payrolls
        .filter(p => p.month === currentMonth)
        .reduce((sum, p) => sum + parseFloat(p.net_salary || 0), 0);

      if (previousMonth) {
        previousMonthPayroll = payrolls
          .filter(p => p.month === previousMonth)
          .reduce((sum, p) => sum + parseFloat(p.net_salary || 0), 0);
      }
    }


    const variance = previousMonthPayroll > 0
      ? ((currentMonthPayroll - previousMonthPayroll) / previousMonthPayroll) * 100
      : null;

    const names=new Map(employees.map(e=>[e.id,e.Full_name]));
    return res.json({
      stats: {
        headcount,
        base_salary_total: baseSalaryTotal,
        department_count: departmentCount,
        approved_leaves: leaves.length,
        current_month_payroll: currentMonthPayroll,
        previous_month_payroll: previousMonthPayroll,
        variance: variance===null?null:variance.toFixed(2),
        latest_month: months[0] || null
      },
      currency: 'THB',
      recent_payrolls: payrolls.slice(0, 10).map(p=>({...p,employee_name:names.get(p.employee_id)||'—'}))
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
