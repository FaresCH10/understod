export const textRetentionDays=Object.freeze([7,30,90,365]);
export function textRetentionRequestId(value) {
  if(typeof value!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value))throw Error('Invalid text retention request');
  return value;
}
export function textRetentionInput(input) {
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).sort().join(',')!=='confirmed,days,requestId,revision'
    || !Number.isSafeInteger(input.revision) || input.revision<0 || !(input.days===null || textRetentionDays.includes(input.days))
    || input.confirmed!==true)throw Error('Invalid text retention policy');
  textRetentionRequestId(input.requestId);
  return {revision:input.revision,days:input.days,confirmed:true};
}
