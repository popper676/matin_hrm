import {publicAppUrl} from '../lib/publicAppUrl.js';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { verifyToken, requireAdmin } from '../middleware/auth.js';
import { dbFetch, dbFetchOne, dbInsert, dbDelete, supabaseAdmin } from '../lib/supabase.js';
import { hrFileUrl } from '../lib/hrStorage.js';
import {
  OPENING_FIELDS,
  UUID,
  normalizeOpening,
  assertPublishable,
  recruitmentError,
  recruitmentFailure,
  criteriaSnapshot,
} from '../lib/jobOpenings.js';
import {
  receiveRecruitmentFile,
  validateRecruitmentFile,
  extractRecruitmentText,
  recruitmentFileName,
} from '../lib/recruitmentFiles.js';
import { draftOpeningCaption } from '../lib/recruitmentAi.js';
const router = express.Router();
router.use(verifyToken, requireAdmin);
router.param('id', (req, res, next, id) =>
  UUID.test(id) ? next() : res.status(400).json({ error: 'Invalid job opening' }),
);
async function getOpening(id) {
  const opening = await dbFetchOne('job_openings', '*', { id });
  if (!opening) throw recruitmentError('Job opening not found', 404);
  return opening;
}
async function saveOpening(existing, data, expected, userId) {
  if (expected !== existing.updated_at)
    throw recruitmentError('This opening changed. Reload before saving your edits.', 409);
  const updated_at = new Date(
    Math.max(Date.now(), Date.parse(existing.updated_at) + 1),
  ).toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from('job_openings')
    .update({ ...data, updated_by: userId, updated_at })
    .eq('id', existing.id)
    .eq('updated_at', existing.updated_at)
    .select();
  if (error) throw error;
  if (!rows?.length)
    throw recruitmentError('This opening changed. Reload before saving your edits.', 409);
  return rows[0];
}
async function audit(req, details) {
  await dbInsert('sys_audit_logs', {
    user_id: req.user.id,
    action: 'UPDATE',
    module: 'Recruitment',
    details,
  });
}
router.get('/', async (req, res) => {
  try {
    const [openings, positions, counts] = await Promise.all([
      dbFetch('job_openings', '*', {}, { order: 'created_at' }),
      dbFetch('positions', 'id,title,team'),
      dbFetch('recruitment_candidates', 'opening_id'),
    ]);
    return res.json({
      openings: openings.map((o) => ({
        ...o,
        candidate_count: counts.filter((c) => c.opening_id === o.id).length,
      })),
      positions,
    });
  } catch (e) {
    return recruitmentFailure(res, e);
  }
});
router.post('/', async (req, res) => {
  try {
    const data = normalizeOpening(req.body);
    if (!(await dbFetchOne('positions', 'id', { id: data.position_id })))
      throw recruitmentError('Position not found');
    const opening = await dbInsert('job_openings', {
      ...data,
      created_by: req.user.id,
      updated_by: req.user.id,
    });
    await audit(req, `Created draft job opening ${opening.id}`);
    return res.json({ opening });
  } catch (e) {
    return recruitmentFailure(res, e);
  }
});
router.put('/:id', async (req, res) => {
  try {
    const old = await getOpening(req.params.id),
      data = normalizeOpening(req.body, old);
    if (old.revision > 0 && data.position_id !== old.position_id)
      throw recruitmentError('Create a new job opening to change the position after publication');
    if (!(await dbFetchOne('positions', 'id', { id: data.position_id })))
      throw recruitmentError('Position not found');
    const opening = await saveOpening(old, data, req.body.expected_updated_at, req.user.id);
    await audit(req, `Saved draft details for job opening ${opening.id}`);
    return res.json({ opening });
  } catch (e) {
    return recruitmentFailure(res, e);
  }
});
router.post('/:id/publish', async (req, res) => {
  try {
    const old = await getOpening(req.params.id);
    assertPublishable(old, req.body.reviewed);
    const snapshot = Object.fromEntries(OPENING_FIELDS.map((k) => [k, old[k]]));
    const opening = await saveOpening(
      old,
      {
        status: 'published',
        revision: old.revision + 1,
        published_snapshot: snapshot,
        published_at: new Date().toISOString(),
      },
      req.body.expected_updated_at,
      req.user.id,
    );
    await audit(req, `Published job opening ${opening.id} revision ${opening.revision}`);
    return res.json({ opening });
  } catch (e) {
    return recruitmentFailure(res, e);
  }
});
router.post('/:id/close', async (req, res) => {
  try {
    const old = await getOpening(req.params.id);
    const opening = await saveOpening(
      old,
      { status: 'closed' },
      req.body.expected_updated_at,
      req.user.id,
    );
    await audit(req, `Closed job opening ${opening.id}`);
    return res.json({ opening });
  } catch (e) {
    return recruitmentFailure(res, e);
  }
});
router.post('/:id/caption', async (req, res) => {
  try {
    const opening = await getOpening(req.params.id);
    if (opening.status !== 'published' || !opening.published_snapshot)
      throw recruitmentError('Publish reviewed job details before creating an announcement');
    const appUrl = publicAppUrl();
    return res.json({ caption: await draftOpeningCaption(criteriaSnapshot(opening), appUrl) });
  } catch (e) {
    return recruitmentFailure(res, e);
  }
});
router.get('/:id/files', async (req, res) => {
  try {
    await getOpening(req.params.id);
    const files = await dbFetch(
      'job_opening_files',
      '*',
      { opening_id: req.params.id },
      { order: 'created_at' },
    );
    return res.json({
      files: files.map((f) => ({ ...f, url: hrFileUrl('recruitment_documents', f.storage_path) })),
    });
  } catch (e) {
    return recruitmentFailure(res, e);
  }
});
router.post('/:id/files', receiveRecruitmentFile('file'), async (req, res) => {
  let storagePath;
  try {
    await getOpening(req.params.id);
    const { type, mime } = validateRecruitmentFile(req.file);
    const count = await dbFetch('job_opening_files', 'id', { opening_id: req.params.id });
    if (count.length >= 12) throw recruitmentError('Keep at most 12 supporting files per opening');
    const extraction = await extractRecruitmentText(req.file);
    storagePath = `${req.params.id}/${randomUUID()}.${type}`;
    const { error } = await supabaseAdmin.storage
      .from('recruitment_documents')
      .upload(storagePath, req.file.buffer, { contentType: mime, upsert: false });
    if (error)
      throw recruitmentError(
        'File storage is unavailable. Confirm recruitment migration 003 has been applied.',
        503,
      );
    const file = await dbInsert('job_opening_files', {
      opening_id: req.params.id,
      file_name: recruitmentFileName(req.file.originalname),
      storage_path: storagePath,
      mime_type: mime,
      size_bytes: req.file.buffer.length,
      extracted_text: extraction.text,
      extraction_status: extraction.status,
      uploaded_by: req.user.id,
    });
    storagePath = null;
    await audit(req, `Uploaded supporting document ${file.id} to job opening ${req.params.id}`);
    return res.json({
      file: { ...file, url: hrFileUrl('recruitment_documents', file.storage_path) },
    });
  } catch (e) {
    if (storagePath)
      await supabaseAdmin.storage.from('recruitment_documents').remove([storagePath]);
    return recruitmentFailure(res, e);
  }
});
router.delete('/:id/files/:fileId', async (req, res) => {
  try {
    if (!UUID.test(req.params.fileId)) throw recruitmentError('Invalid attachment');
    const file = await dbFetchOne('job_opening_files', '*', {
      id: req.params.fileId,
      opening_id: req.params.id,
    });
    if (!file) throw recruitmentError('Attachment not found', 404);
    const { error } = await supabaseAdmin.storage
      .from('recruitment_documents')
      .remove([file.storage_path]);
    if (error) throw recruitmentError('Unable to remove the file. Try again.', 503);
    await dbDelete('job_opening_files', file.id);
    await audit(req, `Removed supporting document ${file.id}`);
    return res.json({ success: true });
  } catch (e) {
    return recruitmentFailure(res, e);
  }
});
export default router;
