import Icon from '../../components/common/Icon';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';

export default function OnboardingDetail() {
  const { t } = useLanguage();
  const { id } = useParams();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['onboarding', id],
    queryFn: () => api.get(`/onboarding/${id}`).then(r => r.data)
  });

  const toggleTaskMutation = useMutation({
    mutationFn: (taskId) => api.post(`/onboarding/${id}/task/${taskId}/complete`),
    onSuccess: () => { qc.invalidateQueries({queryKey:['onboarding', id]}); qc.invalidateQueries({queryKey:['onboarding']}); }
  });

  if (isLoading) {
    return (
      <Layout title={t('hrm.onboardingDetail.loading')} subtitle={t('hrm.onboardingDetail.fetching')}>
        <div className="flex items-center justify-center py-16">
          <div className="onb-spinner w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  const ob = data?.onboarding;
  const tasks = data?.tasks || [];

  if (!ob) {
    return (
      <Layout title={t('hrm.onboardingDetail.notFoundTitle')} subtitle={t('hrm.onboardingDetail.notFoundSubtitle')}>
        <div className="onb-empty-state py-16 text-center text-slate-400">{t('hrm.onboardingDetail.notFoundText')}</div>
      </Layout>
    );
  }

  // Group tasks by category
  const categories = {};
  tasks.forEach(t => {
    if (!categories[t.category]) categories[t.category] = [];
    categories[t.category].push(t);
  });

  // Get Icon for Category
  const getCategoryIcon = (category) => {
    if (category.includes('Pre-boarding')) return 'documents';
    if (category.includes('Documentation')) return 'documents';
    if (category.includes('IT Setup')) return 'sops';
    if (category.includes('Introduction')) return 'staff';
    return 'pin';
  };

  return (
    <Layout title={`${t('hrm.onboardingDetail.onboarding')}: ${ob.employee_name}`} subtitle={t('hrm.onboardingDetail.subtitle')}>
      <div className="mb-6">
        <Link to="/onboarding" className="text-sm text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors w-fit">← {t('hrm.onboardingDetail.back')}</Link>
      </div>

      <div className="space-y-6">
        {Object.entries(categories).map(([category, catTasks]) => {
          const doneCount = catTasks.filter(t => t.status === 'Completed').length;
          const totalCount = catTasks.length;

          let localizedCategory = category;
          if (category === 'Pre-boarding') localizedCategory = t('hrm.onboardingDetail.category.preBoarding');
          else if (category === 'Documentation') localizedCategory = t('hrm.onboardingDetail.category.documentation');
          else if (category === 'IT Setup') localizedCategory = t('hrm.onboardingDetail.category.itSetup');
          else if (category === 'Introduction') localizedCategory = t('hrm.onboardingDetail.category.introduction');

          return (
            <div key={category} className="onb-cat-card rounded-2xl overflow-hidden bg-surface-850 border border-white/5">

              {/* Category Header */}
              <div className="onb-cat-header flex items-center justify-between p-5 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <Icon name={getCategoryIcon(category)} size={20} className="onb-cat-icon"/>
                  <h3 className="onb-cat-title text-base font-bold text-white">{localizedCategory}</h3>
                </div>
                <div className="onb-cat-meta text-sm font-semibold text-slate-400"> {doneCount}/{totalCount} {t('hrm.onboardingDetail.done')}</div>
              </div>

              {/* Tasks List */}
              <div className="onb-task-list divide-y divide-white/5">
                {catTasks.map(task => {
                  const isDone = task.status === 'Completed';

                  let localizedTaskName = task.task_name;
                  if (task.task_name === 'Send Welcome Email') localizedTaskName = t('hrm.onboardingDetail.tasks.welcomeEmail');
                  else if (task.task_name === 'Share Employee Handbook') localizedTaskName = t('hrm.onboardingDetail.tasks.employeeHandbook');
                  else if (task.task_name === 'Collect Contract Signature') localizedTaskName = t('hrm.onboardingDetail.tasks.contractSignature');
                  else if (task.task_name === 'Setup Company Email Account') localizedTaskName = t('hrm.onboardingDetail.tasks.emailAccount');
                  else if (task.task_name === 'Create System & App Accounts') localizedTaskName = t('hrm.onboardingDetail.tasks.systemAccounts');
                  else if (task.task_name === 'Issue Access Card & Keys') localizedTaskName = t('hrm.onboardingDetail.tasks.accessCard');

                  return (
                    <div key={task.id} className="onb-task-item flex items-center justify-between p-5 hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-4">

                        {/* Toggle Checkbox */}
                        <button
                          onClick={() => toggleTaskMutation.mutate(task.id)}
                          disabled={toggleTaskMutation.isPending}
                          className={`onb-task-checkbox w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                            isDone
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500 onb-checked'
                            : 'border-slate-600 hover:border-brand-green onb-unchecked'
                          }`}
                        >
                          {isDone && (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>

                        {/* Task Details */}
                        <div>
                          <p className={`onb-task-title text-sm font-semibold transition-colors ${isDone ? 'text-slate-400 line-through' : 'text-white'}`}>
                            {localizedTaskName}
                          </p>
                          <div className="onb-task-meta flex items-center gap-3 mt-1 text-xs text-slate-500">
                            <span>{t('hrm.onboardingDetail.due')}: {task.due_date ? task.due_date.slice(0, 10) : t('hrm.onboardingDetail.noDueDate')}</span>
                            <span>•</span>
                            <span>{t('hrm.onboardingDetail.owner')}: <span className="font-semibold text-slate-400">{task.assigned_to}</span></span>
                          </div>
                        </div>

                      </div>

                      {/* Right Status */}
                      {isDone && (
                        <div className="onb-task-status flex items-center gap-2 text-xs font-semibold text-emerald-400">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>{task.completed_at ? task.completed_at.slice(0, 10) : t('hrm.onboardingDetail.done')}</span>
                        </div>
                      )}
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
