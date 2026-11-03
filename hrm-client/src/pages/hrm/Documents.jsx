import {Link} from 'react-router-dom';
import Icon from '../../components/common/Icon';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import { useLanguage } from '../../context/LanguageContext';
import toast from 'react-hot-toast';

const CATEGORIES = [
  'All',
  'Employee Handbooks',
  'Company Policies',
  'Disciplinary Records',
  'Commendations & Awards',
  'Employment Contracts',
  'SOPs & Guides',
  'General',
];

const DOCUMENT_TYPES = [
  'Promotion Letter',
  'Salary Adjustment',
  'Employment Contract',
  'Commendation Letter',
  'Transfer Letter',
  'Policy Handbook',
  'Other Official Letter',
];

const CATEGORY_STYLES = {
  'Employee Handbooks':    { color: 'text-teal-400 bg-teal-500/10 border-teal-500/20' },
  'Company Policies':      { color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
  'Disciplinary Records':  { color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
  'Commendations & Awards':{ color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  'Employment Contracts':  { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  'SOPs & Guides':         { color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  'General':               { color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
};

function GetCategoryIcon({ category }) {
  switch (category) {
    case 'Employee Handbooks':
      return <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>;
    case 'Disciplinary Records':
      return <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
    case 'Commendations & Awards':
      return <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>;
    case 'Employment Contracts':
      return <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
    case 'SOPs & Guides':
      return <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>;
    case 'Company Policies':
      return <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>;
    default:
      return <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>;
  }
}

export default function Documents() {
  const { t } = useLanguage();
  const [mainTab, setMainTab]             = useState('vault'); // 'vault' | 'approvals' | 'employee_folders'
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showReqModal, setShowReqModal]       = useState(false);
  const [hrSignTarget, setHrSignTarget]   = useState(null);
  const [deleteTarget, setDeleteTarget]   = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [search, setSearch]               = useState('');
  const [hrSigInput, setHrSigInput]       = useState('');
  const { can, user }                 = useAuth();
  const qc                                = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => api.get('/documents').then(r => r.data)
  });

  const uploadMutation = useMutation({
    mutationFn: (body) => api.post('/documents', body, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    }),
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['documents']});
      setShowUploadModal(false);
      toast.success('Document uploaded to vault!');
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to upload document');
    }
  });

  const reqMutation = useMutation({
    mutationFn: (body) => api.post('/documents/request-approval', body),
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['documents']});
      setShowReqModal(false);
      toast.success('Approval request sent to Boss!');
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to send request');
    }
  });

  const hrSignMutation = useMutation({
    mutationFn: ({ id, hr_signature }) => api.post(`/documents/hr-sign/${id}`, { hr_signature }),
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['documents']});
      setHrSignTarget(null);
      setHrSigInput('');
      toast.success('Document signed & published to Employee Vault!');
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to sign document');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['documents']});
      setDeleteTarget(null);
      toast.success('Document removed!');
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to delete document');
    }
  });

  const handleUploadSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    uploadMutation.mutate(fd);
  };

  const handleReqSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    reqMutation.mutate(Object.fromEntries(fd));
  };

  const handleHrSignSubmit = (e) => {
    e.preventDefault();
    if (!hrSignTarget) return;
    hrSignMutation.mutate({ id: hrSignTarget.id, hr_signature: hrSigInput || 'Authorized HR Seal' });
  };

  const rawDocs = data?.documents || [];
  const requests = data?.requests || [];
  const employees = data?.employees || [];

  // Filter vault documents
  const filteredDocs = rawDocs
    .filter(doc => activeCategory === 'All' || doc.category === activeCategory)
    .filter(doc => {
      if (selectedEmpId) return String(doc.employee_id) === String(selectedEmpId);
      return !doc.employee_id;
    })
    .filter(doc => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        doc.title.toLowerCase().includes(q) ||
        (doc.category || '').toLowerCase().includes(q) ||
        (doc.description || '').toLowerCase().includes(q) ||
        (doc.employee_name || '').toLowerCase().includes(q)
      );
    });

  // Pending approval requests count
  const pendingBossCount = requests.filter(r => r.status === 'PENDING_BOSS').length;
  const readyHrSignCount = requests.filter(r => r.status === 'APPROVED_BY_BOSS').length;

  return (
    <Layout title={t('hrm.documents.title')} subtitle={t('hrm.documents.subtitle')}>
      {can(user,'warnings')&&<p style={{marginBottom:20}}><Link className="ux-button ux-button-secondary" to="/warnings">{t('common.launcher.warnings')} ↗</Link></p>}

      {/* ── Main Tab Navigation ────────────────────────────────────── */}
      <div className="dv-main-header flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setMainTab('vault');
              setSelectedEmpId('');
              setActiveCategory('All');
            }}
            className={`dv-main-tab px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              mainTab === 'vault'
                ? 'dv-main-tab-active bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'dv-main-tab-inactive bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/5'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
            <span>{t('hrm.documents.repository')}</span>
            <span className="dv-tab-count text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/20">{rawDocs.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setMainTab('employee_folders')}
            className={`dv-main-tab px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              mainTab === 'employee_folders'
                ? 'dv-main-tab-active bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'dv-main-tab-inactive bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/5'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
            <span>{t('hrm.documents.directoryFolders')}</span>
            <span className="dv-tab-count text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/20">{employees.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setMainTab('approvals')}
            className={`dv-main-tab px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 relative ${
              mainTab === 'approvals'
                ? 'dv-main-tab-active bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'dv-main-tab-inactive bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/5'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span>{t('hrm.documents.approvalPipeline')}</span>
            {requests.length > 0 && (
              <span className="dv-tab-badge text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-slate-950">
                {requests.length}
              </span>
            )}
          </button>
        </div>

        {can('documents','create') && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowReqModal(true)}
              className="dv-btn-accent flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-lg shadow-amber-600/20"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <span>{t('hrm.documents.requestApproval')}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="dv-btn-primary flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/20"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
              <span>{t('hrm.documents.directUpload')}</span>
            </button>
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODE 1: VAULT REPOSITORY                                      */}
      {/* ───────────────────────────────────────────────────────────── */}
      {mainTab === 'vault' && (
        <div>
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
              <div className="relative flex-1 max-w-md">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dv-search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/></svg>
                <input
                  type="text"
                  placeholder={t('hrm.documents.searchPlaceholder')}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="form-input dv-input text-sm pl-10 pr-4 py-2.5 rounded-xl w-full"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff' }}
                />
              </div>

              {/* Employee Selector Filter */}
              <select
                value={selectedEmpId}
                onChange={e => setSelectedEmpId(e.target.value)}
                className="form-input dv-input text-xs py-2.5 max-w-[220px]"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff' }}
              >
                <option value="">{t('hrm.documents.allEmployeeFolders')}</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.Full_name} ({emp.employee_id})</option>
                ))}
              </select>
            </div>

            <span className="dv-doc-count text-xs text-slate-400 font-medium">{filteredDocs.length} {t('hrm.documents.documentsCount')}</span>
          </div>

          {/* Category Filter Tabs */}
          <div className="dv-cat-container flex items-center gap-2 overflow-x-auto pb-3 mb-6 no-scrollbar">
            {CATEGORIES.map(cat => {
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`dv-cat-tab px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    isActive
                      ? 'dv-cat-tab-active bg-indigo-600 text-white shadow-md'
                      : 'dv-cat-tab-inactive bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/5'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Documents Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => <div key={i} className="dv-doc-card-skeleton h-44 rounded-2xl bg-white/5 animate-pulse" />)
            ) : filteredDocs.length > 0 ? (
              filteredDocs.map(doc => {
                const style = CATEGORY_STYLES[doc.category] || CATEGORY_STYLES['General'];
                return (
                  <div
                    key={doc.id}
                    className="dv-doc-card rounded-2xl p-5 flex flex-col justify-between relative group overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-xl"
                    style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="dv-doc-icon-box w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                          <GetCategoryIcon category={doc.category} />
                        </div>
                        <span className={`dv-doc-category text-[10px] font-bold px-2.5 py-1 rounded-lg border ${style.color}`}>
                          {doc.category || 'General'}
                        </span>
                      </div>

                      <h3 className="dv-doc-title text-sm font-bold text-white mb-1 line-clamp-1" title={doc.title}>
                        {doc.title}
                      </h3>

                      <p className="dv-doc-desc text-xs text-slate-400 mb-3 line-clamp-2 leading-relaxed">
                        {doc.description || 'No description provided.'}
                      </p>

                      <div className="dv-doc-meta text-[11px] font-medium text-slate-400 flex items-center gap-1.5 mb-3">
                        <span>Target:</span>
                        {doc.employee_id ? (
                          <span className="dv-doc-target-emp text-amber-400 font-semibold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 flex items-center gap-1">
                            <svg className="w-3 h-3 text-amber-400 dv-icon-target" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                            {doc.employee_name}
                          </span>
                        ) : (
                          <span className="dv-doc-target-company text-cyan-400 font-semibold px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 flex items-center gap-1">
                            <svg className="w-3 h-3 text-cyan-400 dv-icon-company" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.6 9h16.8M3.6 15h16.8"/></svg>
                            Company Wide
                          </span>
                        )}
                      </div>

                      {/* E-Signature Verification Badge */}
                      {(doc.boss_signature || doc.hr_signature) && (
                        <div className="dv-doc-badge-verified text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1 mb-3 flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-emerald-400 dv-icon-verified" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                          <span>{t('hrm.documents.verifiedSigned')}</span>
                        </div>
                      )}
                    </div>

                    <div className="dv-doc-footer pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                      <span className="dv-doc-date text-[10px] text-slate-500 font-mono">
                        {(doc.created_at || '').split('T')[0]}
                      </span>
                      <div className="flex items-center gap-2">
                        {can('documents','delete') && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(doc)}
                            className="dv-btn-delete p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Delete Document"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                          </button>
                        )}
                        <a
                          href={`${api.defaults.baseURL}/documents/download/${doc.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="dv-btn-view px-3.5 py-1.5 bg-indigo-600/15 hover:bg-indigo-600 text-indigo-400 hover:text-white text-xs font-bold rounded-lg transition-all border border-indigo-500/30 flex items-center gap-1.5"
                        >
                          <span>{t('hrm.documents.viewFile')}</span>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="dv-empty-state col-span-full rounded-2xl p-16 text-center" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <svg className="w-12 h-12 text-slate-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
                <p className="dv-empty-title text-slate-300 font-bold text-base mb-1">{t('hrm.documents.noDocumentsFound')}</p>
                <p className="dv-empty-desc text-slate-500 text-xs">{t('hrm.documents.noDocumentsDesc')}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODE 2: EMPLOYEE DIRECTORY FOLDERS                            */}
      {/* ───────────────────────────────────────────────────────────── */}
      {mainTab === 'employee_folders' && (
        <div className="space-y-6">
          <div className="dv-alert-box p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 flex items-center gap-3">
            <svg className="w-6 h-6 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
            <div>
              <strong className="font-bold text-white block">{t('hrm.documents.perEmployeeVault')}</strong>
              <span>{t('hrm.documents.perEmployeeDesc')}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {employees.map(emp => {
              const empDocs = rawDocs.filter(d => d.employee_id === emp.id);
              const isSelected = selectedEmpId === emp.id;

              return (
                <div
                  key={emp.id}
                  onClick={() => {
                    setSelectedEmpId(isSelected ? '' : emp.id);
                    if (!isSelected) {
                      setMainTab('vault');
                      setActiveCategory('All');
                    }
                  }}
                  className={`dv-emp-card rounded-2xl p-5 cursor-pointer transition-all duration-200 border ${
                    isSelected
                      ? 'dv-emp-card-active bg-indigo-500/10 border-indigo-500 shadow-xl'
                      : 'dv-emp-card-inactive bg-white/5 border-white/10 hover:border-indigo-500/40 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="dv-emp-avatar w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-sm border border-indigo-500/30">
                        {emp.Full_name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="dv-emp-name text-sm font-bold text-white line-clamp-1">{emp.Full_name}</h4>
                        <p className="dv-emp-id text-[11px] text-slate-400 font-mono">{emp.employee_id}</p>
                      </div>
                    </div>
                    <span className="dv-emp-badge text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      {empDocs.length} File{empDocs.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="dv-emp-meta text-[11px] text-slate-400 space-y-1 mb-3 pt-2 border-t border-white/5">
                    <div><span className="text-slate-500">{t('hrm.documents.position')}:</span> <span className="dv-emp-meta-val text-slate-300 font-medium">{emp.Position || 'N/A'}</span></div>
                    <div><span className="text-slate-500">{t('hrm.documents.department')}:</span> <span className="dv-emp-meta-val text-slate-300 font-medium">{emp.Department || 'General'}</span></div>
                  </div>

                  <div className="dv-emp-action text-[11px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                    <span>{t('hrm.documents.openFolder')}</span>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODE 3: APPROVAL REQUESTS PIPELINE                           */}
      {/* ───────────────────────────────────────────────────────────── */}
      {mainTab === 'approvals' && (
        <div className="space-y-6">
          {/* Summary Badges */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="dv-stat-box dv-stat-amber p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
              <div>
                <span className="dv-stat-label text-xs text-amber-400 font-semibold block">{t('hrm.documents.pendingBossApproval')}</span>
                <span className="dv-stat-val text-2xl font-bold text-white">{pendingBossCount}</span>
              </div>
              <svg className="w-8 h-8 text-amber-400 dv-stat-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>

            <div className="dv-stat-box dv-stat-emerald p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
              <div>
                <span className="dv-stat-label text-xs text-emerald-400 font-semibold block">{t('hrm.documents.readyHrSign')}</span>
                <span className="dv-stat-val text-2xl font-bold text-white">{readyHrSignCount}</span>
              </div>
              <svg className="w-8 h-8 text-emerald-400 dv-stat-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>

            <div className="dv-stat-box dv-stat-indigo p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between">
              <div>
                <span className="dv-stat-label text-xs text-indigo-400 font-semibold block">{t('hrm.documents.totalPipeline')}</span>
                <span className="dv-stat-val text-2xl font-bold text-white">{requests.length}</span>
              </div>
              <svg className="w-8 h-8 text-indigo-400 dv-stat-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
          </div>

          {/* Requests List */}
          <div className="space-y-4">
            {requests.length > 0 ? (
              requests.map(req => {
                const isPendingBoss = req.status === 'PENDING_BOSS';
                const isApprovedBoss = req.status === 'APPROVED_BY_BOSS';
                const isCompleted = req.status === 'COMPLETED_AND_ISSUED';
                const isRejected = req.status === 'REJECTED_BY_BOSS';

                return (
                  <div
                    key={req.id}
                    className="dv-req-card rounded-2xl p-5 border bg-white/5 border-white/10 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="dv-req-type text-xs font-bold text-indigo-400 px-2.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                            {req.doc_type || req.category}
                          </span>
                          <span className="dv-req-target text-xs text-slate-400">{t('hrm.documents.target')}: <strong className="dv-req-target-name text-white">{req.employee_name}</strong></span>
                        </div>
                        <h3 className="dv-req-title text-base font-bold text-white">{req.title}</h3>
                        <p className="dv-req-desc text-xs text-slate-400 mt-0.5">{req.description || 'No notes provided.'}</p>
                      </div>

                      {/* Status Badge */}
                      <div className="dv-req-status-box">
                        {isPendingBoss && <span className="dv-req-badge dv-req-badge-pending px-3 py-1 text-xs font-bold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20"><Icon name="pending" size={17}/> Waiting Boss Review & E-Sign</span>}
                        {isApprovedBoss && <span className="dv-req-badge dv-req-badge-approved px-3 py-1 text-xs font-bold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><Icon name="active" size={17}/> Boss Signed — HR Sign Needed</span>}
                        {isCompleted && <span className="dv-req-badge dv-req-badge-completed px-3 py-1 text-xs font-bold rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"><Icon name="birthdays" size={17}/> Completed & Issued to Vault</span>}
                        {isRejected && <span className="dv-req-badge dv-req-badge-rejected px-3 py-1 text-xs font-bold rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20"><Icon name="close" size={17}/> Rejected by Boss</span>}
                      </div>
                    </div>

                    {/* Stage Stepper Tracker */}
                    <div className="dv-stepper-box p-3 rounded-xl bg-black/30 border border-white/5 grid grid-cols-4 gap-2 text-center text-[11px]">
                      <div className="dv-step space-y-1">
                        <span className="dv-step-title block font-bold text-slate-300">1. HR Initiated</span>
                        <span className="dv-step-val dv-step-val-completed text-emerald-400 font-semibold">✓ Requested</span>
                      </div>
                      <div className="dv-step space-y-1">
                        <span className="dv-step-title block font-bold text-slate-300">2. Boss E-Sign</span>
                        <span className={`dv-step-val ${isApprovedBoss || isCompleted ? 'dv-step-val-completed text-emerald-400 font-semibold' : isRejected ? 'dv-step-val-rejected text-rose-400 font-semibold' : 'dv-step-val-pending text-amber-400 animate-pulse font-semibold'}`}>
                          {isApprovedBoss || isCompleted ? '✓ Signed' : isRejected ? '✗ Rejected' : '⏳ Pending'}
                        </span>
                      </div>
                      <div className="dv-step space-y-1">
                        <span className="dv-step-title block font-bold text-slate-300">3. HR Final Seal</span>
                        <span className={`dv-step-val ${isCompleted ? 'dv-step-val-completed text-emerald-400 font-semibold' : isApprovedBoss ? 'dv-step-val-ready text-amber-400 font-semibold' : 'dv-step-val-waiting text-slate-500'}`}>
                          {isCompleted ? '✓ Sealed' : isApprovedBoss ? 'Ready to Seal' : 'Waiting'}
                        </span>
                      </div>
                      <div className="dv-step space-y-1">
                        <span className="dv-step-title block font-bold text-slate-300">4. Published</span>
                        <span className={`dv-step-val ${isCompleted ? 'dv-step-val-completed text-emerald-400 font-semibold' : 'dv-step-val-waiting text-slate-500'}`}>
                          {isCompleted ? '✓ Archived to Vault' : 'Waiting'}
                        </span>
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="dv-req-footer pt-2 flex items-center justify-between border-t border-white/5 text-xs">
                      <span className="dv-req-date text-slate-500 font-mono">Effective Date: {req.effective_date || 'N/A'}</span>

                      <div className="flex items-center gap-3">
                        {isApprovedBoss && can('documents','approve') && (
                          <button
                            type="button"
                            onClick={() => setHrSignTarget(req)}
                            className="dv-btn-hr-sign px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20"
                          >
                            Final HR Sign & Issue to Vault →
                          </button>
                        )}

                        {req.file_url && (
                          <a
                            href={`${api.defaults.baseURL}/documents/download/${req.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="dv-btn-req-view px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-indigo-400 text-xs font-bold rounded-lg transition-all border border-white/10"
                          >
                            View Attached Soft Copy ↗
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="dv-empty-state rounded-2xl p-16 text-center bg-white/5 border border-white/5">
                <svg className="w-12 h-12 text-slate-600 mx-auto mb-3 dv-empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <p className="dv-empty-title text-slate-300 font-bold text-base mb-1">No active approval requests</p>
                <p className="dv-empty-desc text-slate-500 text-xs">Click "Request Approval (Boss Sign)" to initiate an official letter approval.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 1: REQUEST OFFICIAL DOCUMENT APPROVAL (HR -> BOSS)      */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showReqModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="dv-modal-overlay absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setShowReqModal(false)} />
          <div className="dv-modal-content relative rounded-2xl w-full max-w-lg p-6 overflow-hidden" style={{ background: 'var(--bg-850, #161929)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="dv-modal-header flex items-center justify-between mb-5">
              <div>
                <h2 className="dv-modal-title text-base font-bold text-white">Request Official Document Approval</h2>
                <p className="dv-modal-subtitle text-xs text-slate-400">Initiate a Promotion Letter or Contract for Boss E-Signature. Use the Warning Letters app for warnings.</p>
              </div>
              <button type="button" onClick={() => setShowReqModal(false)} className="dv-modal-close text-slate-500 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <form onSubmit={handleReqSubmit} className="space-y-4">


              <div>
                <label className="dv-label form-label text-xs">Target Employee *</label>
                <select name="employee_id" required className="form-input dv-input text-sm">
                  <option value="">Select Target Employee...</option>
                  <option value="GENERAL"><Icon name="documents" size={17}/> -- Blank Dynamic Template (General / Bulk Employee Use) --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.Full_name} ({emp.employee_id} - {emp.Position || 'Staff'})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="dv-label form-label text-xs">Document Type *</label>
                  <select name="doc_type" required className="form-input dv-input text-sm">
                    {DOCUMENT_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="dv-label form-label text-xs">Category *</label>
                  <select name="category" required className="form-input dv-input text-sm">
                    {CATEGORIES.filter(c => c !== 'All').map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="dv-label form-label text-xs">Document Title *</label>
                <input name="title" required placeholder="e.g. Official Promotion Letter - Senior Specialist" className="form-input dv-input text-sm" />
              </div>

              {/* Dynamic Blank Fillable Fields */}
              <div className="dv-form-dynamic-box p-3.5 rounded-xl border border-indigo-500/20 bg-indigo-500/5 space-y-3">
                <p className="dv-dynamic-title text-[11px] font-bold text-indigo-300 uppercase tracking-wider">
                  <Icon name="edit" size={17}/> Dynamic Blank Template Fields (Auto-Merges into PDF)
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="dv-label-small text-[10px] font-bold text-slate-400 block mb-1 uppercase">New Position</label>
                    <input name="new_position" placeholder="e.g. Senior Lead" className="form-input dv-input text-xs" />
                  </div>
                  <div>
                    <label className="dv-label-small text-[10px] font-bold text-slate-400 block mb-1 uppercase">New Department</label>
                    <input name="new_department" placeholder="e.g. Operations" className="form-input dv-input text-xs" />
                  </div>
                  <div>
                    <label className="dv-label-small text-[10px] font-bold text-slate-400 block mb-1 uppercase">New Salary (THB)</label>
                    <input type="number" step="0.01" min="0" disabled={!user?.is_owner&&!user?.access?.sensitive?.salary} name="new_salary" placeholder="e.g. 4500" className="form-input dv-input text-xs" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="dv-label form-label text-xs">Effective Date *</label>
                  <input type="date" name="effective_date" required defaultValue={new Date().toISOString().split('T')[0]} className="form-input dv-input text-sm" />
                </div>

                <div>
                  <label className="dv-label form-label text-xs">Soft Copy PDF URL / Link (Optional)</label>
                  <input type="text" name="file_url" placeholder="Leave blank to auto-generate official PDF!" className="form-input dv-input text-sm font-mono" />
                </div>
              </div>

              <p className="dv-form-help text-[10px] text-emerald-400 font-medium bg-emerald-500/10 px-3 py-1.5 rounded-lg">
                <Icon name="spark" size={17}/> Tip: Leave "Soft Copy PDF URL" blank to let the system automatically build an official, formatted PDF letter for the selected employee!
              </p>

              <div>
                <label className="dv-label form-label text-xs">Description & Notes for Boss Review</label>
                <textarea name="description" rows="3" placeholder="Provide background summary, salary change justification, or policy details..." className="form-input dv-input text-sm" />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowReqModal(false)}
                  className="dv-btn-cancel flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-white bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reqMutation.isLoading}
                  className="dv-btn-submit-amber flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20"
                >
                  {reqMutation.isLoading ? 'Submitting...' : 'Send to Boss for E-Sign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 2: HR FINAL SIGN & PUBLISH TO VAULT                      */}
      {/* ───────────────────────────────────────────────────────────── */}
      {hrSignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="dv-modal-overlay absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setHrSignTarget(null)} />
          <div className="dv-modal-content relative rounded-2xl w-full max-w-md p-6 overflow-hidden" style={{ background: 'var(--bg-850, #161929)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="dv-modal-header flex items-center justify-between mb-4">
              <div>
                <h2 className="dv-modal-title text-base font-bold text-white">HR Final Seal & Issue</h2>
                <p className="dv-modal-subtitle text-xs text-slate-400">Boss has signed "{hrSignTarget.title}". Apply HR seal to publish.</p>
              </div>
              <button type="button" onClick={() => setHrSignTarget(null)} className="dv-modal-close text-slate-500 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <form onSubmit={handleHrSignSubmit} className="space-y-4">
              <div className="dv-alert-box p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
                <strong className="block font-bold">Boss E-Signature Verified:</strong>
                <span>"{hrSignTarget.boss_signature || 'Executive Approved'}"</span>
              </div>

              <div>
                <label className="dv-label form-label text-xs">HR Signature / Official Seal Stamp *</label>
                <input
                  type="text"
                  required
                  value={hrSigInput}
                  onChange={e => setHrSigInput(e.target.value)}
                  placeholder="e.g. Authorized HR Manager Seal - [Approved]"
                  className="form-input dv-input text-sm"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setHrSignTarget(null)}
                  className="dv-btn-cancel flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-white bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={hrSignMutation.isLoading}
                  className="dv-btn-submit-emerald flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-600/20"
                >
                  {hrSignMutation.isLoading ? 'Publishing...' : 'Finalize & Issue to Vault'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 3: DIRECT UPLOAD MODAL                                  */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="dv-modal-overlay absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowUploadModal(false)} />
          <div className="dv-modal-content relative rounded-2xl w-full max-w-lg p-6 overflow-hidden" style={{ background: 'var(--bg-850, #161929)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="dv-modal-header flex items-center justify-between mb-5">
              <div>
                <h2 className="dv-modal-title text-base font-bold text-white">Direct Upload to Vault</h2>
                <p className="dv-modal-subtitle text-xs text-slate-400">Add handbooks, policies, or general employee documents directly</p>
              </div>
              <button type="button" onClick={() => setShowUploadModal(false)} className="dv-modal-close text-slate-500 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="dv-label form-label text-xs">Document Title *</label>
                <input name="title" required placeholder="e.g. Employee Handbook 2026" className="form-input dv-input text-sm" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="dv-label form-label text-xs">Category *</label>
                  <select name="category" required className="form-input dv-input text-sm">
                    {CATEGORIES.filter(c => c !== 'All').map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="dv-label form-label text-xs">Target Employee</label>
                  <select name="employee_id" className="form-input dv-input text-sm">
                    <option value="">Company Wide (All Employees)</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.Full_name} ({emp.employee_id})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="dv-label form-label text-xs">PDF Document File *</label>
                <input type="file" name="document_file" accept="application/pdf" required className="form-input dv-input text-sm" />
              </div>

              <div>
                <label className="dv-label form-label text-xs">Description / Notes</label>
                <textarea name="description" rows="3" placeholder="Additional details or summary..." className="form-input dv-input text-sm" />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="dv-btn-cancel flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-white bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadMutation.isLoading}
                  className="dv-btn-submit-indigo flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20"
                >
                  {uploadMutation.isLoading ? 'Uploading...' : 'Save Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Confirm Delete Modal ────────────────────────────────── */}
      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        itemName={deleteTarget?.title}
      />
    </Layout>
  );
}
