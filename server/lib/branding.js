export {cleanLogo} from './brandingFiles.js';
import {systemDb} from '../shared/db/index.js';
import {DEFAULT_BRANDING,cleanBranding} from '../../shared/branding.js';
export const BRAND_BUCKET='branding_assets';
export const missingBrandSchema=e=>['42P01','PGRST205','PGRST204'].includes(e?.code)||/hr_brand_settings.*does not exist/.test(e?.message||'');
export async function brandRecord({required=false}={}) {
 const r=await systemDb.from('hr_brand_settings').select('*').eq('id',true).single();
 if(r.error) {if(!required&&missingBrandSchema(r.error))return {settings:{...DEFAULT_BRANDING},version:0};throw r.error;}
 return r.data;
}
export async function getBranding(){return {...DEFAULT_BRANDING,...(await brandRecord()).settings};}
export const publicBrand=r=>({name:r.settings.name,tagline:r.settings.tagline,accent:r.settings.accent,logo_url:r.settings.logo?'/api/branding/logo/'+r.settings.logo.id:'/logo.svg',version:r.version});
export async function pdfBranding() {
 const brand=await getBranding();if(brand.logo){const r=await systemDb.storage.from(BRAND_BUCKET).download(brand.logo.id+'.'+brand.logo.ext);if(!r.error){const bytes=Buffer.from(await r.data.arrayBuffer());if(bytes.length<=2097152)brand.logoBuffer=bytes;}}return brand;
}
export function brandSettings(input,logo){return {...cleanBranding(input),logo:logo||null};}
