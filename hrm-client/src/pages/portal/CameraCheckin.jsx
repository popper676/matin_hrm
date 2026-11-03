import Icon from '../../components/common/Icon';
import { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { useMutation } from '@tanstack/react-query';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toBkkDate, getBkkToday } from '../../utils/dateUtils';

export default function CameraCheckin() {
  const qc = useQueryClient();
  const webcamRef = useRef(null);
  const [isCameraStarted, setIsCameraStarted] = useState(false);
  const [imgSrc, setImgSrc] = useState(null);
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [selectedShift, setSelectedShift] = useState('');
  const [specialReason, setSpecialReason] = useState('');

  const { data: shiftData } = useQuery({
    queryKey: ['available_shifts'],
    queryFn: () => api.get('/attendance/available-shifts').then(res => res.data),
    onSuccess: (data) => {
      if (data.default_shift_id && !selectedShift) {
        setSelectedShift(data.default_shift_id);
      } else if (data.allowed_shifts?.length > 0 && !selectedShift) {
        setSelectedShift(data.allowed_shifts[0].id);
      }
    }
  });

  const { data: portalData } = useQuery({
    queryKey: ['portal_data'],
    queryFn: () => api.get('/portal').then(res => res.data)
  });

  // Business day is Bangkok. check_in is a UTC instant, so a 5:56 AM BKK check-in is the previous UTC date.
  const today = getBkkToday();

  // Find today's records
  const todayRecords = portalData?.attendance_records?.filter(r => r.check_in && toBkkDate(r.check_in) === today) || [];
  const todayOpenRecord = todayRecords.find(r => !r.check_out);
  const hasCompletedAttendance = todayRecords.length > 0 && todayRecords.every(r => r.check_out);

  const isCheckingOut = !!todayOpenRecord;

  const checkinMutation = useMutation({
    mutationFn: (base64) => api.post('/attendance/photo-checkin', {
      employee_id: user.employee_id,
      photo_base64: base64,
      claimed_shift_id: selectedShift,
      special_shift_reason: selectedShift === 'special' ? specialReason : null
    }),
    onSuccess: () => {
      toast.success(isCheckingOut ? 'Photo Check-Out successful!' : 'Photo Check-In successful!');
      setImgSrc(null);
      setIsCameraStarted(false);
      qc.invalidateQueries({queryKey:['portal_data']});
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to check-in')
  });

  const capture = useCallback(() => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();

      // Compress the image before setting it
      const img = new Image();
      img.src = imageSrc;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Target max width 800px to drastically reduce file size (from ~1-3MB to < 100KB)
        const MAX_WIDTH = 800;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Compress to JPEG with 0.7 quality
        const compressedSrc = canvas.toDataURL('image/jpeg', 0.7);
        setImgSrc(compressedSrc);
      };
    }
  }, [webcamRef]);

  const submit = () => {
    if (!isCheckingOut && selectedShift === 'special' && !specialReason.trim()) {
      toast.error('Please provide a reason for the special shift request.');
      return;
    }
    if (imgSrc) checkinMutation.mutate(imgSrc);
  };

  const formatTime = (date) => date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
  const formatDate = (date) => date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Late logic: after 9:00:00 AM (for checkin)
  // Check if checkout is early based on shift end time (only for checkout)
  const isLateCheckin = !isCheckingOut && (currentTime.getHours() > 9 || (currentTime.getHours() === 9 && (currentTime.getMinutes() > 0 || currentTime.getSeconds() > 0)));

  let isEarlyCheckout = false;
  let isLateCheckout = false;
  if (isCheckingOut && todayOpenRecord) {
    const shift = shiftData?.allowed_shifts?.find(s => s.id === todayOpenRecord.claimed_shift_id);
    if (shift && shift.end_time) {
      const [h, m] = shift.end_time.split(':');
      const endTime = new Date(currentTime);
      endTime.setHours(parseInt(h), parseInt(m), 0, 0);
      isEarlyCheckout = currentTime < endTime;
      isLateCheckout = currentTime >= endTime;
    }
  }

  return (
    <Layout title={isCheckingOut ? "Photo Check-Out" : "Photo Check-In"} subtitle="Take a selfie to record your attendance">
      <div className="max-w-2xl mx-auto rounded-2xl overflow-hidden shadow-2xl" style={{ background: 'var(--bg-850, #161929)', border: '1px solid var(--lm-hr-overlay-border, rgba(255,255,255,0.05))' }}>

        {/* Camera Area */}
        <div className="w-full h-[400px] flex items-center justify-center bg-surface-950 portal-camera-box relative">
          {hasCompletedAttendance ? (
            <div className="text-center text-slate-500">
              <span className="text-4xl block mb-2"><Icon name="birthdays" size={17}/></span>
              <p className="font-semibold text-white">Attendance Completed</p>
              <p className="text-xs mt-1">You have already checked out for today.</p>
            </div>
          ) : !isCameraStarted ? (
            <div className="text-center text-slate-500">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="font-semibold text-white">Camera not started</p>
              <p className="text-xs mt-1">Click "Start Camera" below</p>
            </div>
          ) : !imgSrc ? (
            <Webcam
              audio={false}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              className="w-full h-full object-cover"
              videoConstraints={{ facingMode: "user" }}
              onUserMediaError={(err) => {
                console.error(err);
                toast.error('Camera access denied or unsupported. (Make sure you are using HTTPS!)', { duration: 5000 });
                setIsCameraStarted(false);
              }}
            />
          ) : (
            <>
              <img src={imgSrc} alt="Captured" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center backdrop-blur-sm">
                <div className="bg-surface-850 px-6 py-4 rounded-2xl border border-white/10 text-center shadow-xl">
                  <span className="text-4xl block mb-2"><Icon name="camera" size={17}/></span>
                  <p className="text-white font-bold text-sm">Photo Captured</p>
                  <div className="flex gap-3 mt-4">
                    <button onClick={() => setImgSrc(null)} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-xs font-bold rounded-lg transition-colors">
                      Retake
                    </button>
                    <button onClick={submit} disabled={checkinMutation.isLoading} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors">
                      {checkinMutation.isLoading ? 'Submitting...' : 'Submit Now'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Info Panel */}
        <div className="p-6 bg-surface-800">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{isCheckingOut ? 'Check-out Time' : 'Check-in Time'}</p>
              <h2 className="text-3xl font-black text-white tracking-tight mb-1">{formatTime(currentTime)}</h2>
              <p className="text-xs text-slate-400">{formatDate(currentTime)}</p>
            </div>
            <div>
              {!isCheckingOut ? (
                isLateCheckin ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-500/20 bg-amber-500/10">
                    <span className="text-xs font-bold text-amber-400">Late <Icon name="warning" size={17}/></span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10">
                    <span className="text-xs font-bold text-emerald-400">On Time <Icon name="active" size={17}/></span>
                  </div>
                )
              ) : (
                isEarlyCheckout ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-rose-500/20 bg-rose-500/10">
                    <span className="text-xs font-bold text-rose-400">Early Leave <Icon name="warning" size={17}/></span>
                  </div>
                ) : isLateCheckout ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10">
                    <span className="text-xs font-bold text-emerald-400">On Time / OT <Icon name="active" size={17}/></span>
                  </div>
                ) : null
              )}
            </div>
          </div>



          {/* Shift Selection Area (Only for Check-In) */}
          {hasCompletedAttendance ? (
            <div className="mb-6 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-center">
              <span className="text-2xl block mb-2"><Icon name="active" size={17}/></span>
              <p className="text-indigo-400 font-bold text-sm">Great job today!</p>
              <p className="text-slate-400 text-xs mt-1">See you tomorrow.</p>
            </div>
          ) : !isCheckingOut ? (
            <div className="mb-6 p-4 rounded-xl bg-white/5 border border-white/10" style={{ background: 'var(--bg-850, rgba(255,255,255,0.05))', borderColor: 'var(--lm-hr-overlay-border, rgba(255,255,255,0.1))' }}>
              <label className="block text-xs font-bold text-slate-400 mb-2">Selected Shift</label>
              <select
                value={selectedShift}
                onChange={e => setSelectedShift(e.target.value)}
                className="w-full bg-surface-950 portal-form-control border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="" disabled>Select your shift...</option>
                {shiftData?.allowed_shifts?.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.shift_name} ({s.start_time.slice(0,5)} - {s.end_time.slice(0,5)})
                  </option>
                ))}
                <option value="special">Other / Request Special Shift</option>
              </select>

              {selectedShift === 'special' && (
                <div className="mt-3">
                  <input
                    type="text"
                    placeholder="Reason (e.g. Boss asked me to come early)"
                    value={specialReason}
                    onChange={e => setSpecialReason(e.target.value)}
                    className="w-full bg-surface-950 portal-form-control border border-amber-500/50 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                  <p className="text-[10px] text-amber-400/80 mt-1 pl-1">HR must approve special shift requests manually.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
              <span className="text-2xl block mb-2"><Icon name="staff" size={17}/></span>
              <p className="text-emerald-400 font-bold text-sm">You are currently checked in.</p>
              <p className="text-slate-400 text-xs mt-1">Take a photo to check out for the day.</p>
            </div>
          )}



          <div className="flex gap-4 mb-6">
            <button
              onClick={() => setIsCameraStarted(true)}
              disabled={isCameraStarted || hasCompletedAttendance}
              className={`flex-1 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                (isCameraStarted || hasCompletedAttendance)
                  ? 'bg-surface-900 portal-btn-disabled text-slate-400 cursor-not-allowed opacity-50'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
              }`}
            >
              <span><Icon name="camera" size={17}/></span> Start Camera
            </button>
            <button
              onClick={capture}
              disabled={!isCameraStarted || imgSrc || hasCompletedAttendance}
              className={`flex-1 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                (!isCameraStarted || imgSrc || hasCompletedAttendance)
                  ? 'bg-surface-850 portal-btn-disabled border border-white/5 text-slate-500 cursor-not-allowed'
                  : (isCheckingOut ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20')
              }`}
            >
              <span><Icon name="camera" size={17}/></span> {isCheckingOut ? 'Check Out' : 'Check In'}
            </button>
          </div>

          <div className="bg-surface-850 portal-tip-card border border-indigo-500/20 rounded-xl p-4 flex gap-3 items-start">
            <div className="w-5 h-5 rounded bg-indigo-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-indigo-400 text-xs font-bold">i</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Your photo check-in is recorded with timestamp. The system detects late arrival after <strong className="text-white">9:00 AM</strong>. Make sure your face is clearly visible inside the circle.
            </p>
          </div>
        </div>

      </div>
    </Layout>
  );
}
