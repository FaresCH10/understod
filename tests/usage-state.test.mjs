import test from 'node:test';
import assert from 'node:assert/strict';
import {usageModel} from '../server/usage.mjs';
import {checkedUsageModel,checkedProviderAllowance} from '../src/usage-state.ts';

const allowance={day:'2026-10-14',timezone:'UTC',resetsAt:'2026-10-15T00:00:00.000Z',state:'closed',reason:'quota_closed',limit:0,reserved:0,remaining:0,requests:{started:0,accepted:0,rejected:0,uncertain:0},jobsPaused:false,providerPaused:false,dataClass:'synthetic',billingVerified:false};
test('usage metadata validates real synthetic model shape without inventing entitlements, costs or quota authority',()=>{
  const row=usageModel({mode:'synthetic-demo',metrics:{assigned:30,responses:24,matches:21,clarifications:3,pending:6},latestPublication:{id:'shelf-v3',version:3,state:'published'}});
  assert.deepEqual(checkedUsageModel(row,'synthetic-demo','owner'),row);assert.deepEqual(checkedUsageModel(usageModel(),'synthetic-demo','auditor').units.map(unit=>unit.used),[0,0,0,0,0]);
  for(const raw of [{...row,mode:'live'},{...row,plan:{...row.plan,state:'paid'}},{...row,spend:{...row.spend,actual:{...row.spend.actual,amount:25}}},{...row,units:[...row.units.slice(0,4),{...row.units[4],percent:99}]},{...row,units:row.units.map((unit,i)=>i===1?{...unit,used:-1}:unit)},{...row,publication:{...row.publication,id:'foreign',privateActor:'not permitted'}},{...row,privateProviderKey:'not permitted'}])assert.throws(()=>checkedUsageModel(raw,'synthetic-demo','owner'));
  assert.throws(()=>checkedUsageModel(row,'synthetic-credential','owner'));
});

test('organization allowance is UTC, scoped and non-billing evidence even when admission is available',()=>{
  assert.deepEqual(checkedProviderAllowance(allowance),allowance);
  const available={...allowance,limit:10,remaining:10,state:'available',reason:'available'};assert.deepEqual(checkedProviderAllowance(available),available);
  const row={...usageModel({mode:'synthetic-credential',providerAllowance:available}),changeRequestsAvailable:true};
  assert.deepEqual(checkedUsageModel(row,'synthetic-credential','administrator'),row);
  assert.throws(()=>checkedUsageModel(row,'synthetic-credential','auditor'));
  assert.deepEqual(checkedUsageModel({...row,changeRequestsAvailable:false},'synthetic-credential','auditor').providerAllowance,available);
  for(const raw of [{...allowance,timezone:'Asia/Beirut'},{...allowance,day:'2026-02-30'},{...allowance,resetsAt:'2026-10-16T00:00:00.000Z'},{...allowance,reserved:-1},{...available,remaining:9},{...allowance,requests:{...allowance.requests,privateOrgCount:1}},{...allowance,reason:'ready_for_real_data'},{...allowance,billingVerified:true},{...allowance,dataClass:'real'},{...allowance,globalUsage:999}])assert.throws(()=>checkedProviderAllowance(raw));
});
