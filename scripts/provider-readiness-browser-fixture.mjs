import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {rehearsalConfig} from '../server/postgres/runtime.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {insertSession,inSchema,provisionStaffCredential} from '../server/postgres/auth.mjs';
import {authenticateOperator,provisionOperator,OPERATOR_COOKIE} from '../server/postgres/operators.mjs';
import {requireLocalRequest,sessionCookie} from '../server/auth.mjs';

// Disposable built UI inspection. No worker runs; any external fetch is a fixture failure.
let providerCalls=0,inspectionPosts=0,operatorPosts=0;
globalThis.fetch=async()=>{providerCalls++;throw Error('External requests forbidden in readiness fixture');};
const hash='ab'.repeat(32),port=3198,db=new PGlite();let queue=Promise.resolve();
const pool={async connect(){const previous=queue;let release;queue=new Promise(resolve=>{release=resolve;});await previous;
  return {query:async(sql,values)=>values?.length?db.query(sql,values):(await db.exec(sql)).at(-1)??{rows:[]},release};}};
const config=rehearsalConfig({UNDERSTOOD_TIER:'local',UNDERSTOOD_AI_MODE:'synthetic',UNDERSTOOD_ACCESS_MODE:'credential',
  UNDERSTOOD_DATA_CLASS:'synthetic',UNDERSTOOD_PUBLIC_ORIGIN:`http://127.0.0.1:${port}`,
  UNDERSTOOD_POSTGRES_SCHEMA:'understood_test_readiness_browser',UNDERSTOOD_REHEARSAL_AUDIO_ROOT:'D:/understod/data/readiness-browser-fixture',
  UNDERSTOOD_OPERATOR_ACCESS:'true',GEMINI_API_KEY:'never-used-synthetic-fixture-key',
  UNDERSTOOD_PREPARATION_ADAPTER:'gemini-free',UNDERSTOOD_SYNTHETIC_PREPARATION_HASHES:JSON.stringify([hash]),
  UNDERSTOOD_SOURCE_TRANSCRIPTION:'gemini-free',UNDERSTOOD_RECORDING_ADAPTER:'gemini-free',UNDERSTOOD_SYNTHETIC_AUDIO_HASHES:JSON.stringify([hash]),
  UNDERSTOOD_ASSESSMENT_ADAPTER:'gemini-free',UNDERSTOOD_SYNTHETIC_ASSESSMENT_HASHES:JSON.stringify([hash]),
  UNDERSTOOD_CASE_FOLLOWUP_ADAPTER:'gemini',UNDERSTOOD_PROVIDER_TESTS:'gemini-free'});
await db.exec(`CREATE SCHEMA ${config.schema};SET search_path TO ${config.schema},pg_catalog`);await runMigrations(pool,config);
await db.exec("INSERT INTO organizations VALUES('qa','Disposable Readiness QA');INSERT INTO sites VALUES('qa','qa','Beirut QA','Asia/Beirut');INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','qa','qa','Synthetic Owner','owner')");
const password=`Synthetic-${randomUUID()}!`;
await provisionStaffCredential(pool,{staffId:'owner',orgId:'qa',siteId:'qa',email:'owner@qa.example.test',password},config);
await provisionOperator(pool,{id:randomUUID(),name:'Synthetic operator',email:'operator@qa.example.test',password},config);
const api=createPostgresRehearsalServer(pool,{...config,storage:null,publicBuild:await loadPublicBuild('dist')});
const handler=api.listeners('request')[0];api.removeAllListeners('request');
api.on('request',(req,res)=>{
  const url=new URL(req.url,config.publicOrigin);
  if(url.pathname==='/api/qa-bootstrap' && req.method==='GET') {
    (async()=>{requireLocalRequest(req);const operator=url.searchParams.get('operator')==='1';
      const session=operator?await authenticateOperator(pool,{email:'operator@qa.example.test',password},'local',config)
        :await inSchema(pool,config.schema,client=>insertSession(client,{id:'owner',org_id:'qa',site_id:'qa'},'staff'));
      res.writeHead(302,{'cache-control':'no-store','set-cookie':sessionCookie(session.token,session.maxSeconds,{name:operator?OPERATOR_COOKIE:'understood_pg_rehearsal'}),location:operator?'/#operations':'/#language-readiness'});res.end();
    })().catch(()=>{res.writeHead(503,{'cache-control':'no-store'});res.end('Fixture unavailable');});return;
  }
  if(req.method==='POST' && url.pathname==='/api/language-readiness/test')inspectionPosts++;
  if(req.method==='POST' && url.pathname.startsWith('/api/ops/'))operatorPosts++;
  handler(req,res);
});
await new Promise((resolve,reject)=>{api.once('error',reject);api.listen(port,'127.0.0.1',resolve);});
let stopping=false;
function stop(){if(stopping)return;stopping=true;api.close(async()=>{
  const operations=Number((await db.query('SELECT COUNT(*) AS count FROM provider_operations')).rows[0].count);
  const verifications=Number((await db.query('SELECT COUNT(*) AS count FROM provider_verifications')).rows[0].count);
  console.log(JSON.stringify({providerCalls,operations,verifications,inspectionPosts,operatorPosts}));await db.close();
  if(providerCalls || operations || verifications || operatorPosts)process.exitCode=1;
});api.closeIdleConnections();}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(`Disposable built readiness QA: ${config.publicOrigin}/api/qa-bootstrap (?operator=1 for operations). No saved data, no worker, provider calls forbidden.`);
