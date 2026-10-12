import test from 'node:test';
import assert from 'node:assert/strict';
import {publicShellReady} from '../src/public-shell-state.ts';

test('public readiness requires a bounded exact worker acknowledgement and repair is explicit',async()=>{
  const requests=[];
  const worker={postMessage:(value,ports)=>{requests.push(value);ports[0].postMessage({type:'understood-shell-status',ready:true});}};
  assert.equal(await publicShellReady(worker),true);assert.equal(requests[0].repair,false);
  assert.equal(await publicShellReady(worker,true),true);assert.equal(requests[1].repair,true);
  for(const data of [null,{type:'unknown',ready:true},{type:'understood-shell-status',ready:'true'},{type:'understood-shell-status',ready:false}]){
    assert.equal(await publicShellReady({postMessage:(_value,ports)=>ports[0].postMessage(data)},false,100),false);
  }
  assert.equal(await publicShellReady({postMessage:()=>{}},false,5),false);
  assert.equal(await publicShellReady({postMessage:()=>{throw Error('Worker ended');}},true,100),false);
});
