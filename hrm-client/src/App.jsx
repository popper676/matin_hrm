import {lazy, Suspense} from 'react';
import PageLoader from './components/common/PageLoader';
const OwnerSetup = lazy(() => import('./pages/hrm/OwnerSetup'));
const BrandingSettings = lazy(() => import('./pages/hrm/BrandingSettings'));
const Today = lazy(() => import('./pages/hrm/Today'));
const MonthlyReview = lazy(() => import('./pages/hrm/MonthlyReview'));
const Employee360 = lazy(() => import('./pages/hrm/Employee360'));
const BusinessSetup = lazy(() => import('./pages/hrm/BusinessSetup'));
const OperationsSettings = lazy(() => import('./pages/hrm/OperationsSettings'));
const ExpenseEvidence = lazy(() => import('./pages/hrm/ExpenseEvidence'));
const WarningsPage=lazy(()=>import('./components/warnings/WarningForm').then(m=>({default:m.WarningsPage})));
const ProbationPage=lazy(()=>import('./components/probation/ProbationForm').then(m=>({default:m.ProbationPage})));
import {pageAllowed,hasManagement} from '../../shared/accessPolicy.js';
const PeopleAccess = lazy(() => import('./pages/hrm/PeopleAccess'));
const ApprovalSetup = lazy(() => import('./pages/hrm/ApprovalSetup'));
const ApprovalInbox = lazy(() => import('./pages/hrm/ApprovalInbox'));
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';

// Pages
const Careers = lazy(() => import('./pages/hrm/Careers'));
const Login = lazy(() => import('./pages/hrm/Login'));
const Dashboard = lazy(() => import('./pages/hrm/Dashboard'));
import AppLauncher from './components/launcher/AppLauncher';
const Employees = lazy(() => import('./pages/hrm/Employees'));
const Attendance = lazy(() => import('./pages/hrm/Attendance'));
const Leave = lazy(() => import('./pages/hrm/Leave'));
const Portal = lazy(() => import('./pages/hrm/Portal'));
const Departments = lazy(() => import('./pages/hrm/Departments'));
const Positions = lazy(() => import('./pages/hrm/Positions'));
const Payroll = lazy(() => import('./pages/hrm/Payroll'));
const SalaryTemplate = lazy(() => import('./pages/hrm/SalaryTemplate'));
import NavigationProvider from './context/NavigationProvider';
const PayrollWorkspace = lazy(() => import('./pages/hrm/PayrollWorkspace'));
const RewardsMgmt = lazy(() => import('./pages/payroll/RewardsMgmt'));
const Recruitment = lazy(() => import('./pages/hrm/Recruitment'));
const Onboarding = lazy(() => import('./pages/hrm/Onboarding'));
const OnboardingDetail = lazy(() => import('./pages/hrm/OnboardingDetail'));
const Offboarding = lazy(() => import('./pages/hrm/Offboarding'));
const Handovers = lazy(() => import('./pages/hrm/Handovers'));

const Documents = lazy(() => import('./pages/hrm/Documents'));
const SOPs = lazy(() => import('./pages/hrm/SOPs'));
const PeerVoting = lazy(() => import('./pages/hrm/PeerVoting'));
const AuditLogs = lazy(() => import('./pages/hrm/AuditLogs'));
const Birthdays = lazy(() => import('./pages/hrm/Birthdays'));
const BossDashboard = lazy(() => import('./pages/hrm/BossDashboard'));
const BossChat = lazy(() => import('./pages/hrm/BossChat'));
const Announcements = lazy(() => import('./pages/hrm/Announcements'));
const UserAccounts = lazy(() => import('./pages/hrm/UserAccounts'));
const FinanceDashboard = lazy(() => import('./pages/hrm/FinanceDashboard'));
const ForceChangePassword = lazy(() => import('./pages/hrm/ForceChangePassword'));

const CameraCheckin = lazy(() => import('./pages/portal/CameraCheckin'));
const QRScanner = lazy(() => import('./pages/portal/QRScanner'));
const PeerVotingForm = lazy(() => import('./pages/portal/PeerVotingForm'));
const SOPExecution = lazy(() => import('./pages/portal/SOPExecution'));
const ExitSurvey = lazy(() => import('./pages/portal/ExitSurvey'));
const HandoverOutgoing = lazy(() => import('./pages/portal/HandoverOutgoing'));
const HandoverIncoming = lazy(() => import('./pages/portal/HandoverIncoming'));
const MyAttendance = lazy(() => import('./pages/portal/MyAttendance'));
const MyLeaves = lazy(() => import('./pages/portal/MyLeaves'));
const MyPayslips = lazy(() => import('./pages/portal/MyPayslips'));
const MyDocuments = lazy(() => import('./pages/portal/MyDocuments'));
const MyProfile = lazy(() => import('./pages/portal/MyProfile'));
const MyRewards = lazy(() => import('./pages/portal/MyRewards'));

const EmployeeProfile = lazy(() => import('./pages/hrm/EmployeeProfile'));
const EditEmployee = lazy(() => import('./pages/hrm/EditEmployee'));
const BossKPI = lazy(() => import('./pages/hrm/BossKPI'));
const PerformanceTracker = lazy(() => import('./pages/hrm/PerformanceTracker'));
const OrgChart = lazy(() => import('./pages/hrm/OrgChart'));
const UserManual = lazy(() => import('./pages/hrm/UserManual'));
import Layout from './components/layout/Layout';
import ErrorBoundary from './components/common/ErrorBoundary';




// Role-based redirect helper
function RoleRedirect({ user }) {
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/force-change-password" replace />;
  if (!hasManagement(user)) return <Navigate to="/portal" replace />;
  return <Navigate to="/dashboard" replace />;
}

// Protected route wrapper
function Protected({ children }) {
  const {user}=useAuth();const {pathname}=useLocation();
  if(!user)return <Navigate to="/login" replace/>;
  if(user.must_change_password)return <Navigate to="/force-change-password" replace/>;
  if(!pageAllowed(user,pathname))return <Layout title="Access unavailable"><div className="access-empty"><h2>This app is not enabled for your account.</h2><p>Ask the owner to update your access.</p><a href={hasManagement(user)?'/dashboard':'/portal'}>Back to apps</a></div></Layout>;
  return children;
}
function EmployeeRoute({children}) {return <Protected>{children}</Protected>;}


const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
});

function AppRoutes() {
  const { user, loading } = useAuth();
  const adminRoles = ['boss', 'hr_manager', 'general_manager', 'admin', 'finance', 'manager'];

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={user ? <RoleRedirect user={user} /> : <Navigate to="/login" replace />} />
      <Route path="/careers" element={<Careers />} />
      <Route path="/login" element={user ? <RoleRedirect user={user} /> : <Login />} />
      <Route path="/force-change-password" element={<ForceChangePassword />} />

      <Route path="/owner-setup" element={<Protected><OwnerSetup /></Protected>}/>
      <Route path="/branding-settings" element={<Protected><BrandingSettings /></Protected>}/>
      <Route path="/today" element={<Protected><Today /></Protected>}/>
      <Route path="/monthly-review" element={<Protected><MonthlyReview /></Protected>}/>
      <Route path="/businesses" element={<Protected><BusinessSetup /></Protected>}/>
      <Route path="/operations-settings" element={<Protected><OperationsSettings /></Protected>}/>
      <Route path="/hr-operations/expense/:id" element={<Protected><ExpenseEvidence /></Protected>}/>
      <Route path="/employees/:id/360" element={<Protected><Employee360 /></Protected>}/>
      <Route path="/portal/profile/360" element={<EmployeeRoute><Employee360 personal /></EmployeeRoute>}/>
      <Route path="/people-access" element={<Protected><PeopleAccess/></Protected>}/>
      <Route path="/approval-setup" element={<Protected><ApprovalSetup/></Protected>}/>
      <Route path="/approvals" element={<Protected><ApprovalInbox/></Protected>}/>
      {/* Admin routes */}
      <Route path="/dashboard" element={<Protected allowedRoles={adminRoles}><AppLauncher key="hr-launcher" /></Protected>} />
      <Route path="/insights" element={<Protected allowedRoles={adminRoles}><Dashboard /></Protected>} />
      <Route path="/employees" element={<Protected allowedRoles={adminRoles}><Employees /></Protected>} />
      <Route path="/employees/:id" element={<Protected allowedRoles={adminRoles}><EmployeeProfile /></Protected>} />
      <Route path="/employees/:id/edit" element={<Protected allowedRoles={adminRoles}><EditEmployee /></Protected>} />
      <Route path="/departments" element={<Protected allowedRoles={adminRoles}><Departments /></Protected>} />
      <Route path="/positions" element={<Protected allowedRoles={adminRoles}><Positions /></Protected>} />
      <Route path="/attendance" element={<Protected allowedRoles={adminRoles}><Attendance /></Protected>} />
      <Route path="/leave" element={<Protected allowedRoles={adminRoles}><Leave /></Protected>} />
      <Route path="/payroll" element={<Protected allowedRoles={adminRoles}><SalaryTemplate /></Protected>} />
      <Route path="/payroll/records" element={<Protected allowedRoles={adminRoles}><Payroll /></Protected>} />
      <Route path="/payroll/workspace" element={<Protected allowedRoles={['boss', 'hr_manager', 'general_manager', 'admin']}><PayrollWorkspace /></Protected>} />
      <Route path="/payroll/rewards" element={<Protected allowedRoles={adminRoles}><RewardsMgmt /></Protected>} />
      <Route path="/recruitment" element={<Protected allowedRoles={adminRoles}><Recruitment /></Protected>} />
      <Route path="/documents" element={<Protected allowedRoles={adminRoles}><Documents /></Protected>} />
      <Route path="/onboarding" element={<Protected allowedRoles={adminRoles}><Onboarding /></Protected>} />
      <Route path="/onboarding/:id" element={<Protected allowedRoles={adminRoles}><OnboardingDetail /></Protected>} />
      <Route path="/offboarding" element={<Protected allowedRoles={adminRoles}><Offboarding /></Protected>} />
      <Route path="/handovers" element={<Protected allowedRoles={adminRoles}><Handovers /></Protected>} />
      <Route path="/sops" element={<Protected allowedRoles={adminRoles}><SOPs /></Protected>} />
      <Route path="/peer-voting" element={<Protected allowedRoles={adminRoles}><PeerVoting /></Protected>} />
      <Route path="/audit-logs" element={<Protected allowedRoles={adminRoles}><AuditLogs /></Protected>} />
      <Route path="/birthdays" element={<Protected allowedRoles={adminRoles}><Birthdays /></Protected>} />
      <Route path="/warnings" element={<Protected><WarningsPage /></Protected>} />
      <Route path="/portal/warnings" element={<EmployeeRoute><WarningsPage personal /></EmployeeRoute>} />
      <Route path="/performance/probation" element={<Protected><ProbationPage /></Protected>} />
      <Route path="/portal/probation" element={<EmployeeRoute><ProbationPage personal /></EmployeeRoute>} />
      <Route path="/performance" element={<Protected allowedRoles={adminRoles}><PerformanceTracker /></Protected>} />
      <Route path="/org-chart" element={<Protected allowedRoles={adminRoles}><OrgChart /></Protected>} />
<Route path="/user-manual" element={<Protected><Layout title="User Manual"><UserManual /></Layout></Protected>} />
      <Route path="/boss" element={<Protected allowedRoles={['boss', 'admin']}><BossDashboard /></Protected>} />
      <Route path="/boss/chat" element={<Protected allowedRoles={['boss', 'admin']}><BossChat /></Protected>} />
      <Route path="/announcements" element={<Protected allowedRoles={adminRoles}><Announcements /></Protected>} />
      <Route path="/boss/announcements" element={<Navigate to="/announcements" replace />} />
      <Route path="/user-accounts" element={<Protected allowedRoles={adminRoles}><UserAccounts /></Protected>} />
      <Route path="/boss/users" element={<Navigate to="/user-accounts" replace />} />
      <Route path="/finance" element={<Protected allowedRoles={['boss', 'general_manager', 'finance']}><FinanceDashboard /></Protected>} />

      {/* Portal Routes (Employee Self-Service) */}
      <Route path="/portal" element={<EmployeeRoute><AppLauncher employee key="employee-launcher" /></EmployeeRoute>} />
      <Route path="/portal/overview" element={<EmployeeRoute><Portal /></EmployeeRoute>} />
      <Route path="/portal/checkin" element={<EmployeeRoute><CameraCheckin /></EmployeeRoute>} />
      <Route path="/portal/attendance/photo" element={<EmployeeRoute><CameraCheckin /></EmployeeRoute>} />
      <Route path="/portal/qr-scanner" element={<EmployeeRoute><QRScanner /></EmployeeRoute>} />
      <Route path="/portal/qr-checkin" element={<EmployeeRoute><QRScanner /></EmployeeRoute>} />
      <Route path="/portal/voting" element={<EmployeeRoute><PeerVotingForm /></EmployeeRoute>} />
      <Route path="/portal/vote" element={<EmployeeRoute><PeerVotingForm /></EmployeeRoute>} />
      <Route path="/portal/sops" element={<EmployeeRoute><SOPExecution /></EmployeeRoute>} />
      <Route path="/portal/exit-survey" element={<EmployeeRoute><ExitSurvey /></EmployeeRoute>} />
      <Route path="/portal/handover/outgoing" element={<EmployeeRoute><HandoverOutgoing /></EmployeeRoute>} />
      <Route path="/portal/handover/incoming" element={<EmployeeRoute><HandoverIncoming /></EmployeeRoute>} />
      <Route path="/portal/attendance" element={<EmployeeRoute><MyAttendance /></EmployeeRoute>} />
      <Route path="/portal/leaves" element={<EmployeeRoute><MyLeaves /></EmployeeRoute>} />
      <Route path="/portal/payslips" element={<EmployeeRoute><MyPayslips /></EmployeeRoute>} />
      <Route path="/portal/documents" element={<EmployeeRoute><MyDocuments /></EmployeeRoute>} />
      <Route path="/portal/rewards" element={<EmployeeRoute><MyRewards /></EmployeeRoute>} />
      <Route path="/portal/profile" element={<EmployeeRoute><MyProfile /></EmployeeRoute>} />
      <Route path="/boss/kpi" element={<Protected allowedRoles={['boss', 'admin']}><BossKPI /></Protected>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <NavigationProvider>
            <Toaster position="top-right" />
            <Suspense fallback={<PageLoader/>}><AppRoutes /></Suspense>
            </NavigationProvider>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
