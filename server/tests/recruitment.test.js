import test from 'node:test';
import assert from 'node:assert/strict';
import PDFDocument from 'pdfkit';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import {
  normalizeOpening,
  publicOpening,
  openingIsOpen,
  assertPublishable,
  bangkokToday,
} from '../lib/jobOpenings.js';
import { validateRecruitmentFile, extractRecruitmentText } from '../lib/recruitmentFiles.js';
import { parseEvaluation, evaluationPrompt } from '../lib/recruitmentAi.js';
const position = '11111111-1111-4111-8111-111111111111';
const opening = {
  id: '22222222-2222-4222-8222-222222222222',
  position_id: position,
  title: 'Automation Developer',
  job_description: 'Build and maintain automations',
  required_requirements: 'Node.js experience',
  salary_min: 10000,
  salary_max: 20000,
  salary_visible: false,
  revision: 1,
  status: 'published',
};
const file = (name, text, mimetype = 'text/plain') => ({
  originalname: name,
  buffer: Buffer.from(text),
  mimetype,
});
test('opening validation, published snapshots, hidden salary and Bangkok deadlines', () => {
  const valid = normalizeOpening(opening);
  assert.equal(valid.title, 'Automation Developer');
  for (const input of [
    { position_id: 'bad' },
    { vacancies: 0 },
    { salary_min: -1 },
    { salary_min: 30, salary_max: 20 },
    { deadline: '2026-02-30' },
    { employment_type: 'invalid' },
    { salary_visible: 'false' },
    { job_description: { a: 1 } },
  ])
    assert.throws(() => normalizeOpening({ ...opening, ...input }));
  assert.throws(() => assertPublishable(valid, false), /Review/);
  assert.throws(
    () => assertPublishable({ ...valid, required_requirements: '' }, true),
    /must-have/,
  );
  const job = {
    ...opening,
    published_snapshot: { ...opening, title: 'Approved title', deadline: '2026-10-19' },
  };
  const publicJob = publicOpening(job);
  assert.equal(publicJob.title, 'Approved title');
  assert.equal('salary_min' in publicJob, false);
  assert.equal('salary_max' in publicJob, false);
  assert.equal('created_by' in publicJob, false);
  assert.equal(
    publicOpening({
      ...job,
      published_snapshot: { ...job.published_snapshot, salary_visible: true },
    }).salary_min,
    10000,
  );
  assert.equal(bangkokToday(new Date('2026-10-19T16:59:59Z')), '2026-10-19');
  assert.equal(openingIsOpen(job, new Date('2026-10-19T16:59:59Z')), true);
  assert.equal(openingIsOpen(job, new Date('2026-10-19T17:00:00Z')), false);
  assert.equal(openingIsOpen({ ...job, status: 'draft' }), false);
});
test('document validation rejects unsafe, oversized and mismatched uploads', () => {
  for (const f of [
    file('script.html', 'hello', 'text/html'),
    file('old.doc', 'hello', 'application/msword'),
    file('fake.pdf', 'hello', 'application/pdf'),
    file(
      'fake.docx',
      'hello',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ),
    file('empty.txt', ''),
    file('binary.txt', 'a\0b'),
    file('text.txt', 'hi', 'text/html'),
    file('huge.txt', Buffer.alloc(10485761)),
  ])
    assert.throws(() => validateRecruitmentFile(f));
  assert.equal(validateRecruitmentFile(file('notes.TXT', 'မင်္ဂလာပါ')).type, 'txt');
});
test('extract TXT, DOCX and PDF without an AI key; preserve unreadable and partial statuses', async () => {
  assert.deepEqual(
    await extractRecruitmentText(file('JD.txt', 'Build automations\nNode.js required')),
    { text: 'Build automations\nNode.js required', status: 'ready' },
  );
  assert.equal(
    (await extractRecruitmentText(file('long.txt', 'a'.repeat(50001)))).status,
    'truncated',
  );
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Node.js requirements</w:t></w:r></w:p></w:body></w:document>',
  );
  const docx = file(
    'requirements.docx',
    await zip.generateAsync({ type: 'nodebuffer' }),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  assert.match((await extractRecruitmentText(docx)).text, /Node.js requirements/);
  const inflated = Buffer.from(docx.buffer);
  const central = inflated.indexOf(Buffer.from('504b0102', 'hex'));
  inflated.writeUInt32LE(64 * 1024 * 1024, central + 24);
  assert.equal((await extractRecruitmentText({ ...docx, buffer: inflated })).status, 'failed');
  async function pdf(text) {
    const doc = new PDFDocument(),
      chunks = [];
    const end = new Promise((resolve) => {
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
    if (text) doc.text(text);
    doc.end();
    return file('JD.pdf', await end, 'application/pdf');
  }
  const pdfResult = await extractRecruitmentText(await pdf('Automation role requirements'));
  assert.equal(pdfResult.status, 'ready');
  assert.match(pdfResult.text, /Automation role requirements/);
  assert.equal((await extractRecruitmentText(await pdf(''))).status, 'empty');
  assert.equal(
    (await extractRecruitmentText(file('broken.pdf', '%PDF-broken', 'application/pdf'))).status,
    'failed',
  );
});
test('AI evaluations require valid scores and evidence; prompt uses supplied requirements', () => {
  const result = {
    score: 8,
    summary: 'Good Node.js evidence',
    matched: [{ requirement: 'Node.js', evidence: '3 years stated' }],
    missing: [],
    unverified: [],
  };
  assert.deepEqual(parseEvaluation(JSON.stringify(result)), result);
  for (const bad of [
    { ...result, score: 99 },
    { ...result, score: '8' },
    { ...result, matched: [{ requirement: 'Node.js' }] },
    {},
  ])
    assert.throws(() => parseEvaluation(JSON.stringify(bad)));
  const prompt = JSON.parse(
    evaluationPrompt(opening, { notes: 'Hello', resume_text: 'My resume' }),
  );
  assert.equal(prompt.approved_job.required_requirements, 'Node.js experience');
  assert.equal(prompt.candidate.resume_text, 'My resume');
});
test('additive recruitment migration preserves existing records, can be rerun and denies direct browser access', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);',
    );
    await db.exec(
      await readFile(new URL('../../supabase/001_fresh_hr_schema.sql', import.meta.url), 'utf8'),
    );
    await db.query('INSERT INTO positions(id,title,base_salary) VALUES($1,$2,$3)', [
      position,
      'Keep role',
      999,
    ]);
    await db.query(
      "INSERT INTO recruitment_candidates(full_name,position_id) VALUES('Keep candidate',$1)",
      [position],
    );
    const migration = await readFile(
      new URL('../../supabase/003_recruitment_openings.sql', import.meta.url),
      'utf8',
    );
    await db.exec(migration);
    await db.exec(migration);
    assert.equal(
      (await db.query('SELECT full_name FROM recruitment_candidates')).rows[0].full_name,
      'Keep candidate',
    );
    assert.equal((await db.query('SELECT base_salary FROM positions')).rows[0].base_salary, '999');
    assert.equal(
      (await db.query("SELECT has_table_privilege('anon','job_openings','SELECT') AS allowed"))
        .rows[0].allowed,
      false,
    );
    assert.equal(
      (
        await db.query(
          "SELECT has_table_privilege('authenticated','job_opening_files','SELECT') AS allowed",
        )
      ).rows[0].allowed,
      false,
    );
    assert.equal(
      (await db.query("SELECT public FROM storage.buckets WHERE id='recruitment_documents'"))
        .rows[0].public,
      false,
    );
  } finally {
    await db.close();
  }
});
