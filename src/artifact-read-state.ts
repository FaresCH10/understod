export type ArtifactReadState<T>={key:string;data:T|null;loading:boolean;error:string};
export function artifactReadKey(binding:string,path:string,refresh:number){return JSON.stringify([binding,path,refresh]);}
export function artifactReadView<T>(state:ArtifactReadState<T>,key:string,current:boolean){
  if(!current)return {data:null,loading:false,error:'Session context changed. Private results are unavailable.'};
  return state.key===key?{data:state.data,loading:state.loading,error:state.error}:{data:null,loading:true,error:''};
}
