import {useQuery} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {useAuth} from '../../context/AuthContext';
import api from '../../api/client';
import {useWords} from './OpsUI';
import '../../styles/owner-setup.css';
export default function OwnerSetupBanner(){
 const {user}=useAuth(),l=useWords(),q=useQuery({queryKey:['owner-setup'],queryFn:()=>api.get('/owner-setup').then(r=>r.data),enabled:!!user?.is_owner,retry:false});
 if(!user?.is_owner||!q.data||q.data.all_complete)return null;
 return <Link className="setup-launcher-banner" to="/owner-setup"><div><strong>{l('Finish your team setup','အဖွဲ့အတွက် Setup ဆက်လုပ်ရန်')}</strong><span>{q.data.completed} / {q.data.total} {l('steps reviewed','အဆင့် စစ်ပြီး')}</span></div><span>{l('Continue setup','Setup ဆက်လုပ်ရန်')} ↗</span></Link>;
}
