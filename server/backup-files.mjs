import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {lstat,realpath,mkdir,open,unlink} from 'node:fs/promises';
import {resolve,dirname,join,parse} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

const MAGIC=Buffer.from('UNDBAK01'),HEADER=20,TAG=16;
export function backupKey(value) {
  if(typeof value!=='string' || !/^[a-f0-9]{64}$/i.test(value))throw Error('A separate 256-bit backup encryption key is required');
  return Buffer.from(value,'hex');
}

export async function safeBackupPath(path) {
  const absolute=resolve(path),root=parse(absolute).root;
  for(let current=absolute;;current=dirname(current)) {
    try {if((await lstat(current)).isSymbolicLink())throw Error('Backup paths must not contain symbolic links');}
    catch(error){if(error.code!=='ENOENT')throw error;}
    if(current===root)break;
  }
  return absolute;
}

export async function createPrivateDirectory(path) {
  const absolute=await safeBackupPath(path);
  await realpath(dirname(absolute));
  await mkdir(absolute,{mode:0o700});
  return absolute;
}

export async function regularBackupFile(path,{maxBytes=Number.MAX_SAFE_INTEGER}={}) {
  const absolute=await safeBackupPath(path),info=await lstat(absolute);
  if(!info.isFile() || info.size<1 || info.size>maxBytes)throw Error('Invalid backup file');
  return {path:absolute,bytes:info.size};
}

export async function fileSha256(path) {
  const info=await regularBackupFile(path),digest=createHash('sha256');
  for await(const chunk of createReadStream(info.path))digest.update(chunk);
  return digest.digest('hex');
}

export async function encryptBackupStream(source,path,key,aad) {
  if(!Buffer.isBuffer(key) || key.length!==32)throw Error('Invalid backup key');
  const absolute=await safeBackupPath(path),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from(aad));
  const header=Buffer.concat([MAGIC,iv]);
  const handle=await open(absolute,'wx',0o600);
  try {await handle.writeFile(header);}finally {await handle.close();}
  await pipeline(source,cipher,createWriteStream(absolute,{flags:'r+',start:HEADER}));
  const tail=await open(absolute,'a');
  try {await tail.writeFile(cipher.getAuthTag());await tail.sync();}finally {await tail.close();}
  return {bytes:(await lstat(absolute)).size,sha256:await fileSha256(absolute)};
}

export function encryptBackupBytes(bytes,path,key,aad) {
  return encryptBackupStream(Readable.from([bytes]),path,key,aad);
}

async function encryptedReader(path,key,aad,maxBytes) {
  const info=await regularBackupFile(path,{maxBytes:maxBytes+HEADER+TAG});
  if(info.bytes<=HEADER+TAG)throw Error('Invalid encrypted backup');
  const handle=await open(info.path,'r');
  const header=Buffer.alloc(HEADER),tag=Buffer.alloc(TAG);
  try {
    if((await handle.read(header,0,HEADER,0)).bytesRead!==HEADER || !header.subarray(0,8).equals(MAGIC)
      || (await handle.read(tag,0,TAG,info.bytes-TAG)).bytesRead!==TAG)throw Error('Invalid encrypted backup');
  }finally {await handle.close();}
  const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(8));
  decipher.setAAD(Buffer.from(aad));decipher.setAuthTag(tag);
  return {source:createReadStream(info.path,{start:HEADER,end:info.bytes-TAG-1}),decipher};
}

export async function decryptBackupFile(path,target,key,aad) {
  const absolute=await safeBackupPath(target);
  const handle=await open(absolute,'wx',0o600);await handle.close();
  try {
    const {source,decipher}=await encryptedReader(path,key,aad,Number.MAX_SAFE_INTEGER-HEADER-TAG);
    await pipeline(source,decipher,createWriteStream(absolute,{flags:'r+'}));
    return absolute;
  }catch {await unlink(absolute);throw Error('Backup authentication failed');}
}

export async function decryptBackupBytes(path,key,aad,{maxBytes=10485760}={}) {
  const {source,decipher}=await encryptedReader(path,key,aad,maxBytes),chunks=[];let bytes=0;
  decipher.on('data',chunk=>{bytes+=chunk.length;chunks.push(chunk);});
  try {await pipeline(source,decipher);}
  catch {throw Error('Backup authentication failed');}
  if(bytes>maxBytes)throw Error('Backup file exceeds limit');
  return Buffer.concat(chunks);
}

export async function writeBackupCompletion(directory,manifest,key) {
  const bytes=Buffer.from(JSON.stringify(manifest));
  if(bytes.length>16*1024*1024)throw Error('Backup manifest exceeds limit');
  return encryptBackupBytes(bytes,join(directory,'manifest.enc'),key,'understood:backup:manifest:v1');
}

export async function readBackupCompletion(directory,key) {
  const bytes=await decryptBackupBytes(join(directory,'manifest.enc'),key,'understood:backup:manifest:v1',{maxBytes:16*1024*1024});
  try {return JSON.parse(bytes.toString('utf8'));}catch {throw Error('Invalid backup manifest');}
}
