import cron from 'node-cron';
import {runOperationsReminders} from '../lib/operationsReminders.js';
let running=false;
export function startOperationsCron(){
 const run=async()=>{if(running)return;running=true;try{await runOperationsReminders();}catch{console.warn('[HR reminders] Not ready. Apply migration 010 and check Reminder settings.');}finally{running=false;}};
 // Catch up after downtime. Hourly scans are safe across restarts/processes because delivery is deduplicated in PostgreSQL.
 void run();return cron.schedule('15 * * * *',run,{timezone:'Asia/Bangkok'});
}
