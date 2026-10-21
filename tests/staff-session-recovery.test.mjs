import test from 'node:test';
import assert from 'node:assert/strict';
import {validStaffSession,sameStaffSession,validPageSession,samePageSession,staffSessionText,staffIdentityText,staffIdentityLabel} from '../src/session-state.ts';
import {recheckStaffSession,confirmStaffSession} from '../src/staff-session-recovery.ts';
import {fetchBootstrapSession,BootstrapSessionError} from '../src/worker-offline.ts';

const time=Date.parse('2026-10-12T12:00:00.000Z'),now=()=>time;
const session={authenticated:true,role:'staff',staffRole:'owner',staffScope:JSON.stringify(['org','site','staff']),siteState:'active',mode:'synthetic-credential',clientContext:'a'.repeat(64),expiresAt:'2026-10-12T13:00:00.000Z',name:'Synthetic staff',organization:'Synthetic organization',site:'Synthetic site',language:'en'};
const worker={authenticated:true,role:'worker',workerId:'worker',language:'en',mode:'synthetic-credential',clientContext:'b'.repeat(64),expiresAt:session.expiresAt};

test('staff page verification requires exact account/site/role/policy/context/expiry, never worker or malformed evidence',()=>{
  for(const role of ['owner','supervisor','administrator','auditor'])for(const siteState of ['active','archived'])assert.equal(validStaffSession({...session,staffRole:role,siteState},time),true);
  assert.equal(validPageSession(session,time),true);assert.equal(validPageSession(worker,time),true);assert.equal(samePageSession(session,{...session},time),true);assert.equal(samePageSession(worker,{...worker},time),true);
  for(const value of [null,{},[],worker,{...session,authenticated:false},{...session,staffRole:'reviewer'},{...session,siteState:'unknown'},
    {...session,staffScope:'bad'},{...session,staffScope:'["org","site"]'},{...session,staffScope:'["org","site",null]'},{...session,staffScope:'["org","site",""]'},
    {...session,staffScope:JSON.stringify(['org','site','x'.repeat(101)])},{...session,staffScope:JSON.stringify(['org','site','bad\nvalue'])},
    {...session,mode:42},{...session,clientContext:'z'.repeat(64)},{...session,expiresAt:'2027-01-01'},{...session,expiresAt:new Date(time).toISOString()}])assert.equal(validStaffSession(value,time),false);
  for(const change of [{staffRole:'auditor'},{siteState:'archived'},{staffScope:JSON.stringify(['org','other','staff'])},{staffScope:JSON.stringify(['other','site','staff'])},
    {clientContext:'c'.repeat(64)},{mode:'other'},{expiresAt:'2026-10-12T14:00:00.000Z'}])assert.equal(sameStaffSession(session,{...session,...change},time),false);
  assert.equal(sameStaffSession(session,{...session,name:'Renamed',organization:'Changed display name'},time),true);
});

test('staff lock recheck requires two stable reads and confirmation reads again without mutations or recovery-store writes',async()=>{
  for(const changed of [false,true]){
    const current=changed?{...session,staffRole:'auditor',clientContext:'c'.repeat(64),staffScope:JSON.stringify(['other','other','auditor'])}:session,calls=[];
    const read=async()=>{calls.push('GET /api/session');return structuredClone(current);};
    const result=await recheckStaffSession(session,read,()=>true,now);assert.equal(result.kind,changed?'different':'same');assert.equal(calls.length,2);
    const confirmed=await confirmStaffSession(result.session,read,()=>true,now);assert.deepEqual(confirmed,current);assert.deepEqual(calls,['GET /api/session','GET /api/session','GET /api/session']);
  }
});

test('changed/expired policies and another cookie between recheck or confirmation cannot reopen the old workspace',async()=>{
  for(const altered of [{...session,staffRole:'auditor'},{...session,siteState:'archived'},{...session,clientContext:'b'.repeat(64)},{...session,expiresAt:'2026-10-12T12:00:00.000Z'},worker,{authenticated:false,mode:'synthetic-credential'},{}]){
    let n=0;await assert.rejects(recheckStaffSession(session,async()=>++n===1?session:altered,()=>true,now),/Session unavailable/);
    await assert.rejects(confirmStaffSession(session,async()=>altered,()=>true,now),/Session unavailable/);
  }
  const expired={...session,expiresAt:new Date(time).toISOString()};assert.equal((await recheckStaffSession(expired,async()=>session,()=>true,now)).kind,'different');
});

test('a signed-out or worker observation is not silently treated as the original staff session',async()=>{
  const guest={authenticated:false,mode:'synthetic-credential'};
  assert.deepEqual(await recheckStaffSession(session,async()=>guest,()=>true,now),{kind:'guest',session:guest});
  assert.deepEqual(await confirmStaffSession(guest,async()=>guest,()=>true,now),guest);
  assert.deepEqual(await recheckStaffSession(session,async()=>worker,()=>true,now),{kind:'worker'});
  await assert.rejects(confirmStaffSession(guest,async()=>worker,()=>true,now),/unavailable/);
  await assert.rejects(confirmStaffSession(guest,async()=>({...guest,mode:'other'}),()=>true,now),/unavailable/);
});

test('unmounted/changed views and failed reads cannot return a verified recovery result',async()=>{
  let reads=0;await assert.rejects(recheckStaffSession(session,async()=>{reads++;return session;},()=>false,now));assert.equal(reads,0);
  for(const failAt of [1,2]){let calls=0,live=true;await assert.rejects(recheckStaffSession(session,async()=>{if(++calls===failAt)live=false;return session;},()=>live,now));assert.equal(calls,failAt);}
  await assert.rejects(recheckStaffSession(session,async()=>{throw Error('PRIVATE SERVER ERROR');},()=>true,now));
  let live=true;await assert.rejects(confirmStaffSession(session,async()=>{live=false;return session;},()=>live,now));
});

test('bounded session reads retain denied status for worker offline-lease invalidation without treating denial as offline',async()=>{
  for(const status of [401,403,409,410,429,500,503])await assert.rejects(fetchBootstrapSession(async(path,options)=>{
    assert.equal(path,'/api/session');assert.equal(options.method,undefined);assert.equal(options.credentials,'include');assert.equal(options.cache,'no-store');assert.ok(options.signal);return new Response('',{status});
  },new AbortController().signal),error=>error instanceof BootstrapSessionError && error.status===status && error.offline===(status>=500));
});

test('staff lock recovery copy has complete EN/AR/UR messages without promising cancellation or silent request replay',()=>{
  assert.deepEqual(Object.keys(staffSessionText),['en','ar','ur']);
  for(const language of ['en','ar','ur']){assert.deepEqual(Object.keys(staffSessionText[language]),Object.keys(staffSessionText.en));for(const text of Object.values(staffSessionText[language])){assert.equal(typeof text,'string');assert.ok(text.trim());if(language!=='en')assert.match(text,/[\u0600-\u06ff]/);}}
});

test('staff recovery identity labels are bounded and localized, with no unrecognized role echoed',()=>{
  for(const language of ['en','ar','ur']) {
    assert.deepEqual(Object.keys(staffIdentityText[language]),Object.keys(staffIdentityText.en));
    for(const value of [null,42,'','bad\nname','x'.repeat(255)])assert.equal(staffIdentityLabel(value,language),staffIdentityText[language].unrecorded);
    assert.equal(staffIdentityLabel('Synthetic account',language),'Synthetic account');
    for(const role of ['owner','administrator','supervisor','auditor'])assert.equal(staffIdentityLabel(role,language,true),staffIdentityText[language][role]);
    assert.equal(staffIdentityLabel('Unknown private value',language,true),staffIdentityText[language].unrecorded);
    if(language!=='en')for(const label of Object.values(staffIdentityText[language]))assert.match(label,/[\u0600-\u06ff]/);
  }
});
