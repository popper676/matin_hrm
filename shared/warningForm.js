export const WARNING_LEVELS = [['first','First warning','ပထမအကြိမ် သတိပေးစာ'],['second','Second warning','ဒုတိယအကြိမ် သတိပေးစာ'],['final','Final warning','နောက်ဆုံး သတိပေးစာ']];
export const WARNING_CATEGORIES = [
 ['attendance','Attendance / punctuality','အလုပ်တက်မှု / အချိန်မှန်မှု'],
 ['performance','Poor performance / failure to meet expectations','မျှော်မှန်းလုပ်ဆောင်ရည် မပြည့်မီမှု'],
 ['policy','Violation of company policy / SOP','ကုမ္ပဏီမူဝါဒ / SOP ချိုးဖောက်မှု'],
 ['instructions','Insubordination / failure to follow instructions','အမိန့်မနာခံမှု / ညွှန်ကြားချက် မလိုက်နာမှု'],
 ['conduct','Misconduct / workplace behavior','လုပ်ငန်းခွင် ပြုမူဆက်ဆံမှု'],
 ['negligence','Negligence / carelessness','ပေါ့ဆမှု'],
 ['safety','Health, safety or security violation','ကျန်းမာရေး / ဘေးကင်းရေး / လုံခြုံရေး ချိုးဖောက်မှု'],
 ['other','Other','အခြား'],
];
export const WARNING_ACTIONS = [
 ['correct','Correct the identified behavior / violation immediately.','ဖော်ပြထားသည့် အပြုအမူ / ချိုးဖောက်မှုကို ချက်ချင်းပြုပြင်ရန်။'],
 ['policies','Follow applicable company policies, procedures and SOPs.','သက်ဆိုင်ရာ ကုမ္ပဏီမူဝါဒ၊ လုပ်ထုံးလုပ်နည်းနှင့် SOP များ လိုက်နာရန်။'],
 ['standards','Meet required performance, attendance and conduct standards.','လုပ်ဆောင်ရည်၊ အလုပ်တက်မှုနှင့် အပြုအမူ စံနှုန်းများ ပြည့်မီရန်။'],
 ['training','Complete coaching or training, if required.','လိုအပ်ပါက လမ်းညွှန်မှု / သင်တန်း ပြီးမြောက်ရန်။'],
];
export const WARNING_PREVIOUS = [['none','No previous action','ယခင်အရေးယူမှု မရှိ'],['verbal','Verbal counseling','နှုတ်ဖြင့် ဆွေးနွေးသတိပေးမှု'],['written','Written warning','စာဖြင့် သတိပေးမှု'],['other','Other','အခြား']];
export const WARNING_TEXT = [['location','Incident location','ဖြစ်ပွားသည့် နေရာ'],['description','Description of incident / violation','ဖြစ်စဉ် / ချိုးဖောက်မှု အသေးစိတ်'],['policy','Policy / rule / SOP violated','ချိုးဖောက်သည့် မူဝါဒ / စည်းမျဉ်း / SOP'],['other_category','Other category details','အခြားအမျိုးအစား အသေးစိတ်'],['previous_details','Previous action details / date','ယခင်အရေးယူမှု အသေးစိတ် / ရက်စွဲ'],['corrective_other','Other corrective action / specific expectations','အခြား ပြုပြင်ဆောင်ရွက်မှု / တိကျသည့် မျှော်မှန်းချက်များ']];
export const WARNING_NOTICE = 'You are expected to demonstrate immediate and sustained improvement. Any further violation of company policies, failure to meet required standards, or similar misconduct may result in further disciplinary action, up to and including termination of employment, subject to applicable company policy and law.';
export const WARNING_ACK = 'I acknowledge that this warning has been explained to me and that I have had an opportunity to provide my comments or explanation. My signature confirms receipt of this Warning Letter and does not necessarily mean that I agree with its contents. I understand the corrective actions and expectations stated above.';
export const warningToday=()=>new Date(Date.now()+7*3600000).toISOString().slice(0,10);
export const warningDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function blankWarning(){return {letter_date:warningToday(),level:'',incident_date:'',incident_time:'',target_date:'',categories:[],actions:[],previous_action:'none',...Object.fromEntries(WARNING_TEXT.map(([k])=>[k,'']))};}
export function cleanWarning(body,complete=false){
 if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Enter the warning details');
 const out=blankWarning();
 for(const [k]of WARNING_TEXT){if(typeof(body[k]??'')!=='string'||(body[k]||'').length>6000)throw new Error('Warning text must be at most 6000 characters per field');out[k]=(body[k]||'').trim();}
 for(const k of ['letter_date','incident_date','target_date']){out[k]=body[k]||'';if(out[k]&&!warningDate(out[k]))throw new Error('Enter valid warning dates');}
 out.incident_time=body.incident_time||'';if(typeof out.incident_time!=='string'||(out.incident_time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(out.incident_time)))throw new Error('Enter a valid incident time');
 for(const [k,options]of [['categories',WARNING_CATEGORIES],['actions',WARNING_ACTIONS]]){if(!Array.isArray(body[k])||body[k].some(v=>!options.some(o=>o[0]===v)))throw new Error('Choose valid warning categories and corrective actions');out[k]=[...new Set(body[k])];}
 out.level=body.level||'';if(out.level&&!WARNING_LEVELS.some(v=>v[0]===out.level))throw new Error('Choose a warning level');
 out.previous_action=body.previous_action||'none';if(!WARNING_PREVIOUS.some(v=>v[0]===out.previous_action))throw new Error('Choose the previous action');
 if(!out.categories.includes('other'))out.other_category='';if(out.previous_action==='none')out.previous_details='';
 if(complete){
  if(!out.level||!out.letter_date||!out.incident_date||!out.description||!out.policy||!out.location||!out.target_date||!out.categories.length)throw new Error('Complete the warning level, dates, incident, policy, category and review date');
  if(out.letter_date>warningToday()||out.incident_date>out.letter_date||out.target_date<out.letter_date)throw new Error('Incident must be on/before the letter date; review must be on/after it; the letter cannot be future-dated');
  if(out.categories.includes('other')&&!out.other_category)throw new Error('Describe the other category');
  if(out.previous_action!=='none'&&!out.previous_details)throw new Error('Describe the previous action and date');
  if(!out.actions.length&&!out.corrective_other)throw new Error('Choose or describe a corrective action');
 }
 return out;
}
export function cleanWarningResponse(body){
 const out={acknowledged:body?.acknowledged===true,explained:body?.explained===true,opportunity:body?.opportunity===true};
 for(const k of ['comments','signature']){if(typeof(body?.[k]??'')!=='string'||(body?.[k]||'').length>(k==='signature'?250:6000))throw new Error('Invalid employee response');out[k]=(body?.[k]||'').trim();}
 if(!out.comments&&!out.acknowledged)throw new Error('Add comments or confirm receipt');
 if(out.acknowledged&&(!out.explained||!out.opportunity||!out.signature))throw new Error('Confirm the explanation, opportunity to comment and sign receipt');
 return out;
}
