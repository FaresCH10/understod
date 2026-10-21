import {useMemo,useRef} from 'react';
import {useStaffRequest,type StaffRequestAuthority} from './useStaffRequest';
import {completeStaffRequest} from './staff-request';
import {checkedArtifactScope,completeArtifactMutation} from './artifact-request';

type Pending={requestId:string;body:Record<string,unknown>};
export type ArtifactDefinition<P extends Pending,R>={
  endpoint:string;path:(pending:P)=>string;
  roles?:readonly string[];receiptPath?:(pending:P)=>string;payload?:(pending:P)=>unknown;
  result:(value:unknown,pending:P)=>R;
  receipt:(value:unknown,pending:P)=>R|null;
  clear:(storage:Storage,scope:string,id:string,expected:P)=>void;
};
export function useArtifactRequest<P extends Pending,R>(authority:StaffRequestAuthority,scope:string|null|undefined,definition:ArtifactDefinition<P,R>) {
  const {request:bound,current}=useStaffRequest(authority),latest=useRef(authority);latest.current=authority;
  return useMemo(()=>{
    const recoveryScope=()=>checkedArtifactScope(scope,latest.current.session,definition.roles);
    const receiptPath=(pending:P)=>definition.receiptPath?.(pending) || `/receipts/${encodeURIComponent(pending.requestId)}`;
    const request=<T,>(path:string,body?:unknown,signal?:AbortSignal)=>bound<T>(`${definition.endpoint}${path}`,body,signal);
    const complete=(pending:P,result:R,onAccepted:(value:R)=>void)=>{
      definition.clear(sessionStorage,recoveryScope(),pending.requestId,pending);onAccepted(result);
    };
    return {current,request,recoveryScope,
      check:async(pending:P,onAccepted:(value:R)=>void,onMissing:()=>void,signal?:AbortSignal)=>{
        recoveryScope();const expected=structuredClone(pending),live=()=>current() && !signal?.aborted;
        const value=await request(receiptPath(expected),undefined,signal);
        await completeStaffRequest(value,row=>definition.receipt(row,expected),result=>{
          if(result===null)onMissing();else complete(expected,result,onAccepted);
        },live,()=>live() && latest.current.canMutate());
      },
      write:async(pending:P,onAccepted:(value:R)=>void)=>{
        recoveryScope();const expected=structuredClone(pending);
        const ack=await request(definition.path(expected),definition.payload?definition.payload(expected):{...expected.body,requestId:expected.requestId});
        return completeArtifactMutation(ack,expected,definition.result,definition.receipt,
          ()=>request(receiptPath(expected)),result=>complete(expected,result,onAccepted),
          current,()=>current() && latest.current.canMutate());
      }
    };
  },[bound,current,scope,definition]);
}
