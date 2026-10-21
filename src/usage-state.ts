import {usageModel,type UsageModel,type ProviderAllowance} from '../server/usage.mjs';
const keys=(row:unknown,list:string)=>!!row && typeof row==='object' && !Array.isArray(row) && Object.keys(row).sort().join(',')===list;
const count=(value:unknown):value is number=>Number.isSafeInteger(value) && (value as number)>=0;
function same(a:unknown,b:unknown):boolean {
  if(a===b)return true;
  if(Array.isArray(a) || Array.isArray(b))return Array.isArray(a) && Array.isArray(b) && a.length===b.length && a.every((value,index)=>same(value,b[index]));
  if(!a || !b || typeof a!=='object' || typeof b!=='object' || Object.keys(a).sort().join(',')!==Object.keys(b).sort().join(','))return false;
  return Object.keys(a).every(key=>same((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key]));
}
export function checkedProviderAllowance(raw:unknown):ProviderAllowance {
  const row=raw as ProviderAllowance;
  if(!keys(row,'billingVerified,dataClass,day,jobsPaused,limit,providerPaused,reason,remaining,requests,reserved,resetsAt,state,timezone')
    || row.timezone!=='UTC' || row.dataClass!=='synthetic' || row.billingVerified!==false || !/^\d{4}-\d{2}-\d{2}$/.test(row.day)
    || !Number.isFinite(Date.parse(`${row.day}T00:00:00.000Z`)) || new Date(`${row.day}T00:00:00.000Z`).toISOString().slice(0,10)!==row.day
    || row.resetsAt!==new Date(Date.parse(`${row.day}T00:00:00.000Z`)+86400000).toISOString()
    || ![row.limit,row.reserved,row.remaining].every(count) || row.remaining!==Math.max(0,row.limit-row.reserved)
    || !keys(row.requests,'accepted,rejected,started,uncertain') || !Object.values(row.requests).every(count)
    || typeof row.jobsPaused!=='boolean' || typeof row.providerPaused!=='boolean'
    || !['quota_closed','jobs_paused','provider_paused','daily_allowance_exhausted','available'].includes(row.reason)
    || row.state!==(row.reason==='quota_closed'?'closed':row.reason==='available'?'available':row.reason==='daily_allowance_exhausted'?'exhausted':'paused'))throw Error('Organization allowance cannot be verified.');
  return row;
}
export function checkedUsageModel(raw:unknown,mode:string|undefined,role:string|null|undefined):UsageModel {
  const row=raw as UsageModel,base='controls,denominator,mode,period,plan,providerAllowance,publication,spend,units';
  if(!(keys(row,base) || keys(row,'changeRequestsAvailable,'+base)) || row.mode!==mode || !['synthetic-demo','synthetic-credential'].includes(row.mode)
    || !['owner','administrator','supervisor','auditor'].includes(role || '') || !Array.isArray(row.units) || row.units.length!==5
    || row.changeRequestsAvailable!==undefined && (typeof row.changeRequestsAvailable!=='boolean' || row.changeRequestsAvailable!==['owner','administrator','supervisor'].includes(role || '')))throw Error('Plan and usage cannot be verified.');
  const units=row.units,assigned=units[0]?.used;
  if(!count(assigned) || units.some(unit=>!unit || !count(unit.used) || unit.used>assigned || unit.limit!==assigned))throw Error('Briefing usage counts cannot be verified.');
  const publication=row.publication;
  if(publication!==null && (!keys(publication,'id,state,version') || typeof publication.id!=='string' || !publication.id || publication.id.length>100 || /[\x00-\x1f\x7f]/.test(publication.id)
    || !Number.isSafeInteger(publication.version) || publication.version<1 || publication.state!=='published'))throw Error('Usage publication cannot be verified.');
  const providerAllowance=row.providerAllowance===null?null:checkedProviderAllowance(row.providerAllowance);
  const expected=usageModel({mode:row.mode,metrics:{assigned,responses:units[1].used,matches:units[2].used,clarifications:units[3].used,pending:units[4].used},latestPublication:publication,providerAllowance});
  if(row.changeRequestsAvailable!==undefined)expected.changeRequestsAvailable=row.changeRequestsAvailable;
  if(!same(row,expected))throw Error('Plan, spend and allowance evidence cannot be verified.');
  return row;
}
