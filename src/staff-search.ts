export type SearchKind='briefing'|'worker'|'crew';
export type SearchItem={kind:SearchKind;id:string;label:string;status:string};
export type SearchPage={items:SearchItem[];counts:Record<SearchKind,number>;total:number;query:string;kind:'all'|SearchKind;page:number;pageSize:number;kinds:SearchKind[]};
const kinds:SearchKind[]=['briefing','worker','crew'];
const id=(value:unknown)=>typeof value==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
export function searchDestination(item:SearchItem){
  if(!kinds.includes(item.kind) || !id(item.id))throw Error('Search destination unavailable.');
  return item.kind==='briefing'?`briefings/${item.id}`:`people/${item.kind}/${item.id}`;
}
export function searchRoute(query:string){return `search/${encodeURIComponent(query.trim())}`;}
export function searchRouteQuery(route:string){
  if(route==='search')return '';
  try{const value=decodeURIComponent(route.slice('search/'.length));
    if(value.length>80 || /[\u0000-\u001f\u007f]/.test(value))throw Error();return value.trim();}
  catch{throw Error('Search address is invalid.');}
}
export function checkedSearchPage(value:unknown,{query,kind,page}:{query:string;kind:'all'|SearchKind;page:number}):SearchPage{
  const result=value as SearchPage;
  if(!result || result.query!==query || result.kind!==kind || result.page!==page || result.pageSize!==20
    || !Array.isArray(result.kinds) || !result.kinds.length || result.kinds.some(item=>!kinds.includes(item)) || new Set(result.kinds).size!==result.kinds.length
    || !result.counts || Object.keys(result.counts).sort().join(',')!=='briefing,crew,worker' || kinds.some(item=>!Number.isSafeInteger(result.counts[item]) || result.counts[item]<0 || !result.kinds.includes(item) && result.counts[item]!==0)
    || !Number.isSafeInteger(result.total) || result.total<0 || result.total!==(kind==='all'?result.kinds.reduce((n,item)=>n+result.counts[item],0):result.counts[kind])
    || !Array.isArray(result.items) || result.items.length>20 || result.items.length>result.total
    || result.items.some(item=>!item || !result.kinds.includes(item.kind) || kind!=='all' && item.kind!==kind || !id(item.id)
      || typeof item.label!=='string' || !item.label.length || item.label.length>120 || typeof item.status!=='string' || !/^[a-z_]{1,30}$/.test(item.status))
    || new Set(result.items.map(item=>`${item.kind}:${item.id}`)).size!==result.items.length)
    throw Error('Search results could not be verified.');
  return result;
}
