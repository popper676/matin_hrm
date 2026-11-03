export function recruitmentError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const OPENING_FIELDS = [
  'position_id',
  'title',
  'department',
  'job_description',
  'required_requirements',
  'preferred_requirements',
  'employment_type',
  'work_mode',
  'location',
  'work_schedule',
  'salary_min',
  'salary_max',
  'currency',
  'salary_visible',
  'benefits',
  'vacancies',
  'deadline',
];
export function bangkokToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function openingIsOpen(opening, now = new Date()) {
  return (
    opening?.status === 'published' &&
    !!opening.published_snapshot &&
    (!opening.published_snapshot.deadline ||
      opening.published_snapshot.deadline >= bangkokToday(now))
  );
}
export function normalizeOpening(input, existing = {}) {
  const data = {};
  for (const key of OPENING_FIELDS)
    data[key] = input[key] === undefined ? existing[key] : input[key];
  for (const key of [
    'title',
    'department',
    'job_description',
    'required_requirements',
    'preferred_requirements',
    'location',
    'work_schedule',
    'benefits',
  ]) {
    if (data[key] != null && typeof data[key] !== 'string')
      throw recruitmentError(`${key} must be text`);
    data[key] = (data[key] || '').trim();
    if (
      data[key].length >
      (['title', 'department', 'location', 'work_schedule'].includes(key) ? 200 : 30000)
    )
      throw recruitmentError(`${key} is too long`);
  }
  if (!UUID.test(data.position_id || '')) throw recruitmentError('Choose a valid position');
  if (!data.title) throw recruitmentError('Job title is required');
  for (const [key, allowed, fallback] of [
    ['employment_type', ['Full-Time', 'Part-Time', 'Contract', 'Internship'], 'Full-Time'],
    ['work_mode', ['On-site', 'Remote', 'Hybrid'], 'On-site'],
  ]) {
    data[key] ||= fallback;
    if (!allowed.includes(data[key])) throw recruitmentError(`Invalid ${key}`);
  }
  data.currency ||= 'THB';
  if (!['THB', 'MMK', 'USD'].includes(data.currency))
    throw recruitmentError('Choose THB, MMK or USD');
  if (data.salary_visible !== undefined && typeof data.salary_visible !== 'boolean')
    throw recruitmentError('Salary visibility must be true or false');
  data.salary_visible = data.salary_visible === true;
  for (const key of ['salary_min', 'salary_max']) {
    data[key] = data[key] === '' || data[key] == null ? null : Number(data[key]);
    if (data[key] !== null && (!Number.isFinite(data[key]) || data[key] < 0 || data[key] > 1e12))
      throw recruitmentError('Salary must be a valid positive number');
  }
  if (data.salary_min !== null && data.salary_max !== null && data.salary_max < data.salary_min)
    throw recruitmentError('Maximum salary must be at least minimum salary');
  data.vacancies = Number(data.vacancies ?? 1);
  if (!Number.isInteger(data.vacancies) || data.vacancies < 1 || data.vacancies > 1000)
    throw recruitmentError('Vacancies must be between 1 and 1000');
  data.deadline ||= null;
  if (
    data.deadline &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(data.deadline) ||
      !Number.isFinite(Date.parse(data.deadline)) ||
      new Date(data.deadline).toISOString().slice(0, 10) !== data.deadline)
  )
    throw recruitmentError('Enter a valid closing date');
  return data;
}
export function publicOpening(opening) {
  const snapshot = opening.published_snapshot || opening;
  const result = Object.fromEntries(
    OPENING_FIELDS.filter((k) => !['salary_min', 'salary_max'].includes(k)).map((k) => [
      k,
      snapshot[k],
    ]),
  );
  if (snapshot.salary_visible) {
    result.salary_min = snapshot.salary_min;
    result.salary_max = snapshot.salary_max;
  }
  return {
    ...result,
    id: opening.id,
    department_name: snapshot.department,
    revision: opening.revision,
  };
}
export function criteriaSnapshot(opening) {
  // The same published text is used for the advert and evaluation, including its version.
  return { ...publicOpening(opening), revision: opening.revision };
}
export function assertPublishable(opening, reviewed) {
  if (reviewed !== true)
    throw recruitmentError(
      'Review and confirm the job description and requirements before publishing',
    );
  if (!opening.job_description?.trim() || !opening.required_requirements?.trim())
    throw recruitmentError('Job description and must-have requirements are required to publish');
  if (opening.deadline && opening.deadline < bangkokToday())
    throw recruitmentError('The closing date has passed');
}
export function recruitmentFailure(res, error) {
  const missing = ['42P01', 'PGRST205', 'PGRST204'].includes(error.code);
  return res
    .status(missing ? 503 : error.status || 500)
    .json({
      error: missing
        ? 'Recruitment setup is needed. Run supabase/003_recruitment_openings.sql in the UYF database.'
        : error.message || 'Recruitment request failed',
    });
}
