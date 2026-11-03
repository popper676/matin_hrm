import {useState} from 'react';
import {Link} from 'react-router-dom';
import guides from '../../../../shared/systemGuides.json';
import {pageAllowed} from '../../../../shared/accessPolicy.js';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import Icon from '../common/Icon';
export default function SystemGuide(){
 const {user}=useAuth(),{language}=useLanguage(),l=(en,my)=>language==='my'?my:en;
 const [selected,setSelected]=useState(()=>user?.is_owner?'owner':'employee'),[search,setSearch]=useState('');
 const role=user?.is_owner?selected:'employee',q=search.trim().toLowerCase(),topics=guides[role].filter(t=>!q||[t.title[language],...t.steps[language]].join(' ').toLowerCase().includes(q));
 return <section id="getting-started" className="completion-guide" aria-labelledby="system-guide-title"><header className="completion-section-heading"><span className="completion-symbol"><Icon name="documents" size={23}/></span><div><span className="completion-eyebrow">{l('WORKSPACE GUIDE','အသုံးပြု လမ်းညွှန်')}</span><h2 id="system-guide-title">{l('A clear next step, for everyone.','လူတိုင်းအတွက် ရှင်းလင်းသော နောက်တစ်ဆင့်။')}</h2><p>{l('Start with the built-in guides below. Your company’s editable policies and articles remain in the knowledge base.','အောက်ပါ အသုံးပြုလမ်းညွှန်မှ စတင်ပါ။ ကုမ္ပဏီ၏ ကိုယ်ပိုင်စည်းမျဉ်းနှင့် ပြင်ဆင်နိုင်သော စာတမ်းများကို Knowledge base တွင် ဆက်သုံးနိုင်သည်။')}</p></div></header>
  <div className="guide-tabs" role="group" aria-label={l('Guide audience','အသုံးပြုသူအမျိုးအစား')}>{(user?.is_owner?['owner','employee']:['employee']).map(key=><button type="button" aria-pressed={role===key} key={key} onClick={()=>{setSelected(key);setSearch('');}}>{key==='owner'?l('Owner guide','Owner လမ်းညွှန်'):l('Employee guide','ဝန်ထမ်း လမ်းညွှန်')}</button>)}<a className="ux-button ux-button-secondary" download href={'/guides/'+role.toUpperCase()+'_GUIDE_'+language.toUpperCase()+'.md'}><Icon name="download" size={16}/>{l('Download guide','လမ်းညွှန် ဒေါင်းလုဒ်')}</a></div>
  <label className="guide-search-label">{l('Find a task','လုပ်ဆောင်ချက် ရှာရန်')}<input aria-label="Search operating guide" value={search} onChange={e=>setSearch(e.target.value)} className="form-input" placeholder={l('Try salary, expenses or leave…','လစာ၊ အသုံးစရိတ် သို့မဟုတ် ခွင့်…')}/></label>
  <div className="guide-layout">{topics.map(topic=><details className="guide-topic" key={role+topic.id}><summary><span><Icon name={topic.icon} size={17}/> {topic.title[language]}</span><Icon name="plus" size={16}/></summary><div className="guide-topic-body"><ol>{topic.steps[language].map((step,i)=><li key={i}>{step}</li>)}</ol>{pageAllowed(user,topic.href)&&<Link to={topic.href}>{l('Open this app','သက်ဆိုင်ရာ App ဖွင့်ရန်')}<Icon name="arrowRight" size={15}/></Link>}</div></details>)}</div>
  {!topics.length&&<p role="status" className="routing-caption">{l('No guide matches this search. Try another term.','ရှာထားသော အကြောင်းအရာ မတွေ့ပါ။ အခြားစကားလုံးဖြင့် ရှာပါ။')}</p>}
  <p className="guide-footer">{l('Visible apps and actions depend on the Owner’s current permissions. These guides explain the implemented workflow; your real business limits, people and entitlements are configured in Owner setup.','မြင်ရသော App နှင့် လုပ်ဆောင်ခွင့်များသည် Owner ၏ လက်ရှိသတ်မှတ်ချက်အပေါ် မူတည်သည်။ ဤလမ်းညွှန်က စနစ်လုပ်ဆောင်ပုံကို ရှင်းပြသည်။ တကယ့်လုပ်ငန်းပမာဏ၊ တာဝန်ယူသူနှင့် ခွင့်ရက်များကို Owner setup မှ သတ်မှတ်ရမည်။')}</p>
 </section>;
}
