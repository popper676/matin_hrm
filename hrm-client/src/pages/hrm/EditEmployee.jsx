import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { useLanguage } from '../../context/LanguageContext';

export default function EditEmployee() {
  const { t } = useLanguage();
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState({ employee_id: '', Full_name: '', email: '', phone: '', Dept_id: '', position_id: '', Manager_id: '', hire_date: '', date_of_birth: '', salary: '', national_id: '', address: '', employment_type: 'Full-Time', status: 'Active', employment_status: 'Active', resign_code: '', resign_date: '', resign_reason: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: formData, isLoading: isFormLoading } = useQuery({ queryKey: ['employees-form-data'], queryFn: () => api.get('/employees/form-data').then(r => r.data) });
  const { data: empData, isLoading: isEmpLoading } = useQuery({ queryKey: ['employee', id], queryFn: () => api.get(`/employees/${id}`).then(r => r.data) });

  useEffect(() => {
    if (empData?.emp) {
      const e = empData.emp;
      setForm({
        employee_id: e.employee_id || '', Full_name: e.Full_name || '', email: e.email || '', phone: e.phone || '',
        Dept_id: e.Dept_id || '', position_id: e.position_id || '', Manager_id: e.Manager_id || '',
        hire_date: e.hire_date ? e.hire_date.slice(0, 10) : '', date_of_birth: e.date_of_birth ? e.date_of_birth.slice(0, 10) : '',
        salary: e.salary || '', national_id: e.national_id || '', address: e.address || '',
        employment_type: e.employment_type || 'Full-Time', status: e.status || 'Active',
        employment_status: e.employment_status || 'Active', resign_code: e.resign_code || '',
        resign_date: e.resign_date ? e.resign_date.slice(0, 10) : '', resign_reason: e.resign_reason || ''
      });
    }
  }, [empData]);

  const updateMutation = useMutation({
    mutationFn: (body) => api.put(`/employees/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['employees']});
      qc.invalidateQueries({queryKey:['employee', id]});
      toast.success(t('hrm.editEmployee.success') || 'Employee updated successfully');
      navigate(`/employees/${id}`);
    },
    onError: (e) => toast.error(e.response?.data?.error || t('hrm.editEmployee.error') || 'Update failed')
  });

  const handleSave = (e) => {
    e.preventDefault();
    updateMutation.mutate(form);
  };

  if (isFormLoading || isEmpLoading) return <Layout title={t('hrm.editEmployee.title')}><div className="p-8 text-slate-400">{t('hrm.editEmployee.loading')}</div></Layout>;

  return (
    <Layout title={t('hrm.editEmployee.title')} subtitle={`${t('hrm.editEmployee.subtitle')} ${form.Full_name || t('hrm.editEmployee.employee')}`}>
      <div className="max-w-4xl mx-auto rounded-2xl border border-white/5 bg-surface-800">
        <form onSubmit={handleSave} className="p-6 md:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div><label className="form-label">{t('hrm.editEmployee.empId')} *</label><input required className="form-input" value={form.employee_id} onChange={e => set('employee_id', e.target.value)} /></div>
            <div><label className="form-label">{t('hrm.editEmployee.fullName')} *</label><input required className="form-input" value={form.Full_name} onChange={e => set('Full_name', e.target.value)} /></div>
            <div><label className="form-label">{t('hrm.editEmployee.email')}</label><input type="email" className="form-input" value={form.email} onChange={e => set('email', e.target.value)} /></div>
            <div><label className="form-label">{t('hrm.editEmployee.phone')}</label><input className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>

            <div>
              <label className="form-label">{t('hrm.editEmployee.department')}</label>
              <select className="form-input" value={form.Dept_id} onChange={e => set('Dept_id', e.target.value)}>
                <option value="">— {t('hrm.editEmployee.selectDept')} —</option>
                {formData?.departments?.map(d => <option key={d.id} value={d.id}>{d.Department_name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">{t('hrm.editEmployee.position')}</label>
              <select className="form-input" value={form.position_id} onChange={e => set('position_id', e.target.value)}>
                <option value="">— {t('hrm.editEmployee.selectPosition')} —</option>
                {formData?.positions?.map(p => {
                  let displayTitle = p.title;
                  if (p.title) {
                    const key = p.title.trim().toLowerCase().replace(/\s+/g, '');
                    const translated = t(`hrm.positions.names.${key}`);
                    if (translated && !translated.startsWith('hrm.')) displayTitle = translated;
                  }
                  return <option key={p.id} value={p.id}>{displayTitle}</option>;
                })}
              </select>
            </div>

            <div>
              <label className="form-label">{t('hrm.editEmployee.manager')}</label>
              <select className="form-input" value={form.Manager_id} onChange={e => set('Manager_id', e.target.value)}>
                <option value="">— {t('hrm.editEmployee.none')} —</option>
                {formData?.managers?.map(m => <option key={m.id} value={m.id}>{m.Full_name}</option>)}
              </select>
            </div>

            <div><label className="form-label">{t('hrm.editEmployee.hireDate')}</label><input type="date" className="form-input" value={form.hire_date} onChange={e => set('hire_date', e.target.value)} /></div>
            <div><label className="form-label">{t('hrm.editEmployee.dob')}</label><input type="date" className="form-input" value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} /></div>
            <div><label className="form-label">{t('hrm.editEmployee.salary')}</label><input type="number" step="0.01" className="form-input" value={form.salary} onChange={e => set('salary', e.target.value)} /></div>

            <div>
              <label className="form-label">{t('hrm.editEmployee.employmentType')}</label>
              <select className="form-input" value={form.employment_type} onChange={e => set('employment_type', e.target.value)}>
                {['Full-Time', 'Part-Time', 'Contract', 'Internship'].map(empType => {
                  let trans = empType;
                  if (empType === 'Full-Time') trans = t('hrm.employees.empTypes.fullTime') || empType;
                  if (empType === 'Part-Time') trans = t('hrm.employees.empTypes.partTime') || empType;
                  if (empType === 'Contract') trans = t('hrm.employees.empTypes.contract') || empType;
                  if (empType === 'Internship') trans = t('hrm.employees.empTypes.internship') || empType;
                  return <option key={empType} value={empType}>{trans}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="form-label text-slate-400">ACCOUNT STATUS</label>
              <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
                {['Active', 'On Leave', 'Offboarding', 'Inactive'].map(s => {
                  let trans = s;
                  if (s === 'Active') trans = t('hrm.employees.active') || s;
                  if (s === 'Inactive') trans = t('hrm.employees.inactive') || s;
                  if (s === 'On Leave') trans = t('hrm.employees.onLeave') || s;
                  if (s === 'Offboarding') trans = t('hrm.employees.offboarding') || s;
                  return <option key={s} value={s}>{trans}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="form-label font-bold text-brand-green">{t('hrm.employees.labels.employmentStatus') || 'EMPLOYMENT STATUS'}</label>
              <select className="form-input font-bold" value={form.employment_status} onChange={e => set('employment_status', e.target.value)}>
                <option value="Active">{t('hrm.employees.active') || 'Active'}</option>
                <option value="Resigned">{t('hrm.employees.resigned') || 'Resigned'}</option>
              </select>
            </div>

            {form.employment_status === 'Resigned' && (
              <>
                <div>
                  <label className="form-label">{t('hrm.employees.labels.resignCode') || 'Resign Code'}</label>
                  <input readOnly disabled className="form-input opacity-50 cursor-not-allowed" value={form.resign_code || 'Auto-generated on save'} />
                </div>
                <div>
                  <label className="form-label">{t('hrm.employees.labels.resignDate') || 'Resignation Date'}</label>
                  <input type="date" className="form-input" value={form.resign_date} onChange={e => set('resign_date', e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <label className="form-label">{t('hrm.employees.labels.resignReason') || 'Resignation Reason'}</label>
                  <input className="form-input" value={form.resign_reason} onChange={e => set('resign_reason', e.target.value)} />
                </div>
              </>
            )}

            <div className="md:col-span-2"><label className="form-label">{t('hrm.editEmployee.nationalId')}</label><input className="form-input" value={form.national_id} onChange={e => set('national_id', e.target.value)} /></div>
            <div className="md:col-span-2"><label className="form-label">{t('hrm.editEmployee.address')}</label><input className="form-input" value={form.address} onChange={e => set('address', e.target.value)} /></div>
          </div>

          <div className="flex gap-4 pt-4 border-t border-white/5">
            <button type="button" onClick={() => navigate(-1)} className="px-6 py-3 rounded-xl font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 transition-colors">{t('hrm.editEmployee.cancel')}</button>
            <button type="submit" disabled={updateMutation.isLoading} className="flex-1 px-6 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors">{updateMutation.isLoading ? t('hrm.editEmployee.saving') : t('hrm.editEmployee.saveChanges')}</button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
