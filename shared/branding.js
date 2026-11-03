export const DEFAULT_BRANDING = Object.freeze({
  name: 'Unlock Your Future', tagline: 'People & HR', accent: '#d21d3c', website_url: '',
  interview_subject: 'Interview invitation — {{position}} at {{company}}',
  interview_body: 'Dear {{candidate}},\n\nYou are invited to interview for {{position}} at {{company}}.\n\n{{meeting_details}}\n\nPlease reply if you need to reschedule or ask a question.\n\n{{signature}}',
  email_signature: 'Human Resources\n{{company}}', logo: null,
});
export const BRANDING_FIELDS = ['name','tagline','accent','website_url','interview_subject','interview_body','email_signature'];
const TOKENS = {interview_subject:['company','position','candidate'],interview_body:['company','position','candidate','meeting_details','signature','tagline'],email_signature:['company','tagline']};
function template(value, field, required) {
  for (const match of value.matchAll(/{{([^{}]+)}}/g)) if (!TOKENS[field].includes(match[1])) throw new Error('Unknown template variable: '+match[1]);
  if (/[{}]/.test(value.replace(/{{[^{}]+}}/g,''))) throw new Error('Use template variables in double braces');
  for (const key of required) if (!value.includes('{{'+key+'}}')) throw new Error(field+' needs {{'+key+'}}');
}
export function cleanBranding(input) {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw new Error('Enter branding settings');
  const out={},limits={name:80,tagline:80,accent:7,website_url:300,interview_subject:180,interview_body:6000,email_signature:500};
  for (const key of BRANDING_FIELDS) {
    if (typeof input[key]!=='string') throw new Error('Complete '+key);
    out[key]=input[key].trim();
    if (out[key].length>limits[key] || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(out[key])) throw new Error('Invalid '+key);
  }
  if (out.name.length<2 || /[\r\n]/.test(out.name+out.tagline+out.interview_subject)) throw new Error('Company name, tagline and email subject must use one line');
  if (!/^#[0-9a-fA-F]{6}$/.test(out.accent)) throw new Error('Choose a six-digit brand color');
  if (out.website_url) {
    let url;try {url=new URL(out.website_url);} catch {throw new Error('Enter a valid public website URL');}
    if (url.username || url.password || url.search || url.hash || (url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname)))) throw new Error('Use HTTPS for your public website, or HTTP localhost for local setup');
    out.website_url=url.href.replace(/\/$/,'');
  }
  template(out.interview_subject,'interview_subject',['company','position']);
  template(out.interview_body,'interview_body',['candidate','position','meeting_details','signature']);
  template(out.email_signature,'email_signature',['company']);
  return out;
}
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export const brandFileStem=name=>String(name).replace(/[^\p{L}\p{N}_-]+/gu,'_').replace(/^_+|_+$/g,'').slice(0,80)||'UYF';
export function renderInterviewEmail(settings, values) {
  const b={...DEFAULT_BRANDING,...settings},data={company:b.name,tagline:b.tagline,candidate:String(values.candidate||''),position:String(values.position||''),meeting_details:String(values.meeting_details||'')};
  const fill=s=>s.replace(/{{(\w+)}}/g,(_m,k)=>data[k]??'');
  data.signature=fill(b.email_signature);
  const subject=fill(b.interview_subject).replace(/[\r\n\u0000-\u001f\u007f]/g,' '),text=fill(b.interview_body);
  const image=b.logo?.id&&b.website_url?'<img alt="'+escapeHtml(b.name)+'" width="48" height="48" style="object-fit:contain" src="'+escapeHtml(b.website_url+'/api/branding/logo/'+b.logo.id)+'">':'';
  const html='<div style="font-family:Arial,sans-serif;line-height:1.7;color:#192134;max-width:640px;margin:auto"><header style="padding:24px 0;border-bottom:3px solid '+b.accent+'">'+image+'<h2 style="margin:8px 0">'+escapeHtml(b.name)+'</h2><p>'+escapeHtml(b.tagline)+'</p></header><div style="padding:24px 0;white-space:pre-wrap">'+escapeHtml(text)+'</div></div>';
  return {subject,text,html};
}
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const hex=channels=>'#'+channels.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
const blend=(a,b,t)=>a.map((v,i)=>v*(1-t)+b[i]*t);
const lum=a=>a.map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
export const contrastRatio=(a,b)=>{const x=lum(rgb(a)),y=lum(rgb(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
export function brandPalette(color, dark=false) {
  const source=rgb(/^#[0-9a-fA-F]{6}$/.test(color||'')?color:DEFAULT_BRANDING.accent);
  let button=source;
  for(let i=0;i<40&&contrastRatio(hex(button),'#ffffff')<4.5;i++)button=blend(button,[0,0,0],.08);
  let text=source;const panel=dark?'#191e2b':'#ffffff';
  for(let i=0;i<40&&contrastRatio(hex(text),panel)<4.5;i++)text=blend(text,dark?[255,255,255]:[0,0,0],.08);
  return {accent:hex(button),hover:hex(blend(button,[0,0,0],.12)),text:hex(text),tint:hex(blend(source,dark?[16,19,28]:[255,255,255],dark?.82:.93))};
}
