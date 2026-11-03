import Icon from '../../components/common/Icon';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import HandoverTab from '../../components/handover/HandoverTab';
import { useLanguage } from '../../context/LanguageContext';

// ─── Helper: category icons ───────────────────────────────────────────────────
const catIcon = { IT: '💻', Finance: '💰', Legal: '⚖️', 'Knowledge Transfer': '📚', Facilities: '🏢', HR: '📌' };

// ─── {t('hrm.offboarding.exitInterview')} Page ────────────────────────────────────────────────────────
function ExitInterviewPage({ ob, onClose }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    interviewer_name: ob.interviewer_name || '',
    interview_date: ob.interview_date || '',
    reason_for_leaving: ob.reason_for_leaving || '',
    job_satisfaction: ob.job_satisfaction || null,
    management_rating: ob.management_rating || null,
    work_environment: ob.work_environment || null,
    compensation_benefits: ob.compensation_benefits || null,
    career_growth: ob.career_growth || null,
    return_future: ob.return_future || 'Yes',
    recommend_company: ob.recommend_company || 'Yes',
    highlights: ob.highlights || '',
    improvements: ob.improvements || '',
    additional_comments: ob.additional_comments || '',
  });

  const mutation = useMutation({
    mutationFn: (data) => api.post(`/offboarding/${ob.id}/exit-interview`, data),
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['offboarding']});
      toast.success('Exit Interview saved!');
      onClose();
    },
    onError: () => toast.error('Failed to save exit interview'),
  });

  const RatingRow = ({ title, desc, field }) => (
    <div className="offb-rating-row rounded-2xl p-6 mb-6" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <h3 className="offb-title text-base font-bold text-white mb-1">{title}</h3>
      <p className="offb-subtitle text-xs text-slate-400 mb-5">{desc}</p>
      <div className="flex items-center gap-3">
        {[1,2,3,4,5].map(n => {
          const labels = [t('hrm.offboarding.ratings.poor'), t('hrm.offboarding.ratings.fair'), t('hrm.offboarding.ratings.good'), t('hrm.offboarding.ratings.great'), t('hrm.offboarding.ratings.excellent')];
          const selected = form[field] === n;
          return (
            <div key={n} className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, [field]: n }))}
                className={`offb-rating-btn w-14 h-14 rounded-2xl font-black text-xl transition-all duration-300 ${
                  selected
                    ? 'offb-rating-selected bg-gradient-to-br from-indigo-500 to-purple-600 text-white scale-110 shadow-lg shadow-indigo-500/30'
                    : 'bg-white/5 text-indigo-300/50 border border-white/5 hover:bg-white/10 hover:text-white'
                }`}
              >{n}</button>
              <span className={`offb-rating-label text-[10px] font-semibold tracking-wide uppercase ${selected ? 'text-indigo-400' : 'text-slate-500'}`}>{labels[n-1]}</span>
            </div>
          );
        })}
        <div className="ml-auto text-xs text-slate-500 flex gap-2">
          <span>{t('hrm.offboarding.ratings.oneIsPoor')}</span><span>·</span><span>{t('hrm.offboarding.ratings.fiveIsExcellent')}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="text-sm text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors">← {t('hrm.offboarding.backToOffboarding')}</button>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-black text-white">{t('hrm.offboarding.exitInterview')}</h2>
        <p className="text-sm text-slate-400 mt-1">{ob.employee_name} · Comprehensive feedback form</p>
      </div>

      {/* Interview Details */}
      <div className="offb-interview-card rounded-2xl p-6" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <h3 className="offb-title text-base font-bold text-white mb-5">{t('hrm.offboarding.interviewDetails')}</h3>
        <div className="grid grid-cols-2 gap-5 mb-5">
          <div>
            <label className="offb-field-label text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">{t('hrm.offboarding.interviewer')}</label>
            <input
              value={form.interviewer_name}
              onChange={e => setForm(f => ({ ...f, interviewer_name: e.target.value }))}
              placeholder={t('hrm.offboarding.selectHr')}
              className="offb-input w-full bg-surface-850 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div>
            <label className="offb-field-label text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">{t('hrm.offboarding.interviewDate')}</label>
            <input
              type="date"
              value={form.interview_date}
              onChange={e => setForm(f => ({ ...f, interview_date: e.target.value }))}
              className="offb-input w-full bg-surface-850 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-300 outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>
        <div>
          <label className="offb-field-label text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">{t('hrm.offboarding.primaryReason')}</label>
          <textarea
            value={form.reason_for_leaving}
            onChange={e => setForm(f => ({ ...f, reason_for_leaving: e.target.value }))}
            placeholder={t('hrm.offboarding.mainReasonPlaceholder')}
            rows={3}
            className="offb-input w-full bg-surface-850 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-indigo-500 resize-none transition-colors"
          />
        </div>
      </div>

      {/* Ratings */}
      <RatingRow title="Job Satisfaction" desc="How satisfied were you with your overall role and responsibilities?" field="job_satisfaction" />
      <RatingRow title="Management & Leadership" desc="How would you rate the quality of management and leadership?" field="management_rating" />
      <RatingRow title="Work Environment" desc="How would you rate the overall work culture and environment?" field="work_environment" />
      <RatingRow title="Compensation & Benefits" desc="How satisfied were you with your salary and benefits package?" field="compensation_benefits" />
      <RatingRow title="Career Growth" desc="How would you rate opportunities for career development and advancement?" field="career_growth" />

      {/* Final Questions */}
      <div className="rounded-2xl p-6" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <h3 className="text-base font-bold text-white mb-5">{t('hrm.offboarding.finalQuestions')}</h3>
        <div className="space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-white">{t('hrm.offboarding.considerReturning')}</p>
              <p className="text-xs text-slate-500 mt-1">{t('hrm.offboarding.boomerangHint')}</p>
            </div>
            <div className="flex gap-4">
              {['Yes', 'No'].map(opt => (
                <label key={opt} className="flex items-center gap-2 cursor-pointer">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${form.return_future === opt ? 'border-indigo-500' : 'border-slate-600'}`}>
                    {form.return_future === opt && <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full" />}
                  </div>
                  <span className="text-sm font-semibold text-slate-300">{opt}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-white">{t('hrm.offboarding.recommend')}</p>
              <p className="text-xs text-slate-500 mt-1">{t('hrm.offboarding.npsHint')}</p>
            </div>
            <div className="flex gap-4">
              {['Yes', 'No'].map(opt => (
                <label key={opt} className="flex items-center gap-2 cursor-pointer">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${form.recommend_company === opt ? 'border-rose-500' : 'border-slate-600'}`}>
                    {form.recommend_company === opt && <div className="w-2.5 h-2.5 bg-rose-500 rounded-full" />}
                  </div>
                  <span className="text-sm font-semibold text-slate-300">{opt}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Open Feedback */}
      <div className="offb-interview-card rounded-2xl p-6" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <h3 className="offb-title text-base font-bold text-white mb-5">{t('hrm.offboarding.openFeedback')}</h3>
        <div className="space-y-5">
          <div>
            <label className="offb-field-label text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">{t('hrm.offboarding.highlightsTitle')}</label>
            <textarea
              value={form.highlights}
              onChange={e => setForm(f => ({ ...f, highlights: e.target.value }))}
              placeholder={t('hrm.offboarding.highlightsPlaceholder')}
              rows={3}
              className="offb-input w-full bg-surface-850 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-indigo-500 resize-none transition-colors"
            />
          </div>
          <div>
            <label className="offb-field-label text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">{t('hrm.offboarding.improvementsTitle')}</label>
            <textarea
              value={form.improvements}
              onChange={e => setForm(f => ({ ...f, improvements: e.target.value }))}
              placeholder={t('hrm.offboarding.improvementsPlaceholder')}
              rows={3}
              className="offb-input w-full bg-surface-850 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-indigo-500 resize-none transition-colors"
            />
          </div>
          <div>
            <label className="offb-field-label text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">{t('hrm.offboarding.commentsTitle')}</label>
            <textarea
              value={form.additional_comments}
              onChange={e => setForm(f => ({ ...f, additional_comments: e.target.value }))}
              placeholder={t('hrm.offboarding.commentsPlaceholder')}
              rows={3}
              className="offb-input w-full bg-surface-850 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-indigo-500 resize-none transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex gap-4">
        <button onClick={onClose} className="px-6 py-3 rounded-xl text-sm font-semibold text-slate-400 bg-white/5 hover:bg-white/10 transition-colors">{t('hrm.offboarding.cancel')}</button>
        <button
          onClick={() => mutation.mutate(form)}
          disabled={mutation.isPending}
          className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-all shadow-lg"
          style={{ background: 'linear-gradient(135deg, #8b5cf6, #d946ef)' }}
        >
          {mutation.isPending ? 'Saving...' : '💾 Submit Exit Interview'}
        </button>
      </div>
    </div>
  );
}

// ─── Detail View ──────────────────────────────────────────────────────────────
function OffboardingDetail({ obId, onBack, onShowEI }) {
  const { t, tDyn } = useLanguage();
  const qc = useQueryClient();
  const [detailTab, setDetailTab] = useState('tasks');

  const { data, isLoading } = useQuery({
    queryKey: ['offboarding-detail', obId],
    queryFn: () => api.get(`/offboarding/${obId}/detail`).then(r => r.data),
  });

  const toggleClearance = useMutation({
    mutationFn: ({ field, value }) => api.patch(`/offboarding/${obId}/clearance`, { field, value }),
    onSuccess: () => qc.invalidateQueries({queryKey:['offboarding-detail', obId]}),
    onError: () => toast.error('Failed to update'),
  });

  const toggleTask = useMutation({
    mutationFn: (taskId) => api.post(`/offboarding/${obId}/task/${taskId}/toggle`),
    onSuccess: () => qc.invalidateQueries({queryKey:['offboarding-detail', obId]}),
    onError: () => toast.error('Failed to update task'),
  });

  const releaseMutation = useMutation({
    mutationFn: () => api.patch(`/offboarding/${obId}/release`),
    onSuccess: () => { qc.invalidateQueries({queryKey:['offboarding-detail', obId]}); qc.invalidateQueries({queryKey:['offboarding']}); toast.success('Final Settlement Released!'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to release settlement'),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const ob = data?.offboarding;
  if (!ob) return <div className="p-10 text-center text-slate-400">Not found</div>;

  const handover = data?.handover;
  const handoverBlocking = ob.handover_id && ob.handover_required !== false && (!handover || !['completed', 'waived'].includes(handover.status));
  const tasks = data?.tasks || [];
  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'Completed').length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const isCleared = ob.settlement_status?.startsWith('Release');

  // Group tasks by category
  const catGroups = tasks.reduce((acc, t) => {
    const cat = t.category || 'HR';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  const clearanceItems = [
    { field: 'laptop_returned', label: t('hrm.offboarding.laptopReturned'), icon: '💻' },
    { field: 'access_card_returned', label: t('hrm.offboarding.accessCard'), icon: '🪪' },
    { field: 'nda_signed', label: t('hrm.offboarding.ndaSigned'), icon: '📝' },
    { field: 'knowledge_transfer', label: tDyn('hrm.offboarding.owners', 'Knowledge Transfer'), icon: '🔄' },
  ];

  return (
    <div className="space-y-5">
      {/* Back nav */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors">← {t('hrm.offboarding.allOffboarding')}</button>
        <span className="text-slate-600">|</span>
        <button
          onClick={() => onShowEI(ob)}
          className="text-sm font-semibold text-white bg-[#B51629] hover:bg-[#941225] px-3 py-1.5 rounded-xl transition-colors shadow-sm"
        >
          <Icon name="documents" size={17}/> {t('hrm.offboarding.conductExitInterview')} →
        </button>
      </div>

      {/* Header card */}
      <div className="offb-detail-header rounded-2xl p-6" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="offb-avatar w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #f43f5e, #ec4899)' }}>
              {(ob.employee_name || '?').charAt(0)}
            </div>
            <div>
              <h2 className="offb-title text-xl font-bold text-white">{ob.employee_name}</h2>
              <div className="offb-meta flex flex-wrap items-center gap-2 mt-1 text-sm text-slate-400">
                <span className="font-mono text-indigo-400">{ob.employee_code}</span>
                <span>·</span><span>{ob.termination_reason || ob.reason || '—'}</span>
                {ob.exit_type && <><span>·</span><span>{t('hrm.offboarding.exit')}: {tDyn('hrm.offboarding.exitTypes', ob.exit_type)}</span></>}
                {ob.resignation_date && <><span>·</span><span>{t('hrm.offboarding.resignation')}: {ob.resignation_date}</span></>}
                <span>·</span><span className="font-semibold text-white">{t('hrm.offboarding.lastDay')}: {ob.last_working_day || ob.last_working_date || '—'}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {isCleared ? (
              <div className="offb-cleared-box bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-2.5 text-center">
                <p className="offb-cleared-text text-sm font-bold text-emerald-400">✓ {t('hrm.offboarding.releaseFinalSettlement')}</p>
                <p className="text-xs text-emerald-300/60">{t('hrm.offboarding.allCleared')}</p>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (pct !== 100) return toast.error('Complete all offboarding tasks first');
                  if (handoverBlocking) return toast.error('Handover must be completed or waived before releasing settlement');
                  releaseMutation.mutate();
                }}
                className={`offb-btn-action text-sm font-bold px-4 py-2.5 rounded-xl border transition-colors ${
                  pct === 100 && !handoverBlocking
                    ? 'offb-btn-success bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                    : 'offb-btn-warning bg-rose-500/10 border-rose-500/30 text-rose-400'
                }`}
              >
                {pct === 100 && !handoverBlocking ? '✓ ' + t('hrm.offboarding.releaseFinalSettlement') : handoverBlocking ? t('hrm.offboarding.handoverIncomplete') : t('hrm.offboarding.holdFinalPayroll')}
              </button>
            )}
            <div className="text-right">
              <p className={`offb-progress-text text-2xl font-black ${pct === 100 ? 'text-emerald-400' : 'text-rose-400'}`}>{pct}%</p>
              <p className="offb-progress-sub text-xs text-slate-400">{done}/{total} {t('hrm.offboarding.tasks')}</p>
              <div className="offb-progress-bg w-32 h-2 bg-white/5 rounded-full overflow-hidden mt-1">
                <div className={`offb-progress-fill h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="offb-tabs flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-800, #1e2235)' }}>
        {[
          { id: 'tasks', label: t('hrm.offboarding.clearanceTasks') },
          { id: 'handover', label: `Handover${handover ? ` (${handover.completion_pct || 0}%)` : ''}` },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setDetailTab(tab.id)}
            className={`offb-tab-btn flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
              detailTab === tab.id ? 'bg-indigo-600 text-white offb-tab-active' : 'text-slate-400 hover:text-white offb-tab-inactive'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {detailTab === 'handover' ? (
        <HandoverTab obId={obId} obEmployeeId={ob.employee_id} />
      ) : (
      <>
      {/* Asset clearance */}
      <div className="offb-clearance-panel rounded-2xl p-5" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <h3 className="offb-title text-sm font-bold text-white mb-4">{t('hrm.offboarding.assetClearance')}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {clearanceItems.map(({ field, label, icon }) => {
            const checked = !!ob[field];
            return (
              <label
                key={field}
                className={`offb-clearance-item relative rounded-xl border p-4 cursor-pointer transition-all duration-300 ${
                  checked ? 'offb-checked border-emerald-500/30 bg-emerald-500/5' : 'offb-unchecked border-white/10 bg-white/3'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <Icon name={icon} size={23}/>
                  {/* Toggle switch */}
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={e => toggleClearance.mutate({ field, value: e.target.checked })}
                    />
                    <div className={`offb-switch-bg w-10 h-5 rounded-full transition-colors duration-300 ${checked ? 'bg-emerald-500' : 'bg-white/10'}`} />
                    <div className={`offb-switch-knob absolute top-0.5 h-4 w-4 bg-white rounded-full shadow transition-all duration-300 ${checked ? 'left-5.5 translate-x-1' : 'left-0.5'}`} />
                  </div>
                </div>
                <p className={`offb-clearance-label text-sm font-bold ${checked ? 'text-emerald-400' : 'text-slate-300'}`}>{label}</p>
                <p className={`text-xs mt-0.5 ${checked ? 'text-emerald-400/70' : 'text-slate-500'}`}>{checked ? t('hrm.offboarding.confirmed') : t('hrm.offboarding.pending')}</p>
              </label>
            );
          })}
        </div>
      </div>

      {/* Task checklist by category */}
      {Object.entries(catGroups).map(([cat, catTasks]) => {
        const catDone = catTasks.filter(t => t.status === 'Completed').length;
        return (
          <div key={cat} className="offb-cat-card rounded-2xl overflow-hidden" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="offb-cat-header px-5 py-3.5 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>{catIcon[cat] || '📌'}</span>
                <h3 className="offb-cat-title text-sm font-bold text-white">{tDyn("hrm.offboarding.owners", cat)}</h3>
              </div>
              <span className="offb-cat-meta text-xs text-slate-400">{catDone}/{catTasks.length}</span>
            </div>
            <div className="offb-task-list divide-y divide-white/5">
              {catTasks.map(task => {
                const isDone = task.status === 'Completed';
                return (
                  <div key={task.id} className={`offb-task-row px-5 py-3.5 flex items-center justify-between ${isDone ? 'bg-emerald-500/3' : ''}`}>
                    <div className="flex items-center gap-3 flex-1">
                      <button
                        onClick={() => toggleTask.mutate(task.id)}
                        className={`offb-task-checkbox w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                          isDone ? 'bg-emerald-500/20 border-emerald-500/40 offb-checked' : 'border-white/20 hover:border-indigo-400 offb-unchecked'
                        }`}
                      >
                        {isDone && (
                          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      <div>
                        <p className={`offb-task-title text-sm font-medium ${isDone ? 'text-emerald-400 line-through' : 'text-white'}`}>{tDyn("hrm.offboarding.tasksNames", task.task_name)}</p>
                        <p className="offb-task-meta text-xs text-slate-500">{t('hrm.offboarding.owner')}: {tDyn("hrm.offboarding.owners", task.responsible || task.assigned_to_role || "HR")}</p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 ml-4">{task.completed_at ? task.completed_at.slice(0, 10) : task.due_date || ''}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {tasks.length === 0 && (
        <div className="py-10 text-center text-slate-500 border border-dashed border-slate-700 rounded-2xl">
          {t('hrm.offboarding.noTasks')}
        </div>
      )}
      </>
      )}
    </div>
  );
}

// ─── Main List View ───────────────────────────────────────────────────────────
export default function Offboarding() {
  const { t, tDyn } = useLanguage();
  const [activeObId, setActiveObId] = useState(null);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'detail' | 'exit'
  const [eiData, setEiData] = useState(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['offboarding'],
    queryFn: () => api.get('/offboarding').then(r => r.data),
  });

  const addMutation = useMutation({
    mutationFn: (body) => api.post('/offboarding', body),
    onSuccess: () => { qc.invalidateQueries({queryKey:['offboarding']}); toast.success('Offboarding initiated!'); },
    onError: () => toast.error('Failed to initiate offboarding'),
  });

  const offboarding = data?.offboarding || [];
  const employees = data?.employees || [];

  const totalCases = offboarding.length;
  const holdPayroll = offboarding.filter(o => !o.settlement_status?.startsWith('Release')).length;
  const released = offboarding.filter(o => o.settlement_status?.startsWith('Release')).length;

  const handleSave = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    addMutation.mutate(Object.fromEntries(fd));
  };

  if (viewMode === 'exit' && eiData) {
    return (
      <Layout title={t('hrm.offboarding.title')} subtitle={t('hrm.offboarding.subtitle')}>
        <ExitInterviewPage ob={eiData} onClose={() => setViewMode('detail')} />
      </Layout>
    );
  }

  if (viewMode === 'detail' && activeObId) {
    return (
      <Layout title={t('hrm.offboarding.title')} subtitle={t('hrm.offboarding.subtitle')}>
        <OffboardingDetail
          obId={activeObId}
          onBack={() => setViewMode('list')}
          onShowEI={(ob) => { setEiData(ob); setViewMode('exit'); }}
        />
      </Layout>
    );
  }

  return (
    <Layout title={t('hrm.offboarding.title')} subtitle={t('hrm.offboarding.subtitle')}>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: t('hrm.offboarding.totalCases'), value: totalCases, color: 'text-white' },
          { label: t('hrm.offboarding.holdFinalPayroll'), value: holdPayroll, color: 'text-rose-400' },
          { label: t('hrm.offboarding.settlementReleased'), value: released, color: 'text-emerald-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="offb-stat-card rounded-2xl p-6 text-center" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className={`offb-stat-val text-4xl font-black ${color} mb-1`}>{value}</p>
            <p className="offb-stat-label text-xs text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Initiate form */}
      <div className="offb-form-card rounded-2xl p-6 mb-8" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <h2 className="offb-title text-sm font-bold text-white mb-5">🚪 {t('hrm.offboarding.initiate')}</h2>
        <form onSubmit={handleSave} className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="offb-field-label text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">{t('hrm.offboarding.employee')} *</label>
            <select name="employee_id" required className="offb-input w-full bg-surface-850 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500">
              <option value="">— {t('hrm.offboarding.selectEmployee')} —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.Full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="offb-field-label text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">{t('hrm.offboarding.terminationReason')}</label>
            <select name="reason" className="offb-input w-full bg-surface-850 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500">
              {[{val:"Resignation", key:"resignation"}, {val:"Termination", key:"termination"}, {val:"Retirement", key:"retirement"}, {val:"Contract End", key:"contractEnd"}].map(r => <option key={r.val} value={r.val}>{t(`hrm.offboarding.reasons.${r.key}`)}</option>)}
            </select>
          </div>
          <div>
            <label className="offb-field-label text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">{t('hrm.offboarding.exitType')}</label>
            <select name="exit_type" className="offb-input w-full bg-surface-850 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500">
              {[{val:"Voluntary", key:"voluntary"}, {val:"Involuntary", key:"involuntary"}, {val:"Mutual Agreement", key:"mutual"}, {val:"Retirement", key:"retirement"}].map(r => <option key={r.val} value={r.val}>{t(`hrm.offboarding.exitTypes.${r.key}`)}</option>)}
            </select>
          </div>
          <div>
            <label className="offb-field-label text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">{t('hrm.offboarding.resignationDate')}</label>
            <input type="date" name="resignation_date" className="offb-input w-full bg-surface-850 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="offb-field-label text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">{t('hrm.offboarding.lastWorkingDate')}</label>
            <input type="date" name="last_working_day" className="offb-input w-full bg-surface-850 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500" />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={addMutation.isPending}
              className="offb-btn-start w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #ef4444, #f43f5e)' }}
            >
              {addMutation.isPending ? 'Starting...' : '🚪 ' + t('hrm.offboarding.startOffboarding')}
            </button>
          </div>
        </form>
      </div>

      {/* Employee cards */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="py-10 text-center"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin inline-block" /></div>
        ) : offboarding.length === 0 ? (
          <div className="py-12 text-center rounded-2xl border border-dashed border-slate-700 text-slate-500 text-sm" style={{ background: 'var(--bg-800, #1e2235)' }}>
            {t('hrm.offboarding.noRecords')}
          </div>
        ) : offboarding.map(o => {
          const pct = o.completion_pct || 0;
          const tasksDone = o.tasks_done || 0;
          const tasksTotal = o.tasks_total || 0;
          const isCleared = o.settlement_status?.startsWith('Release');

          const clearanceItems2 = [
            { field: 'laptop_returned', label: 'Laptop Returned', icon: '💻' },
            { field: 'access_card_returned', label: 'Access Card', icon: '🪪' },
            { field: 'nda_signed', label: 'NDA Signed', icon: '📝' },
            { field: 'knowledge_transfer', label: 'Knowledge Transfer', icon: '🔄' },
          ];

          return (
            <div key={o.id} className="offb-emp-card rounded-2xl overflow-hidden" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
              {/* Card header */}
              <div className="flex items-center justify-between p-5">
                <div className="flex items-center gap-4">
                  <div className="offb-avatar w-10 h-10 rounded-full flex items-center justify-center text-base font-black text-white"
                    style={{ background: 'linear-gradient(135deg, #f43f5e, #ec4899)' }}>
                    {(o.employee_name || '?').charAt(0)}
                  </div>
                  <div>
                    <p className="offb-title text-white font-bold text-sm">{o.employee_name}</p>
                    <div className="offb-meta flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                      <span className="font-mono text-indigo-400">{o.employee_code}</span>
                      {o.department && <><span>·</span><span>{o.department}</span></>}
                      {o.reason && <><span>·</span><span>{tDyn('hrm.offboarding.reasons', o.reason)}</span></>}
                      {o.last_working_day && <><span>·</span><span>{t('hrm.offboarding.last')}: {o.last_working_day}</span></>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-bold ${pct === 100 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {pct}%
                  </span>
                  {tasksTotal > 0 && <span className="offb-meta text-xs text-slate-500">{tasksDone}/{tasksTotal} {t('hrm.offboarding.tasks')}</span>}
                  {isCleared ? (
                    <button className="offb-badge offb-badge-success text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
                      ✓ Release Final Settlement
                    </button>
                  ) : (
                    <span className="offb-badge offb-badge-warning text-xs font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-xl"><Icon name="warning" size={17}/> {t('hrm.offboarding.holdPayroll')}</span>
                  )}
                  <button
                    onClick={() => { setActiveObId(o.id); setViewMode('detail'); }}
                    className="offb-btn-outline text-xs font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-xl hover:bg-indigo-500/20 transition-colors"
                  >{t('hrm.offboarding.details')} →</button>
                  <button
                    onClick={() => { setEiData(o); setViewMode('exit'); }}
                    className="offb-btn-outline text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl hover:bg-amber-500/20 transition-colors"
                  >
                    Exit Interview
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div className="px-5 pb-3">
                <div className="offb-progress-track w-full h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className={`offb-progress-fill h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${pct}%` }} />
                </div>
              </div>

              {/* Quick clearance toggles */}
              <div className="px-5 pb-5 grid grid-cols-4 gap-3">
                {clearanceItems2.map(({ field, label, icon }) => {
                  const checked = !!o[field];
                  return (
                    <div key={field} className={`offb-clearance-mini rounded-xl p-3 border text-center transition-colors ${checked ? 'offb-checked border-emerald-500/30 bg-emerald-500/5' : 'offb-unchecked border-white/5 bg-white/3'}`}>
                      <Icon name={icon} size={19}/>
                      <p className={`text-xs font-semibold mt-1 ${checked ? 'text-emerald-400' : 'text-slate-400'}`}>{label}</p>
                      {checked && <p className="text-[10px] text-emerald-400/70 mt-0.5">✓ {t('hrm.offboarding.confirmed')}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Layout>
  );
}
