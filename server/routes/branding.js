import express from 'express';
import multer from 'multer';
import {systemDb} from '../shared/db/index.js';
import {verifyToken} from '../middleware/auth.js';
import {UUID} from '../../shared/accessPolicy.js';
import {brandRecord,publicBrand,cleanLogo,brandSettings,BRAND_BUCKET} from '../lib/branding.js';
import {checked} from '../lib/operationsData.js';
const router=express.Router(),first=v=>Array.isArray(v)?v[0]:v;
const owner=(req,res,next)=>req.user.is_owner?next():res.sendStatus(403);
const fail=(res,e)=>res.status(/changed|already exists/.test(e.message)?409:/Owner permission/.test(e.message)?403:400).json({error:/does not exist|schema cache|hr_brand_settings|hr_owner_setup_reviews/.test(e.message)?'Apply migration 011 in the existing HR project.':e.message});
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.get('/',async(req,res)=>{try{res.json(publicBrand(await brandRecord()));}catch(e){res.status(503).json({error:'Brand settings are temporarily unavailable'});}});
router.get('/logo/:id',async(req,res)=>{try{
 if(!UUID.test(req.params.id))return res.sendStatus(404);
 const r=await brandRecord(),logo=r.settings.logo;if(!logo||logo.id!==req.params.id)return res.sendStatus(404);
 const signed=checked(await systemDb.storage.from(BRAND_BUCKET).createSignedUrl(logo.id+'.'+logo.ext,60));res.redirect(signed.signedUrl);
}catch{res.sendStatus(404);}});
router.get('/owner',verifyToken,owner,async(req,res)=>{try{res.json({branding:await brandRecord({required:true})});}catch(e){fail(res,e);}});
const upload=multer({storage:multer.memoryStorage(),limits:{files:1,fileSize:2097152,fields:3,fieldSize:12000}}).single('logo');
router.put('/',verifyToken,owner,(req,res,next)=>upload(req,res,e=>e?res.status(400).json({error:'Upload one PNG/JPEG logo up to 2 MB'}):next()),async(req,res)=>{
 let newPath=null;
 try {
  if(!/^\d+$/.test(String(req.body.version||'')))throw new Error('Reload branding settings');
  const version=Number(req.body.version),current=await brandRecord({required:true});
  if(current.version!==version)throw new Error('Branding changed. Reload before saving');
  const input=typeof req.body.settings==='string'?JSON.parse(req.body.settings):req.body.settings;
  const settings=brandSettings(input,req.body.remove_logo==='true'?null:current.settings.logo);
  if(req.file){settings.logo=cleanLogo(req.file);newPath=settings.logo.id+'.'+settings.logo.ext;checked(await systemDb.storage.from(BRAND_BUCKET).upload(newPath,req.file.buffer,{contentType:settings.logo.mime,upsert:false}));}
  const record=first(checked(await systemDb.rpc('hr_save_branding',{p_actor:req.user.id,p_settings:settings,p_version:version})));
  newPath=null;
  const old=current.settings.logo;if(old&&old.id!==record.settings.logo?.id)try{await systemDb.storage.from(BRAND_BUCKET).remove([old.id+'.'+old.ext]);}catch{/* A stale image can be removed later; it is no longer published by the logo route. */}
  res.json({branding:record});
 }catch(error){if(newPath)try{await systemDb.storage.from(BRAND_BUCKET).remove([newPath]);}catch{/* cleanup can be retried */}fail(res,error);}
});
export default router;
