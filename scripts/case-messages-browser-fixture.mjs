import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {provisionStaffCredential,createSession,sessionCookie,requireLocalRequest,issueWorkerGrant,redeemWorkerGrant} from '../server/auth.mjs';
import {createAppServer} from '../server/index.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {requestHelp} from '../server/clarifications.mjs';

const db=openDatabase(':memory:');seed(db);
const owner={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner'};
provisionStaffCredential(db,'maya','fixture@example.test','Disposable synthetic password only');
const api=createAppServer(db,{tier:'local',aiMode:'synthetic',accessMode:'credential',publicOrigin:'http://127.0.0.1:3190',mail:{mode:'disabled'}});
const caseId=randomUUID();requestHelp(db,{principal_type:'worker',principal_id:'worker-1',org_id:'cedar',site_id:'beirut'},'assignment-1',
  {requestId:caseId,text:'Synthetic conversation QA: please explain the second shelf.'});
const handler=api.listeners('request')[0],publicBuild=await loadPublicBuild('dist');
let posts=0,receiptReads=0;
const ui=createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:3190');
  if(req.method==='GET' && url.pathname==='/api/qa-bootstrap') {
    requireLocalRequest(req);const worker=url.searchParams.get('role')==='worker';
    const session=worker?redeemWorkerGrant(db,issueWorkerGrant(db,owner,'worker-1',60).token)
      :createSession(db,db.prepare("SELECT * FROM staff WHERE id='maya'").get(),'staff','credential');
    res.writeHead(302,{'set-cookie':sessionCookie(session.token,session.maxSeconds),location:worker?'/#worker/assignment-1':`/#clarifications/${caseId}`,'cache-control':'no-store'});return res.end();
  }
  if(req.method==='GET' && url.pathname==='/api/qa-stats') {
    requireLocalRequest(req);res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    return res.end(JSON.stringify({posts,receiptReads,messages:db.prepare('SELECT count(*) n FROM case_messages').get().n,audits:db.prepare("SELECT count(*) n FROM audit WHERE action='clarification.message'").get().n}));
  }
  if(url.pathname===`/api/clarifications/${caseId}/messages` && req.method==='POST' && ++posts===1) {
    const end=res.end.bind(res);res.end=function(...args){if(this.statusCode===200){this.statusCode=503;return end(JSON.stringify({error:'Synthetic lost acknowledgement; check the receipt.'}));}return end(...args);};
  }
  if(url.pathname.startsWith(`/api/clarifications/${caseId}/messages/`) && req.method==='GET' && ++receiptReads===1) {
    res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({error:'Synthetic receipt read unavailable'}));
  }
  if(url.pathname.startsWith('/api/'))return handler(req,res);
  return publicBuild(req,res,url);
});
await new Promise((resolve,reject)=>{ui.once('error',reject);ui.listen(3190,'127.0.0.1',resolve);});
let stopping=false;function stop(){if(stopping)return;stopping=true;ui.close(()=>db.close());ui.closeIdleConnections();}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log('Built memory-only conversation QA: http://127.0.0.1:3190/api/qa-bootstrap; ?role=worker selects a credential worker. First message acknowledgement and receipt read fail. No provider, cloud or mail calls.');
