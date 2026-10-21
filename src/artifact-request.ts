import {completeStaffRequest,StaffRequestError} from './staff-request.ts';
import {validStaffSession,type PageSession} from './session-state.ts';

export function checkedArtifactScope(scope:string|null|undefined,session:PageSession,roles:readonly string[]=['owner','supervisor']) {
  if(!validStaffSession(session) || !roles.includes(session.staffRole || '') || !scope || scope!==session.staffScope)
    throw new StaffRequestError('Artifact recovery scope cannot be verified. Saved requests are unchanged.',false,null,true);
  return scope;
}
export async function completeArtifactMutation<P,R>(ack:unknown,pending:P,result:(value:unknown,pending:P)=>R,
  receipt:(value:unknown,pending:P)=>R|null,readReceipt:()=>Promise<unknown>,complete:(value:R)=>void,
  current:()=>boolean,canComplete:()=>boolean=current) {
  return completeStaffRequest(ack,async value=>{
    const accepted=result(value,pending),saved=receipt(await readReceipt(),pending);
    if(saved===null || JSON.stringify(accepted)!==JSON.stringify(saved))throw Error('Artifact acknowledgement and saved receipt do not match. The original request is retained.');
    return saved;
  },complete,current,canComplete);
}
