import {sameStaffSession,sameWorkerSession,validStaffSession,validWorkerSession,type PageSession} from './session-state.ts';

export type StaffSessionObservation={kind:'same'|'different';session:PageSession}|{kind:'guest';session:PageSession}|{kind:'worker'};
const guest=(value:unknown):value is PageSession=>!!value && typeof value==='object' && !Array.isArray(value)
  && (value as PageSession).authenticated===false && typeof (value as PageSession).mode==='string'
  && /^[a-z][a-z0-9-]{0,63}$/.test((value as PageSession).mode!);

export async function recheckStaffSession(expected:PageSession,read:()=>Promise<unknown>,current:()=>boolean,now=Date.now):Promise<StaffSessionObservation> {
  if(!current())throw Error('Session unavailable');
  const first=await read();if(!current())throw Error('Session unavailable');
  const second=await read();if(!current())throw Error('Session unavailable');
  if(guest(first) && guest(second) && first.mode===second.mode)return {kind:'guest',session:second};
  if(validWorkerSession(first,now()) && sameWorkerSession(first,second,now()) && first.expiresAt===(second as PageSession).expiresAt)return {kind:'worker'};
  if(!validStaffSession(first,now()) || !sameStaffSession(first,second,now()))throw Error('Session unavailable');
  return {kind:sameStaffSession(expected,second,now())?'same':'different',session:second as PageSession};
}

export async function confirmStaffSession(observed:PageSession,read:()=>Promise<unknown>,current:()=>boolean,now=Date.now):Promise<PageSession> {
  if(!current())throw Error('Session unavailable');
  const verified=await read();if(!current())throw Error('Session unavailable');
  if(guest(observed) && guest(verified) && observed.mode===verified.mode)return verified;
  if(!sameStaffSession(observed,verified,now()))throw Error('Session unavailable');
  return verified as PageSession;
}
