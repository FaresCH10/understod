import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectWav, savePrivateWav, readPrivateWav } from '../server/audio.mjs';
import { createRecordingSubmission, encodeWav } from '../src/audio.ts';

function wav(seconds = 1) {
  const samples = 16000 * seconds;
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
  bytes.writeInt16LE(1000, 44);
  return bytes;
}

test('private WAV validation checks actual PCM format, duration, corruption and silence', async () => {
  const bytes = wav();
  assert.equal(inspectWav(bytes).durationSeconds, 1);
  assert.throws(() => inspectWav(Buffer.from(bytes.subarray(0, bytes.length - 2))), /length/);
  const stereo = Buffer.from(bytes); stereo.writeUInt16LE(2, 22);
  assert.throws(() => inspectWav(stereo), /Unsupported/);
  const silent = Buffer.from(bytes); silent.writeInt16LE(0, 44);
  assert.throws(() => inspectWav(silent), /No audio/);
  assert.throws(() => inspectWav(wav(91)), /Unsupported/);
  const root = await mkdtemp(join(tmpdir(), 'understood-audio-'));
  const id = '8deac46b-26eb-4cb3-9c4c-f3d03fdf7753';
  try {
    assert.equal((await savePrivateWav(root, id, bytes)).bytes, bytes.length);
    assert.deepEqual(await readPrivateWav(root, id), bytes);
    await assert.rejects(savePrivateWav(root, id, bytes), /EEXIST/);
    await assert.rejects(readPrivateWav(root, '../escape'), /Invalid recording ID/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('browser PCM encoder emits server-valid mono 16 kHz WAV', () => {
  const samples = Float32Array.from({ length: 48000 }, (_, i) => Math.sin(i / 10) * 0.5);
  const audio = { duration: 1, sampleRate: 48000, numberOfChannels: 1, getChannelData: () => samples };
  const bytes = Buffer.from(encodeWav(audio));
  assert.equal(inspectWav(bytes).durationSeconds, 1);
  assert.equal(bytes.length, 32044);
  assert.throws(() => encodeWav({ ...audio, duration: 91 }), /between/);
  assert.throws(() => encodeWav({ ...audio, duration: 0.1 }), /between/);
  assert.throws(() => encodeWav({ ...audio, sampleRate: 0 }), /No audio/);
  assert.throws(() => encodeWav({ ...audio, getChannelData: () => new Float32Array(48000) }), /No audio/);
});

test('recording retries share canonical bytes and ID without decoding again or callback mutation', async () => {
  const source = new Blob(['synthetic encoded audio']);
  const id = '8deac46b-26eb-4cb3-9c4c-f3d03fdf7753';
  const samples = Float32Array.from({ length: 48000 }, (_, i) => Math.sin(i / 10) * 0.5);
  const audio = { duration: 1, sampleRate: 48000, numberOfChannels: 1, getChannelData: () => samples };
  let decodes = 0;
  const submission = createRecordingSubmission(source, id, async received => {
    assert.equal(received, source);
    decodes++;
    return audio;
  });
  const [first, simultaneous] = await Promise.all([submission.bytes(), submission.bytes()]);
  assert.equal(decodes, 1);
  assert.notEqual(first, simultaneous);
  assert.deepEqual(first, simultaneous);
  assert.equal(inspectWav(Buffer.from(first)).durationSeconds, 1);
  first.fill(0);
  samples.fill(0);
  const retry = await submission.bytes();
  assert.deepEqual(retry, simultaneous);
  assert.equal(decodes, 1);
  assert.equal(submission.submissionId, id);
  assert.throws(() => { submission.submissionId = 'changed'; }, TypeError);
  assert.throws(() => createRecordingSubmission(new Blob(), id, async () => audio), /Invalid/);
  assert.throws(() => createRecordingSubmission(source, '../changed', async () => audio), /Invalid/);
});

test('failed recording preparation is never cached as a payload or submitted', async () => {
  const source = new Blob(['synthetic encoded audio']);
  const id = '8deac46b-26eb-4cb3-9c4c-f3d03fdf7753';
  const samples = Float32Array.from({ length: 16000 }, (_, i) => Math.sin(i / 10) * 0.5);
  let decodes = 0;
  const submission = createRecordingSubmission(source, id, async () => {
    decodes++;
    if (decodes === 1) throw new Error('Decode failed');
    return { duration: 1, sampleRate: 16000, numberOfChannels: 1,
      getChannelData: () => decodes === 2 ? new Float32Array(16000) : samples };
  });
  await assert.rejects(submission.bytes(), /Decode failed/);
  await assert.rejects(submission.bytes(), /No audio/);
  assert.equal(inspectWav(Buffer.from(await submission.bytes())).durationSeconds, 1);
  await submission.bytes();
  assert.equal(decodes, 3);
  assert.equal(submission.submissionId, id);
});
