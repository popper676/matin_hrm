import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';

export default function PeerVoting() {
  const { t } = useLanguage();
  const { data, isLoading } = useQuery({ queryKey: ['peer-voting'], queryFn: () => api.get('/peer-voting').then(r => r.data) });

  const votes = data?.votes || [];

  return (
    <Layout title={t('hrm.peervoting.title')} subtitle={t('hrm.peervoting.subtitle')}>
      <div className="flex justify-end mb-4">
        <Link to="/portal/vote" className="pv-btn-primary bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all flex items-center gap-2">
          <span>🗳️</span> {t('hrm.peervoting.submitVote')}
        </Link>
      </div>
      <div className="pv-table-wrapper rounded-2xl overflow-hidden" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <table className="pv-table w-full text-sm text-left">
          <thead className="pv-thead" style={{ background: 'var(--bg-850, #161929)' }}>
            <tr>{[t('hrm.peervoting.cols.voter'), t('hrm.peervoting.cols.votedFor'), t('hrm.peervoting.cols.score'), t('hrm.peervoting.cols.comments'), t('hrm.peervoting.cols.date')].map(h => <th key={h} className="pv-th py-3 px-5 text-xs font-semibold text-slate-400 uppercase">{h}</th>)}</tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan="5" className="py-10 text-center"><div className="pv-spinner w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin inline-block" /></td></tr>
            : votes.length === 0 ? <tr><td colSpan="5" className="pv-empty-state py-10 text-center text-slate-500">{t('hrm.peervoting.noVotes')}</td></tr>
            : votes.map(v => (
              <tr key={v.id} className="pv-tr border-t border-white/5 hover:bg-white/5">
                <td className="pv-td-primary py-3 px-5 font-medium text-slate-300">{v.voter_name || '—'}</td>
                <td className="pv-td-primary py-3 px-5 font-bold text-white">{v.nominee_name || '—'}</td>
                <td className="py-3 px-5">
                  <span className={`pv-badge px-2 py-1 rounded-lg font-mono font-bold text-xs ${v.score >= 4 ? 'pv-badge-high bg-emerald-500/20 text-emerald-400' : v.score >= 2.5 ? 'pv-badge-med bg-amber-500/20 text-amber-400' : 'pv-badge-low bg-rose-500/20 text-rose-400'}`}>
                    {v.score} / 5.0
                  </span>
                </td>
                <td className="pv-td-secondary py-3 px-5 text-xs text-slate-400 italic max-w-xs truncate">{v.comment || '—'}</td>
                <td className="pv-td-secondary py-3 px-5 text-xs text-slate-500">{(v.created_at || '').slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
