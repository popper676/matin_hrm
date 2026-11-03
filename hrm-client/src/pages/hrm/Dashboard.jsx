import {BrandText} from '../../components/common/Brand';
import Icon from '../../components/common/Icon';
import PageLoader from '../../components/common/PageLoader';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Chart, registerables } from 'chart.js';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

Chart.register(...registerables);

function StatCard({ label, value, icon, href }) {
  return <Link to={href}>
    <div className="uyf-metric">
      <div className="uyf-metric-top"><span className="uyf-metric-icon"><Icon name={icon}/></span><span className="uyf-metric-arrow"><Icon name="arrow" size={16}/></span></div>
      <p className="uyf-metric-value">{value ?? '—'}</p>
      <p className="uyf-metric-label">{label}</p>
    </div>
  </Link>;
}
function EmptyState({ icon, title, description }) {
  return <div className="uyf-empty"><div className="uyf-empty-icon"><Icon name={icon}/></div><p>{title}</p>{description && <span>{description}</span>}</div>;
}
function BarChartWidget({ id, label, data, emptyTitle, emptyDescription, icon }) {
  const ref = useRef(null);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme);
  const hasRecords = data && Object.values(data).some(value => Number(value) > 0);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(document.documentElement.dataset.theme));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!ref.current || !hasRecords) return;
    const light = theme !== 'dark';
    const colors = Object.keys(data).map((key, index) => {
      const label = key.toLowerCase();
      if (label.includes('approved') || label.includes('on time')) return '#168455';
      if (label.includes('pending') || label.includes('late')) return '#d28b23';
      if (label.includes('reject') || label.includes('absent')) return '#c8192e';
      return ['#c8192e', '#7b8495', '#df8492', '#adb4c0'][index % 4];
    });
    const chart = new Chart(ref.current, {
      type: 'bar',
      data: { labels: Object.keys(data), datasets: [{ data: Object.values(data), backgroundColor: colors, borderRadius: 5, maxBarThickness: 40 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { border: { display: false }, grid: { display: false }, ticks: { color: light ? '#667085' : '#a4adbc', font: { family: 'Inter, Noto Sans Myanmar', size: 10 } } },
          y: { border: { display: false }, grid: { color: light ? '#edf0f4' : '#303540' }, ticks: { color: light ? '#8a92a1' : '#a4adbc', precision: 0, font: { size: 10 } }, beginAtZero: true },
        },
      },
    });
    return () => chart.destroy();
  }, [data, theme, hasRecords]);
  return <section className="uyf-panel">
    <div className="uyf-panel-heading"><h2>{label}</h2><Icon name={icon} size={15}/></div>
    <div className="uyf-chart-body">{hasRecords ? <canvas id={id} ref={ref} role="img" aria-label={label}/> : <EmptyState icon={icon} title={emptyTitle} description={emptyDescription}/>}</div>
  </section>;
}

export default function Dashboard() {
  const { t } = useLanguage();
  const { isAdmin } = useAuth();
  const x = key => t(`common.experience.${key}`);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard').then(r => r.data),
    refetchInterval: 60000,
  });
  const stats = data?.stats || {};
  const recentEmps = data?.recent_employees || [];
  const today = new Date().toISOString().split('T')[0];
  const announcements = [...(data?.ann_list || [])].filter(a => !a.expiry_date || a.expiry_date >= today).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  const d = key => t(`hrm.dashboard.${key}`);
  const copy = key => d(`uyf.${key}`);
  const miniStats = [
    ['pendingClearances', stats.pending_clearances, 'warning', '/offboarding'],
    ['activeOnboarding', stats.active_onboarding, 'onboarding', '/onboarding'],
    ['openPositions', stats.open_recruitment, 'positions', '/recruitment'],
    ['totalPayrollPaid', stats.total_payroll_paid, 'payroll', '/payroll'],
    ['turnoverRate', stats.turnover_rate, 'trend', '/employees'],
  ];
  const shortcuts = [
    ...(isAdmin() ? [['addEmployee', '/employees?create=1']] : []), ['recordAttendance', '/attendance'], ['submitLeave', '/leave'], ['startOnboarding', '/onboarding'],
  ];
  return <Layout title={d('title')} subtitle={`${data?.today ? data.today + ' · ' : ''}${d('subtitle')}`}>
    {isLoading ? <PageLoader label={copy('loading')}/>
    : isError ? <div className="uyf-dashboard-error"><p>{copy('error')}</p><button type="button" onClick={() => refetch()} className="mt-4 rounded-lg bg-brand-green px-4 py-2 text-white">{copy('retry')}</button></div>
    : <div className="uyf-dashboard">
      <section className="ux-day-header"><div><span className="uyf-eyebrow"><BrandText/></span><h2>{x('todayFocus')}</h2><p>{x('dailyDescription')}</p></div><span className="ux-day-symbol" aria-hidden="true"><Icon name="spark" size={34}/></span></section>
      <div className="ux-home-workbench">
        <section className="uyf-panel ux-attention"><div className="uyf-panel-heading"><h2>{x('needsAttention')}</h2><Icon name="pending" size={17}/></div><div className="ux-task-list">{[
          ['pendingLeave',data?.leave_chart?.Pending,'leave','/leave'],
          ['onboardingTasks',stats.active_onboarding,'onboarding','/onboarding'],
          ['clearanceTasks',stats.pending_clearances,'offboarding','/offboarding'],
        ].map(([label,count,icon,href]) => <Link key={label} to={href}><span className="ux-result-icon"><Icon name={icon} size={18}/></span><span>{x(label)}</span><strong>{count ?? '—'}</strong><Icon name="arrowRight" size={16}/></Link>)}</div><p className="ux-panel-footnote">{x('attentionHint')}</p></section>
        <section className="uyf-panel ux-start"><div className="uyf-panel-heading"><h2>{x('startHere')}</h2><Icon name="arrow" size={17}/></div><div className="ux-action-grid">{shortcuts.map(([label,href],index) => <Link key={label} to={href}><Icon name={['staff','present','leave','onboarding'][index]} size={20}/><span>{d(label)}</span><Icon name="arrowRight" size={14}/></Link>)}</div></section>
      </div>
      <section>
        <div className="uyf-section-heading"><h2>{copy('overview')}</h2></div>
        <div className="uyf-metrics">
          <StatCard label={d('totalStaff')} value={stats.total_staff} icon="staff" href="/employees"/>
          <StatCard label={d('activeStaff')} value={stats.active_staff} icon="active" href="/employees?status=active"/>
          <StatCard label={d('presentToday')} value={stats.today_present} icon="present" href="/attendance"/>
          <StatCard label={d('totalLeaves')} value={stats.total_leaves} icon="leave" href="/leave"/>
        </div>
      </section>
      <div className="uyf-mini-metrics">
        {miniStats.map(([label,value,icon,href]) => <Link key={label} to={href} className="uyf-mini-metric"><span className="uyf-mini-icon"><Icon name={icon}/></span><div><p className="uyf-mini-value">{value ?? '—'}</p><p className="uyf-mini-label">{d(label)}</p></div></Link>)}
      </div>
      <div className="uyf-chart-grid">
        <BarChartWidget id="attChart" label={d('attChartTitle')} data={data?.att_chart} emptyTitle={copy('noAttendance')} emptyDescription={copy('attendanceHint')} icon="present"/>
        <BarChartWidget id="leaveChart" label={d('leaveChartTitle')} data={data?.leave_chart} emptyTitle={copy('noLeave')} emptyDescription={copy('leaveHint')} icon="leave"/>
      </div>
      <div className="uyf-bottom-grid">
        <section className="uyf-panel">
          <div className="uyf-panel-heading"><h2>{d('empSnapshot')}</h2><Link to="/employees">{d('viewAll')} →</Link></div>
          {recentEmps.length ? <div className="overflow-x-auto"><table className="w-full text-left">
            <thead className="bg-surface-850"><tr>{['id','name','status'].map(key => <th key={key} className="px-5 text-slate-400">{d(key)}</th>)}</tr></thead>
            <tbody>{recentEmps.map(emp => <tr key={emp.id} className="border-t border-white/5">
              <td className="px-5 text-slate-400">{emp.employee_id || '—'}</td>
              <td className="px-5"><div className="flex items-center gap-3"><span className="uyf-avatar">{(emp.Full_name || '?')[0]}</span><span>{emp.Full_name || '—'}</span></div></td>
              <td className="px-5"><span className={`uyf-status ${emp.status === 'Active' ? 'uyf-status-active' : 'uyf-status-inactive'}`}>{emp.status === 'Active' ? d('active') : d('inactive')}</span></td>
            </tr>)}</tbody>
          </table></div> : <EmptyState icon="staff" title={d('noEmployees')} description={copy('employeeHint')}/>}
        </section>
        <section className="uyf-panel">
          <div className="uyf-panel-heading"><h2>{d('announcements')}</h2><Icon name="bell" size={15}/></div>
          {announcements.length ? <div className="max-h-80 overflow-y-auto">{announcements.map(a => <article className="uyf-announcement" key={a.id}>
            <div className="flex items-center justify-between gap-2"><span className="uyf-eyebrow">{a.is_pinned ? '• ' : ''}{a.priority || d('normal')}</span><time>{(a.created_at || '').slice(0,10)}</time></div>
            <h3>{a.title}</h3><p className="line-clamp-2">{a.content}</p>
          </article>)}</div> : <EmptyState icon="bell" title={d('noAnnouncements')} description={d('checkBack')}/>}
        </section>
      </div>
    </div>}
  </Layout>;
}
