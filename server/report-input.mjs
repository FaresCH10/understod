export function reportPublicationFilters(input={}) {
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>!['search','from','through','page','pageSize'].includes(key)))throw Error('Invalid report publication filter');
  const {search='',from='',through=''}=input,page=Number(input.page ?? 1),pageSize=Number(input.pageSize ?? 20);
  if(typeof search!=='string' || search.length>120 || !Number.isSafeInteger(page) || page<1 || page>5000 || !Number.isInteger(pageSize) || pageSize<1 || pageSize>50)throw Error('Invalid report publication filter');
  for(const value of [from,through]) {
    if(typeof value!=='string')throw Error('Invalid report publication date');
    if(value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000') || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0,10)!==value))throw Error('Invalid report publication date');
  }
  if(from && through && from>through)throw Error('Invalid report publication date');
  return {search:search.trim(),from,through,page,pageSize};
}
export function reportScope(input={}) {
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>!['crewId','responseFrom','responseThrough'].includes(key)))throw Error('Invalid report scope');
  const {crewId='',responseFrom='',responseThrough=''}=input;
  if(typeof crewId!=='string' || crewId.length>100 || (crewId && crewId!=='@unassigned' && !/^[a-zA-Z0-9_-]+$/.test(crewId)))throw Error('Invalid report scope');
  const dates=reportPublicationFilters({from:responseFrom,through:responseThrough});
  return {crewId,responseFrom:dates.from,responseThrough:dates.through};
}
export function exportRequestId(value) {
  if(typeof value!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw Error('Invalid export request');
  return value;
}
export function exportInput(value) {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(key=>!['requestId','publicationId','filters'].includes(key))
    || typeof value.publicationId!=='string' || !value.publicationId || value.publicationId.length>100 || /[\u0000-\u001f\u007f]/.test(value.publicationId))throw Error('Invalid export request');
  return {requestId:exportRequestId(value.requestId),publicationId:value.publicationId,filters:reportScope(value.filters)};
}
export function exportRetryInput(id,value) {
  exportRequestId(id);
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).sort().join(',')!=='attempts,requestId'
    || !Number.isInteger(value.attempts) || value.attempts<0 || value.attempts>=3)throw Error('Invalid export request');
  return {requestId:exportRequestId(value.requestId),exportId:id,attempts:value.attempts};
}
