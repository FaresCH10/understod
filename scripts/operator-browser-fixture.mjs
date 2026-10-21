import {createServer} from 'node:http';
import {PGlite} from '@electric-sql/pglite';
import {randomUUID} from 'node:crypto';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {configureRuntimePermissions,verifyRuntimePermissions} from '../server/postgres/runtime-permissions.mjs';
import {provisionOperator} from '../server/postgres/operators.mjs';
import {handleOperationsRoute} from '../server/postgres/operations-http.mjs';
import {loadOperatorBuild} from '../server/public-build.mjs';
import {verifyMutationOrigin} from '../server/auth.mjs';
import {send} from '../server/http.mjs';
import {recordVerificationWorker} from '../server/postgres/verification-workers.mjs';
import {processOneProviderVerification} from '../server/postgres/provider-verification-worker.mjs';
import {resolveProviderVerification} from '../server/ai/provider-verification-config.mjs';
import {CANONICAL_SOURCE,syntheticPrepare} from '../server/domain.mjs';
import {domainTransaction} from '../server/postgres/domain.mjs';
import {readJson} from '../server/http.mjs';

if(process.argv.length!==3 || process.argv[2]!=='--confirm-local-operator-ui')throw Error('Confirm the disposable local operator UI fixture');
const port=Number(process.env.UNDERSTOOD_QA_OPERATOR_PORT || 3194);
if(!Number.isInteger(port) || port<1024 || port>65535)throw Error('Invalid operator fixture port');
const origin=`http://127.0.0.1:${port}`,schema='understood_operator_ui',role='operator_ui_runtime';
const verification=process.env.UNDERSTOOD_QA_VERIFICATION==='true',db=new PGlite();let tail=Promise.resolve();
const poolFor=identity=>({async connect(){
  const previous=tail;let release;tail=new Promise(resolve=>{release=resolve;});await previous;
  try{await db.exec('SET SESSION AUTHORIZATION postgres;RESET ROLE');if(identity!=='postgres')await db.exec(`SET SESSION AUTHORIZATION ${identity}`);}
  catch(error){release();throw error;}
  return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)??{rows:[]},release};
}}),owner=poolFor('postgres'),pool=poolFor(role),worker=poolFor('operator_ui_worker');
await db.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog`);await runMigrations(owner,{schema});
await db.exec("INSERT INTO organizations VALUES('synthetic','Synthetic operator QA');INSERT INTO sites VALUES('qa','synthetic','Synthetic site','UTC')");
await provisionOperator(owner,{id:randomUUID(),email:'operator@example.test',name:'Synthetic operator',password:'Disposable synthetic operator only'},{schema});
await db.exec(`CREATE ROLE ${role} LOGIN`);
await configureRuntimePermissions(owner,{schema,role,profile:'operator',dedicatedDatabase:true,writersStopped:true});
await db.exec('SET SESSION AUTHORIZATION postgres;RESET ROLE;CREATE ROLE operator_ui_worker LOGIN');
await configureRuntimePermissions(owner,{schema,role:'operator_ui_worker',profile:'worker',dedicatedDatabase:true,writersStopped:true});
await verifyRuntimePermissions(pool,{schema,profile:'operator'});await verifyRuntimePermissions(worker,{schema,profile:'worker'});
let calls=0,workerId=randomUUID(),workerActive=verification,receiptOutage=false,loseAck=false,heartbeatBusy=false;
const privateConfig=resolveProviderVerification({UNDERSTOOD_TIER:'local',UNDERSTOOD_AI_MODE:'synthetic',UNDERSTOOD_ACCESS_MODE:'credential',
  UNDERSTOOD_DATA_CLASS:'synthetic',UNDERSTOOD_PROVIDER_TESTS:verification?'gemini-free':'disabled',GEMINI_API_KEY:'synthetic-browser-never-live'},
  {fetchImpl:async()=>{calls++;const {title,facts,question,rubric}=syntheticPrepare(CANONICAL_SOURCE);
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({title,facts,question,askedFacts:rubric.askedFacts})}]}}]});}});
if(verification)await recordVerificationWorker(worker,workerId,privateConfig,'idle',{schema});
const heartbeat=setInterval(()=>{if(!workerActive || heartbeatBusy)return;heartbeatBusy=true;
  recordVerificationWorker(worker,workerId,privateConfig,'idle',{schema}).catch(()=>{workerActive=false;}).finally(()=>{heartbeatBusy=false;});},5000);
const build=await loadOperatorBuild('dist'),requests=[];
// Loopback HTTP rendering only: hosted TLS/proxy/cookie enforcement has separate tests.
const server=createServer(async(req,res)=>{
  try {
    if(req.socket.remoteAddress!=='127.0.0.1')return send(res,403,{error:'Local fixture only'});
    const url=new URL(req.url,origin);requests.push({method:req.method,path:url.pathname});
    if(url.pathname==='/api/qa/operator-evidence' && req.method==='GET')return send(res,200,{synthetic:true,runtimeRole:role,requests,productionReady:false});
    if(verification && url.pathname==='/api/qa/verification' && req.method==='POST'){
      verifyMutationOrigin(req,{publicOrigin:origin});const {action}=await readJson(req,1024);
      if(action==='run')await processOneProviderVerification(worker,privateConfig,{schema});
      else if(action==='stop'){workerActive=false;await recordVerificationWorker(worker,workerId,undefined,'stopped',{schema});}
      else if(action==='start'){workerId=randomUUID();await recordVerificationWorker(worker,workerId,privateConfig,'idle',{schema});workerActive=true;}
      else if(action==='receipt-outage')receiptOutage=true;
      else if(action==='receipt-recover')receiptOutage=false;
      else if(action==='lose-ack')loseAck=true;
      else return send(res,400,{error:'Unknown synthetic action'});
      return send(res,200,{ok:true});
    }
    if(verification && url.pathname==='/api/qa/verification-evidence' && req.method==='GET'){
      const rows=await domainTransaction(worker,schema,async client=>({jobs:(await client.query('SELECT status,COUNT(*)::int n FROM provider_verification_jobs GROUP BY status')).rows,
        slots:(await client.query('SELECT COALESCE(SUM(reserved_requests),0)::int n FROM provider_operations')).rows[0].n}));
      return send(res,200,{...rows,calls,workerActive,receiptOutage,externalRequests:0,productionReady:false});
    }
    if(!url.pathname.startsWith('/api/'))return build(req,res,url);
    if(!url.pathname.startsWith('/api/ops/'))return send(res,404,{error:'Not found'});
    if(req.method!=='GET')verifyMutationOrigin(req,{publicOrigin:origin});
    if(receiptOutage && url.pathname.startsWith('/api/ops/receipts/'))return send(res,503,{error:'Synthetic receipt outage'});
    let target=res;
    if(loseAck && req.method==='POST' && url.pathname==='/api/ops/providers/verify'){
      loseAck=false;let status,headers;
      target={writeHead:(code,value)=>{status=code;headers=value;},end:body=>{if(status===200)send(res,503,{error:'Synthetic lost acknowledgement'});else {res.writeHead(status,headers);res.end(body);}}};
    }
    await handleOperationsRoute(pool,req,target,url,{schema,enabled:true,workerVerification:verification,secure:false});
  }catch{send(res,503,{error:'Disposable operator fixture unavailable'});}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
let stopping=false;
const stop=()=>{if(stopping)return;stopping=true;workerActive=false;clearInterval(heartbeat);server.close(()=>void tail.then(()=>db.close()));};
process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(`Disposable in-memory operator UI: ${origin}/. Fixed synthetic login operator@example.test / Disposable synthetic operator only. No cloud, provider, mail or real data. Not hosted TLS/cookie evidence.`);
