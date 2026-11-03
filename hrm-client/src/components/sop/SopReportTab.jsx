import Icon from '../common/Icon';
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const EMPTY_ROWS = [];

export default function SopReportTab({ positions }) {
  const { t, language } = useLanguage();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [positionId, setPositionId] = useState('');
  const [missedModal, setMissedModal] = useState(null); // { empName, dateStr, tasks[] }

  const { data, isLoading } = useQuery({
    queryKey: ['sops-report', month, positionId],
    queryFn: () => api.get(`/sops/report?month=${month}${positionId ? `&position_id=${positionId}` : ''}`).then(r => r.data)
  });

  const employees = data?.employees || EMPTY_ROWS;
  const sops = data?.sops || EMPTY_ROWS;

  // Calculate days in the selected month
  const [yearStr, monthStr] = month.split('-');
  const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const dayNames = useMemo(() => Array.from({length: 7}, (_, i) => new Intl.DateTimeFormat(language === 'my' ? 'my-MM' : 'en-US', { weekday: 'short' }).format(new Date(2023, 0, i + 1))), [language]);

  // Group SOPs by employee_id -> dateKey -> array of sop records
  const sopsByEmp = useMemo(() => {
    const map = {};
    sops.forEach(s => {
      if (!map[s.employee_id]) map[s.employee_id] = {};
      const d = new Date(s.created_at);
      const dateKey = s.assigned_date ? String(s.assigned_date).slice(0,10) : new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(d);
      if (!map[s.employee_id][dateKey]) map[s.employee_id][dateKey] = [];
      map[s.employee_id][dateKey].push(s);
    });
    return map;
  }, [sops]);

  // Filter employees to exclude Boss/CEO from the grid/summary
  const activeEmployees = useMemo(() => {
    return employees.filter(emp => {
      const pos = positions.find(p => p.id === emp.position_id);
      const isBoss = pos && pos.title.toLowerCase().includes('boss');
      return !isBoss;
    });
  }, [employees, positions]);

  // Build monthly summary per employee
  const monthlySummary = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return activeEmployees.map(emp => {
      const empSops = sopsByEmp[emp.id] || {};
      const missedDays = [];
      let completedCount = 0;
      let totalCount = 0;

      Object.entries(empSops).forEach(([dateKey, records]) => {
        const missed = records.filter(r => !r.is_completed);
        const completed = records.filter(r => r.is_completed);
        totalCount += records.length;
        completedCount += completed.length;
        
        // Only count as missed if the date is today or in the past
        if (missed.length > 0 && dateKey <= todayStr) {
          const d = new Date(dateKey + 'T12:00:00');
          missedDays.push({
            dateKey,
            dayName: dayNames[d.getDay()],
            day: d.getDate(),
            tasks: missed.map(r => r.task_description).filter(Boolean)
          });
        }
      });

      return {
        emp,
        totalCount,
        completedCount,
        missedCount: missedDays.length,
        missedDays: missedDays.sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      };
    });
  }, [activeEmployees, sopsByEmp, dayNames]);

  const monthLabel = (() => {
    const d = new Date(parseInt(yearStr), parseInt(monthStr) - 1);
    const m = new Intl.DateTimeFormat(language === 'my' ? 'my-MM' : 'en-US', { month: 'long' }).format(d);
    return `${m} ${yearStr}`;
  })();

  return (
    <div className="space-y-8">
      {/* Filters */}
      <div className="sop-filter-box flex flex-wrap gap-4 items-end bg-surface-800 p-4 rounded-xl border border-slate-700">
        <div>
          <label className="sop-label block text-xs font-semibold text-slate-400 mb-1">{t('hrm.sops.selectMonth')}</label>
          <DatePicker
            selected={month ? new Date(month + '-01T00:00:00') : null}
            onChange={date => {
              if (date) setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
            }}
            dateFormat="yyyy-MM"
            showMonthYearPicker
            className="sop-input bg-surface-850 border border-slate-700 text-white text-sm rounded-lg p-2 focus:border-indigo-500 w-full"
          />
        </div>
        <div>
          <label className="sop-label block text-xs font-semibold text-slate-400 mb-1">{t('hrm.sops.filterPosition')}</label>
          <select
            value={positionId}
            onChange={e => setPositionId(e.target.value)}
            className="sop-input bg-surface-850 border border-slate-700 text-white text-sm rounded-lg p-2 focus:border-indigo-500 w-48"
          >
            <option value="">{t('hrm.sops.allPositions')}</option>
            {positions.map(p => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="sop-empty-state p-10 text-center text-slate-400">{t('hrm.sops.loadingReport')}</div>
      ) : employees.length === 0 ? (
        <div className="sop-empty-state p-10 text-center text-slate-400">{t('hrm.sops.noEmployees')}</div>
      ) : (
        <>
          {/* ── Daily Grid ── */}
          <div className="sop-grid-section">
            <h3 className="sop-section-title text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
              <span className="text-indigo-400"><Icon name="leave" size={17}/></span> {t('hrm.sops.gridTitle')}
              <span className="sop-section-subtitle text-xs text-slate-500 font-normal">{t('hrm.sops.gridSubtitle')}</span>
            </h3>
            <div className="sop-table-wrapper bg-surface-800 rounded-xl overflow-hidden border border-slate-700 overflow-x-auto">
              <table className="sop-table w-full text-left text-sm text-slate-300 min-w-max">
                <thead className="bg-surface-900 text-slate-400">
                  <tr>
                    <th className="sop-th-sticky p-3 font-medium sticky left-0 bg-surface-900 z-10 border-r border-slate-700 min-w-[130px]">{t('hrm.sops.employee')}</th>
                    <th className="sop-th-missed p-3 font-medium text-center text-rose-400 border-r border-slate-700 bg-rose-500/5 min-w-[90px]">{t('hrm.sops.missed')}</th>
                    {daysArray.map(d => {
                      const dateObj = new Date(`${month}-${String(d).padStart(2, '0')}T12:00:00`);
                      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                      return (
                        <th key={d} className={`sop-th-day p-1 font-medium text-center w-10 border-r border-slate-700/50 ${isWeekend ? 'sop-th-weekend text-indigo-300 bg-indigo-500/5' : ''}`}>
                          <div className="text-[10px] text-slate-500">{dayNames[dateObj.getDay()]}</div>
                          <div>{d}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {activeEmployees.length === 0 ? (
                    <tr><td colSpan={daysArray.length + 2} className="sop-empty-state p-8 text-center text-slate-500">{t('hrm.sops.noGridRecords')}</td></tr>
                  ) : activeEmployees.map(emp => {
                    let missedCount = 0;
                    const todayStr = new Date().toISOString().slice(0, 10);
                    const rowCells = daysArray.map(d => {
                      const dateStr = `${month}-${String(d).padStart(2, '0')}`;
                      const dayRecords = sopsByEmp[emp.id]?.[dateStr];

                      if (!dayRecords) {
                        return <td key={d} className="sop-td-empty p-1 text-center text-slate-600 border-r border-slate-700/50">-</td>;
                      }

                      const allCompleted = dayRecords.every(r => r.is_completed);
                      const anyVideo = dayRecords.find(r => r.proof_video_url);

                      if (allCompleted) {
                        return (
                          <td key={d} className="sop-td-completed p-1 text-center border-r border-slate-700/50 bg-emerald-500/5">
                            {anyVideo ? (
                              <a href={anyVideo.proof_video_url} target="_blank" rel="noreferrer" title={t('hrm.sops.watchVideo')}
                                className="text-emerald-400 hover:text-emerald-300 text-lg cursor-pointer"><Icon name="active" size={17}/></a>
                            ) : (
                              <span className="text-emerald-400 text-lg" title={t('hrm.sops.completedAttr')}><Icon name="active" size={17}/></span>
                            )}
                          </td>
                        );
                      } else {
                        // Check if it's a future date
                        if (dateStr > todayStr) {
                          return (
                            <td key={d} className="sop-td-pending p-1 text-center border-r border-slate-700/50 bg-white/5">
                              <span className="text-slate-500 text-xs" title={t('hrm.sops.pendingAttr')}><Icon name="pending" size={17}/></span>
                            </td>
                          );
                        }
                        
                        missedCount++;
                        const missedTasks = dayRecords.filter(r => !r.is_completed).map(r => r.task_description).filter(Boolean);
                        const dateObj = new Date(dateStr + 'T12:00:00');
                        return (
                          <td key={d} className="sop-td-missed p-1 text-center border-r border-slate-700/50 bg-rose-500/5">
                            <button
                              onClick={() => setMissedModal({
                                empName: emp.Full_name,
                                dateStr,
                                dayName: dayNames[dateObj.getDay()],
                                tasks: missedTasks
                              })}
                              title={t('hrm.sops.clickMissedTasks')}
                              className="sop-btn-missed text-rose-400 text-lg hover:text-rose-200 hover:scale-125 transition-all duration-150 cursor-pointer"
                            ><Icon name="close" size={17}/></button>
                          </td>
                        );
                      }
                    });

                    return (
                      <tr key={emp.id} className="sop-tr hover:bg-white/5 transition-colors">
                        <td className="sop-td-sticky p-3 font-medium sticky left-0 bg-surface-800 z-10 border-r border-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]">
                          {emp.Full_name}
                        </td>
                        <td className="sop-td-missed-count p-3 text-center font-bold text-rose-400 border-r border-slate-700 bg-rose-500/5">
                          {missedCount > 0 ? (
                            <span className="sop-badge-missed bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full text-xs">{missedCount} {t('hrm.sops.days')}</span>
                          ) : (
                            <span className="sop-badge-perfect text-emerald-400 text-xs">{t('hrm.sops.perfect')}</span>
                          )}
                        </td>
                        {rowCells}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Auto Monthly Summary ── */}
          <div className="sop-summary-section">
            <h3 className="sop-section-title text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
              <span className="text-amber-400"><Icon name="documents" size={17}/></span> {t('hrm.sops.monthlySummary')}{monthLabel}
            </h3>
            <div className="space-y-4">
              {monthlySummary.map(({ emp, totalCount, completedCount, missedCount, missedDays }) => {
                const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
                const barColor = totalCount === 0 ? 'bg-slate-600' : pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500';

                return (
                  <div key={emp.id} className={`sop-summary-card bg-surface-800 rounded-xl border ${totalCount === 0 ? 'border-slate-700/50 opacity-70' : 'border-slate-700'} overflow-hidden`}>
                    {/* Header */}
                    <div className="sop-summary-header flex items-center justify-between p-4 border-b border-slate-700/50">
                      <div className="flex items-center gap-3">
                        <div className="sop-summary-icon w-9 h-9 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-sm">
                          {emp.Full_name.charAt(0)}
                        </div>
                        <div>
                          <p className="sop-summary-name text-white font-semibold text-sm">{emp.Full_name}</p>
                          <p className="sop-summary-meta text-xs text-slate-400">{t('hrm.sops.completedAssigned', { completed: completedCount, total: totalCount })}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {missedCount > 0 && (
                          <span className="sop-summary-warning text-xs font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1 rounded-full">
                            {t('hrm.sops.daysMissed', { count: missedCount })}
                          </span>
                        )}
                        <div className="text-right">
                          <p className={`sop-summary-pct text-lg font-bold ${totalCount === 0 ? 'text-slate-500' : pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>{pct}%</p>
                        </div>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="sop-summary-bar-bg px-4 py-2 bg-surface-850/50">
                      <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    {/* Missed days detail */}
                    {missedDays.length > 0 ? (
                      <div className="p-4 space-y-2">
                        <p className="text-xs font-semibold text-rose-400 mb-3">{t('hrm.sops.missedTaskDetails')}</p>
                        {missedDays.map(({ dateKey, dayName, day, tasks }) => (
                          <div key={dateKey} className="sop-summary-missed-box flex gap-3 items-start bg-rose-500/5 border border-rose-500/10 rounded-lg p-3">
                            <div className="text-center min-w-[48px]">
                              <p className="text-[10px] text-slate-500">{dayName}</p>
                              <p className="text-rose-400 font-bold text-lg leading-none">{day}</p>
                            </div>
                            <div className="flex-1">
                              {tasks.length > 0 ? (
                                <ul className="space-y-1">
                                  {tasks.map((taskItem, i) => (
                                    <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                                      <span className="text-rose-400 mt-0.5">✗</span>
                                      <span className="whitespace-pre-line">{taskItem}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-xs text-slate-500 italic">{t('hrm.sops.noTaskDetails')}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : totalCount > 0 ? (
                      <div className="p-4 text-center text-emerald-400 text-sm font-bold">
                        {t('hrm.sops.allCompletedForMonth', { month: monthLabel })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {monthlySummary.length === 0 && (
                 <div className="sop-empty-state p-10 text-center text-slate-500 border border-dashed border-slate-700 rounded-xl bg-surface-800">
                   {t('hrm.sops.noEmployeesReport')}
                 </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Missed Task Detail Modal ── */}
      {missedModal && (
        <div className="sop-modal-overlay fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setMissedModal(null)}>
          <div className="sop-modal-content bg-surface-800 w-full max-w-md rounded-2xl shadow-2xl border border-rose-500/30 overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="sop-modal-header p-5 border-b border-slate-700 bg-rose-500/5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="sop-modal-title text-white font-bold text-base">{t('hrm.sops.missedTasksModalTitle')}</h3>
                  <p className="sop-modal-subtitle text-xs text-slate-400 mt-0.5">
                    {missedModal.empName} — {missedModal.dayName}, {missedModal.dateStr}
                  </p>
                </div>
                <button aria-label="close" onClick={() => setMissedModal(null)} className="sop-modal-close text-slate-400 hover:text-white transition-colors text-xl"><Icon name="close" size={17}/></button>
              </div>
            </div>
            {/* Modal body */}
            <div className="p-5 space-y-3">
              {missedModal.tasks.length > 0 ? (
                missedModal.tasks.map((task, i) => (
                  <div key={i} className="sop-missed-task flex items-start gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                    <span className="text-rose-400 font-bold text-base">✗</span>
                    <p className="text-sm text-slate-200 whitespace-pre-line">{task}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400 text-center py-4">{t('hrm.sops.noTaskDescThisDay')}</p>
              )}
            </div>
            <div className="sop-modal-footer p-4 border-t border-slate-700">
              <button onClick={() => setMissedModal(null)} className="sop-btn-cancel w-full bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-2.5 text-sm font-medium transition-colors">
                {t('common.actions.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
