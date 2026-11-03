import EmployeeInformation from '../../components/employee/EmployeeInformation';
import {useAuth} from '../../context/AuthContext';
import Icon from '../../components/common/Icon';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { useState, useRef } from 'react';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import toast from 'react-hot-toast';
import HandoverPanel from '../../components/handover/HandoverPanel';
import { useLanguage } from '../../context/LanguageContext';

const STATUS_COLORS = {
  completed: 'text-emerald-400 bg-emerald-500/10',
  waived: 'text-slate-400 bg-slate-500/10',
  cancelled: 'text-rose-400 bg-rose-500/10',
  in_progress: 'text-indigo-400 bg-indigo-500/10',
  pending_review: 'text-purple-400 bg-purple-500/10',
};


function HandoverHistorySection({ employeeId }) {
  const { t } = useLanguage();
  const [detailId, setDetailId] = useState(null);
  const { data, isLoading } = useQuery({
    queryKey: ['employee-handovers', employeeId],
    queryFn: () => api.get(`/handover/employee/${employeeId}`).then(r => r.data),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['handover-detail', detailId],
    queryFn: () => api.get(`/handover/${detailId}`).then(r => r.data),
    enabled: !!detailId,
  });

  if (isLoading) return <p className="text-slate-500 text-sm">{t('hrm.employeeProfile.loadingHandover')}</p>;

  const outgoing = data?.outgoing || [];
  const incoming = data?.incoming || [];
  const counts = data?.counts || {};
  const all = [...outgoing.map(h => ({ ...h, role: 'outgoing' })), ...incoming.map(h => ({ ...h, role: 'incoming' }))];

  if (!all.length) {
    return <p className="text-slate-500 text-sm">{t('hrm.employeeProfile.noHandover')}</p>;
  }

  return (
    <>
      <div className="flex flex-wrap gap-3 mb-4 text-xs text-slate-500">
        <span>{t('hrm.employeeProfile.outgoingActive')}: {counts.outgoing_active ?? 0}</span>
        <span>·</span>
        <span>{t('hrm.employeeProfile.outgoingCompleted')}: {counts.outgoing_completed ?? 0}</span>
        <span>·</span>
        <span>{t('hrm.employeeProfile.incomingActive')}: {counts.incoming_active ?? 0}</span>
      </div>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {all.slice(0, 12).map(h => (
          <button
            key={`${h.role}-${h.id}`}
            onClick={() => setDetailId(h.id)}
            className="w-full text-left p-3 rounded-xl border border-white/5 bg-surface-850 hover:bg-white/5 transition-colors"
          >
            <div className="flex justify-between items-start gap-2">
              <div>
                <p className="text-sm font-medium text-white">{h.handover_label || h.handover_kind}</p>
                <p className="text-[10px] text-slate-500 mt-0.5 capitalize">
                  {h.role === 'outgoing' ? `${t('hrm.employeeProfile.to')} ${h.successor_name || '—'}` : `${t('hrm.employeeProfile.from')} ${h.outgoing_name || '—'}`}
                  {' · '}{h.trigger_type?.replace(/_/g, ' ')}
                </p>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded capitalize flex-shrink-0 ${STATUS_COLORS[h.status] || 'text-slate-400 bg-white/5'}`}>
                {h.status?.replace(/_/g, ' ')}
              </span>
            </div>
          </button>
        ))}
      </div>
      {all.length > 12 && (
        <Link to="/handovers" className="text-xs text-brand-green hover:underline mt-3 inline-block font-semibold">{t('hrm.employeeProfile.viewAllHandovers')}</Link>
      )}

      {detailId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDetailId(null)} />
          <div className="relative rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto m-4 p-6" style={{ background: 'var(--bg-850, #161929)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center justify-between mb-4 sticky top-0 bg-surface-850 pb-2 z-10">
              <h2 className="text-base font-bold text-white">{t('hrm.employeeProfile.handoverDetail')}</h2>
              <button aria-label="close" onClick={() => setDetailId(null)} className="text-slate-400 hover:text-white"><Icon name="close" size={17}/></button>
            </div>
            {detailLoading || !detail?.handover ? (
              <div className="py-8 text-center"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin inline-block" /></div>
            ) : (
              <HandoverPanel
                handover={detail.handover}
                items={detail.items || []}
                readOnly={['completed', 'waived', 'cancelled'].includes(detail.handover.status)}
                allowSuccessorEdit={false}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

const mapLeaveType = (name, t) => {
  if (!name) return name;
  const key = name.toLowerCase().replace(' leave', '').replace(' ', '');
  return t(`hrm.leave.leaveType.${key}`) || name;
};

export default function EmployeeProfile() {
  const { t } = useLanguage();
  const { id } = useParams();
  const qc = useQueryClient();
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['employee', id],
    queryFn: () => api.get(`/employees/${id}`).then(r => r.data)
  });

  const uploadMutation = useMutation({
    mutationFn: (file) => {
      const formData = new FormData();
      formData.append('avatar', file);
      return api.post(`/employees/${id}/avatar`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['employee', id]});
      qc.invalidateQueries({queryKey:['portal']}); // In case the user is looking at their own profile
      toast.success(t('hrm.employeeProfile.toast.avatarSuccess'));
      setIsUploading(false);
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || t('hrm.employeeProfile.toast.uploadError'));
      setIsUploading(false);
    }
  });

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t('hrm.employeeProfile.toast.fileSize'));
      return;
    }
    setIsUploading(true);
    uploadMutation.mutate(file);
  };

  if (isLoading) return <Layout title="Employee Profile"><div className="p-8 text-slate-400">{t('hrm.employeeProfile.loadingProfile')}</div></Layout>;
  if (!data?.emp) return <Layout title="Not Found"><div className="p-8 text-rose-400">{t('hrm.employeeProfile.notFound')}</div></Layout>;

  const { emp, attendance_records, leave_balances, kpi_records, vote_stats, total_paid, career_timeline } = data;

  const refetch = () => qc.invalidateQueries({queryKey:['employee', id]});

  return (
    <Layout title={`${t('hrm.employeeProfile.profile')} ${emp.Full_name}`} subtitle={`${t('hrm.employeeProfile.empId')} ${emp.employee_id}`}>
      <Link className="ux-button ux-button-secondary" style={{marginBottom:20}} to={'/employees/'+id+'/360'}>Employee 360 ↗</Link>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Col: Info */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl border border-white/5 bg-surface-800">
            <div className="flex items-center gap-4 mb-6">
              <div
                className="relative w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-lg overflow-hidden group cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                {emp.avatar_url ? (
                  <img src={emp.avatar_url} alt={emp.Full_name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full uyf-avatar-solid flex items-center justify-center">
                    {emp.Full_name[0]}
                  </div>
                )}

                {/* Upload Overlay */}
                <div className={`absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${isUploading ? 'opacity-100' : ''}`}>
                  {isUploading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/png, image/jpeg, image/gif, image/webp"
                  className="hidden"
                />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{emp.Full_name}</h2>
                <p className="text-brand-orange font-mono text-sm font-semibold">{emp.employee_id}</p>
                <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${emp.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                  {emp.status === 'Active' ? (t('hrm.employees.active') || 'Active') : (t('hrm.employees.inactive') || 'Inactive')}
                </span>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-slate-500">{t('hrm.employeeProfile.info.department')}</span>
                <span className="text-white font-medium">{emp.dept_name}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-slate-500">{t('hrm.employeeProfile.info.position')}</span>
                <span className="text-white font-medium">{emp.pos_title}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-slate-500">{t('hrm.employeeProfile.info.manager')}</span>
                <span className="text-white font-medium">{emp.manager_name || t('hrm.employeeProfile.info.none')}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-slate-500">{t('hrm.employeeProfile.info.hireDate')}</span>
                <span className="text-white font-medium">{emp.hire_date?.slice(0, 10) || t('hrm.employeeProfile.info.na')}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-slate-500">{t('hrm.employeeProfile.info.email')}</span>
                <span className="text-white font-medium">{emp.email || t('hrm.employeeProfile.info.na')}</span>
              </div>
              <div className="flex justify-between pb-2">
                <span className="text-slate-500">{t('hrm.employeeProfile.info.phone')}</span>
                <span className="text-white font-medium">{emp.phone || t('hrm.employeeProfile.info.na')}</span>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <Link to={`/employees/${id}/edit`} className="flex-1 text-center bg-brand-green hover:bg-emerald-500 text-black font-bold py-2 rounded-xl transition-colors">
                {t('hrm.employeeProfile.editProfile')}
              </Link>
            </div>
          </div>

          <div className="p-6 rounded-2xl border border-white/5 bg-surface-800">
            <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest">{t('hrm.employeeProfile.quickStats')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-white/5 text-center">
                <div className="text-2xl font-bold text-brand-orange">{vote_stats?.avg || 0}</div>
                <div className="text-xs text-slate-500">{t('hrm.employeeProfile.peerRating')}</div>
              </div>
              <div className="p-4 rounded-xl bg-white/5 text-center">
                <div className="text-2xl font-bold text-emerald-400">{(total_paid || 0).toLocaleString()} THB</div>
                <div className="text-xs text-slate-500">{t('hrm.employeeProfile.totalPaid')}</div>
              </div>
            </div>
          </div>


        </div>

        {/* Right Col: Details */}
        <div className="lg:col-span-2 space-y-6">

          {/* Career Timeline Section */}
          <CareerTimelineSection employeeId={id} timeline={career_timeline} refetch={refetch} />

          {/* Attendance Overview */}
          <div className="p-6 rounded-2xl border border-white/5 bg-surface-800">
            <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest">{t('hrm.employeeProfile.attendance.title')}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-white/5">
                    <th className="pb-3 font-medium">{t('hrm.employeeProfile.attendance.date')}</th>
                    <th className="pb-3 font-medium">{t('hrm.employeeProfile.attendance.checkIn')}</th>
                    <th className="pb-3 font-medium">{t('hrm.employeeProfile.attendance.checkOut')}</th>
                    <th className="pb-3 font-medium">{t('hrm.employeeProfile.attendance.method')}</th>
                    <th className="pb-3 font-medium">{t('hrm.employeeProfile.attendance.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance_records?.slice(0, 5).map(r => (
                    <tr key={r.id} className="border-b border-white/5 last:border-0">
                      <td className="py-3 text-white">{r.check_in?.slice(0, 10)}</td>
                      <td className="py-3 text-emerald-400 font-mono">{r.check_in?.slice(11, 16)}</td>
                      <td className="py-3 text-rose-400 font-mono">{r.check_out?.slice(11, 16) || '—'}</td>
                      <td className="py-3 text-slate-400">{r.attendance_method ? (t(`hrm.attendance.methods.${r.attendance_method.toLowerCase()}`) || r.attendance_method) : '—'}</td>
                      <td className="py-3">
                        {r.is_late ? <span className="text-amber-400 bg-amber-400/10 px-2 py-1 rounded text-xs">{t('hrm.employeeProfile.attendance.late')}</span> : <span className="text-emerald-400 text-xs">{t('hrm.employeeProfile.attendance.onTime')}</span>}
                      </td>
                    </tr>
                  ))}
                  {attendance_records?.length === 0 && (
                    <tr><td colSpan="5" className="py-4 text-slate-500 text-center">{t('hrm.employeeProfile.attendance.noRecords')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <EmployeeInformation employeeId={id} />

          {/* Leave Balances */}
          <div className="p-6 rounded-2xl border border-white/5 bg-surface-800">
            <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest">{t('hrm.employeeProfile.leaves.title')}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {leave_balances?.map(lb => (
                <div key={lb.id} className="p-4 rounded-xl border border-white/5 bg-surface-850">
                  <div className="text-xs text-slate-500 mb-1 line-clamp-1">{mapLeaveType(lb.type_name, t)}</div>
                  <div className="text-xl font-bold text-white">{lb.remaining_days} <span className="text-xs font-normal text-slate-500">{t('hrm.employeeProfile.leaves.days')}</span></div>
                  <div className="text-[10px] text-slate-600 mt-1">{t('hrm.employeeProfile.leaves.used')} {lb.used_days}</div>
                </div>
              ))}
              {leave_balances?.length === 0 && <p className="text-slate-500 text-sm col-span-full">{t('hrm.employeeProfile.leaves.noBalances')}</p>}
            </div>
          </div>

          {/* Handover history */}
          <div className="p-6 rounded-2xl border border-white/5 bg-surface-800">
            <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest">{t('hrm.employeeProfile.handoverDetail').replace(' detail',' History')}</h3>
            <HandoverHistorySection employeeId={id} />
          </div>

          {/* KPIs */}
          <div className="p-6 rounded-2xl border border-white/5 bg-surface-800">
            <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest">{t('hrm.employeeProfile.kpi.title')}</h3>
            <div className="space-y-3">
              {kpi_records?.map(k => (
                <div key={k.id} className="p-4 rounded-xl border border-white/5 bg-surface-850 flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-white text-sm">{k.title}</h4>
                    <p className="text-xs text-slate-500 mt-1">{t('hrm.employeeProfile.kpi.due')} {k.due_date || 'N/A'}</p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${k.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                    {k.status}
                  </span>
                </div>
              ))}
              {kpi_records?.length === 0 && <p className="text-slate-500 text-sm">{t('hrm.employeeProfile.kpi.noKpis')}</p>}
            </div>
          </div>

        </div>
      </div>
    </Layout>
  );
}

function CareerTimelineSection({ employeeId, timeline = [], refetch }) {
  const {can,user}=useAuth();
  const canSalary=!!user?.is_owner||!!user?.access?.sensitive?.salary;
  const { t } = useLanguage();
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    event_type: 'PROMOTION',
    title: '',
    description: '',
    previous_position: '',
    new_position: '',
    previous_salary: '',
    new_salary: '',
    effective_date: new Date().toISOString().split('T')[0],
  });

  const addMutation = useMutation({
    mutationFn: (body) => api.post(`/employees/${employeeId}/timeline`, body),
    onSuccess: () => {
      toast.success(t('hrm.employeeProfile.toast.milestoneSuccess'));
      setShowAddModal(false);
      setFormData({
        event_type: 'PROMOTION',
        title: '',
        description: '',
        previous_position: '',
        new_position: '',
        previous_salary: '',
        new_salary: '',
        effective_date: new Date().toISOString().split('T')[0],
      });
      if (refetch) refetch();
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || t('hrm.employeeProfile.toast.milestoneError'));
    }
  });

  const EVENT_TYPE_STYLES = {
    HIRED: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', label: t('hrm.employeeProfile.eventTypes.hired') },
    PROMOTION: { bg: 'bg-brand-orange/10', text: 'text-brand-orange', border: 'border-brand-orange/30', label: t('hrm.employeeProfile.eventTypes.promotion') },
    SALARY_RAISE: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', label: t('hrm.employeeProfile.eventTypes.salaryRaise') },
    DEPARTMENT_TRANSFER: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', label: t('hrm.employeeProfile.eventTypes.deptTransfer') },
    COMMENDATION: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30', label: t('hrm.employeeProfile.eventTypes.commendation') },
    WARNING: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30', label: t('hrm.employeeProfile.eventTypes.warning') },
    OTHER: { bg: 'bg-slate-500/10', text: 'text-slate-300', border: 'border-slate-500/30', label: t('hrm.employeeProfile.eventTypes.other') },
  };

  return (
    <div className="p-6 rounded-2xl border border-white/5 bg-surface-800">
      <div className="uyf-page-toolbar flex items-center justify-between mb-6">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-widest">{t('hrm.employeeProfile.careerTimeline')}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{t('hrm.employeeProfile.timelineDesc')}</p>
        </div>
        {can('employees','edit') && <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1.5 text-xs font-bold rounded-xl bg-brand-orange hover:bg-orange-500 text-white transition-colors"
        >
          + {t('hrm.employeeProfile.addMilestone')}
        </button>}
      </div>

      {!timeline.length ? (
        <p className="text-slate-500 text-sm py-4 text-center">{t('hrm.employeeProfile.noTimeline')}</p>
      ) : (
        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-white/10">
          {timeline.map((evt) => {
            const style = EVENT_TYPE_STYLES[evt.event_type] || EVENT_TYPE_STYLES.OTHER;
            return (
              <div key={evt.id} className="relative group">
                <div className={`absolute -left-[23px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-surface-800 ${style.bg.replace('/10', '')} shadow-md`} />
                <div className="p-4 rounded-xl border border-white/5 bg-surface-850 hover:bg-white/[0.03] transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${style.bg} ${style.text} ${style.border}`}>
                      {style.label}
                    </span>
                    <span className="text-xs font-mono text-slate-400">{evt.effective_date?.slice(0, 10)}</span>
                  </div>
                  <h4 className="text-sm font-bold text-white mt-1">{evt.title}</h4>
                  {evt.description && <p className="text-xs text-slate-400 mt-1">{evt.description}</p>}

                  {(evt.previous_position || evt.new_position) && (
                    <div className="mt-2 text-xs font-mono text-slate-300 bg-white/5 px-2.5 py-1.5 rounded-lg inline-block">
                      {t('hrm.employeeProfile.milestonePos')} <span className="text-slate-400">{evt.previous_position || '—'}</span> ➔ <span className="text-brand-orange font-semibold">{evt.new_position || '—'}</span>
                    </div>
                  )}

                  {(evt.previous_salary != null || evt.new_salary != null) && (
                    <div className="mt-2 text-xs font-mono text-slate-300 bg-white/5 px-2.5 py-1.5 rounded-lg inline-block ml-2">
                      {t('hrm.employeeProfile.milestoneSal')} <span className="text-slate-400">THB {Number(evt.previous_salary || 0).toLocaleString()}</span> ➔ <span className="text-emerald-400 font-semibold">THB {Number(evt.new_salary || 0).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAddModal && can('employees','edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-surface-850 border border-white/10 rounded-2xl p-6 w-full max-w-lg">
            <h3 className="text-base font-bold text-white mb-4">{t('hrm.employeeProfile.addMilestoneTitle')}</h3>
            <form onSubmit={(e) => { e.preventDefault(); addMutation.mutate(formData); }} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">{t('hrm.employeeProfile.form.eventType')}</label>
                <select
                  value={formData.event_type}
                  onChange={(e) => setFormData({ ...formData, event_type: e.target.value })}
                  className="w-full bg-surface-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="PROMOTION">{t('hrm.employeeProfile.eventTypes.promotion')}</option>
                  <option value="SALARY_RAISE" disabled={!canSalary}>{t('hrm.employeeProfile.eventTypes.salaryRaise')}</option>
                  <option value="DEPARTMENT_TRANSFER">{t('hrm.employeeProfile.eventTypes.deptTransfer')}</option>
                  <option value="COMMENDATION">{t('hrm.employeeProfile.eventTypes.commendation')}</option>
                  <option value="OTHER">{t('hrm.employeeProfile.eventTypes.other')}</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">{t('hrm.employeeProfile.form.title')}</label>
                <input
                  type="text"
                  required
                  placeholder={t('hrm.employeeProfile.placeholders.title')}
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full bg-surface-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">{t('hrm.employeeProfile.form.desc')}</label>
                <textarea
                  rows="2"
                  placeholder={t('hrm.employeeProfile.placeholders.desc')}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-surface-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">{t('hrm.employeeProfile.form.prevPos')}</label>
                  <input
                    type="text"
                    placeholder={t('hrm.employeeProfile.placeholders.prevPos')}
                    value={formData.previous_position}
                    onChange={(e) => setFormData({ ...formData, previous_position: e.target.value })}
                    className="w-full bg-surface-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">{t('hrm.employeeProfile.form.newPos')}</label>
                  <input
                    type="text"
                    placeholder={t('hrm.employeeProfile.placeholders.newPos')}
                    value={formData.new_position}
                    onChange={(e) => setFormData({ ...formData, new_position: e.target.value })}
                    className="w-full bg-surface-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">{t('hrm.employeeProfile.form.prevSal')}</label>
                  <input
                    type="number"
                    placeholder={t('hrm.employeeProfile.placeholders.salaryPrev')}
                    disabled={!canSalary} value={formData.previous_salary}
                    onChange={(e) => setFormData({ ...formData, previous_salary: e.target.value })}
                    className="w-full bg-surface-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">{t('hrm.employeeProfile.form.newSal')}</label>
                  <input
                    type="number"
                    placeholder={t('hrm.employeeProfile.placeholders.salaryNew')}
                    disabled={!canSalary} value={formData.new_salary}
                    onChange={(e) => setFormData({ ...formData, new_salary: e.target.value })}
                    className="w-full bg-surface-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">{t('hrm.employeeProfile.form.effDate')}</label>
                <input
                  type="date"
                  required
                  value={formData.effective_date}
                  onChange={(e) => setFormData({ ...formData, effective_date: e.target.value })}
                  className="w-full bg-surface-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  {t('hrm.employeeProfile.form.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={addMutation.isLoading}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-brand-orange hover:bg-orange-500 text-white disabled:opacity-50"
                >
                  {addMutation.isLoading ? t('hrm.employeeProfile.form.saving') : t('hrm.employeeProfile.form.saveBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
