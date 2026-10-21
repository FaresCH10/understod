import {createStaffRequest,completeStaffRequest,StaffRequestError} from './staff-request.ts';
import type {PageSession} from './session-state.ts';

export function checkedPreparationAcknowledgement(raw:unknown,id?:string) {
  const row=raw as {id:string;state:'processing';duplicate:boolean};
  if(!row || Object.keys(row).sort().join(',')!=='duplicate,id,state' || typeof row.id!=='string' || !/^[A-Za-z0-9_-]{1,100}$/.test(row.id)
    || id!==undefined && row.id!==id || row.state!=='processing' || typeof row.duplicate!=='boolean')throw Error('Preparation acknowledgement cannot be verified. Refresh the job before continuing.');
  return row;
}
export async function appStaffAction(session:PageSession,path:string,body:unknown,fetcher:typeof fetch,current:()=>boolean,canMutate:()=>boolean,onSessionLost:()=>void,onAccepted:()=>void) {
  const logout=path==='/logout',process=/^\/briefings\/[A-Za-z0-9_-]{1,100}\/process$/.test(path),input=body as {revision:number};
  if(!logout && !process || !body || typeof body!=='object' || Array.isArray(body)
    || logout && Object.keys(body).length || process && (Object.keys(body).join(',')!=='revision' || !Number.isSafeInteger(input.revision) || input.revision<1 || input.revision>1000000000))throw new StaffRequestError('Invalid staff action.');
  const request=createStaffRequest(session,current,fetcher,Date.now,canMutate,onSessionLost),value=await request('/api'+path,body);
  return completeStaffRequest(value,raw=>{
    if(!logout)return checkedPreparationAcknowledgement(raw);
    const row=raw as {ok:boolean};if(!row || Object.keys(row).join(',')!=='ok' || row.ok!==true)throw Error('Sign-out acknowledgement cannot be verified.');return row;
  },onAccepted,current,canMutate);
}
