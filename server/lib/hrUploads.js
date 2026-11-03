import multer from 'multer';

export function receiveHrFile(field,{maxBytes=10*1024*1024,types=null}={}) {
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:maxBytes,files:1,fields:20,fieldSize:65536,parts:22},
  fileFilter:(_req,file,done)=>types&&!types.includes(file.mimetype)?done(Object.assign(new Error('Unsupported attachment type'),{status:415})):done(null,true)}).single(field);
 return (req,res,next)=>upload(req,res,error=>{
  if(error)return res.status(error.code==='LIMIT_FILE_SIZE'?413:error.status||400).json({error:error.code==='LIMIT_FILE_SIZE'?`Attachment must be ${maxBytes/1048576} MB or smaller`:error.code?'Upload one attachment with bounded form fields':error.message});
  next();
 });
}
