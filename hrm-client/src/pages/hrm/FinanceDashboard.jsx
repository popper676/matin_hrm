import {useLanguage} from '../../context/LanguageContext';
import { useQuery } from '@tanstack/react-query';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';

export default function FinanceDashboard() {
  const {t}=useLanguage();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['finance-dashboard'],
    queryFn: () => api.get('/finance/dashboard').then(r => r.data)
  });

  if(isLoading||isError)return <Layout title={t('hrm.finance.title')}><p role={isError?'alert':'status'}>{t(isError?'hrm.finance.error':'common.loading')}</p></Layout>;

  const stats = data?.stats || {};
  const recentPayrolls = data?.recent_payrolls || [];

  return (
    <Layout title={t('hrm.finance.title')} subtitle={t('hrm.finance.subtitle')}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard title={t('hrm.finance.baseSalary')} value={`${(stats.base_salary_total || 0).toLocaleString()} THB`} icon="💰" />
        <StatCard title={t('hrm.finance.headcount')} value={stats.headcount} icon="👥" />
        <StatCard title={t('hrm.finance.leaves')} value={stats.approved_leaves} icon="🗓️" />
        <StatCard title={t('hrm.finance.departments')} value={stats.department_count} icon="🏢" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 rounded-2xl border border-white/5 bg-surface-800">
          <h3 className="text-lg font-bold text-white mb-6">{t('hrm.finance.history')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-850 border-b border-white/5 text-slate-400">
                <tr>
                  <th className="text-left py-4 px-6 font-semibold">{t('hrm.finance.employee')}</th>
                  <th className="text-left py-4 px-6 font-semibold">{t('hrm.finance.month')}</th>
                  <th className="text-left py-4 px-6 font-semibold">{t('hrm.finance.amount')}</th>
                  <th className="text-left py-4 px-6 font-semibold">{t('hrm.finance.status')}</th>
                </tr>
              </thead>
              <tbody>
                {recentPayrolls.map(p => (
                  <tr key={p.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                    <td className="py-4 px-6">{p.employee_name}</td><td className="py-4 px-6 font-bold text-indigo-400">{p.month}</td>
                    <td className="py-4 px-6 text-white font-mono">{Number(p.net_salary||0).toLocaleString()} {data.currency}</td>
                    <td className="py-4 px-6 text-emerald-400 text-xs">{t(p.payment_status==='Paid'?'hrm.finance.paid':'hrm.finance.pending')}</td>
                  </tr>
                ))}
                {recentPayrolls.length === 0 && <tr><td colSpan="4" className="p-8 text-center text-slate-500">{t('hrm.finance.empty')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="p-6 rounded-2xl border border-white/5 bg-surface-800 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 rounded-full bg-indigo-500/10 flex items-center justify-center text-4xl mb-4">
            📈
          </div>
          <h3 className="text-slate-400 text-sm mb-1">{t('hrm.finance.variance')}</h3>
          <div className="text-4xl font-bold text-white mb-2">
            {stats.variance==null?'—':`${Number(stats.variance)>0?'+':''}${stats.variance}%`}
          </div>
          <p className="text-xs text-slate-500 mb-6">{t('hrm.finance.compared')}</p>

          <div className="w-full bg-surface-850 rounded-xl p-4 border border-white/5 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">{t('hrm.finance.latest')} ({stats.latest_month||'—'})</span>
              <span className="text-emerald-400 font-bold">{(stats.current_month_payroll || 0).toLocaleString()} THB</span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-white/5">
              <span className="text-slate-500">{t('hrm.finance.previous')}</span>
              <span className="text-indigo-400 font-bold">{(stats.previous_month_payroll || 0).toLocaleString()} THB</span>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ title, value, icon }) {
  return (
    <div className="p-6 rounded-2xl border border-white/5 bg-surface-800 flex items-center gap-4">
      <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center text-2xl">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-400 mb-1">{title}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
      </div>
    </div>
  );
}
