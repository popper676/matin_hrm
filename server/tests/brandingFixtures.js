import {deflateSync} from 'node:zlib';
import {DEFAULT_BRANDING} from '../../shared/branding.js';
import {WORKFLOWS,emptyPolicy} from '../../shared/accessPolicy.js';
export function logoPng() {
 const crc32=bytes=>{let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;};
 const chunk=(name,data)=>{const type=Buffer.from(name),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([size,type,data,crc]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(32,0);header.writeUInt32BE(32,4);header[8]=8;header[9]=2;
 const pixels=Buffer.alloc(32*(32*3+1));for(let y=0;y<32;y++)for(let x=0;x<32;x++){const at=y*97+1+x*3;pixels[at]=36;pixels[at+1]=85;pixels[at+2]=170;}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
export function setupFixture(){
 const owner='00000000-0000-4000-8000-000000000001',staff='00000000-0000-4000-8000-000000000002',emp='00000000-0000-4000-8000-000000000003',type='00000000-0000-4000-8000-000000000004';
 return {branding:{settings:{...DEFAULT_BRANDING},version:1},reviews:[],employees:[{id:emp,employee_id:'TEST-001',Full_name:'Example Employee',status:'Active',employment_status:'Active',salary:3000}],users:[{id:owner,username:'owner',full_name:'Owner',is_owner:true,is_active:true,employee_id:null},{id:staff,username:'staff',full_name:'Example Employee',is_owner:false,is_active:true,employee_id:emp}],policies:[{user_id:staff,policy:emptyPolicy(),version:1}],businesses:[{key:'UYF',name:'Unlock Your Future',color:'#d21d3c',is_active:true,version:1}],assignments:[{id:'assignment',employee_id:emp,effective_from:'2026-01-01',version:1,items:[{business_key:'UYF',allocation_percent:null,role:''}]}],workflows:Object.entries(WORKFLOWS).map(([key,def])=>({workflow_key:key,enabled:true,version:1,stages:def.stages.map(([key,label,action])=>({key,label,action,assignee_id:owner,alternate_id:null}))})),calendar:{id:true,settings:{weekly_holidays:[0],default_start:'09:00',default_end:'18:00'},version:2},calendarDates:[],leaveTypes:[{id:type,type_name:'Annual',is_paid:true,kind:'annual'}],balances:[{id:'balance',employee_id:emp,leave_type_id:type,year:2026,entitled_days:12,version:1}],payrollDefaults:{company_id:'lm',salary_divisor:26,weekly_holidays:['SUNDAY'],timezone:'Asia/Bangkok',approved_leave_counts_as_punctual:true},payrollPolicy:null,kpiSettings:null};
}
