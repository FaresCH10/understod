import {createServer} from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {provisionStaffCredential,insertSession} from '../server/postgres/auth.mjs';
import {domainTransaction,publish,submitAnswer} from '../server/postgres/domain.mjs';
import {createDraft,queuePreparation,processOnePreparation} from '../server/postgres/preparation.mjs';
import {requireLocalRequest,sessionCookie} from '../server/auth.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {CANONICAL_SOURCE} from '../server/domain.mjs';
const port=Number(process.env.UNDERSTOOD_PROVIDER_HISTORY_FIXTURE_PORT ?? 3237),origin=`http://127.0.0.1:${port}`,schema='understood_test_provider_history_browser';
const delay=Number(process.env.UNDERSTOOD_PROVIDER_HISTORY_FIXTURE_DELAY_MS ?? 0);
if(!Number.isInteger(delay) || delay<0 || delay>2000)throw Error('Use a bounded synthetic read delay');
if(!Number.isInteger(port) || port<1024 || port>65535 || [3020,3021].includes(port))throw Error('Use a separate disposable fixture port');
const db=new PGlite(),pool={async connect(){return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)??{rows:[]},release(){}};}};
await db.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog`);await runMigrations(pool,{schema});
await db.exec(`INSERT INTO organizations VALUES('cedar','Synthetic');INSERT INTO sites VALUES('beirut','cedar','Synthetic site','UTC');
  INSERT INTO staff(id,org_id,site_id,name,role) VALUES('maya','cedar','beirut','Synthetic owner','owner'),('auditor','cedar','beirut','Synthetic auditor','auditor');
  INSERT INTO workers(id,org_id,site_id,code,language) VALUES('typed','cedar','beirut','Synthetic typed worker','en');`);
for(const id of ['maya','auditor'])await provisionStaffCredential(pool,{staffId:id,orgId:'cedar',siteId:'beirut',email:`${id}@history-browser.example.test`,password:'Disposable synthetic history browser password'},{schema});
const owner={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner'},options={schema};
const draft=await createDraft(pool,owner,{requestId:randomUUID(),title:'Synthetic provider history',source:CANONICAL_SOURCE},options);
await queuePreparation(pool,owner,draft.id,1,options);await processOnePreparation(pool,{schema,integrationMode:'synthetic'});
await publish(pool,owner,draft.id,{requestId:randomUUID(),revision:1,nextVersion:1,workerIds:['typed']},{schema,integrationMode:'synthetic'});
const assignment=(await db.query('SELECT * FROM assignments')).rows[0];
await submitAnswer(pool,{...owner,principal_type:'worker',principal_id:'typed'},assignment.id,randomUUID(),'Synthetic answer remains unchanged',options);
const check=(await db.query('SELECT id FROM assessment_jobs')).rows[0],claim=randomUUID();
await db.query("UPDATE assessment_jobs SET status='processing',lease_token=$1,lease_until=clock_timestamp()+interval '1 hour' WHERE id=$2",[claim,check.id]);
// Constructed metadata exercises display states; no provider calls or results are invented.
for(let index=0;index<12;index++){
  const id=randomUUID(),time=new Date(Date.now()-60_000+index*1000).toISOString();
  await db.query(`INSERT INTO provider_operations(id,org_id,kind,reference_id,claim_token,model,data_class,reserved_requests,quota_day,input_hash,provenance_json,created_at)
    VALUES($1,'cedar','typed-assessment',$2,$3,'gemini-fixture','synthetic',1,CURRENT_DATE,$4,$5,$6)`,[id,check.id,index<4?claim:randomUUID(),'a'.repeat(64),JSON.stringify({adapter:'gemini-fixture',model:'gemini-fixture',dataClass:'synthetic',promptVersion:'prompt-v1',schemaVersion:'schema-v1'}),time]);
  if(index===11)continue;
  const state=['started','accepted','rejected','uncertain'][index%4];
  await db.query(`INSERT INTO provider_requests(id,operation_id,sequence,cleanup,state,http_status,created_at,finished_at) VALUES($1,$2,1,false,$3,$4,$5,$6)`,[randomUUID(),id,state,state==='accepted'?200:state==='rejected'?429:null,time,state==='started'?null:new Date(Date.parse(time)+500).toISOString()]);
}
const api=createPostgresRehearsalServer(pool,{tier:'local',aiMode:'synthetic',accessMode:'credential',dataClass:'synthetic',schema,publicOrigin:origin,mail:{mode:'disabled'}}),handler=api.listeners('request')[0],build=await loadPublicBuild('dist');
const tables=['organizations','sites','workers','briefings','publications','assignments','attempts','assessment_jobs','provider_operations','provider_requests'];
const hash=async table=>createHash('sha256').update(JSON.stringify((await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows)).digest('hex'),before={};
for(const table of tables)before[table]=await hash(table);
let fail=false;const observed={reads:0,failures:0,mutations:0};
const ui=createServer(async(req,res)=>{
  const url=new URL(req.url,origin);
  if(url.pathname==='/__qa/stop' && req.method==='POST'){requireLocalRequest(req);res.writeHead(200);res.end('Stopping disposable fixture');setImmediate(stop);return;}
  if(url.pathname==='/__qa/control' && req.method==='POST'){requireLocalRequest(req);fail=url.searchParams.get('fail')==='true';res.writeHead(200);res.end('Configured local read fault');return;}
  if(url.pathname==='/api/qa-bootstrap' && req.method==='GET'){
    requireLocalRequest(req);const id=url.searchParams.get('role')==='auditor'?'auditor':'maya',principal=(await db.query('SELECT * FROM staff WHERE id=$1',[id])).rows[0];
    const session=await domainTransaction(pool,schema,client=>insertSession(client,principal,'staff'));
    res.writeHead(302,{'cache-control':'no-store','set-cookie':sessionCookie(session.token,session.maxSeconds,{name:'understood_pg_rehearsal'}),location:`/#processing/answer_check:${check.id}`});return res.end();
  }
  if(/^\/api\/processing\/[^/]+\/provenance$/.test(url.pathname)){
    if(req.method==='GET'){observed.reads++;if(fail){observed.failures++;res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({error:'Synthetic provider history outage.'}));}}
    else observed.mutations++;
    if(req.method==='GET' && delay){setTimeout(()=>{if(!res.destroyed)handler(req,res);},delay);return;}
  }
  if(url.pathname.startsWith('/api/'))return handler(req,res);return build(req,res,url);
});
await new Promise((resolve,reject)=>{ui.once('error',reject);ui.listen(port,'127.0.0.1',resolve);});
let stopping=false;
function stop(){if(stopping)return;stopping=true;clearTimeout(timeout);ui.close(async()=>{
  const protectedTables=[];for(const table of tables)protectedTables.push({table,unchanged:before[table]===await hash(table)});
  console.log(JSON.stringify({terminal:true,observed,protectedTables,externalCalls:0,constructedMetadata:true}));await db.close();process.stdin.pause();
});ui.closeIdleConnections();}
const timeout=setTimeout(stop,20*60_000);process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(JSON.stringify({fixture:'synthetic-provider-history',url:`${origin}/api/qa-bootstrap`,typedJobId:`answer_check:${check.id}`,expiresInSeconds:1200}));
