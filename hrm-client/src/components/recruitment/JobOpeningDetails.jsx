import {BrandText} from '../common/Brand';
import { useLanguage } from '../../context/LanguageContext';
export default function JobOpeningDetails({ job }) {
  const { t } = useLanguage();
  const r = (key) => t(`common.recruitmentUpgrade.${key}`);
  return (
    <article className="job-preview">
      <div className="job-preview-heading">
        <span className="job-eyebrow"><BrandText/> · {r('jobOpening')}</span>
        <h2>{job.title}</h2>
        <p>
          {[job.department || job.department_name, job.employment_type, job.work_mode, job.location]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <dl className="job-facts">
        <div>
          <dt>{r('vacancies')}</dt>
          <dd>{job.vacancies || 1}</dd>
        </div>
        {job.deadline && (
          <div>
            <dt>{r('deadline')}</dt>
            <dd>{job.deadline}</dd>
          </div>
        )}
        {job.work_schedule && (
          <div>
            <dt>{r('workSchedule')}</dt>
            <dd>{job.work_schedule}</dd>
          </div>
        )}
        {job.salary_visible &&
          ((job.salary_min != null && job.salary_min !== '') ||
            (job.salary_max != null && job.salary_max !== '')) && (
            <div>
              <dt>{r('salaryRange')}</dt>
              <dd>
                {[job.salary_min, job.salary_max]
                  .filter((v) => v !== null && v !== undefined && v !== '')
                  .map((v) => Number(v).toLocaleString())
                  .join(' – ')}{' '}
                {job.currency}
              </dd>
            </div>
          )}
      </dl>
      {[
        ['job_description', 'jobDescription'],
        ['required_requirements', 'mustHave'],
        ['preferred_requirements', 'niceToHave'],
        ['benefits', 'benefits'],
      ].map(
        ([field, label]) =>
          job[field] && (
            <section key={field}>
              <h3>{r(label)}</h3>
              <p>{job[field]}</p>
            </section>
          ),
      )}
    </article>
  );
}
