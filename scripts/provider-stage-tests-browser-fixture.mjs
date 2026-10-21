import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {rehearsalConfig} from '../server/postgres/runtime.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {insertSession,inSchema,provisionStaffCredential} from '../server/postgres/auth.mjs';
import {authenticateOperator,provisionOperator,OPERATOR_COOKIE} from '../server/postgres/operators.mjs';
import {saveProviderPolicy} from '../server/postgres/provider-controls.mjs';
import {resolveProviderVerification} from '../server/ai/provider-verification-config.mjs';
import {CANONICAL_SOURCE,syntheticPrepare} from '../server/domain.mjs';
import {requireLocalRequest,sessionCookie} from '../server/auth.mjs';

// Built UI against disposable PostgreSQL state and mock protocol responses, never a live provider.
let externalCalls=0,mockCalls=0,inspectionPosts=0,operatorPosts=0,lostAcknowledgements=0,receiptOutages=0,loseNext=false,receiptOutage=false;
const httpEvents=[];
globalThis.fetch=async()=>{externalCalls++;throw Error('External requests forbidden in stage-test fixture');};
const hash='ab'.repeat(32),port=3198,db=new PGlite();let queue=Promise.resolve();
const pool={async connect(){const previous=queue;let release;queue=new Promise(resolve=>{release=resolve;});await previous;
  return {query:async(sql,values)=>values?.length?db.query(sql,values):(await db.exec(sql)).at(-1)??{rows:[]},release};}};
const env={UNDERSTOOD_TIER:'local',UNDERSTOOD_AI_MODE:'synthetic',UNDERSTOOD_ACCESS_MODE:'credential',UNDERSTOOD_DATA_CLASS:'synthetic',
  UNDERSTOOD_PUBLIC_ORIGIN:`http://127.0.0.1:${port}`,UNDERSTOOD_POSTGRES_SCHEMA:'understood_test_stage_browser',UNDERSTOOD_REHEARSAL_AUDIO_ROOT:'D:/understod/data/stage-browser-fixture',
  UNDERSTOOD_OPERATOR_ACCESS:'true',GEMINI_API_KEY:'never-live-stage-fixture-key',UNDERSTOOD_PREPARATION_ADAPTER:'gemini-free',UNDERSTOOD_SYNTHETIC_PREPARATION_HASHES:JSON.stringify([hash]),
  UNDERSTOOD_SOURCE_TRANSCRIPTION:'gemini-free',UNDERSTOOD_RECORDING_ADAPTER:'gemini-free',UNDERSTOOD_SYNTHETIC_AUDIO_HASHES:JSON.stringify([hash]),
  UNDERSTOOD_ASSESSMENT_ADAPTER:'gemini-free',UNDERSTOOD_SYNTHETIC_ASSESSMENT_HASHES:JSON.stringify([hash]),UNDERSTOOD_CASE_FOLLOWUP_ADAPTER:'gemini',UNDERSTOOD_PROVIDER_TESTS:'gemini-free'};
function wav(){const b=Buffer.alloc(32044);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(32000,40);b.writeInt16LE(1000,44);return b;}
const config={...rehearsalConfig(env),providerVerification:resolveProviderVerification(env,{fetchImpl:async(url,options)=>{
  mockCalls++;const body=JSON.parse(options.body);let parts;
  if(body.response_format?.type==='audio')return Response.json({status:'completed',model:body.model,steps:[{type:'model_output',content:[{type:'audio',mime_type:'audio/wav',data:wav().toString('base64')}]}]});
  else {
    const schema=body.generationConfig.responseFormat.text.schema,language=body.systemInstruction.parts[0].text.includes('into Urdu')?'ur':'ar';
    const {title,text,question}=syntheticPrepare(CANONICAL_SOURCE).languages[language];
    parts=[{text:JSON.stringify(schema.properties.faithful?{faithful:true,complete:true,languageCorrect:true,terminologyApplied:true,reasons:[]}:{title,text,question})}];
  }
  return Response.json({candidates:[{finishReason:'STOP',content:{parts}}]});
}})};
await db.exec(`CREATE SCHEMA ${config.schema};SET search_path TO ${config.schema},pg_catalog`);await runMigrations(pool,config);
await db.exec("INSERT INTO organizations VALUES('qa','Disposable Stage QA');INSERT INTO sites VALUES('qa','qa','Beirut QA','Asia/Beirut');INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','qa','qa','Synthetic Owner','owner')");
const password=`Synthetic-${randomUUID()}!`;
await provisionStaffCredential(pool,{staffId:'owner',orgId:'qa',siteId:'qa',email:'owner@qa.example.test',password},config);
await provisionOperator(pool,{id:randomUUID(),name:'Synthetic operator',email:'operator@qa.example.test',password},config);
const setup=await authenticateOperator(pool,{email:'operator@qa.example.test',password},'local',config);
await saveProviderPolicy(pool,setup.session,{requestId:randomUUID(),kind:'provider-policy',orgId:null,revision:0,enabled:true,maxDailyRequests:12,confirmed:true},config);
const api=createPostgresRehearsalServer(pool,{...config,storage:null,publicBuild:await loadPublicBuild('dist')});
const handler=api.listeners('request')[0];api.removeAllListeners('request');
api.on('request',(req,res)=>{
  const url=new URL(req.url,config.publicOrigin);
  if(url.pathname.startsWith('/api/ops/'))httpEvents.push({method:req.method,path:url.pathname});
  if(url.pathname==='/api/qa-bootstrap' && req.method==='GET') {
    (async()=>{requireLocalRequest(req);const operator=url.searchParams.get('operator')==='1';
      if(operator)loseNext=url.searchParams.get('lost')==='1';
      const session=operator?await authenticateOperator(pool,{email:'operator@qa.example.test',password},'local',config)
        :await inSchema(pool,config.schema,client=>insertSession(client,{id:'owner',org_id:'qa',site_id:'qa'},'staff'));
      res.writeHead(302,{'cache-control':'no-store','set-cookie':sessionCookie(session.token,session.maxSeconds,{name:operator?OPERATOR_COOKIE:'understood_pg_rehearsal'}),location:operator?'/#operations':'/#language-readiness'});res.end();
    })().catch(()=>{res.writeHead(503,{'cache-control':'no-store'});res.end('Fixture unavailable');});return;
  }
  if(req.method==='GET' && url.pathname.startsWith('/api/ops/receipts/') && receiptOutage){receiptOutage=false;receiptOutages++;res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'Synthetic receipt outage'}));return;}
  if(req.method==='POST' && url.pathname==='/api/language-readiness/test')inspectionPosts++;
  if(req.method==='POST' && url.pathname.startsWith('/api/ops/'))operatorPosts++;
  if(req.method==='POST' && url.pathname==='/api/ops/providers/verify' && loseNext) {
    loseNext=false;const end=res.end.bind(res);res.end=(...args)=>{
      if(res.statusCode===200){lostAcknowledgements++;receiptOutage=true;res.destroy();return res;}
      return end(...args);
    };
  }
  handler(req,res);
});
await new Promise((resolve,reject)=>{api.once('error',reject);api.listen(port,'127.0.0.1',resolve);});
let stopping=false;
function stop(){if(stopping)return;stopping=true;api.close(async()=>{
  const operations=Number((await db.query('SELECT COUNT(*) AS count FROM provider_operations')).rows[0].count);
  const results=(await db.query('SELECT test_stage,language,state,result_json FROM provider_verifications ORDER BY created_at')).rows;
  const requests=(await db.query('SELECT state,COUNT(*)::int count FROM provider_requests GROUP BY state')).rows;
  console.log(JSON.stringify({externalCalls,mockCalls,operations,results,requests,inspectionPosts,operatorPosts,lostAcknowledgements,receiptOutages,httpEvents}));await db.close();
  if(externalCalls)process.exitCode=1;
});api.closeIdleConnections();}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(`Disposable built stage QA: ${config.publicOrigin}/api/qa-bootstrap?operator=1&lost=1. Mock responses only, no worker or saved state.`);
