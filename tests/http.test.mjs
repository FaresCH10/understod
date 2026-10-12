import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readJson } from '../server/http.mjs';

test('JSON request parsing preserves multibyte text split across chunks and permits only objects',async () => {
  const value={text:'العربية اردو',requestId:'synthetic'},bytes=Buffer.from(JSON.stringify(value));
  assert.deepEqual(await readJson(Readable.from(Array.from(bytes,(byte) => Buffer.from([byte])))),value);
  assert.deepEqual(await readJson(Readable.from([])),{});
  for (const text of ['null','[]','1','true','"text"','{bad}']) await assert.rejects(readJson(Readable.from([Buffer.from(text)])),/Invalid JSON/);
});

test('JSON request parsing rejects malformed UTF-8 and bounds actual bytes before parsing',async () => {
  const corrupt=Buffer.concat([Buffer.from('{"text":"'),Buffer.from([0xc0,0xaf]),Buffer.from('"}')]);
  await assert.rejects(readJson(Readable.from([corrupt])),/Invalid JSON/);
  const exact=Buffer.from(JSON.stringify({text:'x'.repeat(16373)})); assert.equal(exact.length,16384);
  assert.equal((await readJson(Readable.from([exact]))).text.length,16373);
  await assert.rejects(readJson(Readable.from([Buffer.concat([exact,Buffer.from(' ')])])),/Request too large/);
  const multilingual=Buffer.from(JSON.stringify({text:'ع'.repeat(20000)}));
  await assert.rejects(readJson(Readable.from([multilingual])),/Request too large/);
  assert.equal((await readJson(Readable.from([multilingual]),100000)).text.length,20000);
  await assert.rejects(readJson(Readable.from([Buffer.alloc(100001,32)]),100000),/Request too large/);
});
