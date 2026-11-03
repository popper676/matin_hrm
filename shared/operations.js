export const OPERATIONS_DEFAULTS = Object.freeze({enabled:false,due_soon_days:7,expiry_lead_days:30,approval_after_days:2,repeat_days:3});
export const todayBangkok=()=>new Date(Date.now()+7*3600000).toISOString().slice(0,10);
export const validDay=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export const validMonth=v=>typeof v==='string'&&/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(v);
export const addDays=(day,n)=>new Date(Date.parse(day)+n*86400000).toISOString().slice(0,10);
export const daysBetween=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/86400000);
export const monthEnd=month=>new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
export const previousMonth=month=>new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7))-2,1)).toISOString().slice(0,7);
export function probationEnd(hire,period){
 if(!validDay(hire)||!/^\s*(3|6)(?:\s*months?)?\s*$/i.test(period||''))return null;
 const n=Number(period.match(/[36]/)[0]),date=new Date(hire+'T00:00:00Z'),day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+n);date.setUTCDate(Math.min(day,new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate()));return addDays(date.toISOString().slice(0,10),-1);
}
export function cleanOperationsSettings(body){
 if(typeof body?.enabled!=='boolean')throw new Error('Choose whether reminders are enabled');const out={enabled:body.enabled};
 for(const [key,min,max]of [['due_soon_days',1,60],['expiry_lead_days',1,180],['approval_after_days',1,30],['repeat_days',1,30]]){const n=Number(body[key]);if(!Number.isInteger(n)||n<min||n>max)throw new Error('Enter valid reminder windows');out[key]=n;}return out;
}
export function cleanBusiness(body){
 const out={key:String(body?.key||'').trim().toUpperCase(),name:String(body?.name||'').trim(),name_my:String(body?.name_my||'').trim(),color:body?.color||'#dd123d',is_active:body?.is_active===true};
 if(!/^[A-Z][A-Z0-9_]{1,31}$/.test(out.key)||!out.name||out.name.length>80||out.name_my.length>120||!/^#[0-9a-fA-F]{6}$/.test(out.color))throw new Error('Enter a business code, name and valid color');return out;
}
export function cleanAssignments(body){
 if(!validDay(body?.effective_from)||!Array.isArray(body.items)||body.items.length>20||!Number.isInteger(body.version))throw new Error('Enter the effective date and current assignment version');
 const seen=new Set(),items=body.items.map(v=>{const key=String(v?.business_key||'');if(!/^[A-Z][A-Z0-9_]{1,31}$/.test(key)||seen.has(key))throw new Error('Choose each business once');seen.add(key);const role=String(v.role||'').trim();if(role.length>120)throw new Error('Business role is too long');let pct=null;if(v.allocation_percent!==''&&v.allocation_percent!=null){const s=String(v.allocation_percent);if(!/^\d{1,3}(\.\d{1,2})?$/.test(s)||Number(s)<0||Number(s)>100)throw new Error('Use allocation percentages between 0 and 100');pct=Number(s);}return {business_key:key,role,allocation_percent:pct};});
 if(items.some(v=>v.allocation_percent!==null)&&(items.some(v=>v.allocation_percent===null)||items.reduce((s,v)=>s+Math.round(v.allocation_percent*100),0)!==10000))throw new Error('Set every cost share to total exactly 100%, or leave every share blank');
 const note=String(body.note||'').trim();if(note.length>2000)throw new Error('Assignment note is too long');return {effective_from:body.effective_from,items,note,version:body.version};
}
export function assignmentAt(sets,employee,date){return sets.filter(s=>s.employee_id===employee&&s.effective_from<=date).sort((a,b)=>b.effective_from.localeCompare(a.effective_from)||b.version-a.version)[0]||null;}
export function cents(value){
 const s=String(value??0);if(!/^-?\d{1,12}(\.\d{1,2})?$/.test(s))throw new Error('A stored amount is invalid for a two-decimal financial review');const negative=s[0]==='-',[whole,decimal='']=s.replace('-','').split('.');return (negative?-1:1)*(Number(whole)*100+Number(decimal.padEnd(2,'0')));
}
export const moneyValue=n=>Number((n/100).toFixed(2));
export function allocateCents(total,items){
 if(!items?.length||items.some(v=>v.allocation_percent==null))return [{business_key:'UNALLOCATED',cents:total}];
 const shares=items.map(v=>({...v,bps:Math.round(Number(v.allocation_percent)*100)}));if(shares.reduce((s,v)=>s+v.bps,0)!==10000)throw new Error('Stored business shares do not total 100%');
 const amount=BigInt(Math.abs(total)),rows=shares.map(v=>({business_key:v.business_key,cents:Number(amount*BigInt(v.bps)/10000n),remainder:Number(amount*BigInt(v.bps)%10000n)}));
 let remainder=Math.abs(total)-rows.reduce((s,v)=>s+v.cents,0);rows.sort((a,b)=>b.remainder-a.remainder||a.business_key.localeCompare(b.business_key));for(let i=0;i<remainder;i++)rows[i%rows.length].cents++;
 return rows.sort((a,b)=>a.business_key.localeCompare(b.business_key)).map(v=>({business_key:v.business_key,cents:total<0?-v.cents:v.cents}));
}
