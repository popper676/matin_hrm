import DOMPurify from 'dompurify';
import {MANUAL_TAGS,MANUAL_ATTRIBUTES} from '../../../shared/manualHtml.js';
export const cleanManualHtml=value=>DOMPurify.sanitize(String(value||''),{
  ALLOWED_TAGS:MANUAL_TAGS,ALLOWED_ATTR:MANUAL_ATTRIBUTES,
  ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false
});
