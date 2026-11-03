import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import Layout from '../../components/layout/Layout';
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

export default function MyDocuments() {
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');

  const { data: portalData } = useQuery({ 
    queryKey: ['portal_data'], 
    queryFn: () => api.get('/portal').then(r => r.data) 
  });

  const { data: docsData, isLoading } = useQuery({ 
    queryKey: ['documents'], 
    queryFn: () => api.get('/documents').then(r => r.data) 
  });

  const empId = portalData?.emp?.id;
  
  // Filter documents: Show company-wide (employee_id is null/empty) OR assigned to this employee
  const rawDocs = (docsData?.documents || []).filter(d => !d.employee_id || d.employee_id === empId);

  const filteredDocs = rawDocs
    .filter(doc => activeCategory === 'All' || doc.category === activeCategory)
    .filter(doc => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        doc.title.toLowerCase().includes(q) ||
        (doc.category || '').toLowerCase().includes(q) ||
        (doc.description || '').toLowerCase().includes(q)
      );
    });

  return (
    <Layout title="My Documents & Vault" subtitle="Company handbooks, policies, warning letters, and commendations">
      {/* Search Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/></svg>
          <input
            type="text"
            placeholder="Search documents by title, description..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="form-input text-sm pl-10 pr-4 py-2.5 rounded-xl w-full"
          />
        </div>
        <span className="text-xs text-slate-400 font-medium">{filteredDocs.length} Document{filteredDocs.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 no-scrollbar">
        {CATEGORIES.map(cat => {
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/5'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Grid Display */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-44 bg-white/5 animate-pulse rounded-2xl" />)
        ) : filteredDocs.length > 0 ? (
          filteredDocs.map(d => {
            const catStyle = CATEGORY_STYLES[d.category] || CATEGORY_STYLES['General'];
            const isPersonal = !!d.employee_id;

            return (
              <div
                key={d.id}
                className="rounded-2xl p-5 relative group overflow-hidden flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 hover:shadow-xl"
                style={{ background: 'var(--bg-850, #161929)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                      <GetCategoryIcon category={d.category} />
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${catStyle.color}`}>
                        {d.category || 'General'}
                      </span>
                      <span className={`text-[9px] font-semibold px-2 py-0.5 rounded ${isPersonal ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20' : 'text-cyan-400 bg-cyan-500/10 border border-cyan-500/20'}`}>
                        {isPersonal ? 'Assigned to You' : 'Company Wide'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-white mb-1.5 line-clamp-1" title={d.title}>
                      {d.title}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed" title={d.description}>
                      {d.description || 'No description provided.'}
                    </p>

                    {(d.boss_signature || d.hr_signature) && (
                      <div className="mt-2.5 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        <span>Official Signed & Verified Document</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-mono">{(d.created_at || '').split('T')[0]}</span>
                  <button 
                    type="button"
                    onClick={() => d.file_url ? window.open(`/api/documents/download/${d.id}`, '_blank') : toast.error('No file link available')}
                    className="px-3.5 py-1.5 bg-indigo-600/15 hover:bg-indigo-600 text-indigo-400 hover:text-white text-xs font-bold rounded-lg transition-all border border-indigo-500/30 flex items-center gap-1.5"
                  >
                    <span>View File</span>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full rounded-2xl p-16 text-center" style={{ background: 'var(--bg-850, #161929)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <svg className="w-12 h-12 text-slate-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
            <p className="text-slate-300 font-bold text-sm mb-1">No documents found</p>
            <p className="text-slate-500 text-xs">Try choosing another category or clearing your search.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}

