import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import useAppCatalog from '../../hooks/useAppCatalog';
import { useAuth } from '../../context/AuthContext';
import Icon from '../common/Icon';
import AppGlyph from '../launcher/AppGlyph';
export default function CommandMenu({open,onClose}) {
  const {t}=useLanguage(), navigate=useNavigate(), {pathname}=useLocation(), {isEmployee}=useAuth();
  const employee=isEmployee()||pathname.startsWith('/portal'), apps=useAppCatalog(employee);
  const [query,setQuery]=useState(''),[selected,setSelected]=useState(0), input=useRef(null);
  const results=[{href:employee?'/portal':'/dashboard',label:t('common.launcher.appsHome'),icon:'apps',group:t('common.launcher.allApps')},...apps.map(app=>({href:app.href,label:app.label,icon:app.glyph,tone:app.tone,group:app.groupName,keywords:app.keywords}))].filter(i=>(i.label+' '+i.group+' '+i.href+' '+(i.keywords||'')).toLowerCase().includes(query.toLowerCase())).slice(0,12);
  const go=item=>{if(!item)return;onClose();navigate(item.href);};
  useEffect(()=>{if(!open)return;setQuery('');setSelected(0);const previous=document.activeElement;const timer=setTimeout(()=>input.current?.focus(),0);const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{clearTimeout(timer);document.body.style.overflow=old;previous?.focus();};},[open]);
  if(!open)return null;
  return createPortal(<div className="ux-command-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="ux-command" role="dialog" aria-modal="true" aria-label={t('common.experience.search')} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();onClose();}if(e.key==='ArrowDown'){e.preventDefault();setSelected(v=>Math.max(0,Math.min(results.length-1,v+1)));}if(e.key==='ArrowUp'){e.preventDefault();setSelected(v=>Math.max(0,v-1));}if(e.key==='Enter'){e.preventDefault();go(results[selected]);}if(e.key==='Tab'){e.preventDefault();input.current?.focus();}}}>
    <div className="ux-command-input"><Icon name="search" size={21}/><input ref={input} value={query} onChange={e=>{setQuery(e.target.value);setSelected(0);}} placeholder={t('common.experience.searchPlaceholder')} aria-label={t('common.experience.searchPlaceholder')} role="combobox" aria-expanded="true" aria-controls="ux-command-results" aria-activedescendant={results[selected]?`ux-result-${selected}`:undefined}/><button type="button" onClick={onClose} aria-label="Close search"><kbd>Esc</kbd></button></div>
    <div id="ux-command-results" role="listbox" className="ux-command-results">{results.length?results.map((item,index)=><button type="button" role="option" aria-selected={index===selected} id={`ux-result-${index}`} key={item.href} onMouseEnter={()=>setSelected(index)} onClick={()=>go(item)} className={index===selected?'is-selected':''}><span className="command-app-icon">{item.tone ? <AppGlyph name={item.icon} tone={item.tone}/> : <Icon name="apps" size={19}/>}</span><span><strong>{item.label}</strong><small>{item.group}</small></span><Icon name="arrowRight" size={15}/></button>):<p className="ux-command-empty">{t('common.experience.noResults')}</p>}</div>
    <footer><span>↑ ↓ {t('common.experience.navigate')}</span><span>↵ {t('common.experience.open')}</span></footer>
  </section></div>,document.body);
}
