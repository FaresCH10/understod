export type PendingImport={requestId:string;sha256:string;filenameHash:string;phase:'preview'|'confirm';bytes:number|null};
export type ImportRow={row:number;workerId:string;language:string;crew:string;errors:string[];valid:boolean};
export type ImportPreview={id:string;filename:string;sha256:string;filenameHash:string;status:'validated'|'imported'|'expired';createdAt:string;expiresAt:string;totalRows:number;validRows:number;invalidRows:number;rows:ImportRow[];errors:string[];imported:number;duplicate?:boolean};
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const uuid=(value:unknown):value is string=>typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const hash=(value:unknown):value is string=>typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
const object=(value:unknown,fields:string[]):value is Record<string,unknown>=>!!value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).every(key=>fields.includes(key));
const count=(value:unknown):value is number=>Number.isSafeInteger(value) && Number(value)>=0 && Number(value)<=1000;
const date=(value:unknown)=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
const errors=(value:unknown):value is string[]=>Array.isArray(value) && value.length<=32 && value.every(item=>typeof item==='string' && item.length<=8192);
const digest=async(value:BufferSource)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),byte=>byte.toString(16).padStart(2,'0')).join('');
function checkedPending(value:unknown):PendingImport {
  if(!object(value,['requestId','sha256','filenameHash','phase','bytes']) || !uuid(value.requestId) || !hash(value.sha256) || !hash(value.filenameHash)
    || !['preview','confirm'].includes(String(value.phase)) || (value.phase==='preview' ? !Number.isSafeInteger(value.bytes) || Number(value.bytes)<1 || Number(value.bytes)>256*1024 : value.bytes!==null))throw Error('Pending import cannot be verified.');
  return value as PendingImport;
}
const signature=(value:PendingImport)=>{checkedPending(value);return JSON.stringify([value.requestId,value.sha256,value.filenameHash,value.phase,value.bytes]);};
function key(scope:string) {
  let identity;try{identity=JSON.parse(scope);}catch{throw Error('Import recovery identity is unavailable.');}
  if(!Array.isArray(identity) || identity.length!==3 || identity.some(value=>typeof value!=='string' || !value.trim() || value.length>100 || /[\u0000-\u001f\u007f]/.test(value)) || scope!==JSON.stringify(identity))throw Error('Import recovery identity is unavailable.');
  return `understood:imports:${scope}`;
}
export async function preparePendingImport(file:File,requestId:string):Promise<PendingImport> {
  if(!(file instanceof File) || !uuid(requestId) || file.size<1 || file.size>256*1024 || !/^[^/\\\u0000-\u001f]{1,116}\.csv$/i.test(file.name))throw Error('CSV must have a valid filename and contain 1 byte to 256 KiB.');
  return {requestId,sha256:await digest(await file.arrayBuffer()),filenameHash:await digest(new TextEncoder().encode(file.name)),phase:'preview',bytes:file.size};
}
export function readPendingImport(storage:Store,scope:string):PendingImport|null {
  let raw;try{raw=storage.getItem(key(scope));}catch{throw Error('Import recovery storage is unavailable.');}
  if(raw===null)return null;
  try{if(raw.length>1000)throw Error();return checkedPending(JSON.parse(raw));}catch{throw Error('Pending import cannot be verified.');}
}
export function savePendingImport(storage:Store,scope:string,pending:PendingImport) {
  const old=readPendingImport(storage,scope),expected=signature(pending);
  if(old && signature(old)!==expected)throw Error('Resolve the pending import before changing its intent.');
  const raw=JSON.stringify(pending);
  try{storage.setItem(key(scope),raw);if(storage.getItem(key(scope))!==raw)throw Error();}catch{throw Error('Import recovery storage is unavailable. No request was sent.');}
}
export function clearPendingImport(storage:Store,scope:string,pending:PendingImport) {
  const old=readPendingImport(storage,scope);if(!old || signature(old)!==signature(pending))throw Error('Pending import changed.');
  try{storage.removeItem(key(scope));if(storage.getItem(key(scope))!==null)throw Error();}catch{throw Error('Import recovery could not be cleared.');}
}
export function checkedImportPreview(value:unknown,id:string,expected?:PendingImport):ImportPreview {
  const invalid=()=>Error('Import preview cannot be verified or does not match its saved intent.');
  if(!object(value,['id','filename','sha256','filenameHash','status','createdAt','expiresAt','totalRows','validRows','invalidRows','rows','errors','imported','duplicate'])
    || !uuid(id) || value.id!==id || typeof value.filename!=='string' || !value.filename.length || value.filename.length>120 || !hash(value.sha256) || !hash(value.filenameHash)
    || !['validated','imported','expired'].includes(String(value.status)) || !date(value.createdAt) || !date(value.expiresAt)
    || !count(value.totalRows) || !count(value.validRows) || !count(value.invalidRows) || !count(value.imported)
    || !Array.isArray(value.rows) || value.rows.length!==value.totalRows || !errors(value.errors) || value.validRows+value.invalidRows!==value.totalRows
    || value.duplicate!==undefined && typeof value.duplicate!=='boolean')throw invalid();
  const rows=new Set<number>();
  for(const row of value.rows) {
    if(!object(row,['row','workerId','language','crew','errors','valid']) || !Number.isSafeInteger(row.row) || Number(row.row)<2 || Number(row.row)>1001 || rows.has(Number(row.row))
      || [row.workerId,row.language,row.crew].some(item=>typeof item!=='string' || item.length>4096) || !errors(row.errors) || typeof row.valid!=='boolean' || row.valid!==(row.errors.length===0))throw invalid();
    rows.add(Number(row.row));
  }
  if(value.rows.filter(row=>row.valid).length!==value.validRows || value.status==='validated' && value.imported!==0
    || value.status==='imported' && (value.imported!==value.totalRows || value.invalidRows!==0 || value.errors.length!==0)
    || value.status==='expired' && value.totalRows!==0)throw invalid();
  if(expected && (checkedPending(expected).requestId!==id || value.sha256!==expected.sha256 || value.filenameHash!==expected.filenameHash))throw invalid();
  return value as ImportPreview;
}
export function checkedImportAcknowledgement(value:unknown,preview:ImportPreview) {
  if(!object(value,['id','status','imported','duplicate']) || value.id!==preview.id || value.status!=='imported' || value.imported!==preview.totalRows || typeof value.duplicate!=='boolean')throw Error('Import acknowledgement cannot be verified.');
  return value;
}
export function importRecoveryDecision(preview:ImportPreview,pending:PendingImport) {
  checkedImportPreview(preview,pending.requestId,pending);
  return preview.status==='validated' ? pending.phase==='confirm'?'waiting':'ready' : preview.status;
}
