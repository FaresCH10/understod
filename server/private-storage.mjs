import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand,HeadObjectCommand,ListObjectsV2Command } from '@aws-sdk/client-s3';
import { inspectWav, savePrivateWav, readPrivateWav, removePrivateWav,privateWavExists } from './audio.mjs';
import {createHash} from 'node:crypto';
import {mkdir,open,unlink,stat,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {validateNeonStorageConfig,neonStorageClientOptions} from './neon-storage-config.mjs';

const MAX_BYTES = 44 + 90 * 16000 * 2;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_SOURCE_ORIGINAL_BYTES=10*1024*1024;

export function verifySourceOriginal(reference,bytes) {
  if(!Buffer.isBuffer(bytes) || bytes.length<1 || bytes.length>MAX_SOURCE_ORIGINAL_BYTES
    || bytes.length!==reference.bytes || createHash('sha256').update(bytes).digest('hex')!==reference.sha256)
    throw Error('Private source integrity check failed');
}

function originalPath(root,reference) {
  objectKey(reference);
  return join(root,`${reference.id}.source-original`);
}

function objectKey(recording) {
  if (!UUID.test(recording.id) || ![recording.org_id, recording.site_id].every(
    (part) => typeof part === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(part),
  )) throw new Error('Invalid private storage reference');
  return `audio/${recording.org_id}/${recording.site_id}/${recording.id}.wav`;
}

function verifyBytes(recording, bytes) {
  const info = inspectWav(bytes);
  if (info.sha256 !== recording.sha256 || info.bytes !== recording.bytes)
    throw new Error('Private recording integrity check failed');
  return info;
}

// Cloud storage is selected explicitly; loopback storage stays local.
export function localAudioStore(root) {
  return {
    async isEmpty(){try{return (await readdir(root)).length===0;}catch(error){if(error.code==='ENOENT')return true;throw error;}},
    async save(recording, bytes) { verifyBytes(recording, bytes); await savePrivateWav(root, recording.id, bytes); },
    async read(recording) { const bytes = await readPrivateWav(root, recording.id); verifyBytes(recording, bytes); return bytes; },
    async remove(recording) { await removePrivateWav(root, recording.id); },
    async exists(recording){return privateWavExists(root,recording.id);},
    async saveOriginal(reference,bytes) {
      verifySourceOriginal(reference,bytes);
      const path=originalPath(root,reference);
      await mkdir(root,{recursive:true,mode:0o700});
      const file=await open(path,'wx',0o600);
      try {await file.writeFile(bytes);}finally {await file.close();}
    },
    async readOriginal(reference) {
      const file=await open(originalPath(root,reference),'r');
      try {
        const size=(await file.stat()).size;
        if(size<1 || size>MAX_SOURCE_ORIGINAL_BYTES || size!==reference.bytes)throw Error('Private source integrity check failed');
        const bytes=Buffer.alloc(size);
        let offset=0;
        while(offset<size) {const {bytesRead}=await file.read(bytes,offset,size-offset,offset);if(!bytesRead)throw Error('Private source integrity check failed');offset+=bytesRead;}
        if((await file.stat()).size!==size)throw Error('Private source integrity check failed');
        verifySourceOriginal(reference,bytes);return bytes;
      }finally {await file.close();}
    },
    async removeOriginal(reference) {try {await unlink(originalPath(root,reference));}catch(error) {if(error.code!=='ENOENT')throw error;}},
    async existsOriginal(reference) {try {await stat(originalPath(root,reference));return true;}catch(error) {if(error.code==='ENOENT')return false;throw error;}},
  };
}

export function r2AudioStore(config, { client } = {}) {
  if (!/^[a-f0-9]{32}$/i.test(config.accountId || '')
    || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket || '')
    || !config.accessKeyId || !config.secretAccessKey
    || !['default', 'eu'].includes(config.jurisdiction || 'default'))
    throw new Error('Private R2 storage configuration is incomplete');
  const suffix = config.jurisdiction === 'eu' ? '.eu' : '';
  const s3 = client || new S3Client({
    region: 'auto', endpoint: `https://${config.accountId}${suffix}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    maxAttempts: 2,
  });
  return privateS3AudioStore(config,s3);
}

export function neonAudioStore(config,{client}={}) {
  const checked=validateNeonStorageConfig(config);
  return privateS3AudioStore(checked,client || new S3Client(neonStorageClientOptions(checked)));
}

export function hostedPrivateAudioStore(config,options={}) {
  if(config.storageAdapter==='neon')return neonAudioStore(config.storageConfig,options);
  if(config.storageAdapter==='r2')return r2AudioStore(config.storageConfig,options);
  throw Error('Invalid hosted private storage adapter');
}

function privateS3AudioStore(config,s3) {
  const send = async (command) => {
    try { return await s3.send(command, { abortSignal: AbortSignal.timeout(30_000) }); }
    catch { throw new Error('Private storage operation failed'); }
  };
  async function readObject(reference,key,max,verify) {
    const response=await send(new GetObjectCommand({Bucket:config.bucket,Key:key}));
    if(response.ContentLength>max || !response.Body) {response.Body?.destroy?.();throw Error('Private source integrity check failed');}
    const chunks=[];let length=0;
    try {for await(const chunk of response.Body) {length+=chunk.length;if(length>max)throw Error('Private source too large');chunks.push(Buffer.from(chunk));}}
    catch {response.Body.destroy?.();throw Error('Private source unavailable');}
    const bytes=Buffer.concat(chunks);verify(reference,bytes);return bytes;
  }
  const originalKey=reference=>objectKey(reference).replace(/\.wav$/,'.source-original');
  return {
    async isEmpty(){
      const result=await send(new ListObjectsV2Command({Bucket:config.bucket,MaxKeys:1}));
      if(!Number.isInteger(result.KeyCount) || ![0,1].includes(result.KeyCount)
        || typeof result.IsTruncated!=='boolean' || (result.Contents!==undefined && !Array.isArray(result.Contents)))throw Error('Private storage inventory unavailable');
      return result.KeyCount===0 && (result.Contents===undefined || result.Contents.length===0) && result.IsTruncated===false;
    },
    async save(recording, bytes) {
      verifyBytes(recording, bytes);
      await send(new PutObjectCommand({ Bucket: config.bucket, Key: objectKey(recording),
        Body: bytes, ContentType: 'audio/wav', CacheControl: 'private, no-store',
        Metadata: { sha256: recording.sha256 }, IfNoneMatch: '*' }));
    },
    async read(recording) {
      const response = await send(new GetObjectCommand({ Bucket: config.bucket, Key: objectKey(recording) }));
      if (response.ContentLength > MAX_BYTES || !response.Body) {
        response.Body?.destroy?.(); throw new Error('Private recording integrity check failed');
      }
      const chunks = [];
      let length = 0;
      try {
        for await (const chunk of response.Body) {
          length += chunk.length;
          if (length > MAX_BYTES) throw new Error('Private recording too large');
          chunks.push(Buffer.from(chunk));
        }
      } catch { response.Body.destroy?.(); throw new Error('Private recording unavailable'); }
      const bytes = Buffer.concat(chunks);
      verifyBytes(recording, bytes);
      return bytes;
    },
    async remove(recording) {
      await send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey(recording) }));
    },
    async exists(recording){
      const command=new HeadObjectCommand({Bucket:config.bucket,Key:objectKey(recording)});
      try{await s3.send(command,{abortSignal:AbortSignal.timeout(30_000)});return true;}
      catch(error){if(error?.$metadata?.httpStatusCode===404)return false;throw new Error('Private storage operation failed');}
    },
    async saveOriginal(reference,bytes) {
      verifySourceOriginal(reference,bytes);
      await send(new PutObjectCommand({Bucket:config.bucket,Key:originalKey(reference),Body:bytes,
        ContentType:'application/octet-stream',CacheControl:'private, no-store',Metadata:{sha256:reference.sha256},IfNoneMatch:'*'}));
    },
    async readOriginal(reference) {return readObject(reference,originalKey(reference),MAX_SOURCE_ORIGINAL_BYTES,verifySourceOriginal);},
    async removeOriginal(reference) {await send(new DeleteObjectCommand({Bucket:config.bucket,Key:originalKey(reference)}));},
    async existsOriginal(reference) {
      try {await s3.send(new HeadObjectCommand({Bucket:config.bucket,Key:originalKey(reference)}),{abortSignal:AbortSignal.timeout(30_000)});return true;}
      catch(error) {if(error?.$metadata?.httpStatusCode===404)return false;throw Error('Private storage operation failed');}
    },
    close() { s3.destroy?.(); },
  };
}

export function audioStore(storage) {
  return typeof storage === 'string' ? localAudioStore(storage) : storage;
}
