import {createServer} from 'node:http';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {provisionStaffCredential,createSession,sessionCookie,requireLocalRequest} from '../server/auth.mjs';
import {createAppServer} from '../server/index.mjs';
import {loadPublicBuild} from '../server/public-build.mjs';
import {randomUUID} from 'node:crypto';
import {createSite} from '../server/sites.mjs';

const db=openDatabase(':memory:');seed(db);
db.prepare("UPDATE organizations SET name='Disposable Site QA' WHERE id='cedar'").run();
provisionStaffCredential(db,'maya','fixture@example.test','Disposable synthetic password only');
const api=createAppServer(db,{tier:'local',aiMode:'synthetic',accessMode:'credential',publicOrigin:'http://127.0.0.1:3190',mail:{mode:'disabled'}});
const emptySite=createSite(db,{principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner',access_mode:'credential'},
  {requestId:randomUUID(),name:'Lifecycle QA',timezone:'Asia/Beirut',generationLanguages:['en'],confirmed:true});
const handler=api.listeners('request')[0],publicBuild=await loadPublicBuild('dist');
let commands=0,hideReceipt=false,accessCommands=0,hideAccessReceipt=false,lifecycleCommands=0,hideLifecycleReceipt=false;
const ui=createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:3190');
  if(req.url==='/api/qa-bootstrap' && req.method==='GET') {
    requireLocalRequest(req);const session=createSession(db,db.prepare("SELECT * FROM staff WHERE id='maya'").get(),'staff','credential');
    res.writeHead(302,{'set-cookie':sessionCookie(session.token,session.maxSeconds),location:'/#settings','cache-control':'no-store'});return res.end();
  }
  if(req.url==='/api/qa-close' && req.method==='GET') {
    requireLocalRequest(req);res.writeHead(200,{'content-type':'text/plain','cache-control':'no-store','clear-site-data':'"cache", "cookies", "storage"','set-cookie':sessionCookie('',0)});return res.end('Disposable site QA closed.');
  }
  if(hideReceipt && req.url.startsWith('/api/settings/sites/receipts/')) {
    hideReceipt=false;res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({error:'Synthetic receipt lookup interrupted.'}));
  }
  if(hideAccessReceipt && req.url.startsWith('/api/settings/sites/access/receipts/')) {
    hideAccessReceipt=false;res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({error:'Synthetic access receipt lookup interrupted.'}));
  }
  if(hideLifecycleReceipt && req.url.startsWith('/api/settings/sites/lifecycle/receipts/')) {
    hideLifecycleReceipt=false;res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({error:'Synthetic lifecycle receipt lookup interrupted.'}));
  }
  if(req.method==='POST' && req.url==='/api/settings/sites/lifecycle') {
    lifecycleCommands++;
    if(lifecycleCommands===1) {
      const writeHead=res.writeHead.bind(res),end=res.end.bind(res);let committed=false;
      res.writeHead=(status,...args)=>{committed=status===200 || status===201;if(committed)hideLifecycleReceipt=true;return writeHead(committed?503:status,...args);};
      res.end=(body,...args)=>end(committed?JSON.stringify({error:'Synthetic lifecycle acknowledgement interrupted.'}):body,...args);
    }
    res.once('finish',()=>console.log('Lifecycle commands',lifecycleCommands,'receipts',db.prepare('SELECT count(*) n FROM site_lifecycle_requests').get().n,'policy',db.prepare('SELECT state,revision FROM site_lifecycle WHERE site_id=?').get(emptySite.id),'worker policy',db.prepare('SELECT state,revision FROM site_access_controls WHERE site_id=?').get(emptySite.id)));
  }
  if(req.method==='POST' && req.url==='/api/settings/sites/access') {
    accessCommands++;
    if(accessCommands===1) {
      const writeHead=res.writeHead.bind(res),end=res.end.bind(res);let committed=false;
      res.writeHead=(status,...args)=>{committed=status===200 || status===201;if(committed)hideAccessReceipt=true;return writeHead(committed?503:status,...args);};
      res.end=(body,...args)=>end(committed?JSON.stringify({error:'Synthetic access acknowledgement interrupted.'}):body,...args);
    }
    res.once('finish',()=>console.log('Access commands',accessCommands,'receipts',db.prepare('SELECT count(*) n FROM site_access_requests').get().n,'policy',db.prepare("SELECT state,revision FROM site_access_controls WHERE site_id='beirut'").get()));
  }
  if(req.method==='POST' && req.url==='/api/settings/sites') {
    commands++;
    if(commands===1) {
      const writeHead=res.writeHead.bind(res),end=res.end.bind(res);let committed=false;
      res.writeHead=(status,...args)=>{committed=status===200 || status===201;if(committed)hideReceipt=true;return writeHead(committed?503:status,...args);};
      res.end=(body,...args)=>end(committed?JSON.stringify({error:'Synthetic creation acknowledgement interrupted.'}):body,...args);
    }
    res.once('finish',()=>console.log('Site commands',commands,'receipts',db.prepare('SELECT count(*) n FROM site_creations').get().n,'audits',db.prepare("SELECT count(*) n FROM audit WHERE action='site.created'").get().n));
  }
  if(url.pathname.startsWith('/api/'))return handler(req,res);
  return publicBuild(req,res,url);
});
await new Promise((resolve,reject)=>{ui.once('error',reject);ui.listen(3190,'127.0.0.1',resolve);});
let stopping=false;
function stop(){if(stopping)return;stopping=true;ui.close(()=>{db.close();});ui.closeIdleConnections();}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log('Built memory-only site QA: http://127.0.0.1:3190/api/qa-bootstrap. Preauthenticated synthetic owner; first creation, access and lifecycle changes lose their acknowledgements and first receipt reads fail. No provider, mail or cloud calls.');
