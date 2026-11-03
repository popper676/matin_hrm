import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '../../context/LanguageContext';
import api from '../../api/client';
import Icon from '../common/Icon';
import JobOpeningDetails from './JobOpeningDetails';
import toast from 'react-hot-toast';
const fields = [
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
const empty = {
  position_id: '',
  title: '',
  department: '',
  job_description: '',
  required_requirements: '',
  preferred_requirements: '',
  employment_type: 'Full-Time',
  work_mode: 'On-site',
  location: '',
  work_schedule: '',
  salary_min: '',
  salary_max: '',
  currency: 'THB',
  salary_visible: false,
  benefits: '',
  vacancies: 1,
  deadline: '',
};
function formOf(opening) {
  return Object.fromEntries(fields.map((k) => [k, opening?.[k] ?? empty[k]]));
}
const errorMessage = (e) => e.response?.data?.error || e.message;
export default function JobOpenings({ onViewCandidates }) {
  const { t } = useLanguage(),
    r = (key) => t(`common.recruitmentUpgrade.${key}`),
    qc = useQueryClient();
  const [editing, setEditing] = useState(null),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState('all'),
    [closing, setClosing] = useState(null),
    [busy, setBusy] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['job-openings'],
    queryFn: () => api.get('/job-openings').then((r) => r.data),
    retry: false,
  });
  const openings = (data?.openings || []).filter(
    (o) =>
      (status === 'all' || o.status === status) &&
      `${o.title} ${o.department}`.toLowerCase().includes(query.toLowerCase()),
  );
  const closeOpening = async (opening) => {
    setBusy(true);
    try {
      await api.post(`/job-openings/${opening.id}/close`, {
        expected_updated_at: opening.updated_at,
      });
      await qc.invalidateQueries({ queryKey: ['job-openings'] });
      await qc.invalidateQueries({ queryKey: ['recruitment'] });
      setClosing(null);
      toast.success(r('closedSuccess'));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  if (editing)
    return (
      <OpeningEditor
        key={editing.id || 'new'}
        initial={editing}
        positions={data?.positions || []}
        onClose={() => setEditing(null)}
      />
    );
  return (
    <section className="job-workspace" aria-label={r('jobOpenings')}>
      <div className="job-toolbar">
        <div>
          <h2>{r('jobOpenings')}</h2>
          <p>{r('openingIntro')}</p>
        </div>
        <button
          type="button"
          className="ux-button ux-button-primary"
          onClick={() => setEditing({})}
          disabled={!!error || isLoading}
        >
          <Icon name="plus" size={16} />
          {r('createOpening')}
        </button>
      </div>
      <div className="job-filters">
        <label>
          <Icon name="search" size={17} />
          <input
            aria-label={r('searchOpenings')}
            placeholder={r('searchOpenings')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label={r('filterStatus')}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {['all', 'draft', 'published', 'closed'].map((v) => (
            <option key={v} value={v}>
              {r(v)}
            </option>
          ))}
        </select>
        <a
          href="/careers"
          target="_blank"
          rel="noreferrer"
          className="ux-button ux-button-secondary"
        >
          {r('viewCareers')}
          <Icon name="arrowRight" size={15} />
        </a>
      </div>
      {error ? (
        <div className="job-notice" role="alert">
          <p>{errorMessage(error)}</p>
          <button className="ux-button ux-button-secondary" onClick={() => refetch()}>
            {r('retry')}
          </button>
        </div>
      ) : isLoading ? (
        <p role="status">{r('loading')}</p>
      ) : !openings.length ? (
        <div className="job-empty">
          <Icon name="recruitment" size={32} />
          <h3>{r('noOpenings')}</h3>
          <p>{r('noOpeningsHint')}</p>
        </div>
      ) : (
        <div className="job-card-grid">
          {openings.map((o) => (
            <article className="job-card" key={o.id}>
              <header>
                <span className={`job-status job-status-${o.status}`}>{r(o.status)}</span>
                <small>
                  {r('version')} {o.revision}
                </small>
              </header>
              <h3>{o.title}</h3>
              <p>
                {[o.department, o.work_mode].filter(Boolean).join(' · ') || r('detailsPending')}
              </p>
              <p className="job-card-description">{o.job_description || r('addCriteria')}</p>
              <footer>
                <button className="ux-button ux-button-secondary" onClick={() => setEditing(o)}>
                  {r('manageOpening')}
                  <Icon name="arrowRight" size={14} />
                </button>
                <button className="job-text-button" onClick={() => onViewCandidates(o.id)}>
                  {o.candidate_count} {r('candidates')}
                </button>
              </footer>
              {o.status !== 'closed' &&
                (closing === o.id ? (
                  <div className="job-inline-confirm">
                    <p>{r('closeHint')}</p>
                    <button
                      className="ux-button ux-button-secondary"
                      disabled={busy}
                      onClick={() => setClosing(null)}
                    >
                      {r('cancel')}
                    </button>
                    <button
                      className="ux-button ux-button-primary"
                      disabled={busy}
                      onClick={() => closeOpening(o)}
                    >
                      {r('confirmClose')}
                    </button>
                  </div>
                ) : (
                  <button className="job-close-link" onClick={() => setClosing(o.id)}>
                    {r('closeOpening')}
                  </button>
                ))}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
function OpeningEditor({ initial, positions, onClose }) {
  const { t } = useLanguage(),
    r = (key) => t(`common.recruitmentUpgrade.${key}`),
    qc = useQueryClient();
  const [saved, setSaved] = useState(initial),
    [form, setForm] = useState(() => formOf(initial)),
    [step, setStep] = useState('details'),
    [busy, setBusy] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [discard, setDiscard] = useState(false),
    [caption, setCaption] = useState('');
  const dirty = JSON.stringify(form) !== JSON.stringify(formOf(saved));
  const set = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setReviewed(false);
  };
  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['job-openings'] });
    await qc.invalidateQueries({ queryKey: ['recruitment'] });
    await qc.invalidateQueries({ queryKey: ['public-jobs'] });
  };
  async function saveDraft() {
    const body = { ...form, expected_updated_at: saved.updated_at };
    const { data } = saved.id
      ? await api.put(`/job-openings/${saved.id}`, body)
      : await api.post('/job-openings', body);
    setSaved(data.opening);
    setForm(formOf(data.opening));
    return data.opening;
  }
  const save = async () => {
    setBusy(true);
    try {
      await saveDraft();
      await invalidate();
      toast.success(r('saved'));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const publish = async () => {
    setBusy(true);
    try {
      const current = dirty || !saved.id ? await saveDraft() : saved;
      const { data } = await api.post(`/job-openings/${current.id}/publish`, {
        reviewed,
        expected_updated_at: current.updated_at,
      });
      setSaved(data.opening);
      setForm(formOf(data.opening));
      setReviewed(false);
      await invalidate();
      toast.success(r('publishedSuccess'));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const makeCaption = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/job-openings/${saved.id}/caption`);
      setCaption(data.caption);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(r('copied'));
    } catch {
      toast.error(r('copyFailed'));
    }
  };
  const textField = (key, label, required = false, rows) => (
    <label className={`job-field ${rows ? 'job-field-wide' : ''}`} key={key}>
      <span>
        {r(label)}
        {required ? ' *' : ''}
      </span>
      {rows ? (
        <textarea
          rows={rows}
          maxLength={30000}
          value={form[key]}
          onChange={(e) => set(key, e.target.value)}
        />
      ) : (
        <input
          required={required}
          maxLength={200}
          value={form[key]}
          onChange={(e) => set(key, e.target.value)}
        />
      )}
    </label>
  );
  return (
    <section className="job-editor">
      <div className="job-editor-heading">
        <button
          type="button"
          className="job-text-button"
          disabled={busy}
          onClick={() => (dirty ? setDiscard(true) : onClose())}
        >
          ← {r('backOpenings')}
        </button>
        <div>
          <span className={`job-status job-status-${saved.status || 'draft'}`}>
            {r(saved.status || 'draft')}
          </span>
          {saved.revision > 0 && (
            <small>
              {r('version')} {saved.revision}
            </small>
          )}
        </div>
      </div>
      <h2>{saved.id ? form.title || r('editOpening') : r('createOpening')}</h2>
      <p className="job-editor-subtitle">{r('draftHint')}</p>
      {discard && (
        <div className="job-inline-confirm" role="alert">
          <p>{r('discardHint')}</p>
          <button className="ux-button ux-button-secondary" onClick={() => setDiscard(false)}>
            {r('keepEditing')}
          </button>
          <button className="ux-button ux-button-primary" onClick={onClose}>
            {r('discard')}
          </button>
        </div>
      )}
      <nav className="job-steps" aria-label={r('openingSteps')}>
        {['details', 'files', 'review'].map((key, i) => (
          <button
            type="button"
            key={key}
            aria-current={step === key ? 'step' : undefined}
            onClick={() => setStep(key)}
            disabled={busy}
          >
            <span>{i + 1}</span>
            {r(key)}
          </button>
        ))}
      </nav>
      {saved.status === 'published' &&
        fields.some(
          (k) => String(form[k] ?? '') !== String(saved.published_snapshot?.[k] ?? ''),
        ) && <p className="job-notice">{r('unpublishedChanges')}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy}>
          {step === 'details' && (
            <div className="job-editor-panel job-field-grid">
              <label className="job-field">
                <span>{r('position')} *</span>
                <select
                  required
                  disabled={saved.revision > 0}
                  value={form.position_id}
                  onChange={(e) => {
                    const p = positions.find((p) => p.id === e.target.value);
                    setForm((prev) => ({
                      ...prev,
                      position_id: e.target.value,
                      title: prev.title || p?.title || '',
                      department: prev.department || p?.team || '',
                    }));
                    setReviewed(false);
                  }}
                >
                  <option value="">{r('choosePosition')}</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
                <small>
                  {r('positionHint')}{' '}
                  <a href="/positions" target="_blank" rel="noreferrer">
                    {r('managePositions')}
                  </a>
                </small>
              </label>
              {textField('title', 'jobTitle', true)}
              {textField('department', 'department')}
              <label className="job-field">
                <span>{r('employmentType')}</span>
                <select
                  value={form.employment_type}
                  onChange={(e) => set('employment_type', e.target.value)}
                >
                  {['Full-Time', 'Part-Time', 'Contract', 'Internship'].map((v) => (
                    <option key={v} value={v}>
                      {r(v)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="job-field">
                <span>{r('workMode')}</span>
                <select value={form.work_mode} onChange={(e) => set('work_mode', e.target.value)}>
                  {['On-site', 'Remote', 'Hybrid'].map((v) => (
                    <option key={v} value={v}>
                      {r(v)}
                    </option>
                  ))}
                </select>
              </label>
              {textField('location', 'location')}
              {textField('work_schedule', 'workSchedule')}
              <label className="job-field">
                <span>{r('vacancies')}</span>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={form.vacancies}
                  onChange={(e) => set('vacancies', e.target.value)}
                />
              </label>
              {textField('job_description', 'jobDescription', false, 6)}
              {textField('required_requirements', 'mustHave', false, 5)}
              {textField('preferred_requirements', 'niceToHave', false, 4)}
              <label className="job-field">
                <span>{r('salaryMin')}</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.salary_min}
                  onChange={(e) => set('salary_min', e.target.value)}
                />
              </label>
              <label className="job-field">
                <span>{r('salaryMax')}</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.salary_max}
                  onChange={(e) => set('salary_max', e.target.value)}
                />
              </label>
              <label className="job-field">
                <span>{r('currency')}</span>
                <select value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                  {['THB', 'MMK', 'USD'].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="job-field">
                <span>{r('deadline')}</span>
                <input
                  type="date"
                  value={form.deadline}
                  onChange={(e) => set('deadline', e.target.value)}
                />
              </label>
              <label className="job-check job-field-wide">
                <input
                  type="checkbox"
                  checked={form.salary_visible}
                  onChange={(e) => set('salary_visible', e.target.checked)}
                />
                <span>
                  {r('showSalary')}
                  <small>{r('salaryHint')}</small>
                </span>
              </label>
              {textField('benefits', 'benefits', false, 4)}
            </div>
          )}
          {step === 'files' && (
            <div className="job-editor-panel">
              {saved.id ? (
                <OpeningFiles
                  openingId={saved.id}
                  onBusy={setBusy}
                  onApply={(target, text) => {
                    const next = [form[target], text.trim()].filter(Boolean).join('\n\n');
                    if (next.length > 30000) {
                      toast.error(r('textTooLong'));
                      return false;
                    }
                    set(target, next);
                    toast.success(r('textApplied'));
                    return true;
                  }}
                />
              ) : (
                <div className="job-empty">
                  <Icon name="documents" size={32} />
                  <h3>{r('saveFirst')}</h3>
                  <p>{r('saveFirstHint')}</p>
                </div>
              )}
            </div>
          )}
          {step === 'review' && (
            <div className="job-review-panel">
              <p className="job-notice">{r('reviewHint')}</p>
              <JobOpeningDetails job={form} />
              <label className="job-check job-review-check">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                <span>{r('reviewConfirm')}</span>
              </label>
            </div>
          )}
        </fieldset>
        <footer className="job-editor-footer">
          <span role="status">
            {busy
              ? r('working')
              : dirty
                ? r('unsaved')
                : saved.id
                  ? r('draftSaved')
                  : r('newDraft')}
          </span>
          <div>
            {step !== 'review' && (
              <button
                className="ux-button ux-button-secondary"
                type="button"
                disabled={busy}
                onClick={() => setStep(step === 'details' ? 'files' : 'review')}
              >
                {r('next')}
                <Icon name="arrowRight" size={15} />
              </button>
            )}
            <button className="ux-button ux-button-secondary" type="submit" disabled={busy}>
              {r('saveDraft')}
            </button>
            {step === 'review' && (
              <button
                className="ux-button ux-button-primary"
                type="button"
                disabled={
                  busy ||
                  !reviewed ||
                  !form.job_description.trim() ||
                  !form.required_requirements.trim()
                }
                onClick={publish}
              >
                {r(saved.status === 'published' ? 'republish' : 'publish')}
              </button>
            )}
          </div>
        </footer>
      </form>
      {saved.status === 'published' && (
        <section className="job-sharing">
          <h3>{r('shareOpening')}</h3>
          <p>{r('shareHint')}</p>
          <div className="job-share-actions">
            <a
              href={`/careers?opening=${saved.id}`}
              target="_blank"
              rel="noreferrer"
              className="ux-button ux-button-secondary"
            >
              {r('viewPublished')}
            </a>
            <button
              className="ux-button ux-button-secondary"
              onClick={() => copy(`${window.location.origin}/careers?opening=${saved.id}`)}
            >
              {r('copyLink')}
            </button>
            <button className="ux-button ux-button-secondary" disabled={busy} onClick={makeCaption}>
              {r('generateAnnouncement')}
            </button>
          </div>
          {caption && (
            <div className="job-caption">
              <label className="job-field">
                <span>{r('announcementDraft')}</span>
                <textarea rows={10} value={caption} onChange={(e) => setCaption(e.target.value)} />
              </label>
              <button className="ux-button ux-button-secondary" onClick={() => copy(caption)}>
                {r('copyAnnouncement')}
              </button>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
function OpeningFiles({ openingId, onApply, onBusy }) {
  const { t } = useLanguage(),
    r = (key) => t(`common.recruitmentUpgrade.${key}`),
    qc = useQueryClient(),
    uploadRef = useRef(null);
  const [source, setSource] = useState(null),
    [text, setText] = useState(''),
    [target, setTarget] = useState('job_description'),
    [removeId, setRemoveId] = useState(null),
    [uploading, setUploading] = useState(false);
  const { data, error, isLoading } = useQuery({
    queryKey: ['opening-files', openingId],
    queryFn: () => api.get(`/job-openings/${openingId}/files`).then((r) => r.data),
    retry: false,
  });
  async function upload(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setUploading(true);
    onBusy(true);
    try {
      for (const file of files) {
        if (file.size > 10485760) throw new Error(r('fileTooLarge'));
        const fd = new FormData();
        fd.append('file', file);
        await api.post(`/job-openings/${openingId}/files`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      toast.success(r('uploaded'));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      await qc.invalidateQueries({ queryKey: ['opening-files', openingId] });
      setUploading(false);
      onBusy(false);
    }
  }
  async function remove(file) {
    onBusy(true);
    try {
      await api.delete(`/job-openings/${openingId}/files/${file.id}`);
      if (source?.id === file.id) setSource(null);
      setRemoveId(null);
      await qc.invalidateQueries({ queryKey: ['opening-files', openingId] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      onBusy(false);
    }
  }
  return (
    <div className="job-documents">
      <div className="job-upload-zone">
        <Icon name="documents" size={30} />
        <h3>{r('uploadDocuments')}</h3>
        <p>{r('uploadHint')}</p>
        <input
          ref={uploadRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt"
          aria-label={r('uploadDocuments')}
          onChange={upload}
        />
        <small role="status">{uploading ? r('extracting') : r('privateFiles')}</small>
      </div>
      {error && (
        <p role="alert" className="job-notice">
          {errorMessage(error)}
        </p>
      )}
      {isLoading && <p role="status">{r('loading')}</p>}
      <div className="job-file-list">
        {(data?.files || []).map((file) => (
          <article className="job-file" key={file.id}>
            <div>
              <Icon name="documents" size={22} />
              <div>
                <strong>{file.file_name}</strong>
                <small>
                  {Math.max(1, Math.round(file.size_bytes / 1024))} KB ·{' '}
                  {r(`extraction_${file.extraction_status}`)}
                </small>
              </div>
            </div>
            <div className="job-file-actions">
              <a href={file.url} target="_blank" rel="noreferrer">
                {r('openOriginal')}
              </a>
              {file.extracted_text && (
                <button
                  type="button"
                  onClick={() => {
                    setSource(file);
                    setText(file.extracted_text);
                  }}
                >
                  {r('reviewText')}
                </button>
              )}
              <button type="button" onClick={() => setRemoveId(file.id)}>
                {r('remove')}
              </button>
            </div>
            {removeId === file.id && (
              <div className="job-inline-confirm">
                <p>{r('removeHint')}</p>
                <button
                  type="button"
                  className="ux-button ux-button-secondary"
                  onClick={() => setRemoveId(null)}
                >
                  {r('cancel')}
                </button>
                <button
                  type="button"
                  className="ux-button ux-button-primary"
                  onClick={() => remove(file)}
                >
                  {r('confirmRemove')}
                </button>
              </div>
            )}
            {['empty', 'failed'].includes(file.extraction_status) && (
              <p className="job-file-note">{r('extractionFallback')}</p>
            )}
            {file.extraction_status === 'truncated' && (
              <p className="job-file-note">{r('truncatedHint')}</p>
            )}
          </article>
        ))}
      </div>
      {source && (
        <section className="job-source-review">
          <h3>
            {r('reviewText')}: {source.file_name}
          </h3>
          <p>{r('sourceHint')}</p>
          <label className="job-field">
            <span>{r('extractedText')}</span>
            <textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="job-source-actions">
            <label className="job-field">
              <span>{r('addTextTo')}</span>
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                {[
                  ['job_description', 'jobDescription'],
                  ['required_requirements', 'mustHave'],
                  ['preferred_requirements', 'niceToHave'],
                ].map(([v, k]) => (
                  <option key={v} value={v}>
                    {r(k)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="ux-button ux-button-primary"
              disabled={!text.trim()}
              onClick={() => {
                if (onApply(target, text)) setSource(null);
              }}
            >
              {r('appendText')}
            </button>
            <button
              type="button"
              className="ux-button ux-button-secondary"
              onClick={() => setSource(null)}
            >
              {r('cancel')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
