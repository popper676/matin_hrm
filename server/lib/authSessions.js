import crypto from 'node:crypto';
import {systemDb} from '../shared/db/index.js';

const failure=error=>Object.assign(new Error('Session storage is unavailable. Apply database migration 013 if it is missing.'),{status:503,cause:error});
export async function createAuthSession(userId,expectedHash) {
 const id=crypto.randomUUID();
 const {error}=await systemDb.rpc('hr_create_auth_session',{p_user:userId,p_expected_hash:expectedHash,p_session:id});
 if(error){if(error.code==='28000')throw Object.assign(new Error('Credentials changed. Please sign in again.'),{status:401});throw failure(error);}
 return id;
}
export async function verifyAuthSession(decoded) {
 if(typeof decoded.sid!=='string'||!decoded.sid)throw Object.assign(new Error('Please sign in again.'),{status:401});
 const {data,error}=await systemDb.from('hr_auth_sessions').select('id,user_id,expires_at,revoked_at').eq('id',decoded.sid).eq('user_id',decoded.id).maybeSingle();
 if(error)throw failure(error);
 if(!data||data.revoked_at||new Date(data.expires_at).getTime()<=Date.now())throw Object.assign(new Error('Session expired or was revoked. Please sign in again.'),{status:401});
 return data;
}
export async function revokeAuthSession(decoded) {
 if(!decoded?.sid)return;
 const {error}=await systemDb.from('hr_auth_sessions').update({revoked_at:new Date().toISOString()}).eq('id',decoded.sid).eq('user_id',decoded.id);
 if(error)throw failure(error);
}
