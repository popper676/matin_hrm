import {useBrand} from './BrandContext';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

// Import all English locales
import enCommon from '../locales/en/common.json';
import enAuth from '../locales/en/auth.json';
import enHrm from '../locales/en/hrm.json';
import enPortal from '../locales/en/portal.json';
import enPublic from '../locales/en/public.json';
import enValidation from '../locales/en/validation.json';

// Import all Myanmar locales
import myCommon from '../locales/my/common.json';
import myAuth from '../locales/my/auth.json';
import myHrm from '../locales/my/hrm.json';
import myPortal from '../locales/my/portal.json';
import myPublic from '../locales/my/public.json';
import myValidation from '../locales/my/validation.json';

const translations = {
  en: {
    common: enCommon,
    auth: enAuth,
    hrm: enHrm,
    portal: enPortal,
    public: enPublic,
    validation: enValidation,
  },
  my: {
    common: myCommon,
    auth: myAuth,
    hrm: myHrm,
    portal: myPortal,
    public: myPublic,
    validation: myValidation,
  }
};

const LanguageContext = createContext(null);

const brandedValue=(value,brand)=>typeof value==='string'?value.replace(/Unlock Your Future/g,()=>brand.name).replace(/People & HR/g,()=>brand.tagline):Array.isArray(value)?value.map(v=>brandedValue(v,brand)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,brandedValue(v,brand)])):value;

export const LanguageProvider = ({ children }) => {
  const {brand}=useBrand();
  const [language, setLanguageState] = useState(() => {
    return localStorage.getItem('lm_hr_language') || 'en';
  });

  useEffect(() => { document.documentElement.lang = language === 'my' ? 'my' : 'en'; }, [language]);

  const setLanguage = (lang) => {
    if (translations[lang]) {
      setLanguageState(lang);
      localStorage.setItem('lm_hr_language', lang);
    }
  };

  const t = useCallback((path, options = {}) => {
    const keys = path.split('.');
    let current = translations[language];

    for (const key of keys) {
      if (current === undefined || current === null) {
        current = null;
        break;
      }
      current = current[key];
    }

    let result = current;
    if (result === undefined || result === null) {
      // Fallback to English if translation is missing in the chosen language
      if (language !== 'en') {
        let fallback = translations['en'];
        for (const key of keys) {
          if (fallback === undefined || fallback === null) {
            fallback = null;
            break;
          }
          fallback = fallback[key];
        }
        result = (fallback !== undefined && fallback !== null) ? fallback : path;
      } else {
        result = path;
      }
    }

    if(result===path&&typeof options.defaultValue==='string')result=options.defaultValue;
    result=brandedValue(result,{name:brand.name,tagline:brand.tagline});
    if (typeof result === 'string' && Object.keys(options).length > 0) {
      for (const [key, value] of Object.entries(options).filter(([key])=>key!=='defaultValue')) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }
    }

    return result;
  }, [language,brand.name,brand.tagline]);


    const tDyn = useCallback((prefix, val) => {
    if (!val) return val;
    if (typeof val === 'string' && val.startsWith('hrm.')) {
      const r = t(val);
      return r === val ? val : r;
    }
    const k = `${prefix}.${val}`;
    const r = t(k);
    if (r !== k) return r;

    if (typeof val === 'string') {
      const camelVal = val.replace(/(?:^\w|[A-Z]|\b\w)/g, (w, i) => i === 0 ? w.toLowerCase() : w.toUpperCase()).replace(/\s+/g, '');
      const k2 = `${prefix}.${camelVal}`;
      const r2 = t(k2);
      if (r2 !== k2) return r2;

      const k3 = `${prefix}.${val.toLowerCase()}`;
      const r3 = t(k3);
      if (r3 !== k3) return r3;
    }

    return val;
  }, [t]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, tDyn }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
