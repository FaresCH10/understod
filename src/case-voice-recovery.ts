import type {MessageSession} from './case-message-recovery';
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type VoicePending={id:string;hash:string};
export type VoiceScope={kind:'help'|'reply';id:string};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const digest=/^[a-f0-9]{64}$/;
function key(session:MessageSession,scope:VoiceScope) {
  if(!digest.test(session.clientContext) || !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt)<=Date.now()
    || !['help','reply'].includes(scope.kind) || !/^[A-Za-z0-9_-]{1,100}$/.test(scope.id))throw Error('Voice session unavailable');
  return `understood:case-voice:${session.clientContext}:${scope.kind}:${scope.id}`;
}
export function readVoicePending(storage:Store,session:MessageSession,scope:VoiceScope):VoicePending|null {
  const raw=storage.getItem(key(session,scope));if(raw===null)return null;if(raw.length>160)throw Error('Voice recovery unavailable');
  const row=JSON.parse(raw);if(!row || Object.keys(row).sort().join(',')!=='hash,id' || !uuid.test(row.id) || !digest.test(row.hash))throw Error('Voice recovery unavailable');return row;
}
export async function retainVoice(storage:Store,session:MessageSession,scope:VoiceScope,id:string,bytes:Uint8Array) {
  if(!uuid.test(id) || bytes.length<8044 || bytes.length>2880044)throw Error('Invalid voice recording');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes))),value=>value.toString(16).padStart(2,'0')).join('');
  const old=readVoicePending(storage,session,scope);if(old && (old.id!==id || old.hash!==hash))throw Error('Check the pending voice receipt before sending another recording');
  const row=old || {id,hash},raw=JSON.stringify(row),name=key(session,scope);storage.setItem(name,raw);
  if(storage.getItem(name)!==raw)throw Error('Voice recovery unavailable. Nothing was sent');return row;
}
export function checkedVoiceReceipt(value:unknown,scope:VoiceScope,pending:VoicePending) {
  const row=value as {id:string;caseId:string;assignmentId:string;kind:string;sha256:string;status:string;createdAt:string;receivedAt:string|null};
  if(!row || row.id!==pending.id || row.kind!==scope.kind || row.sha256!==pending.hash
    || (scope.kind==='help'?(row.assignmentId!==scope.id || row.caseId!==pending.id):row.caseId!==scope.id)
    || !['storing','received','failed'].includes(row.status) || !Number.isFinite(Date.parse(row.createdAt))
    || (row.status==='received'? !row.receivedAt || !Number.isFinite(Date.parse(row.receivedAt)):row.receivedAt!==null))throw Error('Voice receipt cannot be verified');return row;
}
export function clearVoicePending(storage:Store,session:MessageSession,scope:VoiceScope,id:string) {
  if(readVoicePending(storage,session,scope)?.id!==id)throw Error('Voice receipt changed');const name=key(session,scope);storage.removeItem(name);
  if(storage.getItem(name)!==null)throw Error('Voice recovery could not be cleared');
}
