import Icon from '../../components/common/Icon';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Chart, registerables } from 'chart.js';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { useLanguage } from '../../context/LanguageContext';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

Chart.register(...registerables);

// ─── Grade Config ─────────────────────────────────────────────────
const GRADE_CONFIG = {
  'A+': { color: '#10b981', bg: 'bg-emerald-500/15',  text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'Exceptional'   },
  'A':  { color: '#3b82f6', bg: 'bg-blue-500/15',     text: 'text-blue-400',    border: 'border-blue-500/30',    label: 'High Achiever'  },
  'B':  { color: '#D53C50', bg: 'bg-indigo-500/15',   text: 'text-indigo-400',  border: 'border-indigo-500/30',  label: 'Standard'       },
  'C':  { color: '#f59e0b', bg: 'bg-amber-500/15',    text: 'text-amber-400',   border: 'border-amber-500/30',   label: 'Needs Improve'  },
  'D':  { color: '#ef4444', bg: 'bg-rose-500/15',     text: 'text-rose-400',    border: 'border-rose-500/30',    label: 'Underperforming'},
  '—':  { color: '#64748b', bg: 'bg-slate-500/15',    text: 'text-slate-400',   border: 'border-slate-500/30',   label: 'Pending Data'   },
};

function GradeBadge({ grade }) {
  const { t } = useLanguage();
  const cfg = GRADE_CONFIG[grade] || GRADE_CONFIG['—'];
  return (
    <span className={`pt-badge inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {grade === 'A+' ? '🥇' : grade === 'A' ? '🥈' : grade === 'B' ? '🥉' : grade === 'C' ? '⚠️' : grade === 'D' ? '❌' : '⏳'} {grade === '—' ? t('hrm.performance.noData') : `${t('hrm.performance.gradePrefix')} ${grade}`}
    </span>
  );
}

function ScoreBar({ value, color = '#D53C50' }) {
  return (
    <div className="pt-score-bar flex items-center gap-2">
      <div className="pt-score-bg flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className="pt-score-fill h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, value)}%`, background: color }} />
      </div>
      <span className="pt-score-text text-xs font-bold text-slate-300 w-10 text-right">{value}%</span>
    </div>
  );
}

// ─── Department Bar Chart ─────────────────────────────────────────
function DeptBarChart({ data }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || !data?.length) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: data.map(d => d.name),
        datasets: [{
          label: 'Avg CPI %',
          data: data.map(d => d.avg_cpi),
          backgroundColor: data.map(d => d.avg_cpi >= 85 ? '#10b98199' : d.avg_cpi >= 75 ? '#6366f199' : d.avg_cpi >= 60 ? '#f59e0b99' : '#ef444499'),
          borderColor:     data.map(d => d.avg_cpi >= 85 ? '#10b981'   : d.avg_cpi >= 75 ? '#D53C50'   : d.avg_cpi >= 60 ? '#f59e0b'   : '#ef4444'),
          borderWidth: 1.5,
          borderRadius: 8,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.raw}% avg CPI` } },
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', font: { size: 11 } } },
          y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', callback: v => `${v}%` } },
        },
      },
    });
    return () => chartRef.current?.destroy();
  }, [data]);
  return <canvas ref={canvasRef} height="220" />;
}

// ─── Trend Line Chart ─────────────────────────────────────────────
function TrendLineChart({ trend }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || !trend?.length) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: trend.map(t => t.label),
        datasets: [{
          label: 'Avg CPI %',
          data: trend.map(t => t.avg_cpi),
          borderColor: '#D53C50',
          backgroundColor: 'rgba(213,60,80,0.08)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#D53C50',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 5,
          spanGaps: false,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ctx.raw !== null ? ` ${ctx.raw}% CPI` : ' No data' } },
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b' } },
          y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', callback: v => `${v}%` } },
        },
      },
    });
    return () => chartRef.current?.destroy();
  }, [trend]);
  return <canvas ref={canvasRef} height="220" />;
}

// ─── Radar Chart in Modal ─────────────────────────────────────────
function RadarChart({ emp }) {
  const { t } = useLanguage();
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || !emp) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: 'radar',
      data: {
        labels: [t('hrm.performance.sopCompliance'), t('hrm.performance.kpiGoals'), t('hrm.performance.attendance'), t('hrm.performance.punctuality'), t('hrm.performance.peerRating')],
        datasets: [{
          label: emp.full_name,
          data: [emp.sop_score, emp.kpi_score, emp.attendance_rate, emp.punctuality_rate, emp.peer_score],
          backgroundColor: 'rgba(213,60,80,0.15)',
          borderColor: '#D53C50',
          pointBackgroundColor: '#D53C50',
          pointRadius: 4,
        }],
      },
      options: {
        responsive: true,
        scales: {
          r: {
            min: 0, max: 100,
            grid: { color: 'rgba(255,255,255,0.06)' },
            angleLines: { color: 'rgba(255,255,255,0.06)' },
            ticks: { display: false },
            pointLabels: { color: '#94a3b8', font: { size: 11 } },
          },
        },
        plugins: { legend: { display: false } },
      },
    });
    return () => chartRef.current?.destroy();
  }, [emp, t]);
  return <canvas ref={canvasRef} />;
}

// ─── Scorecard Modal ──────────────────────────────────────────────
function ScorecardModal({ emp, onClose }) {
  const { t, tDyn } = useLanguage();
  if (!emp) return null;
  const cfg = GRADE_CONFIG[emp.grade] || GRADE_CONFIG['B'];
  return (
    <div className="pt-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="pt-modal-content relative w-full max-w-2xl rounded-2xl overflow-hidden" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {/* Header */}
        <div className="pt-modal-header px-6 py-5 flex items-start justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-4">
            <div className="pt-modal-avatar w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black text-white"
              style={{ background: `linear-gradient(135deg, ${cfg.color}40, ${cfg.color}20)`, border: `1px solid ${cfg.color}50` }}>
              {(emp.full_name || '?')[0]}
            </div>
            <div>
              <p className="pt-modal-name text-base font-bold text-white">{emp.full_name}</p>
              <p className="pt-modal-role text-xs text-slate-400">{emp.position_title} · {tDyn("hrm.departments", emp.department_name) || emp.department_name}</p>
              <p className="pt-modal-code text-xs text-slate-500 font-mono mt-0.5">{emp.employee_code}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <p className="pt-modal-cpi text-2xl font-black" style={{ color: cfg.color }}>{emp.cpi}%</p>
              <GradeBadge grade={emp.grade} />
            </div>
            <button type="button" onClick={(e) => { e.preventDefault(); onClose(); }} className="pt-modal-close text-slate-500 hover:text-white ml-3">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Radar Chart */}
          <div>
            <p className="pt-section-title text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{t('hrm.performance.radarTitle')}</p>
            <div className="pt-radar-card rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <RadarChart emp={emp} />
            </div>
          </div>

          {/* {t('hrm.performance.scoreBreakdown')} */}
          <div>
            <p className="pt-section-title text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Score Breakdown</p>
            <div className="space-y-4">
              <div className="pt-breakdown-card rounded-xl p-4 space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between">
                  <p className="pt-breakdown-title text-xs font-semibold text-white"><Icon name="documents" size={17}/> {t('hrm.performance.dailySopCompliance')} {emp.has_sop ? <span className="pt-breakdown-meta text-slate-500 font-normal">{t('hrm.performance.statusActive')}</span> : <span className="pt-breakdown-meta-warn text-amber-400/80 font-normal">{t('hrm.performance.statusUnassigned')}</span>}</p>
                </div>
                {emp.has_sop ? (
                  <>
                    <ScoreBar value={emp.sop_score} color="#10b981" />
                    <p className="pt-breakdown-desc text-[10px] text-slate-500">{emp.sop_completed} / {emp.sop_total || '—'} {t('hrm.performance.tasksCompleted')}</p>
                  </>
                ) : (
                  <p className="pt-breakdown-desc text-xs text-slate-500 italic py-1">{t('hrm.performance.noSopTasks')}</p>
                )}
              </div>

              <div className="pt-breakdown-card rounded-xl p-4 space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between">
                  <p className="pt-breakdown-title text-xs font-semibold text-white"><Icon name="performance" size={17}/> {t('hrm.performance.kpiGoals')} {emp.has_kpi ? <span className="pt-breakdown-meta text-slate-500 font-normal">(Active)</span> : <span className="pt-breakdown-meta-warn text-amber-400/80 font-normal">(Unassigned)</span>}</p>
                </div>
                {emp.has_kpi ? (
                  <>
                    <ScoreBar value={emp.kpi_score} color="#D53C50" />
                    <p className="pt-breakdown-desc text-[10px] text-slate-500">{emp.kpi_records_found} {t('hrm.performance.kpiRecords')}</p>
                  </>
                ) : (
                  <p className="pt-breakdown-desc text-xs text-slate-500 italic py-1">{t('hrm.performance.noKpiTargets')}</p>
                )}
              </div>

              <div className="pt-breakdown-card rounded-xl p-4 space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between">
                  <p className="pt-breakdown-title text-xs font-semibold text-white">🏅 {t('hrm.performance.cultureAttendance')} <span className="pt-breakdown-meta text-slate-500 font-normal">(Active)</span></p>
                </div>
                <ScoreBar value={emp.culture_score} color="#f59e0b" />
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {[[t('hrm.performance.attendance'), emp.attendance_rate], [t('hrm.performance.punctuality'), emp.punctuality_rate], [t('hrm.performance.peerRating'), emp.has_peer ? `${emp.peer_score}%` : t('hrm.performance.na')]].map(([label, val]) => (
                    <div key={label} className="text-center">
                      <p className="pt-breakdown-val text-xs font-bold text-white">{typeof val === 'number' ? `${val}%` : val}</p>
                      <p className="pt-breakdown-desc text-[9px] text-slate-500">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Payroll Impact */}
            <div className="pt-payroll-card mt-4 rounded-xl p-3 flex items-center gap-3" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
              <span className="text-lg"><Icon name="payroll" size={17}/></span>
              <div>
                <p className="pt-payroll-title text-xs font-bold text-emerald-400">{t('hrm.performance.payrollBonusTitle')}</p>
                <p className="pt-payroll-desc text-xs text-slate-400">{emp.bonus_pct}{t('hrm.performance.targetKpiBonus')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sync Confirm Modal ───────────────────────────────────────────
function SyncConfirmModal({ month, onConfirm, onCancel, loading }) {
  const { t } = useLanguage();
  return (
    <div className="pt-sync-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="pt-sync-content relative w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="text-center mb-5">
          <div className="text-4xl mb-3"><Icon name="spark" size={17}/></div>
          <h2 className="pt-sync-title text-base font-bold text-white mb-1">{t('hrm.performance.syncTitle')}</h2>
          <p className="pt-sync-desc text-sm text-slate-400">{t('hrm.performance.syncDesc1')}<span className="pt-sync-highlight-warn text-amber-400 font-semibold">{t('hrm.performance.syncDesc2')}</span>{t('hrm.performance.syncDesc3')}<span className="pt-sync-highlight text-white font-semibold">{month}</span>{t('hrm.performance.syncDesc4')}</p>
        </div>
        <div className="pt-sync-alert rounded-xl p-3 mb-5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20">
          {t('hrm.performance.syncAlert')}
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="pt-sync-btn-cancel flex-1 px-4 py-2.5 rounded-xl text-sm text-slate-400 hover:text-white transition-colors" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading} className="pt-sync-btn-confirm flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #D53C50, #C8192E)' }}>
            {loading ? t('hrm.performance.syncing') : t('hrm.performance.confirmSync')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────
export default function PerformanceTracker() {
  const { t, tDyn } = useLanguage();
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [month, setMonth]         = useState(defaultMonth);
  const [deptFilter, setDeptFilter] = useState('');
  const [search, setSearch]       = useState('');
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [showSync, setShowSync]   = useState(false);
  const [sortCol, setSortCol]     = useState('cpi');
  const [sortDir, setSortDir]     = useState('desc');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['performance', month, deptFilter],
    queryFn: () => api.get(`/performance?month=${month}${deptFilter ? `&dept_id=${deptFilter}` : ''}`).then(r => r.data),
    staleTime: 60000,
  });

  const syncMutation = useMutation({
    mutationFn: () => api.post('/performance/sync-payroll', { month }),
    onSuccess: (res) => {
      const d = res.data;
      toast.success(`✅ ${d.synced} payroll record${d.synced !== 1 ? 's' : ''} updated with performance scores.${d.errors?.length ? ` (${d.errors.length} errors)` : ''}`);
      setShowSync(false);
    },
    onError: (e) => {
      toast.error(e.response?.data?.error || 'Sync failed');
      setShowSync(false);
    },
  });

  const summary = data?.summary || {};
  const deptStats = data?.department_stats || [];
  const trend = data?.trend || [];
  const departments = data?.departments || [];

  // Filter + sort employees
  const employees = (data?.employees || [])
    .filter(e => !search || e.full_name.toLowerCase().includes(search.toLowerCase()) || e.employee_code.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const av = a[sortCol] ?? 0;
      const bv = b[sortCol] ?? 0;
      return sortDir === 'desc' ? bv - av : av - bv;
    });

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const SortIcon = ({ col }) => sortCol !== col ? null : (
    <span className="ml-1 text-brand-green">{sortDir === 'desc' ? '↓' : '↑'}</span>
  );

  const avgGrade = summary.avg_cpi >= 95 ? 'A+' : summary.avg_cpi >= 85 ? 'A' : summary.avg_cpi >= 75 ? 'B' : summary.avg_cpi >= 60 ? 'C' : 'D';

  return (
    <Layout title={t('hrm.performance.title')} subtitle={t('hrm.performance.subtitle')}>
      {/* ── Controls ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="pt-filters flex flex-wrap items-center gap-3">
          <DatePicker
            selected={month ? new Date(month + '-01T00:00:00') : null}
            onChange={date => {
              if (date) setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
            }}
            dateFormat="yyyy-MM"
            showMonthYearPicker
            className="pt-input form-input text-sm px-3 py-2 rounded-xl w-40"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff' }}
          />
          <select
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            className="pt-select form-input text-sm px-3 py-2 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff' }}
          >
            <option value="">{t('hrm.performance.allDepartments')}</option>
            {departments.map(d => <option key={d.id} value={d.id}>{tDyn("hrm.departments", d.name) || d.name}</option>)}
          </select>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/></svg>
            <input
              type="text"
              placeholder={t('hrm.performance.searchPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pt-input form-input text-sm pl-9 pr-4 py-2 rounded-xl w-52"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff' }}
            />
          </div>
        </div>
        <button
          id="sync-to-payroll-btn"
          onClick={() => setShowSync(true)}
          className="pt-sync-btn flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #D53C50, #C8192E)', border: '1px solid rgba(213,60,80,0.4)' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>{t('hrm.performance.syncToPayroll')}</button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : isError ? (
        <div className="text-center py-16 text-rose-400">{t('hrm.performance.loadFailed')}</div>
      ) : (
        <>
          {/* ── Summary Cards ─────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              {
                label: t('hrm.performance.avgCpi'),
                value: `${summary.avg_cpi ?? '—'}%`,
                sub: avgGrade ? `Grade ${avgGrade}` : '',
                icon: '📊',
                color: GRADE_CONFIG[avgGrade]?.color || '#D53C50',
              },
              {
                label: t('hrm.performance.sopCompliance'),
                value: `${summary.avg_sop ?? '—'}%`,
                sub: t('hrm.performance.dailySopAvg'),
                icon: '✅',
                color: '#10b981',
              },
              {
                label: t('hrm.performance.topAchievers'),
                value: summary.top_count ?? '—',
                sub: t('hrm.performance.gradeAPlus'),
                icon: '🏆',
                color: '#3b82f6',
              },
              {
                label: t('hrm.performance.performanceRisk'),
                value: summary.risk_count ?? '—',
                sub: t('hrm.performance.gradeCD'),
                icon: '⚠️',
                color: summary.risk_count > 0 ? '#ef4444' : '#10b981',
              },
            ].map(c => (
              <div key={c.label} className="pt-stat-card rounded-2xl p-5 relative overflow-hidden"
                style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="pt-stat-icon-bg absolute top-0 right-0 w-20 h-20 rounded-full opacity-5 translate-x-4 -translate-y-4"
                  style={{ background: c.color }} />
                <div className="text-2xl mb-2"><Icon name={c.icon} size={18}/></div>
                <p className="pt-stat-val text-2xl font-black text-white">{c.value}</p>
                <p className="pt-stat-label text-xs text-slate-400 mt-0.5">{c.label}</p>
                {c.sub && <p className="pt-stat-sub text-[10px] font-semibold mt-1" style={{ color: c.color }}>{c.sub}</p>}
              </div>
            ))}
          </div>

          {/* ── Charts ───────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
            <div className="pt-chart-card rounded-2xl p-6" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="pt-chart-title text-sm font-bold text-white mb-4"><Icon name="trend" size={17}/> {t('hrm.performance.deptComparison')}</p>
              {deptStats.length > 0 ? <DeptBarChart data={deptStats} /> : <p className="pt-chart-empty text-slate-500 text-sm text-center py-10">{t('hrm.performance.noDeptData')}</p>}
            </div>
            <div className="pt-chart-card rounded-2xl p-6" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="pt-chart-title text-sm font-bold text-white mb-4">📈 {t('hrm.performance.cpiTrend')}</p>
              {trend.length > 0 ? <TrendLineChart trend={trend} /> : <p className="pt-chart-empty text-slate-500 text-sm text-center py-10">{t('hrm.performance.noTrendData')}</p>}
            </div>
          </div>

          {/* ── Performance Ledger Table ─────────────────────── */}
          <div className="pt-table-card rounded-2xl overflow-hidden" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="pt-table-header px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <h2 className="pt-table-title text-sm font-bold text-white">{t('hrm.performance.ledgerTitle')}</h2>
              <span className="pt-table-meta text-xs text-slate-500">{employees.length} {t('hrm.performance.employeesCount')}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="pt-table w-full text-sm">
                <thead className="pt-table-thead" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <tr>
                    {[
                      { label: '#',         col: null },
                      { label: t('hrm.performance.cols.employee'), col: null },
                      { label: t('hrm.performance.cols.dept'), col: null },
                      { label: t('hrm.performance.cols.sop'), col: 'sop_score' },
                      { label: t('hrm.performance.cols.kpi'), col: 'kpi_score' },
                      { label: t('hrm.performance.cols.culture'), col: 'culture_score' },
                      { label: t('hrm.performance.cols.cpi'), col: 'cpi' },
                      { label: t('hrm.performance.cols.grade'), col: null },
                      { label: t('hrm.performance.cols.bonus'), col: 'bonus_pct' },
                      { label: t('hrm.performance.cols.scorecard'), col: null },
                    ].map(({ label, col }) => (
                      <th
                        key={label}
                        onClick={() => col && handleSort(col)}
                        className={`pt-th text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider ${col ? 'cursor-pointer hover:text-white' : ''}`}
                      >
                        {label}<SortIcon col={col} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employees.length === 0 && (
                    <tr><td colSpan="10" className="pt-empty-state py-16 text-center text-slate-500">{t('hrm.performance.noEmployees')}</td></tr>
                  )}
                  {employees.map((emp, idx) => {
                    const cfg = GRADE_CONFIG[emp.grade] || GRADE_CONFIG['B'];
                    return (
                      <tr key={emp.employee_id} className="pt-tr border-t border-white/5 hover:bg-white/3 transition-colors cursor-pointer"
                        onClick={(e) => { e.preventDefault(); setSelectedEmp(emp); }}>
                        <td className="pt-td-idx py-3.5 px-4 text-slate-500 text-xs">{idx + 1}</td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="pt-avatar w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                              style={{ background: `${cfg.color}25`, border: `1px solid ${cfg.color}30` }}>
                              {(emp.full_name || '?')[0]}
                            </div>
                            <div>
                              <p className="pt-emp-name font-semibold text-white text-xs">{emp.full_name}</p>
                              <p className="pt-emp-code text-[10px] text-slate-500 font-mono">{emp.employee_code}</p>
                            </div>
                          </div>
                        </td>
                        <td className="pt-emp-dept py-3.5 px-4 text-xs text-slate-400">{tDyn("hrm.departments", emp.department_name) || emp.department_name}</td>
                        <td className="py-3.5 px-4 w-24">
                          <ScoreBar value={emp.sop_score} color="#10b981" />
                        </td>
                        <td className="py-3.5 px-4 w-24">
                          <ScoreBar value={emp.kpi_score} color="#D53C50" />
                        </td>
                        <td className="py-3.5 px-4 w-24">
                          <ScoreBar value={emp.culture_score} color="#f59e0b" />
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="pt-emp-cpi text-base font-black" style={{ color: cfg.color }}>
                            {emp.cpi !== null && emp.cpi !== undefined ? `${emp.cpi}%` : 'N/A'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <GradeBadge grade={emp.grade} />
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`pt-emp-bonus text-xs font-bold ${emp.cpi === null ? 'text-slate-500' : emp.bonus_pct === 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {emp.cpi !== null ? `${emp.bonus_pct}%` : '—'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            id={`view-scorecard-${emp.employee_id}`}
                            onClick={e => { e.preventDefault(); e.stopPropagation(); setSelectedEmp(emp); }}
                            className="pt-btn-view text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                            style={{ background: 'rgba(213,60,80,0.1)', color: '#E96A80', border: '1px solid rgba(213,60,80,0.2)' }}
                          >{t('hrm.performance.view360')}</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Modals ─────────────────────────────────────────────── */}
      {selectedEmp && <ScorecardModal emp={selectedEmp} onClose={() => setSelectedEmp(null)} />}
      {showSync && (
        <SyncConfirmModal
          month={month}
          loading={syncMutation.isLoading}
          onConfirm={() => syncMutation.mutate()}
          onCancel={() => setShowSync(false)}
        />
      )}
    </Layout>
  );
}
