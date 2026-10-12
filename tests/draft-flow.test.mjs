import test from 'node:test';
import assert from 'node:assert/strict';
import {draftSteps} from '../src/draft-flow.ts';

test('draft steps describe stored readiness, not approval or completed publication',()=>{
  assert.deepEqual(draftSteps(null).map(step=>step.available),[true,false,false,false]);
  const source='Synthetic source',draft={id:'draft',source,state:'draft',prepared:null};
  assert.deepEqual(draftSteps(draft).map(step=>step.available),[true,true,true,false]);
  for(const state of ['draft','processing','failed','unknown'])assert.equal(draftSteps({...draft,state,prepared:{source}})[3].available,false);
  const ready=draftSteps({...draft,state:'ready',prepared:{source}});
  assert.equal(ready[3].available,true);assert.equal(ready[3].status,'Ready to publish');
  assert.equal(ready[1].status,'Ready');assert.equal(ready[2].status,'Available');
});
test('stale, missing, archived and expired preparation never enable publishing',()=>{
  const ready={id:'draft',source:'Synthetic source',state:'ready',prepared:{source:'Synthetic source'}};
  for(const change of [{prepared:null},{prepared:{source:'Old source'}},{source:''},{id:undefined},{archive:{reason:'Archived'}},{contentExpired:true}])assert.equal(draftSteps({...ready,...change})[3].available,false);
  for(const change of [{archive:true},{contentExpired:true}])assert.equal(draftSteps({...ready,...change}).some(step=>step.available),false);
  assert.equal(draftSteps({...ready,state:'failed'})[1].status,'Failed');
  assert.equal(draftSteps({...ready,state:'processing'})[1].status,'Processing');
});
