import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {insertSession,inSchema,provisionStaffCredential,issueWorkerGrant} from '../server/postgres/auth.mjs';
import {requireLocalRequest,sessionCookie} from '../server/auth.mjs';
import {CANONICAL_SOURCE,syntheticPrepare} from '../server/domain.mjs';

const port=Number(process.env.UNDERSTOOD_ENTRY_FIXTURE_PORT??3214),schema='understood_test_worker_entry_browser',db=new PGlite();
if(!Number.isInteger(port) || port<1024 || port>65535 || [3020,3021].includes(port))throw Error('Use a separate disposable fixture port');
let queue=Promise.resolve();
const pool={async connect(){const previous=queue;let release;queue=new Promise(done=>{release=done;});await previous;return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)||{rows:[]},release};}};
const origin=`http://127.0.0.1:${port}`,owner={principal_type:'staff',principal_id:'owner',org_id:'qa',site_id:'qa',role:'owner'};
await db.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog`);await runMigrations(pool,{schema});
await db.exec(`INSERT INTO organizations VALUES('qa','Synthetic Entry QA');INSERT INTO sites VALUES('qa','qa','Beirut QA','Asia/Beirut');
  INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','qa','qa','Synthetic Owner','owner');
  INSERT INTO workers(id,org_id,site_id,code,language,active) VALUES('worker','qa','qa','Worker 001','en',true);`);
await provisionStaffCredential(pool,{staffId:'owner',orgId:'qa',siteId:'qa',email:'owner@entry.example.test',password:`Synthetic-${randomUUID()}!`},{schema});
await db.query("INSERT INTO briefings(id,org_id,site_id,title,source,state,next_version) VALUES('brief','qa','qa','Shelf colour handover',$1,'draft',4)",[CANONICAL_SOURCE]);
await db.query("INSERT INTO publications(id,org_id,site_id,briefing_id,version,snapshot_json,state) VALUES('publication','qa','qa','brief',3,$1,'published')",[JSON.stringify(syntheticPrepare(CANONICAL_SOURCE))]);
await db.query("INSERT INTO assignments(id,org_id,site_id,publication_id,worker_id,language) VALUES('assignment','qa','qa','publication','worker','en')");
const api=createPostgresRehearsalServer(pool,{schema,dataClass:'synthetic',tier:'local',aiMode:'synthetic',accessMode:'credential',publicOrigin:origin,publicBuild:await loadPublicBuild('dist')});
const handler=api.listeners('request')[0];api.removeAllListeners('request');let scenario='accepted',lose=true,proofFailures=0;const counters={accepted:{redeem:0,logout:0,proof:0},before:{redeem:0,logout:0,proof:0}};
api.on('request',(req,res)=>{
  const url=new URL(req.url,origin);
  if(url.pathname==='/api/qa-entry' && req.method==='GET'){
    (async()=>{requireLocalRequest(req);scenario=url.searchParams.get('scenario')==='before'?'before':'accepted';lose=true;proofFailures=scenario==='accepted'?2:0;
      const grant=await issueWorkerGrant(pool,owner,'worker',240,{schema}),session=await inSchema(pool,schema,client=>insertSession(client,{id:'owner',org_id:'qa',site_id:'qa'},'staff'));
      res.writeHead(302,{'cache-control':'no-store','set-cookie':sessionCookie(session.token,session.maxSeconds,{name:'understood_pg_rehearsal'}),location:`/#worker-access/${grant.token}`});res.end();})().catch(()=>{res.writeHead(503);res.end('Synthetic fixture unavailable');});return;
  }
  if(url.pathname==='/api/logout' && req.method==='POST')counters[scenario].logout++;
  if(url.pathname==='/api/auth/worker/redemption' && req.method==='GET'){
    counters[scenario].proof++;
    if(proofFailures>0){proofFailures--;res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'Synthetic access check interrupted.'}));return;}
  }
  if(url.pathname==='/api/auth/worker/redeem' && req.method==='POST'){
    counters[scenario].redeem++;
    if(scenario==='before'){res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'Synthetic interruption before acceptance.'}));return;}
    if(lose){const head=res.writeHead.bind(res),end=res.end.bind(res);let committed=false;
      res.writeHead=(status,...args)=>{committed=status===200;if(committed)lose=false;return head(committed?503:status,...args);};
      res.end=(body,...args)=>end(committed?JSON.stringify({error:'Synthetic acknowledgement interrupted.'}):body,...args);}
  }
  handler(req,res);
});
await new Promise((done,reject)=>{api.once('error',reject);api.listen(port,'127.0.0.1',done);});let stopping=false;
function stop(){if(stopping)return;stopping=true;clearTimeout(timeout);api.close(async()=>{
  const read=async(sql)=>Number((await db.query(sql)).rows[0].n);
  console.log(JSON.stringify({terminal:true,counters,redeemed:await read('SELECT COUNT(*) AS n FROM worker_grants WHERE redeemed_at IS NOT NULL'),activeWorkerSessions:await read("SELECT COUNT(*) AS n FROM sessions WHERE principal_type='worker' AND revoked_at IS NULL"),attempts:await read('SELECT COUNT(*) AS n FROM attempts'),externalCalls:0}));await db.close();process.stdin.pause();});api.closeIdleConnections();}
const timeout=setTimeout(stop,15*60_000);process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='stop')stop();});process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(JSON.stringify({fixture:'synthetic-worker-entry',url:`${origin}/api/qa-entry`,expiresInSeconds:900}));
