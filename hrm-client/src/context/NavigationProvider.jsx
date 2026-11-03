import {useEffect,useRef,useState} from 'react';
import {useLocation,useNavigationType} from 'react-router-dom';
import {useAuth} from './AuthContext';
import {BackNavigationContext} from './backNavigation';
export default function NavigationProvider({children}) {
 const location=useLocation(),type=useNavigationType(),{user}=useAuth();
 const entries=useRef(new Map()),account=useRef(user?.id),[previous,setPrevious]=useState(null);
 useEffect(()=>{
  if(account.current!==user?.id){entries.current.clear();account.current=user?.id;}
  const index=window.history.state?.idx;
  setPrevious(Number.isInteger(index)?entries.current.get(index-1)||null:null);
  if(Number.isInteger(index)){
   if(type==='PUSH')for(const key of entries.current.keys())if(key>index)entries.current.delete(key);
   entries.current.set(index,{pathname:location.pathname,path:location.pathname+location.search+location.hash});
  }
 },[location.key,location.pathname,location.search,location.hash,type,user?.id]);
 return <BackNavigationContext.Provider value={previous}>{children}</BackNavigationContext.Provider>;
}
