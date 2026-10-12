export function workerAccessToken(hash:string):string {
  return /^#worker-access\/([A-Za-z0-9_-]{43})$/.exec(hash)?.[1] || '';
}

export function workerAccessLink(origin:string,token:string):string {
  const url=new URL(origin);
  if(url.origin!==origin || !['http:','https:'].includes(url.protocol) || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid worker access link');
  url.hash=`worker-access/${token}`;
  return url.href;
}
