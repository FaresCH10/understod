import {draftLanguagesInput,sameDraftLanguages} from '../server/draft-languages-input.mjs';
export type LanguageSession={clientContext:string;expiresAt:string};
export type PendingDraftLanguages=LanguageSession & {briefingId:string;requestId:string;body:ReturnType<typeof draftLanguagesInput>};
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const key=(session:LanguageSession,id:string)=>`understood:draft-languages:${session.clientContext}:${id}`;
function checked(value:PendingDraftLanguages,session:LanguageSession,id:string) {
  if(!session || !/^[a-f0-9]{64}$/.test(session.clientContext) || !Number.isFinite(Date.parse(session.expiresAt)) || new Date(session.expiresAt).toISOString()!==session.expiresAt || Date.parse(session.expiresAt)<=Date.now())throw Error('The language settings session has ended.');
  if(!value || Object.keys(value).sort().join(',')!=='body,briefingId,clientContext,expiresAt,requestId' || typeof id!=='string' || !id || id.length>100
    || value.briefingId!==id || value.clientContext!==session.clientContext || value.expiresAt!==session.expiresAt || !value.body || 'requestId' in value.body)throw Error('Saved language change cannot be verified.');
  draftLanguagesInput({...value.body,requestId:value.requestId});return value;
}
export function readDraftLanguages(storage:Store,session:LanguageSession,id:string):PendingDraftLanguages|null {
  const raw=storage.getItem(key(session,id));if(raw===null)return null;
  try{if(raw.length>2048)throw Error();return checked(JSON.parse(raw),session,id);}catch{throw Error('Saved language change cannot be verified. No change was sent.');}
}
export function saveDraftLanguages(storage:Store,value:PendingDraftLanguages) {
  checked(value,value,value.briefingId);const old=readDraftLanguages(storage,value,value.briefingId),raw=JSON.stringify(value);
  if(old && JSON.stringify(old)!==raw)throw Error('Resolve the saved language change first.');
  storage.setItem(key(value,value.briefingId),raw);if(storage.getItem(key(value,value.briefingId))!==raw)throw Error('This tab cannot retain the change. No change was sent.');
}
export function clearDraftLanguages(storage:Store,value:PendingDraftLanguages) {
  const old=readDraftLanguages(storage,value,value.briefingId);if(!old || JSON.stringify(old)!==JSON.stringify(value))throw Error('Saved language change changed.');
  storage.removeItem(key(value,value.briefingId));if(storage.getItem(key(value,value.briefingId))!==null)throw Error('Language change receipt could not be cleared.');
}
export class DraftLanguagesError extends Error {constructor(message:string,public rejected=false){super(message);}}
export async function requestDraftLanguages(value:PendingDraftLanguages,send:boolean,fetchImpl=fetch,signal?:AbortSignal):Promise<boolean> {
  checked(value,value,value.briefingId);signal?.throwIfAborted();
  const response=await fetchImpl(send?`/api/briefings/${encodeURIComponent(value.briefingId)}/generation-languages`:`/api/briefing-languages/receipts/${value.requestId}`,{
    method:send?'POST':'GET',credentials:'include',cache:'no-store',signal,headers:{'x-client-session-context':value.clientContext,...(send?{'content-type':'application/json'}:{})},
    ...(send?{body:JSON.stringify({...value.body,requestId:value.requestId})}:{})});
  const data=await response.json();if(!response.ok)throw new DraftLanguagesError(data?.error || 'Language change unavailable.',response.status>=400 && response.status<500 && response.status!==429);
  if(!send && data?.found===false && Object.keys(data).length===1)return false;
  if(!data || data.id!==value.briefingId || data.revision!==value.body.revision+1 || (send ? typeof data.duplicate!=='boolean' : data.found!==true || !sameDraftLanguages(data.request,value.body)))throw Error('Language change receipt does not match the saved request.');
  return true;
}
