import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {bundleHash} from '../server/ai/prepared-bundle.mjs';
import {preparationOperationEvidence,preparationStageProvenance,checkedPreparationOperation} from '../server/ai/preparation-provenance.mjs';

const provider={adapter:'gemini-bundle-v1',dataClass:'synthetic',textModel:'gemini-fixture-text',speechModel:'gemini-fixture-speech',voice:'Kore',promptVersion:'gemini-bundle-v1',schemaVersion:'gemini-generation-v2'};
const job={id:randomUUID(),org_id:'synthetic-org',site_id:'synthetic-site',briefing_id:randomUUID(),revision:1,token:randomUUID()};
const input={source:'Synthetic source',revision:1,languages:['en','ar'],review:null,glossary:{revision:0,terms:[],hash:bundleHash([])}};
const event={step:1,stage:'preparation',language:'en',track:null,state:'started',origin:'generated',errorCode:null};

test('preparation request fingerprints bind exact arguments, draft root, stage, scope, claim and provider choices without retaining content',()=>{
  const args=[input.source,{review:null}],original=preparationOperationEvidence(job,input,'prepare',args,event,provider);
  assert.equal(original.inputHash,bundleHash(original.preparationContext));assert.ok(Object.isFrozen(original.provenance));
  assert.ok(Object.isFrozen(original.preparationContext.languages));
  for(const patch of [{...job,id:randomUUID()},{...job,org_id:'another'},{...job,site_id:'another'},{...job,briefing_id:randomUUID()},{...job,token:randomUUID()}])
    assert.notEqual(preparationOperationEvidence(patch,input,'prepare',args,event,provider).inputHash,original.inputHash);
  for(const patch of [{...input,revision:2},{...input,languages:['en','ar','ur']},{...input,review:{question:'Different'}},{...input,glossary:{revision:1,terms:[],hash:bundleHash([])}}])
    assert.notEqual(preparationOperationEvidence(job,patch,'prepare',args,event,provider).inputHash,original.inputHash);
  assert.notEqual(preparationOperationEvidence(job,input,'prepare',[input.source,{review:{question:'Changed argument'}}],event,provider).inputHash,original.inputHash);
  assert.notEqual(preparationOperationEvidence(job,input,'prepare',args,{...event,step:2},provider).inputHash,original.inputHash);
  for(const key of ['textModel','speechModel','voice','promptVersion','schemaVersion'])assert.notEqual(preparationOperationEvidence(job,input,'prepare',args,event,{...provider,[key]:`${provider[key]}changed`}).inputHash,original.inputHash);
  assert.doesNotMatch(JSON.stringify(original),/Synthetic source|Changed argument|question|apiKey|review|glossary/);
});

test('stage-specific model/prompt evidence rejects mislabeled calls, stale stage metadata and real-data provenance',()=>{
  const speech={...event,stage:'speech',step:5,track:'body',language:'ar'};
  const proof=preparationOperationEvidence(job,input,'speech',['Synthetic Arabic fixture','ar'],speech,provider);
  assert.equal(proof.provenance.model,provider.speechModel);assert.equal(proof.provenance.promptVersion,'gemini-bundle-v1-speech');
  assert.equal(preparationStageProvenance(provider,'grounding_check').promptVersion,'gemini-bundle-v1-grounding-check');
  for(const mutate of [value=>{value.preparationContext.orgId='foreign';},value=>{value.preparationContext.argumentsHash='0'.repeat(64);},
    value=>{value.preparationContext.extra='forged';},value=>{value.provenance.model=provider.textModel;}]) {
    const value=structuredClone(proof);mutate(value);
    assert.throws(()=>checkedPreparationOperation(value.preparationContext,value.provenance,{orgId:job.org_id,referenceId:job.id,claimToken:job.token,model:provider.speechModel,inputHash:proof.inputHash}),/Invalid/);
  }
  assert.throws(()=>preparationOperationEvidence(job,input,'speech',['Synthetic','en'],speech,provider),/arguments changed/);
  assert.throws(()=>preparationOperationEvidence(job,input,'prepare',['Changed source'],event,provider),/arguments changed/);
  assert.throws(()=>preparationOperationEvidence(job,input,'prepare',[input.source],{...event,state:'completed'},provider),/stage unavailable/);
  assert.throws(()=>preparationOperationEvidence(job,input,'translate',[{},'ar'],event,provider),/stage unavailable/);
  assert.throws(()=>preparationStageProvenance({...provider,dataClass:'real'},'speech'),/unavailable/);
});
