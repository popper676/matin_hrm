import {integrityRpc} from './integrityRpc.js';
import {systemDb} from '../shared/db/index.js';
export const MUTATING_AI_TOOLS=new Set(['create_kpi_task','send_team_announcement','send_employee_warning']);
import {validateAiAction} from './aiActionPolicy.js';
export {validateAiAction} from './aiActionPolicy.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function proposeAiAction(actor,session,kind,args) {
 const payload=validateAiAction(kind,args);
 return integrityRpc('hr_propose_ai_action',{p_actor:actor,p_session:session,p_kind:kind,p_payload:payload});
}
export async function listAiActions(actor,session) {
 const {data,error}=await systemDb.from('hr_ai_action_proposals').select('id,session_id,kind,payload,status,expires_at').eq('actor_id',actor).eq('session_id',session).eq('status','pending').gt('expires_at',new Date().toISOString()).order('created_at');
 if(error)throw error;return data||[];
}
export async function decideAiAction(actor,session,proposal,confirm) {
 if(typeof confirm!=='boolean'||!UUID.test(String(session))||!UUID.test(String(proposal)))throw Object.assign(new Error('Explicit confirmation and valid proposal/session are required.'),{status:400});
 return integrityRpc('hr_decide_ai_action',{p_actor:actor,p_session:session,p_proposal:proposal,p_confirm:confirm});
}
