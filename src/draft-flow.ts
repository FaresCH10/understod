export type DraftStep='source'|'processing'|'languages'|'publish';
export type DraftFlowState={id?:string;state?:string;source?:string;prepared?:{source?:unknown}|null;archive?:unknown;contentExpired?:boolean};
export function draftSteps(draft:DraftFlowState|null){
  const saved=Boolean(draft?.id),closed=Boolean(draft?.archive || draft?.contentExpired);
  const ready=saved && !closed && draft?.state==='ready' && typeof draft.source==='string' && draft.source.length>0 && draft.prepared?.source===draft.source;
  return [
    {id:'source' as const,label:'Source',status:saved?'Saved':'Not saved',available:!closed},
    {id:'processing' as const,label:'AI processing',status:closed?'Unavailable':draft?.state==='processing'?'Processing':draft?.state==='failed'?'Failed':ready?'Ready':'Not ready',available:saved && !closed},
    {id:'languages' as const,label:'Languages',status:ready?'Available':'Pending',available:saved && !closed},
    {id:'publish' as const,label:'Publish',status:ready?'Ready to publish':'Pending',available:ready},
  ];
}
