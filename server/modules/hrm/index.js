import { employeeService } from './service/employeeService.js';
import { compensationService } from './service/compensationService.js';
import { attendanceService } from './service/attendanceService.js';
import { leaveService } from './service/leaveService.js';

export const hrmModule = {
  createEmployee: employeeService.createEmployee,
  updateEmployee: employeeService.updateEmployee,
  getEmployeeProfile: employeeService.getEmployeeProfile,
  getEmployeeCompensationContext: compensationService.getEmployeeCompensationContext,
  getEmployeesForPayroll: compensationService.getEmployeesForPayroll,
  
  // Attendance Boundaries
  getAttendanceSummaryForPayroll: attendanceService.getAttendanceSummaryForPayroll,
  getAttendanceHistory: attendanceService.getAttendanceHistory,
  
  // Leave Boundaries
  getEmployeeLeaveBalances: leaveService.getEmployeeLeaveBalances,
  getActiveLeaves: leaveService.getActiveLeaves,
  getEmployeeLeaveRequests: leaveService.getEmployeeLeaveRequests,
  getAllLeaveRequests: leaveService.getAllLeaveRequests,
  getLeaveBalancesForAll: leaveService.getLeaveBalancesForAll
};

export const leaveModule = {
  linkCoverageHandover: leaveService.linkCoverageHandover,
  linkReturnHandover: leaveService.linkReturnHandover
};
