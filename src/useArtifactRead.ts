import {useEffect,useState} from 'react';
import {useStaffRequest,type StaffRequestAuthority} from './useStaffRequest';
import {staffRequestBinding} from './staff-request';
import {artifactReadKey,artifactReadView,type ArtifactReadState} from './artifact-read-state';

export function useArtifactRead<T>(authority:StaffRequestAuthority,path:string,refresh:number,paused=false) {
  const {request,current}=useStaffRequest(authority);
  const key=artifactReadKey(staffRequestBinding(authority.session),path,refresh);
  const [state,setState]=useState<ArtifactReadState<T>>({key,data:null,loading:true,error:''});
  useEffect(()=>{
    if(paused)return;
    const controller=new AbortController(),live=()=>current() && !controller.signal.aborted;
    setState({key,data:null,loading:true,error:''});
    request<T>(path,undefined,controller.signal).then(value=>{if(live())setState({key,data:value,loading:false,error:''});})
      .catch(reason=>{if(live())setState({key,data:null,loading:false,error:reason.message});});
    return()=>controller.abort();
  },[key,path,paused,request,current]);
  return artifactReadView(state,key,current());
}
