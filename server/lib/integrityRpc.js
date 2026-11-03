import {systemDb} from '../shared/db/index.js';
export async function integrityRpc(name,args) {
 const {data,error}=await systemDb.rpc(name,args);
 if(error)throw Object.assign(new Error(error.message),{code:error.code,status:error.code==='42501'?403:error.code==='23514'||error.code==='23503'||error.code==='23505'?409:400});
 return Array.isArray(data)?data[0]:data;
}
