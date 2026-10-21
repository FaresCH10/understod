import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {rehearsalConfig} from '../server/postgres/runtime.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {insertSession,inSchema,provisionStaffCredential} from '../server/postgres/auth.mjs';
import {requireLocalRequest,sessionCookie} from '../server/auth.mjs';

const port=Number(process.env.UNDERSTOOD_POLICY_FIXTURE_PORT ?? 3204),db=new PGlite();let queue=Promise.resolve();
if(!Number.isInteger(port) || port<1024 || port>65535 || [3020,3021].includes(port))throw Error('Use a separate disposable policy fixture port');
const pool={async connect(){const previous=queue;let release;queue=new Promise(done=>{release=done;});await previous;
  return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)??{rows:[]},release};}};
const config=rehearsalConfig({UNDERSTOOD_TIER:'local',UNDERSTOOD_AI_MODE:'synthetic',UNDERSTOOD_ACCESS_MODE:'credential',UNDERSTOOD_DATA_CLASS:'synthetic',
  UNDERSTOOD_PUBLIC_ORIGIN:`http://127.0.0.1:${port}`,UNDERSTOOD_POSTGRES_SCHEMA:'understood_test_text_browser',UNDERSTOOD_REHEARSAL_AUDIO_ROOT:'D:/understod/data/text-browser-fixture'});
await db.exec(`CREATE SCHEMA ${config.schema};SET search_path TO ${config.schema},pg_catalog`);await runMigrations(pool,config);
await db.exec("INSERT INTO organizations VALUES('qa','Synthetic Retention QA');INSERT INTO sites VALUES('qa','qa','Beirut QA','Asia/Beirut');INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','qa','qa','Synthetic Owner','owner')");
await provisionStaffCredential(pool,{staffId:'owner',orgId:'qa',siteId:'qa',email:'owner@qa.example.test',password:`Synthetic-${randomUUID()}!`},config);
const api=createPostgresRehearsalServer(pool,{...config,storage:null,publicBuild:await loadPublicBuild('dist')});
const handler=api.listeners('request')[0];api.removeAllListeners('request');
let loseNext=false,receiptOutage=false,rejectRetry=false,hideReceipt=false,posts=0,lostAcknowledgements=0,failedReceiptReads=0,rejectedRetries=0,policyPath='/api/retention/text';
api.on('request',(req,res)=>{
  const url=new URL(req.url,config.publicOrigin);
  if(url.pathname==='/api/qa-bootstrap' && req.method==='GET') {
    (async()=>{
      requireLocalRequest(req);loseNext=url.searchParams.get('lost')==='1';rejectRetry=url.searchParams.get('retry')==='reject';hideReceipt=false;
      const paths={audio:'/api/retention',notice:'/api/privacy/recording-notice',generated:'/api/retention/generated',case:'/api/retention/cases',activity:'/api/retention/activity',briefing:'/api/retention/briefings',text:'/api/retention/text'};
      policyPath=paths[url.searchParams.get('category') || 'text'];if(!policyPath)throw Error('Unknown QA policy');
      const session=await inSchema(pool,config.schema,client=>insertSession(client,{id:'owner',org_id:'qa',site_id:'qa'},'staff'));
      res.writeHead(302,{'cache-control':'no-store','set-cookie':sessionCookie(session.token,session.maxSeconds,{name:'understood_pg_rehearsal'}),location:'/#settings/retention'});res.end();
    })().catch(()=>{res.writeHead(503,{'cache-control':'no-store'});res.end('Fixture unavailable');});return;
  }
  if(req.method==='GET' && url.pathname.startsWith(`${policyPath}/requests/`) && receiptOutage) {
    receiptOutage=false;failedReceiptReads++;res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'Synthetic text receipt outage'}));return;
  }
  if(req.method==='GET' && url.pathname.startsWith(`${policyPath}/requests/`) && hideReceipt){
    hideReceipt=false;res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end('null');return;
  }
  if(req.method==='POST' && url.pathname===policyPath) {
    posts++;
    if(rejectRetry && !loseNext){rejectRetry=false;rejectedRetries++;res.writeHead(403,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'Synthetic later rejection'}));return;}
    if(loseNext) {
      loseNext=false;const end=res.end.bind(res);res.end=(...args)=>{
        if(res.statusCode===200){lostAcknowledgements++;receiptOutage=!rejectRetry;hideReceipt=rejectRetry;return end('{');}
        return end(...args);
      };
    }
  }
  handler(req,res);
});
await new Promise((done,reject)=>{api.once('error',reject);api.listen(port,'127.0.0.1',done);});
let stopping=false;
function stop() {
  if(stopping)return;stopping=true;clearTimeout(timeout);
  api.close(async()=>{
    console.log(JSON.stringify({policyPath,posts,lostAcknowledgements,failedReceiptReads,rejectedRetries,externalRequests:0,
      policies:(await db.query('SELECT revision,days FROM text_retention_policies')).rows,
      receiptCount:(await db.query('SELECT count(*)::integer AS n FROM text_retention_requests')).rows[0].n,
      casePolicies:(await db.query('SELECT revision,days FROM case_retention_policies')).rows,
      caseReceiptCount:(await db.query('SELECT count(*)::integer AS n FROM case_retention_requests')).rows[0].n,
      generatedPolicies:(await db.query('SELECT revision,days FROM generated_retention_policies')).rows,
      generatedReceiptCount:(await db.query('SELECT count(*)::integer AS n FROM generated_retention_requests')).rows[0].n,
      otherReceiptCounts:Object.fromEntries(await Promise.all(['retention_requests','recording_notice_requests','activity_retention_requests','briefing_retention_requests'].map(async table=>[table,(await db.query(`SELECT count(*)::integer AS n FROM ${table}`)).rows[0].n])))}));
    await db.close();process.stdin.pause();
  });api.closeIdleConnections();
}
const timeout=setTimeout(stop,15*60_000);
process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='stop')stop();});
process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(`Disposable built text-retention QA: ${config.publicOrigin}/api/qa-bootstrap?lost=1. In-memory data, no worker/provider/private-file I/O. Send stop on stdin for final counts.`);
