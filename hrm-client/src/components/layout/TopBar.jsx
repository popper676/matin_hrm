import {pageAllowed} from '../../../../shared/accessPolicy.js';
import {useBrand} from '../../context/BrandContext';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import Icon from '../common/Icon';
import Brand from '../common/Brand';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import api from '../../api/client';

export default function TopBar({ onSearch, launcher = false, home = '/dashboard' }) {
  const { user, logout } = useAuth();
  const {brand}=useBrand();
  const { language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const root = useRef(null), accountButton = useRef(null), notificationButton = useRef(null);
  const [menu, setMenu] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [theme, setTheme] = useState(() => localStorage.getItem('uyf-theme') || 'light');
  const a = key => t(`common.launcher.${key}`);
  const fetchNotifications = useCallback(async () => {
    try { const {data} = await api.get('/notifications'); setNotifications(data.notifications || []); setUnreadCount(data.unread_count || 0); } catch { /* Header remains usable while offline. */ }
  }, []);
  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('uyf-theme', theme); } catch { /* A blocked preference store does not prevent switching. */ }
  }, [theme]);
  useEffect(() => {
    if (!menu) return;
    const dismiss = event => {
      if (event.type === 'keydown') {
        if (event.key === 'Escape') { setMenu(null); (menu === 'profile' ? accountButton : notificationButton).current?.focus(); }
      } else if (!root.current?.contains(event.target)) setMenu(null);
    };
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', dismiss); document.addEventListener('focusin', dismiss);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss); document.removeEventListener('focusin', dismiss); };
  }, [menu]);
  const toggleTheme = () => setTheme(value => value === 'dark' ? 'light' : 'dark');
  const read = async notification => {
    try { await api.post(`/notifications/${notification.id}/read`); } catch { return; }
    setNotifications(items => items.map(item => item.id === notification.id ? {...item,is_read:true} : item));
    if (!notification.is_read) setUnreadCount(count => Math.max(0,count-1));
    setMenu(null);
    if (notification.link_url) navigate(notification.link_url);
  };
  const markAll = async () => {
    try { await api.post('/notifications/read-all'); setNotifications(items => items.map(item => ({...item,is_read:true}))); setUnreadCount(0); } catch { /* Leave unread state intact on failure. */ }
  };
  const remove = async id => {
    try { await api.delete(`/notifications/${id}`); } catch { return; }
    const item = notifications.find(value => value.id === id);
    if (item && !item.is_read) setUnreadCount(count => Math.max(0,count-1));
    setNotifications(items => items.filter(value => value.id !== id));
  };
  return <header className="uyf-topbar shell-topbar" ref={root}>
    <Link to={home} className="launcher-brand" aria-label={brand.name}><Brand/></Link>
    <div className="shell-header-actions">
      <NavLink to={home} end className="uyf-apps-home" aria-label={a('appsHome')} title={a('appsHome')}><Icon name="apps" size={19}/><span>{a('appsHome')}</span></NavLink>
      {!launcher && <button type="button" onClick={onSearch} className="shell-search" aria-label="Search pages"><Icon name="search" size={18}/><span>{a('searchPlaceholder')}</span><kbd>⌘ K</kbd></button>}
      <div className="shell-popover-anchor"><button type="button" ref={notificationButton} className="shell-control" aria-label="Notifications" aria-expanded={menu === 'notifications'} onClick={() => { setMenu(value => value === 'notifications' ? null : 'notifications'); fetchNotifications(); }}><Icon name="bell" size={19}/>{unreadCount > 0 && <i className="shell-notification-dot"/>}</button>
        {menu === 'notifications' && <section className="shell-popover shell-notifications" aria-label={a('notifications')}><header><h2>{a('notifications')}</h2>{unreadCount > 0 && <button type="button" onClick={markAll}>{a('markAllRead')}</button>}</header><div className="shell-notification-list">{notifications.length ? notifications.map(item => <article key={item.id} data-read={item.is_read}><button type="button" onClick={() => read(item)}><strong>{item.title}</strong><span>{item.message}</span></button><button type="button" onClick={() => remove(item.id)} aria-label={a('deleteNotification')}><Icon name="trash" size={15}/></button></article>) : <p>{a('noNotifications')}</p>}</div></section>}
      </div>
      <button type="button" className="shell-control shell-desktop-language" aria-label="Language" title="English / မြန်မာ" onClick={() => setLanguage(language === 'en' ? 'my' : 'en')}>{language === 'en' ? 'EN' : 'မြန်မာ'}</button>
      <button type="button" className="shell-control shell-desktop-theme" onClick={toggleTheme} aria-label="Toggle dark/light mode" title={a(theme === 'light' ? 'darkMode' : 'lightMode')}><Icon name={theme === 'light' ? 'moon' : 'sun'} size={18}/></button>
      <div className="shell-popover-anchor"><button type="button" ref={accountButton} className="shell-account" aria-label={a('accountMenu')} aria-expanded={menu === 'profile'} onClick={() => setMenu(value => value === 'profile' ? null : 'profile')}><span>{(user?.full_name || 'U')[0].toUpperCase()}</span></button>
        {menu === 'profile' && <section className="shell-popover shell-account-menu" aria-label={a('accountMenu')}><header><strong>{user?.full_name}</strong><span>{t(`common.roles.${user?.role}`)}</span></header><Link to={home === '/portal' ? '/portal/profile' : '/portal'} onClick={() => setMenu(null)}><Icon name="staff" size={17}/>{t('common.interface.myProfile')}</Link>{pageAllowed(user,'/user-manual')&&<Link to="/user-manual#getting-started" onClick={()=>setMenu(null)}><Icon name="documents" size={17}/>{language==='my'?'အသုံးပြုလမ်းညွှန်':'Workspace guide'}</Link>}<fieldset><legend>{a('language')}</legend><div><button type="button" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>English</button><button type="button" aria-pressed={language === 'my'} onClick={() => setLanguage('my')}>မြန်မာ</button></div></fieldset><button type="button" onClick={toggleTheme} aria-label="Toggle dark/light mode"><Icon name={theme === 'light' ? 'moon' : 'sun'} size={17}/>{a(theme === 'light' ? 'darkMode' : 'lightMode')}</button><button type="button" className="shell-signout" onClick={async () => { setMenu(null); await logout(); navigate('/login'); }}><Icon name="offboarding" size={17}/>{t('common.logout')}</button></section>}
      </div>
    </div>
  </header>;
}
