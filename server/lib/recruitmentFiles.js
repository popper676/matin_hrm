import { Worker } from 'node:worker_threads';
import multer from 'multer';
import { recruitmentError } from './jobOpenings.js';
export const MAX_RECRUITMENT_FILE = 10 * 1024 * 1024;
const types = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};
export function validateRecruitmentFile(file) {
  if (!file?.buffer?.length) throw recruitmentError('Choose a non-empty PDF, DOCX or TXT file');
  if (file.buffer.length > MAX_RECRUITMENT_FILE)
    throw recruitmentError('Each file must be 10 MB or smaller', 413);
  const type = file.originalname?.split('.').pop()?.toLowerCase();
  if (!types[type])
    throw recruitmentError('Use PDF, DOCX or TXT. Convert older .doc files to .docx first.');
  if (
    file.mimetype &&
    ![types[type], 'application/octet-stream', 'application/zip'].includes(file.mimetype)
  )
    throw recruitmentError('The file type does not match its extension');
  if (type === 'pdf' && file.buffer.subarray(0, 5).toString() !== '%PDF-')
    throw recruitmentError('This is not a valid PDF file');
  if (type === 'docx' && file.buffer.subarray(0, 4).toString('hex') !== '504b0304')
    throw recruitmentError('This is not a valid DOCX file');
  if (type === 'txt' && file.buffer.includes(0)) throw recruitmentError('Use a UTF-8 text file');
  return { type, mime: types[type] };
}
export const recruitmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RECRUITMENT_FILE, files: 1, fields: 12, fieldSize: 50000 },
});
export function receiveRecruitmentFile(field) {
  return (req, res, next) =>
    recruitmentUpload.single(field)(req, res, (error) => {
      if (error)
        return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
          error:
            error.code === 'LIMIT_FILE_SIZE'
              ? 'Each file must be 10 MB or smaller'
              : 'Upload one PDF, DOCX or TXT file at a time',
        });
      next();
    });
}
let activeExtractions = 0;
export async function extractRecruitmentText(file) {
  const { type } = validateRecruitmentFile(file);
  if (activeExtractions >= 2)
    throw recruitmentError('Document processing is busy. Please try again shortly.', 503);
  return new Promise((resolve) => {
    let done = false;
    const worker = new Worker(new URL('./recruitmentTextWorker.js', import.meta.url), {
      workerData: { bytes: file.buffer, type },
      resourceLimits: { maxOldGenerationSizeMb: 128 },
    });
    activeExtractions++;
    const finish = (result) => {
      if (done) return;
      done = true;
      activeExtractions--;
      clearTimeout(timer);
      void worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(() => finish({ text: '', status: 'failed' }), 20000);
    worker.once('message', finish);
    worker.once('error', () => finish({ text: '', status: 'failed' }));
    worker.once('exit', () => finish({ text: '', status: 'failed' }));
  });
}

export function recruitmentFileName(original) {
  const decoded = Buffer.from(original, 'latin1').toString('utf8');
  const name = /[\u0080-\u00ff]/.test(original) && !decoded.includes('\ufffd') ? decoded : original;
  return name.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200);
}
