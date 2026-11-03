import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import api from '../api/client';
import {DEFAULT_BRANDING,brandPalette} from '../../../shared/branding.js';
const defaults={...DEFAULT_BRANDING,logo_url:'/logo.svg',version:0};
const BrandContext=createContext({brand:defaults,refreshBrand:async()=>{}});
export function BrandProvider({children}) {
 const [brand,setBrand]=useState(defaults),sequence=useRef(0);
 const refreshBrand=useCallback(async()=>{
  const current=++sequence.current;
  try{const {data}=await api.get('/branding');if(current===sequence.current)setBrand({...defaults,...data});}catch{/* Keep the last known public brand while offline. */}
 },[]);
 const cancelRefresh=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{refreshBrand();const timer=setInterval(refreshBrand,60000);window.addEventListener('focus',refreshBrand);return()=>{clearInterval(timer);window.removeEventListener('focus',refreshBrand);cancelRefresh();};},[refreshBrand,cancelRefresh]);
 useEffect(()=>{
  const root=document.documentElement,apply=()=>{const p=brandPalette(brand.accent,root.dataset.theme==='dark');for(const [key,value]of Object.entries({'--uyf-accent':p.accent,'--uyf-accent-hover':p.hover,'--uyf-accent-text':p.text,'--uyf-accent-on-dark':brandPalette(brand.accent,true).text,'--uyf-tint':p.tint}))root.style.setProperty(key,value);};
  apply();const observer=new MutationObserver(apply);observer.observe(root,{attributes:true,attributeFilter:['data-theme']});
  document.title=brand.name+' · '+brand.tagline;
  const icon=document.querySelector('link[rel="icon"]');if(icon)icon.href=brand.logo_url==='/logo.svg'?'/favicon.svg':brand.logo_url;
  return()=>observer.disconnect();
 },[brand]);
 return <BrandContext.Provider value={{brand,refreshBrand}}>{children}</BrandContext.Provider>;
}
export const useBrand=()=>useContext(BrandContext);
