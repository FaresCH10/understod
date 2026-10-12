import test from 'node:test';
import assert from 'node:assert/strict';
import {checkedSiteSession,selectAccountSite} from '../src/account-site.ts';

const current={authenticated:true,mode:'synthetic-credential',role:'staff',staffScope:JSON.stringify(['org','site','linked'])};
test('site selection resolves a lost acknowledgement by reading the session, without retrying the rotation',async()=>{
  for(const lost of [true,false]) {
    const calls=[];
    const result=await selectAccountSite(async(path,body)=>{calls.push({path,body});if(body && lost) throw new Error('Connection lost');return body ? {ok:true} : current;},'linked');
    assert.equal(result.confirmed,true);assert.equal(result.mutationFailed,lost);assert.deepEqual(calls,[{path:'/account/site',body:{staffId:'linked'}},{path:'/session',body:undefined}]);
  }
});
test('site selection cannot confirm a foreign scope, signed-out session or a failed session read',async()=>{
  for(const session of [{...current,staffScope:JSON.stringify(['other','site','other'])},{authenticated:false,mode:'synthetic-credential'},{authenticated:true,mode:'synthetic-credential',role:'worker'}]) {
    const result=await selectAccountSite(async(path)=>path==='/session' ? session : {ok:true},'linked');assert.equal(result.confirmed,false);
  }
  const calls=[];
  await assert.rejects(selectAccountSite(async path=>{calls.push(path);if(path==='/session') throw new Error('Offline');return {ok:true};},'linked'),/Offline/);
  assert.deepEqual(calls,['/account/site','/session']);
});
test('site session validation fails closed for malformed staff scopes and keeps public session context',()=>{
  for(const value of [null,[],{}, {...current,staffScope:'not-json'},{...current,staffScope:'["org","site"]'},{...current,staffScope:'["org","site",null]'},{...current,staffScope:'["org","site",""]'},{...current,authenticated:'true'}]) assert.throws(()=>checkedSiteSession(value),/Site session unavailable/);
  const session={...current,staffRole:'auditor',organization:'Org',site:'Site'};assert.equal(checkedSiteSession(session),session);
});
