export function publicAppUrl(env=process.env) {
 const value=env.PUBLIC_APP_URL||env.FRONTEND_URL||env.APP_URL||(env.NODE_ENV==='production'?null:'http://localhost:5173');
 let url;try{url=new URL(value);}catch{throw Object.assign(new Error('Configure PUBLIC_APP_URL before generating public links.'),{status:503});}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Object.assign(new Error('PUBLIC_APP_URL must be an HTTP or HTTPS application URL.'),{status:503});
 return url.toString().replace(/\/$/,'');
}
