import {spawn} from 'node:child_process';
import {open,unlink} from 'node:fs/promises';
import {join} from 'node:path';

export function postgresBackupConnection(config) {
  let url;try {url=new URL(config.connectionString);}catch {throw Error('Invalid backup database configuration');}
  if(!['postgres:','postgresql:'].includes(url.protocol) || url.search || url.hash
    || !/^[a-zA-Z0-9_.-]{1,100}$/.test(decodeURIComponent(url.pathname.slice(1)))
    || !/^[a-zA-Z0-9_.-]{1,100}$/.test(decodeURIComponent(url.username))
    || !url.hostname || /-pooler\./i.test(url.hostname))throw Error('Backup requires a direct PostgreSQL endpoint without URL options');
  const host=url.hostname.replace(/^\[|\]$/g,''),local=['localhost','127.0.0.1','::1'].includes(host);
  if(!local && config.tls!==true)throw Error('Verified TLS is required for remote backups');
  if(!local && !config.caFile)throw Error('Native remote backups require an explicit trusted CA file');
  const values={host,port:url.port || '5432',database:decodeURIComponent(url.pathname.slice(1)),user:decodeURIComponent(url.username),password:decodeURIComponent(url.password)};
  if(Object.values(values).some(value=>/[\r\n\0]/.test(value)))throw Error('Invalid backup database configuration');
  return {...values,tls:config.tls===true,caFile:config.caFile};
}

export async function nativeBackupSession(config,directory) {
  const connection=postgresBackupConnection(config),path=join(directory,'database.pgpass');
  const escape=value=>value.replace(/\\/g,'\\\\').replace(/:/g,'\\:');
  const file=await open(path,'wx',0o600);
  try {await file.writeFile([connection.host,connection.port,connection.database,connection.user,connection.password].map(escape).join(':')+'\n');}
  finally {await file.close();}
  const env={};
  for(const name of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','HOME','LANG','LC_ALL'])
    if(process.env[name])env[name]=process.env[name];
  Object.assign(env,{PGHOST:connection.host,PGPORT:connection.port,PGDATABASE:connection.database,PGUSER:connection.user,
    PGPASSFILE:path,PGCONNECT_TIMEOUT:'10',PGAPPNAME:'understood-backup-maintenance',PGCLIENTENCODING:'UTF8',
    PGSSLMODE:connection.tls?'verify-full':'disable',...(connection.caFile?{PGSSLROOTCERT:connection.caFile}:{})});
  return {env,identity:`${connection.host.toLowerCase()}:${connection.port}/${connection.database}`,async close(){await unlink(path);}};
}

export async function runNativePostgres(tool,args,{env,consume,timeoutMs=1800000,maxOutputBytes=1024*1024}={}) {
  if(!Array.isArray(args) || args.some(value=>typeof value!=='string'))throw Error('Invalid native backup invocation');
  const child=spawn(tool,args,{env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stderrBytes=0,timedOut=false;
  child.stderr.on('data',chunk=>{stderrBytes+=chunk.length;});
  const completion=new Promise(resolve=>{
    child.on('error',()=>resolve({failed:true}));
    child.on('close',code=>resolve({code}));
  });
  const timeout=setTimeout(()=>{timedOut=true;child.kill();},timeoutMs);timeout.unref();
  let result;
  try {
    if(consume)result=await consume(child.stdout);
    else {
      const chunks=[];let size=0;
      for await(const chunk of child.stdout){size+=chunk.length;if(size>maxOutputBytes)throw Error('Native backup output limit exceeded');chunks.push(chunk);}
      result=Buffer.concat(chunks).toString('utf8');
    }
    const status=await completion;
    if(status.failed || status.code!==0 || timedOut || stderrBytes)throw Error('Native PostgreSQL command failed or reported a warning');
    return result;
  }catch {
    child.kill();await completion;
    throw Error('Native PostgreSQL command failed; inspect configuration without exposing credentials');
  }finally {clearTimeout(timeout);}
}

export async function nativeBackupVersion(tool,{runner=runNativePostgres,...options}={}) {
  const output=await runner(tool,['--version'],{...options,maxOutputBytes:1024});
  const match=output.match(/\(PostgreSQL\) (\d+)(?:\.\d+)*(?:\s|$)/);
  if(!match || Number(match[1])<16)throw Error('PostgreSQL backup tools version 16 or newer are required');
  return Number(match[1]);
}
