import { useQuery } from '@tanstack/react-query';
import Layout from '../../components/layout/Layout';
import api from '../../api/client';
import './auditLogs.css';

export default function AuditLogs() {
  const { data: logs, isLoading } = useQuery({ 
    queryKey: ['audit_logs'], 
    queryFn: () => api.get('/audit-logs').then(r => r.data) 
  });

  return (
    <Layout title="System Audit Logs" subtitle="Track critical admin actions across the system">
      <div className="audit-logs-container rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="audit-logs-table w-full text-sm text-left">
            <thead>
              <tr>
                {['Timestamp', 'User', 'Action', 'Module', 'Details', 'Context'].map(h => 
                  <th key={h} className="py-3 px-5 text-xs font-semibold uppercase tracking-wider">{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="6" className="py-10 text-center"><div className="audit-logs-spinner w-8 h-8 border-2 border-t-transparent rounded-full animate-spin inline-block" /></td></tr>
              ) : !logs || logs.length === 0 ? (
                <tr><td colSpan="6" className="py-12 text-center text-sm audit-logs-empty">No audit logs recorded yet.</td></tr>
              ) : (
                logs.map(log => {
                  let text = log.details;
                  let meta = null;
                  if (text && text.includes(' ||| ')) {
                    const parts = text.split(' ||| ');
                    text = parts[0];
                    try {
                      meta = JSON.parse(parts[1]);
                    } catch { /* Older log details may contain unstructured text. */ }
                  }
                  
                  return (
                    <tr key={log.id} className="audit-logs-row border-t transition-colors">
                      <td className="py-3.5 px-5 font-mono text-xs audit-logs-time">{new Date(log.created_at).toLocaleString()}</td>
                      <td className="py-3.5 px-5">
                        <div className="font-medium audit-logs-user">{meta?.user_name || log.user_name || 'System'}</div>
                        <div className="text-[10px] uppercase tracking-wider mt-0.5 audit-logs-role">{meta?.user_role || 'System'}</div>
                      </td>
                      <td className="py-3.5 px-5">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider audit-logs-action audit-action-${log.action}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 font-semibold audit-logs-module">{log.module}</td>
                      <td className="py-3.5 px-5 max-w-sm">
                        <div className="truncate audit-logs-details" title={text}>{text}</div>
                      </td>
                      <td className="py-3.5 px-5">
                        {meta ? (
                          <div className="flex flex-col gap-1 text-[11px] audit-logs-context">
                            <div className="flex items-center gap-1.5"><span className="context-label">IP:</span> <span className="font-mono context-value">{meta.ip_address || log.ip_address}</span></div>
                            <div className="flex items-center gap-1.5"><span className="context-label">Location:</span> <span className="context-value">
                              {meta.location && meta.location.country !== 'Unknown' ? 
                                `${meta.location.city !== 'Unknown' ? meta.location.city + ', ' : ''}${meta.location.region !== 'Unknown' ? meta.location.region + ', ' : ''}${meta.location.country}` 
                                : 'Unknown'}
                            </span></div>
                            <div className="flex items-center gap-1.5"><span className="context-label">Device:</span> <span className="context-value">{meta.os} • {meta.browser}</span></div>
                          </div>
                        ) : (
                          <div className="text-[11px] font-mono audit-logs-fallback">
                            {log.ip_address !== '0.0.0.0' ? `IP: ${log.ip_address}` : 'No context available'}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
