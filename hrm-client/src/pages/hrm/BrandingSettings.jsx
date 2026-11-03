import {useQuery} from '@tanstack/react-query';
import Layout from '../../components/layout/Layout';
import BrandingForm from '../../components/operations/BrandingForm';
import {useWords,LoadingError} from '../../components/operations/OpsUI';
import api from '../../api/client';
import '../../styles/owner-setup.css';
export default function BrandingSettings() {
 const l=useWords(),q=useQuery({queryKey:['owner-branding'],queryFn:()=>api.get('/branding/owner').then(r=>r.data)});
 return <Layout title={l('Branding settings','Branding သတ်မှတ်ချက်များ')}><div className="ops-workspace setup-branding-page"><header className="ops-hero"><div><span className="ops-eyebrow">OWNER · BRANDING</span><h1>{l('One identity across your HR system.','HR System တစ်ခုလုံးအတွက် Brand တစ်ခုတည်း။')}</h1><p>{l('Update the shared name, logo, color and recruitment email templates.','အမည်၊ Logo၊ အရောင်နှင့် Recruitment Email စာသားများကို တစ်နေရာတည်းမှာ ပြင်ပါ။')}</p></div></header><LoadingError query={q}/>{q.data&&<section className="ops-panel"><BrandingForm key={q.data.branding.version} record={q.data.branding}/></section>}</div></Layout>;
}
