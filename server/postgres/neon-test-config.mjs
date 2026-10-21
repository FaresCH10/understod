export function neonTestConnection(env={}){
  const failure=()=>{throw Error('An explicitly isolated direct Neon test connection is required');};
  const raw=env.UNDERSTOOD_NEON_TEST_URL;
  if(env.UNDERSTOOD_NEON_TEST_ISOLATED!=='true' || typeof raw!=='string' || raw.length>4096 || /[\s\x00-\x1f\x7f]/.test(raw))failure();
  let url;try{url=new URL(raw);}catch{failure();}
  if(!['postgres:','postgresql:'].includes(url.protocol) || !/^ep-[a-z0-9-]+\.(?:[a-z0-9-]+\.)+neon\.tech$/.test(url.hostname)
    || url.hostname.includes('-pooler.') || url.port && url.port!=='5432' || url.hash || !url.username || !url.password || !/^\/[^/]+$/.test(url.pathname))failure();
  const allowed={sslmode:['require','verify-full'],channel_binding:['require','prefer']};
  for(const key of url.searchParams.keys())if(!allowed[key] || url.searchParams.getAll(key).length!==1 || !allowed[key].includes(url.searchParams.get(key)))failure();
  let database,role;try{database=decodeURIComponent(url.pathname.slice(1));role=decodeURIComponent(url.username);decodeURIComponent(url.password);}catch{failure();}
  if(!database || database.length>63 || !role || role.length>63 || /[\x00-\x1f\x7f]/.test(database+role))failure();
  // pg receives explicit verified TLS; URL options cannot replace that object.
  url.search='';
  return {connectionString:url.toString(),database,role,ssl:{rejectUnauthorized:true,servername:url.hostname},enableChannelBinding:true,
    max:2,connectionTimeoutMillis:20000,idleTimeoutMillis:1000,query_timeout:20000,
    options:'-c statement_timeout=15000 -c lock_timeout=5000'};
}
