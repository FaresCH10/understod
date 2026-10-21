import {useEffect,useRef,useState} from 'react';
import {completeStaffRequest,retainStaffRequest,StaffRequestError} from './staff-request';
import {useStaffRequest,type StaffRequestAuthority} from './useStaffRequest';
import {completePolicySave,completePolicyRejection,policyReceiptPath} from './policy-state';

type PolicyData={canWrite:boolean;recoveryScope:string|null};
type Change={requestId:string;revision:number};
export type PolicyDefinition<D extends PolicyData,C extends Change>={
  endpoint:string;
  loadEndpoint?:string;
  receiptEndpoint?:string;
  validate:(value:unknown,scope:string|null|undefined)=>D;
  read:(storage:Storage,scope:string)=>C|null;
  store:(storage:Storage,scope:string,change:C)=>void;
  clear:(storage:Storage,scope:string,id:string,expected:C)=>void;
  acknowledgement:(value:unknown,change:C)=>void;
  receipt:(value:unknown,change:C)=>void;
};

export function usePolicySettings<D extends PolicyData,C extends Change>(authority:StaffRequestAuthority,policy:PolicyDefinition<D,C>,loaded:(data:D,pending:C|null)=>void) {
  const {request,current}=useStaffRequest(authority),onLoad=useRef(loaded);onLoad.current=loaded;
  const [data,setData]=useState<D|null>(null),[pending,setPending]=useState<C|null>(null);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[tick,setTick]=useState(0);
  const busy=useRef(false),uncertain=useRef(false),scope=authority.session.staffScope;
  useEffect(()=>{
    const controller=new AbortController(),live=()=>current() && !controller.signal.aborted;
    setLoading(true);
    void (async()=>{
      const value=policy.validate(await request(policy.loadEndpoint || policy.endpoint,undefined,controller.signal),scope);
      const restored=await completeStaffRequest(value,()=>{
        const restored=value.canWrite && value.recoveryScope?policy.read(sessionStorage,value.recoveryScope):null;
        return restored;
      },restored=>{
        uncertain.current=!!restored;setData(value);setPending(restored);onLoad.current(value,restored);
      },live);
      if(restored && value.recoveryScope){
        const receipt=await request(policyReceiptPath(policy,restored.requestId),undefined,controller.signal);
        if(receipt!==null)await completeStaffRequest(receipt,row=>policy.receipt(row,restored),()=>{
          policy.clear(sessionStorage,value.recoveryScope!,restored.requestId,restored);
          uncertain.current=false;setPending(null);setSaved(true);onLoad.current(value,null);
        },live,()=>live() && authority.canMutate());
      }
      if(live())setLoading(false);
    })().catch(reason=>{if(live())setError((reason as Error).message);});
    return()=>controller.abort();
  },[request,current,scope,policy,tick]);
  async function save(proposed:C) {
    if(!data?.canWrite || !data.recoveryScope || loading || busy.current || !current() || !authority.canMutate())return;
    const change=pending || proposed,recoveryScope=data.recoveryScope,previousUncertain=uncertain.current;
    busy.current=true;setSaving(true);setError('');setSaved(false);
    let retained=false;
    try {
      policy.store(sessionStorage,recoveryScope,change);retained=true;setPending(change);
      const result=await request(policy.endpoint,change);
      await completePolicySave(result,change,policy.acknowledgement,policy.receipt,
        ()=>request(policyReceiptPath(policy,change.requestId)),()=>{
        policy.clear(sessionStorage,recoveryScope,change.requestId,change);
        uncertain.current=false;setPending(null);setSaved(true);setTick(value=>value+1);
      },current,()=>current() && authority.canMutate());
    }catch(reason){
      const keep=retainStaffRequest(previousUncertain,retained,reason instanceof StaffRequestError?reason:null);
      if(current()){
        uncertain.current=keep;setError((reason as Error).message);setLoading(true);
        if(!keep && retained){
          try {
            await completePolicyRejection(change,policy.receipt,
              ()=>request(policyReceiptPath(policy,change.requestId)),accepted=>{
                policy.clear(sessionStorage,recoveryScope,change.requestId,change);setPending(null);setSaved(accepted);
                if(accepted)setError('');setTick(value=>value+1);
              },current,()=>current() && authority.canMutate());
          }catch{uncertain.current=true;}
        }
      }
    }finally{busy.current=false;if(current())setSaving(false);}
  }
  return {data,pending,loading,saving,error,saved,save,setSaved,refresh:()=>{if(!busy.current && current()){setError('');setSaved(false);setTick(value=>value+1);}}};
}
