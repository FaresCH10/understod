import {inputKeys} from './people.mjs';

export function staffSiteScope(session) {
  return session?.principal_type==='staff' ? JSON.stringify([session.org_id,session.site_id,session.principal_id]) : null;
}

export function accountSiteFilters(input={}) {
  inputKeys(input,['page','pageSize']);
  for(const field of ['page','pageSize']) if(input[field]!==undefined && !(typeof input[field]==='number'
    || (typeof input[field]==='string' && /^[0-9]{1,5}$/.test(input[field])))) throw new Error('Invalid account site request');
  const page=Number(input.page ?? 1),pageSize=Number(input.pageSize ?? 20);
  if(!Number.isInteger(page) || page<1 || page>5000 || !Number.isInteger(pageSize) || pageSize<1 || pageSize>50)
    throw new Error('Invalid account site request');
  return {page,pageSize};
}

export function accountSiteInput(input) {
  inputKeys(input,['staffId']);
  if(typeof input.staffId!=='string' || !input.staffId || input.staffId.length>100 || /[\u0000-\u001f\u007f]/.test(input.staffId))
    throw new Error('Invalid account site request');
  return input.staffId;
}
