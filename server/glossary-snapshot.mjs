import {createHash} from 'node:crypto';
export function glossarySnapshot(rows) {
  const revision=rows.reduce((sum,row)=>sum+row.revision,0);
  if(!Number.isSafeInteger(revision)) throw new Error('Glossary revision exhausted');
  const terms=rows.filter(row=>row.status==='active').map(row=>{
    const content=typeof row.content_json==='string' ? JSON.parse(row.content_json) : row.content_json;
    return {id:row.id,revision:row.revision,term:row.term,sourceLanguage:row.source_lang,targetLanguage:row.target_lang,override:content.override,suggestion:content.suggestion,
      provenance:content.provenance ? {adapter:content.provenance.adapter,live:content.provenance.live} : null};
  }).sort((a,b)=>a.id.localeCompare(b.id,'en'));
  // Every site draft consumes this complete terminology snapshot. Its hash includes optional overrides.
  return {revision,hash:createHash('sha256').update(JSON.stringify(terms)).digest('hex'),terms};
}
