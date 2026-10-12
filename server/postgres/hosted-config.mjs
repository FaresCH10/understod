import {BlockList,isIP} from 'node:net';
import {schemaName} from './migrate.mjs';
import {resolveMailConfig} from '../auth-mail.mjs';
import {pilotDestination} from '../pilot-input.mjs';

const flag=(env,key)=>{if(env[key]!==undefined && !['true','false'].includes(env[key]))throw Error('Invalid hosted boolean configuration');return env[key]==='true';};
export function hostedSyntheticConfig(env=process.env) {
  if(env.UNDERSTOOD_MODE || env.UNDERSTOOD_TIER!=='staging' || env.UNDERSTOOD_AI_MODE!=='synthetic'
    || env.UNDERSTOOD_ACCESS_MODE!=='credential' || env.UNDERSTOOD_DATA_CLASS!=='synthetic')throw Error('Hosted runtime currently permits explicitly synthetic staging only');
  const publicOrigin=env.UNDERSTOOD_PUBLIC_ORIGIN;let origin;
  try{origin=new URL(publicOrigin);}catch{throw Error('Set an exact HTTPS hosted origin');}
  if(origin.origin!==publicOrigin || origin.protocol!=='https:' || origin.username || origin.password || isIP(origin.hostname.replace(/^\[|\]$/g,''))
    || origin.hostname==='localhost' || origin.hostname.endsWith('.localhost'))throw Error('Set an exact HTTPS hosted origin');
  const schema=schemaName(env.UNDERSTOOD_POSTGRES_SCHEMA);
  if(!/^understood_stage_[a-z0-9_]{1,46}$/.test(schema))throw Error('Use an isolated hosted synthetic staging schema');
  if(env.UNDERSTOOD_POSTGRES_TLS!=='true' || !env.UNDERSTOOD_POSTGRES_URL)throw Error('Hosted PostgreSQL requires certificate-verified TLS');
  if((env.UNDERSTOOD_SOURCE_TRANSCRIPTION ?? 'disabled')!=='disabled' || (env.UNDERSTOOD_PROVIDER_TESTS ?? 'disabled')!=='disabled'
    || (env.UNDERSTOOD_CASE_FOLLOWUP_ADAPTER ?? 'disabled')!=='disabled'
    || (env.UNDERSTOOD_RECORDING_ADAPTER ?? 'disabled')!=='disabled'
    || (env.UNDERSTOOD_PREPARATION_ADAPTER ?? 'disabled')!=='disabled'
    || (env.UNDERSTOOD_ASSESSMENT_ADAPTER ?? 'disabled')!=='disabled')throw Error('Hosted free-tier provider dispatch is not enabled');
  const port=Number(env.PORT ?? 10000);if(!Number.isInteger(port) || port<1024 || port>65535)throw Error('Invalid hosted port');
  const trusted=new BlockList();let proxies;
  try{proxies=JSON.parse(env.UNDERSTOOD_TRUSTED_PROXY_NETWORKS ?? '[]');}catch{throw Error('Set trusted reverse-proxy networks');}
  if(!Array.isArray(proxies) || !proxies.length || proxies.length>32)throw Error('Set trusted reverse-proxy networks');
  for(const value of proxies) {
    if(typeof value!=='string')throw Error('Invalid trusted proxy network');const parts=value.split('/'),version=isIP(parts[0]),prefix=parts.length===1?(version===4?32:128):Number(parts[1]);
    if(!version || parts.length>2 || !Number.isInteger(prefix) || prefix<1 || prefix>(version===4?32:128))throw Error('Invalid trusted proxy network');
    trusted.addSubnet(parts[0],prefix,version===4?'ipv4':'ipv6');
  }
  const requestAddress=req=>{
    let remote=req.socket.remoteAddress;if(remote?.startsWith('::ffff:'))remote=remote.slice(7);
    const version=isIP(remote ?? '');
    if(!version || !trusted.check(remote,version===4?'ipv4':'ipv6') || req.headers['x-forwarded-proto']!=='https'
      || req.headers.host!==origin.host)throw Error('Forbidden transport');
    const address=req.headers['x-forwarded-for'];
    if(typeof address!=='string' || !isIP(address) || address.length>45)throw Error('Forbidden transport');
    return address;
  };
  const storageConfig={accountId:env.UNDERSTOOD_R2_ACCOUNT_ID,bucket:env.UNDERSTOOD_R2_BUCKET,jurisdiction:env.UNDERSTOOD_R2_JURISDICTION ?? 'eu',accessKeyId:env.UNDERSTOOD_R2_ACCESS_KEY_ID,secretAccessKey:env.UNDERSTOOD_R2_SECRET_ACCESS_KEY};
  if(!/^[a-f0-9]{32}$/i.test(storageConfig.accountId ?? '') || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(storageConfig.bucket ?? '')
    || !['default','eu'].includes(storageConfig.jurisdiction) || !storageConfig.accessKeyId || !storageConfig.secretAccessKey)throw Error('Hosted private storage configuration is incomplete');
  const mail=resolveMailConfig({mode:env.UNDERSTOOD_EMAIL_MODE ?? 'disabled',apiKey:env.UNDERSTOOD_RESEND_KEY,from:env.UNDERSTOOD_EMAIL_FROM,key:env.UNDERSTOOD_AUTH_MAIL_KEY,publicOrigin});
  return Object.freeze({tier:'staging',aiMode:'synthetic',accessMode:'credential',dataClass:'synthetic',integrationMode:'synthetic',publicOrigin,schema,port,
    requestAddress,runtimePermissionsRequired:true,storageConfig:Object.freeze(storageConfig),storageAdapter:'r2',storageChecks:flag(env,'UNDERSTOOD_STORAGE_CHECKS'),operatorAccess:flag(env,'UNDERSTOOD_OPERATOR_ACCESS'),mail,pilotDestination:pilotDestination(env.UNDERSTOOD_PILOT_TO)});
}
