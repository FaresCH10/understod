export const audioRetentionDays=Object.freeze([7,30,90,365]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function retentionInput(input){
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>!['requestId','revision','audioDays','confirmed'].includes(key))
    || !UUID.test(input.requestId || '') || !Number.isSafeInteger(input.revision) || input.revision<0 || !audioRetentionDays.includes(input.audioDays) || input.confirmed!==true)throw new Error('Invalid retention policy');
  return {revision:input.revision,audioDays:input.audioDays,confirmed:true};
}
