import { dbFetch, supabase } from '../../../lib/supabase.js';

export const payrollRepository = {
  getFinancePayrolls: async () => {
    return await dbFetch('payrolls', 'id, employee_id, net_salary, month, payment_status', {}, { order: 'month', ascending: false });
  },

  getPaidPayrolls: async () => {
    const { data, error } = await supabase
      .from('payrolls')
      .select('id,payment_status,net_salary')
      .eq('payment_status', 'Paid');

    if (error) throw error;
    return data || [];
  },

  getEmployeePayrolls: async (employeeId, ascending = false) => {
    return await dbFetch(
      'payrolls',
      '*',
      { employee_id: employeeId },
      { order: 'month', ascending }
    );
  }
};
