import {UUID} from './accessPolicy.js';
export const EXPENSE_ROUTE_STAGES=[['agm','AGM review','approve'],['ceo','CEO review','approve'],['finance','Finance payment','pay']];
export const DEFAULT_EXPENSE_ROUTING={mode:'standard',limits:{},stages:[]};
export function normalizeExpenseRouting(value){
 const fail=message=>{throw Object.assign(new Error(message),{status:400});};
 if(!value||!['standard','amount'].includes(value.mode)||!value.limits||Array.isArray(value.limits)||typeof value.limits!=='object')fail('Choose a route and valid currency limits.');
 if(Object.keys(value.limits).length>30)fail('Use at most 30 currency limits.');
 const limits={};for(const [code,amount] of Object.entries(value.limits)){
  if(!/^[A-Z]{3}$/.test(code)||!/^\d{1,12}(\.\d{1,2})?$/.test(String(amount)))fail('Each limit requires an uppercase 3-letter currency and a non-negative amount with at most 2 decimals.');
  limits[code]=Number(amount).toFixed(2);
 }
 let stages=[];
 if(value.mode==='amount'){
  if(!Array.isArray(value.stages)||value.stages.length!==3)fail('Assign AGM, CEO and Finance.');
  stages=EXPENSE_ROUTE_STAGES.map(([key,label,action],i)=>{
   const row=value.stages[i];if(row?.key!==key||!UUID.test(row.assignee_id||'')||row.alternate_id&&!UUID.test(row.alternate_id)||row.assignee_id===row.alternate_id)fail('Choose an independent responsible person and alternate for each stage.');
   return {key,label,action,assignee_id:row.assignee_id,alternate_id:row.alternate_id||null};
  });
  if(stages[0].assignee_id===stages[1].assignee_id)fail('Choose a different CEO reviewer from the AGM reviewer.');
 }
 return {mode:value.mode,limits,stages};
}
export function expenseRoutePolicy(config,currency,requested){
 const limit=config.limits?.[currency];
 const ceoRequired=limit==null||Number(requested)>Number(limit);
 return {mode:config.mode,version:config.version||1,currency,requested_amount:String(requested),agm_limit:limit??null,ceo_required:config.mode==='amount'?ceoRequired:null,reason:config.mode==='standard'?'standard':limit==null?'currency_unconfigured':ceoRequired?'above_limit':'within_limit'};
}
