import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import Icon from '../common/Icon';
import BackButton from './BackButton';
import {useAuth} from '../../context/AuthContext';

const sections = {
  insights: ['trend','overview'], dashboard: ['apps','overview'], employees: ['staff','people'], departments: ['departments','people'], positions: ['positions','people'], 'org-chart': ['orgchart','people'],
  attendance: ['present','time'], leave: ['leave','time'], payroll: ['payroll','compensation'], recruitment: ['recruitment','growth'], onboarding: ['onboarding','growth'], offboarding: ['offboarding','growth'], handovers: ['handover','growth'], performance: ['performance','growth'], sops: ['sops','resources'], documents: ['documents','resources'], birthdays: ['birthdays','people'], 'peer-voting': ['voting','people'],
  boss: ['boss','management'], 'audit-logs': ['documents','administration'], announcements: ['bell','resources'], 'user-accounts': ['users','administration'], finance: ['finance','compensation'], 'user-manual': ['documents','resources'],
};
const portalIcons = { attendance: 'present', checkin: 'camera', 'qr-scanner': 'qr', leaves: 'leave', payslips: 'payroll', documents: 'documents', rewards: 'rating', profile: 'users', handover: 'handover', sops: 'sops', vote: 'voting' };
export default function PageHeader({ title, subtitle }) {
  const { pathname } = useLocation();
  const { t, language } = useLanguage();
  const {isEmployee}=useAuth();
  const parts = pathname.split('/').filter(Boolean);
  const employee = parts[0] === 'portal';
  const [icon] = employee ? [portalIcons[parts[1]] || 'dashboard', 'selfService'] : (sections[parts[0]] || ['dashboard','workspace']);
  const now = new Date();
  const date = new Intl.DateTimeFormat(language === 'my' ? 'my-MM' : 'en-GB', {day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Bangkok'}).format(now);
  return <div className="uyf-page-header">
    <div className="uyf-page-header-main">
      <div className="uyf-page-navigation"><BackButton home={employee||isEmployee()?'/portal':'/dashboard'}/><div className="uyf-page-eyebrow"><span className="uyf-page-symbol"><Icon name={icon} size={17}/></span><Link to={employee ? '/portal' : '/dashboard'}>{t('common.launcher.appsHome')}</Link><span>/</span><span>{title}</span></div></div>
      <h1>{title}</h1>{subtitle && <p>{subtitle}</p>}
    </div>
    <div className="uyf-page-date"><Icon name="leave" size={15}/><time dateTime={now.toISOString()}>{date}</time></div>
  </div>;
}
