import Icon from '../../components/common/Icon';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import Layout from '../../components/layout/Layout';
import MyOvertimeTab from './MyOvertimeTab';
import { useLanguage } from '../../context/LanguageContext';

export default function MyAttendance() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('records');
  const [expandedMonths, setExpandedMonths] = useState({});
  
  const { data, isLoading } = useQuery({ 
    queryKey: ['portal_data'], 
    queryFn: () => api.get('/portal').then(r => r.data) 
  });

  const records = data?.attendance_records || [];

  const groupedRecords = records.reduce((acc, r) => {
    const checkInDate = (r.check_in ? new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date(r.check_in)) : '');
    if (!checkInDate) return acc;
    // Extract YYYY-MM
    const monthYear = checkInDate.substring(0, 7); 
    if (!acc[monthYear]) acc[monthYear] = [];
    acc[monthYear].push(r);
    return acc;
  }, {});
  
  // Sort months descending
  const sortedMonths = Object.keys(groupedRecords).sort((a, b) => b.localeCompare(a));

  const toggleMonth = (m) => setExpandedMonths(prev => ({...prev, [m]: !prev[m]}));

  const formatTime = (isoString) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      
      let hrs = d.getHours();
      const ampm = hrs >= 12 ? 'PM' : 'AM';
      hrs = hrs % 12 || 12;
      const mins = String(d.getMinutes()).padStart(2, '0');
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()} ${hrs}:${mins} ${ampm}`;
    } catch {
      return isoString;
    }
  };

  const methodBadge = (m) => {
    const cfg = { QR: 'text-cyan-400 bg-cyan-400/10', Biometric: 'text-orange-400 bg-orange-400/10', Photo: 'text-pink-400 bg-pink-400/10' };
    const label = m ? (t(`hrm.attendance.methods.${m.toLowerCase()}`) || m) : t('hrm.attendance.methods.manual');
    return cfg[m] ? <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg[m]}`}>🪄 {label}</span>
      : <span className="text-xs font-medium px-2 py-0.5 rounded-full text-slate-400 bg-slate-400/10"><Icon name="documents" size={17}/> {label}</span>;
  };

  const formatMonthTitle = (yyyy_mm) => {
    const [y, m] = yyyy_mm.split('-');
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${months[parseInt(m) - 1]} ${y}`;
  };

  return (
    <Layout title={t('portal.attendance.title')} subtitle={t('portal.attendance.subtitle')}>
      
      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-white/5 pb-2">
        <button 
          onClick={() => setActiveTab('records')}
          className={`px-4 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'records' ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-400 hover:text-white'}`}
        >
          <Icon name="leave" size={17}/> {t('portal.attendance.tabs.records')}
        </button>
        <button 
          onClick={() => setActiveTab('overtime')}
          className={`px-4 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'overtime' ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-400 hover:text-white'}`}
        >
          <Icon name="present" size={17}/> {t('portal.attendance.tabs.overtime')}
        </button>
      </div>

      {activeTab === 'records' && (
        <div className="rounded-2xl overflow-hidden mb-6 shadow-sm" style={{ background: 'var(--bg-850, #161929)', border: '1px solid var(--lm-hr-overlay-border, rgba(255,255,255,0.05))' }}>
          <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--lm-hr-overlay-border, rgba(255,255,255,0.05))' }}>
          <h3 className="text-sm font-bold text-white">{t('portal.attendance.recordsTitle')}</h3>
          <p className="text-xs text-slate-400">{records.length} {t('portal.attendance.recordsTotal')}</p>
        </div>
        
        {isLoading ? (
          <div className="py-12 flex justify-center"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : records.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">{t('portal.attendance.noRecords')}</div>
        ) : (
          <div className="flex flex-col">
            {sortedMonths.map(month => {
              const monthRecords = groupedRecords[month];
              const isExpanded = expandedMonths[month] !== false; // Default expanded to true
              
              return (
                <div key={month} className="border-b border-white/5 last:border-0" style={{ borderColor: 'var(--lm-hr-overlay-border, rgba(255,255,255,0.05))' }}>
                  <div 
                    className="flex justify-between items-center p-4 bg-surface-850 portal-accordion-header cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => toggleMonth(month)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-indigo-400 font-bold"><Icon name="leave" size={17}/> {formatMonthTitle(month)}</span>
                      <span className="text-xs px-2 py-0.5 rounded-lg bg-white/5 text-slate-400">{monthRecords.length} {t('portal.attendance.days')}</span>
                    </div>
                    <span className="text-slate-400 text-xs transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(180deg)' : '' }}>▼</span>
                  </div>
                  
                  {isExpanded && (
                    <div className="overflow-x-auto bg-surface-850">
                      <table className="w-full text-sm">
                        <thead style={{ background: 'var(--bg-900, rgba(0,0,0,0.2))' }}>
                          <tr>
                            {[t('hrm.attendance.columns.date'), t('hrm.attendance.columns.checkIn'), t('hrm.attendance.columns.checkOut'), t('hrm.attendance.columns.hours'), t('hrm.attendance.columns.method'), t('hrm.attendance.columns.status')].map((h, i) => (
                              <th key={i} className="text-left py-2 px-5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {monthRecords.map(r => {
                            const d = r.check_in ? new Date(r.check_in) : null;
                            const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
                            const dateOnly = d ? `${dayNames[d.getDay()]}, ${(r.check_in ? new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date(r.check_in)) : '')}` : null;
                            return (
                              <tr key={r.id} className="border-t border-white/5 hover:bg-white/2 transition-colors">
                                <td className="py-3 px-5 text-slate-300 font-medium">{dateOnly || '—'}</td>
                                <td className="py-3 px-5 text-emerald-400 font-mono text-xs">{r.check_in ? formatTime(r.check_in) : '—'}{r.check_in_photo_url && <a className="block text-xs underline" href={r.check_in_photo_url} target="_blank" rel="noreferrer" aria-label="View attendance photo">Photo ↗</a>}</td>
                                <td className="py-3 px-5 text-rose-400 font-mono text-xs">{r.check_out ? formatTime(r.check_out) : '—'}{r.check_out_photo_url && <a className="block text-xs underline" href={r.check_out_photo_url} target="_blank" rel="noreferrer" aria-label="View attendance photo">Photo ↗</a>}</td>
                                <td className="py-3 px-5 text-white font-mono text-xs">{r.work_hours_calc != null ? `${r.work_hours_calc}h` : '—'}</td>
                                <td className="py-3 px-5">{methodBadge(r.attendance_method)}</td>
                                <td className="py-3 px-5">
                                  {r.is_early_leave
                                    ? <span className="text-xs font-semibold text-rose-400">{t('hrm.attendance.status.earlyLeave')}</span>
                                    : r.is_late
                                    ? <span className="text-xs font-semibold text-amber-400">{t('hrm.attendance.status.late')}</span>
                                    : <span className="text-xs text-emerald-400">{t('hrm.attendance.status.onTime')}</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        </div>
      )}

      {activeTab === 'overtime' && (
        <div className="rounded-2xl overflow-hidden mb-6" style={{ background: 'var(--bg-850, #161929)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <MyOvertimeTab />
        </div>
      )}
    </Layout>
  );
}
