import {can} from '../../../../shared/accessPolicy.js';
import CredentialNotice from '../../components/experience/CredentialNotice';
import useCreateIntent from '../../hooks/useCreateIntent';
import Icon from '../../components/common/Icon';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '../../context/LanguageContext';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import JobOpenings from '../../components/recruitment/JobOpenings';
import JobOpeningDetails from '../../components/recruitment/JobOpeningDetails';

export default function Recruitment() {
  const { t } = useLanguage();
  const x = key => t(`common.experience.${key}`);
  const r = key => t(`common.recruitmentUpgrade.${key}`);
  const { isAdmin,user } = useAuth();
  const canConvert=can(user,'recruitment','create')&&(user?.is_owner||user?.access?.scope==='all');
  const [workspace,setWorkspace] = useState(isAdmin() ? 'openings' : 'candidates');
  const [openingFilter,setOpeningFilter] = useState('');
  const [candidateOpening,setCandidateOpening] = useState('');
  const [showModal, setShowModal] = useState(false);
  useCreateIntent(setShowModal);
  useEffect(()=>{if(showModal)setWorkspace('candidates');},[showModal]);
  const [showPositionModal, setShowPositionModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkPosFilter, setBulkPosFilter] = useState('');
  const [bulkStageFilter, setBulkStageFilter] = useState('All');
  const [activeTabState, setActiveTabState] = useState(localStorage.getItem('recruitmentTab') || 'pipeline');
  const activeTab = activeTabState;
  const setActiveTab = (tab) => { setActiveTabState(tab); localStorage.setItem('recruitmentTab', tab); };
  const [searchQuery, setSearchQuery] = useState('');
  const [scheduleModalCandidate, setScheduleModalCandidate] = useState(null);
  const [detailModalCandidate, setDetailModalCandidate] = useState(null);
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [viewMode, setViewMode] = useState('board');
  const [confirmDialog, setConfirmDialog] = useState(null);
  const qc = useQueryClient();

  const { data, isLoading, error: recruitmentError, refetch: refreshCandidates, isFetching } = useQuery({ queryKey: ['recruitment'], queryFn: () => api.get('/recruitment').then(r => r.data) });
  useEffect(()=>{if(workspace==='candidates')void refreshCandidates();},[workspace,refreshCandidates]);
  const { data: deptsData } = useQuery({ queryKey: ['departments'], queryFn: () => api.get('/departments').then(r => r.data) });
  const departments = deptsData?.departments || [];

  const addMutation = useMutation({
    mutationFn: (body) => api.post('/recruitment', body, body instanceof FormData ? {headers:{'Content-Type':'multipart/form-data'}} : undefined),
    onSuccess: () => { qc.invalidateQueries({queryKey:['recruitment']}); setShowModal(false); toast.success('Candidate added successfully!'); },
    onError: (err) => { toast.error(err.response?.data?.error || err.message); }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }) => api.put(`/recruitment/${id}`, body),
    onSuccess: () => qc.invalidateQueries({queryKey:['recruitment']}),
  });

  const bulkTalentPoolMutation = useMutation({
    mutationFn: (body) => api.post('/recruitment/bulk-move-talent-pool', body),
    onSuccess: (res) => {
      qc.invalidateQueries({queryKey:['recruitment']});
      setShowBulkModal(false);
      toast.success(res.data.message || 'Candidates moved to Talent Pool!');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to move candidates')
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/recruitment/${id}`),
    onSuccess: () => qc.invalidateQueries({queryKey:['recruitment']}),
  });

  const addPositionMutation = useMutation({
    mutationFn: (body) => api.post('/positions', body),
    onSuccess: () => { qc.invalidateQueries({queryKey:['recruitment']}); setShowPositionModal(false); toast.success('Position added!'); }
  });

  const generateGuideMutation = useMutation({
    mutationFn: (id) => api.post(`/recruitment/${id}/interview-guide`, {language:document.documentElement.lang}),
    onSuccess: (res, id) => {
      qc.invalidateQueries({queryKey:['recruitment']});
      setDetailModalCandidate(current=>current?.id===id?{...current,interview_guide:res.data.interview_guide}:current);
      toast.success('Interview guide generated!');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Generation failed')
  });

  const sendInterviewMutation = useMutation({
    mutationFn: ({ id, data }) => api.post(`/recruitment/${id}/send-interview`, data),
    onSuccess: (res) => {
      qc.invalidateQueries({queryKey:['recruitment']});
      setScheduleModalCandidate(null);
      toast.success(res.data.message || 'Interview offer sent!');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to send offer')
  });

  const convertMutation = useMutation({
    mutationFn: (id) => api.post(`/recruitment/${id}/convert`),
    onSuccess: (res) => {
      qc.invalidateQueries({queryKey:['recruitment']});
      setCreatedCredentials(res.data.already_converted?null:(res.data.credentials || null));
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success(res.data.message || 'Employee account created');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to convert')
  });

  const handleSave = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (!fd.get('resume')?.size) fd.delete('resume');
    fd.set('language', document.documentElement.lang);
    addMutation.mutate(fd);
  };

  const handlePositionSave = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd);
    data.is_hiring = true;
    addPositionMutation.mutate(data);
  };

  const handleScheduleSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    sendInterviewMutation.mutate({
      id: scheduleModalCandidate.id,
      data: Object.fromEntries(fd)
    });
  };

  const candidates = data?.candidates || [];
  const positions = data?.positions || [];
  const openings = data?.openings || [];

  const q = searchQuery.trim().toLowerCase();
  const matched = candidates.filter(c => (!openingFilter || (openingFilter === 'none' ? !c.opening_id : c.opening_id === openingFilter)) && (!q || [c.full_name,c.candidate_name,c.email,c.position_title].some(value => (value || '').toLowerCase().includes(q))));
  const inPipeline = matched.filter(c => ['Applied','Screening','Interview','Offer'].includes(c.status) || !c.status);
  const hired = matched.filter(c => c.status === 'Hired');
  const talentPool = matched.filter(c => c.status === 'Rejected' || c.status === 'Talent Pool');
  const stats = {
    total: candidates.length,
    pipeline: candidates.filter(c => ['Applied','Screening','Interview','Offer'].includes(c.status) || !c.status).length,
    shortlisted: candidates.filter(c => c.status === 'Interview' || c.status === 'Offer').length,
    hired: candidates.filter(c => c.status === 'Hired').length,
    pool: candidates.filter(c => ['Rejected','Talent Pool'].includes(c.status)).length,
  };

  const columns = [
    { id: 'Applied', title: 'APPLIED', items: inPipeline.filter(c => c.status === 'Applied' || !c.status).sort((a, b) => parseFloat(b.ai_score || 0) - parseFloat(a.ai_score || 0)) },
    { id: 'Screening', title: 'SCREENING', items: inPipeline.filter(c => c.status === 'Screening').sort((a, b) => parseFloat(b.ai_score || 0) - parseFloat(a.ai_score || 0)) },
    { id: 'Interview', title: 'INTERVIEW', items: inPipeline.filter(c => c.status === 'Interview').sort((a, b) => parseFloat(b.ai_score || 0) - parseFloat(a.ai_score || 0)) },
    { id: 'Offer', title: 'OFFER', items: inPipeline.filter(c => c.status === 'Offer').sort((a, b) => parseFloat(b.ai_score || 0) - parseFloat(a.ai_score || 0)) },
  ];

  const workspaceNav = isAdmin() && <nav className="recruitment-workspace-tabs" aria-label={t('hrm.recruitment.title')}><button aria-pressed={workspace==='openings'} onClick={()=>setWorkspace('openings')}><Icon name="positions" size={17}/>{r('jobOpenings')}</button><button aria-pressed={workspace==='candidates'} onClick={()=>setWorkspace('candidates')}><Icon name="staff" size={17}/>{r('candidates')}</button></nav>;
  if (workspace === 'openings' && isAdmin()) return <Layout title={t('hrm.recruitment.title')}>{workspaceNav}<JobOpenings onViewCandidates={id=>{setOpeningFilter(id);setWorkspace('candidates');setActiveTab('pipeline');setSearchQuery('');}}/></Layout>;
  return (
    <Layout title={t('hrm.recruitment.title')} subtitle={t('hrm.recruitment.activePipeline') + ' - ' + t('hrm.recruitment.hiredCount') + ' - ' + t('hrm.recruitment.rejectedCount') + ' ' + t('hrm.recruitment.talentPool')}>
      {workspaceNav}
      {recruitmentError&&<p className="job-notice" role="alert">{recruitmentError.response?.data?.error||recruitmentError.message}</p>}
      <CredentialNotice credentials={createdCredentials} onDismiss={() => setCreatedCredentials(null)}/>
      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <StatBox onClick={() => { setActiveTab('pipeline'); setSearchQuery(''); }} icon="👥" label={t('hrm.recruitment.totalCandidates')} value={stats.total} bg="rect-stat-box bg-white/5" text="rect-stat-val text-white" />
        <StatBox onClick={() => setActiveTab('pipeline')} icon="🔄" label={t('hrm.recruitment.inPipeline')} value={stats.pipeline} bg="rect-stat-box bg-indigo-500/10 border border-indigo-500/20" text="rect-stat-val text-indigo-400" />
        <StatBox onClick={() => setActiveTab('pipeline')} icon="⭐" label={t('hrm.recruitment.shortlisted')} value={stats.shortlisted} bg="rect-stat-box bg-amber-500/10 border border-amber-500/20" text="rect-stat-val text-amber-400" />
        <StatBox onClick={() => setActiveTab('hired')} icon="✅" label={t('hrm.recruitment.hired')} value={stats.hired} bg="rect-stat-box bg-emerald-500/10 border border-emerald-500/20" text="rect-stat-val text-emerald-400" />
        <StatBox onClick={() => setActiveTab('pool')} icon="📁" label={t('hrm.recruitment.talentPool')} value={stats.pool} bg="rect-stat-box bg-orange-500/10 border border-orange-500/20" text="rect-stat-val text-orange-400" />
      </div>

      {/* Filters and Actions */}
      <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
        <div className="flex gap-2">
          <TabButton active={activeTab === 'pipeline'} onClick={() => setActiveTab('pipeline')} icon="🔄" label={t('hrm.recruitment.activePipeline')} activeClass="rect-tab-active bg-indigo-600 text-white" inactiveClass="rect-tab-inactive bg-white/5 text-slate-400 hover:bg-white/10" />
          <TabButton active={activeTab === 'hired'} onClick={() => setActiveTab('hired')} icon="✅" label={t('hrm.recruitment.hired')} activeClass="rect-tab-active-hired bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" inactiveClass="rect-tab-inactive bg-white/5 text-slate-400 hover:bg-white/10" />
          <TabButton active={activeTab === 'pool'} onClick={() => setActiveTab('pool')} icon="📁" label={t('hrm.recruitment.talentPool')} activeClass="rect-tab-active-pool bg-orange-500/20 text-orange-400 border border-orange-500/30" inactiveClass="rect-tab-inactive bg-white/5 text-slate-400 hover:bg-white/10" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => { setBulkPosFilter(''); setBulkStageFilter('All'); setShowBulkModal(true); }}
            className="rect-btn-bulk px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-bold rounded-xl border border-amber-500/20 flex items-center gap-2 transition-all shadow-md"
          >
            <svg className="w-4 h-4 text-amber-400 rect-bulk-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v1a2 2 0 01-2 2M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
            <span>{t('hrm.recruitment.moveToPool')}</span>
          </button>
          <button onClick={() => setShowPositionModal(true)} className="rect-btn-secondary px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-xs font-semibold rounded-xl border border-white/10">
            + {t('hrm.recruitment.position')}
          </button>
          <button onClick={() => setShowModal(true)} className="rect-btn-primary px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl">
            + {t('hrm.recruitment.addCandidate')}
          </button>
        </div>
      </div>

      <div className="ux-candidate-tools"><button type="button" className="ux-button ux-button-secondary" disabled={isFetching} onClick={()=>refreshCandidates()}>{r('refreshCandidates')}</button><label className="ux-candidate-search"><Icon name="search" size={18}/><input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={x('searchCandidates')} aria-label={x('searchCandidates')}/>{searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search"><Icon name="close" size={15}/></button>}</label>{activeTab === 'pipeline' && <div className="ux-view-toggle" role="group" aria-label="Candidate view">{['board','list'].map(view => <button key={view} type="button" aria-pressed={viewMode === view} onClick={() => setViewMode(view)}><Icon name={view === 'board' ? 'dashboard' : 'documents'} size={16}/>{x(view)}</button>)}</div>}</div>
      <label className="job-opening-filter"><span>{r('opening')}</span><select aria-label={r('opening')} value={openingFilter} onChange={e=>setOpeningFilter(e.target.value)}><option value="">{r('allOpenings')}</option><option value="none">{r('noOpening')}</option>{openings.map(o=><option key={o.id} value={o.id}>{o.title} · {r(o.status)}</option>)}</select></label>
      {/* Kanban Board */}
      {isLoading ? (
        <div className="py-20 text-center"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin inline-block" /></div>
       ) : activeTab === 'pipeline' && viewMode === 'list' ? (
        <section className="uyf-panel overflow-x-auto"><table className="w-full text-left"><thead><tr>{['candidate','position','stage','score'].map(key => <th key={key}>{x(key)}</th>)}<th><span className="sr-only">{x('viewCandidate')}</span></th></tr></thead><tbody>{inPipeline.map(c => <tr key={c.id}><td><strong>{c.full_name || c.candidate_name}</strong><small className="block text-slate-500">{c.email || '—'}</small></td><td>{c.position_title || '—'}</td><td><span className="ux-status">{c.status || 'Applied'}</span></td><td>{c.ai_score == null ? x('notAssessed') : `${c.ai_score}/10`}</td><td><button type="button" className="ux-button ux-button-secondary" onClick={() => setDetailModalCandidate(c)}>{x('viewCandidate')}<Icon name="arrowRight" size={15}/></button></td></tr>)}</tbody></table>{!inPipeline.length && <div className="ux-empty"><Icon name="recruitment"/><p>{t('hrm.recruitment.noCandidates')}</p></div>}</section>
      ) : activeTab === 'pipeline' ? (
        <div className="flex overflow-x-auto gap-6 pb-4">
          {columns.map(col => (
            <div key={col.id} className="rect-column min-w-[320px] w-[320px] flex flex-col h-[calc(100vh-320px)] bg-surface-800 border border-white/5 rounded-2xl p-4">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="rect-column-header text-xs font-bold text-indigo-400 tracking-wider">{col.title}</h3>
                  <span className="rect-column-count bg-indigo-500/20 text-indigo-300 text-xs font-bold px-2 py-0.5 rounded-full">{col.items.length}</span>
                </div>
                {col.items.length > 0 && (
                  <button
                    type="button"
                    title={`Move all ${col.title} candidates to Talent Pool`}
                    onClick={() => { setBulkPosFilter(''); setBulkStageFilter(col.id); setShowBulkModal(true); }}
                    className="rect-btn-move-pool text-[10px] font-bold text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 px-2 py-1 rounded-lg border border-transparent hover:border-amber-500/20 transition-all flex items-center gap-1"
                  >
                    <span>Move to Pool</span>
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-hide">
                {col.items.length === 0 ? (
                  <p className="text-center text-slate-500 text-sm mt-10 italic">{t('hrm.recruitment.noCandidates')}</p>
                ) : col.items.map(c => (
                  <CandidateCard
                    key={c.id}
                    candidate={c}
                    onClick={() => setDetailModalCandidate(c)}
                    onUpdate={(status) => updateMutation.mutate({ id: c.id, status })}
                    onOpenGuide={() => setScheduleModalCandidate(c)}
                    onConvert={() => canConvert ? setConfirmDialog({
                      title: 'Convert to Employee',
                      message: 'Are you sure you want to officially convert this candidate into an employee?',
                      actionText: 'Convert',
                      actionColor: 'rect-btn-convert-confirm bg-emerald-600 hover:bg-emerald-700',
                      onConfirm: () => convertMutation.mutate(c.id)
                    }) : toast.error('Converting candidates requires Recruitment Create access and the All employees scope.')}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {activeTab === 'pool' && (
            <div className="rect-pool-alert col-span-full bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 mb-6 flex items-start gap-4">
              <span className="text-2xl"><Icon name="documents" size={17}/></span>
              <div>
                <h3 className="rect-pool-alert-title text-rose-400 font-bold text-sm mb-1">Talent Pool — Rejected Candidates</h3>
                <p className="rect-pool-alert-text text-slate-400 text-xs">These candidates were not selected for a previous role but their resumes and information are kept for future opportunities. You can reconsider any of them for a new position.</p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {(activeTab === 'hired' ? hired : talentPool).length === 0 ? (
              <div className="col-span-full py-20 text-center text-slate-500 bg-surface-800 rounded-2xl border border-white/5 border-dashed">
                No candidates in {activeTab === 'hired' ? 'Hired' : 'Talent Pool'}.
              </div>
            ) : (
              (activeTab === 'hired' ? hired : talentPool).map(c => (
                activeTab === 'pool' ? (
                  <TalentPoolCard
                    key={c.id}
                    candidate={c}
                    positions={positions}
                    onReconsider={(posId) => updateMutation.mutate({ id: c.id, status: 'Applied', position_id: posId })}
                    onDelete={() => setConfirmDialog({
                      title: 'Delete Candidate',
                      message: 'Are you sure you want to permanently delete this candidate?',
                      actionText: 'Delete',
                      actionColor: 'bg-rose-600 hover:bg-rose-700',
                      onConfirm: () => deleteMutation.mutate(c.id)
                    })}
                  />
                ) : (
                  <CandidateCard
                    key={c.id}
                    candidate={c}
                    onClick={() => setDetailModalCandidate(c)}
                    onUpdate={(status) => updateMutation.mutate({ id: c.id, status })}
                    onOpenGuide={() => setScheduleModalCandidate(c)}
                    onConvert={() => canConvert ? setConfirmDialog({
                      title: 'Convert to Employee',
                      message: 'Are you sure you want to officially convert this candidate into an employee?',
                      actionText: 'Convert',
                      actionColor: 'bg-emerald-600 hover:bg-emerald-700',
                      onConfirm: () => convertMutation.mutate(c.id)
                    }) : toast.error('Converting candidates requires Recruitment Create access and the All employees scope.')}
                  />
                )
              ))
            )}
          </div>
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="rect-modal-overlay absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { if(!addMutation.isPending)setShowModal(false); }} />
          <div className="rect-modal-content relative rounded-2xl w-full max-w-md max-h-[90dvh] overflow-y-auto m-4 p-6 bg-surface-850 border border-white/10">
            <h2 className="rect-modal-title text-base font-bold text-white mb-4">Add Candidate</h2>
            <form onSubmit={handleSave}><fieldset className="space-y-4" disabled={addMutation.isPending}>
              <div><label className="rect-label form-label">Name *</label><input name="candidate_name" required className="rect-input form-input" /></div>
              <div><label className="rect-label form-label">{r('opening')}</label><select name="opening_id" className="rect-input form-input" value={candidateOpening} onChange={e=>setCandidateOpening(e.target.value)}><option value="">{r('legacyPosition')}</option>{openings.filter(o=>o.revision>0).map(o=><option key={o.id} value={o.id}>{o.title} · {r(o.status)}</option>)}</select></div>
              {!candidateOpening && <div>
                <label className="rect-label form-label">Applying For</label>
                <select name="position_id" className="rect-input form-input">
                  <option value="">Select Position...</option>
                  {positions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>}
              <div><label className="rect-label form-label">Email</label><input type="email" name="email" className="rect-input form-input" /></div>
              <div><label className="rect-label form-label">Phone</label><input name="phone" className="rect-input form-input" /></div>
              {candidateOpening&&<><label className="job-field"><span>{r('resume')}</span><input type="file" name="resume" accept=".pdf,.docx,.txt"/></label><label className="job-field"><span>{r('coverLetter')}</span><textarea name="cover_letter" rows={3} maxLength={15000}/></label></>}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => { if(!addMutation.isPending)setShowModal(false); }} className="rect-btn-cancel flex-1 px-4 py-2.5 bg-white/5 text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" className="rect-btn-save flex-1 px-4 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl">{addMutation.isPending?r('working'):'Save'}</button>
              </div>
            </fieldset></form>
          </div>
        </div>
      )}

      {showPositionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="rect-modal-overlay absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPositionModal(false)} />
          <div className="rect-modal-content relative rounded-2xl w-full max-w-md m-4 p-6 shadow-2xl bg-surface-850 border border-white/5">
            <div className="flex justify-between items-center mb-6">
              <h2 className="rect-modal-title text-sm font-bold text-white">Add Position</h2>
              <button aria-label="close" onClick={() => setShowPositionModal(false)} className="rect-modal-close text-slate-500 hover:text-white"><Icon name="close" size={17}/></button>
            </div>

            <form onSubmit={handlePositionSave} className="space-y-4">
              <div>
                <label className="rect-label block text-[10px] font-bold text-slate-400 mb-1">JOB TITLE *</label>
                <input name="title" required placeholder="e.g. Senior Engineer" className="rect-input w-full bg-surface-800 border border-white/5 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="rect-label block text-[10px] font-bold text-slate-400 mb-1">LEVEL</label>
                  <select name="level" className="rect-input w-full bg-surface-800 border border-white/5 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                    <option value="Mid">Mid</option>
                    <option value="Supervisor">Supervisor</option>
                    <option value="Manager">Manager</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="rect-label block text-[10px] font-bold text-slate-400 mb-1">TEAM / DEPT</label>
                  <select name="department" className="rect-input w-full bg-surface-800 border border-white/5 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                    <option value="">— Select Dept —</option>
                    {departments.map(d => <option key={d.id} value={d.Department_name}>{d.Department_name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="rect-label block text-[10px] font-bold text-slate-400 mb-1">BASE SALARY</label>
                <input type="number" name="base_salary" defaultValue="0" className="rect-input w-full bg-surface-800 border border-white/5 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowPositionModal(false)} className="rect-btn-cancel flex-1 py-2 bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-semibold rounded-lg transition-colors">
                  Cancel
                </button>
                <button type="submit" className="rect-btn-save flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg transition-colors">
                  Create Position
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BULK MOVE TO TALENT POOL MODAL */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="rect-modal-overlay absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowBulkModal(false)} />
          <div className="rect-modal-content relative rounded-2xl w-full max-w-md p-6 bg-surface-850 border border-white/10 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-400 rect-bulk-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v1a2 2 0 01-2 2M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
                <h2 className="rect-modal-title text-base font-bold text-white">Move Candidates to Talent Pool</h2>
              </div>
              <button aria-label="close" onClick={() => setShowBulkModal(false)} className="rect-modal-close text-slate-500 hover:text-white"><Icon name="close" size={17}/></button>
            </div>

            <p className="rect-label text-xs text-slate-400 mb-4 leading-relaxed">
              Move candidates who were not selected for a position into the Talent Pool so their profiles and resumes are archived for future job opportunities.
            </p>

            {(() => {
              let affectedCandidates = inPipeline;
              if (bulkPosFilter) {
                affectedCandidates = affectedCandidates.filter(c => String(c.position_id) === String(bulkPosFilter));
              }
              if (bulkStageFilter && bulkStageFilter !== 'All') {
                affectedCandidates = affectedCandidates.filter(c => c.status === bulkStageFilter);
              }

              return (
                <div className="space-y-4">
                  <div>
                    <label className="rect-label block text-[10px] font-bold text-slate-400 mb-1">FILTER BY POSITION</label>
                    <select
                      value={bulkPosFilter}
                      onChange={e => setBulkPosFilter(e.target.value)}
                      className="rect-input w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">All Job Positions</option>
                      {positions.map(p => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="rect-label block text-[10px] font-bold text-slate-400 mb-1">FILTER BY STAGE / COLUMN</label>
                    <select
                      value={bulkStageFilter}
                      onChange={e => setBulkStageFilter(e.target.value)}
                      className="rect-input w-full bg-surface-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="All">All Pipeline Stages (Applied, Screening, Interview, Offer)</option>
                      <option value="Applied">Only APPLIED</option>
                      <option value="Screening">Only SCREENING</option>
                      <option value="Interview">Only INTERVIEW</option>
                      <option value="Offer">Only OFFER</option>
                    </select>
                  </div>

                  <div className="rect-bulk-alert p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center justify-between">
                    <span className="rect-bulk-alert-text">Candidates to be moved:</span>
                    <strong className="rect-bulk-alert-val text-base font-extrabold text-white px-2 py-0.5 rounded bg-amber-500/20">{affectedCandidates.length}</strong>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowBulkModal(false)}
                      className="rect-btn-cancel flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={affectedCandidates.length === 0 || bulkTalentPoolMutation.isPending}
                      onClick={() => bulkTalentPoolMutation.mutate({ position_id: bulkPosFilter, stage: bulkStageFilter })}
                      className="rect-bulk-btn flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-lg shadow-amber-500/20"
                    >
                      {bulkTalentPoolMutation.isPending ? 'Moving...' : `Move ${affectedCandidates.length} to Talent Pool`}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}


      {/* INTERVIEW SCHEDULING MODAL */}
      {scheduleModalCandidate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="rect-modal-content bg-surface-850 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden flex flex-col shadow-2xl">
            <div className="rect-modal-header p-6 border-b border-white/10 bg-surface-850">
              <h2 className="rect-modal-title text-xl font-bold text-white mb-1">Schedule Interview</h2>
              <p className="rect-modal-subtitle text-sm text-slate-400">Send offer to {scheduleModalCandidate.full_name}</p>
            </div>
            <form onSubmit={handleScheduleSubmit} className="p-6 space-y-4">
              <div>
                <label className="rect-label block text-xs font-bold text-slate-400 mb-1">DATE</label>
                <input type="date" name="date" required className="rect-input w-full bg-surface-800 border border-white/10 text-white rounded-lg px-3 py-2 outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="rect-label block text-xs font-bold text-slate-400 mb-1">TIME</label>
                <input type="time" name="time" required className="rect-input w-full bg-surface-800 border border-white/10 text-white rounded-lg px-3 py-2 outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="rect-label block text-xs font-bold text-slate-400 mb-1">MEETING LINK / LOCATION</label>
                <input type="text" name="link" required placeholder="e.g. Zoom link or Office Address" className="rect-input w-full bg-surface-800 border border-white/10 text-white rounded-lg px-3 py-2 outline-none focus:border-indigo-500" />
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setScheduleModalCandidate(null)}
                  className="rect-btn-cancel flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendInterviewMutation.isPending}
                  className="rect-btn-save flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex justify-center items-center gap-2"
                >
                  {sendInterviewMutation.isPending ? 'Sending...' : '✉ Send Offer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GLOBAL CONFIRM DIALOG */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="rect-modal-content bg-surface-850 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden flex flex-col shadow-2xl">
            <div className="p-6 text-center">
              <div className="rect-dialog-icon w-16 h-16 rounded-full bg-indigo-500/10 text-indigo-400 mx-auto flex items-center justify-center text-3xl mb-4">
                ❓
              </div>
              <h2 className="rect-modal-title text-xl font-bold text-white mb-2">{confirmDialog.title}</h2>
              <p className="rect-modal-subtitle text-slate-400 text-sm">{confirmDialog.message}</p>
            </div>
            <div className="rect-dialog-footer p-6 border-t border-white/10 bg-surface-850 flex gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className="rect-btn-cancel flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
                className={`rect-btn-confirm flex-1 py-2.5 font-bold rounded-xl transition-colors text-white ${confirmDialog.actionColor || 'bg-indigo-600 hover:bg-indigo-700'}`}
              >
                {confirmDialog.actionText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANDIDATE DETAIL MODAL */}
      {detailModalCandidate && (
        <CandidateDetailModal candidate={detailModalCandidate} onClose={() => setDetailModalCandidate(null)} onGenerateGuide={isAdmin()?()=>generateGuideMutation.mutate(detailModalCandidate.id):undefined} generatingGuide={generateGuideMutation.isPending}/>
      )}

    </Layout>
  );
}

function StatBox({ icon, label, value, bg, text, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-2xl flex items-center gap-4 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${onClick ? 'cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:border-indigo-500/30' : ''} ${bg}`}
    >
      <div className={`text-xl ${text}`}><Icon name={icon} size={21}/></div>
      <div>
        <div className={`text-2xl font-bold ${text}`}>{value}</div>
        <div className="rect-stat-label text-xs text-slate-400 font-semibold">{label}</div>
      </div>
    </button>
  );
}

function TabButton({ active, onClick, icon, label, activeClass, inactiveClass }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${active ? activeClass : inactiveClass}`}>
      <Icon name={icon} size={16}/> {label}
    </button>
  );
}

function CandidateCard({ candidate: c, onUpdate, onOpenGuide, onConvert, onClick }) {
  const { t } = useLanguage();
  const initial = (c.full_name || 'U')[0].toUpperCase();
  const [newStatus, setNewStatus] = useState(c.status || 'Applied');

  return (
    <div className="rect-card bg-surface-850 border border-white/5 p-4 rounded-xl shadow-lg transition-transform hover:-translate-y-1 hover:border-indigo-500/30">
      <div className="flex gap-3 mb-3 cursor-pointer group" onClick={onClick}>
        <div className="rect-avatar w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-lg flex-shrink-0 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
          {initial}
        </div>
        <div className="overflow-hidden flex-1">
          <h4 className="rect-card-name font-bold text-white text-sm truncate group-hover:text-indigo-400 transition-colors">{c.full_name}</h4>
          <p className="rect-card-meta text-slate-400 text-xs truncate mt-0.5">{c.email || c.phone || 'No contact info'}</p>
        </div>
      </div>

      <div className="rect-ai-box bg-surface-900 border border-white/5 rounded-lg p-3 mb-4">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="rect-ai-icon text-amber-400 text-xs"><Icon name="rating" size={17}/></span>
          <span className="rect-ai-score text-white text-xs font-bold">AI Match: {c.ai_score == null ? t('common.experience.notAssessed') : `${c.ai_score}/10`}</span>
        </div>
        <p
          className="rect-ai-reason text-slate-400 text-[10px] leading-tight line-clamp-2 mb-2 cursor-help"
          title={c.ai_reasoning || 'No AI reasoning available.'}
        >
          {c.ai_reasoning || 'No AI reasoning available.'}
        </p>
        <button
          onClick={() => onOpenGuide()}
          className="rect-btn-schedule w-full py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-[10px] font-bold rounded-md border border-indigo-500/20 transition-colors flex items-center justify-center gap-1.5"
        >
          ✉ Schedule & Send Offer
        </button>
      </div>

      <div className="flex justify-between items-center mb-3">
        <span className="rect-source px-2 py-0.5 bg-white/5 text-slate-400 text-[10px] rounded">Direct</span>
        <span className="rect-date text-slate-500 text-[10px]">{(c.created_at || '').slice(0, 10)}</span>
      </div>

      <div className="flex flex-col gap-2">
        <select
          value={newStatus}
          onChange={e => setNewStatus(e.target.value)}
          className="rect-status-select w-full bg-surface-800 border border-white/10 text-white text-xs px-2 py-1.5 rounded-lg outline-none"
        >
          {['Applied', 'Screening', 'Interview', 'Offer', 'Hired'].map((stage, idx) => {
            const currentIdx = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired'].indexOf(c.status || 'Applied');
            // Only show the current stage, future stages, or if they are somehow not in this list
            if (idx >= currentIdx || currentIdx === -1) {
              return <option key={stage} value={stage}>→ {stage === 'Hired' ? 'Mark as Hired' : `Move to ${stage}`}</option>;
            }
            return null;
          })}
          <option value="Rejected">→ Move to Talent Pool</option>
        </select>
        {newStatus !== c.status && (
          <button
            onClick={() => onUpdate(newStatus)}
            className="rect-btn-update w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-1.5 rounded-lg transition-colors"
          >
            Update Stage
          </button>
        )}

        {c.status === 'Hired' && (
          <button
            onClick={() => onConvert()}
            className="rect-btn-convert w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 rounded-lg transition-colors mt-2 flex items-center justify-center gap-2"
          >
            <Icon name="spark" size={17}/> Add to Employees
          </button>
        )}
      </div>
    </div>
  );
}

function TalentPoolCard({ candidate: c, onReconsider, onDelete, positions }) {
  const initial = (c.full_name || 'U')[0].toUpperCase();
  const [reconsiderPos, setReconsiderPos] = useState('');

  const colors = [
    'bg-rose-500/20 text-rose-400',
    'bg-indigo-500/20 text-indigo-400',
    'bg-emerald-500/20 text-emerald-400',
    'bg-amber-500/20 text-amber-400',
    'bg-orange-500/20 text-orange-400',
    'bg-teal-500/20 text-teal-400'
  ];
  const charCode = initial.charCodeAt(0) || 0;
  const colorClass = colors[charCode % colors.length];

  return (
    <div className="rect-pool-card bg-surface-850 border border-white/5 p-4 rounded-xl shadow-lg flex flex-col h-full">
      <div className="flex gap-4 mb-4">
        <div className={`rect-pool-avatar w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0 ${colorClass}`}>
          {initial}
        </div>
        <div className="overflow-hidden">
          <h4 className="rect-pool-name font-bold text-white text-base truncate">{c.full_name}</h4>
          <p className="rect-pool-role text-rose-400 text-xs truncate mt-0.5">Previously applied: {c.position_title}</p>
          <p className="rect-pool-email text-slate-500 text-xs truncate mt-0.5">{c.email}</p>
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <span className="rect-source text-slate-400 text-xs">Direct</span>
        <span className="rect-date text-slate-500 text-xs">{(c.created_at || '').slice(0, 10)}</span>
      </div>

      <div className="mt-auto space-y-3 pt-4 border-t border-white/5">
        <select
          value={reconsiderPos}
          onChange={e => setReconsiderPos(e.target.value)}
          className="rect-pool-select w-full bg-surface-800 border border-white/10 text-white text-xs px-3 py-2 rounded-lg outline-none appearance-none"
        >
          <option value="">— Reconsider for Position —</option>
          {positions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>

        <div className="flex gap-2">
          <button
            onClick={() => onReconsider(reconsiderPos)}
            disabled={!reconsiderPos}
            className="rect-btn-reconsider flex-1 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-bold rounded-lg border border-amber-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ★ Reconsider
          </button>
          <a
            href={c.email ? `mailto:${c.email}` : '#'}
            className="rect-btn-contact flex-1 flex justify-center items-center py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-xs font-bold rounded-lg border border-indigo-500/20 transition-colors text-center"
          >
            ✉ Contact
          </a>
        </div>

        <button onClick={onDelete} className="rect-btn-delete w-full py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold rounded-lg border border-rose-500/20 transition-colors mt-2">
          <Icon name="trash" size={17}/> Delete Candidate
        </button>
      </div>
    </div>
  );
}

function CandidateDetailModal({ candidate, onClose, onGenerateGuide, generatingGuide }) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('ai');
  const initial = (candidate.full_name || 'U')[0].toUpperCase();
  const formData = candidate.form_data || {};

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="rect-detail-modal bg-surface-850 border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">

        {/* Header */}
        <div className="rect-detail-header p-6 border-b border-white/10 flex justify-between items-start bg-gradient-to-r from-indigo-900/40 to-transparent">
          <div className="flex gap-4 items-center">
            <div className="rect-detail-avatar w-16 h-16 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-3xl">
              {initial}
            </div>
            <div>
              <h2 className="rect-detail-title text-2xl font-bold text-white mb-1">{candidate.full_name}</h2>
              <div className="flex flex-wrap gap-2 text-sm">
                {candidate.email && <span className="rect-detail-meta text-slate-400">✉ {candidate.email}</span>}
                {candidate.phone && <span className="rect-detail-meta text-slate-400">📞 {candidate.phone}</span>}
                {candidate.position_title && <span className="rect-detail-role text-indigo-400 px-2 py-0.5 bg-indigo-500/10 rounded-md">Brief: {candidate.position_title}</span>}
              </div>
            </div>
          </div>
          <button aria-label="close" onClick={onClose} className="rect-modal-close text-slate-400 hover:text-white transition-colors text-2xl p-2"><Icon name="close" size={17}/></button>
        </div>

        {/* Tabs */}
        <div className="rect-detail-tabs flex px-6 pt-4 border-b border-white/10 gap-6 bg-surface-900">
          <button
            onClick={() => setActiveTab('ai')}
            className={`rect-detail-tab pb-3 text-sm font-bold transition-colors border-b-2 ${activeTab === 'ai' ? 'rect-detail-tab-active border-amber-400 text-amber-400' : 'rect-detail-tab-inactive border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            <Icon name="rating" size={17}/> AI Evaluation
          </button>
          <button
            onClick={() => setActiveTab('form')}
            className={`rect-detail-tab pb-3 text-sm font-bold transition-colors border-b-2 ${activeTab === 'form' ? 'rect-detail-tab-active border-indigo-400 text-indigo-400' : 'rect-detail-tab-inactive border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            <Icon name="edit" size={17}/> Form Data
          </button>
          <button
            onClick={() => setActiveTab('resume')}
            className={`rect-detail-tab pb-3 text-sm font-bold transition-colors border-b-2 ${activeTab === 'resume' ? 'rect-detail-tab-active border-emerald-400 text-emerald-400' : 'rect-detail-tab-inactive border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            <Icon name="documents" size={17}/> Original Resume
          </button>
        </div>

        {/* Content Area */}
        {onGenerateGuide&&<div className="job-guide-toolbar"><button type="button" disabled={generatingGuide} className="ux-button ux-button-secondary" onClick={onGenerateGuide}>{t(`common.recruitmentUpgrade.${generatingGuide?'working':'generateGuide'}`)}</button>{candidate.interview_guide&&<details><summary>{t('common.recruitmentUpgrade.interviewGuide')}</summary><p>{candidate.interview_guide}</p></details>}</div>}
        <div className="rect-detail-content p-6 overflow-y-auto custom-scrollbar flex-1 bg-surface-850">

          {activeTab === 'ai' && (
            <div className="space-y-6">
              <div className="rect-detail-ai-score-box flex items-center gap-4 p-6 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <div className="text-5xl"><Icon name="performance" size={17}/></div>
                <div>
                  <h3 className="rect-detail-ai-score-label text-sm font-bold text-amber-400 mb-1">AI Match Score</h3>
                  <div className="text-4xl font-bold text-white rect-detail-ai-score-val">{candidate.ai_score == null ? t('common.experience.notAssessed') : <>{candidate.ai_score}<span className="text-2xl text-slate-500 rect-detail-ai-score-max">/10</span></>}</div>
                </div>
              </div>

              <p className="job-notice">{t('common.recruitmentUpgrade.assessmentNote')}</p>
              {candidate.ai_evaluation&&<div className="job-evaluation"><p>{candidate.ai_evaluation.summary}</p>{['matched','missing','unverified'].map(key=><section key={key}><h4>{t(`common.recruitmentUpgrade.${key}`)}</h4><ul>{candidate.ai_evaluation[key]?.length?candidate.ai_evaluation[key].map((item,i)=><li key={i}><strong>{item.requirement}</strong><span>{item.evidence}</span></li>):<li>{t('common.recruitmentUpgrade.noFindings')}</li>}</ul></section>)}</div>}
              {candidate.opening_snapshot&&<details className="job-notice"><summary>{t('common.recruitmentUpgrade.assessedAgainst')} {candidate.opening_snapshot.revision}</summary><JobOpeningDetails job={candidate.opening_snapshot}/></details>}
              {!candidate.ai_evaluation&&<div className="grid md:grid-cols-2 gap-6">
                <div className="rect-detail-ai-reason-box p-5 rounded-xl bg-surface-800 border border-white/5">
                  <h3 className="rect-detail-ai-reason-label text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider flex items-center gap-2">🇬🇧 English Reasoning</h3>
                  <p className="rect-detail-ai-reason-text text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                    {candidate.ai_reasoning ? candidate.ai_reasoning.split('မြန်မာလို အကျဉ်းချုပ်:')[0].trim() : 'No AI reasoning available yet.'}
                  </p>
                </div>
                <div className="rect-detail-ai-reason-box p-5 rounded-xl bg-surface-800 border border-white/5">
                  <h3 className="rect-detail-ai-reason-label text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider flex items-center gap-2">🇲🇲 မြန်မာလို အကျဉ်းချုပ်</h3>
                  <p className="rect-detail-ai-reason-text text-slate-300 text-sm leading-relaxed whitespace-pre-wrap font-sans">
                    {candidate.ai_reasoning && candidate.ai_reasoning.includes('မြန်မာလို အကျဉ်းချုပ်:')
                      ? candidate.ai_reasoning.split('မြန်မာလို အကျဉ်းချုပ်:')[1].trim()
                      : 'မြန်မာလို အကျဉ်းချုပ် မရရှိနိုင်သေးပါ။'}
                  </p>
                </div>
              </div>}
            </div>
          )}

          {activeTab === 'form' && (
            <div className="space-y-4">
              {Object.keys(formData).length === 0 ? (
                <div className="text-center py-10 text-slate-500 rect-empty-text">
                  Form data not available for this candidate.
                </div>
              ) : (
                <div className="grid gap-3">
                  {Object.entries(formData).map(([key, value]) => {
                    if (!value || key === 'Timestamp' || key === 'Email Address' || key === 'Full Name' || key === 'Phone / Telegram / WhatsApp Number' || key.includes('drive link')) return null;
                    return (
                      <div key={key} className="rect-form-data-box p-4 rounded-lg bg-surface-800 border border-white/5">
                        <h4 className="rect-form-data-label text-xs font-bold text-indigo-400 mb-1">{key}</h4>
                        <p className="rect-form-data-val text-white text-sm whitespace-pre-wrap">{String(value)}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'resume' && (
            <div>
              {candidate.resume_url&&<a className="ux-button ux-button-secondary" href={candidate.resume_url} target="_blank" rel="noreferrer">{t('common.recruitmentUpgrade.openOriginal')}</a>}
              {candidate.resume_text || candidate.resume_content ? (
                <div className="rect-resume-box p-6 rounded-xl bg-white/5 border border-white/10 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {candidate.resume_text || candidate.resume_content}
                </div>
              ) : (
                <div className="text-center py-10">
                  <div className="text-4xl mb-4 opacity-50"><Icon name="documents" size={17}/></div>
                  <h3 className="rect-resume-empty-title text-lg font-bold text-white mb-2">No Resume Text Available</h3>
                  <p className="rect-empty-text text-slate-400 text-sm max-w-sm mx-auto">
                    The AI could not extract text from the provided link, or the file was private/restricted.
                  </p>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="rect-detail-footer p-4 border-t border-white/10 bg-surface-900 flex justify-end">
          <button onClick={onClose} className="rect-btn-save px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors">
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
}
