import { payrollService } from './service/payrollService.js';

export const payrollModule = {
  getFinancePayrolls: payrollService.getFinancePayrolls,
  getPaidPayrolls: payrollService.getPaidPayrolls,
  getEmployeePayrolls: payrollService.getEmployeePayrolls,
};
