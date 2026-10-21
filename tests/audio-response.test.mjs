import test from 'node:test';
import assert from 'node:assert/strict';
import {singleAudioRange,sendPrivateWav} from '../server/audio-response.mjs';

test('single private audio ranges support bounded, open and suffix bytes without multipart allocation',()=>{
  for(const [header,result] of [[undefined,null],['items=0-1',null],['bytes=0-1,4-5',null],['bytes=0-0',{start:0,end:0}],['bytes=3-',{start:3,end:9}],['bytes=3-99',{start:3,end:9}],['bytes=-3',{start:7,end:9}],['bytes=-99',{start:0,end:9}]])assert.deepEqual(singleAudioRange(header,10),result);
  for(const header of ['bytes=','bytes=-','bytes=-0','bytes=10-','bytes=3-2','bytes=-1-2','bytes=1-a','bytes=9007199254740992-','x'.repeat(129),[]])assert.equal(singleAudioRange(header,10),false);
  assert.equal(singleAudioRange('bytes=0-',0),false);
});
test('verified private WAV response preserves no-store and returns exact bytes, lengths and range statuses',()=>{
  const bytes=Buffer.from('0123456789');
  const call=headers=>{const result={};sendPrivateWav({headers},{writeHead(status,headers){Object.assign(result,{status,headers});},end(body){result.body=body;}},bytes);return result;};
  for(const headers of [{},{range:'items=0-2'},{range:'bytes=0-1,4-5'},{range:'bytes=0-2','if-range':'unverified-validator'}]){
    const result=call(headers);assert.equal(result.status,200);assert.deepEqual(result.body,bytes);assert.equal(result.headers['content-range'],undefined);
  }
  const partial=call({range:'bytes=2-4'});assert.equal(partial.status,206);assert.equal(partial.body.toString(),'234');assert.equal(partial.headers['content-length'],3);assert.equal(partial.headers['content-range'],'bytes 2-4/10');
  const suffix=call({range:'bytes=-2'});assert.equal(suffix.body.toString(),'89');assert.equal(suffix.headers['content-range'],'bytes 8-9/10');
  const invalid=call({range:'bytes=10-'});assert.equal(invalid.status,416);assert.equal(invalid.headers['content-range'],'bytes */10');assert.equal(invalid.headers['content-length'],0);assert.equal(invalid.body,undefined);
  for(const result of [partial,suffix,invalid,call({})]){
    assert.equal(result.headers['cache-control'],'no-store');assert.equal(result.headers['accept-ranges'],'bytes');
    assert.equal(result.headers['x-content-type-options'],'nosniff');assert.equal(result.headers['referrer-policy'],'no-referrer');
  }
});
