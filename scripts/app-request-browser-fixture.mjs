import {createServer} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {CANONICAL_SOURCE} from '../server/domain.mjs';
import {createDraft,queuePreparation} from '../server/preparation.mjs';
import {createAppServer} from '../server/index.mjs';
import {provisionStaffCredential,createSession,sessionCookie,requireLocalRequest} from '../server/auth.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';

const port=Number(process.env.UNDERSTOOD_APP_FIXTURE_PORT ?? 3216),origin=`http://127.0.0.1:${port}`;
if(!Number.isInteger(port) || port<1024 || port>65535 || [3020,3021].includes(port))throw Error('Use a separate disposable fixture port');
const db=openDatabase(':memory:');seed(db);
db.prepare('INSERT INTO staff VALUES(?,?,?,?,?,1)').run('app-auditor','cedar','beirut','Synthetic auditor','auditor');
for(const id of ['maya','app-auditor'])provisionStaffCredential(db,id,`${id}@app.example.test`,'Disposable synthetic fixture password only');
const api=createAppServer(db,{tier:'local',aiMode:'synthetic',accessMode:'credential',dataClass:'synthetic',publicOrigin:origin,mail:{mode:'disabled'}});
const owner={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner'};
const failed=createDraft(db,owner,{requestId:randomUUID(),title:'Synthetic retry QA',source:CANONICAL_SOURCE}),job=queuePreparation(db,owner,failed.id,1);
db.prepare("UPDATE jobs SET status='failed',attempts=1,error='PRIVATE PROVIDER ERROR' WHERE id=?").run(job.id);
db.prepare("UPDATE briefings SET state='failed' WHERE id=?").run(failed.id);
const fresh=createDraft(db,owner,{requestId:randomUUID(),title:'Synthetic fresh QA',source:CANONICAL_SOURCE});
const handler=api.listeners('request')[0],publicBuild=await loadPublicBuild('dist'),faults={posts:0,beforeCommitFailures:0,lostAcknowledgements:0};
const protectedTables=['organizations','sites','workers','publications','assignments','attempts','clarifications'];
const fingerprint=table=>createHash('sha256').update(JSON.stringify(db.prepare(`SELECT * FROM ${table} ORDER BY id`).all())).digest('hex'),before=Object.fromEntries(protectedTables.map(table=>[table,fingerprint(table)]));
const ui=createServer((req,res)=>{
  const url=new URL(req.url,origin);
  if(url.pathname==='/api/qa-bootstrap' && req.method==='GET'){
    requireLocalRequest(req);const session=createSession(db,db.prepare('SELECT * FROM staff WHERE id=?').get(url.searchParams.get('auditor')==='1'?'app-auditor':'maya'),'staff','credential');
    res.writeHead(302,{'cache-control':'no-store','set-cookie':sessionCookie(session.token,session.maxSeconds),location:'/#processing','content-type':'text/plain'});return res.end();
  }
  if(/^\/api\/briefings\/[^/]+\/process$/.test(url.pathname) && req.method==='POST'){
    faults.posts++;
    if(faults.posts===1){faults.beforeCommitFailures++;res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({error:'Synthetic retry interruption before acceptance.'}));}
    if(faults.posts===3){const writeHead=res.writeHead.bind(res),end=res.end.bind(res);let committed=false;
      res.writeHead=(status,...args)=>{committed=status===202;return writeHead(committed?503:status,...args);};
      res.end=(body,...args)=>{if(committed)faults.lostAcknowledgements++;return end(committed?JSON.stringify({error:'Synthetic App acknowledgement interrupted after commit.'}):body,...args);};
    }
  }
  if(url.pathname.startsWith('/api/'))return handler(req,res);
  return publicBuild(req,res,url);
});
await new Promise((resolve,reject)=>{ui.once('error',reject);ui.listen(port,'127.0.0.1',resolve);});
let stopping=false;
function stop(){if(stopping)return;stopping=true;clearTimeout(timeout);ui.close(()=>{
  console.log(JSON.stringify({terminal:true,faults,protectedTables:protectedTables.map(table=>({table,unchanged:before[table]===fingerprint(table)})),
    jobs:db.prepare('SELECT id,status,attempts,revision FROM jobs WHERE briefing_id IN (?,?) ORDER BY briefing_id').all(failed.id,fresh.id),
    processingRequests:db.prepare("SELECT COUNT(*) n FROM audit WHERE action='briefing.processing_requested' AND object_id IN (SELECT id FROM jobs WHERE briefing_id IN (?,?))").get(failed.id,fresh.id).n,externalCalls:0}));db.close();process.stdin.pause();});ui.closeIdleConnections();}
const timeout=setTimeout(stop,20*60_000);process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='stop')stop();});process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(JSON.stringify({fixture:'synthetic-app-staff',url:`${origin}/api/qa-bootstrap`,jobId:job.id,failedBriefingId:failed.id,freshBriefingId:fresh.id,expiresInSeconds:1200}));
