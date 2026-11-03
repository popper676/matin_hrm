import {useBrand} from '../../context/BrandContext';
import OwnerSetupBanner from '../operations/OwnerSetupBanner';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../layout/Layout';
import Icon from '../common/Icon';
import AppGlyph from './AppGlyph';
import AppPreview from './AppPreview';
import useAppCatalog from '../../hooks/useAppCatalog';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

function readFavourites(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(saved) ? saved.filter(id => typeof id === 'string') : [];
  } catch { return []; }
}

export default function AppLauncher({ employee = false }) {
  const {brand}=useBrand();
  const { user } = useAuth();
  const { t,language } = useLanguage();
  const l=(en,my)=>language==='my'?my:en;
  const a = (key, options) => t(`common.launcher.${key}`, options);
  const apps = useAppCatalog(employee);
  const navigate = useNavigate();
  const search = useRef(null);
  const storageKey = `uyf.launcher.favourites.${encodeURIComponent(user?.id || user?.username || 'user')}.${employee ? 'employee' : 'hr'}`;
  const [favourites, setFavourites] = useState(() => readFavourites(storageKey));
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('all');
  const [storageError, setStorageError] = useState(false);
  const [previewId, setPreviewId] = useState(null);
  const [spotlightId,setSpotlightId]=useState(null);
  const q = query.trim().toLocaleLowerCase();
  const shown = apps.filter(app => (tab !== 'favourites' || favourites.includes(app.id)) &&
    (!q || `${app.label} ${app.groupName} ${app.keywords}`.toLocaleLowerCase().includes(q)));
  const spotlight=apps.find(app=>app.id===spotlightId);
  const previewApp = apps.find(app => app.id === previewId);
  const core = shown.filter(app => app.core), more = shown.filter(app => !app.core);
  const favouriteCount = apps.filter(app => favourites.includes(app.id)).length;
  useEffect(() => {
    const handler = event => {
      const typing = event.target.closest('input,textarea,select,[contenteditable="true"]');
      if(event.key==='Escape')setSpotlightId(null);
      if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey && !document.querySelector('[role="dialog"]')) {
        event.preventDefault(); search.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
  const toggleFavourite = id => {
    const next = favourites.includes(id) ? favourites.filter(value => value !== id) : [...favourites, id];
    setFavourites(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setStorageError(false); }
    catch { setStorageError(true); }
  };
  const tiles = items => <div className="app-grid">{items.map(app => {
    const pinned = favourites.includes(app.id);
    return <article className="app-tile" data-app-id={app.id} data-selected={spotlightId===app.id} onPointerEnter={e=>{if(e.pointerType==='mouse')setSpotlightId(app.id);}} onFocus={()=>setSpotlightId(app.id)} key={app.id}>
      <Link className="app-link" to={app.href} aria-label={app.label}>
        <AppGlyph name={app.glyph} tone={app.tone}/><span className="app-label">{app.label}</span>
      </Link>
      <button type="button" className="app-info" aria-label={a('aboutApp',{app:app.label})} aria-haspopup="dialog" aria-expanded={previewId === app.id} onClick={() => setPreviewId(app.id)}><Icon name="info" size={14}/></button>
      <button className={`app-favourite ${pinned ? 'is-pinned' : ''}`} type="button" aria-label={a(pinned ? 'removeFavourite' : 'addFavourite', { app: app.label })} aria-pressed={pinned} onClick={() => toggleFavourite(app.id)}><Icon name="rating" size={13}/></button>
    </article>;
  })}</div>;
  const searching = !!q || tab === 'favourites';
  return <Layout launcher title={a('appsHome')}>
    <section className="app-launcher" aria-labelledby="launcher-title">
      {!employee&&<OwnerSetupBanner/>}
      <header className="launcher-intro"><div className="launcher-welcome"><Icon name="spark" size={14}/><span>{l('WELCOME BACK','ပြန်လည်ကြိုဆိုပါသည်')}{user?.full_name?' · '+user.full_name:''}</span></div><div className="launcher-portal-label"><span/>{a(employee ? 'employeePortal' : 'hrPortal')}</div><h1 id="launcher-title">{a(employee ? 'employeeTitle' : 'hrTitle')}</h1><p>{a(employee ? 'employeeSubtitle' : 'hrSubtitle')}</p>
        <form className="launcher-search" role="search" onSubmit={event => { event.preventDefault(); if (shown[0]) navigate(shown[0].href); }}>
          <Icon name="search" size={21}/><input ref={search} value={query} onChange={event => (setQuery(event.target.value),setSpotlightId(null))} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setQuery(''); } }} aria-label={a('search')} placeholder={a('searchPlaceholder')} autoComplete="off" spellCheck={false}/>
          {query ? <button type="button" onClick={() => { setQuery(''); search.current?.focus(); }} aria-label={a('clearSearch')}><Icon name="close" size={18}/></button> : <kbd aria-hidden="true">/</kbd>}
        </form>
      </header>
      <div className="launcher-tabs" role="group" aria-label={a('filterApps')}><button type="button" aria-pressed={tab === 'all'} onClick={() => (setTab('all'),setSpotlightId(null))}><Icon name="apps" size={16}/>{a('allApps')}</button><button type="button" aria-pressed={tab === 'favourites'} onClick={() => (setTab('favourites'),setSpotlightId(null))}><Icon name="rating" size={16}/>{a('favourites')}{favouriteCount > 0 && <span>{favouriteCount}</span>}</button></div>
      {storageError && <p className="launcher-storage-note" role="status">{a('storageError')}</p>}
      <p className="launcher-preview-hint"><span className="preview-pointer-hint">{a('previewHint')}</span><span className="preview-touch-hint">{a('touchHint')}</span></p>
      <div className={'launcher-workbench '+(spotlight?'has-spotlight':'')} onPointerLeave={()=>setSpotlightId(null)}><div className="launcher-apps" id="launcher-apps" aria-label={a(tab === 'favourites' ? 'favourites' : 'allApps')}>
        {shown.length ? searching ? tiles(shown) : <>{tiles(core)}{more.length > 0 && <section className="launcher-more"><div className="launcher-section-label"><span>{a('moreApps')}</span><i/></div>{tiles(more)}</section>}</> : <div className="launcher-empty"><span><Icon name={q ? 'search' : 'rating'} size={28}/></span><h2>{a(q ? 'noMatches' : 'noFavourites')}</h2><p>{a(q ? 'trySearch' : 'pinHint')}</p><button type="button" onClick={() => { (setTab('all'),setSpotlightId(null)); setQuery(''); search.current?.focus(); }}>{a('browseApps')}<Icon name="arrowRight" size={16}/></button></div>}
        <AppPreview app={previewApp} onClose={() => setPreviewId(null)}/>
      </div>
      <section className="launcher-context" aria-label={l('App details','App အသေးစိတ်')} aria-live="polite">
       {spotlight?<div className="launcher-context-content" key={spotlight.id}><div className="launcher-context-topline"><span className="completion-eyebrow">{spotlight.groupName}</span><button type="button" className="context-dismiss" onClick={()=>setSpotlightId(null)} aria-label={l('Clear app details','App အသေးစိတ်ကို ရှင်းရန်')}><Icon name="close" size={17}/></button></div><AppGlyph name={spotlight.glyph} tone={spotlight.tone}/><h2>{spotlight.label}</h2><p>{spotlight.notes.summary}</p><ul>{spotlight.notes.features.map(feature=><li key={feature}><Icon name="active" size={15}/><span>{feature}</span></li>)}</ul><Link className="ux-button ux-button-primary" to={spotlight.href}>{a('openApp',{app:spotlight.label})}<Icon name="arrowRight" size={16}/></Link><small>{l('Explore another app or press Esc to clear these details.','အခြား App အကြောင်းကြည့်ပါ သို့မဟုတ် အသေးစိတ်ကို ရှင်းရန် Esc နှိပ်ပါ။')}</small></div>:<div className="launcher-context-empty"><div className="workspace-orbit" aria-hidden="true"><Icon name="spark" size={30}/></div><span className="completion-eyebrow">{l('YOUR NEXT MOVE','သင့်နောက်တစ်ဆင့်')}</span><h2>{l('Everything you need. One workspace.','လိုအပ်သမျှ တစ်နေရာတည်းမှာ။')}</h2><p>{l('Point to an app to see what you can do. Open it whenever you are ready.','App တစ်ခုအပေါ် ရွှေ့လိုက်လျှင် လုပ်ဆောင်နိုင်သည်များကို ကြည့်နိုင်သည်။ လိုအပ်သည့် App ကို တိုက်ရိုက် ဖွင့်နိုင်သည်။')}</p><div className="context-availability"><span className="context-status-dot"/>{a('available',{count:apps.length})}</div></div>}
      </section></div>
      <footer className="launcher-footer"><span>{brand.name}</span><p role="status" aria-live="polite">{q ? a('results', { count: shown.length }) : a('available', { count: shown.length })}</p><span>{brand.tagline}</span></footer>
    </section>
  </Layout>;
}
