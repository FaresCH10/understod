import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {provisionStaffCredential,createSession,sessionCookie,requireLocalRequest} from '../server/auth.mjs';
import {createAppServer} from '../server/index.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';

const port=Number(process.env.UNDERSTOOD_ONBOARDING_FIXTURE_PORT ?? 3213),origin=`http://127.0.0.1:${port}`;
if(!Number.isInteger(port) || port<1024 || port>65535 || [3020,3021].includes(port))throw Error('Use a separate disposable fixture port');
const db=openDatabase(':memory:');seed(db);
db.prepare('INSERT INTO staff VALUES(?,?,?,?,?,1)').run('rami','cedar','beirut','Synthetic supervisor','supervisor');
provisionStaffCredential(db,'maya','fixture@example.test','Disposable synthetic password only');
provisionStaffCredential(db,'rami','supervisor@fixture.example.test','Disposable synthetic supervisor password only');
const api=createAppServer(db,{tier:'local',aiMode:'synthetic',accessMode:'credential',dataClass:'synthetic',publicOrigin:origin,mail:{mode:'disabled'}});
const handler=api.listeners('request')[0],publicBuild=await loadPublicBuild('dist');
const fingerprint=table=>createHash('sha256').update(JSON.stringify(db.prepare(`SELECT * FROM ${table} ORDER BY id`).all())).digest('hex');
const protectedTables=['organizations','sites','workers','briefings','publications','assignments','attempts','clarifications'],before=Object.fromEntries(protectedTables.map(table=>[table,fingerprint(table)]));
const faults={posts:0,receiptStage:0,rejected:0,beforeCommitFailures:0};
const ui=createServer((req,res)=>{
  const url=new URL(req.url,origin),reject=(status,error)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error}));};
  if(url.pathname==='/api/qa-bootstrap' && req.method==='GET'){
    requireLocalRequest(req);const session=createSession(db,db.prepare('SELECT * FROM staff WHERE id=?').get(url.searchParams.get('supervisor')==='1'?'rami':'maya'),'staff','credential');
    res.writeHead(302,{'set-cookie':sessionCookie(session.token,session.maxSeconds),location:'/#settings/onboarding','cache-control':'no-store'});return res.end();
  }
  if(/^\/api\/settings\/onboarding\/receipts\/[^/]+$/.test(url.pathname) && req.method==='GET'){
    if(faults.receiptStage===1){faults.receiptStage=2;return reject(503,'Synthetic setup receipt unavailable.');}
    if(faults.receiptStage===2){faults.receiptStage=3;res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end('{"found":false}');}
  }
  if(url.pathname==='/api/settings/onboarding' && req.method==='POST'){
    faults.posts++;
    if(faults.posts===2){faults.rejected++;return reject(403,'Synthetic later setup rejection. Original change remains saved.');}
    if(faults.posts===3){faults.beforeCommitFailures++;return reject(503,'Synthetic setup interruption before acceptance.');}
    if(faults.posts===1){
      const writeHead=res.writeHead.bind(res),end=res.end.bind(res);let committed=false;
      res.writeHead=(status,...args)=>{committed=status===200;return writeHead(committed?503:status,...args);};
      res.end=(body,...args)=>{if(committed)faults.receiptStage=1;return end(committed?JSON.stringify({error:'Synthetic setup acknowledgement interrupted after commit.'}):body,...args);};
    }
  }
  if(url.pathname.startsWith('/api/'))return handler(req,res);
  return publicBuild(req,res,url);
});
await new Promise((resolve,reject)=>{ui.once('error',reject);ui.listen(port,'127.0.0.1',resolve);});
let stopping=false;
function stop(){if(stopping)return;stopping=true;clearTimeout(timeout);ui.close(()=>{
  console.log(JSON.stringify({terminal:true,faults,protectedTables:protectedTables.map(table=>({table,unchanged:fingerprint(table)===before[table]})),
    setup:db.prepare('SELECT revision,step,first_briefing_id FROM site_onboarding').all(),receipts:db.prepare('SELECT request_id,revision,requested_by FROM onboarding_requests ORDER BY revision').all(),
    setupAuditEvents:db.prepare("SELECT COUNT(*) n FROM audit WHERE action='onboarding.progress_saved'").get().n,externalRequests:0}));db.close();process.stdin.pause();
  });ui.closeIdleConnections();}
const timeout=setTimeout(stop,20*60_000);process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='stop')stop();});process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(`Built memory-only onboarding QA: ${origin}/api/qa-bootstrap. Setup acknowledgement withheld after commit, receipt outage/missing and later rejection; next change interrupts before commit. No providers, mail or cloud calls. Send stop for evidence and shutdown.`);
