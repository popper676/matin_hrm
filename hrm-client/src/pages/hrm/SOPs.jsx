import Icon from '../../components/common/Icon';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import toast from 'react-hot-toast';
import SopReportTab from '../../components/sop/SopReportTab';
import { useLanguage } from '../../context/LanguageContext';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

export default function SOPs() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('assign');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editText, setEditText] = useState('');
  const [activeVideoUrl, setActiveVideoUrl] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [viewDate, setViewDate] = useState(new Date().toISOString().slice(0, 10));

  // Template form state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateForm, setTemplateForm] = useState({ position_id: '', task_description: '' });

  // Auto-assign state
  const [autoMonth, setAutoMonth] = useState(new Date().toISOString().slice(0, 7));

  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  // ─── Queries ──────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['sops'],
    queryFn: () => api.get('/sops').then(r => r.data)
  });

  const { data: templateData, isLoading: loadingTemplates } = useQuery({
    queryKey: ['sop-templates'],
    queryFn: () => api.get('/sops/templates').then(r => r.data)
  });

  const { data: formData } = useQuery({
    queryKey: ['employees-form-data'],
    queryFn: () => api.get('/employees/form-data').then(r => r.data)
  });

  const positions = formData?.positions || [];
  const templates = templateData?.templates || [];

  // ─── Mutations ────────────────────────────────────────────────────
  const saveTplMutation = useMutation({
    mutationFn: (body) => api.post('/sops/templates', body),
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['sop-templates']});
      setShowTemplateModal(false);
      setTemplateForm({ position_id: '', task_description: '' });
      toast.success(t('hrm.sops.toast.tplSaved'));
    },
    onError: (err) => toast.error(err.response?.data?.error || t('hrm.sops.toast.tplSaveErr'))
  });

  const deleteTplMutation = useMutation({
    mutationFn: (id) => api.delete(`/sops/templates/${id}`),
    onSuccess: () => { qc.invalidateQueries({queryKey:['sop-templates']}); toast.success(t('hrm.sops.toast.tplDeleted')); }
  });

  const autoAssignMutation = useMutation({
    mutationFn: (month) => api.post('/sops/auto-assign', { month }),
    onSuccess: (res) => {
      qc.invalidateQueries({queryKey:['sops']});
      toast.success(t('hrm.sops.toast.autoAssignSuccess', { created: res.data.created, skipped: res.data.skipped }));
    },
    onError: (err) => toast.error(err.response?.data?.error || t('hrm.sops.toast.autoAssignErr'))
  });

  const deleteMutation = useMutation({
    mutationFn: (ids) => api.post('/sops/bulk-delete', { ids }),
    onSuccess: () => { qc.invalidateQueries({queryKey:['sops']}); setDeleteTarget(null); toast.success(t('hrm.sops.toast.sopDeleted')); }
  });

  const editMutation = useMutation({
    mutationFn: ({ ids, task_description }) => api.patch('/sops/bulk-update', { ids, task_description }),
    onSuccess: () => { qc.invalidateQueries({queryKey:['sops']}); setEditTarget(null); toast.success(t('hrm.sops.toast.taskUpdated')); },
    onError: () => toast.error(t('hrm.sops.toast.taskUpdateErr'))
  });

  // ─── Helpers ──────────────────────────────────────────────────────
  const sops = data?.sops || [];

  // Filter for ONLY the currently selected date in Daily View
  const filteredSops = sops.filter(sop => sop.created_at && sop.created_at.startsWith(viewDate));

  const groupedSops = filteredSops.reduce((acc, sop) => {
    const pt = sop.position_title || 'No Position';
    if (!acc[pt]) acc[pt] = [];
    acc[pt].push(sop);
    return acc;
  }, {});
  const toggleGroup = (pt) => setExpandedGroups(prev => ({ ...prev, [pt]: !prev[pt] }));

  const openEditTemplate = (tpl) => {
    setTemplateForm({ position_id: tpl.position_id, task_description: tpl.task_description });
    setShowTemplateModal(true);
  };


  return (
    <Layout title={t('hrm.sops.title')} subtitle={t('hrm.sops.subtitle')}>

      {/* ── Tabs ── */}
      <div className="sop-main-tabs flex gap-2 overflow-x-auto pb-4 mb-6 border-b border-white/5">
        {[
          { id: 'assign', icon: '📋', label: t('hrm.sops.assignVerify') },
          { id: 'report', icon: '📊', label: t('hrm.sops.trackingReport') }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`sop-tab-btn flex items-center gap-2 px-5 py-4 text-sm font-semibold whitespace-nowrap border-b-2 transition-all duration-200 ${
              activeTab === t.id ? 'sop-tab-active border-brand-green text-brand-green' : 'sop-tab-inactive border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <span><Icon name={t.icon} size={18}/></span> {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════
          TAB: ASSIGN & VERIFY
      ══════════════════════════════════════ */}
      {activeTab === 'assign' && (
        <div className="space-y-8">

          {/* ── Section 1: SOP Templates ── */}
          <section className="sop-section">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="sop-section-title text-lg font-bold text-white"><Icon name="documents" size={17}/> {t('hrm.sops.templates')}</h2>
                <p className="sop-section-subtitle text-xs text-slate-400 mt-0.5">{t('hrm.sops.templatesDesc')} {t('hrm.sops.templatesSubDesc')}</p>
              </div>
              {isAdmin() && (
                <button
                  onClick={() => { setTemplateForm({ position_id: '', task_description: '' }); setShowTemplateModal(true); }}
                  className="sop-btn-primary px-4 py-2 bg-brand-green hover:bg-emerald-500 text-black text-sm font-bold rounded-xl transition-colors"
                >
                  + {t('hrm.sops.newTemplate')}
                </button>
              )}
            </div>

            {loadingTemplates ? (
              <div className="sop-empty-state py-8 text-center text-slate-400 text-sm">{t('hrm.sops.loadingTemplates')}</div>
            ) : templates.length === 0 ? (
              <div className="sop-empty-state py-10 text-center bg-surface-800 rounded-2xl border border-dashed border-slate-700 text-slate-500 text-sm">
                {t('hrm.sops.noTemplates')}
              </div>
            ) : (
              <div className="grid gap-4">
                {templates.map(tpl => (
                  <div key={tpl.id} className="sop-tpl-card bg-surface-800 rounded-2xl border border-white/5 p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="sop-tpl-icon w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-base">
                          {tpl.position_title?.charAt(0)}
                        </div>
                        <div>
                          <p className="sop-tpl-title text-white font-bold text-sm">{tpl.position_title}</p>
                          <p className="sop-tpl-meta text-xs text-slate-500">{t('hrm.sops.lastUpdated')} {new Date(tpl.updated_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      {isAdmin() && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditTemplate(tpl)}
                            className="sop-btn-edit text-indigo-400 text-xs hover:text-indigo-300 bg-indigo-500/10 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <Icon name="documents" size={17}/> {t('common.actions.edit')}
                          </button>
                          <button
                            onClick={() => deleteTplMutation.mutate(tpl.id)}
                            className="sop-btn-delete text-rose-400 text-xs hover:text-rose-300 bg-rose-500/10 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            {t('common.actions.delete')}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="sop-tpl-desc-box bg-surface-850 rounded-xl p-4 border border-white/5">
                      <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">{tpl.task_description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Section 2: Auto-Assign Month ── */}
          {isAdmin() && (
            <section className="sop-section">
              <h2 className="sop-section-title text-lg font-bold text-white mb-4"><Icon name="leave" size={17}/> {t('hrm.sops.monthlyAutoAssign')}</h2>
              <div className="sop-form-box bg-surface-800 rounded-2xl border border-white/5 p-6">
                <p className="sop-form-text text-sm text-slate-400 mb-5">
                  <span dangerouslySetInnerHTML={{ __html: t('hrm.sops.autoAssignDesc') }} />
                </p>
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label className="sop-label block text-xs font-semibold text-slate-400 mb-1">{t('hrm.sops.month')}</label>
                    <DatePicker
                      selected={autoMonth ? new Date(autoMonth + '-01T00:00:00') : null}
                      onChange={date => {
                        if (date) setAutoMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
                      }}
                      dateFormat="yyyy-MM"
                      showMonthYearPicker
                      className="sop-input bg-surface-850 border border-slate-700 text-white text-sm rounded-lg p-2 focus:border-indigo-500 outline-none w-full"
                    />
                  </div>
                  <button
                    onClick={() => autoAssignMutation.mutate(autoMonth)}
                    disabled={autoAssignMutation.isPending || templates.length === 0}
                    className="sop-btn-accent px-6 py-2.5 bg-brand-orange hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors flex items-center gap-2"
                  >
                    {autoAssignMutation.isPending ? (
                      <><span className="sop-spinner w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {t('hrm.sops.assigning')}</>
                    ) : (
                      <><span><Icon name="spark" size={17}/></span> {t('hrm.sops.autoAssignBtn')} {autoMonth}</>
                    )}
                  </button>
                </div>
                {templates.length === 0 && (
                  <p className="text-xs text-amber-400 mt-3">{t('hrm.sops.noTemplatesWarning')}</p>
                )}
              </div>
            </section>
          )}

          {/* ── Section 3: Daily SOP View (Filtered by Date) ── */}
          <section className="sop-section">
            <div className="flex items-center justify-between mb-4">
              <h2 className="sop-section-title text-lg font-bold text-white"><Icon name="leave" size={17}/> {t('hrm.sops.records')}</h2>
              <div className="flex items-center gap-3">
                <label className="sop-label text-xs font-semibold text-slate-400">{t('hrm.sops.viewDate')}:</label>
                <input
                  type="date"
                  value={viewDate}
                  onChange={e => setViewDate(e.target.value)}
                  className="sop-input bg-surface-850 border border-slate-700 text-white text-sm rounded-lg p-2 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>
            <div className="space-y-4">
              {isLoading ? (
                <div className="py-10 text-center"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin inline-block" /></div>
              ) : Object.entries(groupedSops).length === 0 ? (
                <div className="sop-empty-state py-12 text-center bg-surface-800 rounded-2xl border border-dashed border-slate-700 text-slate-500 text-sm">
                  {t('hrm.sops.noRecords')}
                </div>
              ) : Object.entries(groupedSops).map(([posTitle, groupSops]) => {
                const total = groupSops.length;
                const completed = groupSops.filter(s => s.is_completed).length;
                const isExpanded = expandedGroups[posTitle];

                return (
                  <div key={posTitle} className="sop-group-card rounded-2xl overflow-hidden bg-surface-800 border border-white/5">
                    <div className="sop-group-header flex justify-between items-center p-5 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => toggleGroup(posTitle)}>
                      <div className="flex items-center gap-4">
                        <div className="sop-group-icon w-12 h-12 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-lg">
                          {posTitle.charAt(0)}
                        </div>
                        <div>
                          <h3 className="sop-group-title text-white font-bold text-base">{posTitle}</h3>
                          <p className="sop-group-meta text-xs text-slate-400 mt-0.5">{total} {t('hrm.sops.tasksAssigned')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-5">
                        <span className="sop-group-badge text-xs font-bold px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          {completed} / {total} {t('hrm.sops.completed')}
                        </span>
                        <span className="sop-group-chevron text-slate-400 transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(180deg)' : '' }}>▼</span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="sop-group-body p-5 border-t border-white/5 bg-surface-850/50 space-y-3">
                        {Object.entries(
                          groupSops.reduce((acc, sop) => {
                            const key = `${sop.task_description}__${sop.title}`;
                            if (!acc[key]) acc[key] = { desc: sop.task_description, title: sop.title, sops: [] };
                            acc[key].sops.push(sop);
                            return acc;
                          }, {})
                        ).map(([key, { desc, title, sops: taskSops }]) => {
                          const taskTotal = taskSops.length;
                          const taskCompleted = taskSops.filter(s => s.is_completed).length;

                          return (
                            <div key={key} className="sop-task-card p-4 rounded-xl bg-surface-800 border border-white/5">
                              <div className="flex justify-between items-start mb-4">
                                <div>
                                  <p className="sop-task-title text-xs text-indigo-400 font-semibold mb-1">{title}</p>
                                  <p className="sop-task-desc text-sm text-white font-medium whitespace-pre-line">{desc}</p>
                                  <p className="sop-task-meta text-xs text-slate-400 mt-1.5">{t('hrm.sops.assignedTo', { count: taskTotal })}</p>
                                </div>
                                <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                                  <span className="sop-task-badge text-xs font-bold px-2 py-1 bg-white/5 text-slate-300 rounded">{taskCompleted} / {taskTotal} {t('hrm.sops.completedText')}</span>
                                  {isAdmin() && (
                                    <>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setEditText(desc); setEditTarget({ ids: taskSops.map(t => t.id), desc }); }}
                                        className="sop-btn-edit text-indigo-400 text-xs hover:text-indigo-300 bg-indigo-500/10 px-3 py-1.5 rounded-lg transition-colors"
                                      >
                                        <Icon name="documents" size={17}/> {t('common.actions.edit')}
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(taskSops.map(t => t.id)); }}
                                        className="sop-btn-delete text-rose-400 text-xs hover:text-rose-300 bg-rose-500/10 px-3 py-1.5 rounded-lg transition-colors"
                                      >
                                        {t('common.actions.delete')}
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="sop-task-list space-y-2 mt-4 pt-4 border-t border-white/5">
                                {taskSops.map(s => (
                                  <div key={s.id} className="sop-emp-row flex justify-between items-center bg-surface-850 p-3 rounded-lg border border-white/5">
                                    <div className="flex items-center gap-3">
                                      <span className={`sop-status-dot w-2 h-2 rounded-full ${s.is_completed ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                      <span className="sop-emp-name text-sm text-slate-300 font-medium">{s.employee_name}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      {s.is_completed && s.completed_at && (
                                        <span className="sop-emp-date text-xs text-slate-500">{new Date(s.completed_at).toLocaleDateString()}</span>
                                      )}
                                      {s.proof_video_url ? (
                                        <button onClick={() => setActiveVideoUrl(s.proof_video_url)} className="sop-btn-video text-xs px-3 py-1.5 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 rounded font-bold transition-colors flex items-center gap-1.5">
                                          {t('hrm.sops.viewVideo')}
                                        </button>
                                      ) : (
                                        <span className="sop-no-video text-[10px] text-slate-500 italic">{t('hrm.sops.noVideo')}</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* ══════════════════════════════════════
          TAB: TRACKING REPORT
      ══════════════════════════════════════ */}
      {activeTab === 'report' && <SopReportTab positions={positions} />}

      {/* ── Video Modal ── */}
      {activeVideoUrl && (
        <div className="sop-modal-overlay fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setActiveVideoUrl(null)} />
          <div className="sop-modal-content relative bg-surface-850 rounded-2xl w-full max-w-4xl shadow-2xl border border-white/10 overflow-hidden flex flex-col">
            <div className="sop-modal-header flex justify-between items-center p-4 border-b border-white/10">
              <h3 className="sop-modal-title text-white font-bold">{t('hrm.sops.proofVideoTitle')}</h3>
              <button aria-label="close" onClick={() => setActiveVideoUrl(null)} className="sop-modal-close text-slate-400 hover:text-white text-2xl"><Icon name="close" size={17}/></button>
            </div>
            <video src={activeVideoUrl} controls className="w-full max-h-[70vh]" autoPlay />
          </div>
        </div>
      )}

      {/* ── Template Save Modal ── */}
      {showTemplateModal && (
        <div className="sop-modal-overlay fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowTemplateModal(false)}>
          <div className="sop-modal-content bg-surface-800 w-full max-w-lg rounded-2xl shadow-2xl border border-indigo-500/30 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="sop-modal-header p-5 border-b border-slate-700 bg-indigo-500/5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="sop-modal-title text-white font-bold text-base">{t('hrm.sops.tplModalTitle')}</h3>
                  <p className="sop-modal-subtitle text-xs text-slate-400 mt-0.5">{t('hrm.sops.tplModalSubtitle')}</p>
                </div>
                <button aria-label="close" onClick={() => setShowTemplateModal(false)} className="sop-modal-close text-slate-400 hover:text-white text-xl"><Icon name="close" size={17}/></button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="sop-label block text-xs font-semibold text-slate-400 mb-1">{t('hrm.sops.position')}</label>
                <select
                  value={templateForm.position_id}
                  onChange={e => setTemplateForm(f => ({ ...f, position_id: e.target.value }))}
                  className="sop-input w-full bg-surface-850 border border-slate-700 text-white text-sm rounded-xl p-2.5 focus:border-indigo-500 outline-none"
                >
                  <option value="">{t('hrm.sops.selectPosition')}</option>
                  {positions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
              <div>
                <label className="sop-label block text-xs font-semibold text-slate-400 mb-1">{t('hrm.sops.standardTasks')}</label>
                <textarea
                  rows={8}
                  value={templateForm.task_description}
                  onChange={e => setTemplateForm(f => ({ ...f, task_description: e.target.value }))}
                  placeholder={"1. Clean the kitchen\n2. Wash the dishes\n3. Help the chef"}
                  className="sop-input w-full bg-surface-850 border border-slate-700 focus:border-indigo-500 text-white text-sm rounded-xl p-3 resize-none outline-none transition-colors"
                />
                <p className="text-xs text-slate-500 mt-1">{t('hrm.sops.tplTasksHelp')}</p>
              </div>
            </div>
            <div className="sop-modal-footer p-5 pt-0 flex gap-3">
              <button onClick={() => setShowTemplateModal(false)} className="sop-btn-cancel flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-2.5 text-sm font-medium transition-colors">
                {t('common.actions.cancel')}
              </button>
              <button
                onClick={() => saveTplMutation.mutate(templateForm)}
                disabled={saveTplMutation.isPending || !templateForm.position_id || !templateForm.task_description.trim()}
                className="sop-btn-primary flex-1 bg-brand-green hover:bg-emerald-500 disabled:opacity-50 text-black rounded-xl py-2.5 text-sm font-bold transition-colors"
              >
                {saveTplMutation.isPending ? t('common.actions.saving') : t('hrm.sops.saveTemplate')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Task Modal ── */}
      {editTarget && (
        <div className="sop-modal-overlay fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setEditTarget(null)}>
          <div className="sop-modal-content bg-surface-800 w-full max-w-lg rounded-2xl shadow-2xl border border-indigo-500/30 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="sop-modal-header p-5 border-b border-slate-700 bg-indigo-500/5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="sop-modal-title text-white font-bold text-base">{t('hrm.sops.editTaskTitle')}</h3>
                  <p className="sop-modal-subtitle text-xs text-slate-400 mt-0.5">{t('hrm.sops.editTaskSubtitle', { count: editTarget.ids.length })}</p>
                </div>
                <button aria-label="close" onClick={() => setEditTarget(null)} className="sop-modal-close text-slate-400 hover:text-white text-xl"><Icon name="close" size={17}/></button>
              </div>
            </div>
            <div className="p-5">
              <label className="sop-label block text-xs font-semibold text-slate-400 mb-2">{t('hrm.sops.taskDesc')}</label>
              <textarea
                rows={6}
                value={editText}
                onChange={e => setEditText(e.target.value)}
                className="sop-input w-full bg-surface-850 border border-slate-700 focus:border-indigo-500 text-white text-sm rounded-xl p-3 resize-none outline-none transition-colors"
              />
            </div>
            <div className="sop-modal-footer p-5 pt-0 flex gap-3">
              <button onClick={() => setEditTarget(null)} className="sop-btn-cancel flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-2.5 text-sm font-medium transition-colors">{t('common.actions.cancel')}</button>
              <button
                onClick={() => editMutation.mutate({ ids: editTarget.ids, task_description: editText })}
                disabled={editMutation.isPending || !editText.trim()}
                className="sop-btn-primary flex-1 bg-brand-green hover:bg-emerald-500 disabled:opacity-50 text-black rounded-xl py-2.5 text-sm font-bold transition-colors"
              >
                {editMutation.isPending ? t('common.actions.saving') : t('common.actions.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget)}
        itemName={t('hrm.sops.deleteConfirmItem')}
      />
    </Layout>
  );
}
