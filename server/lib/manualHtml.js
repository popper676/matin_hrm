import sanitizeHtml from 'sanitize-html';
import {MANUAL_TAGS} from '../../shared/manualHtml.js';
export function cleanManualHtml(value) {
  return sanitizeHtml(typeof value==='string'?value:'',{
    allowedTags:MANUAL_TAGS,
    allowedAttributes:{a:['href','title','data-article-title'],th:['colspan','rowspan'],td:['colspan','rowspan']},
    allowedSchemes:['https','http','mailto'],allowProtocolRelative:false,
    enforceHtmlBoundary:true
  });
}
export function cleanManualContent(value) {
  if(typeof value!=='string')return '';
  try {
    const localized=JSON.parse(value);
    if(localized&&typeof localized==='object'&&!Array.isArray(localized))
      return JSON.stringify({en:cleanManualHtml(localized.en),my:cleanManualHtml(localized.my)});
  }catch{/* Legacy articles contain HTML directly. */}
  return cleanManualHtml(value);
}
export function cleanManualResponse(value) {
  if(Array.isArray(value))return value.map(cleanManualResponse);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,['published_content','draft_content','content'].includes(k)?cleanManualContent(v):cleanManualResponse(v)]));
}
