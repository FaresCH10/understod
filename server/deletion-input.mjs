import {createHash} from 'node:crypto';
import {inputKeys,crewFilters} from './people.mjs';

export function deletionFilters(filters={}){
  inputKeys(filters,['search','status','page','pageSize']);
  const status=filters.status ?? 'all';
  if(!['all','none','queued','complete'].includes(status))throw new Error('Invalid deletion filters');
  const parsed=crewFilters(Object.fromEntries(Object.entries(filters).filter(([key])=>key!=='status')));
  return {...parsed,status};
}

export function deletionInput(workerId,input){
  if(typeof workerId!=='string' || !workerId || workerId.length>100 || !input || typeof input!=='object' || Array.isArray(input)
    || Object.keys(input).some(key=>!['requestId','expectedCode','reason','confirmed'].includes(key))
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestId || '')
    || typeof input.expectedCode!=='string' || !input.expectedCode || input.expectedCode.length>100
    || !['worker_request','customer_policy'].includes(input.reason) || input.confirmed!==true)throw new Error('Invalid deletion request');
  // Receipts bind the confirmation without retaining a second copy of the worker label.
  return createHash('sha256').update(JSON.stringify([workerId,input.expectedCode,input.reason,true])).digest('hex');
}
