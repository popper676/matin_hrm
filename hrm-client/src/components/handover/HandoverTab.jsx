import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../api/client';
import HandoverPanel from './HandoverPanel';

export default function HandoverTab({ obId, obEmployeeId }) {
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['handover-offboarding', obId],
    queryFn: () => api.get(`/handover/offboarding/${obId}`).then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post(`/handover/offboarding/${obId}/create`),
    onSuccess: () => { refetch(); toast.success('Handover case created'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to create handover'),
  });

  if (isLoading) {
    return <div className="py-8 text-center"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin inline-block" /></div>;
  }

  const handover = data?.handover;
  const items = data?.items || [];
  const employees = data?.employees || [];

  if (!handover) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--bg-800, #1e2235)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <p className="text-slate-400 text-sm mb-4">No handover case linked to this offboarding record.</p>
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl"
        >
          {createMutation.isPending ? 'Creating...' : '+ Create Handover Case'}
        </button>
      </div>
    );
  }

  return (
    <HandoverPanel
      handover={handover}
      items={items}
      employees={employees}
      excludeEmployeeId={obEmployeeId}
      onRefresh={() => {
        refetch();
        qc.invalidateQueries({queryKey:['offboarding-detail', obId]});
      }}
    />
  );
}
