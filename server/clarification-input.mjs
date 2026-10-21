const id = (value) => typeof value==='string' && value.length>0 && value.length<=100;
const uuid = (value) => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function helpInput(assignmentId,input) {
  if (!id(assignmentId) || !uuid(input?.requestId) || typeof input.text!=='string' || input.text.trim().length<3
    || input.text.length>500 || Object.keys(input).some((key) => !['requestId','text'].includes(key))) throw new Error('Invalid help request');
  return {requestId:input.requestId,text:input.text.trim()};
}

export function workerHelpHistoryInput(assignmentId,input={}) {
  const invalid=()=>{throw new Error('Invalid help history request');};
  if(!id(assignmentId) || /[\u0000-\u0020\u007f]/.test(assignmentId) || !input || typeof input!=='object'
    || Array.isArray(input) || Object.keys(input).some(key=>!['page','pageSize'].includes(key)))return invalid();
  const {page=1,pageSize=5}=input;
  if(!['string','number'].includes(typeof page) || !/^[1-9][0-9]{0,3}$/.test(String(page)) || Number(page)>5000
    || ![5,'5'].includes(pageSize))return invalid();
  return {page:Number(page),pageSize:5};
}

export function clarificationFilters(filters={}) {
  if (!filters || typeof filters!=='object' || Array.isArray(filters) || Object.keys(filters).some((key) => !['search','status','owner','overdue','page','pageSize'].includes(key))) throw new Error('Invalid clarification filter');
  const {search='',status='all',owner='all',overdue='all'}=filters,page=Number(filters.page ?? 1),pageSize=Number(filters.pageSize ?? 20);
  if (typeof search!=='string' || search.length>80 || !['all','open','resolved'].includes(status) || !id(owner)
    || !['all','true','false'].includes(overdue) || !Number.isSafeInteger(page) || page<1 || page>5000
    || !Number.isSafeInteger(pageSize) || pageSize<1 || pageSize>50) throw new Error('Invalid clarification filter');
  return {search:search.trim(),status,owner,overdue,page,pageSize};
}

export function resolutionInput(input) {
  if (!input || typeof input.notes!=='string' || input.notes.trim().length<5 || input.notes.length>1000
    || Object.keys(input).some((key) => key!=='notes')) throw new Error('Resolution notes are required');
  return input.notes.trim();
}

export function ownerInput(input) {
  if (!input || !(input.ownerId===null || id(input.ownerId)) || Object.keys(input).some((key) => key!=='ownerId')) throw new Error('Invalid clarification owner');
  return input.ownerId;
}
