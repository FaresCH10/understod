import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {provisionOperator,authenticateOperator} from '../server/postgres/operators.mjs';
import {issueWorkerGrant,redeemWorkerGrant} from '../server/postgres/auth.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {requireLocalRequest,sessionCookie} from '../server/auth.mjs';

const port=3215,origin=`http://127.0.0.1:${port}`,schema='understood_test_operator_access_browser',db=new PGlite();
let queue=Promise.resolve();
const pool={async connect(){const previous=queue;let release;queue=new Promise(done=>{release=done;});await previous;return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)??{rows:[]},release};}};
await db.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog`);await runMigrations(pool,{schema});
await db.exec(`INSERT INTO organizations VALUES('qa','Synthetic Operations QA'),('foreign','Other Operations QA');
  INSERT INTO sites VALUES('main','qa','Beirut QA','UTC'),('second','qa','Tripoli QA','UTC'),('foreign','foreign','Foreign site','UTC');
  INSERT INTO staff(id,org_id,site_id,name,role) VALUES('owner','qa','main','Synthetic owner','owner');
  INSERT INTO workers(id,org_id,site_id,code,language,active) VALUES('current','qa','main','Worker current','en',true),
    ('pending','qa','main','Worker pending','ar',true),('disabled','qa','main','Worker disabled','ur',false),('second','qa','second','Worker second','en',true);
  INSERT INTO workers(id,org_id,site_id,code,language) SELECT 'page-'||n,'qa','main','Worker '||lpad(n::text,3,'0'),'en' FROM generate_series(1,125) n;`);
const options={schema},id=randomUUID(),password=`Synthetic-${randomUUID()}!`;
await provisionOperator(pool,{id,email:'operator@qa.example.test',name:'Synthetic Operator',password},options);
const login=await authenticateOperator(pool,{email:'operator@qa.example.test',password},'local',options);
const owner={principal_type:'staff',principal_id:'owner',org_id:'qa',site_id:'main',role:'owner'};
await redeemWorkerGrant(pool,(await issueWorkerGrant(pool,owner,'current',240,options)).token,options);
await issueWorkerGrant(pool,owner,'pending',240,options);
await db.query("INSERT INTO site_access_controls(site_id,org_id,revision,state,reason) VALUES('second','qa',1,'paused','maintenance')");
const inventory=async()=>JSON.stringify(await db.query(`SELECT * FROM (SELECT 'workers' AS source,to_jsonb(w) AS value FROM workers w
  UNION ALL SELECT 'sessions',to_jsonb(s) FROM sessions s UNION ALL SELECT 'worker_grants',to_jsonb(g) FROM worker_grants g
  UNION ALL SELECT 'operator_audit',to_jsonb(o) FROM operator_audit o UNION ALL SELECT 'operator_requests',to_jsonb(r) FROM operator_requests r
  UNION ALL SELECT 'audit',to_jsonb(a) FROM audit a) evidence ORDER BY source,value::text`));
const before=await inventory(),api=createPostgresRehearsalServer(pool,{...options,operatorAccess:true,dataClass:'synthetic',tier:'local',aiMode:'synthetic',accessMode:'credential',publicOrigin:origin,publicBuild:await loadPublicBuild('dist')});
const handler=api.listeners('request')[0];api.removeAllListeners('request');let reads=0;
api.on('request',(req,res)=>{
  const url=new URL(req.url,origin);
  if(url.pathname==='/api/qa-operator-access' && req.method==='GET'){
    try{requireLocalRequest(req);res.writeHead(302,{'cache-control':'no-store','set-cookie':sessionCookie(login.token,login.maxSeconds,{name:'understood_operator'}),location:'/#operations'});res.end();}
    catch{res.writeHead(403);res.end();}return;
  }
  if(url.pathname==='/api/ops/tenant-access' && req.method==='GET'){
    reads++;if(url.searchParams.get('search')==='QA failure'){res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'Synthetic read interruption'}));return;}
  }
  handler(req,res);
});
await new Promise((done,reject)=>{api.once('error',reject);api.listen(port,'127.0.0.1',done);});let stopping=false;
function stop(){if(stopping)return;stopping=true;clearTimeout(timeout);api.close(async()=>{const after=await inventory();console.log(JSON.stringify({terminal:true,reads,metadataAndAccessUnchanged:before===after,beforeHash:createHash('sha256').update(before).digest('hex'),afterHash:createHash('sha256').update(after).digest('hex'),externalCalls:0}));await db.close();process.stdin.pause();});api.closeIdleConnections();}
const timeout=setTimeout(stop,15*60_000);process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='stop')stop();});process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(JSON.stringify({fixture:'synthetic-operator-tenant-access',url:`${origin}/api/qa-operator-access`,expiresInSeconds:900}));
