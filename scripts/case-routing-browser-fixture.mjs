import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {openDatabase,transaction} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {provisionStaffCredential,createSession,sessionCookie,requireLocalRequest} from '../server/auth.mjs';
import {createAppServer} from '../server/index.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {requestHelp} from '../server/clarifications.mjs';
import {routeNewCase,processOneCaseEscalation} from '../server/case-routing.mjs';

const db=openDatabase(':memory:');seed(db);
provisionStaffCredential(db,'maya','fixture@example.test','Disposable synthetic password only');
const api=createAppServer(db,{tier:'local',aiMode:'synthetic',accessMode:'credential',publicOrigin:'http://127.0.0.1:3190',mail:{mode:'disabled'}});
db.prepare("INSERT INTO staff VALUES('routing-deputy','cedar','beirut','Routing QA Deputy','supervisor',1)").run();
db.prepare("INSERT INTO site_settings(site_id,org_id,revision,primary_contact_id,deputy_contact_id) VALUES('beirut','cedar',0,'maya','routing-deputy')").run();
requestHelp(db,{principal_type:'worker',principal_id:'worker-30',org_id:'cedar',site_id:'beirut'},'assignment-30',
  {requestId:randomUUID(),text:'Synthetic fresh case: please explain the second shelf.'});
transaction(db,()=>{
  const id=randomUUID();
  db.prepare("INSERT INTO clarifications VALUES(?,'cedar','assignment-14',NULL,'Synthetic overdue routing QA',NULL,'open','',?)")
    .run(id,new Date(Date.now()-25*3600000).toISOString());
  routeNewCase(db,'cedar','beirut',id);
});
if(!processOneCaseEscalation(db) || processOneCaseEscalation(db))throw Error('Synthetic escalation fixture failed');
const handler=api.listeners('request')[0],publicBuild=await loadPublicBuild('dist');
const ui=createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:3190');
  if(req.method==='GET' && req.url==='/api/qa-bootstrap') {
    requireLocalRequest(req);const session=createSession(db,db.prepare("SELECT * FROM staff WHERE id='maya'").get(),'staff','credential');
    res.writeHead(302,{'set-cookie':sessionCookie(session.token,session.maxSeconds),location:'/#clarifications','cache-control':'no-store'});return res.end();
  }
  if(req.method==='GET' && req.url==='/api/qa-close') {
    requireLocalRequest(req);res.writeHead(200,{'content-type':'text/plain','cache-control':'no-store','clear-site-data':'"cache", "cookies", "storage"','set-cookie':sessionCookie('',0)});return res.end('Disposable routing QA closed.');
  }
  if(url.pathname.startsWith('/api/'))return handler(req,res);
  return publicBuild(req,res,url);
});
await new Promise((resolve,reject)=>{ui.once('error',reject);ui.listen(3190,'127.0.0.1',resolve);});
let stopping=false;
function stop(){if(stopping)return;stopping=true;ui.close(()=>db.close());ui.closeIdleConnections();}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log('Built memory-only routing QA: http://127.0.0.1:3190/api/qa-bootstrap. Fresh and overdue synthetic cases; one escalation. No provider, mail or cloud calls.');
