import crypto from 'node:crypto';
export function cleanLogo(file) {
 if(!file || !Buffer.isBuffer(file.buffer) || file.buffer.length>2097152 || file.size>2097152)throw new Error('Upload a PNG or JPEG logo up to 2 MB');
 const b=file.buffer;let width=0,height=0,ext,mime;
 if(b.length>=24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&b.toString('ascii',12,16)==='IHDR'){width=b.readUInt32BE(16);height=b.readUInt32BE(20);ext='png';mime='image/png';}
 else if(b.length>4&&b[0]===255&&b[1]===216){let i=2;while(i+3<b.length){if(b[i++]!==255)break;let marker=b[i++];while(marker===255&&i<b.length)marker=b[i++];if(marker===217||marker===218)break;const n=b.readUInt16BE(i);if(n<2||i+n>b.length)break;if([192,193,194].includes(marker)&&n>=7){height=b.readUInt16BE(i+3);width=b.readUInt16BE(i+5);ext='jpg';mime='image/jpeg';break;}i+=n;}}
 if(!ext||!width||!height||width>4096||height>4096)throw new Error('Use a valid PNG/JPEG logo no larger than 4096 × 4096 pixels');
 return {id:crypto.randomUUID(),ext,mime,size:b.length,name:String(file.originalname||'logo').replace(/[\u0000-\u001f\u007f/\\]/g,'_').slice(0,120)};
}
