export type SiteSession={authenticated:boolean;mode:string;role?:'staff'|'worker';staffScope?:string|null};
export type SiteRequest=(path:string,body?:{staffId:string})=>Promise<unknown>;

export function checkedSiteSession(value:unknown):SiteSession {
  if(!value || typeof value!=='object' || Array.isArray(value)) throw new Error('Site session unavailable. Recheck your session.');
  const session=value as SiteSession;
  if(typeof session.authenticated!=='boolean' || typeof session.mode!=='string'
    || (session.authenticated && !['staff','worker'].includes(session.role || '')))
    throw new Error('Site session unavailable. Recheck your session.');
  if(session.authenticated && session.role==='staff') {
    let scope;try {scope=JSON.parse(session.staffScope || '');}catch {throw new Error('Site session unavailable. Recheck your session.');}
    if(!Array.isArray(scope) || scope.length!==3 || !scope.every(item=>typeof item==='string' && item))
      throw new Error('Site session unavailable. Recheck your session.');
  }
  return session;
}

// A lost POST response is resolved by reading the cookie's session, never by retrying the rotation.
export async function selectAccountSite(request:SiteRequest,staffId:string) {
  let mutationFailed=false;
  try {await request('/account/site',{staffId});}catch {mutationFailed=true;}
  const session=checkedSiteSession(await request('/session'));
  const confirmed=session.authenticated && session.role==='staff' && JSON.parse(session.staffScope || 'null')?.[2]===staffId;
  return {session,confirmed,mutationFailed};
}
