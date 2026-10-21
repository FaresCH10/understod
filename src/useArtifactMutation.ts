import {useRef,useState} from 'react';
import {StaffRequestError,retainStaffRequest} from './staff-request';
import {useArtifactRequest,type ArtifactDefinition} from './useArtifactRequest';
import type {StaffRequestAuthority} from './useStaffRequest';

type Pending={requestId:string;body:Record<string,unknown>};
export function useArtifactMutation<P extends Pending,R>(authority:StaffRequestAuthority,scope:string|null|undefined,
  definition:ArtifactDefinition<P,R>,save:(storage:Storage,scope:string,pending:P)=>void,
  canWrite:boolean,onAccepted:(result:R,pending:P)=>void,initial:P|null=null) {
  const api=useArtifactRequest(authority,scope,definition),pending=useRef<P|null>(initial),sending=useRef(false);
  const accepted=useRef(onAccepted);accepted.current=onAccepted;
  const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(!!initial),[checked,setChecked]=useState(false),[error,setError]=useState('');
  const complete=(result:R,value:P)=>{pending.current=null;setUncertain(false);setChecked(false);accepted.current(result,value);};
  async function check(signal?:AbortSignal) {
    const value=pending.current;if(!value || sending.current || !api.current())return;
    sending.current=true;setBusy(true);setChecked(false);setError('');
    const live=()=>api.current() && !signal?.aborted;
    try {await api.check(value,result=>complete(result,value),()=>setChecked(true),signal);}
    catch(reason){if(live())setError((reason as Error).message);}
    finally {sending.current=false;if(live())setBusy(false);}
  }
  async function write(value:P) {
    if(sending.current || !canWrite || !api.current() || !authority.canMutate() || uncertain && !checked)return;
    sending.current=true;setBusy(true);setError('');setChecked(false);
    const previous=uncertain;let retained=false;
    try {
      save(sessionStorage,api.recoveryScope(),value);pending.current=value;retained=true;
      await api.write(value,result=>complete(result,value));
    } catch(reason) {
      if(!api.current())return;
      let unknown=retainStaffRequest(previous,retained,reason instanceof StaffRequestError?reason:null),resolved=false;
      // A known first rejection still needs an exact receipt before its intent can be discarded.
      if(retained && !unknown) {
        try {await api.check(value,result=>{resolved=true;complete(result,value);},()=>{
          definition.clear(sessionStorage,api.recoveryScope(),value.requestId,value);pending.current=null;
        });}catch{unknown=true;}
      }
      if(api.current() && !resolved){setUncertain(unknown);setError((reason as Error).message);}
    } finally {sending.current=false;if(api.current())setBusy(false);}
  }
  return {api,pending,busy,uncertain,checked,error,check,write,clearError:()=>setError('')};
}
