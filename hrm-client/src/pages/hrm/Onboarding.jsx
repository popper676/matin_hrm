import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';

export default function Onboarding() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({ queryKey: ['onboarding'], queryFn: () => api.get('/onboarding').then(r => r.data) });

  const addMutation = useMutation({
    mutationFn: (body) => api.post('/onboarding', body),
    onSuccess: () => { qc.invalidateQueries({queryKey:['onboarding']}); },
  });

  const handleStart = (empId) => {
    addMutation.mutate({
      employee_id: empId,
      status: 'Pre-boarding',
      start_date: new Date().toISOString().split('T')[0]
    });
  };

  const onboarding = data?.onboarding || [];
  const newHires = data?.new_hires || [];
  const stats = data?.stats || { pre_boarding: 0, in_progress: 0, completed: 0 };

  return (
    <Layout title={t('hrm.onboarding.title')} subtitle={t('hrm.onboarding.subtitle')}>
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="onb-spinner w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="onb-metric-card rounded-2xl p-6 flex flex-col items-center justify-center bg-surface-850 border border-white/5">
              <span className="onb-metric-val text-3xl font-bold text-white mb-2">{stats.pre_boarding}</span>
              <span className="onb-metric-lbl text-sm font-medium text-slate-400">{t('hrm.onboarding.preBoarding')}</span>
            </div>
            <div className="onb-metric-card rounded-2xl p-6 flex flex-col items-center justify-center bg-surface-850 border border-white/5">
              <span className="onb-metric-val text-3xl font-bold text-white mb-2">{stats.in_progress}</span>
              <span className="onb-metric-lbl text-sm font-medium text-slate-400">{t('hrm.onboarding.inProgress')}</span>
            </div>
            <div className="onb-metric-card rounded-2xl p-6 flex flex-col items-center justify-center bg-surface-850 border border-white/5">
              <span className="onb-metric-val text-3xl font-bold text-white mb-2">{stats.completed}</span>
              <span className="onb-metric-lbl text-sm font-medium text-slate-400">{t('hrm.onboarding.completed')}</span>
            </div>
          </div>

          {/* New Hires Alert Grid */}
          {newHires.length > 0 && (
            <div className="onb-alert-card rounded-2xl p-6 bg-surface-850 border border-white/5">
              <div className="flex items-center gap-2 mb-4">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-brand-orange text-white text-xs font-bold">!</span>
                <h3 className="onb-alert-title text-sm font-bold text-white">{newHires.length} {t('hrm.onboarding.newHiresAlert')}</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {newHires.map(emp => (
                  <div key={emp.id} className="onb-hire-card flex items-center justify-between rounded-xl p-4 transition-all hover:bg-white/5 bg-surface-800 border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="onb-hire-avatar w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-slate-300 shadow-lg border border-white/5 bg-surface-850">
                        {(emp.Full_name || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <h4 className="onb-hire-name text-sm font-bold text-white max-w-[100px] truncate">{emp.Full_name}</h4>
                        <p className="onb-hire-meta text-xs text-slate-400">{emp.hire_date ? emp.hire_date.slice(0,10) : t('hrm.onboarding.noDate')}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleStart(emp.id)}
                      disabled={addMutation.isPending}
                      className="onb-btn-start text-xs font-bold px-4 py-2 rounded-lg transition-colors text-brand-green bg-brand-green/10 hover:bg-brand-green/20"
                    >{t('hrm.onboarding.start')}</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Onboarding Progress Bars */}
          <div className="space-y-4">
            {onboarding.length === 0 ? (
              <p className="onb-empty-state text-slate-400 text-sm">{t('hrm.onboarding.noActiveProcesses')}</p>
            ) : (
              onboarding.map(ob => {
                const getStatusStyle = (status) => {
                  if (status === 'Completed') return 'text-brand-green border-brand-green/20 bg-brand-green/10';
                  if (status === 'Pre-boarding') return 'text-brand-orange border-brand-orange/20 bg-brand-orange/10';
                  return 'text-brand-green border-brand-green/20 bg-brand-green/10';
                };

                const getAvatarStyle = (status) => {
                  if (status === 'Completed') return 'bg-brand-green text-white';
                  if (status === 'Pre-boarding') return 'bg-brand-orange text-white';
                  return 'bg-brand-green text-white';
                };

                return (
                  <div key={ob.id} className="onb-progress-card rounded-2xl p-6 flex flex-col justify-between bg-surface-850 border border-white/5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">

                      {/* Left: Employee Info */}
                      <div className="flex items-center gap-4 min-w-[250px]">
                        <div className={`onb-avatar w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shadow-lg ${getAvatarStyle(ob.status)}`}>
                          {(ob.employee_name || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <h4 className="onb-name text-base font-bold text-white mb-1">{ob.employee_name}</h4>
                          <p className="onb-meta text-xs text-slate-400 font-mono">
                            {ob.employee_code} <span className="mx-2 text-slate-600">—</span> {t('hrm.onboarding.startDate')}: {ob.start_date ? ob.start_date.slice(0,10) : '—'}
                          </p>
                        </div>
                      </div>

                      {/* Middle: Progress Bar */}
                      <div className="flex-1 w-full flex items-center gap-6">
                        <div className="flex-1">
                          <div className="flex justify-between items-end mb-2">
                            <span className="onb-progress-pct text-2xl font-bold text-white">{ob.completion_pct}%</span>
                            <span className="onb-progress-meta text-xs font-medium text-slate-400">{ob.tasks_done}/{ob.tasks_total} {t('hrm.onboarding.tasks')}</span>
                          </div>
                          <div className="onb-progress-track h-2 w-full rounded-full overflow-hidden border border-white/5 bg-surface-850">
                            <div
                              className={`onb-progress-fill h-full rounded-full transition-all duration-1000 ${ob.status === 'Pre-boarding' ? 'bg-brand-orange' : 'bg-brand-green'}`}
                              style={{
                                width: `${Math.max(ob.completion_pct, 5)}%`
                              }}
                            />
                          </div>
                        </div>

                        <div className="hidden sm:block">
                          <span className={`onb-status-badge text-xs font-bold px-3 py-1.5 rounded-full border ${getStatusStyle(ob.status)}`}>
                            {ob.status}
                          </span>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="min-w-[140px] flex justify-end">
                        <button
                          onClick={() => navigate(`/onboarding/${ob.id}`)}
                          className="onb-btn-view w-full md:w-auto text-sm font-bold text-black px-6 py-2.5 rounded-xl transition-all whitespace-nowrap shadow-sm bg-brand-green hover:bg-emerald-500"
                        >{t('hrm.onboarding.viewTasks')} →</button>
                      </div>

                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
