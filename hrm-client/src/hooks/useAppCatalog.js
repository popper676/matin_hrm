import {pageAllowed} from '../../../shared/accessPolicy.js';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

// Use the same role boundaries as App.jsx; each app is an existing protected route.
export default function useAppCatalog(employee = false) {
  const { user } = useAuth();
  const isAdmin=()=>!!user?.is_owner;
  const isBoss=()=>!!user?.is_owner;
  const { t } = useLanguage();
  const a = key => t(`common.launcher.${key}`);
  const n = key => t(`hrm.navigation.${key}`);
  const c = key => t(`common.interface.${key}`);
  const groupNames = {
    personal: a('personal'), people: a('people'), time: a('time'), talent: a('talent'),
    resources: a('resources'), management: a('management'),
  };
  const app = (id, href, label, glyph, tone, group, keywords = '', core = false) => ({
    id, href, label, glyph, tone, notes: t(`common.appNotes.${employee ? 'employee' : 'hr'}.${id}`), group, groupName: groupNames[group], keywords: `${keywords} ${id} ${href}`, core,
  });
  if (employee) return [
    app('approvals','/approvals',a('approvals'),'checklist','teal','personal','approval requests review',true),
    app('checkin','/portal/checkin',a('checkin'),'clock','rose','time','check in out photo camera arrival departure',true),
    app('attendance','/portal/attendance',c('myAttendance'),'calendar','blue','time','attendance records',true),
    app('leave','/portal/leaves',a('myLeave'),'calendar','green','time','leave balance request holiday',true),
    app('payslips','/portal/payslips',c('payslips'),'wallet','amber','personal','salary payroll',true),
    app('documents','/portal/documents',c('myDocuments'),'document','purple','personal','document requests',true),
    app('sops','/portal/sops',n('dailySops'),'checklist','rose','resources','sop daily tasks',true),
    app('handovers','/portal/handover/outgoing',c('myHandovers'),'arrows','blue','personal','outgoing handover',true),
    app('profile','/portal/profile',c('myProfile'),'person','green','personal','profile account',true),
    app('overview','/portal/overview',a('myOverview'),'analytics','purple','personal','overview leave balance announcements'),
    app('qr','/portal/qr-scanner',c('qrCheckin'),'qr','slate','time','qr scanner attendance'),
    app('incoming','/portal/handover/incoming',c('incomingHandover'),'arrows','teal','personal','incoming handovers'),
    app('warnings','/portal/warnings',a('warnings'),'shield','rose','personal','warning letter comments receipt'),
    app('probation','/portal/probation',a('probation'),'checklist','teal','personal','probation self assessment evaluation appeal'),
    app('rewards','/portal/rewards',c('myRewards'),'star','amber','personal','rewards claims'),
    app('voting','/portal/vote',n('peerVoting'),'star','purple','personal','peer voting rating'),
    app('manual','/user-manual',n('userManual'),'book','blue','resources','help guide manual'),
    app('exit-survey','/portal/exit-survey',a('exitSurvey'),'checklist','slate','personal','exit survey offboarding'),
  ].filter(item=>pageAllowed(user,item.href));
  const apps = [
    ...(user?.is_owner?[app('owner-setup','/owner-setup',a('ownerSetup'),'checklist','teal','management','owner guided setup configuration readiness',true),app('branding','/branding-settings',a('branding'),'building','rose','management','brand company logo color email settings')]:[]),
    app('today','/today',a('today'),'checklist','rose','management','today follow ups overdue approvals',true),
    app('monthly-review','/monthly-review',a('monthlyReview'),'wallet','teal','management','monthly payroll expense receipts comparison',true),
    ...(user?.is_owner?[app('businesses','/businesses',a('businesses'),'building','purple','management','expense business tags for employee requests'),app('reminders','/operations-settings',a('reminders'),'clock','amber','management','reminder deadlines notifications settings')]:[]),
    ...(user?.is_owner?[app('people-access','/people-access',a('peopleAccess'),'key','purple','management','permissions access',true),app('approval-setup','/approval-setup',a('approvalSetup'),'orgchart','teal','management','approval workflow setup',true)]:[]),
    app('approvals','/approvals',a('approvals'),'checklist','teal','management','approval requests inbox',true),
    app('employees','/employees',n('employees'),'people','rose','people','employees staff team directory',true),
    app('attendance','/attendance',n('attendance'),'clock','blue','time','attendance check in shifts rosters overtime',true),
    app('leave','/leave',a('leave'),'calendar','green','time','leave requests approvals balances',true),
    app('payroll','/payroll',a('payroll'),'wallet','amber','time','payroll salary kpi',true),
    app('recruitment','/recruitment',n('recruitment'),'briefcase','purple','talent','recruitment candidates hiring',true),
    app('onboarding','/onboarding',n('onboarding'),'personPlus','rose','talent','onboarding new hires',true),
    app('offboarding','/offboarding',n('offboarding'),'exit','blue','talent','offboarding clearance',true),
    app('documents','/documents',a('documents'),'document','green','resources','documents vault requests signatures',true),
    app('warnings','/warnings',a('warnings'),'shield','rose','people','warning letters disciplinary follow up',true),
    app('probation','/performance/probation',a('probation'),'checklist','teal','talent','probation evaluation reviews',true),
    app('performance','/performance',a('performance'),'analytics','amber','talent','performance tracker',true),
    app('sops','/sops',n('dailySops'),'checklist','purple','resources','sop daily tasks',true),
    app('handovers','/handovers',n('handovers'),'arrows','rose','talent','handovers outgoing incoming',true),
    ...(isAdmin() ? [app('accounts','/user-accounts',c('accounts'),'key','blue','management','user accounts login access',true)] : []),
    app('analytics','/insights',a('analytics'),'analytics','blue','management','analytics dashboard overview'),
    app('departments','/departments',n('departments'),'building','teal','people','departments teams'),
    app('positions','/positions',n('positions'),'briefcase','slate','people','positions jobs roles'),
    app('org-chart','/org-chart',n('orgChart'),'orgchart','purple','people','organization chart reporting'),
    ...(pageAllowed(user,'/payroll/workspace') ? [app('calculation','/payroll/workspace',c('calculation'),'calculator','green','time','payroll calculation workspace')] : []),
    app('rewards','/payroll/rewards',c('rewardsClaims'),'star','amber','time','rewards claims'),
    ...(pageAllowed(user,'/finance') ? [app('finance','/finance',c('finance'),'wallet','teal','management','finance overview')] : []),
    app('voting','/peer-voting',n('peerVoting'),'star','purple','talent','peer voting rating'),
    app('birthdays','/birthdays',n('birthdays'),'gift','rose','people','birthdays celebrations'),
    app('manual','/user-manual',n('userManual'),'book','blue','resources','help guide manual'),
    app('announcements','/announcements',c('announcements'),'megaphone','amber','resources','announcements notices'),
    ...(isAdmin() ? [
      app('audit','/audit-logs',c('audit'),'shield','slate','management','audit logs history'),
    ] : []),
    ...(isBoss() ? [
      app('executive','/boss',c('executive'),'shield','slate','management','executive boss overview approvals'),
      app('assistant','/boss/chat',c('assistant'),'spark','purple','management','ai assistant chat'),
      app('kpi','/boss/kpi',c('kpi'),'target','green','management','kpi assignments'),
    ] : []),
    app('my-portal','/portal',c('myPortal'),'person','teal','personal','my employee portal'),
  ];
  return apps.filter(item=>pageAllowed(user,item.href));
}
