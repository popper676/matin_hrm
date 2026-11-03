import {hasManagement} from '../../../../shared/accessPolicy.js';
import {useBrand} from '../../context/BrandContext';
import Icon from '../../components/common/Icon';
import Brand from '../../components/common/Brand';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';

export default function Login() {
  const {brand}=useBrand();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  const { login } = useAuth();
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();

  const { mutate, isPending: loading } = useMutation({
    mutationFn: (credentials) => api.post('/auth/login', credentials),
    onSuccess: (data) => {
      login(data.data.user);
      toast.success('Login successful!');
      navigate(hasManagement(data.data.user) ? '/dashboard' : '/portal');
    },
    onError: (err) => {
      const message = err.response?.data?.error || 'Login failed';
      setError(message);
      toast.error(message);
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    mutate({ username, password });
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsLanguageMenuOpen(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setIsLanguageMenuOpen(false);
    };

    if (isLanguageMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isLanguageMenuOpen]);

  const selectLanguage = (lang) => {
    setLanguage(lang);
    setIsLanguageMenuOpen(false);
  };

  return (
    <div className="uyf-login">
      <section className="uyf-login-story">
        <Brand />
        <div className="uyf-login-story-content">
          <span className="uyf-eyebrow">{t('auth.heroEyebrow')}</span>
          <h2>{t('auth.heroTitle')}<br /><em>{t('auth.heroAccent')}</em></h2>
          <p>{t('auth.heroDescription')}</p>
          <div className="uyf-login-topics">
            <span><Icon name="present" size={13}/>{t('auth.topicAttendance')}</span>
            <span><Icon name="leave" size={13}/>{t('auth.topicLeave')}</span>
            <span><Icon name="payroll" size={13}/>{t('auth.topicPayroll')}</span>
          </div>
        </div>
        <p className="uyf-login-story-footer">{brand.name} / {brand.tagline}</p>
      </section>

      <main className="uyf-login-main">
        <div className="uyf-login-language" ref={dropdownRef}>
          <button type="button" onClick={() => setIsLanguageMenuOpen(p => !p)} aria-expanded={isLanguageMenuOpen}
            aria-label="Language" className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/></svg>
            {language === 'en' ? 'English' : 'မြန်မာ'}
            <span aria-hidden="true">⌄</span>
          </button>
          {isLanguageMenuOpen && (
            <div className="absolute right-0 mt-2 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
              {['en', 'my'].map(lang => <button key={lang} type="button" onClick={() => selectLanguage(lang)}
                className={`w-full rounded-md px-3 py-2 text-left text-xs hover:bg-slate-50 ${language === lang ? 'text-brand-green' : 'text-slate-600'}`}>
                {lang === 'en' ? 'English' : 'မြန်မာ'}
              </button>)}
            </div>
          )}
        </div>

        <div className="uyf-login-form">
          <div className="uyf-login-mobile-brand"><Brand /></div>
          <div className="uyf-login-heading">
            <h1>{t('auth.title')}</h1>
            <p>{t('auth.subtitle')}</p>
          </div>
          {error && <div role="alert" className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="uyf-username" className="block">{t('auth.username')}</label>
              <input id="uyf-username" name="username" type="text" value={username} onChange={e => setUsername(e.target.value)}
                autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus
                className="w-full px-4 py-3" placeholder={t('auth.username')} />
            </div>
            <div className="space-y-2">
              <label htmlFor="uyf-password" className="block">{t('auth.password')}</label>
              <div className="relative">
                <input id="uyf-password" name="password" type={showPw ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)} autoComplete="current-password" required
                  className="w-full pl-4 pr-12 py-3" placeholder={t('auth.password')} />
                <button type="button" onClick={() => setShowPw(p => !p)} aria-pressed={showPw}
                  aria-label={t(showPw ? 'auth.hidePassword' : 'auth.showPassword')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
                    {showPw && <path d="m3 3 18 18"/>}
                  </svg>
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="uyf-login-submit">
              {loading ? t('auth.signingIn') : t('auth.signIn')}
              {!loading && <span aria-hidden="true">→</span>}
            </button>
          </form>
          <div className="uyf-login-access">
            <p>{t('auth.accessLevels')}</p>
            <div>{['role_boss','role_hr','role_gm','role_emp'].map(role => <span key={role}>{t(`auth.${role}`)}</span>)}</div>
          </div>
          <p className="uyf-login-copyright">© {new Date().getFullYear()} {brand.name}. {t('auth.rights')}</p>
        </div>
      </main>
    </div>
  );
}
