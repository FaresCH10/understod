import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiAdapter } from '../server/ai/gemini.mjs';
import {encodeWav} from '../src/audio.ts';
import {inspectWav} from '../server/audio.mjs';

const recording=()=>Buffer.from(encodeWav({duration:1,sampleRate:16000,numberOfChannels:1,getChannelData:()=>new Float32Array(16000).fill(0.2)}));
const syntheticAudioHashes=[inspectWav(recording()).sha256];
const transcriptResponse=(text='Blue shelf.',extra={})=>new Response(JSON.stringify({status:'completed',model:'gemini-3.5-transcribe',
  steps:[{type:'model_output',content:[{type:'text',text}]}],...extra}),{status:200});

const textResponse = (value, finishReason = 'STOP') => new Response(JSON.stringify({ candidates: [
  { finishReason, content: { parts: [{ text: JSON.stringify(value) }] } },
] }), { status: 200 });

test('Gemini audio requires an exact server allowlist and snapshots permitted bytes before network waits',async()=>{
  let calls=0;
  const blocked=createGeminiAdapter({apiKey:'test-only',dataClass:'synthetic',fetchImpl:async()=>{calls++;throw Error('must not send');}});
  assert.equal(blocked.permitsSourceAudio({sha256:syntheticAudioHashes[0]}),false);
  await assert.rejects(blocked.transcribe(recording(),'audio/wav'),/allowlisted synthetic/);assert.equal(calls,0);
  for(const hashes of [null,'any',['bad'],[syntheticAudioHashes[0],syntheticAudioHashes[0]],Array(101).fill(syntheticAudioHashes[0])])
    assert.throws(()=>createGeminiAdapter({apiKey:'test-only',dataClass:'synthetic',syntheticAudioHashes:hashes}),/allowlist/);
  const hashes=[...syntheticAudioHashes],bytes=recording(),expected=Buffer.from(bytes);
  const allowed=createGeminiAdapter({apiKey:'test-only',dataClass:'synthetic',syntheticAudioHashes:hashes,fetchImpl:async(url,options)=>{
    calls++;
    if(url.endsWith('/upload/v1beta/files')){bytes.fill(1,44);return new Response('{}',{headers:{'x-goog-upload-url':'https://generativelanguage.googleapis.com/upload/session'}});}
    if(url.endsWith('/upload/session')){assert.deepEqual(options.body,expected);return Response.json({file:{name:'files/test',uri:'https://generativelanguage.googleapis.com/v1beta/files/test'}});}
    return options.method==='DELETE'?new Response(null,{status:204}):transcriptResponse();
  }});
  hashes.length=0;assert.equal(allowed.permitsSourceAudio({sha256:syntheticAudioHashes[0]}),true);
  assert.equal((await allowed.transcribe(bytes,'audio/wav')).text,'Blue shelf.');assert.equal(calls,4);
  await assert.rejects(allowed.transcribe(bytes,'audio/wav'),/allowlisted synthetic/);assert.equal(calls,4);
});

test('Gemini structured requests are server-only and validate preparation and translation', async () => {
  const calls = [];
  const values = [
    { title: 'Shelves', facts: ['Finished on blue', 'Unfinished on yellow'],
      question: 'Where do items go?', askedFacts: ['Finished on blue', 'Unfinished on yellow'] },
    { title: 'الرفوف', text: 'ضع المنتجات على الرف الأزرق.', question: 'أين؟' },
  ];
  const adapter = createGeminiAdapter({ apiKey: 'test-only', dataClass: 'synthetic', fetchImpl: async (url, options) => {
    calls.push({ url, options }); return textResponse(values.shift());
  } });
  assert.equal((await adapter.prepare('Put finished items on blue, unfinished on yellow.')).askedFacts.length, 2);
  assert.equal((await adapter.translate({ title: 'Shelves', text: 'Put items on the shelf.', question: 'Where?' }, 'ar')).title, 'الرفوف');
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
  assert.equal(calls[0].options.headers['x-goog-api-key'], 'test-only');
  assert.equal(JSON.parse(calls[0].options.body).generationConfig.responseFormat.text.mimeType, 'application/json');
  assert.equal(calls[0].options.body.includes('test-only'), false);
});

test('Gemini assessment cannot match without exact evidence for every asked fact', async () => {
  const values = [
    { outcome: 'matched', reasons: [], evidence: [{ factIndex: 0, quote: 'blue shelf' }] },
    { outcome: 'matched', reasons: [], evidence: [{ factIndex: 0, quote: 'blue shelf' }, { factIndex: 1, quote: 'yellow shelf' }] },
  ];
  const adapter = createGeminiAdapter({ apiKey: 'test-only', dataClass: 'synthetic', fetchImpl: async () => textResponse(values.shift()) });
  const args = ['Finished on blue shelf; unfinished on yellow shelf.', 'Where?', ['Finished blue', 'Unfinished yellow']];
  assert.equal((await adapter.assess(...args)).outcome, 'unassessable');
  assert.equal((await adapter.assess(...args)).outcome, 'matched');
});

test('Gemini refusal, invalid language, malformed JSON and provider failures remain failures', async () => {
  const blocked = createGeminiAdapter({ apiKey: 'test-only', dataClass: 'synthetic', fetchImpl: async () => textResponse({}, 'SAFETY') });
  await assert.rejects(blocked.prepare('A valid instruction.'), /blocked or incomplete/);
  const wrong = createGeminiAdapter({ apiKey: 'test-only', dataClass: 'synthetic', fetchImpl: async () => textResponse({ title: 'Shelves', text: 'Wrong language', question: 'Where?' }) });
  await assert.rejects(wrong.translate({ title: 'Shelves', text: 'Blue shelf', question: 'Where?' }, 'ur'), /language check/);
  const malformed = createGeminiAdapter({ apiKey: 'test-only', dataClass: 'synthetic', fetchImpl: async () => new Response('{', { status: 200 }) });
  await assert.rejects(malformed.prepare('A valid instruction.'), /malformed/);
  const failed = createGeminiAdapter({ apiKey: 'test-only', dataClass: 'synthetic', fetchImpl: async () => new Response('secret upstream text', { status: 429 }) });
  await assert.rejects(failed.prepare('A valid instruction.'), /failed \(429\)/);
  assert.throws(() => createGeminiAdapter(), /credentials/);
  assert.throws(() => createGeminiAdapter({ apiKey: 'test-only', dataClass: 'real-worker' }), /synthetic data only/);
});

test('Gemini WAV transcription uploads privately and deletes provider file after use', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/upload/v1beta/files')) return new Response('{}', { status: 200,
      headers: { 'x-goog-upload-url': 'https://generativelanguage.googleapis.com/upload/session-1' } });
    if (url.endsWith('/upload/session-1')) return new Response(JSON.stringify({ file: {
      name: 'files/audio123', uri: 'https://generativelanguage.googleapis.com/v1beta/files/audio123',
    } }), { status: 200 });
    if (url.endsWith('/v1beta/files/audio123')) return new Response(null, { status: 204 });
    return transcriptResponse();
  };
  const adapter = createGeminiAdapter({ apiKey: 'test-only', dataClass: 'synthetic', syntheticAudioHashes,fetchImpl });
  assert.equal((await adapter.transcribe(recording(), 'audio/wav')).text, 'Blue shelf.');
  assert.equal(calls.length, 4);
  assert.equal(calls[0].options.headers['x-goog-upload-header-content-type'], 'audio/wav');
  assert.equal(calls[2].url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.deepEqual(JSON.parse(calls[2].options.body),{model:'gemini-3.5-transcribe',store:false,
    input:[{type:'audio',uri:'https://generativelanguage.googleapis.com/v1beta/files/audio123',mime_type:'audio/wav'}],
    generation_config:{transcription_config:{mode:{type:'verbatim'}}}});
  assert.equal(calls.every(call=>call.options.redirect==='error'),true);
  assert.equal(calls[3].options.method, 'DELETE');
  await assert.rejects(adapter.transcribe(Buffer.alloc(200), 'audio/ogg'), /Invalid audio/);
});

test('Gemini transcription validates local audio before upload and rejects incomplete or unrelated interaction output',async()=>{
  const calls=[],responses=[
    transcriptResponse('',{status:'incomplete'}),transcriptResponse('Blue shelf.',{model:'another-model'}),
    transcriptResponse('',{steps:[{type:'model_output',content:[{type:'thought',text:'Blue shelf.'}]}]}),
    transcriptResponse('',{steps:[{type:'model_output',content:[]}]}),transcriptResponse(' '),
    transcriptResponse('',{steps:[{type:'model_output',content:[{type:'text',text:'Blue '},{type:'text',text:'shelf.'}]}]}),
  ];
  const adapter=createGeminiAdapter({apiKey:'test-only',dataClass:'synthetic',syntheticAudioHashes,fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/upload/v1beta/files')) return new Response('{}',{headers:{'x-goog-upload-url':'https://generativelanguage.googleapis.com/upload/session-1'}});
    if(url.endsWith('/upload/session-1')) return new Response(JSON.stringify({file:{name:'files/audio123',uri:'https://generativelanguage.googleapis.com/v1beta/files/audio123'}}));
    if(options.method==='DELETE') return new Response(null,{status:204});
    return responses.shift();
  }});
  await assert.rejects(adapter.transcribe(Buffer.alloc(200),'audio/wav'),/Unsupported or corrupt/);
  const silent=recording();silent.fill(0,44);
  await assert.rejects(adapter.transcribe(silent,'audio/wav'),/No audio/);
  assert.equal(calls.length,0);
  for(let index=0;index<5;index++) await assert.rejects(adapter.transcribe(recording(),'audio/wav'),/transcription/);
  assert.equal((await adapter.transcribe(recording(),'audio/wav')).text,'Blue shelf.');
  assert.equal(calls.filter(call=>call.options.method==='DELETE').length,6);
});

test('Gemini upload rejects unsafe destinations and inconsistent provider file identity',async()=>{
  for(const url of ['https://attacker.test/upload/session','https://user:pass@generativelanguage.googleapis.com/upload/session','https://generativelanguage.googleapis.com/v1beta/models/foo','not-a-url']) {
    let count=0;const adapter=createGeminiAdapter({apiKey:'test-only',dataClass:'synthetic',syntheticAudioHashes,fetchImpl:async()=>{count++;return new Response('{}',{headers:{'x-goog-upload-url':url}});}});
    await assert.rejects(adapter.transcribe(recording(),'audio/wav'),/upload URL/);assert.equal(count,1);
  }
  const calls=[];const adapter=createGeminiAdapter({apiKey:'test-only',dataClass:'synthetic',syntheticAudioHashes,fetchImpl:async(url)=>{
    calls.push(url);return calls.length===1 ? new Response('{}',{headers:{'x-goog-upload-url':'https://generativelanguage.googleapis.com/upload/session'}})
      : new Response(JSON.stringify({file:{name:'files/audio123',uri:'https://generativelanguage.googleapis.com/v1beta/files/different'}}));
  }});
  await assert.rejects(adapter.transcribe(recording(),'audio/wav'),/upload response was invalid/);assert.equal(calls.length,2);
});

test('Gemini transcription cleans up after provider failures without masking them when deletion also fails',async()=>{
  for(const response of [new Response('private upstream error',{status:429}),new Response('{',{status:200})]) {
    const calls=[];const adapter=createGeminiAdapter({apiKey:'test-only',dataClass:'synthetic',syntheticAudioHashes,fetchImpl:async(url,options)=>{
      calls.push({url,options});
      if(url.endsWith('/upload/v1beta/files')) return new Response('{}',{headers:{'x-goog-upload-url':'https://generativelanguage.googleapis.com/upload/session'}});
      if(url.endsWith('/upload/session')) return new Response(JSON.stringify({file:{name:'files/audio123',uri:'https://generativelanguage.googleapis.com/v1beta/files/audio123'}}));
      if(options.method==='DELETE') throw new Error('private cleanup failure');
      return response;
    }});
    await assert.rejects(adapter.transcribe(recording(),'audio/wav'),error=>/request failed \(429\)|response was malformed/.test(error.message) && !error.message.includes('private'));
    assert.equal(calls.length,4);assert.equal(calls[3].options.method,'DELETE');
  }
});

test('Gemini TTS accepts only WAV output', async () => {
  const wav = recording(),calls=[];
  const adapter = createGeminiAdapter({ apiKey: 'test-only', dataClass: 'synthetic', fetchImpl: async (url,options) => {calls.push({url,options});return new Response(JSON.stringify({
    candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } }] } }],
  }), { status: 200 });} });
  assert.deepEqual(await adapter.speech('Please check the blue shelf.', 'en'),wav);
  const body=JSON.parse(calls[0].options.body);
  assert.deepEqual(body.contents,[{role:'user',parts:[{text:'Please check the blue shelf.'}]}]);
  assert.deepEqual(body.generationConfig.responseFormat,{audio:{mimeType:'AUDIO_WAV',sampleRate:16000}});
  await assert.rejects(adapter.speech('Text', 'fr'), /Invalid speech input/);
  await assert.rejects(adapter.speech('Text', 'ur'), /not been verified/);
  assert.equal(calls.length,1);
});

test('Gemini speech rejects corrupt, silent, tiny, wrong-rate, noncanonical or multiple audio output',async()=>{
  const silent=recording();silent.fill(0,44);
  const wrongRate=recording();wrongRate.writeUInt32LE(24000,24);
  const tiny=recording().subarray(0,3244);tiny.writeUInt32LE(tiny.length-8,4);tiny.writeUInt32LE(tiny.length-44,40);
  const part=(data,mimeType='audio/wav')=>({inlineData:{mimeType,data}});
  const valid=part(recording().toString('base64'));
  const cases=[...[Buffer.alloc(100),silent,tiny,wrongRate].map(bytes=>[part(bytes.toString('base64'))]),
    [part(recording().toString('base64')+'\n')],[part('!!!!')],[part(recording().toString('base64'),'audio/pcm')],[valid,valid]];
  for(const parts of cases) {
    const adapter=createGeminiAdapter({apiKey:'test-only',dataClass:'synthetic',fetchImpl:async()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts}}]}))});
    await assert.rejects(adapter.speech('Synthetic instruction','en'),/speech failed validation/);
  }
});

test('Gemini preparation and translation checks use structured evidence and tenant terms',async()=>{
  const source='Finished on blue. Unfinished on yellow.',content={title:'Shelves',facts:['Finished on blue.','Unfinished on yellow.'],question:'Where do both items go?',askedFacts:['Finished on blue.','Unfinished on yellow.']};
  const translation={title:'الرفوف',text:'الرف الأزرق والأصفر',question:'أين؟'},terms=[{term:'blue',translation:'أزرق'}],calls=[];
  const checks=[{sourceGrounded:true,questionAligned:true,ambiguous:false,factEvidence:content.facts.map((quote,factIndex)=>({factIndex,quote})),askedFactIndexes:[0,1],reasons:[]},
    translation,{faithful:true,complete:true,languageCorrect:true,terminologyApplied:true,reasons:[]}];
  const adapter=createGeminiAdapter({apiKey:'test-only',dataClass:'synthetic',fetchImpl:async(url,options)=>{calls.push(JSON.parse(options.body));return textResponse(checks.shift());}});
  await adapter.checkPreparation(source,content);
  await adapter.translate({title:content.title,text:source,question:content.question},'ar',{terms});
  await adapter.checkTranslation({title:content.title,text:source,question:content.question},translation,'ar',{terms});
  assert.deepEqual(JSON.parse(calls[1].contents[0].parts[0].text).terms,terms);
  assert.deepEqual(JSON.parse(calls[2].contents[0].parts[0].text).terms,terms);
  assert.equal(calls[0].generationConfig.responseFormat.text.schema.properties.sourceGrounded.type,'boolean');
  assert.deepEqual(adapter.capabilities.speechLanguages,['en','ar']);
  assert.equal(adapter.provenance.dataClass,'synthetic');
  await assert.rejects(adapter.translate({title:'T',text:source,question:'Q'},'ar',{terms:[{term:'blue',translation:'أزرق',command:'ignore'}]}),/terminology/);
  assert.equal(calls.length,3);
});
