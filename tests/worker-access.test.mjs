import test from 'node:test';
import assert from 'node:assert/strict';
import { workerAccessToken,workerAccessLink } from '../src/worker-access.ts';

test('worker access links keep validated tokens only in fragments, never query or path',() => {
  const token='x'.repeat(43),link=workerAccessLink('http://127.0.0.1:3020',token),url=new URL(link);
  assert.equal(url.pathname,'/');assert.equal(url.search,'');assert.equal(workerAccessToken(url.hash),token);
  for(const hash of ['#worker-access/'+token+'?next=external','#worker-access/%78'+token,'#worker-access/'+token.slice(1),'#overview','#worker-access']) assert.equal(workerAccessToken(hash),'');
  for(const origin of ['https://example.test/path','https://user@example.test','https://example.test?token=bad','javascript:bad']) assert.throws(() => workerAccessLink(origin,token));
  assert.throws(() => workerAccessLink('https://example.test','bad'));
  assert.equal(new URL(workerAccessLink('https://example.test',token)).hash,`#worker-access/${token}`);
});
