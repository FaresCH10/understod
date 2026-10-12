export function historyIdentity(value) {
  if(typeof value!=='string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value))throw Error('Invalid publication history request');
  return value;
}

export function publicationHistoryFilters(input={}) {
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>!['page','pageSize','version'].includes(key)))throw Error('Invalid publication history request');
  const integer=(value,max)=>{
    if(typeof value!=='number' && (typeof value!=='string' || !/^[1-9][0-9]*$/.test(value)))throw Error('Invalid publication history request');
    const number=Number(value);if(!Number.isSafeInteger(number) || number<1 || number>max)throw Error('Invalid publication history request');return number;
  };
  const page=integer(input.page ?? 1,1000000),pageSize=integer(input.pageSize ?? 20,20);
  const version=input.version===undefined || input.version===''?null:integer(input.version,2147483647);
  return {page,pageSize,version};
}

export function publicationHistoryQuery(params,detail=false) {
  if((detail && params.size) || [...params.keys()].some(key=>params.getAll(key).length!==1))throw Error('Invalid publication history request');
  const input=Object.fromEntries(params);publicationHistoryFilters(input);return input;
}
