import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {provisionStaffCredential,createSession,sessionCookie,requireLocalRequest} from '../server/auth.mjs';
import {createAppServer} from '../server/index.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';

const port=Number(process.env.UNDERSTOOD_NOTIFICATION_FIXTURE_PORT ?? 3212),origin=`http://127.0.0.1:${port}`;
if(!Number.isInteger(port) || port<1024 || port>65535 || [3020,3021].includes(port))throw Error('Use a separate disposable fixture port');
const db=openDatabase(':memory:');seed(db);
db.prepare('INSERT INTO staff VALUES(?,?,?,?,?,1)').run('notification-auditor','cedar','beirut','Synthetic auditor','auditor');
provisionStaffCredential(db,'maya','fixture@example.test','Disposable synthetic password only');
provisionStaffCredential(db,'notification-auditor','auditor@fixture.example.test','Disposable synthetic auditor password only');
const event=(id,action,seconds)=>db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?,?)').run(id,'cedar','beirut','system','synthetic-pipeline',action,'PRIVATE OBJECT MUST NOT APPEAR',new Date(Date.now()-seconds*1000).toISOString());
event('qa-help','help.requested',2);event('qa-export','export.failed',3);
for(let index=0;index<24;index++)event(`qa-page-${index}`,'briefing.prepared',index+4);
event('qa-private','private.credential',1);
const api=createAppServer(db,{tier:'local',aiMode:'synthetic',accessMode:'credential',dataClass:'synthetic',publicOrigin:origin,mail:{mode:'disabled'}});
const handler=api.listeners('request')[0],publicBuild=await loadPublicBuild('dist');
const fingerprint=table=>createHash('sha256').update(JSON.stringify(db.prepare(`SELECT * FROM ${table} ORDER BY id`).all())).digest('hex'),before={publications:fingerprint('publications'),audit:fingerprint('audit')};
const faults={help:{posts:0,receiptStage:0,rejected:0},export:{posts:0,beforeCommitFailures:0}};
const ui=createServer((req,res)=>{
  const url=new URL(req.url,origin);
  if(url.pathname==='/api/qa-bootstrap' && req.method==='GET') {
    requireLocalRequest(req);const session=createSession(db,db.prepare('SELECT * FROM staff WHERE id=?').get(url.searchParams.get('auditor')==='1'?'notification-auditor':'maya'),'staff','credential');
    res.writeHead(302,{'set-cookie':sessionCookie(session.token,session.maxSeconds),location:'/#notifications','cache-control':'no-store'});return res.end();
  }
  const reject=(status,error)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error}));};
  if(url.pathname==='/api/notifications/qa-help/receipt' && req.method==='GET') {
    const state=faults.help;
    if(state.receiptStage===1){state.receiptStage=2;return reject(503,'Synthetic personal read receipt unavailable.');}
    if(state.receiptStage===2){state.receiptStage=3;res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end('{"found":false}');}
  }
  if(url.pathname==='/api/notifications/qa-help/read' && req.method==='POST') {
    const state=faults.help;state.posts++;
    if(state.posts===2){state.rejected++;return reject(403,'Synthetic later read rejection. Original intent remains saved.');}
    if(state.posts===1){
      const writeHead=res.writeHead.bind(res),end=res.end.bind(res);let committed=false;
      res.writeHead=(status,...args)=>{committed=status===200;return writeHead(committed?503:status,...args);};
      res.end=(body,...args)=>{if(committed)state.receiptStage=1;return end(committed?JSON.stringify({error:'Synthetic mark-read acknowledgement interrupted after commit.'}):body,...args);};
    }
  }
  if(url.pathname==='/api/notifications/qa-export/read' && req.method==='POST') {
    const state=faults.export;state.posts++;
    if(state.posts===1){state.beforeCommitFailures++;return reject(503,'Synthetic mark-read interruption before acceptance.');}
  }
  if(url.pathname.startsWith('/api/'))return handler(req,res);
  return publicBuild(req,res,url);
});
await new Promise((resolve,reject)=>{ui.once('error',reject);ui.listen(port,'127.0.0.1',resolve);});
let stopping=false;
function stop(){if(stopping)return;stopping=true;clearTimeout(timeout);ui.close(()=>{
  console.log(JSON.stringify({terminal:true,faults,publicationsUnchanged:fingerprint('publications')===before.publications,auditUnchanged:fingerprint('audit')===before.audit,
    reads:db.prepare('SELECT event_id,staff_id,read_at FROM notification_reads ORDER BY event_id,staff_id').all(),externalRequests:0}));db.close();process.stdin.pause();
});ui.closeIdleConnections();}
const timeout=setTimeout(stop,20*60_000);process.stdin.setEncoding('utf8');process.stdin.on('data',value=>{if(value.trim()==='stop')stop();});process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(`Built memory-only notification QA: ${origin}/api/qa-bootstrap. Personal read acknowledgement withheld after commit, receipt outage/missing and later rejection; second event interrupts before commit. No providers, mail or cloud calls. Send stop for evidence and shutdown.`);
