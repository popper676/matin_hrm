import {useEffect,useState} from 'react';
import {useLanguage} from '../../context/LanguageContext';
import api from '../../api/client';
export default function DemoNotice(){
 const {language}=useLanguage(),[active,setActive]=useState(false);
 useEffect(()=>{let mounted=true;const read=()=>api.get('/demo/status').then(({data})=>{if(mounted)setActive(data.active===true);}).catch(()=>{});read();window.addEventListener('focus',read);const timer=setInterval(read,60000);return()=>{mounted=false;clearInterval(timer);window.removeEventListener('focus',read);};},[]);
 if(!active)return null;
 return <aside className="demo-notice" aria-label="Demo mode"><strong>DEMO</strong><span>{language==='my'?'သရုပ်ပြစနစ် ဖြစ်ပါသည်။ အသစ်ထည့်သော HR data နှင့် accounts များကို demo ရှင်းသည့်အခါ ဖျက်မည်။ Owner accounts များ ကျန်ရှိမည်။':'Presentation mode. New HR records and accounts are included in demo cleanup. Owner accounts are preserved.'}</span></aside>;
}
