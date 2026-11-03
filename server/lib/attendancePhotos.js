import {cleanLogo} from './brandingFiles.js';
import {supabaseAdmin} from './supabase.js';
import {hrFileUrl} from './hrStorage.js';

export function decodeAttendancePhoto(value) {
 if(typeof value!=='string'||value.length>2800000)throw new Error('Use a JPEG or PNG attendance photo up to 2 MB.');
 const match=/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
 if(!match||match[2].length%4!==0)throw new Error('Invalid attendance photo. Capture a new photo.');
 const buffer=Buffer.from(match[2],'base64');
 let image;
 try{image=cleanLogo({buffer,size:buffer.length,originalname:'attendance'});}catch{throw new Error('Use a valid JPEG or PNG attendance photo up to 2 MB and 4096 × 4096 pixels.');}
 if(image.mime!==match[1])throw new Error('Attendance photo content does not match its type.');
 return {...image,buffer};
}
export async function saveAttendancePhoto(employeeId,photo) {
 const path=employeeId+'/'+photo.id+'.'+photo.ext;
 const {error}=await supabaseAdmin.storage.from('attendance_photos').upload(path,photo.buffer,{contentType:photo.mime,upsert:false});
 if(error)throw new Error('Unable to save attendance photo. Check storage migration 013 and try again.');
 return {path,url:hrFileUrl('attendance_photos',path)};
}
export async function removeAttendancePhoto(path) {
 try{await supabaseAdmin.storage.from('attendance_photos').remove([path]);}catch{/* An unused private object can be cleaned up later. */}
}
