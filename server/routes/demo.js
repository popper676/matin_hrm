import express from 'express';
import {verifyToken} from '../middleware/auth.js';
import {systemDb} from '../shared/db/index.js';
const router=express.Router();
router.get('/status',verifyToken,async(req,res)=>{
 res.set('Cache-Control','no-store');
 const {data,error}=await systemDb.from('hr_demo_runs').select('anchor_day').eq('state','active').limit(1);
 // Optional migration: existing installations work normally until demo tooling is installed.
 if(error&&['42P01','PGRST205'].includes(error.code))return res.json({active:false});
 if(error)return res.status(503).json({error:'Demo status is temporarily unavailable'});
 res.json({active:!!data?.length,day:data?.[0]?.anchor_day||null});
});
export default router;
