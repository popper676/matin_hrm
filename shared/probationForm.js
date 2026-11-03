export const COMPETENCIES = [
 ['knowledge','Job knowledge & skills','အလုပ်ဆိုင်ရာ အသိပညာနှင့် ကျွမ်းကျင်မှု'],
 ['quality','Quality of work','အလုပ်အရည်အသွေး'],['productivity','Productivity & efficiency','လုပ်ဆောင်နိုင်မှုနှင့် ထိရောက်မှု'],
 ['communication','Communication skills','ဆက်သွယ်ပြောဆိုမှု'],['teamwork','Teamwork & collaboration','အသင်းအဖွဲ့နှင့် ပူးပေါင်းလုပ်ဆောင်မှု'],
 ['initiative','Problem solving & initiative','ပြဿနာဖြေရှင်းမှုနှင့် ကိုယ်တိုင်စတင်လုပ်ဆောင်မှု'],['adaptability','Adaptability & learning','လိုက်လျောညီထွေမှုနှင့် သင်ယူမှု'],
 ['time','Time management','အချိန်စီမံခန့်ခွဲမှု'],['stakeholders','Customer / stakeholder focus','ဖောက်သည်နှင့် သက်ဆိုင်သူများကို အလေးထားမှု'],['conduct','Professional conduct & ethics','လုပ်ငန်းကျင့်ဝတ်နှင့် ပြုမူဆောင်ရွက်မှု'],
];
export const RATINGS = ['Unsatisfactory','Needs Improvement','Satisfactory','Good','Excellent'];
export const ATTENDANCE_FIELDS = [['working','Total working days','အလုပ်လုပ်ရက် စုစုပေါင်း'],['present','Days present','အလုပ်တက်ရက်'],['absent','Days absent','ပျက်ကွက်ရက်'],['late','Late arrivals','နောက်ကျသည့်အကြိမ်'],['early','Early departures','စောပြန်သည့်အကြိမ်'],['unexcused','Unexcused absences','ခွင့်မဲ့ပျက်ကွက်ရက်']];
export const TEXT_FIELDS = [
 ['training_completed','Training completed','ပြီးဆုံးသည့် သင်တန်းများ'],['training_progress','Training in progress','တက်နေဆဲ သင်တန်းများ'],['training_required','Training still required','ထပ်မံလိုအပ်သည့် သင်တန်းများ'],['development_needs','Additional development needs','ထပ်မံဖွံ့ဖြိုးရန် လိုအပ်ချက်များ'],
 ['strengths','Key strengths','အားသာချက်များ'],['improvements','Areas for improvement','တိုးတက်ရန် လိုအပ်သည့်အပိုင်းများ'],['summary','Manager overall summary','Manager ၏ အနှစ်ချုပ်သုံးသပ်ချက်'],
 ['reason','Reason for extension / termination','သက်တမ်းတိုး / အလုပ်ရပ်စဲရန် အကြောင်းရင်း'],['conditions','Conditions for extension','သက်တမ်းတိုးသည့် သတ်မှတ်ချက်များ'],['new_goals','New goals for extension','သက်တမ်းတိုးကာလအတွက် ရည်မှန်းချက်အသစ်များ'],['late_reason','Reason for missing the two-week deadline','၂ ပတ်ကြိုတင် သတ်မှတ်ရက် လွဲချော်ရသည့်အကြောင်း'],
];
export const SELF_QUESTIONS = [['performance','How do you feel about your performance?','သင့်လုပ်ဆောင်ရည်အပေါ် ဘယ်လိုမြင်ပါသလဲ။'],['challenges','What challenges have you faced?','မည်သည့် အခက်အခဲများ ရှိခဲ့ပါသလဲ။'],['support','What support do you need going forward?','ရှေ့ဆက်ရန် မည်သည့်ပံ့ပိုးမှုများ လိုအပ်ပါသလဲ။']];
export const OUTCOMES = [['confirmed','Confirm employment','အတည်ပြုခန့်အပ်ရန်'],['extended','Extend probation','အစမ်းခန့်ကာလ တိုးရန်'],['terminated','Terminate during probation','အစမ်းခန့်ကာလအတွင်း အလုပ်ရပ်စဲရန်']];
export const PROBATION_NOTES = [
 'Complete the evaluation at least two weeks before probation ends. Late evaluations are visibly flagged and require an explanation.',
 'Give the employee an opportunity to provide self-assessment before the final decision.',
 'Share a copy within five working days of the decision. The finalized copy is released in the employee portal immediately.',
 'Extension cannot exceed half the original period. Six calendar months allow three months; three months allow one calendar month and fifteen days. Custom periods use half their calendar days, rounded down. Further reviews keep the original cap.',
 'Termination requires HR and legal review before communication. HR must record the completed legal review before release.',
 'Confirmed employees receive full benefits from the confirmation date. HR records the approved dates and manages employment/payroll updates separately.',
 'Retain all probation decisions in the personnel record.',
 'The employee may send a written appeal to HR within ten working days of the decision.',
];
export const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function blankProbation(){return {period:'3',original_end:'',attendance:Object.fromEntries(ATTENDANCE_FIELDS.map(([k])=>[k,''])),attendance_rating:'',competencies:Object.fromEntries(COMPETENCIES.map(([k])=>[k,{rating:'',comment:''}])),goals:[],...Object.fromEntries(TEXT_FIELDS.map(([k])=>[k,''])),performance_rating:'',cultural_fit:'',growth:'',recommendation:'',new_end:''};}
export function cleanProbation(body,complete=false){
 const out=blankProbation();
 if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Enter the evaluation details');
 out.period=String(body.period||'3');if(!['3','6','other'].includes(out.period))throw new Error('Choose the original probation period');
 for(const k of ['original_end','new_end']){out[k]=body[k]||'';if(out[k]&&!validDate(out[k]))throw new Error('Enter valid probation dates');}
 for(const [k]of ATTENDANCE_FIELDS){const v=body.attendance?.[k];if(v===''||v==null){if(complete)throw new Error('Complete the attendance counts');continue;}const n=Number(v);if(!Number.isFinite(n)||n<0||n>10000||(k==='late'||k==='early'?n%1!==0:n*2%1!==0))throw new Error('Use nonnegative attendance counts (days may use halves)');out.attendance[k]=n;}
 if(Number(out.attendance.present)+Number(out.attendance.absent)>Number(out.attendance.working)||Number(out.attendance.unexcused)>Number(out.attendance.absent))throw new Error('Attendance totals do not reconcile');
 for(const k of ['attendance_rating','performance_rating','cultural_fit']){out[k]=body[k]===''||body[k]==null?'':Number(body[k]);if(out[k]!==''&&(!Number.isInteger(out[k])||out[k]<1||out[k]>5))throw new Error('Choose a rating from 1 to 5');if(complete&&out[k]==='')throw new Error('Complete the overall ratings');}
 for(const [k]of COMPETENCIES){const v=body.competencies?.[k]||{};const rating=v.rating===''||v.rating==null?'':Number(v.rating);if(rating!==''&&(!Number.isInteger(rating)||rating<1||rating>5))throw new Error('Rate competencies from 1 to 5');if(complete&&rating==='')throw new Error('Rate every competency');if(typeof(v.comment||'')!=='string'||(v.comment||'').length>2000)throw new Error('Competency comment is too long');out.competencies[k]={rating,comment:(v.comment||'').trim()};}
 if(!Array.isArray(body.goals||[])||(body.goals||[]).length>5)throw new Error('Enter up to five probation goals');
 out.goals=(body.goals||[]).map(row=>{const v={};for(const k of ['goal','target','achieved','comment']){if(typeof(row?.[k]||'')!=='string'||(row[k]||'').length>2000)throw new Error('Invalid goal');v[k]=(row[k]||'').trim();}if(!['','Yes','No','Partial'].includes(v.achieved))throw new Error('Choose Yes, No or Partial');if(complete&&(!v.goal||!v.target||!v.achieved))throw new Error('Complete each goal or remove empty rows');return v;});
 for(const [k]of TEXT_FIELDS){if(typeof(body[k]||'')!=='string'||(body[k]||'').length>4000)throw new Error('Evaluation text must be at most 4000 characters per field');out[k]=(body[k]||'').trim();}
 out.growth=body.growth||'';if(!['','High','Moderate','Low'].includes(out.growth))throw new Error('Choose the potential for growth');
 out.recommendation=body.recommendation||'';if(out.recommendation&&!OUTCOMES.some(o=>o[0]===out.recommendation))throw new Error('Choose the recommendation');
 if(complete&&(!out.strengths||!out.improvements||!out.summary||!out.growth||!out.recommendation))throw new Error('Complete the strengths, improvements, summary, growth and recommendation');
 if(complete&&out.recommendation!=='confirmed'&&!out.reason)throw new Error('Explain the extension or termination recommendation');
 if(complete&&out.recommendation==='extended'&&(!out.new_end||!out.new_goals))throw new Error('Enter the extension end date and new goals');
 return out;
}
export function cleanSelf(body){
 if(!['submitted','declined'].includes(body.status))throw new Error('Submit your comments or choose to decline');
 const out={status:body.status};for(const k of [...SELF_QUESTIONS.map(q=>q[0]),'signature']){if(typeof(body[k]||'')!=='string'||(body[k]||'').length>(k==='signature'?250:4000))throw new Error('Invalid self-assessment');out[k]=(body[k]||'').trim();}
 if(!out.signature||body.confirmed!==true)throw new Error('Confirm and sign your response');
 if(out.status==='declined')for(const [k]of SELF_QUESTIONS)out[k]='';
 if(out.status==='submitted'&&!SELF_QUESTIONS.some(([k])=>out[k]))throw new Error('Add your comments or choose to decline');
 return out;
}
