import {createServer} from 'vite';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {provisionStaffCredential,createSession,sessionCookie,requireLocalRequest} from '../server/auth.mjs';
import {createAppServer} from '../server/index.mjs';
import {resolveMailConfig} from '../server/auth-mail.mjs';
import {issueInvitation,processOneInvitation} from '../server/invitations.mjs';
const db=openDatabase(':memory:');seed(db);
db.prepare("UPDATE organizations SET name='Disposable Invitation QA' WHERE id='cedar'").run();
provisionStaffCredential(db,'maya','owner@example.test','Disposable synthetic password only');
db.prepare("INSERT INTO staff VALUES('recipient-home','harbor','harbor-yard','Synthetic recipient home','auditor',1)").run();
provisionStaffCredential(db,'recipient-home','recipient@example.test','Disposable synthetic recipient password');
const mailOptions={mode:'resend',apiKey:'re_synthetic_only',from:'fixture@example.test',key:'07'.repeat(32),publicOrigin:'http://127.0.0.1:3140',allowLocal:true},mail=resolveMailConfig(mailOptions);
const owner={principal_type:'staff',principal_id:'maya',org_id:'cedar',site_id:'beirut',role:'owner',access_mode:'credential'},links=new Map();
for(let n=0;n<7;n++) issueInvitation(db,owner,{requestId:randomUUID(),name:n===0 ? 'Existing synthetic recipient' : `Synthetic pending staff ${n}`,email:n===0 ? 'recipient@example.test' : `qa-${n}@example.test`,role:n===0 ? 'supervisor' : 'auditor',confirmed:true},mail);
async function deliver() {
  while(await processOneInvitation(db,mail,{send:async(_config,id,message)=>{
    links.set(message.email,message.text.match(/#accept-invitation\/[A-Za-z0-9_-]{43}/)[0]);return {providerId:`synthetic-${id}`};
  }})) {}
}
await deliver();
const original=db.prepare("SELECT snapshot_json FROM publications WHERE id='shelf-v3'").get().snapshot_json;
const api=createAppServer(db,{tier:'local',aiMode:'synthetic',accessMode:'credential',publicOrigin:'http://127.0.0.1:3140',mail:mailOptions});
const handler=api.listeners('request')[0];api.removeAllListeners('request');let writes=0,receiptReads=0,accepts=0,loadFailures=0;
function interruptAcknowledgement(res) {
  const writeHead=res.writeHead.bind(res),end=res.end.bind(res);let committed=false;
  res.writeHead=(status,...args)=>{committed=status>=200 && status<300;return writeHead(committed ? 503 : status,...args);};
  res.end=(body,...args)=>end(committed ? JSON.stringify({error:'Synthetic acknowledgement interrupted after acceptance.'}) : body,...args);
}
api.on('request',(req,res)=>{
  if(req.url==='/api/qa-evidence' && req.method==='GET') {
    requireLocalRequest(req);res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    return res.end(JSON.stringify({writes,receiptReads,accepts,loadFailures,invitations:db.prepare('SELECT count(*) n FROM staff_invitations').get().n,acceptances:db.prepare('SELECT count(*) n FROM staff_invitation_acceptances').get().n,snapshotUnchanged:original===db.prepare("SELECT snapshot_json FROM publications WHERE id='shelf-v3'").get().snapshot_json}));
  }
  if(req.method==='GET' && ['/api/qa-bootstrap','/api/qa-recipient','/api/qa-signup','/api/qa-existing'].includes(req.url)) {
    requireLocalRequest(req);const authenticated=['/api/qa-bootstrap','/api/qa-recipient'].includes(req.url);
    const principal=authenticated ? db.prepare('SELECT * FROM staff WHERE id=?').get(req.url==='/api/qa-bootstrap' ? 'maya' : 'recipient-home') : null;
    const session=principal ? createSession(db,principal,'staff','credential') : null;
    const fragment=req.url==='/api/qa-bootstrap' ? '#settings/invitations' : req.url==='/api/qa-recipient' ? links.get('recipient@example.test') : req.url==='/api/qa-existing' ? links.get('recipient@example.test') : links.get('qa-1@example.test');
    if(!fragment) {res.writeHead(503);return res.end('Synthetic link fixture unavailable.');}
    res.writeHead(302,{'set-cookie':session ? sessionCookie(session.token,session.maxSeconds) : 'understood_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0','location':`/${fragment}`,'cache-control':'no-store'});return res.end();
  }
  if(req.url?.startsWith('/api/settings/invitations/receipts/')) receiptReads++;
  if(req.method==='POST' && (req.url==='/api/settings/invitations' || /\/api\/settings\/invitations\/[^/]+\/(resend|cancel)$/.test(req.url || ''))) {
    writes++;res.once('finish',()=>console.log('Synthetic invitation write',writes,'status',res.statusCode,'receipt reads',receiptReads,'invitations',db.prepare('SELECT count(*) n FROM staff_invitations').get().n,'snapshot unchanged',original===db.prepare("SELECT snapshot_json FROM publications WHERE id='shelf-v3'").get().snapshot_json));
    if(writes===1 || writes===2) interruptAcknowledgement(res);
  }
  if(req.method==='POST' && req.url==='/api/auth/invitations/accept') {
    accepts++;res.once('finish',()=>console.log('Synthetic acceptance',accepts,'status',res.statusCode,'memberships',db.prepare('SELECT count(*) n FROM staff_account_memberships').get().n,'snapshot unchanged',original===db.prepare("SELECT snapshot_json FROM publications WHERE id='shelf-v3'").get().snapshot_json));
    if(accepts===1) interruptAcknowledgement(res);
  }
  return handler(req,res);
});
await new Promise(resolve=>api.listen(3141,'127.0.0.1',resolve));
const vite=await createServer({server:{host:'127.0.0.1',port:3140,strictPort:true,proxy:{'/api':'http://127.0.0.1:3141'}},plugins:[{name:'disposable-invitation-load-failure',configureServer(server){server.middlewares.use((req,res,next)=>{
  if(process.argv.includes('--load-failure') && !loadFailures && req.url?.startsWith('/src/StaffInvitations.tsx')) {loadFailures++;res.writeHead(503,{'content-type':'text/plain','cache-control':'no-store'});return res.end('Synthetic invitation module load interrupted.');}next();
});}}]});
await vite.listen();let stopping=false;
async function stop(){if(stopping) return;stopping=true;await vite.close();api.close(()=>db.close());}
process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
console.log('Memory-only invitation QA: http://127.0.0.1:3140/api/qa-bootstrap (owner), /api/qa-signup (anonymous preview), /api/qa-recipient (pre-authenticated recipient). No provider or mail calls. New password UI entry is a manual check.');
