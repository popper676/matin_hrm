import Icon from '../../components/common/Icon';
import PageLoader from '../../components/common/PageLoader';
import { useLanguage } from '../../context/LanguageContext';
import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import toast from 'react-hot-toast';


function QuickStat({ label, value, icon, color, href }) {
  const card = <div className="portal-stat-card uyf-portal-stat" data-tone={color}>
    <div className="uyf-portal-stat-top"><span className="uyf-icon-tile"><Icon name={icon} size={23}/></span>{href && <Icon name="arrow" size={16} className="uyf-stat-arrow"/>}</div>
    <p className="portal-stat-num uyf-portal-stat-value">{value}</p>
    <p className="uyf-portal-stat-label">{label}</p>
  </div>;
  return href ? <Link to={href}>{card}</Link> : card;
}

export default function Portal() {
  const { t } = useLanguage();
  const x = key => t(`common.experience.${key}`);
  const copy = key => t(`portal.visual.${key}`);
  const { user, isBoss } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);

  const isExecutive = isBoss();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['portal'],
    queryFn: () => api.get('/portal').then(r => r.data),
    refetchOnMount: 'always',
  });

  const emp = data?.emp;
  const currentYear = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date()));
  const leaveBals = (data?.leave_bals || []).filter(b => Number(b.year) === currentYear);
  const pendingLeaveCount = (data?.leave_requests || []).filter(r => r.status === 'Pending').length;
  const annList = data?.ann_list || [];
  const priorityClass = { Urgent: 'text-rose-400 bg-rose-400/10', High: 'text-orange-400 bg-orange-400/10', Medium: 'text-amber-400 bg-amber-400/10' };

  const uploadMutation = useMutation({
    mutationFn: (file) => {
      const formData = new FormData();
      formData.append('avatar', file);
      return api.post(`/employees/${emp.id}/avatar`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({queryKey:['portal']});
      qc.invalidateQueries({queryKey:['employee', emp?.id]});
      toast.success('Profile picture updated!');
      setIsUploading(false);
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || 'Failed to upload image');
      setIsUploading(false);
    }
  });

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file || !emp?.id) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }
    setIsUploading(true);
    uploadMutation.mutate(file);
  };

  return (
    <Layout
      title={isExecutive ? "Executive Portal" : "Employee Portal"}
      subtitle={isExecutive ? `Welcome back, ${user?.full_name || 'Executive'}` : `Welcome back, ${user?.full_name || 'Employee'}`}
    >
        {isLoading ? (
          <PageLoader label={copy('loading')}/>
        ) : isError ? <div className="ux-empty"><Icon name="warning"/><p>{x('loadFailed')}</p><button className="ux-button ux-button-secondary" onClick={() => refetch()}>{x('retry')}</button></div> : (
          <>
            <section className="ux-personal-header"><div className="ux-personal-identity"><button type="button" className="ux-profile-photo" onClick={() => fileInputRef.current?.click()} disabled={!emp?.id || isUploading} aria-label={x('changePhoto')}>
              {emp?.avatar_url ? <img src={emp.avatar_url} alt=""/> : <span>{(user?.full_name || 'U')[0].toUpperCase()}</span>}
              {emp?.id && <i><Icon name={isUploading ? 'pending' : 'camera'} size={13}/></i>}
            </button><input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/png,image/jpeg,image/gif,image/webp" className="hidden"/><div><span className="uyf-eyebrow">{x('yourWorkspace')}</span><h2>{user?.full_name}</h2><p>{emp ? [emp.employee_id,emp.dept_name,emp.pos_title].filter(Boolean).join(' · ') : x('noEmployee')}</p></div></div>{isExecutive && <Link className="ux-button ux-button-secondary" to="/boss">{t('common.interface.executive')}<Icon name="arrow" size={16}/></Link>}</section>
            {/* Leave handover banner — same style as offboarding */}
            {data?.show_leave_handover_banner && (
              <div className="portal-alert-banner portal-alert-danger rounded-2xl p-5 mb-6 flex items-start gap-4" style={{ background: 'linear-gradient(to right, rgba(244,63,94,0.2), rgba(249,115,22,0.1), rgba(244,63,94,0.05))', border: '1px solid rgba(244,63,94,0.3)' }}>
                <div className="portal-alert-icon w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-400 flex-shrink-0 text-lg"><Icon name="warning" size={22}/></div>
                <div className="flex-1">
                  <h3 className="portal-alert-title text-sm font-bold text-rose-200">
                    {data.leave_outgoing_handover?.handover_kind === 'return'
                      ? 'Return handover in progress'
                      : 'Leave handover in progress'}
                  </h3>
                  <p className="portal-alert-desc text-xs text-rose-300/80 mt-1 mb-3">
                    {data.leave_outgoing_handover?.handover_kind === 'return'
                      ? 'Complete your return handover checklist and acknowledge what changed during your absence.'
                      : 'Complete your handover checklist before your leave period so your acting cover can take over smoothly.'}
                    {data.leave_outgoing_handover?.leave_start && (
                      <> Leave: {data.leave_outgoing_handover.leave_start} → {data.leave_outgoing_handover.leave_end}.</>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link to="/portal/handover/outgoing" className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm">
                      Handover Checklist ({data.leave_outgoing_handover?.completion_pct || 0}%)
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Offboarding Banner — shown alongside leave handover when both apply */}
            {data?.show_offboarding_banner && (
              <div className="portal-alert-banner portal-alert-danger rounded-2xl p-5 mb-6 flex items-start gap-4" style={{ background: 'linear-gradient(to right, rgba(244,63,94,0.2), rgba(249,115,22,0.1), rgba(244,63,94,0.05))', border: '1px solid rgba(244,63,94,0.3)' }}>
                <div className="portal-alert-icon w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-400 flex-shrink-0 text-lg"><Icon name="warning" size={22}/></div>
                <div className="flex-1">
                  <h3 className="portal-alert-title text-sm font-bold text-rose-200">Offboarding in progress</h3>
                  <p className="portal-alert-desc text-xs text-rose-300/80 mt-1 mb-3">
                    {data.show_dual_track
                      ? 'You also have offboarding tasks to complete: laptop return, NDA, exit interview, and final settlement. These are separate from your leave handover above.'
                      : 'Complete your handover checklist and exit survey before your final day. Finish remaining clearance tasks with HR.'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {data.has_active_exit_handover && (
                      <Link to="/portal/handover/outgoing" className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm">
                        Exit Handover ({data.exit_outgoing_handover?.completion_pct ?? 0}%)
                      </Link>
                    )}
                    <Link to="/portal/exit-survey" className="text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg transition-colors shadow-sm">
                      Exit Survey
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Incoming leave handover banner */}
            {data?.show_incoming_leave_banner && (
              <div className="portal-alert-banner portal-alert-danger rounded-2xl p-5 mb-6 flex items-start gap-4" style={{ background: 'linear-gradient(to right, rgba(244,63,94,0.2), rgba(249,115,22,0.1), rgba(244,63,94,0.05))', border: '1px solid rgba(244,63,94,0.3)' }}>
                <div className="portal-alert-icon w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-400 flex-shrink-0 text-lg"><Icon name="warning" size={22}/></div>
                <div className="flex-1">
                  <h3 className="portal-alert-title text-sm font-bold text-rose-200">Leave handover assigned to you</h3>
                  <p className="portal-alert-desc text-xs text-rose-300/80 mt-1 mb-3">
                    You have been assigned acting coverage or a return handover. Please review and acknowledge the checklist.
                  </p>
                  <Link to="/portal/handover/incoming" className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors inline-block shadow-sm">
                    Handover Checklist
                  </Link>
                </div>
              </div>
            )}

            {/* Incoming exit handover banner */}
            {data?.show_incoming_exit_banner && (
              <div className="portal-alert-banner portal-alert-danger rounded-2xl p-5 mb-6 flex items-start gap-4" style={{ background: 'linear-gradient(to right, rgba(244,63,94,0.2), rgba(249,115,22,0.1), rgba(244,63,94,0.05))', border: '1px solid rgba(244,63,94,0.3)' }}>
                <div className="portal-alert-icon w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-400 flex-shrink-0 text-lg"><Icon name="warning" size={22}/></div>
                <div className="flex-1">
                  <h3 className="portal-alert-title text-sm font-bold text-rose-200">Incoming handover</h3>
                  <p className="portal-alert-desc text-xs text-rose-300/80 mt-1 mb-3">
                    You have been assigned as a successor for a departing colleague. Please review and acknowledge the handover.
                  </p>
                  <Link to="/portal/handover/incoming" className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors inline-block shadow-sm">
                    Handover Checklist
                  </Link>
                </div>
              </div>
            )}

            <section className="ux-personal-actions" aria-label={x('dailyActions')}>
              <Link to="/portal/checkin" className="ux-personal-action ux-personal-action-primary"><Icon name="camera" size={25}/><div><strong>{copy('photo')}</strong><span>{x('arrivalHint')}</span></div><Icon name="arrowRight" size={18}/></Link>
              <Link to="/portal/leaves" className="ux-personal-action"><Icon name="leave" size={25}/><div><strong>{x('requestLeave')}</strong><span>{x('balanceAndHistory')}</span></div><Icon name="arrowRight" size={18}/></Link>
              <Link to="/portal/qr-scanner" className="ux-personal-action"><Icon name="qr" size={25}/><div><strong>{copy('qr')}</strong><span>{x('scanHint')}</span></div><Icon name="arrowRight" size={18}/></Link>
            </section>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <QuickStat label={copy('attendance')} value={data?.att_count || 0} icon="present" color="indigo" href="/portal/attendance" />
              <QuickStat label={copy('pendingLeaves')} value={pendingLeaveCount} icon="pending" color="amber" href="/portal/leaves" />
              <QuickStat label={copy('payslips')} value={data?.payslip_count || 0} icon="payroll" color="emerald" href="/portal/payslips" />
              <QuickStat label={copy('rating')} value={data?.vote_count > 0 ? data.vote_avg : '—'} icon="rating" color="purple" />
            </div>

            <div className="portal-card rounded-2xl p-5 mb-6 flex flex-wrap items-center justify-between gap-4" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <h2 className="text-sm font-bold text-white"><span className="uyf-section-icon"><Icon name="handover" size={18}/></span> {copy('handovers')}</h2>
                <p className="text-xs text-slate-400 mt-1">Active checklists and past completed handovers (leave, return, exit)</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/portal/handover/outgoing" className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors">
                  My Handovers
                </Link>
                <Link to="/portal/handover/incoming" className="portal-btn-secondary text-xs font-bold bg-white/5 hover:bg-white/10 text-slate-200 px-4 py-2 rounded-lg transition-colors border border-white/10">
                  Incoming Handover
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Leave Balances */}
              <div className="portal-card rounded-2xl p-5" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h2 className="text-sm font-bold text-white mb-4"><span className="uyf-section-icon"><Icon name="leave" size={18}/></span> {copy('balances')} <span className="uyf-year-tag">{currentYear}</span></h2>
                {leaveBals.length > 0 ? (
                  <div className="space-y-3">
                    {leaveBals.map(bal => {
                      const entitled = Number(bal.entitled_days || 0);
                      const used = Number(bal.used_days || 0);
                      const remain = Math.max(0, entitled - used);
                      const pct = entitled > 0 ? Math.min(100, Math.max(0, Math.round(used / entitled * 100))) : 0;
                      const barColor = pct > 80 ? '#f43f5e' : pct > 50 ? '#f59e0b' : '#10b981';
                      return (
                        <div key={bal.id}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-slate-300 font-medium">{bal.type_name}</span>
                            <span className="text-xs font-bold text-white">{remain} {copy('daysLeft')}</span>
                          </div>
                          <div className="portal-progress-bg h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} role="progressbar" aria-label={bal.type_name} aria-valuemin={0} aria-valuemax={entitled || 1} aria-valuenow={Math.min(entitled || 1, Math.max(0, used))} />
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5">{used} / {entitled} {copy('daysUsed')}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="text-slate-500 text-sm text-center py-4">{x('noBalances')}</p>}
                <Link to="/portal/leaves" className="uyf-request-link">{copy('requestLeave')} <Icon name="arrowRight" size={16}/></Link>
              </div>

              {/* Announcements */}
              <div className="portal-card rounded-2xl p-5" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h2 className="text-sm font-bold text-white mb-4"><span className="uyf-section-icon"><Icon name="bell" size={18}/></span> {copy('announcements')}</h2>
                {annList.length > 0 ? (
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {annList.map(a => (
                      <div key={a.id} className="portal-announcement-card flex items-start gap-3 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        {a.is_pinned && <Icon name="bell" size={16} className="flex-shrink-0"/>}
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${priorityClass[a.priority] || 'text-slate-400 bg-white/5'}`}>{a.priority || 'Normal'}</span>
                            <span className="text-[10px] text-slate-500">{(a.created_at || '').slice(0, 10)}</span>
                          </div>
                          <p className="text-xs font-semibold text-white">{a.title}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{a.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <div className="text-center py-8 text-slate-500 text-sm">No announcements at this time.</div>}
              </div>

              <section className="portal-card rounded-2xl p-5">
                <h2 className="text-sm font-bold mb-4"><span className="uyf-section-icon"><Icon name="spark" size={18}/></span>{copy('quickAccess')}</h2>
                <div className="uyf-portal-links">
                  {[
                    ['/portal/profile', 'users', 'common.interface.myProfile', 'profileHint'],
                    ['/portal/payslips', 'payroll', 'common.interface.payslips', 'payslipHint'],
                    ['/portal/handover/outgoing', 'handover', 'common.interface.myHandovers', 'handoverHint'],
                  ].map(([href,icon,label,hint]) => <Link key={href} to={href} className="uyf-portal-link"><div className="uyf-icon-tile"><Icon name={icon} size={18}/></div><div><strong>{t(label)}</strong><span>{copy(hint)}</span></div><Icon name="arrow" size={16}/></Link>)}
                </div>
              </section>
            </div>
          </>
        )}
    </Layout>
  );
}
