import {createServer} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {createDraft,queuePreparation} from '../server/preparation.mjs';
import {processOne} from '../server/worker.mjs';
import {createAppServer} from '../server/index.mjs';
import {provisionStaffCredential,createSession,sessionCookie,requireLocalRequest} from '../server/auth.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {CANONICAL_SOURCE} from '../server/domain.mjs';
const port=Number(process.env.UNDERSTOOD_PREPARATION_FIXTURE_PORT ?? 3234),origin=`http://127.0.0.1:${port}`;
if(!Number.isInteger(port) || port<1024 || port>65535 || [3020,3021].includes(port))throw Error('Use a separate disposable fixture port');
const db=openDatabase(':memory:');seed(db);
provisionStaffCredential(db,'maya','maya@preparation.example.test','Disposable synthetic fixture password only');
const owner={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner'};
const draft=createDraft(db,owner,{requestId:randomUUID(),title:'Synthetic recovery QA',source:'This unsupported synthetic instruction must fail safely.'});
const job=queuePreparation(db,owner,draft.id,1);while(processOne(db)){}
const fresh=createDraft(db,owner,{requestId:randomUUID(),title:'Synthetic fresh preparation',source:CANONICAL_SOURCE});
const api=createAppServer(db,{tier:'local',aiMode:'synthetic',accessMode:'credential',dataClass:'synthetic',publicOrigin:origin,mail:{mode:'disabled'}});
const handler=api.listeners('request')[0],build=await loadPublicBuild('dist'),faults={next:'lost',receipts:'fail'},observed={posts:0,lost:0,before:0,receiptFailures:0,receiptMissing:0};
const tables=['organizations','sites','workers','publications','assignments','attempts','clarifications'];
const hash=table=>createHash('sha256').update(JSON.stringify(db.prepare(`SELECT * FROM ${table} ORDER BY id`).all())).digest('hex');
const before=Object.fromEntries(tables.map(table=>[table,hash(table)]));
const ui=createServer(async(req,res)=>{
  const url=new URL(req.url,origin);
  if(url.pathname==='/__qa/control' && req.method==='POST') {
    requireLocalRequest(req);let text='';for await(const part of req){text+=part;if(text.length>300){res.writeHead(400);return res.end();}}
    try{const value=JSON.parse(text);if(Object.keys(value).sort().join(',')!=='next,receipts' || !['none','lost','before'].includes(value.next) || !['normal','fail','missing'].includes(value.receipts))throw Error();Object.assign(faults,value);res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({configured:true}));}catch{res.writeHead(400);return res.end();}
  }
  if(url.pathname==='/api/qa-bootstrap' && req.method==='GET') {
    requireLocalRequest(req);const session=createSession(db,db.prepare("SELECT * FROM staff WHERE id='maya'").get(),'staff','credential');
    res.writeHead(302,{'cache-control':'no-store','set-cookie':sessionCookie(session.token,session.maxSeconds),location:`/#processing/${job.id}`});return res.end();
  }
  const match=url.pathname.match(/^\/api\/briefings\/[^/]+\/preparation-requests(?:\/([^/]+))?$/);
  if(match && req.method==='GET' && match[1] && faults.receipts!=='normal') {
    const missing=faults.receipts==='missing';observed[missing?'receiptMissing':'receiptFailures']++;
    res.writeHead(missing?200:503,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify(missing?{found:false}:{error:'Synthetic receipt outage.'}));
  }
  if(match && req.method==='POST' && !match[1]) {
    observed.posts++;const fault=faults.next;faults.next='none';
    if(fault==='before'){observed.before++;res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({error:'Synthetic request rejected before commit.'}));}
    if(fault==='lost') {
      const head=res.writeHead.bind(res),end=res.end.bind(res);let accepted=false;
      res.writeHead=(status,...args)=>{accepted=status===202;return head(accepted?503:status,...args);};
      res.end=(body,...args)=>{if(accepted){observed.lost++;setImmediate(()=>{while(processOne(db)) {}});}return end(accepted?JSON.stringify({error:'Synthetic acknowledgement interrupted after commit.'}):body,...args);};
    }
  }
  if(url.pathname.startsWith('/api/'))return handler(req,res);
  return build(req,res,url);
});
await new Promise((resolve,reject)=>{ui.once('error',reject);ui.listen(port,'127.0.0.1',resolve);});
let stopping=false;
function stop(){if(stopping)return;stopping=true;clearTimeout(timeout);ui.close(()=>{
  console.log(JSON.stringify({terminal:true,observed,protectedTables:tables.map(table=>({table,unchanged:before[table]===hash(table)})),
    receipts:db.prepare('SELECT revision,generation FROM preparation_requests ORDER BY created_at').all(),
    processingRequests:db.prepare("SELECT count(*) AS n FROM audit WHERE action='briefing.processing_requested'").get().n,
    job:db.prepare('SELECT status,attempts FROM jobs WHERE id=?').get(job.id),externalCalls:0}));db.close();process.stdin.pause();
  });ui.closeIdleConnections();}
const timeout=setTimeout(stop,20*60_000);process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='stop')stop();});process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(JSON.stringify({fixture:'synthetic-preparation-recovery',url:`${origin}/api/qa-bootstrap`,jobId:job.id,briefingId:draft.id,freshBriefingId:fresh.id,expiresInSeconds:1200}));
