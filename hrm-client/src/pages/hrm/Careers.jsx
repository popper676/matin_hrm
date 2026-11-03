import {BrandText} from '../../components/common/Brand';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import Brand from '../../components/common/Brand';
import Icon from '../../components/common/Icon';
import JobOpeningDetails from '../../components/recruitment/JobOpeningDetails';
import { useLanguage } from '../../context/LanguageContext';
const publicApi=axios.create({baseURL:'/api/public'});
const empty={candidate_name:'',email:'',phone:'',cover_letter:'',resume:null};
export default function Careers(){
 const {t,language,setLanguage}=useLanguage(),r=key=>t(`common.recruitmentUpgrade.${key}`),qc=useQueryClient();
 const [params,setParams]=useSearchParams(),[form,setForm]=useState(empty),[submitted,setSubmitted]=useState(false);
 const {data:jobs=[],isLoading,error,refetch}=useQuery({queryKey:['public-jobs'],queryFn:()=>publicApi.get('/jobs').then(r=>r.data.jobs),retry:false});
 const selectedJob=jobs.find(j=>j.id===params.get('opening'));
 const apply=useMutation({mutationFn:body=>publicApi.post('/apply',body).then(r=>r.data),onSuccess:()=>{setSubmitted(true);setParams({});setForm(empty);window.scrollTo({top:0,behavior:'instant'});},onError:e=>{toast.error(e.response?.data?.error||r('publicError'));if(e.response?.status===409)qc.invalidateQueries({queryKey:['public-jobs']});}});
 function choose(job){setForm(empty);setParams({opening:job.id});setSubmitted(false);window.scrollTo({top:0,behavior:'instant'});}
 function submit(event){event.preventDefault();const fd=new FormData();fd.append('opening_id',selectedJob.id);for(const key of ['candidate_name','email','phone','cover_letter'])fd.append(key,form[key]);fd.append('language',language);if(form.resume)fd.append('resume',form.resume);apply.mutate(fd);}
 function fileChanged(event){const file=event.target.files[0];if(file&&(file.size>10485760||!(/\.(pdf|docx|txt)$/i.test(file.name)))){toast.error(r('uploadHint'));event.target.value='';setForm(f=>({...f,resume:null}));return;}setForm(f=>({...f,resume:file||null}));}
 const field=(key,label,type='text',required=false)=><label className="job-field"><span>{r(label)}{required?' *':''}</span><input type={type} required={required} maxLength={key==='candidate_name'?200:key==='email'?254:100} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}/></label>;
 return <div className="uyf-app uyf-standalone careers-shell"><header className="careers-topbar"><Brand/><div><button onClick={()=>setLanguage(language==='my'?'en':'my')} aria-label="Change language">{language==='my'?'English':'မြန်မာ'}</button><a href="/login">{r('employeeLogin')}</a></div></header><main className="careers-main">
  <div className="careers-intro"><span className="job-eyebrow"><BrandText caption/></span><h1>{r('joinTeam')}</h1><p>{r('careersIntro')}</p></div>
  {submitted&&<section className="careers-success" role="status"><h2>{r('submittedTitle')}</h2><p>{r('submittedHint')}</p></section>}
  {error?<div className="job-notice" role="alert"><p>{r('publicError')}</p><button className="ux-button ux-button-secondary" onClick={()=>refetch()}>{r('retry')}</button></div>:isLoading?<p role="status">{r('loading')}</p>:selectedJob?<section className="careers-detail"><button className="job-text-button" disabled={apply.isPending} onClick={()=>setParams({})}>← {r('backJobs')}</button><JobOpeningDetails job={selectedJob}/><form className="careers-apply" onSubmit={submit}><h3>{r('applyForRole')}</h3><fieldset disabled={apply.isPending}><div className="job-field-grid">{field('candidate_name','fullName','text',true)}{field('email','email','email',true)}{field('phone','phone','tel')}<label className="job-field"><span>{r('resume')}</span><input type="file" accept=".pdf,.docx,.txt" onChange={fileChanged}/><small>PDF, DOCX, TXT · 10 MB</small></label><label className="job-field job-field-wide"><span>{r('coverLetter')}</span><textarea rows={5} maxLength={15000} value={form.cover_letter} onChange={e=>setForm(f=>({...f,cover_letter:e.target.value}))}/></label></div><button className="ux-button ux-button-primary" disabled={apply.isPending} type="submit">{r(apply.isPending?'submitting':'submitApplication')}<Icon name="arrowRight" size={16}/></button></fieldset></form></section>:<>
   {params.get('opening')&&<p className="job-notice">{r('openingUnavailable')}</p>}
   {!jobs.length?<div className="job-empty"><Icon name="recruitment" size={30}/><h3>{r('noPublicJobs')}</h3><p>{r('checkBack')}</p></div>:<div className="job-card-grid">{jobs.map(job=><article className="job-card" key={job.id}><header><span className="job-status job-status-published">{job.department||job.work_mode}</span><small>{job.employment_type}</small></header><h3>{job.title}</h3><p>{[job.work_mode,job.location].filter(Boolean).join(' · ')}</p><p className="job-card-description">{job.job_description}</p><footer><button className="ux-button ux-button-primary" onClick={()=>choose(job)}>{r('viewAndApply')}<Icon name="arrowRight" size={15}/></button></footer></article>)}</div>}
  </>}
 </main></div>;
}
