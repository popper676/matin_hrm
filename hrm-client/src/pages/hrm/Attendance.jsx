import { useSearchParams } from 'react-router-dom';
import Icon from '../../components/common/Icon';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import ConfirmDeleteModal from '../../components/common/ConfirmDeleteModal';
import RostersTab from '../../components/attendance/RostersTab';
import ShiftApprovalsTab from '../../components/attendance/ShiftApprovalsTab';
import WeeklyRosterPlanner from '../../components/attendance/WeeklyRosterPlanner';
import OvertimeTab from './OvertimeTab';
import { useLanguage } from '../../context/LanguageContext';
import { toBkkDate, getBkkToday, formatBkkDateTime } from '../../utils/dateUtils';

function StatCard({ label, value, color }) {
  const icons = { indigo: 'documents', emerald: 'active', amber: 'pending', cyan: 'present' };
  return <div className="uyf-portal-stat att-stat-card" data-tone={color}>
    <span className="uyf-icon-tile"><Icon name={icons[color]} size={21}/></span>
    <p className="uyf-portal-stat-value">{value}</p>
    <p className="uyf-portal-stat-label">{label}</p>
  </div>;
}

const validTabs = ['manual','records','photo','qr','biometric','rosters','planner','approvals','overtime'];

export default function Attendance() {
  const { t } = useLanguage();
  const [params, setParams] = useSearchParams();
  const [activeTabState, setActiveTabState] = useState(() => validTabs.includes(localStorage.getItem('attendanceTab')) ? localStorage.getItem('attendanceTab') : 'manual');
  useEffect(() => { const tab = params.get('tab'); if (validTabs.includes(tab)) { setActiveTabState(tab); localStorage.setItem('attendanceTab', tab); const next = new URLSearchParams(params); next.delete('tab'); setParams(next, { replace: true }); } }, [params, setParams]);
  const activeTab = activeTabState;
  const setActiveTab = (tab) => { setActiveTabState(tab); localStorage.setItem('attendanceTab', tab); };
  const [filter, setFilter] = useState({ name: '', date: '', status: 'all' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteMappingTarget, setDeleteMappingTarget] = useState(null);
  const [editMappingTarget, setEditMappingTarget] = useState(null);
  const [generatedQrToken, setGeneratedQrToken] = useState(null);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [selectedPhotoEmpId, setSelectedPhotoEmpId] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', filter.date],
    queryFn: () => api.get('/attendance', { params: filter.date ? { date: filter.date } : {} }).then(r => r.data)
  });

  const addMappingMutation = useMutation({
    mutationFn: (body) => api.post('/attendance/biometric/mapping', body),
    onSuccess: () => { qc.invalidateQueries({queryKey:['attendance']}); toast.success(t('hrm.attendance.toast.mapSaved') || 'Mapping saved'); },
  });

  const editMappingMutation = useMutation({
    mutationFn: ({ id, body }) => api.put(`/attendance/biometric/mapping/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({queryKey:['attendance']}); setEditMappingTarget(null); toast.success(t('hrm.attendance.toast.mapUpdated') || 'Mapping updated'); },
  });

  const deleteMappingMutation = useMutation({
    mutationFn: (id) => api.delete(`/attendance/biometric/mapping/${id}`),
    onSuccess: () => { qc.invalidateQueries({queryKey:['attendance']}); setDeleteMappingTarget(null); toast.success(t('hrm.attendance.toast.mapDeleted') || 'Mapping deleted'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/attendance/${id}`),
    onSuccess: () => { qc.invalidateQueries({queryKey:['attendance']}); setDeleteTarget(null); },
  });

  const addMutation = useMutation({
    mutationFn: (body) => api.post('/attendance', body),
    onSuccess: () => qc.invalidateQueries({queryKey:['attendance']}),
  });

  const checkoutMutation = useMutation({
    mutationFn: (id) => api.post(`/attendance/${id}/checkout`),
    onSuccess: () => qc.invalidateQueries({queryKey:['attendance']}),
  });


  const records = (data?.records || []).filter(r => {
    const nameMatch = !filter.name || (r.Full_name || '').toLowerCase().includes(filter.name.toLowerCase());
    // BUG FIX: Convert check_in to Bangkok local date before comparing.
    // Without this, UTC-stored records (Photo/QR) for early AM check-ins
    // (e.g. 5:56 AM BKK = previous day UTC) would be excluded from Today filter.
    const dateMatch = !filter.date || toBkkDate(r.check_in) === filter.date;
    const statusMatch = filter.status === 'all' || (filter.status === 'late' ? r.is_late : !r.is_late);
    return nameMatch && dateMatch && statusMatch;
  });

  const stats = data?.stats || {};
  const employees = data?.employees || [];
  const tokens = data?.active_tokens || [];

  const TABS = [
    { id: 'manual', icon: 'documents', label: t('hrm.attendance.tabs.manual') || 'Manual Entry' },
    { id: 'records', icon: 'documents', label: t('hrm.attendance.tabs.records') || 'Records' },
    { id: 'photo', icon: 'camera', label: t('hrm.attendance.tabs.photo') || 'Photo Check-In' },
    { id: 'qr', icon: 'qr', label: t('hrm.attendance.tabs.qr') || 'QR Code' },
    { id: 'biometric', icon: 'users', label: t('hrm.attendance.tabs.biometric') || 'Biometric' },
    { id: 'rosters', icon: 'leave', label: t('hrm.attendance.tabs.rosters') || 'Rosters & Shifts' },
    { id: 'planner', icon: 'leave', label: t('hrm.attendance.tabs.planner') || 'Weekly Planner' },
    { id: 'approvals', icon: 'active', label: t('hrm.attendance.tabs.approvals') || 'Shift Approvals' },
    { id: 'overtime', icon: 'present', label: t('hrm.attendance.tabs.overtime') || 'Overtime Requests' },
  ];

  const handleManualSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    addMutation.mutate(Object.fromEntries(fd));
    e.target.reset();
  };

  const qrMutation = useMutation({
    mutationFn: (body) => api.post('/attendance/generate-qr', body),
    onSuccess: (res) => {
      toast.success(res.data?.message || t('hrm.attendance.toast.qrSuccess') || 'QR Code Generated Successfully!');
      setGeneratedQrToken(res.data.token);
      qc.invalidateQueries({queryKey:['attendance']});
    },
    onError: () => toast.error(t('hrm.attendance.toast.qrError') || 'Failed to generate QR Code')
  });

  const photoMutation = useMutation({
    mutationFn: (body) => api.post('/attendance/photo-checkin', body),
    onSuccess: (res) => {
      toast.success(res.data?.message || t('hrm.attendance.toast.photoSuccess') || 'Photo Attendance Recorded!');
      qc.invalidateQueries({queryKey:['attendance']});
      setCapturedPhoto(null);
    },
    onError: () => toast.error(t('hrm.attendance.toast.photoError') || 'Failed to record photo attendance')
  });

  const addDeviceMutation = useMutation({
    mutationFn: (body) => api.post('/attendance/biometric/device', body),
    onSuccess: () => {
      toast.success(t('hrm.attendance.toast.devSuccess') || 'Device registered successfully');
      qc.invalidateQueries({queryKey:['attendance']});
    },
    onError: () => toast.error(t('hrm.attendance.toast.devError') || 'Failed to register device')
  });

  const deleteDeviceMutation = useMutation({
    mutationFn: (id) => api.delete(`/attendance/biometric/device/${id}`),
    onSuccess: () => {
      toast.success(t('hrm.attendance.toast.devDelSuccess') || 'Device deleted');
      qc.invalidateQueries({queryKey:['attendance']});
    },
    onError: () => toast.error(t('hrm.attendance.toast.devDelError') || 'Failed to delete device')
  });


  const methodBadge = (m) => {
    if (m === 'QR')        return <span className="att-method-badge att-method-qr text-xs font-semibold px-2 py-0.5 rounded-full text-cyan-400 bg-cyan-400/10"><Icon name="qr" size={17}/> {t('hrm.attendance.methods.qr')}</span>;
    if (m === 'Biometric') return <span className="att-method-badge att-method-bio text-xs font-semibold px-2 py-0.5 rounded-full text-purple-400 bg-purple-400/10"><Icon name="users" size={17}/> {t('hrm.attendance.methods.bio')}</span>;
    if (m === 'Photo')     return <span className="att-method-badge att-method-photo text-xs font-semibold px-2 py-0.5 rounded-full text-pink-400 bg-pink-400/10"><Icon name="camera" size={17}/> {t('hrm.attendance.methods.photo')}</span>;
    return <span className="att-method-badge att-method-manual text-xs font-semibold px-2 py-0.5 rounded-full text-slate-400 bg-slate-400/10"><Icon name="documents" size={17}/> {t('hrm.attendance.methods.manual')}</span>;
  };

  const formatTimeByMethod = (isoString, method) => {
    if (!isoString) return '—';
    try {
      let s = isoString.replace(' ', 'T');
      if (s.split(':').length === 2) s += ':00';

      // Photo and QR save the true UTC instant: always display in the business timezone (Asia/Bangkok).
      // Bio and Manual save Bangkok wall-clock time (offset is meaningless there).
      if (['Photo', 'QR'].includes(method)) {
        if (!/(Z|[+-]\d{2}(:?\d{2})?)$/.test(s)) s += 'Z';
        const inst = new Date(s);
        return isNaN(inst.getTime()) ? isoString : formatBkkDateTime(inst);
      } else {
        // Strip any accidental UTC indicators so it parses as Local Time
        s = s.replace(/Z$/, '').replace(/\+00(:00)?$/, '');
      }

      const d = new Date(s);
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

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCameraActive(true);
      setCapturedPhoto(null);
    } catch {
      toast.error(t('hrm.attendance.toast.camError') || 'Failed to access camera');
    }
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);
      setCapturedPhoto(canvasRef.current.toDataURL('image/jpeg'));
      stopCamera();
    }
  };

  const handlePhotoSubmit = (e) => {
    e.preventDefault();
    if (!capturedPhoto) return toast.error(t('hrm.attendance.toast.noPhoto') || 'Please capture a photo first');
    const fd = new FormData(e.target);
    photoMutation.mutate({
      employee_id: fd.get('employee_id'),
      photo_base64: capturedPhoto
    });
    e.target.reset();
  };

  const handleQrGenerate = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    qrMutation.mutate(Object.fromEntries(fd));
  };

  return (
    <Layout title={t('hrm.attendance.title')} subtitle={t('hrm.attendance.subtitle')}>
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label={t('hrm.attendance.stats.totalRecords')} value={stats.total || 0} color="indigo" />
        <StatCard label={t('hrm.attendance.stats.presentToday')} value={stats.present || 0} color="emerald" />
        <StatCard label={t('hrm.attendance.stats.lateArrivals')} value={stats.late || 0} color="amber" />
        <StatCard label={t('hrm.attendance.stats.stillInOffice')} value={stats.in_office || 0} color="cyan" />
      </div>

      {/* Tabs */}
      <div className="att-tab-container rounded-2xl overflow-hidden mb-6" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="att-tab-bar flex items-center overflow-x-auto" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`att-tab-btn flex items-center gap-2 px-5 py-4 text-sm font-semibold whitespace-nowrap border-b-2 transition-all duration-200 ${activeTab === t.id ? 'att-tab-btn-active border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-white'}`}>
              <Icon name={t.icon} size={16}/> {t.label}
            </button>
          ))}
        </div>

        {/* Manual Entry Tab */}
        {activeTab === 'manual' && (
          <div className="att-manual-form p-6">
            <form onSubmit={handleManualSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="form-label att-form-label">{t('hrm.attendance.form.employee')}</label>
                <select name="employee_id" required className="form-input att-form-input">
                  <option value="">{t('hrm.attendance.form.selectEmployee')}</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.Full_name} ({e.employee_id})</option>)}
                </select>
              </div>
              <div><label className="form-label att-form-label">{t('hrm.attendance.form.checkInTime')}</label><input type="datetime-local" name="check_in" className="form-input att-form-input" /></div>
              <div><label className="form-label att-form-label">{t('hrm.attendance.form.checkOutTime')}</label><input type="datetime-local" name="check_out" className="form-input att-form-input" /></div>
              <div><label className="form-label att-form-label">{t('hrm.attendance.form.overtimeHours')}</label><input type="number" step="0.5" min="0" name="overtime_hours" className="form-input att-form-input" placeholder={t('hrm.attendance.form.placeholders.overtime')} /></div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" name="is_late" value="true" className="att-late-checkbox accent-amber-500" />
                <span className="att-late-label text-xs text-slate-400">{t('hrm.attendance.form.markLate')}</span>
              </div>
              <input type="hidden" name="attendance_method" value="Manual" />
              <div className="md:col-span-2">
                <button type="submit" className="att-manual-submit w-full text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors" style={{ background: '#C8192E' }}>
                  <Icon name="documents" size={17}/> {t('hrm.attendance.form.recordBtn')}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Photo Check-In Tab */}
        {activeTab === 'photo' && (
          <div className="att-photo-wrapper p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Camera Area */}
              <div className="flex flex-col gap-4">
                <div className="att-photo-camera-area relative bg-black rounded-2xl overflow-hidden aspect-video flex items-center justify-center border border-white/10">
                  <video ref={videoRef} className={`w-full h-full object-cover ${isCameraActive && !capturedPhoto ? 'block' : 'hidden'}`} autoPlay playsInline muted />
                  <canvas ref={canvasRef} className="hidden" />

                  {capturedPhoto && (
                    <img src={capturedPhoto} alt="Captured" className="w-full h-full object-cover" />
                  )}

                  {!isCameraActive && !capturedPhoto && (
                    <div className="text-center">
                      <div className="text-5xl mb-3"><Icon name="camera" size={17}/></div>
                      <p className="att-photo-camera-empty-text text-slate-400 text-sm">{t('hrm.attendance.photo.previewEmpty')}</p>
                    </div>
                  )}

                  {isCameraActive && !capturedPhoto && (
                    <div className="att-photo-live-badge absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 rounded-full px-3 py-1">
                      <div className="att-photo-live-dot w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                      <span className="att-photo-live-text text-xs text-white font-bold">{t('hrm.attendance.photo.live')}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button type="button" onClick={isCameraActive ? stopCamera : startCamera} className="att-photo-btn-start flex-1 bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
                    {isCameraActive ? t('hrm.attendance.photo.stop') : t('hrm.attendance.photo.start')}
                  </button>
                  <button type="button" onClick={capturePhoto} disabled={!isCameraActive} className="att-photo-btn-capture flex-1 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
                    {t('hrm.attendance.photo.capture')}
                  </button>
                </div>
              </div>

              {/* Form Area */}
              <form onSubmit={handlePhotoSubmit} className="att-photo-form flex flex-col gap-4">
                <div>
                  <label className="form-label att-form-label">{t('hrm.attendance.form.employee')}</label>
                  <select name="employee_id" value={selectedPhotoEmpId} onChange={(e) => setSelectedPhotoEmpId(e.target.value)} required className="form-input att-form-input">
                    <option value="">{t('hrm.attendance.form.selectEmployee')}</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.Full_name} ({e.employee_id})</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label att-form-label">{t('hrm.attendance.form.notes')}</label>
                  <input type="text" name="notes" className="form-input att-form-input" placeholder={t('hrm.attendance.form.placeholders.notes')} />
                </div>

                <div className="mt-auto">
                  {!capturedPhoto ? (
                    <div className="att-photo-warning text-center py-2.5 px-4 rounded-xl text-amber-500 bg-amber-500/10 text-sm font-medium border border-amber-500/20">
                      <Icon name="camera" size={17}/> {t('hrm.attendance.photo.warning')}
                    </div>
                  ) : (
                    <button type="submit" disabled={photoMutation.isPending} className="att-photo-submit w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                      {photoMutation.isPending ? t('hrm.attendance.photo.submitting') : (() => {
                        const today = getBkkToday();
                        const isOpen = records.find(r => r.employee_id === selectedPhotoEmpId && toBkkDate(r.check_in) === today && !r.check_out);
                        return isOpen ? `📸 ${t('hrm.attendance.photo.submitCheckout')}` : `📸 ${t('hrm.attendance.photo.submitCheckin')}`;
                      })()}
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Records Tab */}
        {activeTab === 'records' && (
          <div className="att-records-wrapper p-4">
            {/* Filter Bar */}
            <div className="att-records-filterbar flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <input value={filter.name} onChange={e => setFilter(f => ({ ...f, name: e.target.value }))} placeholder={t('hrm.attendance.records.search')} className="att-records-filter-input form-input w-40" />
                <input type="date" value={filter.date} onChange={e => setFilter(f => ({ ...f, date: e.target.value }))} className="att-records-filter-input form-input w-40" />
                <button type="button" onClick={() => setFilter(f => ({ ...f, date: getBkkToday() }))} className={`att-date-btn px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${filter.date === getBkkToday() ? 'att-date-btn-active bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-surface-900 text-slate-400 border-white/5 hover:text-white'}`}>{t('hrm.attendance.records.today')}</button>
                <button type="button" onClick={() => setFilter(f => ({ ...f, date: '' }))} className={`att-date-btn px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${!filter.date ? 'att-date-btn-active bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-surface-900 text-slate-400 border-white/5 hover:text-white'}`}>{t('hrm.attendance.records.allDates')}</button>
                <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))} className="att-records-filter-input form-input w-36">
                  <option value="all">{t('hrm.attendance.records.allStatus')}</option>
                  <option value="late">{t('hrm.attendance.records.late')}</option>
                  <option value="ontime">{t('hrm.attendance.records.ontime')}</option>
                </select>
              </div>
              <button
                onClick={() => {
                  if (records.length === 0) return toast.error(t('hrm.attendance.toast.noRecords') || 'No records to export');
                  const hdrs = [t('hrm.attendance.records.cols.employee'), t('hrm.attendance.records.cols.checkIn'), t('hrm.attendance.records.cols.checkOut'), t('hrm.attendance.records.cols.method'), t('hrm.attendance.records.cols.hours'), t('hrm.attendance.records.cols.overtime'), t('hrm.attendance.records.cols.status')];
                  const rows = records.map(r => [
                    `"${r.Full_name || '—'}"`,
                    `"${r.check_in ? formatTimeByMethod(r.check_in, r.attendance_method) : '—'}"`,
                    `"${r.check_out ? formatTimeByMethod(r.check_out, r.attendance_method) : '—'}"`,
                    `"${r.attendance_method || '—'}"`,
                    `"${r.work_hours_calc != null ? r.work_hours_calc : '—'}"`,
                    `"${r.overtime_hours != null ? r.overtime_hours : '—'}"`,
                    `"${r.is_late ? t('hrm.attendance.records.status.late') : t('hrm.attendance.records.status.ontime')}"`
                  ]);
                  const csv = [hdrs.join(','), ...rows.map(row => row.join(','))].join('\n');
                  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `attendance_records_${new Date().toISOString().split('T')[0]}.csv`;
                  a.click();
                }}
                className="att-export-btn bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
              >
                <span><Icon name="download" size={17}/></span> {t('hrm.attendance.records.export')}
              </button>
            </div>
            {/* Table */}
            <div className="overflow-x-auto">
              <table className="att-records-table w-full text-sm">
                <thead className="att-records-thead" style={{ background: 'var(--bg-850, #161929)' }}>
                  <tr>{[t('hrm.attendance.records.cols.employee'), t('hrm.attendance.records.cols.photo'), t('hrm.attendance.records.cols.checkIn'), t('hrm.attendance.records.cols.checkOut'), t('hrm.attendance.records.cols.method'), t('hrm.attendance.records.cols.hours'), t('hrm.attendance.records.cols.overtime'), t('hrm.attendance.records.cols.status'), t('hrm.attendance.records.cols.actions')].map(h => <th key={h} className="att-records-th text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {isLoading ? <tr><td colSpan="9" className="py-10 text-center"><div className="att-loading-spinner w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" /></td></tr>
                  : records.length > 0 ? records.map(r => (
                    <tr key={r.id} className="att-records-row border-t border-white/5 hover:bg-white/2 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="att-records-avatar w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-pink-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">{(r.Full_name || '?')[0]}</div>
                          <div>
                            <p className="att-records-name font-medium text-white text-sm whitespace-nowrap">{r.Full_name || '—'}</p>
                            <p className="att-records-code text-xs text-slate-500 font-mono">{r.employee_code || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {r.check_in_photo_url ? (
                          <img src={r.check_in_photo_url} alt="Photo" className="w-8 h-8 object-cover rounded border border-white/10" />
                        ) : <span className="text-slate-500">—</span>}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap"><span className="att-checkin-time text-emerald-400 font-mono text-xs">{r.check_in ? formatTimeByMethod(r.check_in, r.attendance_method) : '—'}</span></td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {r.check_out
                          ? <span className="att-checkout-time text-rose-400 font-mono text-xs">{formatTimeByMethod(r.check_out, r.attendance_method)}</span>
                          : <button onClick={() => checkoutMutation.mutate(r.id)} className="att-checkout-btn text-xs text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 px-2 py-0.5 rounded-lg">{t('hrm.attendance.records.checkoutBtn')}</button>}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">{methodBadge(r.attendance_method)}</td>
                      <td className="py-3 px-4 whitespace-nowrap"><span className="att-hours font-mono text-white text-xs">{r.work_hours_calc != null ? `${r.work_hours_calc}h` : '—'}</span></td>
                      <td className="py-3 px-4 whitespace-nowrap"><span className="att-overtime font-mono text-white text-xs">{r.overtime_hours != null ? `${r.overtime_hours}h` : '—'}</span></td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {r.is_early_leave
                          ? <span className="att-status-badge att-status-early text-xs font-semibold text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded-full">{t('hrm.attendance.records.status.earlyLeave')}</span>
                          : r.is_late
                          ? <span className="att-status-badge att-status-late text-xs font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">{t('hrm.attendance.records.status.late')}</span>
                          : <span className="att-status-badge att-status-ontime text-xs text-emerald-400">{t('hrm.attendance.records.status.ontime')}</span>}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isAdmin() && <button onClick={() => setDeleteTarget(r)} className="att-records-delete text-xs text-rose-400 hover:text-rose-300 bg-rose-500/10 px-2 py-1 rounded-lg">{t('hrm.attendance.records.deleteBtn')}</button>}
                      </td>
                    </tr>
                  )) : <tr><td colSpan="9" className="att-records-empty py-12 text-center text-slate-500 text-sm">{t('hrm.attendance.records.empty')}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* QR Tab */}
        {activeTab === 'qr' && (
          <div className="att-qr-wrapper p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

              {/* Generate QR Form */}
              <div>
                <p className="att-qr-text text-sm text-slate-400 mb-6 leading-relaxed">
                  {t('hrm.attendance.qr.desc1')}<span className="att-qr-highlight font-semibold text-white">{t('hrm.attendance.qr.desc2')}</span>{t('hrm.attendance.qr.desc3')}<span className="att-qr-highlight-danger text-rose-400 font-semibold">{t('hrm.attendance.qr.desc4')}</span>
                </p>
                <form onSubmit={handleQrGenerate} className="space-y-4">
                  <div>
                    <label className="form-label att-form-label">{t('hrm.attendance.qr.selectEmp')}</label>
                    <select name="employee_id" required className="form-input att-form-input">
                      <option value="">{t('hrm.attendance.form.selectEmployee')}</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.Full_name}</option>)}
                    </select>
                  </div>
                  <button type="submit" disabled={qrMutation.isPending} className="att-qr-submit w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-3 rounded-xl transition-colors">
                    {qrMutation.isPending ? t('hrm.attendance.qr.generating') : `📱 ${t('hrm.attendance.qr.generateBtn')}`}
                  </button>
                </form>

                {generatedQrToken && (
                  <div className="att-qr-result-box mt-6 p-6 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 text-center animate-fade-in">
                    <p className="att-qr-result-title text-sm text-slate-300 mb-4">{t('hrm.attendance.qr.successTitle')}</p>
                    <div className="inline-block p-4 bg-white rounded-xl mb-3">
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${generatedQrToken}`} alt="QR Code" className="w-32 h-32" />
                    </div>
                    <p className="att-qr-result-token text-xs font-mono text-cyan-400 break-all">{generatedQrToken}</p>
                    <p className="att-qr-result-subtitle text-xs text-slate-500 mt-2">{t('hrm.attendance.qr.successDesc')}</p>
                  </div>
                )}
              </div>

              {/* Active QR Tokens List */}
              <div>
                <h3 className="att-qr-section-title text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{t('hrm.attendance.qr.activeTokens')}</h3>
                {tokens.length > 0 ? (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                    {tokens.map(tok => (
                      <div key={tok.id} className="att-qr-token-card flex items-center justify-between rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div>
                          <p className="att-qr-token-name text-sm font-medium text-white">{tok.Full_name}</p>
                          <p className="att-qr-token-val text-xs font-mono text-cyan-400">{tok.token?.slice(0, 16)}...</p>
                        </div>
                        <span className={`att-qr-token-badge text-xs font-semibold px-2 py-0.5 rounded-full ${tok.used ? 'att-qr-token-used text-emerald-400 bg-emerald-400/10' : 'att-qr-token-active text-amber-400 bg-amber-400/10 animate-pulse'}`}>
                          {tok.used ? `✓ ${t('hrm.attendance.qr.used')}` : t('hrm.attendance.qr.active')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="att-qr-empty-state rounded-xl p-8 text-center text-slate-500 text-sm" style={{ background: 'rgba(255,255,255,0.05)' }}>{t('hrm.attendance.qr.empty')}</div>
                )}
              </div>
            </div>
          </div>
        )}
        {/* Biometric Tab */}
        {activeTab === 'biometric' && (
          <div className="att-bio-wrapper p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* Left Column: Devices */}
              <div className="space-y-6">
                <div className="att-bio-card rounded-xl p-6 border border-white/10" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <h3 className="att-bio-card-title text-sm font-bold text-white mb-4 flex items-center gap-2"><span>🖧</span> {t('hrm.attendance.biometric.regDevice')}</h3>
                  <form onSubmit={(e) => { e.preventDefault(); addDeviceMutation.mutate(Object.fromEntries(new FormData(e.target))); e.target.reset(); }} className="space-y-4">
                    <div>
                      <label className="form-label att-form-label block mb-1">{t('hrm.attendance.biometric.deviceName')}</label>
                      <input name="device_name" required placeholder={t('hrm.attendance.biometric.placeholders.deviceName')} className="form-input att-form-input" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="form-label att-form-label block mb-1">{t('hrm.attendance.biometric.ipAddr')}</label>
                        <input name="ip_address" placeholder="192.168.1.100" className="form-input att-form-input" />
                      </div>
                      <div>
                        <label className="form-label att-form-label block mb-1">{t('hrm.attendance.biometric.port')}</label>
                        <input name="port" placeholder="4370" className="form-input att-form-input" />
                      </div>
                    </div>
                    <div>
                      <label className="form-label att-form-label block mb-1">{t('hrm.attendance.biometric.location')}</label>
                      <input name="location" placeholder="Floor 1 — Main Entrance" className="form-input att-form-input" />
                    </div>
                    <button type="submit" disabled={addDeviceMutation.isLoading} className="att-bio-submit w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-lg text-sm transition-colors mt-2">
                      + {t('hrm.attendance.biometric.regBtn')}
                    </button>
                  </form>
                </div>

                <div>
                  <h3 className="att-bio-section-title text-xs font-bold text-slate-400 mb-3 tracking-wider uppercase">{t('hrm.attendance.biometric.regDevices')} ({data?.biometric_devices?.length || 0})</h3>
                  <div className="space-y-3">
                    {data?.biometric_devices?.length > 0 ? data.biometric_devices.map(d => (
                      <div key={d.id} className="att-bio-list-card p-4 bg-surface-850 border border-white/5 rounded-lg flex justify-between items-center group">
                        <div>
                          <p className="att-bio-name font-bold text-slate-200">{d.device_name}</p>
                          <p className="att-bio-detail text-xs text-slate-400 mt-1">{d.ip_address || 'N/A'}:{d.port || 4370}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="att-bio-badge-active text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded flex items-center gap-1"><span className="att-bio-pulse-dot w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span> {t('hrm.attendance.biometric.active')}</span>
                          <button className="att-bio-action-edit text-xs text-indigo-400 hover:text-indigo-300 opacity-0 group-hover:opacity-100 transition-opacity">{t('hrm.attendance.biometric.edit')}</button>
                          <button onClick={() => deleteDeviceMutation.mutate(d.id)} className="att-bio-action-delete text-xs text-rose-400 hover:text-rose-300 bg-rose-500/10 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">{t('hrm.attendance.biometric.delete')}</button>
                        </div>
                      </div>
                    )) : <p className="att-bio-empty-state text-sm text-slate-500">{t('hrm.attendance.biometric.noDevices')}</p>}
                  </div>
                </div>
              </div>

              {/* Right Column: Mappings */}
              <div className="space-y-6">
                <div className="att-bio-card rounded-xl p-6 border border-white/10" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <h3 className="att-bio-card-title text-sm font-bold text-white mb-4 flex items-center gap-2"><span><Icon name="users" size={17}/></span> {t('hrm.attendance.biometric.mapEmp')}</h3>
                  <p className="att-bio-text text-xs text-slate-400 mb-5 leading-relaxed">{t('hrm.attendance.biometric.mapDesc')}</p>

                  <form onSubmit={(e) => { e.preventDefault(); addMappingMutation.mutate(Object.fromEntries(new FormData(e.target))); e.target.reset(); }} className="space-y-4">
                    <div>
                      <label className="form-label att-form-label block mb-1">{t('hrm.attendance.form.employee')}</label>
                      <select name="employee_id" required className="form-input att-form-input">
                        <option value="">{t('hrm.attendance.form.selectEmployee')}</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.Full_name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label att-form-label block mb-1">{t('hrm.attendance.biometric.device')}</label>
                      <select name="device_id" required className="form-input att-form-input">
                        <option value="">{t('hrm.attendance.biometric.selectDevice')}</option>
                        {data?.biometric_devices?.map(d => <option key={d.id} value={d.id}>{d.device_name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label att-form-label block mb-1">{t('hrm.attendance.biometric.bioId')}</label>
                      <input name="biometric_id" required placeholder={t('hrm.attendance.biometric.placeholders.bioId')} className="form-input att-form-input" />
                      <p className="att-bio-help-text text-[10px] text-slate-500 mt-1">{t('hrm.attendance.biometric.bioIdHelp')}</p>
                    </div>
                    <button type="submit" disabled={addMappingMutation.isLoading} className="att-bio-submit w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2.5 rounded-lg text-sm transition-colors mt-2">
                      <Icon name="users" size={17}/> {t('hrm.attendance.biometric.saveMapBtn')}
                    </button>
                  </form>
                </div>

                <div>
                  <h3 className="att-bio-section-title text-xs font-bold text-slate-400 mb-3 tracking-wider uppercase">{t('hrm.attendance.biometric.enrolledEmp')} ({data?.biometric_registrations?.length || 0})</h3>
                  <div className="space-y-3">
                    {data?.biometric_registrations?.length > 0 ? data.biometric_registrations.map(r => (
                      <div key={r.id} className="att-bio-list-card p-4 bg-surface-850 border border-white/5 rounded-lg flex justify-between items-center group">
                        <div className="flex items-center gap-3">
                          <div className="att-bio-avatar w-8 h-8 rounded-full bg-surface-950 border border-white/5 flex items-center justify-center text-xs font-bold text-slate-400">{(r.Full_name || '?')[0]}</div>
                          <div>
                            <p className="att-bio-name font-bold text-slate-200">{r.Full_name}</p>
                            <p className="att-bio-detail text-xs text-slate-400 mt-0.5">Device ID: <span className="att-bio-highlight font-mono text-cyan-400">{r.biometric_id}</span></p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="att-bio-badge-enrolled text-xs font-medium text-emerald-400 flex items-center gap-1">✓ {t('hrm.attendance.biometric.enrolled')}</span>
                          <button onClick={() => setEditMappingTarget(r)} className="att-bio-action-edit text-xs text-indigo-400 hover:text-indigo-300 opacity-0 group-hover:opacity-100 transition-opacity">{t('hrm.attendance.biometric.edit')}</button>
                          <button onClick={() => setDeleteMappingTarget(r)} className="att-bio-action-delete text-xs text-rose-400 hover:text-rose-300 bg-rose-500/10 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">{t('hrm.attendance.biometric.delete')}</button>
                        </div>
                      </div>
                    )) : <p className="att-bio-empty-state text-sm text-slate-500">{t('hrm.attendance.biometric.noMaps')}</p>}
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Rosters Tab */}
        {activeTab === 'rosters' && (
          <RostersTab employees={employees} />
        )}

        {/* Approvals Tab */}
        {activeTab === 'approvals' && (
          <ShiftApprovalsTab />
        )}

        {/* Overtime Tab */}
        {activeTab === 'overtime' && (
          <OvertimeTab />
        )}

        {/* Weekly Planner Tab */}
        {activeTab === 'planner' && (
          <WeeklyRosterPlanner />
        )}
      </div>

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        itemName={`Attendance for ${deleteTarget?.Full_name || 'Employee'}`}
      />

      <ConfirmDeleteModal
        isOpen={!!deleteMappingTarget}
        onClose={() => setDeleteMappingTarget(null)}
        onConfirm={() => deleteMappingMutation.mutate(deleteMappingTarget.id)}
        itemName={`Biometric Mapping for ${deleteMappingTarget?.Full_name || 'Unknown Employee'}`}
      />

      {editMappingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditMappingTarget(null)} />
          <div className="relative rounded-2xl w-full max-w-md m-4 p-6" style={{ background: 'var(--bg-850, #161929)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 className="text-base font-bold text-white mb-4">{t('hrm.attendance.biometric.editMap')}</h2>
            <form onSubmit={(e) => {
              e.preventDefault();
              editMappingMutation.mutate({ id: editMappingTarget.id, body: Object.fromEntries(new FormData(e.target)) });
            }} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">{t('hrm.attendance.form.employee').replace('*','')}</label>
                <select name="employee_id" required defaultValue={editMappingTarget.employee_id} className="form-input">
                  <option value="">{t('hrm.attendance.form.selectEmployee')}</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.Full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">{t('hrm.attendance.biometric.device').replace('*','')}</label>
                <select name="device_id" required defaultValue={editMappingTarget.device_id} className="form-input">
                  <option value="">{t('hrm.attendance.biometric.selectDevice')}</option>
                  {data?.biometric_devices?.map(d => <option key={d.id} value={d.id}>{d.device_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">{t('hrm.attendance.biometric.bioId').replace('*','')}</label>
                <input name="biometric_id" required defaultValue={editMappingTarget.biometric_id} className="form-input" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditMappingTarget(null)} className="flex-1 px-4 py-2.5 bg-white/5 text-slate-400 rounded-xl">{t('hrm.attendance.biometric.cancel')}</button>
                <button type="submit" disabled={editMappingMutation.isPending} className="flex-1 px-4 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl">{t('hrm.attendance.biometric.update')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
