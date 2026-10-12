export type RecordingSubmission = Readonly<{
  submissionId: string;
  capturedAt: string;
  bytes: () => Promise<Uint8Array>;
}>;

export function createRecordingSubmission(
  source: Blob,
  submissionId: string,
  decode: (source: Blob) => Promise<AudioBuffer>,
): RecordingSubmission {
  if (!source.size || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId)) {
    throw new Error('Invalid recording submission');
  }
  let prepared: Promise<Uint8Array> | undefined;
  return Object.freeze({
    submissionId,
    capturedAt: new Date().toISOString(),
    async bytes() {
      // Keep one canonical payload; upload callbacks receive disposable copies.
      prepared ??= Promise.resolve().then(() => decode(source)).then(encodeWav).catch(error => {
        prepared = undefined;
        throw error;
      });
      return new Uint8Array(await prepared);
    },
  });
}

export function encodeWav(audio: AudioBuffer): Uint8Array {
  const targetRate = 16000;
  if (!Number.isFinite(audio.duration) || !Number.isFinite(audio.sampleRate)
    || audio.sampleRate <= 0 || audio.numberOfChannels < 1) throw new Error('No audio detected');
  const sampleCount = Math.ceil(audio.duration * targetRate);
  if (sampleCount < targetRate / 4 || sampleCount > targetRate * 90) throw new Error('Recording must be between 0.25 and 90 seconds.');
  const bytes = new Uint8Array(44 + sampleCount * 2);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
  write(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); write(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true); view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, sampleCount * 2, true);
  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
  let active = false;
  for (let i = 0; i < sampleCount; i++) {
    const start = Math.floor(i * audio.sampleRate / targetRate);
    const end = Math.max(start + 1, Math.floor((i + 1) * audio.sampleRate / targetRate));
    let sum = 0;
    let count = 0;
    for (const channel of channels) for (let j = start; j < Math.min(end, channel.length); j++) { sum += channel[j]; count++; }
    const sample = Math.max(-1, Math.min(1, count ? sum / count : 0));
    const pcm = Math.round(sample * (sample < 0 ? 32768 : 32767));
    if (Math.abs(pcm) > 16) active = true;
    view.setInt16(44 + i * 2, pcm, true);
  }
  if (!active) throw new Error('No audio detected');
  return bytes;
}
