import {createHash,timingSafeEqual} from 'node:crypto';

// This identifies a page's session but cannot authenticate a request without its HttpOnly cookie.
export function clientSessionContext(session) {
  if(!/^[a-f0-9]{64}$/.test(session.token_hash || '') || !Number.isFinite(Date.parse(session.expires_at)))
    throw new Error('Sign in required');
  const identity=[session.token_hash,session.org_id,session.site_id,session.principal_type,session.principal_id,
    session.access_mode,session.principal_type==='worker' ? session.language : session.role];
  return {clientContext:createHash('sha256').update('understood:page-session:v1\0').update(JSON.stringify(identity)).digest('hex'),
    expiresAt:new Date(session.expires_at).toISOString()};
}

export function verifyClientSession(req,session,path) {
  const provided=req.headers['x-client-session-context'];
  const required=req.method!=='GET' && req.method!=='HEAD' && (path==='/api/usage/requests' || path==='/api/source-audio' || path==='/api/settings/sites' || path==='/api/settings/sites/access' || path==='/api/settings/sites/lifecycle'
    || /^\/api\/clarifications\/[^/]+\/(messages|followups|repeats|reviews)$/.test(path)
    || /^\/api\/clarifications\/[^/]+\/voice\/[^/]+$/.test(path)
    || (session.principal_type==='worker' && (path.startsWith('/api/worker/') || path==='/api/logout')));
  if(provided===undefined && !required)return;
  if(typeof provided!=='string' || !/^[a-f0-9]{64}$/.test(provided)
    || !timingSafeEqual(Buffer.from(provided,'hex'),Buffer.from(clientSessionContext(session).clientContext,'hex')))
    throw new Error('Session context changed');
}
