import {settingsInput,sameSettingsRequest} from '../server/settings-input.mjs';
import {policyRecoveryScope} from './policy-state.ts';
import type {WorkspaceContext} from './WorkspaceSettings.tsx';

export type SettingsKind='organization'|'site';
export type SettingsChange={requestId:string;revision:number;name:string;confirmed:true;supportEmail?:string;timezone?:string;generationLanguages?:string[];primaryContactId?:string|null;deputyContactId?:string|null};
type Storage=Pick<globalThis.Storage,'getItem'|'setItem'|'removeItem'>;
const key=(scope:string,kind:SettingsKind)=>`understood:workspace-settings:${kind}:${scope}`;
const id='10000000-0000-4000-8000-000000000001';
export function checkedWorkspaceContext(value:unknown,scope:string|null|undefined):WorkspaceContext {
  const row=value as WorkspaceContext;let identity;
  try{identity=JSON.parse(scope || '');}catch{throw Error('Workspace settings cannot be verified.');}
  if(!row || !Array.isArray(identity) || identity.length!==3 || row.organization?.id!==identity[0] || row.site?.id!==identity[1]
    || typeof row.canWrite!=='boolean' || typeof row.canWriteSite!=='boolean')throw Error('Workspace settings cannot be verified.');
  policyRecoveryScope(row.recoveryScope,scope,row.canWrite || row.canWriteSite);
  settingsInput('organization',{requestId:id,revision:row.organization.revision,name:row.organization.name,supportEmail:row.organization.supportEmail,confirmed:true});
  settingsInput('site',{requestId:id,revision:row.site.revision,name:row.site.name,timezone:row.site.timezone,generationLanguages:row.site.generationLanguages,confirmed:true});
  for(const contact of [row.site.primaryContact,row.site.deputyContact])if(contact!==null && (!contact || typeof contact.id!=='string' || !contact.id || contact.id.length>100
    || typeof contact.name!=='string' || !contact.name || contact.name.length>120 || !['owner','administrator','supervisor','auditor'].includes(contact.role)
    || typeof contact.available!=='boolean' || contact.available && !['owner','supervisor'].includes(contact.role)
    || Object.keys(contact).sort().join(',')!=='available,id,name,role'))throw Error('Workspace contacts cannot be verified.');
  return row;
}
export function readSettingsChange(storage:Storage,scope:string,kind:SettingsKind):SettingsChange|null {
  const raw=storage.getItem(key(scope,kind));if(raw===null)return null;
  try{if(raw.length>2048)throw Error();const value=JSON.parse(raw);settingsInput(kind,value);return value;}
  catch{throw Error('Saved workspace settings cannot be verified.');}
}
export function storeSettingsChange(storage:Storage,scope:string,kind:SettingsKind,value:SettingsChange) {
  const intent=settingsInput(kind,value),old=readSettingsChange(storage,scope,kind);
  if(old && (old.requestId!==value.requestId || !sameSettingsRequest(settingsInput(kind,old),intent)))throw Error('Resolve the original workspace save first.');
  const raw=JSON.stringify(value);storage.setItem(key(scope,kind),raw);
  if(storage.getItem(key(scope,kind))!==raw)throw Error('Workspace recovery storage is unavailable. No request was sent.');
}
export function clearSettingsChange(storage:Storage,scope:string,kind:SettingsKind,requestId:string,expected:SettingsChange) {
  const old=readSettingsChange(storage,scope,kind);
  if(!old || old.requestId!==requestId || !sameSettingsRequest(settingsInput(kind,old),settingsInput(kind,expected)))throw Error('The original workspace save changed.');
  storage.removeItem(key(scope,kind));if(storage.getItem(key(scope,kind))!==null)throw Error('Workspace recovery storage could not be cleared.');
}
export function checkedSettingsReceipt(value:unknown,kind:SettingsKind,expected:SettingsChange) {
  const row=value as {requestId?:string;kind?:string;revision?:number;request?:unknown};
  if(!row || typeof row!=='object' || Array.isArray(row) || Object.keys(row).sort().join(',')!=='kind,request,requestId,revision'
    || row.kind!==kind || row.requestId!==expected.requestId || row.revision!==expected.revision+1
    || !sameSettingsRequest(row.request,settingsInput(kind,expected)))throw Error('Workspace settings receipt cannot be verified.');
}
