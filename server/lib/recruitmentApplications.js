import { randomUUID } from 'node:crypto';
import { dbFetchOne, dbInsert, supabaseAdmin } from './supabase.js';
import { UUID, openingIsOpen, criteriaSnapshot, recruitmentError } from './jobOpenings.js';
import { validateRecruitmentFile, extractRecruitmentText } from './recruitmentFiles.js';
import { evaluateApplication } from './recruitmentAi.js';
import { hrFileUrl } from './hrStorage.js';
export async function createOpeningApplication(input, file, { internal = false } = {}) {
  const clean = (key, max) =>
    typeof input[key] === 'string' ? input[key].trim().slice(0, max) : '';
  const name = clean('candidate_name', 200),
    email = clean('email', 254),
    phone = clean('phone', 100),
    notes = clean('cover_letter', 15000) || clean('notes', 15000);
  if (!name) throw recruitmentError('Candidate name is required');
  if ((!internal || email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw recruitmentError('Enter a valid email address');
  if (!UUID.test(input.opening_id || '')) throw recruitmentError('Choose a job opening');
  const opening = await dbFetchOne('job_openings', '*', { id: input.opening_id });
  if (
    !opening ||
    (!internal && !openingIsOpen(opening)) ||
    (internal && !opening.published_snapshot)
  )
    throw recruitmentError('This job opening is not accepting applications', 409);
  const snapshot = criteriaSnapshot(opening);
  let extraction = { text: '', status: 'empty' },
    resumeUrl = null,
    storagePath;
  try {
    if (file) {
      const { type, mime } = validateRecruitmentFile(file);
      extraction = await extractRecruitmentText(file);
      storagePath = `applications/${randomUUID()}.${type}`;
      const { error } = await supabaseAdmin.storage
        .from('resumes')
        .upload(storagePath, file.buffer, { contentType: mime, upsert: false });
      if (error) throw recruitmentError('The resume could not be saved. Please try again.', 503);
      resumeUrl = hrFileUrl('resumes', storagePath);
    }
    let evaluation = null;
    try {
      evaluation = await evaluateApplication(
        snapshot,
        { notes, resume_text: extraction.text },
        input.language,
      );
    } catch (error) {
      console.error('[Recruitment AI] Evaluation unavailable:', error.name);
    }
    if (!internal) {
      const current = await dbFetchOne('job_openings', '*', { id: opening.id });
      if (!openingIsOpen(current) || current.revision !== opening.revision)
        throw recruitmentError(
          'The job opening changed. Refresh its details before applying.',
          409,
        );
    }
    const candidate = await dbInsert('recruitment_candidates', {
      position_id: snapshot.position_id,
      opening_id: opening.id,
      opening_snapshot: snapshot,
      full_name: name,
      email,
      phone,
      notes,
      status: 'Applied',
      resume_url: resumeUrl,
      resume_text: extraction.text,
      ai_score: evaluation?.score,
      ai_reasoning: evaluation?.summary,
      ai_evaluation: evaluation,
      form_data: { 'Cover letter': notes, 'Resume text status': extraction.status },
    });
    storagePath = null;
    return candidate;
  } catch (error) {
    if (storagePath) await supabaseAdmin.storage.from('resumes').remove([storagePath]);
    throw error;
  }
}
