export type ArtifactGlossaryRow={id:string;term:string;sourceLanguage:string;targetLanguage:string;revision:number;status:'active';content:{override:string;suggestion:string|null;provenance:{adapter:string;live:boolean}|null}};
export type ArtifactGlossaryPage={items:ArtifactGlossaryRow[];total:number;page:number;pageSize:number};
export function checkedArtifactGlossary(value:unknown,target:string,page:number):ArtifactGlossaryPage {
  const r=value as ArtifactGlossaryPage;
  if(!r || Object.keys(r).sort().join(',')!=='items,page,pageSize,total' || r.page!==page || r.pageSize!==20
    || !Number.isSafeInteger(r.total) || r.total<0 || !Array.isArray(r.items) || r.items.length>20 || r.items.length>r.total
    || r.items.some(row=>!row || Object.keys(row).sort().join(',')!=='content,id,revision,sourceLanguage,status,targetLanguage,term'
      || typeof row.id!=='string' || !row.id || row.id.length>100 || typeof row.term!=='string' || !row.term.trim() || row.term.length>200
      || row.sourceLanguage!=='en' || row.targetLanguage!==target || row.status!=='active' || !Number.isSafeInteger(row.revision) || row.revision<1
      || !row.content || Object.keys(row.content).sort().join(',')!=='override,provenance,suggestion' || typeof row.content.override!=='string' || row.content.override.length>500
      || row.content.suggestion!==null && (typeof row.content.suggestion!=='string' || row.content.suggestion.length>500)
      || row.content.provenance!==null && (Object.keys(row.content.provenance).sort().join(',')!=='adapter,live'
        || typeof row.content.provenance.adapter!=='string' || row.content.provenance.adapter.length>120 || typeof row.content.provenance.live!=='boolean'))
    || new Set(r.items.map(row=>row.id)).size!==r.items.length)throw Error('Terminology could not be verified');
  return r;
}
