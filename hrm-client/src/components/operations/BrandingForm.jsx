import {useEffect,useState} from 'react';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../api/client';
import {useBrand} from '../../context/BrandContext';
import {DEFAULT_BRANDING,BRANDING_FIELDS,cleanBranding,renderInterviewEmail} from '../../../../shared/branding.js';
import {useWords,Field,Check} from './OpsUI';
export default function BrandingForm({record}) {
 const l=useWords(),qc=useQueryClient(),{refreshBrand}=useBrand(),[body,setBody]=useState(()=>Object.fromEntries(BRANDING_FIELDS.map(k=>[k,record.settings[k]??DEFAULT_BRANDING[k]]))),[file,setFile]=useState(null),[remove,setRemove]=useState(false),[preview,setPreview]=useState(''),[error,setError]=useState('');
 const change=(key,value)=>setBody(v=>({...v,[key]:value}));
 useEffect(()=>{if(!file){setPreview('');return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
 const save=useMutation({mutationFn:()=>{const fd=new FormData();fd.append('settings',JSON.stringify(cleanBranding(body)));fd.append('version',record.version);fd.append('remove_logo',String(remove));if(file)fd.append('logo',file);return api.put('/branding',fd,{headers:{'Content-Type':undefined}});},onSuccess:async()=>{
  await Promise.all([refreshBrand(),qc.invalidateQueries({queryKey:['owner-branding']}),qc.invalidateQueries({queryKey:['owner-setup']})]);setFile(null);setRemove(false);toast.success(l('Branding saved','Branding သိမ်းပြီးပါပြီ'));
 },onError:err=>setError(err.response?.data?.error||err.message)});
 const logo=preview||(remove?'/logo.svg':record.settings.logo?'/api/branding/logo/'+record.settings.logo.id:'/logo.svg'),email=renderInterviewEmail(body,{candidate:'Demo Candidate',position:'Team member',meeting_details:'Date: 10 November 2026\nTime: 10:00 AM (Bangkok)\nLocation: Your office / meeting link'});
 return <form className="ops-form setup-brand-form" data-version={record.version} onSubmit={event=>{event.preventDefault();setError('');save.mutate();}}>
  <div className="setup-brand-preview" style={{borderTopColor:body.accent}}><img src={logo} alt={body.name+' preview'}/><div><strong>{body.name||l('Company name','ကုမ္ပဏီအမည်')}</strong><span>{body.tagline}</span></div></div>
  <fieldset disabled={save.isPending} className="setup-brand-fields">
   <div className="ops-form-grid"><Field required maxLength={80} label={l('Company / brand name','ကုမ္ပဏီ / Brand အမည်')} value={body.name} onChange={v=>change('name',v)}/><Field maxLength={80} label={l('Tagline','Brand စာတန်း')} value={body.tagline} onChange={v=>change('tagline',v)}/><Field required type="color" label={l('Primary brand color','Brand အဓိကအရောင်')} value={body.accent} onChange={v=>change('accent',v)}/><Field type="url" maxLength={300} label={l('Public website URL (optional)','Public Website URL (လိုအပ်မှ)')} value={body.website_url} onChange={v=>change('website_url',v)}/></div>
   <p className="ops-footnote">{l('A public website URL lets recruitment emails display your uploaded logo. You can leave it blank during local setup.','Public Website URL ထည့်ထားလျှင် Recruitment Email တွင် တင်ထားသော Logo ကို ပြနိုင်သည်။ Local Setup လုပ်နေစဉ် အလွတ်ထားနိုင်သည်။')}</p>
   <label className="ops-field">{l('Upload logo (PNG/JPEG)','Logo တင်ရန် (PNG/JPEG)')}<input type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" onChange={event=>{const next=event.target.files?.[0];if(next&&next.size>2097152){setError(l('Logo must be at most 2 MB.','Logo သည် 2 MB ထက် မကျော်ရပါ။'));event.target.value='';return;}setFile(next||null);setRemove(false);}}/><small>{l('Up to 2 MB and 4096 × 4096 pixels. Transparent PNG is supported.','2 MB နှင့် 4096 × 4096 pixels အထိ။ နောက်ခံအလွတ် PNG သုံးနိုင်သည်။')}</small></label>
   {record.settings.logo&&<Check label={l('Restore the default logo','မူလ Logo ပြန်သုံးရန်')} value={remove} onChange={v=>{setRemove(v);setFile(null);}}/>}
   <details className="setup-email-editor"><summary>{l('Recruitment email wording','Recruitment Email စာသား')}</summary><p>{l('Edit the wording using the shown variables. Previewing and saving do not send email.','ပြထားသော Variable များသုံးပြီး စာသား ပြင်နိုင်သည်။ Preview ကြည့်ခြင်း၊ သိမ်းခြင်းဖြင့် Email မပို့ပါ။')}</p>
    <Field required maxLength={180} label={l('Interview email subject','Interview Email ခေါင်းစဉ်')} value={body.interview_subject} onChange={v=>change('interview_subject',v)}/>
    <Field required area maxLength={6000} label={l('Interview email body','Interview Email စာသား')} value={body.interview_body} onChange={v=>change('interview_body',v)}/>
    <Field required area maxLength={500} label={l('Email signature','Email နိဂုံးစာသား')} value={body.email_signature} onChange={v=>change('email_signature',v)}/>
    <p className="ops-footnote">{'{{company}} · {{tagline}} · {{candidate}} · {{position}} · {{meeting_details}} · {{signature}}'}</p>
    <div className="setup-email-preview"><span className="ops-eyebrow">{l('Preview only','ကြိုတင်ကြည့်ရန်သာ')}</span><h3>{email.subject}</h3><pre>{email.text}</pre></div>
   </details>
  </fieldset>
  {error&&<p className="ops-error" role="alert">{error}</p>}
  <button className="ux-button ux-button-primary" disabled={save.isPending}>{l(save.isPending?'Saving…':'Save branding',save.isPending?'သိမ်းနေသည်…':'Branding သိမ်းရန်')}</button>
 </form>;
}
