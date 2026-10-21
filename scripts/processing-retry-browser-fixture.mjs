import {createServer} from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations} from '../server/postgres/migrate.mjs';
import {createPostgresRehearsalServer} from '../server/postgres/http.mjs';
import {provisionStaffCredential,insertSession} from '../server/postgres/auth.mjs';
import {domainTransaction,publish,submitAnswer} from '../server/postgres/domain.mjs';
import {createDraft,queuePreparation,processOnePreparation} from '../server/postgres/preparation.mjs';
import {receiveRecording} from '../server/postgres/recordings.mjs';
import {requireLocalRequest,sessionCookie} from '../server/auth.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {CANONICAL_SOURCE} from '../server/domain.mjs';
import {encodeWav} from '../src/audio.ts';
const port=Number(process.env.UNDERSTOOD_PROCESSING_RETRY_FIXTURE_PORT ?? 3236),origin=`http://127.0.0.1:${port}`,schema='understood_test_processing_retry_browser';
if(!Number.isInteger(port) || port<1024 || port>65535 || [3020,3021].includes(port))throw Error('Use a separate disposable fixture port');
const db=new PGlite(),pool={async connect(){return {query:async(sql,args)=>args?.length?db.query(sql,args):(await db.exec(sql)).at(-1)??{rows:[]},release(){}};}};
await db.exec(`CREATE SCHEMA ${schema};SET search_path TO ${schema},pg_catalog`);await runMigrations(pool,{schema});
await db.exec(`INSERT INTO organizations VALUES('cedar','Synthetic');INSERT INTO sites VALUES('beirut','cedar','Synthetic site','UTC');
  INSERT INTO staff(id,org_id,site_id,name,role) VALUES('maya','cedar','beirut','Synthetic owner','owner'),('auditor','cedar','beirut','Synthetic auditor','auditor');
  INSERT INTO workers(id,org_id,site_id,code,language) VALUES('voice','cedar','beirut','Synthetic voice worker','en'),('typed','cedar','beirut','Synthetic typed worker','en');`);
for(const id of ['maya','auditor'])await provisionStaffCredential(pool,{staffId:id,orgId:'cedar',siteId:'beirut',email:`${id}@retry-browser.example.test`,password:'Disposable synthetic retry browser password'},{schema});
const owner={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner'},options={schema},objects=new Map();
const storage={async save(row,bytes){objects.set(row.id,Buffer.from(bytes));},async read(row){return objects.get(row.id);},async remove(row){objects.delete(row.id);},async exists(row){return objects.has(row.id);}};
const draft=await createDraft(pool,owner,{requestId:randomUUID(),title:'Synthetic retry briefing',source:CANONICAL_SOURCE},options);
await queuePreparation(pool,owner,draft.id,1,options);await processOnePreparation(pool,{schema,integrationMode:'synthetic'});
await publish(pool,owner,draft.id,{requestId:randomUUID(),revision:1,nextVersion:1,workerIds:['voice','typed']},{schema,integrationMode:'synthetic'});
const assignments=(await db.query('SELECT * FROM assignments')).rows,voice=assignments.find(row=>row.worker_id==='voice'),typed=assignments.find(row=>row.worker_id==='typed');
const worker=id=>({...owner,principal_type:'worker',principal_id:id}),bytes=Buffer.from(encodeWav({duration:1,sampleRate:16000,numberOfChannels:1,getChannelData:()=>Float32Array.from({length:16000},(_,i)=>Math.sin(i/10)*0.2)}));
const recording=await receiveRecording(pool,worker('voice'),voice.id,randomUUID(),bytes,storage,options);
await submitAnswer(pool,worker('typed'),typed.id,randomUUID(),'Synthetic typed answer remains unchanged',options);
const check=(await db.query('SELECT id FROM assessment_jobs')).rows[0];
await db.query("UPDATE recordings SET status='failed',attempts=3 WHERE id=$1",[recording.id]);await db.query("UPDATE assessment_jobs SET status='failed',attempts=3 WHERE id=$1",[check.id]);
const api=createPostgresRehearsalServer(pool,{tier:'local',aiMode:'synthetic',accessMode:'credential',dataClass:'synthetic',schema,publicOrigin:origin,storage,mail:{mode:'disabled'}}),handler=api.listeners('request')[0],build=await loadPublicBuild('dist');
const faults={next:'lost',receipts:'fail'},observed={posts:0,lost:0,before:0,receiptFailures:0,receiptMissing:0};
const tables=['organizations','sites','workers','briefings','publications','assignments','attempts'];
const hash=async table=>createHash('sha256').update(JSON.stringify((await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows)).digest('hex');
const before=Object.fromEntries(await Promise.all(tables.map(async table=>[table,await hash(table)])));
const ui=createServer(async(req,res)=>{
  const url=new URL(req.url,origin);
  if(url.pathname==='/__qa/stop' && req.method==='POST'){requireLocalRequest(req);res.writeHead(200);res.end('Stopping disposable fixture');setImmediate(stop);return;}
  if(url.pathname==='/__qa/control' && req.method==='POST'){
    requireLocalRequest(req);let text='';for await(const part of req){text+=part;if(text.length>300){res.writeHead(400);return res.end();}}
    try{const value=JSON.parse(text);if(Object.keys(value).sort().join(',')!=='next,receipts' || !['none','lost','before'].includes(value.next) || !['normal','fail','missing'].includes(value.receipts))throw Error();Object.assign(faults,value);res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({configured:true}));}catch{res.writeHead(400);return res.end();}
  }
  if(url.pathname==='/api/qa-bootstrap' && req.method==='GET'){
    requireLocalRequest(req);const id=url.searchParams.get('role')==='auditor'?'auditor':'maya',principal=(await db.query('SELECT * FROM staff WHERE id=$1',[id])).rows[0];
    const session=await domainTransaction(pool,schema,client=>insertSession(client,principal,'staff'));
    res.writeHead(302,{'cache-control':'no-store','set-cookie':sessionCookie(session.token,session.maxSeconds,{name:'understood_pg_rehearsal'}),location:'/#processing'});return res.end();
  }
  const match=/^\/api\/processing\/([^/]+)\/retries(?:\/([^/]+))?$/.exec(url.pathname);
  if(match && req.method==='GET' && match[2] && faults.receipts!=='normal'){
    const missing=faults.receipts==='missing';observed[missing?'receiptMissing':'receiptFailures']++;
    res.writeHead(missing?200:503,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify(missing?{found:false}:{error:'Synthetic receipt outage.'}));
  }
  if(match && req.method==='POST' && !match[2]){
    observed.posts++;const fault=faults.next;faults.next='none';
    if(fault==='before'){observed.before++;res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({error:'Synthetic request stopped before commit.'}));}
    if(fault==='lost'){
      const head=res.writeHead.bind(res),end=res.end.bind(res);let accepted=false;
      res.writeHead=(status,...args)=>{accepted=status===202;return head(accepted?503:status,...args);};
      res.end=(body,...args)=>{
        if(!accepted)return end(body,...args);observed.lost++;
        const [kind,id]=decodeURIComponent(match[1]).split(':'),table=kind==='answer_check'?'assessment_jobs':'recordings';
        db.query(`UPDATE ${table} SET status='failed',attempts=3 WHERE id=$1`,[id]).then(()=>end(JSON.stringify({error:'Synthetic acknowledgement lost after commit.'}),...args));return res;
      };
    }
  }
  if(url.pathname.startsWith('/api/'))return handler(req,res);return build(req,res,url);
});
await new Promise((resolve,reject)=>{ui.once('error',reject);ui.listen(port,'127.0.0.1',resolve);});
let stopping=false;
function stop(){if(stopping)return;stopping=true;clearTimeout(timeout);ui.close(async()=>{
  const protectedTables=await Promise.all(tables.map(async table=>({table,unchanged:before[table]===await hash(table)})));
  console.log(JSON.stringify({terminal:true,observed,protectedTables,receipts:(await db.query('SELECT kind,generation FROM processing_retries ORDER BY created_at')).rows,externalCalls:0}));await db.close();process.stdin.pause();
});ui.closeIdleConnections();}
const timeout=setTimeout(stop,20*60_000);process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(JSON.stringify({fixture:'synthetic-processing-retry',url:`${origin}/api/qa-bootstrap`,voiceJobId:`response_transcription:${recording.id}`,typedJobId:`answer_check:${check.id}`,expiresInSeconds:1200}));
