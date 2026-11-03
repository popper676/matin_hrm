import {calculateBonus,calculateNetSalary} from '../../../../shared/payrollCalculationEngine.js';
import useCreateIntent from '../../hooks/useCreateIntent';
import Icon from '../../components/common/Icon';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { utils, writeFile } from 'xlsx';
import { useLanguage } from '../../context/LanguageContext';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

export default function Payroll() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  useCreateIntent(setShowModal);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [calcData, setCalcData] = useState(null);
  const [recordMonth, setRecordMonth] = useState(new Date());

  // Settings state
  const [kpiSettings, setKpiSettings] = useState({
    target_bonus_percentage: 15,
    auto_weights: { attendance: 40, punctuality: 0, sops: 40, peer_voting: 20 },
    manual_metrics: []
  });
  // Phase 2: Payroll Policy state
  const [payrollPolicy, setPayrollPolicy] = useState(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyError, setPayrollPolicyError] = useState('');

  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['payroll'], queryFn: () => api.get('/payroll').then(r => r.data) });

  const addMutation = useMutation({
    mutationFn: (body) => api.post('/payroll', body),
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['payroll']});
      setShowModal(false);
      setCalcData(null);
      toast.success(t('hrm.payroll.toast.saved') || 'Payroll record saved');
    },
  });

  const calcMutation = useMutation({
    mutationFn: ({ employee_id, month, working_days }) => api.get(`/payroll-engine/calculate/${employee_id}/${month}?working_days=${working_days}`).then(r => r.data),
    onSuccess: (data) => {
      setCalcData(data);
      const form = document.getElementById('payslip-form');
      if (form) {
        form.basic_salary.value = data.base_salary;
        recalculateFinal(data, form);
      }
    },
    onError: (err) => toast.error(err.response?.data?.error || t('hrm.payroll.toast.calcError') || 'Failed to calculate')
  });

  const settingsMutation = useMutation({
    mutationFn: (body) => api.post('/payroll-engine/settings', body),
    onSuccess: () => {
      setShowSettingsModal(false);
      toast.success(t('hrm.payroll.toast.settingsSaved') || 'KPI Settings saved');
    }
  });

  // Load settings
  useEffect(() => {
    api.get('/payroll-engine/settings').then(r => setKpiSettings(r.data)).catch(console.error);
    // Phase 2: load payroll policy
    api.get('/payroll-policy').then(r => setPayrollPolicy(r.data.policy)).catch(console.error);
  }, []);

  const handleSave = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd);
    recalculateFinal(calcData,e.target);
    if (calcData) {
        // Find manual metric inputs
        let manualContribution = 0;
        document.querySelectorAll('.manual-kpi-input').forEach(input => {
            const weight = parseFloat(input.getAttribute('data-weight') || 0);
            const score = parseFloat(input.value || 0);
            manualContribution += (score * (weight / 100));
        });
        body.final_kpi_score = (calcData.auto_kpi_contribution + manualContribution).toFixed(2);
    }
    if(calcData){body.bonus=e.target.bonus.value;body.deductions=e.target.deductions.value;body.net_salary=e.target.net_salary.value;}
    addMutation.mutate(body);
  };

  const deletePayroll = useMutation({
    mutationFn: (id) => api.delete(`/payroll/${id}`),
    onSuccess: () => qc.invalidateQueries({queryKey:['payroll']})
  });

  const deleteKpi = useMutation({
    mutationFn: (id) => api.delete(`/payroll/kpi/${id}`),
    onSuccess: () => qc.invalidateQueries({queryKey:['payroll']})
  });

  const recalculateFinal = (data = calcData, form = document.getElementById('payslip-form')) => {
    if (!data || !form) return;

    let manualContribution = 0;
    document.querySelectorAll('.manual-kpi-input').forEach(input => {
        const weight = parseFloat(input.getAttribute('data-weight') || 0);
        const score = parseFloat(input.value || 0);
        manualContribution += (score * (weight / 100));
    });

    const finalKpi = data.auto_kpi_contribution + manualContribution;
    const finalEl = document.getElementById('breakdown_final');
    if (finalEl) finalEl.textContent = `${finalKpi.toFixed(2)}%`;

    const baseSalary = Number(form.basic_salary.value===''?data.base_salary:form.basic_salary.value);
    const kpiLinkedPct = data.target_bonus_percentage ?? 15;
    const kpiLinkedAmount = baseSalary * (kpiLinkedPct / 100);

    const deductions=Number(data.unpaid_leave_deduction||0);
    const bonuses=calculateBonus(baseSalary,kpiLinkedPct,finalKpi);
    form.deductions.value = deductions.toFixed(2);
    form.bonus.value = bonuses.toFixed(2);

    // Update net salary
    const a = parseFloat(form.allowances.value || 0);
    form.net_salary.value = calculateNetSalary(baseSalary,a,bonuses,deductions).toFixed(2);

    const targetEl = document.getElementById('target_bonus_display');
    if (targetEl) {
        targetEl.innerHTML = `
            <div class="flex justify-between items-center text-xs text-slate-400">
                <span>KPI-Linked Portion (${kpiLinkedPct}%)</span>
                <span>${kpiLinkedAmount.toFixed(2)} THB</span>
            </div>
            ${data.unpaid_leave_deduction > 0 ? `<div class="flex justify-between items-center text-xs text-rose-400"><span>Unpaid Leave Deduction (${data.unpaid_leave_days} days)</span><span>-${data.unpaid_leave_deduction.toFixed(2)} THB</span></div>` : ''}
            ${deductions > (data.unpaid_leave_deduction || 0) ? `<div class="flex justify-between items-center text-xs text-rose-400"><span>Missed KPI Deduction</span><span>-${(deductions - (data.unpaid_leave_deduction || 0)).toFixed(2)} THB</span></div>` : ''}
            ${bonuses > 0 ? `<div class="flex justify-between items-center text-xs text-cyan-400"><span>KPI Bonus</span><span>+${bonuses.toFixed(2)} THB</span></div>` : ''}
        `;
    }
  };

  useEffect(()=>{if(calcData)recalculateFinal(calcData);});

  const handleSettingsSave = (e) => {
    e.preventDefault();
    const metrics = [];
    document.querySelectorAll('.manual-metric-row').forEach(row => {
      const name = row.querySelector('.m-name').value;
      const weight = parseFloat(row.querySelector('.m-weight').value || 0);
      if (name && weight > 0) metrics.push({ name, weight });
    });
    const s = {
      target_bonus_percentage: parseFloat(document.getElementById('set_bonus').value || 15),
      auto_weights: {
        attendance: parseFloat(document.getElementById('set_att').value || 0),
        punctuality: parseFloat(document.getElementById('set_punct').value || 0),
        sops: parseFloat(document.getElementById('set_sops').value || 0),
        peer_voting: parseFloat(document.getElementById('set_peer').value || 0)
      },
      manual_metrics: metrics
    };
    settingsMutation.mutate(s);
  };

  const handlePolicySave = async () => {
    if (!payrollPolicy) return;
    const WEEKDAYS = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
    // Collect selected holidays from checkboxes
    const selectedHolidays = WEEKDAYS.filter(d =>
      document.getElementById(`holiday_${d}`)?.checked
    );
    const divisor = parseInt(document.getElementById('policy_divisor')?.value || 26);
    const peerMax = parseInt(document.getElementById('policy_peer_max')?.value || 5);
    const defaultSop = parseFloat(document.getElementById('policy_default_sop')?.value || 100);
    const defaultPeer = parseFloat(document.getElementById('policy_default_peer')?.value || 100);
    const timezone = document.getElementById('policy_timezone')?.value || 'Asia/Bangkok';
    const apLeave = document.getElementById('policy_approved_leave')?.checked;

    if (divisor <= 0 || divisor > 365) { toast.error('Salary divisor must be between 1 and 365'); return; }
    if (peerMax <= 0) { toast.error('Peer score max stars must be > 0'); return; }
    if (defaultSop < 0 || defaultSop > 100) { toast.error('Default SOP score must be 0–100'); return; }
    if (defaultPeer < 0 || defaultPeer > 100) { toast.error('Default Peer score must be 0–100'); return; }
    if (selectedHolidays.length === 7) { toast.error('Cannot mark all days as holidays'); return; }

    setPolicyLoading(true);
    setPayrollPolicyError('');
    try {
      const r = await api.put('/payroll-policy', {
        salary_divisor: divisor,
        weekly_holidays: selectedHolidays,
        timezone,
        approved_leave_counts_as_punctual: apLeave,
        peer_score_max_stars: peerMax,
        default_sop_score: defaultSop,
        default_peer_score: defaultPeer,
      });
      setPayrollPolicy(r.data.policy);
      toast.success('Payroll policy saved!');
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to save policy';
      setPayrollPolicyError(msg);
      toast.error('Policy save failed. Check values.');
    } finally {
      setPolicyLoading(false);
    }
  };

  const addManualMetricRow = () => {
    setKpiSettings(prev => ({
      ...prev,
      manual_metrics: [...prev.manual_metrics, { name: '', weight: 10 }]
    }));
  };

  const payrolls = data?.payrolls || [];
  const kpis = data?.kpis || [];
  const employees = data?.employees || [];
  const totalPaid = data?.total_paid || 0;

  const exportToExcel = () => {
    if (!payrolls || payrolls.length === 0) return toast.error(t('hrm.payroll.toast.noExport') || 'No data to export');

    const exportData = payrolls.map(p => ({
      'Employee Name': p.employee_name,
      'Employee Code': p.employee_code,
      'Month': p.month,
      'Basic Salary': parseFloat(p.basic_salary),
      'Allowances': parseFloat(p.allowances),
      'Deductions': parseFloat(p.deductions),
      'Bonus': parseFloat(p.bonus),
      'Net Salary': parseFloat(p.net_salary),
      'KPI Score': p.kpi_score,
      'Payment Status': p.payment_status
    }));

    const ws = utils.json_to_sheet(exportData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Payroll");

    writeFile(wb, `Payroll_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <Layout title={t('hrm.payroll.title')} subtitle={t('hrm.payroll.subtitle')}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
        <div className="payroll-card rounded-2xl p-5 bg-surface-800 border border-emerald-500/20">
          <p className="payroll-card-title text-emerald-100 text-xs mb-1">{t('hrm.payroll.totalPaid')}</p>
          <p className="payroll-card-value text-3xl font-black text-white">{totalPaid.toLocaleString()} THB</p>
        </div>
        <div className="md:col-span-2 flex items-center justify-end gap-3 flex-wrap">
          <button onClick={() => navigate('/payroll/workspace')} className="payroll-btn-workspace px-4 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-sm font-semibold rounded-xl shadow-lg transition-colors flex items-center gap-2">
            <span><Icon name="finance" size={17}/></span> Open Calculation Workspace
          </button>
          <button onClick={exportToExcel} className="payroll-btn-export px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl shadow-lg transition-colors flex items-center gap-2">
            <span><Icon name="trend" size={17}/></span> {t('hrm.payroll.exportBtn')}
          </button>
          <button onClick={() => setShowModal(true)} className="payroll-btn-primary px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-lg transition-colors">
            {t('hrm.payroll.addBtn')}
          </button>
          <button onClick={() => setShowSettingsModal(true)} className="payroll-btn-secondary px-4 py-2.5 bg-surface-800 hover:bg-surface-900 border border-white/10 text-white text-sm font-semibold rounded-xl shadow-lg transition-colors">
            {t('hrm.payroll.settingsBtn')}
          </button>
        </div>
      </div>

      <div className="payroll-section rounded-2xl overflow-hidden mb-6 bg-surface-800 border border-white/5">
        <div className="payroll-section-header px-5 py-3 border-b border-white/5 bg-surface-850">
            <h2 className="payroll-section-title text-sm font-bold text-white">{t('hrm.payroll.records.title')}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="payroll-th-row bg-surface-850">
              <tr>{[t('hrm.payroll.records.cols.emp'), t('hrm.payroll.records.cols.month'), t('hrm.payroll.records.cols.basic'), t('hrm.payroll.records.cols.allowances'), t('hrm.payroll.records.cols.deductions'), t('hrm.payroll.records.cols.bonus'), t('hrm.payroll.records.cols.net'), t('hrm.payroll.records.cols.kpi'), t('hrm.payroll.records.cols.status'), t('hrm.payroll.records.cols.action')].map(h => <th key={h} className="payroll-th py-3 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>)}</tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan="10" className="py-10 text-center"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin inline-block" /></td></tr>
              : payrolls.map(p => (
                <tr key={p.id} className="payroll-tr border-t border-white/5 hover:bg-white/5">
                  <td className="py-3.5 px-5">
                    <p className="payroll-td-name text-white text-sm font-medium">{p.employee_name}</p>
                    <p className="payroll-td-code text-slate-400 text-xs font-mono">{p.employee_code}</p>
                  </td>
                  <td className="payroll-td-text py-3.5 px-5 text-slate-300">{p.month}</td>
                  <td className="payroll-td-text py-3.5 px-5 text-slate-300 font-mono">{parseFloat(p.basic_salary).toLocaleString()}</td>
                  <td className="payroll-td-allowance py-3.5 px-5 text-emerald-400 font-mono">+{parseFloat(p.allowances).toLocaleString()}</td>
                  <td className="payroll-td-deduction py-3.5 px-5 text-rose-400 font-mono">-{parseFloat(p.deductions).toLocaleString()}</td>
                  <td className="payroll-td-bonus py-3.5 px-5 text-cyan-400 font-mono">+{parseFloat(p.bonus).toLocaleString()}</td>
                  <td className="payroll-td-net py-3.5 px-5 text-white font-bold font-mono">{parseFloat(p.net_salary).toLocaleString()}</td>
                  <td className="payroll-td-score py-3.5 px-5 font-mono text-amber-400">{p.kpi_score}</td>
                  <td className="py-3.5 px-5">
                    <span className={`payroll-badge ${p.payment_status === 'Paid' ? 'payroll-badge-paid bg-emerald-500/20 text-emerald-400' : 'payroll-badge-pending bg-amber-500/20 text-amber-400'} px-2 py-1 rounded-full text-xs font-bold`}>
                      {p.payment_status === 'Paid' ? t('hrm.payroll.records.paid') : t('hrm.payroll.records.pending')}
                    </span>
                  </td>
                  <td className="py-3.5 px-5">
                    <button onClick={() => deletePayroll.mutate(p.id)} className="payroll-btn-delete text-rose-400 bg-rose-400/10 hover:bg-rose-400/20 px-2.5 py-1 rounded-lg text-xs font-medium">{t('hrm.payroll.records.delete')}</button>
                  </td>
                </tr>
              ))}
              {payrolls.length === 0 && !isLoading && <tr><td colSpan="10" className="payroll-empty py-12 text-center text-slate-500 text-sm">{t('hrm.payroll.records.empty')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="payroll-section rounded-2xl overflow-hidden bg-surface-800 border border-white/5">
        <div className="payroll-section-header px-5 py-3 border-b border-white/5 bg-surface-850">
            <h2 className="payroll-section-title text-sm font-bold text-white">{t('hrm.payroll.kpi.title')}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="payroll-th-row bg-surface-850">
              <tr>{[t('hrm.payroll.kpi.cols.emp'), t('hrm.payroll.kpi.cols.period'), t('hrm.payroll.kpi.cols.target'), t('hrm.payroll.kpi.cols.actual'), t('hrm.payroll.kpi.cols.score'), t('hrm.payroll.kpi.cols.comment'), t('hrm.payroll.kpi.cols.reviewedAt'), t('hrm.payroll.kpi.cols.action')].map(h => <th key={h} className="payroll-th py-3 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>)}</tr>
            </thead>
            <tbody>
              {kpis.map(k => {
                  const pct = Math.round((parseFloat(k.actual_score) / parseFloat(k.target_score || 100)) * 100);
                  const color = pct >= 80 ? 'emerald' : pct >= 50 ? 'amber' : 'rose';
                  return (
                    <tr key={k.id} className="payroll-tr border-t border-white/5 hover:bg-white/5">
                      <td className="payroll-td-name py-3.5 px-5 font-medium text-white">{k.Full_name}</td>
                      <td className="payroll-td-text py-3.5 px-5 text-slate-300">{k.recent_period}</td>
                      <td className="payroll-td-text py-3.5 px-5 font-mono text-slate-300">{k.target_score}</td>
                      <td className={`payroll-kpi-actual payroll-kpi-actual-${color} py-3.5 px-5 font-mono text-${color}-400`}>{k.actual_score}</td>
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2">
                          <div className="payroll-progress-bg w-16 h-1.5 bg-white/10 rounded-full overflow-hidden"><div className={`payroll-progress-fill-${color} h-full rounded-full bg-${color}-500`} style={{width: `${pct}%`}}></div></div>
                          <span className={`payroll-progress-text-${color} text-xs font-bold text-${color}-400`}>{pct}%</span>
                        </div>
                      </td>
                      <td className="payroll-td-text py-3.5 px-5 text-xs text-slate-400 max-w-[200px] truncate">{k.review_comment}</td>
                      <td className="payroll-td-text py-3.5 px-5 text-xs text-slate-500">{k.created_at ? new Date(k.created_at).toLocaleDateString() : '—'}</td>
                      <td className="py-3.5 px-5">
                        <button onClick={() => deleteKpi.mutate(k.id)} className="payroll-btn-delete text-rose-400 bg-rose-400/10 hover:bg-rose-400/20 px-2.5 py-1 rounded-lg text-xs font-medium">{t('hrm.payroll.records.delete')}</button>
                      </td>
                    </tr>
                  );
              })}
              {kpis.length === 0 && !isLoading && <tr><td colSpan="8" className="payroll-empty py-12 text-center text-slate-500 text-sm">{t('hrm.payroll.kpi.empty')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="payroll-modal-overlay absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSettingsModal(false)} />
          <div className="payroll-modal-content relative rounded-2xl w-full max-w-2xl bg-surface-850 border border-white/10 p-6 max-h-[90vh] overflow-y-auto">
             <h2 className="payroll-modal-title text-xl font-bold text-white mb-6">{t('hrm.payroll.settingsModal.title')}</h2>
             <form onSubmit={handleSettingsSave} className="space-y-6">
                <div>
                    <h3 className="payroll-modal-section-title text-base font-bold text-white mb-2">{t('hrm.payroll.settingsModal.salaryPctTitle')}</h3>
                    <p className="payroll-modal-subtitle text-sm text-slate-400 mb-4">{t('hrm.payroll.settingsModal.salaryPctDesc')}</p>
                    <div className="flex items-center gap-4">
                        <input type="number" id="set_bonus" defaultValue={kpiSettings.target_bonus_percentage} className="form-input payroll-input w-32 text-right" />
                        <span className="payroll-modal-subtitle text-slate-400">%</span>
                    </div>
                </div>
                <div>
                    <h3 className="payroll-modal-section-title text-base font-bold text-white mb-2 border-b border-white/5 pb-3">{t('hrm.payroll.settingsModal.autoWeights')}</h3>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                        <div><label className="payroll-label text-xs font-bold text-slate-400 uppercase mb-1 block">{t('hrm.payroll.settingsModal.att')}</label><input id="set_att" type="number" defaultValue={kpiSettings.auto_weights.attendance} className="form-input payroll-input" /></div>
                        <div><label className="payroll-label text-xs font-bold text-slate-400 uppercase mb-1 block">{t('hrm.payroll.settingsModal.punct')}</label><input id="set_punct" type="number" defaultValue={kpiSettings.auto_weights.punctuality} className="form-input payroll-input" /></div>
                        <div><label className="payroll-label text-xs font-bold text-slate-400 uppercase mb-1 block">{t('hrm.payroll.settingsModal.sops')}</label><input id="set_sops" type="number" defaultValue={kpiSettings.auto_weights.sops} className="form-input payroll-input" /></div>
                        <div><label className="payroll-label text-xs font-bold text-slate-400 uppercase mb-1 block">{t('hrm.payroll.settingsModal.peer')}</label><input id="set_peer" type="number" defaultValue={kpiSettings.auto_weights.peer_voting} className="form-input payroll-input" /></div>
                    </div>
                </div>
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="payroll-modal-section-title text-base font-bold text-white">{t('hrm.payroll.settingsModal.manualTitle')}</h3>
                        <button type="button" onClick={addManualMetricRow} className="payroll-btn-add text-sm text-indigo-400 font-bold">{t('hrm.payroll.settingsModal.addMetric')}</button>
                    </div>
                    <div className="space-y-3">
                        {kpiSettings.manual_metrics.map((m, i) => (
                            <div key={i} className="flex gap-3 manual-metric-row">
                                <input type="text" defaultValue={m.name} className="form-input payroll-input flex-1 m-name" placeholder={t('hrm.payroll.settingsModal.metricName')} />
                                <input type="number" defaultValue={m.weight} className="form-input payroll-input w-24 m-weight" />
                                <button aria-label="close" type="button" onClick={(e) => e.target.parentElement.remove()} className="payroll-btn-delete text-rose-400 px-2"><Icon name="close" size={17}/></button>
                            </div>
                        ))}
                    </div>
                </div>
                {/* ─── Phase 2: Payroll Policy Configuration ─── */}
                {payrollPolicy && (
                  <div className="border-t border-white/10 pt-6">
                    <h3 className="payroll-modal-section-title text-base font-bold text-white mb-1 flex items-center gap-2">
                      <span><Icon name="departments" size={17}/></span> Payroll Policy Configuration
                    </h3>
                    <p className="text-xs text-slate-400 mb-4">Company-level payroll rules. Changes affect all future payroll calculations.</p>

                    {policyError && (
                      <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs whitespace-pre-wrap">{policyError}</div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      {/* Salary Divisor */}
                      <div>
                        <label className="payroll-label text-xs font-bold text-slate-400 uppercase mb-1 block">Salary Divisor</label>
                        <input id="policy_divisor" type="number" min="1" max="365" defaultValue={payrollPolicy.salary_divisor}
                          className="form-input payroll-input" />
                        <p className="text-xs text-slate-500 mt-1">Default: 26 (Mon–Sat). Days in month for daily rate.</p>
                      </div>

                      {/* Peer Score Max Stars */}
                      <div>
                        <label className="payroll-label text-xs font-bold text-slate-400 uppercase mb-1 block">Peer Score Max Stars</label>
                        <input id="policy_peer_max" type="number" min="1" max="100" defaultValue={payrollPolicy.peer_score_max_stars}
                          className="form-input payroll-input" />
                        <p className="text-xs text-slate-500 mt-1">Default: 5 stars = 100% score</p>
                      </div>

                      {/* Default SOP Score */}
                      <div>
                        <label className="payroll-label text-xs font-bold text-slate-400 uppercase mb-1 block">Default SOP Score (no data)</label>
                        <input id="policy_default_sop" type="number" min="0" max="100" step="0.01" defaultValue={payrollPolicy.default_sop_score}
                          className="form-input payroll-input" />
                        <p className="text-xs text-slate-500 mt-1">Score given when no SOPs assigned</p>
                      </div>

                      {/* Default Peer Score */}
                      <div>
                        <label className="payroll-label text-xs font-bold text-slate-400 uppercase mb-1 block">Default Peer Score (no votes)</label>
                        <input id="policy_default_peer" type="number" min="0" max="100" step="0.01" defaultValue={payrollPolicy.default_peer_score}
                          className="form-input payroll-input" />
                        <p className="text-xs text-slate-500 mt-1">Score given when no peer votes received</p>
                      </div>
                    </div>

                    {/* Timezone */}
                    <div className="mt-4">
                      <label className="payroll-label text-xs font-bold text-slate-400 uppercase mb-1 block">Timezone</label>
                      <input id="policy_timezone" type="text" defaultValue={payrollPolicy.timezone}
                        className="form-input payroll-input w-full" placeholder="Asia/Bangkok" />
                      <p className="text-xs text-slate-500 mt-1">IANA timezone string (e.g. Asia/Bangkok)</p>
                    </div>

                    {/* Weekly Holidays */}
                    <div className="mt-4">
                      <label className="payroll-label text-xs font-bold text-slate-400 uppercase mb-2 block">Weekly Holidays (non-working days)</label>
                      <div className="flex flex-wrap gap-3">
                        {['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'].map(day => (
                          <label key={day} className="flex items-center gap-2 cursor-pointer">
                            <input id={`holiday_${day}`} type="checkbox"
                              defaultChecked={(payrollPolicy.weekly_holidays || ['SUNDAY']).map(h=>h.toUpperCase()).includes(day)}
                              className="w-4 h-4 accent-indigo-500" />
                            <span className="text-xs text-slate-300 font-medium">{day.charAt(0)+day.slice(1).toLowerCase()}</span>
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-slate-500 mt-2">Default: Sunday only. Checked = holiday (excluded from payroll).</p>
                    </div>

                    {/* Approved Leave Punctuality */}
                    <div className="mt-4">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input id="policy_approved_leave" type="checkbox"
                          defaultChecked={payrollPolicy.approved_leave_counts_as_punctual}
                          className="w-4 h-4 accent-indigo-500" />
                        <div>
                          <span className="text-sm text-white font-medium">Approved leave counts as punctual</span>
                          <p className="text-xs text-slate-400">When checked, approved leave days are not penalized in punctuality score (default: ON)</p>
                        </div>
                      </label>
                    </div>

                    <button type="button" onClick={handlePolicySave} disabled={policyLoading}
                      className="mt-4 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl w-full transition-colors">
                      {policyLoading ? 'Saving Policy...' : '💾 Save Payroll Policy'}
                    </button>
                  </div>
                )}

                <div className="payroll-modal-footer flex gap-3 pt-4 border-t border-white/5">
                    <button type="button" onClick={() => setShowSettingsModal(false)} className="payroll-btn-cancel flex-1 py-3 bg-white/5 rounded-xl text-slate-300">{t('hrm.payroll.settingsModal.cancel')}</button>
                    <button type="submit" className="payroll-btn-save flex-1 py-3 bg-indigo-600 rounded-xl text-white font-bold">{t('hrm.payroll.settingsModal.save')}</button>
                </div>
             </form>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="payroll-modal-overlay absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowModal(false); setCalcData(null); }} />
          <div className="payroll-modal-content relative rounded-2xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto bg-surface-850 border border-white/10">
            <h2 className="payroll-modal-title text-lg font-bold text-white mb-4">{t('hrm.payroll.recordModal.title')}</h2>
            <form id="payslip-form" onSubmit={handleSave} className="grid grid-cols-2 gap-4" onChange={() => recalculateFinal(calcData)}>
              <div className="col-span-2">
                <label className="payroll-label form-label">{t('hrm.payroll.recordModal.emp')}</label>
                <select name="employee_id" id="emp_select" required className="form-input payroll-input">
                  <option value="">{t('hrm.payroll.recordModal.selectEmp')}</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.Full_name}</option>)}
                </select>
              </div>
              <div className="uyf-payroll-calc-row col-span-2">
                <div className="flex-1">
                  <label className="payroll-label form-label">{t('hrm.payroll.recordModal.month')}</label>
                  <DatePicker
                    name="month"
                    id="month_input"
                    selected={recordMonth}
                    onChange={date => setRecordMonth(date)}
                    dateFormat="yyyy-MM"
                    showMonthYearPicker
                    popperPlacement="bottom-start"
                    required
                    className="form-input payroll-input w-full"
                  />
                </div>
                <div className="w-1/3"><label className="payroll-label form-label">{t('hrm.payroll.recordModal.workingDays')}</label><input type="number" id="working_days_input" defaultValue="26" required className="form-input payroll-input" /></div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => {
                      const emp = document.getElementById('emp_select').value;
                      const mth = document.getElementById('month_input').value;
                      const wd = document.getElementById('working_days_input').value;
                      if (!emp || !mth || !wd) return alert(t('hrm.payroll.toast.missingCalcData') || 'Select employee, month, and working days first');
                      calcMutation.mutate({ employee_id: emp, month: mth, working_days: wd });
                    }}
                    className="payroll-btn-calc px-6 py-2.5 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 font-bold rounded-xl whitespace-nowrap h-[42px] transition-colors"
                  >
                    {calcMutation.isPending ? '...' : t('hrm.payroll.recordModal.autoCalc')}
                  </button>
                </div>
              </div>

              {calcData && (
                <div className="payroll-breakdown-card col-span-2 bg-surface-800 p-4 rounded-xl border border-white/5 my-2">
                    <h3 className="payroll-breakdown-title text-xs font-bold text-slate-400 uppercase mb-3">{t('hrm.payroll.recordModal.breakdownTitle')}</h3>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="payroll-breakdown-label text-slate-300">{t('hrm.payroll.settingsModal.att').replace(' (%)', '')} ({calcData.auto_weights.attendance}%)</span>
                            <span className="payroll-breakdown-val text-emerald-400 font-mono">{calcData.attendance_score}%</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="payroll-breakdown-label text-slate-300">{t('hrm.payroll.settingsModal.sops').replace(' (%)', '')} ({calcData.auto_weights.sops}%)</span>
                            <span className="payroll-breakdown-val text-emerald-400 font-mono">{calcData.sop_score}%</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="payroll-breakdown-label text-slate-300">{t('hrm.payroll.settingsModal.peer').replace(' (%)', '')} ({calcData.auto_weights.peer_voting}%)</span>
                            <span className="payroll-breakdown-val text-emerald-400 font-mono">{calcData.peer_score}%</span>
                        </div>
                        {calcData.unpaid_leave_days > 0 && (
                            <div className="flex justify-between">
                                <span className="payroll-breakdown-label text-rose-400">Unpaid Leave ({calcData.unpaid_leave_days} days)</span>
                                <span className="payroll-breakdown-val text-rose-400 font-mono">-{calcData.unpaid_leave_deduction} THB</span>
                            </div>
                        )}

                        {calcData.manual_metrics.map((m, i) => (
                            <div key={i} className="flex justify-between items-center pt-2">
                                <span className="payroll-breakdown-meta text-amber-200 text-xs">{m.name} ({m.weight}%)</span>
                                <div className="flex items-center gap-2">
                                    <input type="number" min="0" max="200" onInput={() => recalculateFinal(calcData)} defaultValue="100" className="manual-kpi-input payroll-kpi-input w-16 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-right px-2 py-1 rounded" data-weight={m.weight} />
                                </div>
                            </div>
                        ))}

                        <div className="payroll-breakdown-divider h-px bg-white/10 my-3"></div>
                        <div className="flex justify-between items-center font-bold">
                            <span className="payroll-final-label text-white">{t('hrm.payroll.recordModal.finalScore')}</span>
                            <span id="breakdown_final" className="payroll-final-box bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded font-mono">
                                {calcData.auto_kpi_contribution}%
                            </span>
                        </div>
                        <div id="target_bonus_display" className="payroll-bonus-display mt-3 pt-3 border-t border-white/5 space-y-1"></div>
                    </div>
                </div>
              )}

              <div><label className="payroll-label form-label">{t('hrm.payroll.recordModal.basic')}</label><input type="number" step="0.01" name="basic_salary" required className="form-input payroll-input" defaultValue="0" /></div>
              <div><label className="payroll-label form-label">{t('hrm.payroll.recordModal.allowances')}</label><input type="number" step="0.01" name="allowances" required className="form-input payroll-input" defaultValue="0" /></div>
              <div><label className="payroll-label form-label">{t('hrm.payroll.recordModal.deductions')}</label><input type="number" step="0.01" name="deductions" required className="form-input payroll-input" defaultValue="0" /></div>
              <div><label className="payroll-label form-label">{t('hrm.payroll.recordModal.bonus')}</label><input type="number" step="0.01" name="bonus" readOnly required className="form-input payroll-input" defaultValue="0" /></div>
              <div className="col-span-2"><label className="payroll-label form-label">{t('hrm.payroll.recordModal.net')}</label><input type="number" step="0.01" name="net_salary" required className="form-input payroll-input-net bg-indigo-500/10 border-indigo-500/30 text-indigo-100 font-bold text-lg" readOnly /></div>

              <div className="col-span-2 pt-2">
                  <label className="payroll-label form-label">{t('hrm.payroll.recordModal.status')}</label>
                  <select name="payment_status" className="form-input payroll-input"><option value="Pending">{t('hrm.payroll.recordModal.pending')}</option><option value="Paid">{t('hrm.payroll.recordModal.paid')}</option></select>
              </div>

              <div className="payroll-modal-footer col-span-2 flex gap-3 pt-4">
                <button type="button" onClick={() => { setShowModal(false); setCalcData(null); }} className="payroll-btn-cancel flex-1 px-4 py-3 bg-white/5 text-slate-400 rounded-xl">{t('hrm.payroll.recordModal.cancel')}</button>
                <button type="submit" className="payroll-btn-save flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20">{t('hrm.payroll.recordModal.save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
