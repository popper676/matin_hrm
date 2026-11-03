import Icon from '../../components/common/Icon';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';

export default function QRCheckIn() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ 
    queryKey: ['portal_data'], 
    queryFn: () => api.get('/portal').then(r => r.data) 
  });

  const qrToken = data?.qr_token;

  return (
    <Layout title="QR Check-In 📱" subtitle="Scan your HR-generated QR code to mark attendance">
      <div className="flex flex-col items-center max-w-2xl mx-auto pt-10">
        
        {/* Main QR Display Card */}
        <div className="w-full rounded-[2rem] p-8 text-center flex flex-col items-center justify-center mb-6 shadow-xl" 
             style={{ background: 'var(--bg-800, #1c2033)', border: '1px solid var(--lm-hr-overlay-border, rgba(255,255,255,0.02))', minHeight: '400px' }}>
          
          {isLoading ? (
            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          ) : qrToken ? (
            <>
              <h2 className="text-xl font-bold text-white mb-2">Your Active QR Code</h2>
              <p className="text-sm text-slate-400 mb-8">Show this code to the scanner device at your office.</p>
              
              <div className="bg-white p-4 rounded-2xl shadow-xl inline-block">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrToken)}`} 
                  alt="QR Code" 
                  className="w-[200px] h-[200px]"
                />
              </div>
            </>
          ) : (
            <>
              <div className="text-6xl mb-6 opacity-80"><Icon name="qr" size={17}/></div>
              <h2 className="text-xl font-bold text-white mb-3">No Active QR Code</h2>
              <p className="text-sm text-slate-400 max-w-sm mx-auto mb-8 leading-relaxed">
                You don't have an active QR code yet.<br/>
                Ask your HR to generate one for you from the <span className="text-indigo-400 font-medium">Attendance module</span>.
              </p>
              
              <div className="w-full max-w-sm rounded-xl p-5 text-left border border-white/5" style={{ background: 'var(--bg-850, rgba(255,255,255,0.02))', borderColor: 'var(--lm-hr-overlay-border, rgba(255,255,255,0.05))' }}>
                <h4 className="text-xs font-bold text-slate-300 mb-3">Steps for HR to generate:</h4>
                <ol className="text-xs text-slate-400 space-y-2">
                  <li>1. Go to <span className="text-indigo-400 font-semibold">Attendance → QR Tokens tab</span></li>
                  <li>2. Select your name and click <span className="text-indigo-400 font-semibold">Generate QR</span></li>
                  <li>3. Come back here to scan or click check-in</li>
                </ol>
              </div>
            </>
          )}
        </div>

        {/* Alternative Photo Check-In Card */}
        <div 
          className="w-full rounded-2xl p-5 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors group shadow-md"
          style={{ background: 'var(--bg-800, #1c2033)', border: '1px solid var(--lm-hr-overlay-border, rgba(255,255,255,0.02))' }}
          onClick={() => navigate('/portal/checkin')}
        >
          <div className="flex items-center gap-4">
            <div className="text-3xl"><Icon name="camera" size={17}/></div>
            <div>
              <h3 className="text-sm font-bold text-white mb-0.5">Prefer Photo Check-In?</h3>
              <p className="text-xs text-slate-400">Take a selfie to record attendance without a QR code.</p>
            </div>
          </div>
          <div className="px-4 py-2 rounded-lg bg-indigo-500/10 text-indigo-400 text-xs font-bold group-hover:bg-indigo-500/20 transition-colors flex items-center gap-2">
            Use <span>→</span>
          </div>
        </div>

      </div>
    </Layout>
  );
}
