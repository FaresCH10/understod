import {spawn} from 'node:child_process';
import {openDatabase,transaction} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {provisionStaffCredential,createSession,sessionCookie,requireLocalRequest} from '../server/auth.mjs';
import {linkAccountMembership} from '../server/accounts.mjs';
import {createAppServer} from '../server/index.mjs';
const db=openDatabase(':memory:');seed(db);
db.prepare("UPDATE organizations SET name='Disposable Account QA' WHERE id='cedar'").run();
provisionStaffCredential(db,'maya','fixture@example.test','Disposable synthetic password only');
for(const [id,org,site,role] of [['linked-harbor','harbor','harbor-yard','auditor'],['linked-tripoli','cedar','tripoli','administrator']]) {
  if(site==='tripoli') db.prepare('INSERT INTO sites VALUES(?,?,?,?)').run(site,org,'Tripoli QA','Asia/Beirut');
  db.prepare('INSERT INTO staff VALUES(?,?,?,?,?,1)').run(id,org,site,'Synthetic account fixture',role);
  transaction(db,()=>linkAccountMembership(db,'maya',id));
}
for(let n=0;n<10;n++) {
  const id=`extra-site-${n}`;db.prepare('INSERT INTO sites VALUES(?,?,?,?)').run(id,'cedar',`Extra QA site ${n}`,'UTC');
  db.prepare('INSERT INTO staff VALUES(?,?,?,?,?,1)').run(id,'cedar',id,'Synthetic additional membership','supervisor');
  transaction(db,()=>linkAccountMembership(db,'maya',id));
}
const original=db.prepare("SELECT snapshot_json FROM publications WHERE id='shelf-v3'").get().snapshot_json;
const api=createAppServer(db,{tier:'local',aiMode:'synthetic',accessMode:'credential',publicOrigin:'http://127.0.0.1:3140',mail:{mode:'disabled'}});
const handler=api.listeners('request')[0];api.removeAllListeners('request');let switches=0,hideSession=false;
api.on('request',(req,res)=>{
  if(req.url==='/api/qa-bootstrap' && req.method==='GET') {
    requireLocalRequest(req);const session=createSession(db,db.prepare("SELECT * FROM staff WHERE id='maya'").get(),'staff','credential');
    res.writeHead(302,{'set-cookie':sessionCookie(session.token,session.maxSeconds),'location':'/#overview','cache-control':'no-store'});return res.end();
  }
  if(hideSession && req.url==='/api/session') {hideSession=false;res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({error:'Synthetic session lookup temporarily unavailable.'}));}
  if(req.method==='POST' && req.url==='/api/account/site') {
    switches++;if(switches===2) hideSession=true;
    res.once('finish',()=>console.log('site selection',switches,'status',res.statusCode,'audits',db.prepare("SELECT count(*) n FROM audit WHERE action='account.site_selected'").get().n,'snapshot unchanged',original===db.prepare("SELECT snapshot_json FROM publications WHERE id='shelf-v3'").get().snapshot_json));
    if(switches===1) {
      const writeHead=res.writeHead.bind(res),end=res.end.bind(res);let committed=false;
      res.writeHead=(status,...args)=>{committed=status===200;return writeHead(committed ? 503 : status,...args);};
      res.end=(body,...args)=>end(committed ? JSON.stringify({error:'Synthetic acknowledgement interrupted after acceptance.'}) : body,...args);
    }
  }
  return handler(req,res);
});
await new Promise(resolve=>api.listen(3141,'127.0.0.1',resolve));
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js'],{stdio:'inherit',env:{...process.env,UNDERSTOOD_WEB_PORT:'3140',UNDERSTOOD_API_PORT:'3141'}});
function stop(){vite.kill();api.close(()=>db.close());}
process.once('SIGINT',stop);process.once('SIGTERM',stop);vite.on('error',()=>{stop();process.exitCode=1;});
console.log('Memory-only accounts QA at http://127.0.0.1:3140/api/qa-bootstrap. Starts pre-authenticated; does not verify login. No provider or mail calls.');
