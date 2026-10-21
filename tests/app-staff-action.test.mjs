import test from 'node:test';
import assert from 'node:assert/strict';
import {appStaffAction,checkedPreparationAcknowledgement} from '../src/app-staff-action.ts';

const session=()=>({authenticated:true,role:'staff',staffRole:'owner',staffScope:JSON.stringify(['cedar','beirut','maya']),clientContext:'a'.repeat(64),expiresAt:new Date(Date.now()+3600_000).toISOString(),siteState:'active',mode:'synthetic-credential'});
const acknowledgement={id:'original-job',state:'processing',duplicate:false};
test('App staff process and sign-out capture original authority and require exact accepted acknowledgement before callbacks',async()=>{
  const calls=[];let accepted=0;const fetcher=async(path,options)=>{calls.push({path,options});return Response.json(path==='/api/logout'?{ok:true}:acknowledgement);};
  assert.deepEqual(await appStaffAction(session(),'/briefings/original/process',{revision:1},fetcher,()=>true,()=>true,()=>{},()=>accepted++),acknowledgement);
  assert.equal(calls[0].path,'/api/briefings/original/process');assert.equal(calls[0].options.headers['x-client-session-context'],'a'.repeat(64));assert.equal(calls[0].options.cache,'no-store');assert.equal(calls[0].options.redirect,'error');assert.ok(calls[0].options.signal);
  assert.deepEqual(await appStaffAction(session(),'/logout',{},fetcher,()=>true,()=>true,()=>{},()=>accepted++),{ok:true});assert.equal(accepted,2);
  for(const raw of [{...acknowledgement,id:'other-job'},{...acknowledgement,state:'ready'},{...acknowledgement,duplicate:'yes'},{...acknowledgement,privateLease:'not permitted'}])assert.throws(()=>checkedPreparationAcknowledgement(raw,'original-job'));
});

test('App staff completion cannot toast or refresh a replaced, expired, held or malformed view',async()=>{
  let accepted=0,live=true,held=false;const complete=()=>accepted++;
  await assert.rejects(appStaffAction(session(),'/briefings/original/process',{revision:1},async()=>{live=false;return Response.json(acknowledgement);},()=>live,()=>true,()=>{},complete));
  await assert.rejects(appStaffAction(session(),'/briefings/original/process',{revision:1},async()=>{held=true;return Response.json(acknowledgement);},()=>true,()=>!held,()=>{},complete));
  await assert.rejects(appStaffAction(session(),'/briefings/original/process',{revision:1},async()=>Response.json({...acknowledgement,unexpected:true}),()=>true,()=>true,()=>{},complete));
  await assert.rejects(appStaffAction(session(),'/logout',{},async()=>Response.json({ok:false}),()=>true,()=>true,()=>{},complete));
  await assert.rejects(appStaffAction({...session(),expiresAt:new Date(0).toISOString()},'/logout',{},async()=>assert.fail('Expired view must not dispatch'),()=>true,()=>true,()=>{},complete));
  assert.equal(accepted,0);
});

test('App root staff helper rejects unrelated endpoints and forged process/sign-out intent before dispatch',async()=>{
  const fetcher=async()=>assert.fail('Invalid action must not dispatch');
  for(const [path,body] of [['/settings/site',{}],['/briefings/original/process',{revision:1,orgId:'foreign'}],['/briefings/original/process',{revision:0}],['/briefings/original/process',{revision:1.5}],['/logout',{requestId:'forged'}],['/briefings/../process',{revision:1}]])await assert.rejects(appStaffAction(session(),path,body,fetcher,()=>true,()=>true,()=>{},()=>assert.fail('No completion')));
});
