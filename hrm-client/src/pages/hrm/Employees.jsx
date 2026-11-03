import EmployeeModal from '../../components/experience/EmployeeWizard';
import CredentialNotice from '../../components/experience/CredentialNotice';
import useCreateIntent from '../../hooks/useCreateIntent';
import Icon from '../../components/common/Icon';
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import { useLanguage } from '../../context/LanguageContext';

function StatusBadge({ status }) {
  const { t } = useLanguage();
  const cfg = {
    Active: 'emp-status-active text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    'On Leave': 'emp-status-leave text-amber-400 bg-amber-400/10 border-amber-400/20',
    Offboarding: 'emp-status-offboarding text-rose-400 bg-rose-400/10 border-rose-400/20',
    Inactive: 'emp-status-inactive text-slate-400 bg-slate-400/10',
  }[status] || 'emp-status-inactive text-slate-400 bg-slate-400/10';
  const isActive = status === 'Active';

  // Quick translation for status if needed, assuming status comes from DB and matches these strings.
  let displayStatus = status || '—';
  if (status === 'Active') displayStatus = t('hrm.employees.active') || status;
  else if (status === 'Inactive') displayStatus = t('hrm.employees.inactive') || status;
  else if (status === 'On Leave') displayStatus = t('hrm.employees.onLeave') || status;

  return (
    <span className={`emp-status-badge inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg}`}>
      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
      {displayStatus}
    </span>
  );
}

export default function Employees() {
  const { t } = useLanguage();
  const [showModal, setShowModal] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState(null);
  useCreateIntent(setShowModal);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [flash, setFlash] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [hardDeleteTarget, setHardDeleteTarget] = useState(null);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState('active'); // 'active' | 'recycle'
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [collapsedDepts, setCollapsedDepts] = useState({});
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const toggleDept = (dept) => setCollapsedDepts(prev => ({ ...prev, [dept]: !prev[dept] }));

  const { data, isLoading } = useQuery({
    queryKey: ['employees', page],
    queryFn: () => api.get(`/employees?page=${page}&limit=20`).then(r => r.data),
    enabled: tab === 'active'
  });

  const { data: recycleData, isLoading: recycleLoading } = useQuery({
    queryKey: ['employees-recycle'],
    queryFn: () => api.get('/employees/recycle-bin').then(r => r.data),
    enabled: tab === 'recycle'
  });
  const { data: formerData, isLoading: formerLoading } = useQuery({
    queryKey: ['employees-former', page],
    queryFn: () => api.get(`/employees/former?page=${page}&limit=20`).then(r => r.data),
    enabled: tab === 'former'
  });
  const { data: formData } = useQuery({ queryKey: ['employees-form-data'], queryFn: () => api.get('/employees/form-data').then(r => r.data) });

  const addMutation = useMutation({
    mutationFn: (body) => api.post('/employees', body),
    onSuccess: (res) => {
      qc.invalidateQueries({queryKey:['employees']});
      setShowModal(false);
      setCreatedCredentials(res.data.credentials || null);
      setFlash({ type: 'success', msg: t('hrm.employees.toast.added') || 'Employee added successfully' });
      setTimeout(() => setFlash(null), 4000);
    },
    onError: (e) => setFlash({ type: 'error', msg: e.response?.data?.error || t('hrm.employees.toast.addError') || 'Failed to add employee' }),
  });

  const { reset: resetAddEmployee } = addMutation;
  useEffect(() => { if (showModal) resetAddEmployee(); }, [showModal, resetAddEmployee]);

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/employees/${id}`),
    onSuccess: () => { qc.invalidateQueries({queryKey:['employees']}); qc.invalidateQueries({queryKey:['employees-recycle']}); setFlash({ type: 'success', msg: t('hrm.employees.toast.softDeleted') || 'Employee soft-deleted' }); setTimeout(() => setFlash(null), 3000); setDeleteTarget(null); },
  });

  const restoreMutation = useMutation({
    mutationFn: (id) => api.put(`/employees/${id}/restore`),
    onSuccess: () => { qc.invalidateQueries({queryKey:['employees']}); qc.invalidateQueries({queryKey:['employees-recycle']}); setFlash({ type: 'success', msg: t('hrm.employees.toast.restored') || 'Employee restored' }); setTimeout(() => setFlash(null), 3000); },
  });

  const hardDeleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/employees/${id}/hard`),
    onSuccess: () => { qc.invalidateQueries({queryKey:['employees-recycle']}); setFlash({ type: 'success', msg: t('hrm.employees.toast.hardDeleted') || 'Employee permanently deleted' }); setTimeout(() => setFlash(null), 3000); setHardDeleteTarget(null); },
    onError: (err) => { setFlash({ type: 'error', msg: err.response?.data?.error || t('hrm.employees.toast.hardDeleteError') || 'Failed to hard delete employee' }); setTimeout(() => setFlash(null), 5000); setHardDeleteTarget(null); }
  });

  const employees = data?.employees || [];
  const departments = formData?.departments || [];

  const mapPosTitle = (title) => {
    if (!title) return title;
    const key = title.trim().toLowerCase().replace(/\s+/g, '');
    const translated = t(`hrm.positions.names.${key}`);
    if (translated && !translated.startsWith('hrm.')) return translated;
    return title;
  };

  // Filter and group employees
  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = (emp.Full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (emp.employee_id || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = deptFilter ? emp.Dept_id === deptFilter : true;
    return matchesSearch && matchesDept;
  });

  const groupedEmployees = filteredEmployees.reduce((acc, emp) => {
    let dept = emp.dept_name;
    if (!dept || dept === '—') {
      if (/boss|ceo|director/i.test(emp.employee_id) || /boss|ceo|director/i.test(emp.Full_name)) {
        dept = 'Executive Board';
      } else {
        dept = 'Unassigned';
      }
    }
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(emp);
    return acc;
  }, {});

  const sortedDepts = Object.keys(groupedEmployees).sort((a, b) => {
    if (a === 'Executive Board') return -1;
    if (b === 'Executive Board') return 1;
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });

  return (
    <Layout title={t('hrm.employees.title')} subtitle={t('hrm.employees.subtitle')}>
      <CredentialNotice credentials={createdCredentials} onDismiss={() => setCreatedCredentials(null)}/>
      <div className="uyf-directory-summary">
        <div><span className="uyf-icon-tile"><Icon name="staff"/></span><div><p>{t('common.interface.employeeRecords')}</p><strong>{data?.total ?? employees.length}</strong></div></div>
        <div><span className="uyf-icon-tile"><Icon name="departments"/></span><div><p>{t('common.interface.departments')}</p><strong>{departments.length}</strong></div></div>
      </div>
      {/* Flash */}
      {flash && (
        <div className={`mb-6 flex items-center gap-3 rounded-2xl px-5 py-3 animate-slide-in ${flash.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-rose-500/10 border border-rose-500/30'}`}>
          <span className={`text-sm font-medium ${flash.type === 'success' ? 'text-emerald-300' : 'text-rose-300'}`}>{flash.msg}</span>
          <button aria-label="close" onClick={() => setFlash(null)} className="ml-auto text-slate-400 hover:text-white"><Icon name="close" size={17}/></button>
        </div>
      )}

      <div className="uyf-page-toolbar flex items-center justify-between mb-6">
        <div className="flex gap-4 border-b border-white/10 w-full sm:w-auto">
          <button
            onClick={() => { setTab('active'); setPage(1); }}
            className={`pb-2 px-1 text-sm font-semibold transition-colors ${tab === 'active' ? 'text-brand-green border-b-2 border-brand-green' : 'text-slate-400 hover:text-white'}`}
          >
            {t('hrm.employees.activeDirectory')}
          </button>
          <button
            onClick={() => { setTab('former'); setPage(1); }}
            className={`pb-2 px-1 text-sm font-semibold transition-colors ${tab === 'former' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-slate-400 hover:text-white'}`}
          >
            {t('hrm.employees.formerDirectory') || 'Former Employees'}
          </button>
          <button
            onClick={() => { setTab('recycle'); setPage(1); }}
            className={`pb-2 px-1 text-sm font-semibold transition-colors ${tab === 'recycle' ? 'text-rose-400 border-b-2 border-rose-400' : 'text-slate-400 hover:text-white'}`}
          >
            {t('hrm.employees.recycleBin')}
          </button>
        </div>

        {isAdmin() && tab === 'active' && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowBulkModal(true)}
              className="emp-btn-secondary px-4 py-2.5 w-full sm:w-auto"
            >
              {t('hrm.employees.bulkImport')}
            </button>
            <button onClick={() => setShowModal(true)}
              className="emp-btn-primary px-4 py-2.5 gap-2 w-full sm:w-auto">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              {t('hrm.employees.addEmployee')}
            </button>
          </div>
        )}
      </div>

      {/* Toolbar for Search & Filters */}
      {tab === 'active' && (
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <input
            type="text"
            placeholder={t('hrm.employees.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="emp-search-input flex-1 outline-none w-full"
          />
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="emp-filter-select outline-none w-full sm:w-48"
          >
            <option value="">{t('hrm.employees.allDepartments')}</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.Department_name}</option>)}
          </select>
        </div>
      )}

      <div className="rounded-2xl overflow-hidden bg-surface-800 border border-white/5">
        {(tab === 'active' ? isLoading : recycleLoading) ? (
          <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-850">
                <tr>
                  {tab === 'former' ? (
                    [t('hrm.employees.cols.resignCode') || 'Resign Code', t('hrm.employees.cols.fullName'), t('hrm.employees.cols.department'), t('hrm.employees.cols.position'), t('hrm.employees.cols.exitDate') || 'Exit Date', t('hrm.employees.cols.email')].map(h => (
                      <th key={h} className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                    ))
                  ) : (
                    [t('hrm.employees.cols.empId'), t('hrm.employees.cols.fullName'), t('hrm.employees.cols.department'), t('hrm.employees.cols.position'), t('hrm.employees.cols.status'), t('hrm.employees.cols.email'), t('hrm.employees.cols.hireDate')].map(h => (
                      <th key={h} className="text-left py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                    ))
                  )}
                  <th className="text-right py-3.5 px-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('hrm.employees.cols.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {tab === 'active' ? (
                  sortedDepts.length > 0 ? (
                    sortedDepts.map(dept => {
                      const emps = groupedEmployees[dept];
                      return (
                      <React.Fragment key={dept}>
                        <tr className="emp-dept-header cursor-pointer transition-colors" onClick={() => toggleDept(dept)}>
                          <td colSpan="8" className="py-3 px-5">
                            <div className="flex items-center gap-2 text-sm font-semibold">
                              <span className="text-xs transition-transform duration-200" style={{ transform: collapsedDepts[dept] ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
                              {dept} <span className="emp-dept-count px-2 py-0.5 rounded-full ml-2 text-[10px]">{emps.length}</span>
                            </div>
                          </td>
                        </tr>
                        {!collapsedDepts[dept] && emps.map(emp => (
                          <tr key={emp.id} className="emp-row transition-colors group cursor-pointer" onClick={() => window.location.href = `/employees/${emp.id}`}>
                            <td className="py-3.5 px-5"><span className="emp-id-badge">{emp.employee_id || '—'}</span></td>
                            <td className="py-3.5 px-5">
                              <div className="flex items-center gap-2.5">
                                <div className="emp-avatar">{(emp.Full_name || '?')[0]}</div>
                                <span className="font-medium">{emp.Full_name || '—'}</span>
                              </div>
                            </td>
                            <td className="py-3.5 px-5 text-slate-300">{emp.dept_name || '—'}</td>
                            <td className="py-3.5 px-5 text-slate-300">{mapPosTitle(emp.pos_title) || '—'}</td>
                            <td className="py-3.5 px-5"><StatusBadge status={emp.status} /></td>
                            <td className="emp-email py-3.5 px-5">{emp.email || '—'}</td>
                            <td className="emp-hire-date py-3.5 px-5">{(emp.hire_date || '').slice(0, 10) || '—'}</td>
                            <td className="py-3.5 px-5" onClick={e => e.stopPropagation()}>
                              <div className="emp-action-group">
                                <Link to={`/employees/${emp.id}`} aria-label={t('hrm.employees.view')} className="emp-action-view">
                                  <span className="text-sm"><Icon name="documents" size={17}/></span>
                                  <span className="emp-action-text">{t('hrm.employees.view')}</span>
                                </Link>
                                <Link to={`/employees/${emp.id}/edit`} aria-label={t('hrm.employees.edit')} className="emp-action-edit">
                                  <span className="text-sm"><Icon name="edit" size={17}/></span>
                                  <span className="emp-action-text">{t('hrm.employees.edit')}</span>
                                </Link>
                                {isAdmin() && (
                                  <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(emp); }}
                                    className="emp-action-delete" title="Soft Delete">
                                    <span className="text-sm"><Icon name="trash" size={17}/></span>
                                    <span className="emp-action-text hidden">{t('hrm.employees.delete')}</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                      );
                    })
                  ) : (
                    <tr><td colSpan="8" className="py-16 text-center">
                      <div className="text-4xl mb-3"><Icon name="users" size={17}/></div>
                      <p className="text-slate-400 text-sm">{t('hrm.employees.noEmployeesFound')}</p>
                      <button onClick={() => setShowModal(true)} className="mt-3 text-sm text-brand-green hover:underline font-semibold">{t('hrm.employees.addFirstEmployee')}</button>
                    </td></tr>
                  )
                ) : tab === 'former' ? (
                  (formerData?.employees || []).length > 0 ? formerData.employees.map(emp => (
                    <tr key={emp.id} className="emp-row transition-colors group cursor-pointer" onClick={() => window.location.href = `/employees/${emp.id}`}>
                      <td className="py-3.5 px-5"><span className="emp-id-badge bg-amber-400/10 text-amber-400 border border-amber-400/20">{emp.resign_code || '—'}</span></td>
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2.5">
                          <div className="emp-avatar">{(emp.Full_name || '?')[0]}</div>
                          <span className="font-medium">{emp.Full_name || '—'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-slate-300">{emp.dept_name || '—'}</td>
                      <td className="py-3.5 px-5 text-slate-300">{mapPosTitle(emp.pos_title) || '—'}</td>
                      <td className="emp-hire-date py-3.5 px-5">{(emp.resign_date || '').slice(0, 10) || '—'}</td>
                      <td className="emp-email py-3.5 px-5">{emp.email || '—'}</td>
                      <td className="py-3.5 px-5" onClick={e => e.stopPropagation()}>
                        <div className="emp-action-group">
                          <Link to={`/employees/${emp.id}`} aria-label={t('hrm.employees.view')} className="emp-action-view">
                            <span className="text-sm"><Icon name="documents" size={17}/></span>
                            <span className="emp-action-text">{t('hrm.employees.view')}</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan="8" className="py-16 text-center text-slate-400 text-sm">{t('hrm.employees.noEmployeesFound')}</td></tr>
                  )
                ) : (
                  /* Recycle Bin Rendering */
                  (recycleData?.employees || []).length > 0 ? recycleData.employees.map(emp => (
                    <tr key={emp.id} className="emp-row transition-colors group">
                      <td className="py-3.5 px-5"><span className="emp-id-badge">{emp.employee_id || '—'}</span></td>
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2.5">
                          <div className="emp-avatar">{(emp.Full_name || '?')[0]}</div>
                          <span className="font-medium">{emp.Full_name || '—'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-slate-300">{emp.dept_name || '—'}</td>
                      <td className="py-3.5 px-5 text-slate-300">{mapPosTitle(emp.pos_title) || '—'}</td>
                      <td className="py-3.5 px-5"><StatusBadge status={emp.status} /></td>
                      <td className="emp-email py-3.5 px-5">{emp.email || '—'}</td>
                      <td className="emp-hire-date py-3.5 px-5">{(emp.hire_date || '').slice(0, 10) || '—'}</td>
                      <td className="py-3.5 px-5">
                        <div className="emp-action-group">
                          <button onClick={() => restoreMutation.mutate(emp.id)} aria-label={t('hrm.employees.edit')} className="emp-action-edit">
                            <span className="emp-action-text">{t('hrm.employees.restore')}</span>
                          </button>
                          {isAdmin() && (
                            <button onClick={() => setHardDeleteTarget(emp)} className="emp-action-delete">
                              <span className="emp-action-text">{t('hrm.employees.hardDelete')}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan="8" className="py-16 text-center text-slate-400 text-sm">{t('hrm.employees.recycleEmpty')}</td></tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {(tab === 'active' || tab === 'former') && (data?.total > 0 || formerData?.total > 0) && !isLoading && !formerLoading && (
          <div className="emp-pagination px-6 py-4 border-t border-white/5 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {t('hrm.employees.showing')} <span className="font-bold text-white">{(page - 1) * 20 + 1}</span> {t('hrm.employees.to')} <span className="font-bold text-white">{Math.min(page * 20, (tab === 'active' ? data.total : formerData.total))}</span> {t('hrm.employees.of')} <span className="font-bold text-white">{(tab === 'active' ? data.total : formerData.total)}</span> {t('hrm.employees.employeesCount')}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-white/5 hover:bg-white/10 disabled:opacity-50 transition-colors"
              >
                {t('hrm.employees.prev')}
              </button>
              <button
                disabled={page * 20 >= (tab === 'active' ? data.total : formerData.total)}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-white/5 hover:bg-white/10 disabled:opacity-50 transition-colors"
              >
                {t('hrm.employees.next')}
              </button>
            </div>
          </div>
        )}
      </div>

      <EmployeeModal
        isPending={addMutation.isPending}
        error={addMutation.error?.response?.data?.error || addMutation.error?.message}
        open={showModal}
        onClose={() => setShowModal(false)}
        departments={formData?.departments}
        positions={formData?.positions}
        managers={formData?.managers}
        candidates={formData?.candidates}
        onSave={addMutation.mutate}
      />

      <BulkImportModal
        open={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        onRefresh={() => qc.invalidateQueries({queryKey:['employees']})}
      />

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        itemName={deleteTarget?.Full_name}
      />

      <ConfirmDeleteModal
        isOpen={!!hardDeleteTarget}
        onClose={() => setHardDeleteTarget(null)}
        onConfirm={() => hardDeleteMutation.mutate(hardDeleteTarget.id)}
        itemName={`${hardDeleteTarget?.Full_name} (PERMANENTLY)`}
      />
    </Layout>
  );
}

function BulkImportModal({ open, onClose, onRefresh }) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [importResult,setImportResult]=useState(null);

  if (!open) return null;

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) return toast.error(t('hrm.employees.selectFileError') || 'Please select an Excel (.xlsx/.xls) or CSV file');

    setLoading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await api.post('/employees/bulk-import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(res.data?.message || t('hrm.employees.bulkSuccess') || 'Bulk update completed successfully!');
      setLoading(false);
      setImportResult(res.data);
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error || t('hrm.employees.bulkError') || 'Import failed');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative rounded-2xl w-full max-w-lg p-6 emp-modal-surface bg-surface-850 border border-white/10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-white">{t('hrm.employees.bulkTitle')}</h2>
            <p className="text-xs text-slate-400">{t('hrm.employees.bulkDesc')}</p>
          </div>
          <button aria-label="close" onClick={onClose} className="text-slate-400 hover:text-white"><Icon name="close" size={17}/></button>
        </div>

        <div className="emp-info-box p-3 rounded-xl mb-4 text-xs">
          <p className="emp-info-title font-bold mb-1">{t('hrm.employees.supportedHeaders')}</p>
          <code className="emp-code-block px-2 py-1 rounded block font-mono">
            Employee ID | Full Name | Salary | Email | Phone
          </code>
        </div>

        {importResult && <div className="mb-4 space-y-3" role="status">
          <p>{importResult.message}</p>
          {importResult.errors?.map((error,i)=><p key={i} className="text-rose-300 text-sm">{error}</p>)}
          {importResult.credentials?.length>0 && <div className="rounded-xl border border-amber-400/30 p-3 text-sm">
            <p>{t('hrm.employees.importCredentials')}</p>
            {importResult.credentials.map(c=><div key={c.employee_id} className="my-2"><strong>{c.username}</strong><input aria-label={c.username+' temporary password'} readOnly value={c.temporary_password} className="form-input font-mono" /></div>)}
          </div>}
        </div>}
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="form-label text-xs">{t('hrm.employees.selectFile')}</label>
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              required
              onChange={(e) => setSelectedFile(e.target.files?.[0])}
              className="w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-white/10 file:text-slate-300 hover:file:bg-white/20 file:transition-colors cursor-pointer emp-file-input"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="emp-btn-secondary px-5 py-2.5">
              {t('hrm.employees.cancel')}
            </button>
            <button type="submit" disabled={loading} className="emp-btn-primary px-6 py-2.5 disabled:opacity-50">
              {loading ? t('hrm.employees.uploading') : t('hrm.employees.uploadBtn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
