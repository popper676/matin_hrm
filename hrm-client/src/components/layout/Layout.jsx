import DemoNotice from '../common/DemoNotice';
import {useBrand} from '../../context/BrandContext';
import {pageAllowed} from '../../../../shared/accessPolicy.js';
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import CommandMenu from '../experience/CommandMenu';
import Icon from '../common/Icon';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import TopBar from './TopBar';
import PageHeader from './PageHeader';

export default function Layout({ children, title, subtitle, launcher = false }) {
  const { pathname,search } = useLocation();
  const {brand}=useBrand();
  const setupStep=new URLSearchParams(search).get('setup_step');
  const { isEmployee,user } = useAuth();
  const { t } = useLanguage();
  const employeeWorkspace = isEmployee() || pathname.startsWith('/portal');
  const home = employeeWorkspace ? '/portal' : '/dashboard';
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); setSearchOpen(false); }, [pathname]);
  useEffect(() => {
    const handler = event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !document.querySelector('.ux-modal-layer')) {
        event.preventDefault(); setSearchOpen(value => !value);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  return <div className={`uyf-app uyf-shell ${launcher ? 'uyf-launcher-shell' : ''} ${employeeWorkspace?'workspace-personal':'workspace-management'}`} data-route={pathname.split('/').filter(Boolean).slice(0,2).join('-')}>
    <a href="#main-content" className="uyf-skip-link">Skip to content</a>
    <main className="uyf-main">
      <TopBar launcher={launcher} home={home} onSearch={() => setSearchOpen(true)}/>
      <div id="main-content" tabIndex={-1} className="uyf-page-content" key={pathname}>
        <DemoNotice/>
        {!launcher && <PageHeader title={title} subtitle={subtitle}/>}
        {user?.is_owner&&['branding','businesses','employees','access','approvals','leave','payroll'].includes(setupStep)&&<Link className="setup-return-link" to={'/owner-setup?step='+setupStep}>← {t('common.launcher.ownerSetup')}</Link>}
        <div className="uyf-route-body">{children}</div>
        {!launcher && <footer className="uyf-page-footer"><span>{brand.name}</span><span>{brand.tagline}</span></footer>}
      </div>
    </main>
    <nav className="shell-dock" aria-label={t('common.launcher.quickNavigation')}>
      <NavLink to={home} end><Icon name="apps" size={19}/><span>{t('common.launcher.appsHome')}</span></NavLink>
      <button type="button" onClick={() => setSearchOpen(true)}><Icon name="search" size={19}/><span>{t('common.experience.search')}</span></button>
      {pageAllowed(user,employeeWorkspace?'/portal/profile':'/insights')&&<NavLink to={employeeWorkspace ? '/portal/profile' : '/insights'}><Icon name={employeeWorkspace ? 'staff' : 'trend'} size={19}/><span>{t(employeeWorkspace ? 'common.interface.myProfile' : 'common.launcher.analytics')}</span></NavLink>}
    </nav>
    <CommandMenu open={searchOpen} onClose={() => setSearchOpen(false)}/>
  </div>;
}
