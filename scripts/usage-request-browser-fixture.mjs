import {createHash,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {insertSession,inSchema,provisionStaffCredential} from '../server/postgres/auth.mjs';
import {saveUsageRequest} from '../server/postgres/usage-requests.mjs';
import {requireLocalRequest,sessionCookie} from '../server/auth.mjs';

const port=Number(process.env.UNDERSTOOD_USAGE_FIXTURE_PORT ?? 3214),schema='understood_test_usage_request_browser',db=new PGlite();
if(!Number.isInteger(port) || port<1024 || port>65535 || [3020,3021].includes(port))throw Error('Use a separate disposable fixture port');
let queue=Promise.resolve();
const pool={async connect(){const previous=queue;let release;queue=new Promise(done=>{release=done;});await previous;
  return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)||{rows:[]},release};}};
const origin=`http://127.0.0.1:${port}`;
await db.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog`);await runMigrations(pool,{schema});
await db.exec("INSERT INTO organizations VALUES('qa','Synthetic Usage QA'),('foreign','Synthetic Foreign');INSERT INTO sites VALUES('qa','qa','Beirut QA','Asia/Beirut'),('other','foreign','Foreign QA','UTC');INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','qa','qa','Synthetic Owner','owner'),('supervisor','qa','qa','Synthetic Supervisor','supervisor'),('admin','qa','qa','Synthetic Administrator','administrator'),('auditor','qa','qa','Synthetic Auditor','auditor'),('foreign-owner','foreign','other','Synthetic Foreign Owner','owner');");
for(const id of ['owner','supervisor','admin','auditor','foreign-owner'])await provisionStaffCredential(pool,{staffId:id,orgId:id==='foreign-owner'?'foreign':'qa',siteId:id==='foreign-owner'?'other':'qa',email:`${id}@usage.example.test`,password:`Synthetic-${randomUUID()}!`},{schema});
const actor=id=>({principal_type:'staff',principal_id:id,org_id:id==='foreign-owner'?'foreign':'qa',site_id:id==='foreign-owner'?'other':'qa',role:id==='supervisor'?'supervisor':id==='admin'?'administrator':'owner'});
for(let n=1;n<=11;n++)await saveUsageRequest(pool,actor('owner'),{requestId:randomUUID(),kind:'contact',message:`Synthetic owner seed ${n}`,confirmed:true},{schema});
await saveUsageRequest(pool,actor('supervisor'),{requestId:randomUUID(),kind:'contact',message:'Synthetic supervisor seed',confirmed:true},{schema});
await saveUsageRequest(pool,actor('foreign-owner'),{requestId:randomUUID(),kind:'contact',message:'FOREIGN PRIVATE REQUEST MUST NOT APPEAR',confirmed:true},{schema});
const protectedTables=['briefings','publications','assignments','attempts','clarifications','provider_policies','provider_operations','provider_requests','invoices','invoice_payments','staff_invitation_mail'];
const fingerprint=async()=>Object.fromEntries(await (async()=>{const rows=[];for(const table of protectedTables)rows.push([table,createHash('sha256').update(JSON.stringify((await db.query(`SELECT * FROM ${table} ORDER BY 1`)).rows)).digest('hex')]);return rows;})());
const before=await fingerprint(),faults={posts:0,receiptStage:0,rejected:0,beforeCommitFailures:0};
const api=createPostgresRehearsalServer(pool,{schema,dataClass:'synthetic',tier:'local',aiMode:'synthetic',accessMode:'credential',publicOrigin:origin,publicBuild:await loadPublicBuild('dist')});
const handler=api.listeners('request')[0];api.removeAllListeners('request');
api.on('request',(req,res)=>{
  const url=new URL(req.url,origin),reject=(status,error)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error}));};
  if(url.pathname==='/api/qa-bootstrap' && req.method==='GET'){
    (async()=>{requireLocalRequest(req);const role=url.searchParams.get('role'),id=['supervisor','admin','auditor','foreign-owner'].includes(role)?role:'owner';
      const session=await inSchema(pool,schema,client=>insertSession(client,{id,org_id:id==='foreign-owner'?'foreign':'qa',site_id:id==='foreign-owner'?'other':'qa'},'staff'));
      res.writeHead(302,{'cache-control':'no-store','set-cookie':sessionCookie(session.token,session.maxSeconds,{name:'understood_pg_rehearsal'}),location:'/#settings/usage'});res.end();})()
      .catch(()=>reject(503,'Synthetic fixture unavailable'));return;
  }
  if(/^\/api\/usage\/requests\/[^/]+$/.test(url.pathname) && req.method==='GET'){
    if(faults.receiptStage===1){faults.receiptStage=2;return reject(503,'Synthetic usage receipt unavailable.');}
    if(faults.receiptStage===2){faults.receiptStage=3;res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end('{"found":false}');}
  }
  if(url.pathname==='/api/usage/requests' && req.method==='POST'){
    faults.posts++;
    if(faults.posts===2){faults.rejected++;return reject(403,'Synthetic later request rejection. Original request remains saved.');}
    if(faults.posts===3){faults.beforeCommitFailures++;return reject(503,'Synthetic usage interruption before acceptance.');}
    if(faults.posts===1){const writeHead=res.writeHead.bind(res),end=res.end.bind(res);let committed=false;
      res.writeHead=(status,...args)=>{committed=status===201 || status===200;return writeHead(committed?503:status,...args);};
      res.end=(body,...args)=>{if(committed)faults.receiptStage=1;return end(committed?JSON.stringify({error:'Synthetic usage acknowledgement interrupted after commit.'}):body,...args);};
    }
  }
  handler(req,res);
});
await new Promise((done,reject)=>{api.once('error',reject);api.listen(port,'127.0.0.1',done);});
let stopping=false;
function stop(){if(stopping)return;stopping=true;clearTimeout(timeout);api.close(async()=>{
  const after=await fingerprint();console.log(JSON.stringify({terminal:true,faults,protectedTables:protectedTables.map(table=>({table,unchanged:before[table]===after[table]})),
    recordedRequests:(await db.query('SELECT created_by,COUNT(*)::int count FROM usage_change_requests GROUP BY created_by ORDER BY created_by')).rows,
    usageAuditEvents:(await db.query("SELECT COUNT(*)::int n FROM audit WHERE action='usage.change_requested'")).rows[0].n,externalCalls:0}));await db.close();process.stdin.pause();});api.closeIdleConnections();}
const timeout=setTimeout(stop,20*60_000);process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='stop')stop();});process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(JSON.stringify({fixture:'synthetic-usage-requests',url:`${origin}/api/qa-bootstrap`,expiresInSeconds:1200}));
