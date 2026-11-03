import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import toast from 'react-hot-toast';

// ─── Level color config ───────────────────────────────────────────────────────
const LEVEL_STYLE = {
  Executive: { ring: '#f59e0b', bg: 'rgba(245,158,11,0.12)', badge: 'bg-amber-500/20 text-amber-500 border-amber-500/30' },
  Senior:    { ring: '#FF7700', bg: 'rgba(255,119,0,0.12)',  badge: 'bg-brand-orange/20 text-brand-orange border-brand-orange/30' },
  Manager:   { ring: '#C8192E', bg: 'rgba(200,25,46,0.12)', badge: 'bg-brand-green/20 text-brand-green border-brand-green/30' },
  Supervisor:{ ring: '#10b981', bg: 'rgba(16,185,129,0.12)', badge: 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30' },
  Mid:       { ring: '#C8192E', bg: 'rgba(200,25,46,0.12)', badge: 'bg-brand-green/20 text-brand-green border-brand-green/30' },
  Junior:    { ring: '#64748b', bg: 'rgba(100,116,139,0.12)', badge: 'bg-slate-500/20 text-slate-500 border-slate-500/30' },
};
const getLvl = (l) => LEVEL_STYLE[l] || LEVEL_STYLE.Mid;

// ─── Custom Dark Dropdown ─────────────────────────────────────────────────────
function DarkSelect({ value, onChange, options, placeholder = 'Select...', className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selectedLabel = options.find(o => o.value === value)?.label || placeholder;

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="oc-select-btn w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm text-left transition-all"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: value ? '#e2e8f0' : '#64748b' }}
      >
        <span className="oc-select-label truncate">{selectedLabel}</span>
        <svg className={`oc-select-icon w-4 h-4 flex-shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: '#64748b' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          className="oc-select-menu absolute z-50 mt-1 w-full rounded-xl overflow-hidden shadow-2xl"
          style={{ background: 'var(--bg-900)', border: '1px solid var(--lm-hr-overlay-border)', maxHeight: 280, overflowY: 'auto' }}
        >
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="oc-select-opt w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-white/5"
              style={{ color: opt.value === value ? '#F291A3' : '#cbd5e1', background: opt.value === value ? 'rgba(213,60,80,0.1)' : 'transparent' }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ node, size = 48 }) {
  const style = getLvl(node.level);
  const initials = (node.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div style={{ width: size, height: size, flexShrink: 0, borderRadius: '50%', border: `2.5px solid ${style.ring}`, overflow: 'hidden', background: style.bg }}>
      {node.avatar_url
        ? <img src={node.avatar_url} alt={node.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.35, fontWeight: 700, color: style.ring }}>{initials}</div>
      }
    </div>
  );
}

// ─── OrgNode Card ─────────────────────────────────────────────────────────────
function OrgNode({ node, depth, onSelectNode }) {
  const { t, tDyn } = useLanguage();
  const [collapsed, setCollapsed] = useState(depth >= 2);
  const hasChildren = node.children?.length > 0;
  const style = getLvl(node.level);
  const isRoot = depth === 0;

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex flex-col items-center group cursor-pointer select-none" style={{ minWidth: isRoot ? 200 : 168 }}>
        {/* Connector above (except root) */}
        {depth > 0 && (
          <div className="oc-line-v" style={{ width: 2, height: 20, background: 'rgba(255,255,255,0.08)' }} />
        )}

        {/* Card */}
        <div
          onClick={() => onSelectNode(node)}
          className="oc-node-card hover:border-white/25 transition-all"
          style={{
            background: isRoot
              ? `linear-gradient(135deg, ${style.ring}22, var(--bg-800))`
              : 'var(--bg-850)',
            border: `1.5px solid ${isRoot ? style.ring + '55' : 'var(--lm-hr-overlay-border)'}`,
            borderRadius: 16,
            padding: isRoot ? '16px 20px' : '12px 14px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            transition: 'all 0.2s',
            boxShadow: isRoot ? `0 0 28px ${style.ring}20` : 'none',
            width: isRoot ? 200 : 168,
          }}
        >
          <Avatar node={node} size={isRoot ? 56 : 44} />
          <div className="text-center">
            <p className={`oc-node-name font-bold text-white leading-tight ${isRoot ? 'text-sm' : 'text-xs'}`}>{node.name}</p>
            <p className="oc-node-code text-[10px] text-slate-400 mt-0.5 font-mono">{node.employee_code}</p>
            <p className={`oc-node-pos text-[10px] mt-1 font-semibold ${isRoot ? 'text-xs' : ''}`} style={{ color: style.ring }}>{node.position}</p>
            <p className="oc-node-dept text-[9px] text-slate-500 mt-0.5">{tDyn("hrm.departments", node.department) || node.department}</p>
          </div>
          <span className={`oc-node-badge text-[9px] font-bold px-2 py-0.5 rounded-full border ${getLvl(node.level).badge}`}>{node.level}</span>
          {hasChildren && (
            <span className="oc-node-meta text-[9px] text-slate-500">{node.children.length} {t('hrm.orgChart.directReports')}</span>
          )}
        </div>

        {/* Expand / Collapse */}
        {hasChildren && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setCollapsed(c => !c); }}
            className="oc-node-toggle"
            style={{
              marginTop: 4, width: 22, height: 22, borderRadius: '50%',
              background: collapsed ? style.ring : 'rgba(255,255,255,0.06)',
              border: `1px solid ${style.ring}55`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0,
            }}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <svg className="oc-node-toggle-icon" width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d={collapsed ? 'M2 4l3 3 3-3' : 'M2 6l3-3 3 3'} stroke={collapsed ? '#fff' : style.ring} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Children */}
      {hasChildren && !collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="oc-line-v" style={{ width: 2, height: 16, background: 'rgba(255,255,255,0.08)' }} />
          {node.children.length > 1 && (
            <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
              <div className="oc-line-h" style={{ height: 2, background: 'rgba(255,255,255,0.08)', position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: `calc(100% - 100px)` }} />
            </div>
          )}
          <div style={{ display: 'flex', gap: node.children.length > 1 ? 16 : 0, alignItems: 'flex-start', paddingTop: node.children.length > 1 ? 2 : 0 }}>
            {node.children.map(child => (
              <OrgNode key={child.id} node={child} depth={depth + 1} onSelectNode={onSelectNode} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Employee Detail Drawer ────────────────────────────────────────────────────
function EmployeeDrawer({ node, allEmployees, onClose, onReassign, reassigning, isAdmin }) {
  const { t, tDyn } = useLanguage();
  const [newManagerId, setNewManagerId] = useState(node?.manager_id || '');
  const style = getLvl(node?.level || 'Mid');
  if (!node) return null;

  const managerOptions = [
    { value: '', label: t('hrm.orgChart.noManagerRoot') },
    ...allEmployees
      .filter(e => e.id !== node.id)
      .map(e => ({ value: e.id, label: `${e.name} (${e.position})` })),
  ];

  return (
    <div className="oc-drawer-overlay fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="oc-drawer-content w-full max-w-sm flex flex-col h-full overflow-y-auto"
        style={{ background: 'var(--bg-900)', borderLeft: '1px solid var(--lm-hr-overlay-border)' }}
      >
        {/* Header */}
        <div className="oc-drawer-header px-6 py-5 flex items-start justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3">
            <Avatar node={node} size={48} />
            <div>
              <p className="oc-drawer-name font-bold text-white text-sm">{node.name}</p>
              <p className="oc-drawer-code text-xs font-mono text-slate-400">{node.employee_code}</p>
            </div>
          </div>
          <button onClick={onClose} className="oc-drawer-close text-slate-500 hover:text-white transition-colors mt-0.5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Info rows */}
        <div className="px-6 py-4 space-y-1">
          {[
            [t('hrm.orgChart.position'),       node.position],
            [t('hrm.orgChart.drawerDepartment'),     tDyn("hrm.departments", node.department) || node.department],
            [t('hrm.orgChart.level'),          node.level],
            [t('hrm.orgChart.email'),          node.email || '—'],
            [t('hrm.orgChart.hireDate'),      node.hire_date ? new Date(node.hire_date).toLocaleDateString() : '—'],
            [t('hrm.orgChart.directReportsDrawer'), node.children?.length ?? 0],
          ].map(([label, val]) => (
            <div key={label} className="oc-drawer-row flex justify-between items-center py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span className="oc-drawer-label text-xs text-slate-500">{label}</span>
              <span className="oc-drawer-val text-xs font-semibold text-slate-200">{val}</span>
            </div>
          ))}
        </div>

        {/* Level badge */}
        <div className="px-6 pb-4">
          <span className={`oc-drawer-badge inline-flex text-xs font-bold px-3 py-1.5 rounded-xl border ${getLvl(node.level).badge}`}>
            {node.level} {t('hrm.orgChart.levelBadge')}
          </span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Manager Reassignment — Admin only */}
        {isAdmin && (
          <div className="oc-drawer-reassign px-6 py-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="oc-reassign-title text-xs font-bold text-slate-300 mb-3 uppercase tracking-wider">{t('hrm.orgChart.reassignTitle')}</p>
            <DarkSelect
              value={newManagerId}
              onChange={setNewManagerId}
              options={managerOptions}
              placeholder={t('hrm.orgChart.noManagerRoot')}
              className="mb-3"
            />
            <button
              onClick={() => onReassign(node.id, newManagerId || null)}
              disabled={reassigning}
              className="oc-reassign-btn w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${style.ring}cc, ${style.ring}88)` }}
            >
              {reassigning ? t('hrm.orgChart.saving') : t('hrm.orgChart.confirmReassignment')}
            </button>
            <p className="oc-reassign-hint text-[10px] text-slate-600 mt-2 text-center">{t('hrm.orgChart.changesSaved')}</p>
          </div>
        )}

        {/* Profile link */}
        <div className="px-6 pb-6">
          <Link
            to={`/employees/${node.id}`}
            onClick={onClose}
            className="oc-profile-link block w-full py-2.5 rounded-xl text-sm font-semibold text-center transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b' }}
          >
            {t('hrm.orgChart.viewFullProfile')}
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Flatten tree ─────────────────────────────────────────────────────────────
function flattenTree(nodes, out = []) {
  for (const n of nodes) { out.push(n); if (n.children?.length) flattenTree(n.children, out); }
  return out;
}

// ─── Dept filter ──────────────────────────────────────────────────────────────
function filterByDept(node, dept) {
  if (node.department === dept) return { ...node, children: node.children.map(c => filterByDept(c, dept)).filter(Boolean) };
  const kids = node.children.map(c => filterByDept(c, dept)).filter(Boolean);
  return kids.length > 0 ? { ...node, children: kids } : null;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function OrgChart() {
  const { t, tDyn } = useLanguage();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [selectedNode, setSelectedNode] = useState(null);
  const [search, setSearch]             = useState('');
  const [deptFilter, setDeptFilter]     = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['org-chart'],
    queryFn: () => api.get('/org/chart').then(r => r.data),
    staleTime: 60000,
  });

  const reassignMutation = useMutation({
    mutationFn: ({ employee_id, new_manager_id }) =>
      api.put('/org/update-manager', { employee_id, new_manager_id }),
    onSuccess: () => {
      toast.success('Manager updated!');
      qc.invalidateQueries({queryKey:['org-chart']});
      setSelectedNode(null);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Reassignment failed'),
  });

  const tree        = data?.tree        || [];
  const departments = data?.departments || [];
  const allFlat     = flattenTree(tree);

  const searchResults = search.length >= 2
    ? allFlat.filter(e =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.employee_code.toLowerCase().includes(search.toLowerCase()) ||
        e.position.toLowerCase().includes(search.toLowerCase())
      )
    : [];

  const filteredTree = deptFilter
    ? tree.map(r => filterByDept(r, deptFilter)).filter(Boolean)
    : tree;

  const deptOptions = [
    { value: '', label: t('hrm.orgChart.allDepartments') },
    ...departments.map(d => ({ value: d.Department_name, label: tDyn("hrm.departments", d.Department_name) || d.Department_name })),
  ];

  return (
    <Layout title={t('hrm.orgChart.title')} subtitle={t('hrm.orgChart.subtitle')}>

      {/* ── Controls ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1 min-w-56">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
          </svg>
          <input
            type="text"
            placeholder={t('hrm.orgChart.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="oc-search-input w-full pl-9 pr-4 py-2 text-sm rounded-xl"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none' }}
          />
          {searchResults.length > 0 && (
            <div
              className="oc-search-results absolute top-full mt-1 left-0 right-0 z-30 rounded-xl overflow-hidden shadow-2xl"
              style={{ background: 'var(--bg-900)', border: '1px solid var(--lm-hr-overlay-border)', maxHeight: 320, overflowY: 'auto' }}
            >
              {searchResults.slice(0, 8).map(emp => (
                <button
                  key={emp.id}
                  onClick={() => { setSelectedNode(emp); setSearch(''); }}
                  className="oc-search-result-item w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors"
                >
                  <Avatar node={emp} size={32} />
                  <div>
                    <p className="oc-search-result-name text-sm font-semibold text-white">{emp.name}</p>
                    <p className="oc-search-result-pos text-xs text-slate-400">{emp.position} · {emp.department}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Department filter - custom dark dropdown */}
        <DarkSelect
          value={deptFilter}
          onChange={setDeptFilter}
          options={deptOptions}
          placeholder={t('hrm.orgChart.allDepartments')}
          className="w-52"
        />

        {/* Stats */}
        <div className="flex items-center gap-5 ml-auto">
          {[
            { label: t('hrm.orgChart.employees'), value: data?.total || 0, color: '#FF7700' },
            { label: t('hrm.orgChart.departments'), value: departments.length, color: '#C8192E' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className="oc-stat-val text-xl font-black" style={{ color: s.color }}>{s.value}</p>
              <p className="oc-stat-label text-[10px] text-slate-500 uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Level legend ── */}
      <div className="flex flex-wrap gap-2 mb-5">
        {Object.entries(LEVEL_STYLE).map(([lvl, s]) => (
          <span key={lvl} className={`oc-legend-badge text-[10px] font-bold px-2.5 py-1 rounded-lg border ${s.badge}`}>{lvl}</span>
        ))}
        <span className="oc-legend-hint text-[10px] text-slate-600 ml-2 self-center">
          {t('hrm.orgChart.clickCard')}
          {isAdmin() ? ' ' + t('hrm.orgChart.reassignManager') : ''}
        </span>
      </div>

      {/* ── Chart area ── */}
      <div
        className="oc-chart-wrapper rounded-2xl overflow-auto pb-12"
        style={{
          minHeight: 400,
          background: 'var(--bg-950)',
          border: '1px solid var(--lm-hr-overlay-border)',
        }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isError ? (
          <div className="oc-error text-center py-20 text-rose-400 font-semibold">{t('hrm.orgChart.loadFailed')}</div>
        ) : filteredTree.length === 0 ? (
          <div className="oc-empty text-center py-20 text-slate-500">{t('hrm.orgChart.noEmployees')}</div>
        ) : (
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', minWidth: '100%', padding: '32px 24px 48px' }}>
            {filteredTree.map((root, i) => (
              <div key={root.id} style={{ marginBottom: i < filteredTree.length - 1 ? 56 : 0 }}>
                {filteredTree.length > 1 && (
                  <p className="oc-root-label text-center text-[10px] text-slate-600 mb-3 font-semibold uppercase tracking-widest">
                    {i === 0 ? t('hrm.orgChart.executiveRoot') : `Root ${i + 1}`}
                  </p>
                )}
                <OrgNode node={root} depth={0} onSelectNode={setSelectedNode} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Drawer ── */}
      {selectedNode && (
        <EmployeeDrawer
          node={selectedNode}
          allEmployees={allFlat}
          onClose={() => setSelectedNode(null)}
          onReassign={(emp_id, mgr_id) => reassignMutation.mutate({ employee_id: emp_id, new_manager_id: mgr_id })}
          reassigning={reassignMutation.isLoading}
          isAdmin={isAdmin()}
        />
      )}
    </Layout>
  );
}
