import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink, lstat } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_SECONDS = 90;
const SAMPLE_RATE = 16000;
const MAX_BYTES = 44 + MAX_SECONDS * SAMPLE_RATE * 2;

export function inspectWav(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 46 || bytes.length > MAX_BYTES
    || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE'
    || bytes.toString('ascii', 12, 16) !== 'fmt ' || bytes.readUInt32LE(16) !== 16
    || bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(22) !== 1
    || bytes.readUInt32LE(24) !== SAMPLE_RATE || bytes.readUInt32LE(28) !== SAMPLE_RATE * 2
    || bytes.readUInt16LE(32) !== 2 || bytes.readUInt16LE(34) !== 16
    || bytes.toString('ascii', 36, 40) !== 'data') throw new Error('Unsupported or corrupt recording');
  const dataLength = bytes.readUInt32LE(40);
  if (bytes.readUInt32LE(4) !== bytes.length - 8 || dataLength !== bytes.length - 44
    || dataLength % 2 || dataLength / (SAMPLE_RATE * 2) > MAX_SECONDS) throw new Error('Invalid recording length');
  let active = false;
  for (let i = 44; i < bytes.length; i += 2) {
    if (Math.abs(bytes.readInt16LE(i)) > 16) { active = true; break; }
  }
  if (!active) throw new Error('No audio detected');
  return { durationSeconds: dataLength / (SAMPLE_RATE * 2), bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex') };
}

function pathFor(root, id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('Invalid recording ID');
  }
  return join(root, `${id}.wav`);
}

export async function savePrivateWav(root, id, bytes) {
  const info = inspectWav(bytes);
  await mkdir(root, { recursive: true });
  await writeFile(pathFor(root, id), bytes, { flag: 'wx', mode: 0o600 });
  return info;
}

export async function readPrivateWav(root, id) {
  return readFile(pathFor(root, id));
}

export async function removePrivateWav(root, id) {
  try { await unlink(pathFor(root, id)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export async function privateWavExists(root,id){
  try{await lstat(pathFor(root,id));return true;}
  catch(error){if(error.code==='ENOENT')return false;throw error;}
}
