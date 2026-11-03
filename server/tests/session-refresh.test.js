import test from 'node:test';
import assert from 'node:assert/strict';
import axios from '../../hrm-client/node_modules/axios/index.js';
let serial=0;
function clientModule(){const url=new URL('../../hrm-client/src/api/client.js',import.meta.url);url.searchParams.set('medium',++serial);return url.href;}
const ok=(config,data={})=>({status:200,statusText:'OK',headers:{},config,data});
function failure(config,status){return new axios.AxiosError('Synthetic response','ERR_BAD_RESPONSE',config,null,{status,statusText:'Error',headers:{},config,data:{error:'Synthetic failure'}});}
async function fixture(run){
 const previousWindow=globalThis.window,adapter=axios.defaults.adapter;
 const location={origin:'http://localhost:5173',pathname:'/dashboard',href:'http://localhost:5173/dashboard'};
 globalThis.window={location,dispatchEvent(){}};
 try{await run(location);}finally{axios.defaults.adapter=adapter;if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;}
}
test('simultaneous /auth/me and data requests share one renewal and retry after access expiry',async()=>fixture(async location=>{
 let refreshed=false,renewals=0,retries=0;
 axios.defaults.adapter=async config=>{
  if(config.url==='/api/auth/refresh'){renewals++;await new Promise(r=>setTimeout(r,10));refreshed=true;return ok(config);}
  if(!refreshed)throw failure(config,401);
  assert.equal(config._retry,true);retries++;return ok(config,{user:{id:'same-account'}});
 };
 const {default:api}=await import(clientModule());
 const results=await Promise.all(['/auth/me','/employees','/attendance','/auth/change-password'].map(path=>api.get(path)));
 assert.equal(renewals,1);assert.equal(retries,4);assert.equal(results.length,4);assert.equal(location.href,'http://localhost:5173/dashboard');
}));
test('temporary refresh outage preserves the session screen instead of treating it as invalid credentials',async()=>fixture(async location=>{
 axios.defaults.adapter=async config=>{throw failure(config,config.url==='/api/auth/refresh'?503:401);};
 const {default:api}=await import(clientModule());
 await assert.rejects(api.get('/auth/me'),error=>error.response.status===503);
 assert.equal(location.href,'http://localhost:5173/dashboard');
}));
test('bad login never refreshes and a rejected refresh returns to login once',async()=>fixture(async location=>{
 let renewals=0;
 axios.defaults.adapter=async config=>{if(config.url==='/api/auth/refresh')renewals++;throw failure(config,401);};
 const {default:api}=await import(clientModule());
 await assert.rejects(api.post('/auth/login',{username:'synthetic',password:'invalid'}));assert.equal(renewals,0);
 await assert.rejects(api.get('/auth/me'));assert.equal(renewals,1);assert.equal(location.href,'/login');
}));
