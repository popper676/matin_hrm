// An AI tool may never select credentials or reach a non-HR schema/table.
export const HR_AI_TABLES = Object.freeze({
  Employees: ['id', 'employee_id', 'Full_name', 'Dept_id', 'position_id', 'status', 'hire_date', 'salary'],
  Leave_Request: ['id', 'employee_id', 'leave_type_id', 'status', 'start_date', 'end_date', 'reason'],
  boss_kpi_assignments: ['id', 'title', 'description', 'assigned_to_id', 'status', 'deadline'],
  attendance_records: ['id', 'employee_id', 'check_in', 'check_out', 'is_late', 'overtime_hours', 'created_at'],
  payrolls: ['id', 'employee_id', 'month', 'basic_salary', 'net_salary', 'payment_status', 'calculation_source', 'created_at'],
  positions: ['id', 'title', 'team', 'is_hiring'],
  Departments: ['id', 'Department_name'],
});

export function validateHrAiQuery(args) {
  const allowed = HR_AI_TABLES[args.table];
  if ((args.schema && args.schema !== 'public') || !allowed) throw new Error('HR data only: table is not allowed.');
  const columns = (!args.columns || args.columns === '*') ? allowed : args.columns.split(',').map(c => c.trim());
  if (columns.some(c => !allowed.includes(c))) throw new Error('Requested HR column is not allowed.');
  for (const field of ['filter_column', 'date_filter_column']) {
    if (args[field] && !allowed.includes(args[field])) throw new Error('Requested HR filter is not allowed.');
  }
  return { ...args, schema: 'public', columns: columns.join(','), limit: Math.min(Math.max(Number(args.limit) || 100, 1), 500) };
}
