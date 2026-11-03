import {useLocation,useNavigate} from 'react-router-dom';
import {pageAllowed} from '../../../../shared/accessPolicy.js';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {useBackNavigation} from '../../context/backNavigation';
import Icon from '../common/Icon';
import '../../styles/navigation.css';
export default function BackButton({home}) {
 const {pathname}=useLocation(),navigate=useNavigate(),{user}=useAuth(),{language}=useLanguage(),previous=useBackNavigation();
 if(pathname===home)return null;
 const label=language==='my'?'နောက်သို့':'Back';
 const back=()=>{
  const permitted=previous&&!/^\/(login|change-password|careers)(\/|$)/.test(previous.pathname)&&pageAllowed(user,previous.pathname);
  if(permitted)navigate(-1);else navigate(home,{replace:true});
 };
 return <button type="button" className="uyf-back-button" onClick={back} aria-label={label}><span className="uyf-back-arrow"><Icon name="arrowRight" size={17}/></span><span>{label}</span></button>;
}
