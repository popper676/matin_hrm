import Icon from '../../components/common/Icon';
/**
 * PayrollWorkspace.jsx — Phase 3: Payroll Calculation Workspace
 *
 * Manual / what-if calculation environment for HR.
 * Changes are NOT saved until HR explicitly clicks "Apply Calculation".
 * All calculations happen server-side — NO payroll formulas in this file.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n, dp = 2) {
  if (n == null || isNaN(n)) return '—';
  return parseFloat(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function diffColor(v) {
  const n = parseFloat(v);
  if (!n || n === 0) return 'text-slate-400';
  return n > 0 ? 'text-emerald-400' : 'text-rose-400';
}

function diffLabel(v) {
  const n = parseFloat(v);
  if (!n || n === 0) return '—';
  return n > 0 ? `+${fmt(n)}` : fmt(n);
}

// ─── Comparison Row ───────────────────────────────────────────────────────────

function CompRow({ label, sysVal, manVal, diffVal, isOverridden, isCurrency, isHighlighted }) {
  const base = `flex items-center px-4 py-2.5 border-b border-white/5 text-sm transition-colors ${isHighlighted ? 'bg-indigo-500/10 border-indigo-500/20' : 'hover:bg-white/5'}`;
  return (
    <div className={base}>
      <div className="w-[40%] text-slate-300 flex items-center gap-2">
        {label}
        {isOverridden && (
          <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold uppercase">
            Override
          </span>
        )}
      </div>
      <div className="w-[20%] text-right font-mono text-slate-400 text-xs">
        {isCurrency ? `${fmt(sysVal)} THB` : fmt(sysVal)}
      </div>
      <div className={`w-[20%] text-right font-mono text-xs font-semibold ${isOverridden ? 'text-amber-300' : 'text-slate-300'}`}>
        {isCurrency ? `${fmt(manVal)} THB` : fmt(manVal)}
      </div>
      <div className={`w-[20%] text-right font-mono text-xs font-bold ${diffColor(diffVal)}`}>
        {isCurrency ? (diffLabel(diffVal) !== '—' ? `${diffLabel(diffVal)} THB` : '—') : diffLabel(diffVal)}
      </div>
    </div>
  );
}

// ─── Confirmation Dialog ───────────────────────────────────────────────────────

function ConfirmDialog({ empName, month, sysNet, manNet, diff, notes, existing, onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative rounded-2xl w-full max-w-md bg-surface-800 border border-white/10 p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-1">Apply to Official Payroll?</h3>
        <p className="text-xs text-slate-400 mb-5">This will {existing ? 'update the existing Pending' : 'create a new'} payroll record.</p>

        <div className="space-y-2 text-sm mb-5">
          <div className="flex justify-between"><span className="text-slate-400">Employee</span><span className="text-white font-medium">{empName}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Month</span><span className="text-white font-mono">{month}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">System Net Salary</span><span className="font-mono text-slate-300">{fmt(sysNet)} THB</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Manual Net Salary</span><span className={`font-mono font-bold ${parseFloat(diff) > 0 ? 'text-emerald-400' : parseFloat(diff) < 0 ? 'text-rose-400' : 'text-white'}`}>{fmt(manNet)} THB</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Difference</span><span className={`font-mono font-bold ${diffColor(diff)}`}>{diffLabel(diff)} THB</span></div>
          {existing && <div className="flex justify-between"><span className="text-slate-400">Action</span><span className="text-amber-400 font-medium">Update Pending Payroll</span></div>}
          {!existing && <div className="flex justify-between"><span className="text-slate-400">Action</span><span className="text-emerald-400 font-medium">Create New Payroll</span></div>}
        </div>

        {notes && (
          <div className="mb-5 p-3 bg-white/5 rounded-xl text-xs text-slate-300 italic border border-white/10">
            "{notes}"
          </div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 py-3 bg-white/5 rounded-xl text-slate-300 text-sm font-medium hover:bg-white/10 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={loading}
            className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl text-white text-sm font-bold transition-colors">
            {loading ? 'Applying…' : '✅ Confirm Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PayrollWorkspace() {

  // Selection
  const [selectedEmp, setSelectedEmp]   = useState('');
  const [selectedMonth, setSelectedMonth] = useState(null);

  // State
  const [calcResult, setCalcResult]     = useState(null);     // { system, manual, diff, ... }
  const [overrides, setOverrides]       = useState({});
  const [notes, setNotes]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [loadingCalc, setLoadingCalc]   = useState(false);
  const [existingPayroll, setExistingPayroll] = useState(null); // null | { id, status }
  const [showConfirm, setShowConfirm]   = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);

  // Load employees list
  const { data: empData } = useQuery({
    queryKey: ['employees-for-workspace'],
    queryFn: () => api.get('/payroll').then(r => r.data.employees || []),
    staleTime: 60000,
  });
  const employees = empData || [];

  // Detect overridden fields for display
  const overriddenFields = Object.keys(overrides).filter(k => overrides[k] != null && overrides[k] !== '');

  // Handle input change for overrides
  const setOverride = (key, val) => {
    setOverrides(prev => {
      const next = { ...prev };
      if (val === '' || val == null) {
        delete next[key];
      } else {
        next[key] = val;
      }
      return next;
    });
  };

  const monthStr = selectedMonth
    ? `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, '0')}`
    : '';

  // Load Data
  const handleLoadData = async () => {
    if (!selectedEmp || !monthStr) {
      toast.error('Please select an employee and month first.');
      return;
    }
    setLoadingCalc(true);
    setCalcResult(null);
    setOverrides({});
    setNotes('');
    setExistingPayroll(null);
    try {
      // Workspace calculate (no overrides = pure system result)
      const r = await api.post('/payroll/workspace/calculate', {
        employee_id: selectedEmp,
        month: monthStr,
        overrides: {},
      });
      setCalcResult(r.data);

      // Check for existing payroll
      const pr = await api.get('/payroll');
      const allPayrolls = pr.data.payrolls || [];
      const found = allPayrolls.find(p => p.employee_id === selectedEmp && p.month === monthStr);
      setExistingPayroll(found ? { id: found.id, status: found.payment_status } : null);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load calculation data.');
    } finally {
      setLoadingCalc(false);
    }
  };

  // Recalculate with current overrides
  const handleRecalculate = async () => {
    if (!calcResult) return;
    setLoading(true);
    try {
      const cleanedOverrides = {};
      Object.entries(overrides).forEach(([k, v]) => {
        if (v !== '' && v != null) cleanedOverrides[k] = v;
      });

      const r = await api.post('/payroll/workspace/calculate', {
        employee_id: selectedEmp,
        month: monthStr,
        overrides: cleanedOverrides,
      });
      setCalcResult(r.data);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Recalculation failed.');
    } finally {
      setLoading(false);
    }
  };

  // Apply
  const handleApply = async () => {
    setApplyLoading(true);
    try {
      const cleanedOverrides = {};
      Object.entries(overrides).forEach(([k, v]) => {
        if (v !== '' && v != null) cleanedOverrides[k] = v;
      });

      const r = await api.post('/payroll/workspace/apply', {
        employee_id: selectedEmp,
        month: monthStr,
        overrides: cleanedOverrides,
        notes: notes.trim(),
      });
      toast.success(`✅ Payroll ${r.data.action === 'created' ? 'created' : 'updated'} successfully!`);
      setShowConfirm(false);
      // Refresh
      setExistingPayroll({ id: r.data.payroll_id, status: 'Pending' });
      setCalcResult(prev => prev ? { ...prev } : prev);
    } catch (e) {
      const err = e.response?.data;
      if (err?.code === 'PAYROLL_ALREADY_PAID') {
        toast.error('❌ This payroll is Paid and cannot be overwritten.');
      } else {
        toast.error(err?.error || 'Apply failed.');
      }
    } finally {
      setApplyLoading(false);
      setShowConfirm(false);
    }
  };

  const handleApplyClick = () => {
    if (!calcResult) return;
    if (overriddenFields.length > 0 && !notes.trim()) {
      toast.error('Please enter a reason/notes for the manual override.');
      return;
    }
    setShowConfirm(true);
  };

  const { system, manual, diff } = calcResult || {};
  const empName = employees.find(e => e.id === selectedEmp)?.Full_name || '—';

  return (
    <Layout
      title="Payroll Calculation Workspace"
      subtitle="Manual / what-if environment — changes are not saved until you Apply Calculation"
    >
      {/* ─── Selection Panel ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-surface-800 border border-white/10 p-5 mb-6">
        <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <span className="text-indigo-400"><Icon name="finance" size={17}/></span> Select Employee & Month
        </h2>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block">Employee</label>
            <select
              value={selectedEmp}
              onChange={e => { setSelectedEmp(e.target.value); setCalcResult(null); setExistingPayroll(null); }}
              className="form-input w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
            >
              <option value="">— Select Employee —</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.Full_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block">Month</label>
            <DatePicker
              selected={selectedMonth}
              onChange={d => { setSelectedMonth(d); setCalcResult(null); setExistingPayroll(null); }}
              dateFormat="yyyy-MM"
              showMonthYearPicker
              placeholderText="YYYY-MM"
              className="form-input bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white w-36"
            />
          </div>

          <button
            onClick={handleLoadData}
            disabled={loadingCalc || !selectedEmp || !monthStr}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl text-white text-sm font-bold transition-colors whitespace-nowrap"
          >
            {loadingCalc ? '⏳ Loading…' : '📥 Load Data'}
          </button>
        </div>

        {/* Existing payroll warning */}
        {existingPayroll && (
          <div className={`mt-4 p-3 rounded-xl text-xs font-medium border flex items-center gap-2 ${
            existingPayroll.status === 'Paid'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          }`}>
            {existingPayroll.status === 'Paid' ? (
              <><span><Icon name="lock" size={17}/></span> <span><strong>Paid payroll exists</strong> for this employee and month. Workspace Apply is <strong>disabled</strong> — Paid records cannot be overwritten.</span></>
            ) : (
              <><span><Icon name="warning" size={17}/></span> <span>A <strong>Pending</strong> payroll record already exists. Applying will <strong>update</strong> the existing record (not create a duplicate).</span></>
            )}
          </div>
        )}
      </div>

      {calcResult && (
        <>
          {/* ─── Two-column: Overrides | System Values ───────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">

            {/* Manual Overrides */}
            <div className="rounded-2xl bg-surface-800 border border-white/10 p-5">
              <h2 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                <span className="text-amber-400"><Icon name="documents" size={17}/></span> Manual Overrides
              </h2>
              <p className="text-xs text-slate-500 mb-4">Leave blank to use system value. Overrides are applied to inputs — net salary is always recalculated server-side.</p>

              <div className="space-y-3">
                {/* Working Days */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Working Days <span className="text-slate-500 normal-case font-normal">(system: {system?.working_days})</span></label>
                  <input type="number" min="1" max="365" step="1"
                    value={overrides.working_days ?? ''}
                    onChange={e => setOverride('working_days', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder={String(system?.working_days ?? 26)}
                    className="form-input w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white" />
                </div>
                {/* Basic Salary */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Basic Salary (THB) <span className="text-slate-500 normal-case font-normal">(system: {fmt(system?.basic_salary)})</span></label>
                  <input type="number" min="0" step="0.01"
                    value={overrides.basic_salary ?? ''}
                    onChange={e => setOverride('basic_salary', e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder={String(system?.basic_salary ?? '')}
                    className="form-input w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white" />
                </div>
                {/* Unpaid Leave Days */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Unpaid Leave Days <span className="text-slate-500 normal-case font-normal">(system: {system?.unpaid_leave_days})</span></label>
                  <input type="number" min="0" step="0.5"
                    value={overrides.unpaid_leave_days ?? ''}
                    onChange={e => setOverride('unpaid_leave_days', e.target.value === '' ? null : Number(e.target.value))}
                    placeholder={String(system?.unpaid_leave_days ?? 0)}
                    className="form-input w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white" />
                </div>
                {/* Allowances */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Allowances (THB) <span className="text-slate-500 normal-case font-normal">(system: 0.00)</span></label>
                  <input type="number" min="0" step="0.01"
                    value={overrides.allowances ?? ''}
                    onChange={e => setOverride('allowances', e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="0.00"
                    className="form-input w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white" />
                </div>
                {/* Extra Deductions */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Extra Deductions (THB) <span className="text-slate-500 normal-case font-normal">(system: 0.00)</span></label>
                  <input type="number" min="0" step="0.01"
                    value={overrides.deductions ?? ''}
                    onChange={e => setOverride('deductions', e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="0.00"
                    className="form-input w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white" />
                </div>
                {/* Final KPI Override */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-2">
                    Final KPI Override (%) <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold">Manual</span>
                    <span className="text-slate-500 normal-case font-normal">(auto: {fmt(system?.effective_kpi)}%)</span>
                  </label>
                  <input type="number" min="0" max="200" step="0.01"
                    value={overrides.kpi_override ?? ''}
                    onChange={e => setOverride('kpi_override', e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="Leave blank to use auto KPI"
                    className="form-input w-full bg-white/5 border border-amber-500/20 rounded-xl px-3 py-2 text-sm text-white" />
                  <p className="text-xs text-slate-500 mt-1">Overrides auto-calculated KPI. Does NOT change component scores (attendance, SOP, peer).</p>
                </div>

                {/* Read-only scores */}
                <div className="mt-3 pt-3 border-t border-white/10">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">Read-only — System Calculated Scores</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['Attendance', system?.attendance_score],
                      ['Punctuality', system?.punctuality_score],
                      ['SOP', system?.sop_score],
                      ['Peer', system?.peer_score],
                    ].map(([label, val]) => (
                      <div key={label} className="bg-white/5 rounded-lg px-3 py-2 flex justify-between items-center">
                        <span className="text-xs text-slate-400">{label}</span>
                        <span className="text-xs font-mono text-slate-300 font-bold">{fmt(val)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={handleRecalculate}
                disabled={loading}
                className="mt-5 w-full py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
              >
                {loading ? '⏳ Recalculating…' : '🔄 Recalculate'}
              </button>
            </div>

            {/* System Calculation Summary */}
            <div className="rounded-2xl bg-surface-800 border border-white/10 p-5">
              <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-slate-400">🖥️</span> System Calculation
              </h2>
              <div className="space-y-2.5 text-sm">
                {[
                  ['Basic Salary', system?.basic_salary, true],
                  ['Working Days', system?.working_days, false],
                  ['Daily Rate', system?.daily_rate, true],
                  ['Attendance Score', `${fmt(system?.attendance_score)}%`, false],
                  ['Punctuality Score', `${fmt(system?.punctuality_score)}%`, false],
                  ['SOP Score', `${fmt(system?.sop_score)}%`, false],
                  ['Peer Score', `${fmt(system?.peer_score)}%`, false],
                  ['Auto KPI', `${fmt(system?.effective_kpi)}%`, false],
                  ['Unpaid Leave Days', system?.unpaid_leave_days, false],
                  ['Unpaid Leave Deduction', system?.unpaid_leave_deduction, true],
                  ['Allowances', system?.allowances, true],
                  ['Extra Deductions', system?.extra_deductions, true],
                  ['Total Deductions', system?.total_deductions, true],
                  ['Bonus', system?.bonus, true],
                ].map(([label, val, isCurrency]) => (
                  <div key={label} className="flex justify-between items-center py-1 border-b border-white/5">
                    <span className="text-slate-400 text-xs">{label}</span>
                    <span className="font-mono text-xs text-slate-300">{isCurrency ? `${fmt(val)} THB` : val}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center py-2 mt-1 bg-indigo-500/10 rounded-xl px-3 border border-indigo-500/20">
                  <span className="text-indigo-300 font-bold text-sm">Net Salary</span>
                  <span className="font-mono text-indigo-200 font-bold text-base">{fmt(system?.net_salary)} THB</span>
                </div>
              </div>
            </div>
          </div>

          {/* ─── Comparison Table ─────────────────────────────────────────────── */}
          <div className="rounded-2xl bg-surface-800 border border-white/10 mb-6 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/5 bg-white/5 flex items-center gap-2">
              <span className="text-sm font-bold text-white"><Icon name="trend" size={17}/> System vs Manual Comparison</span>
              {overriddenFields.length > 0 && (
                <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-bold">
                  {overriddenFields.length} override{overriddenFields.length > 1 ? 's' : ''} active
                </span>
              )}
            </div>

            {/* Header */}
            <div className="flex items-center px-4 py-2 border-b border-white/10 bg-white/5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <div className="w-[40%]">Field</div>
              <div className="w-[20%] text-right">System</div>
              <div className="w-[20%] text-right">Manual</div>
              <div className="w-[20%] text-right">Difference</div>
            </div>

            {[
              { label: 'Basic Salary', sk: 'basic_salary', mk: 'basic_salary', dk: 'basic_salary', currency: true },
              { label: 'Working Days', sk: 'working_days', mk: 'working_days', dk: 'working_days', currency: false },
              { label: 'Daily Rate', sk: 'daily_rate', mk: 'daily_rate', dk: 'daily_rate', currency: true },
              { label: 'Attendance Score (%)', sk: 'attendance_score', mk: 'attendance_score', dk: 'attendance_score', currency: false },
              { label: 'Punctuality Score (%)', sk: 'punctuality_score', mk: 'punctuality_score', dk: 'punctuality_score', currency: false },
              { label: 'SOP Score (%)', sk: 'sop_score', mk: 'sop_score', dk: 'sop_score', currency: false },
              { label: 'Peer Score (%)', sk: 'peer_score', mk: 'peer_score', dk: 'peer_score', currency: false },
              { label: 'Effective KPI (%)', sk: 'effective_kpi', mk: 'effective_kpi', dk: 'effective_kpi', currency: false },
              { label: 'Unpaid Leave Days', sk: 'unpaid_leave_days', mk: 'unpaid_leave_days', dk: 'unpaid_leave_days', currency: false },
              { label: 'Unpaid Leave Deduction', sk: 'unpaid_leave_deduction', mk: 'unpaid_leave_deduction', dk: 'unpaid_leave_deduction', currency: true },
              { label: 'Allowances', sk: 'allowances', mk: 'allowances', dk: 'allowances', currency: true },
              { label: 'Extra Deductions', sk: 'extra_deductions', mk: 'extra_deductions', dk: 'extra_deductions', currency: true },
              { label: 'Total Deductions', sk: 'total_deductions', mk: 'total_deductions', dk: 'total_deductions', currency: true },
              { label: 'Bonus', sk: 'bonus', mk: 'bonus', dk: 'bonus', currency: true },
            ].map(row => (
              <CompRow
                key={row.sk}
                label={row.label}
                sysVal={system?.[row.sk]}
                manVal={manual?.[row.mk]}
                diffVal={diff?.[row.dk]}
                isOverridden={
                  (row.sk === 'basic_salary' && overrides.basic_salary != null) ||
                  (row.sk === 'working_days' && overrides.working_days != null) ||
                  (row.sk === 'daily_rate' && (overrides.basic_salary != null || overrides.working_days != null)) ||
                  (row.sk === 'effective_kpi' && overrides.kpi_override != null) ||
                  (row.sk === 'unpaid_leave_days' && overrides.unpaid_leave_days != null) ||
                  (row.sk === 'unpaid_leave_deduction' && (overrides.unpaid_leave_days != null || overrides.basic_salary != null || overrides.working_days != null)) ||
                  (row.sk === 'allowances' && overrides.allowances != null) ||
                  (row.sk === 'extra_deductions' && overrides.deductions != null) ||
                  (row.sk === 'total_deductions' && (overrides.deductions != null || overrides.unpaid_leave_days != null)) ||
                  (row.sk === 'bonus' && (overrides.kpi_override != null || overrides.basic_salary != null))
                }
                isCurrency={row.currency}
                isHighlighted={false}
              />
            ))}

            {/* Net Salary — highlighted row */}
            <div className="flex items-center px-4 py-3.5 bg-indigo-500/10 border-t-2 border-indigo-500/30">
              <div className="w-[40%] text-white font-bold text-sm flex items-center gap-2">
                Net Salary ★
                {overriddenFields.length > 0 && (
                  <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold">Manual Override</span>
                )}
              </div>
              <div className="w-[20%] text-right font-mono text-slate-400 text-sm">{fmt(system?.net_salary)} THB</div>
              <div className="w-[20%] text-right font-mono text-indigo-200 font-bold text-base">{fmt(manual?.net_salary)} THB</div>
              <div className={`w-[20%] text-right font-mono font-bold text-sm ${diffColor(diff?.net_salary)}`}>
                {diffLabel(diff?.net_salary) !== '—' ? `${diffLabel(diff?.net_salary)} THB` : '—'}
              </div>
            </div>
          </div>

          {/* ─── Notes + Actions ──────────────────────────────────────────────── */}
          <div className="rounded-2xl bg-surface-800 border border-white/10 p-5 mb-6">
            <h2 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
              <span><Icon name="edit" size={17}/></span> Notes / Reason for Adjustment
              {overriddenFields.length > 0 && (
                <span className="text-xs text-rose-400 font-normal">(Required when overrides are active)</span>
              )}
            </h2>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Manual correction approved by HR Manager — employee worked during leave period."
              className="form-input w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white mt-2 resize-none"
            />

            {/* Actions */}
            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={() => { setCalcResult(null); setOverrides({}); setNotes(''); setExistingPayroll(null); }}
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-slate-300 text-sm font-medium transition-colors"
              >
                Cancel / Reset
              </button>

              <button
                type="button"
                onClick={handleApplyClick}
                disabled={existingPayroll?.status === 'Paid'}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-white text-sm font-bold transition-colors"
              >
                {existingPayroll?.status === 'Paid'
                  ? '🔒 Cannot Apply — Payroll is Paid'
                  : '✅ Apply Calculation → Official Payroll'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {!calcResult && !loadingCalc && (
        <div className="rounded-2xl bg-surface-800 border border-white/10 p-16 text-center">
          <p className="text-4xl mb-4"><Icon name="finance" size={17}/></p>
          <p className="text-white font-bold text-lg mb-2">Payroll Calculation Workspace</p>
          <p className="text-slate-400 text-sm max-w-sm mx-auto">
            Select an employee and month above, then click <strong>Load Data</strong> to begin.
            The workspace will show the system calculation and let you apply manual adjustments.
          </p>
          <p className="text-xs text-slate-600 mt-4">No changes are saved until you click "Apply Calculation"</p>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirm && calcResult && (
        <ConfirmDialog
          empName={empName}
          month={monthStr}
          sysNet={system?.net_salary}
          manNet={manual?.net_salary}
          diff={diff?.net_salary}
          notes={notes}
          existing={existingPayroll}
          onConfirm={handleApply}
          onCancel={() => setShowConfirm(false)}
          loading={applyLoading}
        />
      )}
    </Layout>
  );
}
