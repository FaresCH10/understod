import type {MessageSession} from './case-message-recovery';
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type VoicePending={id:string;hash:string};
export type VoiceScope={kind:'help';id:string}|{kind:'reply';id:string;assignmentId:string};
export type VoiceReceipt={id:string;caseId:string;assignmentId:string;kind:'help'|'reply';sha256:string;status:'storing'|'received'|'failed';createdAt:string;receivedAt:string|null};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const digest=/^[a-f0-9]{64}$/;
const identifier=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const date=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
function key(session:MessageSession,scope:VoiceScope) {
  if(!digest.test(session.clientContext) || !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt)<=Date.now()
    || !['help','reply'].includes(scope.kind) || !identifier(scope.id)||scope.kind==='reply'&&!identifier(scope.assignmentId))throw Error('Voice session unavailable');
  return `understood:case-voice:${session.clientContext}:${scope.kind}:${scope.id}`;
}
export function readVoicePending(storage:Store,session:MessageSession,scope:VoiceScope):VoicePending|null {
  const raw=storage.getItem(key(session,scope));if(raw===null)return null;if(raw.length>160)throw Error('Voice recovery unavailable');
  const row=JSON.parse(raw);if(!row || Object.keys(row).sort().join(',')!=='hash,id' || !uuid.test(row.id) || !digest.test(row.hash))throw Error('Voice recovery unavailable');return row;
}
export async function retainVoice(storage:Store,session:MessageSession,scope:VoiceScope,id:string,bytes:Uint8Array,current:()=>boolean=()=>true) {
  const expected={...session},selection=JSON.stringify(scope),assertCurrent=()=>{key(session,scope);if(!current()||session.clientContext!==expected.clientContext||session.expiresAt!==expected.expiresAt||JSON.stringify(scope)!==selection)throw Error('Voice session unavailable');};
  assertCurrent();if(!uuid.test(id) || !(bytes instanceof Uint8Array)||bytes.length<8044 || bytes.length>2880044)throw Error('Invalid voice recording');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes))),value=>value.toString(16).padStart(2,'0')).join('');
  assertCurrent();const old=readVoicePending(storage,session,scope);if(old && (old.id!==id || old.hash!==hash))throw Error('Check the pending voice receipt before sending another recording');
  const row=old || {id,hash},raw=JSON.stringify(row),name=key(session,scope);assertCurrent();storage.setItem(name,raw);
  if(storage.getItem(name)!==raw)throw Error('Voice recovery unavailable. Nothing was sent');return row;
}
export function checkedVoiceReceipt(value:unknown,scope:VoiceScope,pending:VoicePending) {
  const row=value as VoiceReceipt;
  if(!row || typeof row!=='object'||Array.isArray(row)||Object.keys(row).sort().join(',')!=='assignmentId,caseId,createdAt,id,kind,receivedAt,sha256,status'
    ||!uuid.test(pending.id)||!digest.test(pending.hash)||!identifier(scope.id)||!identifier(row.assignmentId)||row.id!==pending.id || row.kind!==scope.kind || row.sha256!==pending.hash
    || (scope.kind==='help'?(row.assignmentId!==scope.id || row.caseId!==pending.id):row.caseId!==scope.id||row.assignmentId!==scope.assignmentId)
    || !['storing','received','failed'].includes(row.status) || !date(row.createdAt)
    || (row.status==='received'? !date(row.receivedAt)||Date.parse(row.receivedAt)<Date.parse(row.createdAt):row.receivedAt!==null))throw Error('Voice receipt cannot be verified');return row;
}
export function clearVoicePending(storage:Store,session:MessageSession,scope:VoiceScope,id:string) {
  if(readVoicePending(storage,session,scope)?.id!==id)throw Error('Voice receipt changed');const name=key(session,scope);storage.removeItem(name);
  if(storage.getItem(name)!==null)throw Error('Voice recovery could not be cleared');
}
