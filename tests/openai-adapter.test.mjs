import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAIAdapter } from '../server/ai/openai.mjs';

const modelResponse = (value, status = 'completed') => new Response(JSON.stringify({ status,
  output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }), { status: 200 });

test('live adapter validates structured preparation and sends no stored response', async () => {
  const calls = [];
  const adapter = createOpenAIAdapter({ apiKey: 'test-only', textModel: 'configured-test-model',
    fetchImpl: async (url, options) => { calls.push({ url, options });
      return modelResponse({ title: 'Shelves', facts: ['Finished on blue', 'Unfinished on yellow'],
        question: 'Where do they go?', askedFacts: ['Finished on blue', 'Unfinished on yellow'] }); } });
  const result = await adapter.prepare('Put finished items on the blue shelf. Put unfinished items on the yellow shelf.');
  assert.equal(result.askedFacts.length, 2);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  const request = JSON.parse(calls[0].options.body);
  assert.equal(request.store, false);
  assert.equal(request.text.format.strict, true);
  assert.equal(request.model, 'configured-test-model');
});

test('matched outcome requires exact answer evidence for every asked fact', async () => {
  const answers = [
    { outcome: 'matched', reasons: [], evidence: [{ factIndex: 0, quote: 'blue shelf' }] },
    { outcome: 'matched', reasons: [], evidence: [{ factIndex: 0, quote: 'blue shelf' }, { factIndex: 1, quote: 'yellow shelf' }] },
  ];
  const adapter = createOpenAIAdapter({ apiKey: 'test-only', textModel: 'configured-test-model',
    fetchImpl: async () => modelResponse(answers.shift()) });
  const args = ['Finished on blue shelf; unfinished on yellow shelf.', 'Where?', ['Finished blue', 'Unfinished yellow']];
  assert.equal((await adapter.assess(...args)).outcome, 'unassessable');
  assert.equal((await adapter.assess(...args)).outcome, 'matched');
});

test('provider refusal, incomplete result, malformed translation and HTTP failure stay failures', async () => {
  const content = { title: 'Shelves', text: 'Blue and yellow shelves.', question: 'Where?' };
  const refused = createOpenAIAdapter({ apiKey: 'test-only', textModel: 'test', fetchImpl: async () => new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'refusal' }] }] }), { status: 200 }) });
  await assert.rejects(refused.translate(content, 'ar'), /refused/);
  const incomplete = createOpenAIAdapter({ apiKey: 'test-only', textModel: 'test', fetchImpl: async () => modelResponse(content, 'incomplete') });
  await assert.rejects(incomplete.translate(content, 'ar'), /incomplete/);
  const wrongLanguage = createOpenAIAdapter({ apiKey: 'test-only', textModel: 'test', fetchImpl: async () => modelResponse(content) });
  await assert.rejects(wrongLanguage.translate(content, 'ur'), /language check/);
  const failed = createOpenAIAdapter({ apiKey: 'test-only', textModel: 'test', fetchImpl: async () => new Response('secret upstream text', { status: 429 }) });
  await assert.rejects(failed.prepare('A valid instruction.'), /failed \(429\)/);
  assert.throws(() => createOpenAIAdapter({ apiKey: '', textModel: 'test' }), /credentials/);
});

test('audio calls use supported upload and reject invalid speech bytes', async () => {
  const calls = [];
  const adapter = createOpenAIAdapter({ apiKey: 'test-only', textModel: 'test',
    fetchImpl: async (url, options) => { calls.push({ url, options });
      return url.endsWith('/transcriptions') ? new Response(JSON.stringify({ text: 'Put items on shelves.', languages: [{ code: 'en' }] }), { status: 200 })
        : new Response(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(120)]), { status: 200 }); } });
  assert.equal((await adapter.transcribe(Buffer.alloc(200), 'audio/webm')).text, 'Put items on shelves.');
  assert.ok(calls[0].options.body instanceof FormData);
  assert.equal((await adapter.speech('Place items on the shelf.', 'en')).length, 123);
  assert.equal(calls[1].url, 'https://api.openai.com/v1/audio/speech');
  await assert.rejects(adapter.transcribe(Buffer.alloc(200), 'audio/ogg'), /Invalid audio/);
});
