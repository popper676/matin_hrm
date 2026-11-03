import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {loadAccount} from '../lib/accessControl.js';
import {systemDb,dbFetchOne} from '../lib/supabase.js';
import {createAuthSession,verifyAuthSession,revokeAuthSession} from '../lib/authSessions.js';
import {generateToken,generateRefreshToken,verifyToken,hashPassword,JWT_SECRET} from '../middleware/auth.js';

const router=express.Router();
const mobile=req=>req.headers['x-client']?.toLowerCase()==='mobile';
const cookieOptions=()=>({httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict'});
function clearCookies(res){for(const key of ['token','refresh_token'])res.clearCookie(key,cookieOptions());}
function verifyPassword(plain,stored=''){
 const value=stored.startsWith('MUST_CHANGE:')?stored.slice(12):stored;
 return /^\$2[ab]\$/.test(value)?bcrypt.compareSync(plain,value)||bcrypt.compareSync(hashPassword(plain),value):hashPassword(plain)===value;
}
function deliverSession(req,res,user,sessionId,{refresh=true}={}){
 const account={...user,session_id:sessionId},accessToken=generateToken(account);
 const refreshToken=refresh?generateRefreshToken(account):undefined;
 if(!mobile(req)){
  res.cookie('token',accessToken,{...cookieOptions(),maxAge:2*3600000});
  if(refresh)res.cookie('refresh_token',refreshToken,{...cookieOptions(),maxAge:7*86400000});
 }
 return {user,...(mobile(req)?{accessToken,...(refresh?{refreshToken}:{})}:{})};
}
router.post('/login',async(req,res)=>{
 try{
  const {username,password}=req.body;
  if(typeof username!=='string'||typeof password!=='string'||!username.trim()||!password)return res.status(400).json({error:'Username and password required'});
  const cleanUsername=username.trim().replace(/[\\%_]/g,'\\$&');
  const {data:rows,error}=await systemDb.from('sys_users').select('*').ilike('username',cleanUsername).limit(1);
  if(error)throw Object.assign(new Error('Unable to check account'),{status:503});
  const user=rows?.[0];
  if(!user?.is_active||!verifyPassword(password,user.password_hash))return res.status(401).json({error:'Invalid username or password'});
  const account=await loadAccount(user.id),sid=await createAuthSession(user.id,user.password_hash);
  return res.json(deliverSession(req,res,account,sid));
 }catch(error){return res.status(error.status||500).json({error:error.message||'Server error'});}
});
router.post('/logout',async(req,res)=>{
 try{
  const tokens=mobile(req)?[req.headers.authorization?.replace(/^Bearer /,''),req.body?.refreshToken]:[req.cookies?.token,req.cookies?.refresh_token];
  let decoded;
  for(const raw of tokens){try{decoded=jwt.verify(raw,JWT_SECRET);break;}catch{/* Try a valid refresh token when access has expired. */}}
  if(decoded&&['access','refresh'].includes(decoded.token_type))await revokeAuthSession(decoded);
  clearCookies(res);res.json({success:true,message:'Logged out successfully'});
 }catch(error){clearCookies(res);res.status(error.status||500).json({error:error.message});}
});
router.post('/refresh',async(req,res)=>{
 try{
  const raw=mobile(req)?req.body.refreshToken:req.cookies?.refresh_token;
  if(!raw)return res.status(401).json({error:'No refresh token'});
  const decoded=jwt.verify(raw,JWT_SECRET);
  if(decoded.token_type!=='refresh')throw new Error('Refresh token required');
  await verifyAuthSession(decoded);
  return res.json(deliverSession(req,res,await loadAccount(decoded.id),decoded.sid,{refresh:false}));
 }catch(error){res.status(error.status||401).json({error:error.status?error.message:'Invalid refresh token'});}
});
router.get('/me',verifyToken,(req,res)=>res.json({user:req.user}));
router.get('/magic-link',async(req,res)=>{
 try{
  const decoded=jwt.verify(req.query.token,JWT_SECRET);
  if(decoded.purpose!=='magic_link')throw new Error('Invalid token purpose');
  await verifyAuthSession(decoded);
  const account=await loadAccount(decoded.id);
  deliverSession(req,res,account,decoded.sid);
  const redirect=typeof req.query.redirect==='string'&&/^\/(?![\\/])/.test(req.query.redirect)&&!req.query.redirect.includes('\\')?req.query.redirect:'/';
  return res.redirect(redirect);
 }catch(error){res.status(error.status||401).send('Magic link expired or invalid. Please login normally.');}
});
router.post('/change-password',verifyToken,async(req,res)=>{
 try{
  const {oldPassword,newPassword}=req.body;
  if(typeof oldPassword!=='string'||typeof newPassword!=='string'||newPassword.length<6||Buffer.byteLength(newPassword,'utf8')>72)return res.status(400).json({error:'Use a new password with at least 6 characters and at most 72 UTF-8 bytes.'});
  const user=await dbFetchOne('sys_users','*',{id:req.user.id});
  if(!user||!verifyPassword(oldPassword,user.password_hash))return res.status(400).json({error:'Incorrect current password'});
  const hash=await bcrypt.hash(newPassword,12);
  const {data:changed,error:updateError}=await systemDb.from('sys_users').update({password_hash:hash}).eq('id',user.id).eq('password_hash',user.password_hash).select('id');
  if(updateError)throw updateError;
  if(!changed?.length)return res.status(409).json({error:'Credentials changed while saving. Please sign in again.'});
  const result=deliverSession(req,res,await loadAccount(user.id),await createAuthSession(user.id,hash));
  return res.json({message:'Password updated successfully',...result});
 }catch(error){res.status(error.status||500).json({error:error.message||'Server error'});}
});
export default router;
