import express from 'express';
import {verifyToken} from '../middleware/auth.js';
import {systemDb} from '../shared/db/index.js';
import {checked} from '../lib/operationsData.js';
import {loadOwnerSetup} from '../lib/ownerSetupData.js';
import {buildOwnerSetup,SETUP_KEYS} from '../lib/ownerSetup.js';
const router=express.Router(),first=v=>Array.isArray(v)?v[0]:v;
router.use(verifyToken,(req,res,next)=>req.user.is_owner?next():res.sendStatus(403));
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
const fail=(res,e)=>res.status(e.status||(/changed/.test(e.message)?409:400)).json({error:/does not exist|schema cache/.test(e.message)?'Apply migrations through 016 in the existing HR project.':e.message});
router.get('/',async(req,res)=>{try{res.json(buildOwnerSetup(await loadOwnerSetup()));}catch(e){fail(res,e);}});
router.post('/reviews/:step',async(req,res)=>{try{
 const {fingerprint,version,confirmed}=req.body;if(!SETUP_KEYS.includes(req.params.step)||confirmed!==true||!Number.isInteger(version)||typeof fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(fingerprint))throw new Error('Review the current setup and confirm it explicitly');
 const live=buildOwnerSetup(await loadOwnerSetup()),step=live.steps.find(s=>s.key===req.params.step);
 if(step.fingerprint!==fingerprint||step.version!==version)throw Object.assign(new Error('Setup changed. Reload and review it again'),{status:409});
 if(!step.can_review)throw new Error(step.issues.map(v=>v.en).join(' '));
 res.json({review:first(checked(await systemDb.rpc('hr_review_owner_setup',{p_actor:req.user.id,p_step:step.key,p_fingerprint:fingerprint,p_version:version})))});
}catch(e){fail(res,e);}});
export default router;
