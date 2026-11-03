import cron from 'node-cron';
import {dbFetch} from '../lib/supabase.js';
import {integrityRpc} from '../lib/integrityRpc.js';
import {getBkkDateString} from '../lib/dateUtils.js';
import {nextBirthday} from '../../shared/birthday.js';
export function startBirthdayCron(){cron.schedule('0 8 * * *',checkAndNotifyBirthdays,{timezone:'Asia/Bangkok'});}
export async function checkAndNotifyBirthdays(){
 try {
  const today=getBkkDateString(new Date());let count=0;
  const employees=await dbFetch('Employees','id,Full_name,date_of_birth',{status:'Active'});
  for(const e of employees){
   const birthday=nextBirthday(String(e.date_of_birth||'').slice(0,10),today);if(!birthday||birthday.days>3)continue;
   count+=Number(await integrityRpc('hr_notify_birthday',{p_employee:e.id,p_occurrence:birthday.date,p_day:today,p_title:'Upcoming Birthday! 🎂',p_message:`${birthday.date} ရက်နေ့သည် ${e.Full_name} ၏ မွေးနေ့ဖြစ်ပါသည်။`}));
  }
  return {success:true,count};
 }catch(e){console.error('[BIRTHDAY]',e.message);return {success:false,error:e.message};}
}
