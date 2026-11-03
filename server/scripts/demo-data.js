import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {mkdir,writeFile,chmod,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {systemDb as db} from '../shared/db/index.js';
import {assertFreshInstance} from '../config/freshInstance.js';
import {UUID} from '../../shared/accessPolicy.js';
import {buildDemoPayload} from '../lib/demoPayload.js';
import {prepareDemoFiles,removeDemoFiles} from '../lib/demoFiles.js';
const privateRoot=fileURLToPath(new URL('../demo-private/',import.meta.url));
const [command,...args]=process.argv.slice(2),runIndex=args.indexOf('--run'),selectedRun=runIndex>=0?args[runIndex+1]:null,check=result=>{if(result.error)throw new Error(result.error.message);return result.data;};
function passwordPrompt(){
 if(!stdin.isTTY)throw new Error('Use an interactive terminal. Owner passwords must not be passed as command arguments.');
 stdout.write('Existing Owner password (hidden): ');stdin.setRawMode(true);stdin.resume();
 return new Promise((resolve,reject)=>{let value='';const finish=()=>{stdin.off('data',input);stdin.setRawMode(false);stdin.pause();stdout.write('\n');};const input=chunk=>{for(const char of chunk.toString()){if(char==='\u0003'){finish();reject(new Error('Cancelled'));return;}if(char==='\r'||char==='\n'){finish();resolve(value);return;}if(char==='\u007f'||char==='\b')value=value.slice(0,-1);else if(char>=' ')value+=char;}};stdin.on('data',input);});
}
async function authenticate(){
 await assertFreshInstance(db);
 if(!stdin.isTTY)throw new Error('Run this command in an interactive terminal.');
 const rl=createInterface({input:stdin,output:stdout});const username=(await rl.question('Existing Owner username: ')).trim().toLowerCase();rl.close();
 const password=await passwordPrompt();const result=await db.from('sys_users').select('id,username,password_hash,is_owner,is_active').eq('username',username).maybeSingle();
 const user=check(result);if(!user?.is_owner||!user.is_active||!await bcrypt.compare(password,user.password_hash))throw new Error('Owner login failed. No demo changes made.');
 console.log(`Project: ${process.env.EXPECTED_SUPABASE_PROJECT_REF} | Owner: ${user.username}`);return user;
}
async function current(){let query=db.from('hr_demo_runs').select('id,state,anchor_day,summary,created_at');if(selectedRun)query=query.eq('id',selectedRun);return check(await query.order('created_at',{ascending:false}).limit(1))[0];}
async function seed(owner){
 const active=check(await db.from('hr_demo_runs').select('id,state').in('state',['installing','active']).limit(1))[0];
 if(active){console.log(`Demo ${active.id} is already ${active.state}. No duplicates added. Use demo:status for details.`);return;}
 const runId=randomUUID(),folder=path.join(privateRoot,runId);await mkdir(folder,{recursive:true,mode:0o700});await chmod(privateRoot,0o700);await chmod(folder,0o700);
 const batch=await buildDemoPayload({ownerId:owner.id,runId}),files=await prepareDemoFiles(batch.files);
 const accountPath=path.join(folder,'accounts.txt');
 await writeFile(accountPath,[`FICTIONAL CLIENT DEMO ${runId}`,`Project: ${process.env.EXPECTED_SUPABASE_PROJECT_REF}`,`Created: ${new Date().toISOString()}`,'Owner credentials were not changed.','Keep this file private. Accounts are removed by demo:clear -- --apply.','',...batch.accounts.map(a=>`${a.username}\t${a.password}\t${a.role}\t${a.employee}`),''].join('\n'),{mode:0o600,flag:'wx'});
 const manifestPath=path.join(folder,'recovery.json');await writeFile(manifestPath,JSON.stringify({runId,project:process.env.EXPECTED_SUPABASE_PROJECT_REF,instance:process.env.HR_INSTANCE_ID,files:batch.payload.files},null,2),{mode:0o600,flag:'wx'});
 let rpcStarted=false;
 try{
  for(const bucket of [...new Set(files.map(f=>f.bucket))]){
   const found=await db.storage.getBucket(bucket);
   if(found.error){const created=await db.storage.createBucket(bucket,{public:false,fileSizeLimit:10485760});if(created.error)throw new Error(`Private bucket ${bucket}: ${created.error.message}`);}
   else if(found.data.public)throw new Error(`Bucket ${bucket} is public. Configure private HR storage before loading demo files.`);
  }
  for(const f of files){const result=await db.storage.from(f.bucket).upload(f.path,f.content,{contentType:f.mime,upsert:false});check(result);}
  console.log('Installing connected demo records in one transaction…');rpcStarted=true;
  const summary=check(await db.rpc('hr_install_client_demo',{p_actor:owner.id,p_instance:process.env.HR_INSTANCE_ID,p_run:runId,p_payload:batch.payload}));
  console.log('Demo installed. Owner login is unchanged.');console.log(JSON.stringify(summary,null,2));console.log(`Demo account details: ${accountPath}`);console.log("Open on macOS: open -t '"+accountPath.replaceAll("'","'\\''")+"'");console.log('Restart both development servers, then refresh the browser.');
 }catch(e){
  // A lost RPC response may mean the transaction committed. Never delete its files blindly.
  const state=rpcStarted?await db.from('hr_demo_runs').select('state').eq('id',runId).maybeSingle():{data:null,error:null};
  if(state.error||state.data){console.error(`Keep the recovery folder: ${folder}. Run demo:status; setup may have completed.`);}
  else{const pending=await removeDemoFiles(db,runId,batch.payload.files);if(!pending.length)await rm(accountPath,{force:true});console.error(`Database install did not commit. ${pending.length} attachment removals need retry. Recovery: ${folder}`);}
  throw e;
 }
}
async function clear(owner,apply){
 const batch=await current();if(!batch){console.log('No demo batch exists.');return;}
 const result=check(await db.rpc('hr_clear_client_demo',{p_actor:owner.id,p_instance:process.env.HR_INSTANCE_ID,p_run:batch.id,p_apply:apply}));
 console.log(JSON.stringify(result,null,2));
 if(!apply){console.log('Preview only. To clear this demo later: npm run demo:clear --prefix server -- --apply');return;}
 const pending=await removeDemoFiles(db,batch.id,result.files,{tracked:true});
 if(pending.length)throw new Error(`${pending.length} files remain. Database records were cleared. Retry demo:clear -- --apply for the remaining storage files.`);
 await rm(path.join(privateRoot,batch.id,'accounts.txt'),{force:true});console.log('Demo records, demo accounts and tracked files cleared. Every Owner account and pre-demo data retained.');
}
try{
 const options=args.filter((a,i)=>i!==runIndex&&i!==runIndex+1||runIndex<0);
 if(!['seed','status','clear','recover-files'].includes(command)||options.some(a=>a!=='--apply')||options.includes('--apply')&&command!=='clear'||selectedRun&&!UUID.test(selectedRun)||runIndex>=0&&!selectedRun||command==='seed'&&args.length)throw new Error('Use demo:seed, demo:status [-- --run UUID], or demo:clear [-- --apply] [--run UUID].');
 const owner=await authenticate();
 // Checking this table also gives a clear migration preflight before any local accounts are created.
 const batch=await current();
 if(command==='seed')await seed(owner);
 else if(command==='status'){console.log(batch?JSON.stringify(batch,null,2):'No demo has been installed.');if(batch?.state==='active')console.log(`Demo account details: ${path.join(privateRoot,batch.id,'accounts.txt')}`);}
 else if(command==='clear')await clear(owner,args.includes('--apply'));
 else {
  if(!selectedRun)throw new Error('Recovery requires --run followed by the UUID from the printed recovery folder.');
  if(batch)throw new Error('This batch has a database record. Use demo:status or demo:clear; its files must remain while the demo is active.');
  const manifest=JSON.parse(await readFile(path.join(privateRoot,selectedRun,'recovery.json'),'utf8'));
  if(manifest.runId!==selectedRun||manifest.project!==process.env.EXPECTED_SUPABASE_PROJECT_REF||manifest.instance!==process.env.HR_INSTANCE_ID)throw new Error('Recovery manifest belongs to a different project or instance.');
  const pending=await removeDemoFiles(db,selectedRun,manifest.files);if(pending.length)throw new Error(`${pending.length} files remain. Retry this recovery command.`);
  await rm(path.join(privateRoot,selectedRun,'accounts.txt'),{force:true});console.log('Uncommitted demo files cleared. Existing HR records were not changed.');
 }
}catch(e){console.error(`Demo command stopped: ${/does not exist|schema cache/.test(e.message)?'Apply supabase/017_client_demo.sql in your existing HR Supabase SQL Editor first.':e.message}`);process.exitCode=1;}
