import type {MessageSession} from './case-message-recovery.ts';
import {checkedVoiceReceipt,type VoiceReceipt,type VoiceScope,type VoicePending} from './case-voice-recovery.ts';
import {validConversationSession} from './conversation-request.ts';

export type VoiceFailure='session'|'invalid'|'unavailable'|'blocked'|'conflict'|'recovery';
export class VoiceRequestError extends Error {
  readonly code:VoiceFailure;
  constructor(code:VoiceFailure){super(code);this.code=code;}
}
export type VoiceOperation={kind:'receipt'}|{kind:'send';bytes:Uint8Array};
export type VoiceHttpReceipt=VoiceReceipt&{clientContext:string};
const id=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value);
const uuid=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const digest=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const invalid=()=>{throw new VoiceRequestError('invalid');};
const exact=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
export function checkedVoiceHttpReceipt(value:unknown,scope:VoiceScope,pending:VoicePending,context:string):VoiceHttpReceipt {
  if(!digest(context)||!exact(value,['id','caseId','assignmentId','kind','sha256','status','createdAt','receivedAt','clientContext']))return invalid();
  if(value.clientContext!==context)throw new VoiceRequestError('session');
  const {clientContext,...receipt}=value;
  try{checkedVoiceReceipt(receipt,scope,pending);}catch{return invalid();}
  return value as unknown as VoiceHttpReceipt;
}
export async function requestCaseVoice(send:typeof fetch,session:MessageSession,scope:VoiceScope,pending:VoicePending,operation:VoiceOperation,
  signal:AbortSignal,current:()=>boolean,canMutate:()=>boolean=current):Promise<VoiceHttpReceipt>{
  const identity={...session},selection={...scope},retained={...pending};
  const isCurrent=()=>current()&&validConversationSession(identity)&&validConversationSession(session)&&session.clientContext===identity.clientContext&&session.expiresAt===identity.expiresAt
    &&scope.kind===selection.kind&&scope.id===selection.id&&(scope.kind!=='reply'||selection.kind==='reply'&&scope.assignmentId===selection.assignmentId)
    &&pending.id===retained.id&&pending.hash===retained.hash;
  const assertCurrent=()=>{if(!isCurrent())throw new VoiceRequestError('session');};
  assertCurrent();
  if(!exact(scope,scope.kind==='help'?['kind','id']:['kind','id','assignmentId'])||!['help','reply'].includes(scope.kind)||!id(scope.id)
    ||scope.kind==='reply'&&!id(scope.assignmentId)||!exact(pending,['id','hash'])||!uuid(pending.id)||!digest(pending.hash))return invalid();
  if(!operation||!['receipt','send'].includes(operation.kind)||!exact(operation,operation.kind==='send'?['kind','bytes']:['kind']))return invalid();
  const mutation=operation.kind==='send';
  if(signal.aborted)throw new VoiceRequestError('unavailable');
  if(mutation&&!canMutate())throw new VoiceRequestError('blocked');
  let bytes:Uint8Array<ArrayBuffer>|undefined;
  if(mutation){
    if(!(operation.bytes instanceof Uint8Array)||operation.bytes.length<8044||operation.bytes.length>2880044)return invalid();
    bytes=new Uint8Array(operation.bytes);
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
    assertCurrent();if(hash!==retained.hash)return invalid();
  }
  const path=selection.kind==='help'?`/api/worker/briefings/${encodeURIComponent(selection.id)}/help-audio/${encodeURIComponent(retained.id)}`
    :`/api/clarifications/${encodeURIComponent(selection.id)}/voice/${encodeURIComponent(retained.id)}`;
  const requestSignal=AbortSignal.any([signal,AbortSignal.timeout(15000)]);let response:Response,value:unknown;
  try{
    assertCurrent();if(mutation&&!canMutate())throw new VoiceRequestError('blocked');
    if(requestSignal.aborted)throw new VoiceRequestError('unavailable');
    response=await send(path,{method:mutation?'POST':'GET',credentials:'include',cache:'no-store',redirect:'error',signal:requestSignal,
      headers:{'x-client-session-context':identity.clientContext,...(mutation?{'content-type':'audio/wav'}:{})},...(bytes?{body:new Uint8Array(bytes)}:{})});
    assertCurrent();if([401,403].includes(response.status))throw new VoiceRequestError('session');
    value=await response.json();assertCurrent();if(requestSignal.aborted)throw new VoiceRequestError('unavailable');
  }catch(error){if(error instanceof VoiceRequestError)throw error;assertCurrent();throw new VoiceRequestError('unavailable');}
  if(!response.ok){
    if(response.status===409&&value&&typeof value==='object'&&!Array.isArray(value)&&(value as {error?:unknown}).error==='Session context changed')throw new VoiceRequestError('session');
    throw new VoiceRequestError(response.status===409?'conflict':'unavailable');
  }
  if(mutation&&!canMutate())throw new VoiceRequestError('blocked');
  return checkedVoiceHttpReceipt(value,selection,retained,identity.clientContext);
}
