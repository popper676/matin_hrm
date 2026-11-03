import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import Icon from '../common/Icon';
import toast from 'react-hot-toast';
export default function CredentialNotice({credentials,onDismiss}) {
  const {t}=useLanguage(),[visible,setVisible]=useState(false);
  useEffect(() => setVisible(false), [credentials]);
  if(!credentials)return null;
  const x=key=>t(`common.experience.${key}`);
  const copy=async value=>{try{await navigator.clipboard.writeText(value);toast.success(x('copied'));}catch{toast.error(x('copyFailed'));}};
  return <section className="ux-credential-notice" aria-label={x('accountReady')}><div className="ux-notice-heading"><span className="ux-result-icon"><Icon name="active"/></span><div><strong>{x('accountReady')}</strong><p>{x('accountHint')}</p></div><button type="button" onClick={onDismiss} aria-label="Dismiss account details"><Icon name="close" size={17}/></button></div><div className="ux-credentials"><div><span>{x('username')}</span><strong>{credentials.username}</strong><button type="button" onClick={()=>copy(credentials.username)}>{x('copy')}</button></div><div><span>{x('temporaryPassword')}</span><strong>{visible?credentials.defaultPassword:'••••••••••••'}</strong><button type="button" onClick={()=>setVisible(v=>!v)}>{x(visible?'hide':'show')}</button><button type="button" onClick={()=>copy(credentials.defaultPassword)}>{x('copy')}</button></div></div><div className="ux-next-step"><Icon name="arrowRight" size={17}/><span>{x('nextShift')}</span><Link to="/attendance?tab=rosters">{x('assignShift')} <Icon name="arrowRight" size={14}/></Link></div></section>;
}
