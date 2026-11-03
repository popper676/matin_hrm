import {getBkkDateString} from '../../../../shared/dateUtils.js';
import Icon from '../../components/common/Icon';
import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Webcam from 'react-webcam';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function SOPExecution() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [checkedItems, setCheckedItems] = useState({});
  const [activeVideoFile, setActiveVideoFile] = useState({}); // { sopId: fileOrBlob }
  const [manualReports, setManualReports] = useState({}); // { sopId: string }

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSopId, setRecordingSopId] = useState(null);
  const webcamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const [recordedChunks, setRecordedChunks] = useState([]);

  const fileInputRef = useRef(null);
  const [uploadingSopId, setUploadingSopId] = useState(null);

  const { data: sopsData, isLoading: sopsLoading } = useQuery({
    queryKey: ['sops'],
    queryFn: () => api.get('/sops').then(r => r.data)
  });

  const { data: portalData, isLoading: portalLoading } = useQuery({
    queryKey: ['portal_data'],
    queryFn: () => api.get('/portal').then(r => r.data)
  });

  const isLoading = sopsLoading || portalLoading;

  const completeMutation = useMutation({
    mutationFn: async (sopId) => {
      setUploadingSopId(sopId);

      const file = activeVideoFile[sopId];
      if (file || manualReports[sopId]) {
        const formData = new FormData();
        if (file) formData.append('file', file);
        if (manualReports[sopId]) formData.append('manualReport', manualReports[sopId]);
        return fetch(`/api/sops/${sopId}/complete`, {
          method: 'POST',
          credentials: 'include',
          body: formData
        }).then(res => {
          if (!res.ok) throw new Error('Upload failed');
          return res.json();
        });
      } else {
        return api.post(`/sops/${sopId}/complete`);
      }
    },
    onSuccess: (_, sopId) => {
      qc.invalidateQueries({queryKey:['sops']});
      toast.success('Task uploaded & completed!');
      setActiveVideoFile(prev => ({ ...prev, [sopId]: null }));
      setUploadingSopId(null);
    },
    onError: () => {
      toast.error('Failed to complete task');
      setUploadingSopId(null);
    }
  });

  const attRecords = portalData?.attendance_records || [];

  // Filter SOPs for this employee, and EXCLUDE future dates
  const todayStr = getBkkDateString(new Date());
  const sops = sopsData?.sops?.filter(s => {
    if (s.employee_id !== user.employee_id) return false;
    const dateStr = s.assigned_date || (s.created_at ? getBkkDateString(s.created_at) : '');
    return dateStr <= todayStr;
  }) || [];

  // Sort and enhance SOPs
  const enhancedSops = sops.map(s => {
    const dateStr = s.assigned_date || (s.created_at ? getBkkDateString(s.created_at) : '');
    const isAttended = attRecords.some(r => r.check_in && getBkkDateString(r.check_in)===dateStr);
    const isPast = dateStr < todayStr;
    const tasks = (s.task_description || s.content || 'Complete daily procedure').split('\n').filter(t => t.trim());

    return {
      ...s,
      dateStr,
      isAbsent: isPast && !isAttended && !s.is_completed, // if it's not completed, past, and no attendance
      taskList: tasks
    };
  }).sort((a,b)=>Number(a.is_completed)-Number(b.is_completed)||b.dateStr.localeCompare(a.dateStr));

  const handleCheckbox = (sopId, taskIndex) => {
    setCheckedItems(prev => ({
      ...prev,
      [`${sopId}-${taskIndex}`]: !prev[`${sopId}-${taskIndex}`]
    }));
  };

  const areAllChecked = (sopId, taskCount) => {
    for (let i = 0; i < taskCount; i++) {
      if (!checkedItems[`${sopId}-${i}`]) return false;
    }
    return true;
  };

  const handleStartRecording = useCallback((sopId) => {
    setRecordingSopId(sopId);
    setRecordedChunks([]);
    setIsRecording(true);
  }, []);

  const handleDataAvailable = useCallback(
    ({ data }) => {
      if (data.size > 0) {
        setRecordedChunks((prev) => prev.concat(data));
      }
    },
    [setRecordedChunks]
  );

  const handleStartCaptureClick = useCallback(() => {
    if (webcamRef.current && webcamRef.current.stream) {
      mediaRecorderRef.current = new MediaRecorder(webcamRef.current.stream, {
        mimeType: "video/webm"
      });
      mediaRecorderRef.current.addEventListener("dataavailable", handleDataAvailable);
      mediaRecorderRef.current.start();
      toast('Recording started...', { icon: '🎥' });
    }
  }, [webcamRef, handleDataAvailable]);

  const handleStopCaptureClick = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      toast.success('Recording stopped!');
    }
  }, [mediaRecorderRef]);

  const handleSaveVideo = useCallback(() => {
    if (recordedChunks.length) {
      const blob = new Blob(recordedChunks, { type: "video/webm" });
      blob.name = "webcam_recording.webm";
      setActiveVideoFile(prev => ({ ...prev, [recordingSopId]: blob }));
      setIsRecording(false);
      setRecordingSopId(null);
      setRecordedChunks([]);
    }
  }, [recordedChunks, recordingSopId]);

  const handleFileSelectClick = (sopId) => {
    setUploadingSopId(sopId); // Temporarily use this state to know which SOP triggered the click
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0] && uploadingSopId) {
      const file = e.target.files[0];
      setActiveVideoFile(prev => ({ ...prev, [uploadingSopId]: file }));
      toast.success('File selected!');
    }
    setUploadingSopId(null);
  };

  return (
    <Layout title="My Tasks" subtitle="Complete your daily procedures and upload video proof.">

      <input
        type="file"
        accept="image/*,video/*"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      {/* Recording Modal */}
      {isRecording && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="border p-6 rounded-2xl max-w-2xl w-full text-center shadow-2xl" style={{ background: 'var(--bg-800, #12141d)', borderColor: 'var(--lm-hr-overlay-border, rgba(255,255,255,0.1))' }}>
            <h3 className="text-white font-bold text-lg mb-4">Record Video Proof</h3>
            <div className="rounded-xl overflow-hidden bg-black mb-6 relative" style={{ aspectRatio: '16/9' }}>
              <Webcam audio={true} ref={webcamRef} className="w-full h-full object-cover" />
            </div>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => { setIsRecording(false); setRecordingSopId(null); }}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-400 bg-white/5 hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              {mediaRecorderRef.current && mediaRecorderRef.current.state === "recording" ? (
                <button
                  onClick={handleStopCaptureClick}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-rose-500 hover:bg-rose-600 transition-colors flex items-center gap-2"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse"></span> Stop Recording
                </button>
              ) : recordedChunks.length > 0 ? (
                <button
                  onClick={handleSaveVideo}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors"
                >
                  Save Video
                </button>
              ) : (
                <button
                  onClick={handleStartCaptureClick}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-500 hover:bg-indigo-600 transition-colors"
                >
                  Start Recording
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {enhancedSops.map(sop => {
            const isDone = sop.is_completed;
            const isAbsent = false; // Past uncompleted tasks remain actionable.
            const tasks = sop.taskList;
            const allChecked = isDone || areAllChecked(sop.id, tasks.length);

            const reportText = manualReports[sop.id] || '';
            const hasMedia = !!activeVideoFile[sop.id];
            const manualSuccess = reportText.trim().length > 0 && hasMedia;
            const canComplete = allChecked || manualSuccess;

            return (
              <div key={sop.id} className="rounded-[1.5rem] p-6 flex flex-col shadow-lg" style={{ background: 'var(--bg-800, #12141d)', border: '1px solid var(--lm-hr-overlay-border, rgba(255,255,255,0.03))' }}>

                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                  <span className="text-sm font-bold text-slate-400">{sop.dateStr}</span>
                  {isDone ? (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                      ✓ Done
                    </span>
                  ) : isAbsent ? (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">
                      Absent
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Pending
                    </span>
                  )}
                </div>

                {sop.manual_report && <p className="mb-4 whitespace-pre-wrap text-sm text-slate-300">{sop.manual_report}</p>}
                {/* Checkboxes */}
                <div className="space-y-4 mb-6">
                  {tasks.map((task, idx) => {
                    const isChecked = isDone || checkedItems[`${sop.id}-${idx}`];
                    return (
                      <label key={idx} className="flex items-start gap-3 cursor-pointer group">
                        <div className="relative flex items-center justify-center mt-0.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => !isDone && handleCheckbox(sop.id, idx)}
                            disabled={isDone || isAbsent}
                            className="appearance-none w-5 h-5 border-2 border-slate-600 rounded bg-transparent checked:bg-indigo-500 checked:border-indigo-500 transition-colors disabled:opacity-50"
                          />
                          {isChecked && <span className="absolute text-white text-[10px] font-bold">✓</span>}
                        </div>
                        <span className={`text-sm transition-colors ${isChecked ? 'text-slate-500 line-through' : 'text-slate-300 group-hover:text-white'}`}>
                          {task}
                        </span>
                      </label>
                    );
                  })}
                </div>

                {/* Manual Report */}
                {!isDone && !isAbsent && (
                  <div className="mb-8 flex-1">
                    <label className="block text-xs font-bold text-slate-400 mb-2">Manual Report (Optional)</label>
                    <textarea
                      value={manualReports[sop.id] || ''}
                      onChange={(e) => setManualReports(prev => ({ ...prev, [sop.id]: e.target.value }))}
                      placeholder="Type your manual report here if you couldn't check all tasks..."
                      className="w-full h-24 p-3 bg-surface-800 portal-form-control border border-white/5 rounded-xl text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none transition-colors"
                    />
                    <p className="text-[10px] text-slate-500 mt-2">
                      * You can submit this SOP by writing a manual report and attaching proof (image or video), even if you didn't check all boxes.
                    </p>
                  </div>
                )}

                {/* Actions */}
                {!isDone && !isAbsent ? (
                  <div className="space-y-3 mt-auto">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handleStartRecording(sop.id)}
                        className="py-3 rounded-xl border border-white/5 bg-surface-800 portal-action-btn hover:bg-surface-900 transition-colors flex flex-col items-center justify-center gap-2"
                      >
                        <span className="text-xl text-rose-400"><Icon name="sops" size={17}/></span>
                        <span className="text-xs font-bold text-white">Live Record</span>
                      </button>
                      <button
                        onClick={() => handleFileSelectClick(sop.id)}
                        className="py-3 rounded-xl border border-white/5 bg-surface-800 portal-action-btn hover:bg-surface-900 transition-colors flex flex-col items-center justify-center gap-2"
                      >
                        <span className="text-xl text-indigo-400">↑</span>
                        <span className="text-xs font-bold text-white">Select File</span>
                      </button>
                    </div>

                    <div className="text-center py-2 bg-surface-800 portal-action-btn rounded-lg text-xs font-medium text-slate-500">
                      {activeVideoFile[sop.id] ? (
                        <span className="text-emerald-400 flex items-center justify-center gap-2">
                          <span>✓</span> File attached: {activeVideoFile[sop.id].name}
                        </span>
                      ) : (
                        'No image/video attached'
                      )}
                    </div>

                    <button
                      onClick={() => completeMutation.mutate(sop.id)}
                      disabled={completeMutation.isPending || !canComplete}
                      className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/25 active:scale-[0.99]"
                    >
                      {uploadingSopId === sop.id ? 'Uploading...' : '↑ Upload & Complete'}
                    </button>

                    <button className="w-full py-3.5 rounded-xl font-bold text-sm text-slate-400 bg-surface-800 portal-action-btn hover:bg-surface-900 border border-white/5 transition-colors">
                      Mark as Absent
                    </button>
                  </div>
                ) : isDone ? (
                  <div className="text-center mt-auto pt-4 border-t border-white/5 space-y-3">
                    <span className="text-sm font-bold text-emerald-500 block">
                      Completed on {sop.completed_at ? new Date(sop.completed_at).toLocaleDateString() : 'Unknown'}
                    </span>

                    {/* Re-upload Media Section */}
                    {activeVideoFile[sop.id] ? (
                      <div className="space-y-2 bg-surface-800 portal-action-btn p-3 rounded-xl border border-white/5">
                        <span className="text-xs text-amber-400 block break-words">File: {activeVideoFile[sop.id].name}</span>
                        <button
                          onClick={() => completeMutation.mutate(sop.id)}
                          disabled={completeMutation.isPending}
                          className="w-full py-2 rounded-lg font-bold text-xs text-white bg-indigo-500 hover:bg-indigo-600 transition-colors"
                        >
                          {uploadingSopId === sop.id ? 'Uploading...' : 'Confirm Upload'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleFileSelectClick(sop.id)}
                        className="text-xs font-medium text-slate-400 hover:text-indigo-400 underline transition-colors"
                      >
                        Add / Update Proof Media
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-center mt-auto pt-4 border-t border-white/5">
                    <span className="text-sm font-bold text-rose-500">Marked as Absent</span>
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
