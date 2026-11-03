import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
export default function useCreateIntent(setOpen) {
  const [params,setParams]=useSearchParams(),{isAdmin}=useAuth();
  const allowed=isAdmin();
  useEffect(()=>{if(!allowed||params.get('create')!=='1')return;setOpen(true);const next=new URLSearchParams(params);next.delete('create');setParams(next,{replace:true});},[params,setParams,setOpen,allowed]);
}
