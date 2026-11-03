import express from 'express';
import rateLimit from 'express-rate-limit';
import { dbFetch } from '../lib/supabase.js';
import { openingIsOpen, publicOpening, recruitmentFailure } from '../lib/jobOpenings.js';
import { receiveRecruitmentFile } from '../lib/recruitmentFiles.js';
import { createOpeningApplication } from '../lib/recruitmentApplications.js';
const router=express.Router();
router.get('/jobs',async(req,res)=>{
 try {
  const openings=await dbFetch('job_openings','*',{status:'published'},{order:'published_at'});
  res.setHeader('Cache-Control','no-store');
  return res.json({jobs:openings.filter(o=>openingIsOpen(o)).map(publicOpening)});
 }catch(error){return recruitmentFailure(res,error);}
});
const applyLimit=rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:'draft-7',legacyHeaders:false,validate:{trustProxy:false},message:{error:'Too many applications. Please try again later.'}});
router.post('/apply',applyLimit,receiveRecruitmentFile('resume'),async(req,res)=>{
 try {
  await createOpeningApplication(req.body,req.file);
  return res.json({success:true,message:'Application submitted successfully'});
 }catch(error){return recruitmentFailure(res,error);}
});
export default router;
