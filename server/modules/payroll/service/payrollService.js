import { payrollRepository } from '../repository/index.js';

export const payrollService = {
  getFinancePayrolls: async () => {
    return await payrollRepository.getFinancePayrolls();
  },

  getPaidPayrolls: async () => {
    return await payrollRepository.getPaidPayrolls();
  },

  getEmployeePayrolls: async (employeeId, ascending = false) => {
    return await payrollRepository.getEmployeePayrolls(employeeId, ascending);
  }
};
