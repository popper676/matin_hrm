import axios from 'axios';

const api=axios.create({baseURL:'/api',withCredentials:true,headers:{'Content-Type':'application/json'}});
api.interceptors.request.use(config=>{
 config.headers['X-HR-Portal']=window.location.pathname.startsWith('/portal')?'employee':'management';
 return config;
});
let refreshPromise=null,hasRedirected=false;
function expiredSession(){
 if(!hasRedirected&&window.location.pathname!=='/login'){
  hasRedirected=true;window.location.href='/login';
 }
}
api.interceptors.response.use(response=>response,async error=>{
 const request=error.config;
 if(!request)return Promise.reject(error);
 const endpoint=new URL(request.url,window.location.origin).pathname.replace(/^\/api/,'');
 if(error.response?.status===403&&!endpoint.startsWith('/auth/'))window.dispatchEvent(new Event('hr-access-refresh'));
 // /auth/me participates in renewal; only the actual authentication actions are excluded.
 const excluded=['/auth/login','/auth/logout','/auth/refresh','/auth/magic-link'].includes(endpoint);
 if(error.response?.status!==401||excluded)return Promise.reject(error);
 if(request._retry){expiredSession();return Promise.reject(error);}
 request._retry=true;
 if(!refreshPromise){
  refreshPromise=axios.post('/api/auth/refresh',{}, {withCredentials:true}).finally(()=>{refreshPromise=null;});
 }
 try{await refreshPromise;return api(request);}
 catch(refreshError){
  if([401,403].includes(refreshError.response?.status))expiredSession();
  return Promise.reject(refreshError);
 }
});
export default api;
