import test from 'node:test';
import assert from 'node:assert/strict';
import {syntheticSmoke} from '../scripts/gemini-synthetic-smoke.mjs';
import {GEMINI_MODELS} from '../server/ai/gemini.mjs';
import wavefile from 'wavefile';
const apiKey='AIza'+'a'.repeat(35);
test('synthetic smoke requires a local Google key and never dispatches invalid configuration',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;throw Error('must not dispatch');};
  for(const key of ['',undefined,'key with spaces','key\r\nInjected: header','非ASCII','x'.repeat(513)])await assert.rejects(syntheticSmoke({apiKey:key,fetchImpl}));
  await assert.rejects(syntheticSmoke({apiKey,mode:'real-worker',fetchImpl}));assert.equal(calls,0);
});

test('synthetic smoke treats authorization and standard Gemini keys as opaque secrets, not legacy prefixes',async()=>{
  for(const key of ['AQ.'+'a'.repeat(50),apiKey]) {
    const result=await syntheticSmoke({apiKey:key,fetchImpl:async(_url,options)=>{
      assert.equal(options.headers['x-goog-api-key'],key);
      return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({title:'Fixture',facts:['Fact'],question:'Where?',askedFacts:['Fact']})}]}}]});
    }});
    assert.equal(result.state,'passed');assert.equal(JSON.stringify(result).includes(key),false);
  }
});
test('synthetic connection smoke journals before dispatch and writes only bounded metadata, never credentials or raw output',async()=>{
  const saved=[];let calls=0;
  const result=await syntheticSmoke({apiKey,persist:row=>saved.push(row),fetchImpl:async(url,options)=>{
    calls++;assert.equal(saved.at(-1).requests[0].state,'pending');assert.equal(options.headers['x-goog-api-key'],apiKey);
    assert.equal(options.redirect,'error');
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({title:'Synthetic shelves',facts:['Blue shelf.'],question:'Where?',askedFacts:['Blue shelf.']})}]}}]});
  }});
  assert.equal(calls,1);assert.equal(result.state,'passed');assert.equal(result.realDataAllowed,false);assert.equal(result.productionReady,false);
  assert.equal(result.requests[0].httpStatus,200);assert.equal(result.results[0].outputHash.length,64);
  assert.doesNotMatch(JSON.stringify(saved),new RegExp(apiKey+'|Synthetic shelves|Blue shelf'));
});
test('synthetic smoke stops at the first refusal with no automatic retry and preserves known status',async()=>{
  for(const status of [400,401,403,404,429,503]) {
    let calls=0;const result=await syntheticSmoke({apiKey,mode:'stages',fetchImpl:async()=>{calls++;return new Response('private provider error '+apiKey,{status});}});
    assert.equal(calls,1);assert.equal(result.state,'failed');assert.equal(result.requests[0].httpStatus,status);
    assert.equal(result.requests[0].state,'rejected');assert.doesNotMatch(JSON.stringify(result),/private provider error/);
  }
});
test('synthetic stage smoke covers the exact four fixed stages with six requests and validates normalized audio',async()=>{
  let calls=0;
  const result=await syntheticSmoke({apiKey,mode:'stages',fetchImpl:async(url,options)=>{
    calls++;const body=JSON.parse(options.body);
    if(body.model===GEMINI_MODELS.speech) {
      const wav=new wavefile.WaveFile();wav.fromScratch(1,24000,'16',Int16Array.from({length:24000},(_,i)=>Math.round(10000*Math.sin(i/4))));
      return Response.json({status:'completed',model:GEMINI_MODELS.speech,steps:[{type:'model_output',content:[{type:'audio',mime_type:'audio/wav',data:Buffer.from(wav.toBuffer()).toString('base64')}]}]});
    }
    const check=body.generationConfig.responseFormat.text.schema.properties.faithful;
    const text=JSON.stringify(check?{faithful:true,complete:true,languageCorrect:true,terminologyApplied:true,reasons:[]}
      :{title:'تعليمات',text:'الرف الأزرق والأصفر',question:'أين؟'});
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text}]}}]});
  }});
  assert.equal(calls,6);assert.equal(result.state,'passed');assert.equal(result.maxRequests,6);
  assert.deepEqual(result.results.map(row=>[row.stage,row.language]),[['translation','ar'],['translation','ur'],['speech','en'],['speech','ar']]);
  for(const row of result.results.filter(row=>row.stage==='speech')){assert.equal(row.bytes,32044);assert.equal(row.durationSeconds,1);}
  assert.equal(result.requests.every(row=>row.httpStatus===200&&row.state==='accepted'),true);
  assert.doesNotMatch(JSON.stringify(result),new RegExp(apiKey+'|تعليمات'));
});
test('synthetic assessment smoke validates positive and three conservative negative fixtures with exactly four requests',async()=>{
  let calls=0;const saved=[];
  const result=await syntheticSmoke({apiKey,mode:'assessment',persist:row=>saved.push(row),fetchImpl:async(_url,options)=>{
    const input=JSON.parse(JSON.parse(options.body).contents[0].parts[0].text),complete=calls++===0;
    const value={outcome:complete?'matched':'clarification',reasons:[complete?'asked_facts_present':'missing_asked_fact'],
      evidence:complete?input.askedFacts.map((_,factIndex)=>({factIndex,quote:input.answer})):[]};
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]});
  }});
  assert.equal(calls,4);assert.equal(result.state,'passed');assert.equal(result.maxRequests,4);
  assert.deepEqual(result.results.map(row=>row.caseId),['complete','incomplete','contradictory','instruction-injection']);
  assert.equal(result.results.every(row=>row.evidenceValidated),true);
  assert.doesNotMatch(JSON.stringify(saved),new RegExp(apiKey+'|blue shelf|Ignore the question|asked_facts_present'));
});
test('synthetic assessment smoke cannot call a failed positive check complete or continue after malformed evidence',async()=>{
  for(const value of [{outcome:'clarification',reasons:['missing_asked_fact'],evidence:[]},
    {outcome:'matched',reasons:[],evidence:[]},{outcome:'matched',reasons:['asked_facts_present'],evidence:[{factIndex:0,quote:'invented quote'}]}]) {
    let calls=0;const result=await syntheticSmoke({apiKey,mode:'assessment',fetchImpl:async()=>{calls++;return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]});}});
    assert.equal(calls,1);assert.equal(result.state,'failed');assert.equal(result.results.length,0);
  }
});
