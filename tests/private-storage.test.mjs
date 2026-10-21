import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectWav } from '../server/audio.mjs';
import { r2AudioStore,localAudioStore,neonAudioStore,hostedPrivateAudioStore } from '../server/private-storage.mjs';
import {createHash} from 'node:crypto';

function wav() {
  const bytes = Buffer.alloc(32044);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36);
  bytes.writeUInt32LE(32000, 40); bytes.writeInt16LE(100, 44);
  return bytes;
}
const config = { accountId: 'a'.repeat(32), bucket: 'test-private-audio', accessKeyId: 'test-key', secretAccessKey: 'test-secret' };

test('R2 adapter uses bounded private scoped commands and validates downloaded bytes', async () => {
  const bytes = wav(), row = { id: randomUUID(), org_id: 'cedar', site_id: 'beirut', ...inspectWav(bytes) };
  const commands = [];
  const store = r2AudioStore(config, { client: { async send(command, options) {
    assert.ok(options.abortSignal); commands.push(command);
    if (command.constructor.name === 'GetObjectCommand') return { ContentLength: bytes.length, Body: Readable.from([bytes]) };
    return {};
  } } });
  await store.save(row, bytes);
  assert.deepEqual(await store.read(row), bytes);
  await store.remove(row);
  assert.equal(await store.exists(row),true);
  assert.deepEqual(commands.map((command) => command.constructor.name), ['PutObjectCommand', 'GetObjectCommand', 'DeleteObjectCommand','HeadObjectCommand']);
  assert.equal(commands[0].input.Key, `audio/cedar/beirut/${row.id}.wav`);
  assert.equal(commands[0].input.IfNoneMatch, '*');
  assert.equal(commands[0].input.CacheControl, 'private, no-store');
  assert.equal(commands[0].input.ACL, undefined);
  await assert.rejects(() => store.save({ ...row, org_id: '../harbor' }, bytes), /Invalid private/);
  await assert.rejects(() => store.save({ ...row, sha256: 'wrong' }, bytes), /integrity/);
});

test('private object absence requires a definite missing result, not a provider failure',async()=>{
  const row={id:randomUUID(),org_id:'cedar',site_id:'beirut'};
  for(const status of [404,403,500,undefined]){
    const store=r2AudioStore(config,{client:{async send(command,options){
      assert.equal(command.constructor.name,'HeadObjectCommand');
      assert.equal(command.input.Key,`audio/cedar/beirut/${row.id}.wav`);
      assert.ok(options.abortSignal);
      throw Object.assign(new Error(config.secretAccessKey),{$metadata:{httpStatusCode:status}});
    }}});
    if(status===404)assert.equal(await store.exists(row),false);
    else await assert.rejects(()=>store.exists(row),{message:'Private storage operation failed'});
    await assert.rejects(()=>store.exists({...row,site_id:'../other'}),/Invalid private/);
  }
});

test('local absence verification observes the actual private file before and after removal',async()=>{
  const root=await mkdtemp(join(tmpdir(),'understood-private-absence-'));
  const store=localAudioStore(root),bytes=wav(),row={id:randomUUID(),...inspectWav(bytes)};
  try{
    assert.equal(await store.exists(row),false);
    assert.equal(await store.isEmpty(),true);
    await store.save(row,bytes);
    assert.equal(await store.exists(row),true);
    assert.equal(await store.isEmpty(),false);
    await store.remove(row);
    assert.equal(await store.exists(row),false);
    assert.equal(await store.isEmpty(),true);
    await assert.rejects(()=>store.exists({id:'../escaped'}),/Invalid/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('restore storage isolation requires a definite bounded empty-bucket inventory',async()=>{
  for(const [response,expected] of [[{KeyCount:0,IsTruncated:false},true],
    [{KeyCount:1,Contents:[{Key:'private-object'}],IsTruncated:false},false],
    [{KeyCount:0,Contents:[],IsTruncated:true},false],
    [{KeyCount:0,Contents:[{Key:'inconsistent-object'}],IsTruncated:false},false]]) {
    const store=r2AudioStore(config,{client:{async send(command,options){
      assert.equal(command.constructor.name,'ListObjectsV2Command');assert.deepEqual(command.input,{Bucket:config.bucket,MaxKeys:1});assert.ok(options.abortSignal);return response;
    }}});
    assert.equal(await store.isEmpty(),expected);
  }
  for(const response of [{},{KeyCount:0},{KeyCount:-1,IsTruncated:false},{KeyCount:0,Contents:'unknown',IsTruncated:false}]) {
    const store=r2AudioStore(config,{client:{async send(){return response;}}});
    await assert.rejects(store.isEmpty(),/inventory unavailable/);
  }
  const failed=r2AudioStore(config,{client:{async send(){throw Error(config.secretAccessKey);}}});
  await assert.rejects(failed.isEmpty(),{message:'Private storage operation failed'});
});

test('R2 adapter rejects configuration, corrupt/oversize data and redacts provider errors', async () => {
  assert.throws(() => r2AudioStore({ ...config, accountId: 'https://evil.invalid' }), /configuration/);
  const bytes = wav(), row = { id: randomUUID(), org_id: 'cedar', site_id: 'beirut', ...inspectWav(bytes) };
  const corrupt = Buffer.from(bytes); corrupt[50] = 255;
  const store = r2AudioStore(config, { client: { async send() { return { Body: Readable.from([corrupt]) }; } } });
  await assert.rejects(() => store.read(row), /integrity/);
  const huge = r2AudioStore(config, { client: { async send() { return { ContentLength: 9999999, Body: Readable.from([]) }; } } });
  await assert.rejects(() => huge.read(row), /integrity/);
  const failure = r2AudioStore(config, { client: { async send() { throw new Error(config.secretAccessKey); } } });
  await assert.rejects(() => failure.read(row), { message: 'Private storage operation failed' });
});

const neonConfig={endpoint:'https://br-synthetic-fixture.storage.c-1.eu-central-1.aws.neon.tech',
  region:'eu-central-1',bucket:'understood-synthetic-test',accessKeyId:'fixture-access',secretAccessKey:'fixture-private-secret'};

test('Neon adapter retains scoped WAV/source integrity, conditional creation, definite absence and redacted failures',async()=>{
  const objects=new Map(),commands=[],bytes=wav(),original=Buffer.from('Synthetic original source bytes');
  const row={id:randomUUID(),org_id:'synthetic',site_id:'test',...inspectWav(bytes)};
  const source={...row,bytes:original.length,sha256:createHash('sha256').update(original).digest('hex')};
  let destroyed=0;
  const client={async send(command,options){
    commands.push(command);assert.ok(options.abortSignal);const {Key,Body,Metadata}=command.input;
    assert.equal(command.input.Bucket,neonConfig.bucket);
    if(command.constructor.name==='ListObjectsV2Command')return {KeyCount:objects.size?1:0,IsTruncated:false,Contents:objects.size?[{Key:[...objects.keys()][0]}]:[]};
    if(command.constructor.name==='PutObjectCommand'){
      assert.equal(command.input.IfNoneMatch,'*');assert.equal(command.input.ACL,undefined);
      assert.equal(command.input.CacheControl,'private, no-store');
      if(objects.has(Key))throw Object.assign(Error('fixture-private-secret'),{$metadata:{httpStatusCode:412}});
      objects.set(Key,{bytes:Buffer.from(Body),metadata:Metadata});return {};
    }
    if(command.constructor.name==='DeleteObjectCommand'){objects.delete(Key);return {};}
    const object=objects.get(Key);if(!object)throw Object.assign(Error('fixture-private-secret'),{$metadata:{httpStatusCode:404}});
    if(command.constructor.name==='HeadObjectCommand')return {ContentLength:object.bytes.length};
    if(command.constructor.name==='GetObjectCommand')return {ContentLength:object.bytes.length,Body:Readable.from([object.bytes])};
    throw Error('Unexpected storage command');
  },destroy(){destroyed++;}};
  const store=hostedPrivateAudioStore({storageAdapter:'neon',storageConfig:neonConfig},{client});
  assert.equal(await store.isEmpty(),true);assert.equal(await store.exists(row),false);assert.equal(await store.existsOriginal(source),false);
  await store.save(row,bytes);await store.saveOriginal(source,original);
  assert.equal(await store.isEmpty(),false);assert.equal(await store.exists(row),true);assert.equal(await store.existsOriginal(source),true);
  assert.deepEqual(await store.read(row),bytes);assert.deepEqual(await store.readOriginal(source),original);
  await assert.rejects(store.save(row,bytes),{message:'Private storage operation failed'});
  await assert.rejects(store.saveOriginal(source,original),{message:'Private storage operation failed'});
  await assert.rejects(store.read({...row,org_id:'../other'}),/Invalid private/);
  await assert.rejects(store.read({...row,sha256:'wrong'}),/integrity/);
  await assert.rejects(store.readOriginal({...source,sha256:'wrong'}),/integrity/);
  await store.remove(row);await store.removeOriginal(source);
  assert.equal(await store.exists(row),false);assert.equal(await store.existsOriginal(source),false);assert.equal(await store.isEmpty(),true);
  assert.ok(commands.some(command=>command.input.Key?.endsWith('.source-original')));
  store.close();assert.equal(destroyed,1);
  assert.throws(()=>neonAudioStore({...neonConfig,endpoint:'https://foreign.invalid'},{client}),/configuration/);
  assert.throws(()=>hostedPrivateAudioStore({storageAdapter:'unknown',storageConfig:neonConfig},{client}),/adapter/);
  for(const method of ['read','readOriginal','exists','existsOriginal']){
    const failure=neonAudioStore(neonConfig,{client:{async send(){throw Object.assign(Error('fixture-private-secret'),{$metadata:{httpStatusCode:403}});}}});
    await assert.rejects(failure[method](method.endsWith('Original')?source:row),{message:'Private storage operation failed'});
  }
});
