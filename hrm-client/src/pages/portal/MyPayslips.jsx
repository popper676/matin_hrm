import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../api/client';
import Layout from '../../components/layout/Layout';
import {useLanguage} from '../../context/LanguageContext';
import {salaryStatement,SALARY_COLUMNS} from '../../../../shared/salaryTemplate.js';
import {downloadPayslip} from '../../utils/payslipDownload';
import '../../styles/salary.css';
export default function MyPayslips() {
 const {language}=useLanguage(),my=language==='my',l=(en,mm)=>my?mm:en,[downloading,setDownloading]=useState(null);
 const query=useQuery({queryKey:['portal_data'],queryFn:()=>api.get('/portal').then(r=>r.data)});
 const download=async p=>{setDownloading(p.id);try{await downloadPayslip(p.id,p.month);toast.success(l('Payslip downloaded','လစာစာရွက် ရယူပြီးပါပြီ'));}catch(e){toast.error(e.message);}finally{setDownloading(null);}};
 return <Layout title={l('My Payslips','မိမိလစာစာရွက်များ')} subtitle={l('Saved salary breakdown and payment status','သိမ်းထားသော လစာအသေးစိတ်နှင့် ပေးချေမှုအခြေအနေ')}>
  {query.isLoading&&<p role="status">{l('Loading payslips…','လစာစာရွက်များ ဖတ်နေသည်…')}</p>}
  {query.error&&<p role="alert" className="salary-error">{query.error.response?.data?.error||query.error.message}</p>}
  {!query.isLoading&&!query.error&&!query.data?.payslips?.length&&<p className="salary-empty">{l('No payslips available yet.','လစာစာရွက် မရှိသေးပါ။')}</p>}
  {(query.data?.payslips||[]).map(p=>{const s=salaryStatement(p,query.data.emp||{}),fields=s.legacy?[['basic_salary','Basic Salary'],['allowances','Allowances'],['bonus','Bonus'],['gross_salary','Gross Salary'],['total_deduction','Total Deduction']]:SALARY_COLUMNS.slice(4,-1);return <article className="salary-payslip" key={p.id}><header><div><h2>{p.month}</h2><p>{p.payment_status} · <strong>{l('Net Salary','ရရှိမည့်လစာ')}: {Number(s.net_salary).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})} THB</strong></p></div><button className="salary-button" disabled={!!downloading} onClick={()=>download(p)}>{downloading===p.id?l('Downloading…','ရယူနေသည်…'):l('Download PDF','PDF ရယူရန်')}</button></header><dl>{fields.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{Number(s[key]??0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}{['attendance_days','unpaid_leave_days'].includes(key)?' days':key==='ot_hours'?' hours':' THB'}</dd></div>)}</dl>{!s.legacy&&<p className="salary-period">{l('Employer SSB is not deducted from your salary. Unpaid leave is deducted once in Total Deduction.','အလုပ်ရှင် SSB ကို မိမိလစာမှ မနုတ်ပါ။ လစာမဲ့ခွင့်ကို စုစုပေါင်းနုတ်ငွေတွင် တစ်ကြိမ်သာ နုတ်ထားပါသည်။')}</p>}</article>;})}
 </Layout>;
}
