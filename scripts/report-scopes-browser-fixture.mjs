import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {rehearsalConfig} from '../server/postgres/runtime.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {insertSession,inSchema,provisionStaffCredential,issueWorkerGrant,redeemWorkerGrant} from '../server/postgres/auth.mjs';
import {requireLocalRequest,sessionCookie} from '../server/auth.mjs';
import {publish} from '../server/postgres/domain.mjs';
import {CANONICAL_SOURCE,syntheticPrepare} from '../server/domain.mjs';
import {processOneExport} from '../server/postgres/exports.mjs';
import {processOneActivityPurge} from '../server/postgres/activity-retention.mjs';
import {saveBriefingRetention,processOneBriefingContentPurge} from '../server/postgres/briefing-retention.mjs';

const port=3210,db=new PGlite();let queue=Promise.resolve();
const pool={async connect(){const previous=queue;let release;queue=new Promise(done=>{release=done;});await previous;
  return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)??{rows:[]},release};}};
const config=rehearsalConfig({UNDERSTOOD_TIER:'local',UNDERSTOOD_AI_MODE:'synthetic',UNDERSTOOD_ACCESS_MODE:'credential',UNDERSTOOD_DATA_CLASS:'synthetic',
  UNDERSTOOD_PUBLIC_ORIGIN:`http://127.0.0.1:${port}`,UNDERSTOOD_POSTGRES_SCHEMA:'understood_test_report_browser',UNDERSTOOD_REHEARSAL_AUDIO_ROOT:'D:/understod/data/report-browser-fixture'});
await db.exec(`CREATE SCHEMA ${config.schema};SET search_path TO ${config.schema},pg_catalog;SET timezone='UTC'`);await runMigrations(pool,config);
await db.exec("INSERT INTO organizations VALUES('qa','Synthetic Reporting QA');INSERT INTO sites VALUES('qa','qa','Beirut QA','Asia/Beirut');INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','qa','qa','Synthetic Owner','owner');INSERT INTO workers(id,org_id,site_id,code,language) VALUES('w1','qa','qa','Worker 001','en'),('w2','qa','qa','Worker 002','ar'),('w3','qa','qa','Worker 003','ur');INSERT INTO crews(id,org_id,site_id,name,active) VALUES('morning','qa','qa','Morning crew',true),('evening','qa','qa','Evening crew',true);INSERT INTO crew_memberships(worker_id,org_id,site_id,crew_id,joined_at) VALUES('w1','qa','qa','morning',clock_timestamp()),('w2','qa','qa','evening',clock_timestamp());");
await db.query("INSERT INTO briefings(id,org_id,site_id,title,source,state,prepared_json) VALUES('brief','qa','qa','Shelf colour handover',$1,'ready',$2)",[CANONICAL_SOURCE,JSON.stringify(syntheticPrepare(CANONICAL_SOURCE))]);
await provisionStaffCredential(pool,{staffId:'owner',orgId:'qa',siteId:'qa',email:'owner@qa.example.test',password:`Synthetic-${randomUUID()}!`},config);
const owner={principal_type:'staff',principal_id:'owner',org_id:'qa',site_id:'qa',role:'owner'};
const usageFixture=process.argv.includes('--usage');
const activityFixture=process.argv.includes('--activity');
const expiredWorkerFixture=process.argv.includes('--expired-worker');
const briefingFixture=process.argv.includes('--briefing') || expiredWorkerFixture;
if(briefingFixture){
  await db.query("INSERT INTO briefings(id,org_id,site_id,title,source,state,prepared_json) VALUES('expired-brief','qa','qa','Synthetic expired briefing',$1,'ready',$2)",[CANONICAL_SOURCE,JSON.stringify(syntheticPrepare(CANONICAL_SOURCE))]);
  await db.query("INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state) VALUES('expired-pub','qa','qa','expired-brief',1,$1,'archived')",[JSON.stringify({...syntheticPrepare(CANONICAL_SOURCE),title:'Synthetic expired briefing'})]);
  await db.exec("INSERT INTO briefing_archives(request_id,org_id,site_id,briefing_id,request_json,publication_ids_json,archived_by,occurred_at) VALUES('expired-archive','qa','qa','expired-brief','{\"reason\":\"Synthetic archive\"}','[\"expired-pub\"]','owner',clock_timestamp()-interval '10 days')");
  if(expiredWorkerFixture)await db.exec(`INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language) VALUES('expired-assignment','qa','qa','expired-pub','w1','en');
    INSERT INTO attempts(id,org_id,site_id,assignment_id,submission_id,answer_text,outcome,reasons_json,assessment_status,received_at)
      VALUES('expired-answer','qa','qa','expired-assignment','expired-submission','Synthetic preserved answer','matched','[]','complete',clock_timestamp()-interval '10 days');
    INSERT INTO submission_receipts(org_id,assignment_id,submission_id,kind,received_at)
      VALUES('qa','expired-assignment','expired-submission','typed',clock_timestamp()-interval '10 days');`);
}
if(activityFixture)await db.exec("INSERT INTO audit(id,org_id,site_id,actor_type,actor_id,action,object_id,occurred_at) VALUES('activity-expired','qa','qa','staff','owner','Synthetic old activity','w1',clock_timestamp()-interval'10 days')");
if(usageFixture)await db.exec("INSERT INTO provider_policies(scope_key,org_id,revision,enabled,max_daily_requests) VALUES('global',NULL,1,true,20),('tenant:qa','qa',1,true,5);INSERT INTO system_controls VALUES('global',1,false,true,clock_timestamp())");
const publication=await publish(pool,owner,'brief',{requestId:randomUUID(),revision:1,nextVersion:1,workerIds:['w1','w2','w3']},{...config,integrationMode:'synthetic'});
for(const [worker,time] of [['w1','2026-10-24T22:00:00.000Z'],['w2','2026-10-25T22:00:00.000Z']]){
  const assignment=(await db.query('SELECT id FROM assignments WHERE publication_id=$1 AND worker_id=$2',[publication.id,worker])).rows[0].id,submission=randomUUID();
  await db.query("INSERT INTO attempts(id,org_id,site_id,assignment_id,submission_id,answer_text,outcome,reasons_json,received_at,assessment_status) VALUES($1,'qa','qa',$2,$3,'Synthetic fixture answer','matched','[]',$4,'complete')",[randomUUID(),assignment,submission,time]);
  await db.query("INSERT INTO submission_receipts(org_id,assignment_id,submission_id,kind,received_at) VALUES('qa',$1,$2,'typed',$3)",[assignment,submission,time]);
}
await db.exec("UPDATE crew_memberships SET crew_id='evening' WHERE worker_id='w1';UPDATE crews SET name='Renamed current crew',active=false WHERE id='morning'");
if(expiredWorkerFixture){
  await saveBriefingRetention(pool,owner,{requestId:randomUUID(),revision:0,days:7,confirmed:true},config);
  if(!await processOneBriefingContentPurge(pool,config))throw Error('Synthetic expired worker fixture was not redacted');
}
const api=createPostgresRehearsalServer(pool,{...config,storage:null,publicBuild:await loadPublicBuild('dist')});
const handler=api.listeners('request')[0];api.removeAllListeners('request');const reportReads=[];let exportPosts=0,usageReads=0,usagePosts=0,activityPosts=0,activityReceipts=0,briefingPosts=0,briefingReceipts=0;
api.on('request',(req,res)=>{
  const url=new URL(req.url,config.publicOrigin);
  if(url.pathname==='/api/qa-bootstrap' && req.method==='GET'){
    (async()=>{requireLocalRequest(req);const session=expiredWorkerFixture?
      await redeemWorkerGrant(pool,(await issueWorkerGrant(pool,owner,'w1',60,config)).token,config):
      await inSchema(pool,config.schema,client=>insertSession(client,{id:'owner',org_id:'qa',site_id:'qa'},'staff'));
      res.writeHead(302,{'cache-control':'no-store','set-cookie':sessionCookie(session.token,session.maxSeconds,{name:'understood_pg_rehearsal'}),location:expiredWorkerFixture?'/#worker/expired-assignment':activityFixture || briefingFixture?'/#settings/retention':usageFixture?'/#settings/usage':'/#reports'});res.end();
    })().catch(()=>{res.writeHead(503,{'cache-control':'no-store'});res.end('Fixture unavailable');});return;
  }
  if(req.method==='GET' && url.pathname==='/api/reports')reportReads.push(Object.fromEntries(url.searchParams));
  if(req.method==='POST' && url.pathname==='/api/reports/exports')exportPosts++;
  if(req.method==='GET' && url.pathname==='/api/usage')usageReads++;
  if(req.method==='POST' && url.pathname==='/api/usage/requests')usagePosts++;
  if(req.method==='GET' && url.pathname.startsWith('/api/retention/activity/requests/'))activityReceipts++;
  if(req.method==='GET' && url.pathname.startsWith('/api/retention/briefings/requests/'))briefingReceipts++;
  if(req.method==='POST' && url.pathname==='/api/retention/briefings'){
    briefingPosts++;
    if(briefingFixture && briefingPosts===1){const end=res.end.bind(res);res.end=(...args)=>{if(res.statusCode===200){res.statusCode=503;res.removeHeader('content-length');return end(JSON.stringify({error:'Synthetic acknowledgement interrupted'}));}return end(...args);};}
  }
  if(req.method==='POST' && url.pathname==='/api/retention/activity'){
    activityPosts++;
    if(activityFixture && activityPosts===1){
      // Commit the real operation, but replace its first acknowledgement to exercise receipt-only recovery.
      const end=res.end.bind(res);res.end=(...args)=>{if(res.statusCode===200){res.statusCode=503;res.removeHeader('content-length');return end(JSON.stringify({error:'Synthetic acknowledgement interrupted'}));}return end(...args);};
    }
  }
  handler(req,res);
});
await new Promise((done,reject)=>{api.once('error',reject);api.listen(port,'127.0.0.1',done);});
let stopping=false,working=false,inFlight=Promise.resolve();
const interval=setInterval(()=>{if(stopping || working)return;working=true;inFlight=(briefingFixture?processOneBriefingContentPurge(pool,config):activityFixture?processOneActivityPurge(pool,config):processOneExport(pool,config)).catch(error=>console.error(error.message)).finally(()=>{working=false;});},500);
function stop(){if(stopping)return;stopping=true;clearTimeout(timeout);clearInterval(interval);
  api.close(async()=>{await inFlight;await queue;
    if(briefingFixture)console.log(JSON.stringify({briefingPosts,briefingReceipts,policy:(await db.query('SELECT revision,days FROM briefing_retention_policies')).rows,purges:(await db.query('SELECT briefing_id,proofs_json FROM briefing_content_purges')).rows,content:(await db.query("SELECT title,source,prepared_json FROM briefings WHERE id='expired-brief'")).rows,externalRequests:0}));
    console.log(JSON.stringify({reportReads,exportPosts,usageReads,usagePosts,usageRequests:(await db.query('SELECT kind,message FROM usage_change_requests ORDER BY created_at')).rows,activityPosts,activityReceipts,activityPolicy:(await db.query('SELECT revision,days FROM activity_retention_policies')).rows,activityRequests:(await db.query('SELECT revision FROM activity_retention_requests')).rows,expiredActivity:(await db.query("SELECT actor_id,object_id FROM audit WHERE id='activity-expired'")).rows,activityPurges:(await db.query('SELECT event_id FROM activity_identity_purges')).rows,externalRequests:0,exports:(await db.query('SELECT status,filters_json,snapshot_json,checksum FROM report_exports ORDER BY created_at')).rows}));
    await db.close();process.stdin.pause();});api.closeIdleConnections();}
const timeout=setTimeout(stop,15*60_000);process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='stop')stop();});process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(`Disposable built reporting QA: ${config.publicOrigin}/api/qa-bootstrap. In-memory synthetic data, no provider/private-file I/O. Send stop on stdin for final evidence.`);
