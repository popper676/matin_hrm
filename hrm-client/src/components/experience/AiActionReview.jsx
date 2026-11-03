import toast from 'react-hot-toast';
import {useState} from 'react';
import {useQuery,useQueryClient,useMutation} from '@tanstack/react-query';
import api from '../../api/client';
import {useLanguage} from '../../context/LanguageContext';
export default function AiActionReview({sessionId}) {
 const {language}=useLanguage(),my=language==='my',queryClient=useQueryClient(),[error,setError]=useState('');
 const {data:actions=[]}=useQuery({queryKey:['ai-action-proposals',sessionId],enabled:!!sessionId,refetchInterval:30000,queryFn:()=>api.get('/boss/chat/sessions/'+sessionId+'/actions').then(r=>r.data.actions)});
 const decision=useMutation({mutationFn:({id,confirmed})=>api.post('/boss/chat/actions/'+id+'/decide',{session_id:sessionId,confirmed}),onSuccess:response=>{setError('');toast.success(response.data.status==='cancelled'?(my?'ပယ်ဖျက်ပြီးပါပြီ။':'Action cancelled.'):(my?'အတည်ပြုထားသည့် လုပ်ဆောင်ချက် ပြီးစီးပါပြီ။':'Confirmed action completed.'));queryClient.invalidateQueries({queryKey:['ai-action-proposals',sessionId]});queryClient.invalidateQueries({queryKey:['boss-kpi']});},onError:e=>setError(e.response?.data?.error||'Unable to confirm action.')});
 if(!actions.length&&!error)return null;
 const labels={create_kpi_task:my?'KPI Task ဖန်တီးရန်':'Create KPI task',send_team_announcement:my?'အဖွဲ့သို့ ကြေညာချက်တင်ရန်':'Publish team announcement',send_employee_warning:my?'Owner ထံ HR အကြောင်းကြားရန်':'Send HR alert to Owner'};
 const fields={title:my?'ခေါင်းစဉ်':'Title',description:my?'အသေးစိတ်':'Description',employee_id:my?'ဝန်ထမ်း ID':'Employee ID',due_date:my?'သတ်မှတ်ရက်':'Due date',content:my?'အကြောင်းအရာ':'Message',priority:my?'ဦးစားပေးအဆင့်':'Priority',employee_name:my?'ဝန်ထမ်းအမည်':'Employee',reason:my?'အကြောင်းရင်း':'Reason'};
 return <section aria-label="Actions awaiting your confirmation" className="space-y-3">
 {error&&<p role="alert" className="text-red-300">{error}</p>}
 {actions.map(action=><article key={action.id} className="rounded-xl border border-amber-400/40 bg-surface-900 p-5">
  <h3 className="font-semibold text-amber-200">{labels[action.kind]||action.kind}</h3>
  <p className="text-sm text-slate-400 mt-2">{my?'ယခုအချိန်အထိ မလုပ်ဆောင်ရသေးပါ။ အသေးစိတ်စစ်ပြီး အတည်ပြုမှသာ လုပ်ဆောင်ပါမည်။':'Nothing has executed. Review these exact details before confirming.'}</p>
  <dl className="my-4 space-y-2">{Object.entries(action.payload).filter(([,v])=>v!=null).map(([key,value])=><div key={key}><dt className="text-xs text-slate-400">{fields[key]||key}</dt><dd className="text-sm text-white whitespace-pre-wrap break-words">{String(value)}</dd></div>)}</dl>
  <p className="text-xs text-slate-500">{my?'အတည်ပြုနိုင်သည့် အချိန်ကုန်ဆုံးမည် — ':'Expires — '}{new Date(action.expires_at).toLocaleTimeString()}</p>
  <div className="mt-4 flex gap-3">
   <button type="button" disabled={decision.isPending} onClick={()=>decision.mutate({id:action.id,confirmed:true})} className="btn-primary">{my?'အတည်ပြုပြီး လုပ်ဆောင်မည်':'Confirm & execute'}</button>
   <button type="button" disabled={decision.isPending} onClick={()=>decision.mutate({id:action.id,confirmed:false})} className="btn-secondary">{my?'ပယ်ဖျက်မည်':'Cancel action'}</button>
  </div>
 </article>)}
 </section>;
}
