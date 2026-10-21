import {createHash, randomUUID} from 'node:crypto';
import {S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand,
  HeadObjectCommand, DeleteObjectCommand} from '@aws-sdk/client-s3';
import {validateNeonStorageConfig, neonStorageClientOptions} from './neon-storage-config.mjs';
export {neonStorageClientOptions} from './neon-storage-config.mjs';

const PREFIX = 'UNDERSTOOD_NEON_STORAGE_TEST_';
export const NEON_STORAGE_TEST_FIELDS = Object.freeze([
  'ISOLATED', 'BUCKET', 'ENDPOINT', 'REGION', 'ACCESS_KEY_ID', 'SECRET_ACCESS_KEY',
].map(name => PREFIX + name));
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function neonStorageTestConfig(env = {}) {
  const fail = () => {throw Error('An isolated private Neon storage test configuration is required');};
  if (env[PREFIX + 'ISOLATED'] !== 'true'
    || env[PREFIX + 'BUCKET'] !== 'understood-synthetic-test') fail();
  try {
    return validateNeonStorageConfig({endpoint: env[PREFIX + 'ENDPOINT'], region: env[PREFIX + 'REGION'],
      bucket: env[PREFIX + 'BUCKET'], accessKeyId: env[PREFIX + 'ACCESS_KEY_ID'], secretAccessKey: env[PREFIX + 'SECRET_ACCESS_KEY']});
  } catch {fail();}
}

function syntheticWav() {
  const samples = 4000, bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36);
  bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) bytes.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / 16000) * 1000), 44 + i * 2);
  return bytes;
}

async function boundedBody(response) {
  if (!response.Body || response.ContentLength > 65536) {
    response.Body?.destroy?.(); throw Error('Storage probe body unavailable');
  }
  const chunks = []; let size = 0;
  try {
    for await (const chunk of response.Body) {
      size += chunk.length;
      if (size > 65536) throw Error('Storage probe body exceeded limit');
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch {response.Body.destroy?.(); throw Error('Storage probe body unavailable');}
}

async function anonymousRead(url, signal) {
  const response = await fetch(url, {method: 'GET', redirect: 'manual', credentials: 'omit',
    cache: 'no-store', signal});
  await response.body?.cancel();
  return response.status;
}

// This is an isolated compatibility probe, not a production storage adapter.
export async function checkNeonPrivateStorage(env, {
  makeClient = options => new S3Client(options), readAnonymous = anonymousRead, runId = randomUUID(),
} = {}) {
  const config = neonStorageTestConfig(env);
  if (!UUID.test(runId)) throw Error('Invalid synthetic storage run identifier');
  const bytes = syntheticWav(), key = `understood-storage-check/${runId}/probe.wav`;
  const metadata = {'understood-test-run': runId, sha256: hash(bytes)};
  const result = {kind: 'neon-private-storage-synthetic-probe', runId,
    targetFingerprint: hash(`${config.endpoint}\n${config.bucket}`),
    state: 'failed', phase: 'empty-bucket', authenticatedRead: false, anonymousReadDenied: false,
    conditionalOverwriteRejected: false, originalBytesPreserved: false,
    cleanup: 'not-needed', databaseWrites: 0, aiProviderCalls: 0, realData: false,
    applicationStorageChanged: false, irreversibleErasureVerified: false, productionReady: false};
  const client = makeClient(neonStorageClientOptions(config));
  const overall = AbortSignal.timeout(120000);
  let putAttempted = false;
  const send = (command, cleanup = false) => client.send(command, {abortSignal: cleanup
    ? AbortSignal.timeout(10000) : AbortSignal.any([overall, AbortSignal.timeout(10000)])});
  const input = {Bucket: config.bucket, Key: key};
  const missing = error => error?.$metadata?.httpStatusCode === 404;
  const owned = response => response?.Metadata?.['understood-test-run'] === runId;
  const verifiedRead = async () => {
    const response = await send(new GetObjectCommand(input));
    if (!owned(response)) {response.Body?.destroy?.(); throw Error('Probe ownership unavailable');}
    if (!bytes.equals(await boundedBody(response))) throw Error('Probe bytes mismatch');
  };
  try {
    const inventory = await send(new ListObjectsV2Command({Bucket: config.bucket, MaxKeys: 1}));
    if (inventory.KeyCount !== 0 || inventory.IsTruncated !== false
      || inventory.Contents !== undefined && (!Array.isArray(inventory.Contents) || inventory.Contents.length)) {
      throw Error('An empty synthetic bucket is required');
    }
    result.phase = 'unique-probe';
    try {await send(new HeadObjectCommand(input)); throw Error('Probe already exists');}
    catch (error) {if (!missing(error)) throw error;}
    result.phase = 'write'; putAttempted = true;
    await send(new PutObjectCommand({...input, Body: bytes, ContentType: 'audio/wav',
      CacheControl: 'private, no-store', Metadata: metadata, IfNoneMatch: '*'}));
    result.phase = 'authenticated-read';
    const head = await send(new HeadObjectCommand(input));
    if (!owned(head) || head.ContentLength !== bytes.length) throw Error('Probe ownership unavailable');
    await verifiedRead();
    result.authenticatedRead = true;
    result.phase = 'anonymous-read';
    const url = `${config.endpoint}/${encodeURIComponent(config.bucket)}/${key}`;
    const status = await readAnonymous(url, AbortSignal.any([overall, AbortSignal.timeout(10000)]));
    if (![401, 403].includes(status)) throw Error('Private anonymous denial was not established');
    result.anonymousReadDenied = true;
    result.phase = 'conditional-overwrite';
    const changed = Buffer.from(bytes); changed[changed.length - 1] ^= 255;
    try {
      await send(new PutObjectCommand({...input, Body: changed, ContentType: 'audio/wav',
        CacheControl: 'private, no-store', Metadata: metadata, IfNoneMatch: '*'}));
      throw Error('Conditional overwrite unexpectedly succeeded');
    } catch (error) {
      if (error?.$metadata?.httpStatusCode !== 412) throw error;
    }
    result.conditionalOverwriteRejected = true;
    await verifiedRead();
    result.originalBytesPreserved = true;
    result.phase = 'cleanup'; result.state = 'passed';
  } catch {
    // Provider messages and headers can contain credentials or private endpoints.
    result.state = 'failed';
  } finally {
    if (putAttempted) {
      result.cleanup = 'unverified';
      try {
        let found;
        try {found = await send(new HeadObjectCommand(input), true);}
        catch (error) {if (!missing(error)) throw error; result.cleanup = 'absent';}
        if (found) {
          if (!owned(found)) throw Error('Cleanup ownership was not established');
          await send(new DeleteObjectCommand(input), true);
          try {await send(new HeadObjectCommand(input), true); throw Error('Probe remains readable');}
          catch (error) {if (!missing(error)) throw error;}
          result.cleanup = 'removed-from-current-branch';
        }
      } catch {result.state = 'failed';}
    }
    try {client.destroy?.();} catch {result.state = 'failed';}
  }
  if (result.state === 'passed') result.phase = 'completed';
  return result;
}
