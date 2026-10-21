import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimePermissionArguments} from '../scripts/postgres-permissions.mjs';
import {sourceFenceArguments} from '../scripts/postgres-fence.mjs';

test('permission CLI selects an exact profile and requires stopped-writer/dedicated-database confirmation before configuration',()=>{
  assert.deepEqual(runtimePermissionArguments(['check','understood_web']),{mode:'check',role:'understood_web',profile:'application'});
  assert.deepEqual(runtimePermissionArguments(['check','understood_worker','--profile=worker']),{mode:'check',role:'understood_worker',profile:'worker'});
  assert.deepEqual(runtimePermissionArguments(['check','understood_operator','--profile=operator']),{mode:'check',role:'understood_operator',profile:'operator'});
  assert.deepEqual(runtimePermissionArguments(['configure','understood_worker','--writers-stopped','--profile=worker','--dedicated-database']),{mode:'configure',role:'understood_worker',profile:'worker'});
  for(const args of [[],['check'],['configure','understood_worker'],['configure','understood_worker','--writers-stopped'],
    ['configure','understood_worker','--dedicated-database','--dedicated-database'],['check','understood_worker','--writers-stopped'],
    ['check','understood_worker','--profile=maintenance'],['check','understood_worker','--profile=worker','--profile=worker'],
    ['check','understood_worker','--profile','worker'],['check','pg_shadow'],['check','worker;drop']])assert.throws(()=>runtimePermissionArguments(args));
});

test('source fence CLI binds worker profiles only to an explicit distinct role subset',()=>{
  assert.deepEqual(sourceFenceArguments(['check','understood_web,understood_worker']),{mode:'check',roles:['understood_web','understood_worker'],profiles:{}});
  assert.deepEqual(sourceFenceArguments(['seal','understood_web,understood_worker','--worker-roles=understood_worker','--writers-stopped']),
    {mode:'seal',roles:['understood_web','understood_worker'],profiles:{understood_worker:'worker'}});
  assert.deepEqual(sourceFenceArguments(['seal','understood_web,understood_worker,understood_operator','--worker-roles=understood_worker','--operator-roles=understood_operator','--writers-stopped']),
    {mode:'seal',roles:['understood_web','understood_worker','understood_operator'],profiles:{understood_worker:'worker',understood_operator:'operator'}});
  for(const args of [[],['seal','understood_web'],['seal','understood_web,understood_web','--writers-stopped'],
    ['seal','understood_web','--writers-stopped','--worker-roles=unknown'],['seal','understood_web','--writers-stopped','--worker-roles='],
    ['seal','understood_web','--writers-stopped','--worker-roles=understood_web,understood_web'],
    ['seal','understood_web','--writers-stopped','--worker-roles=understood_web','--worker-roles=understood_web'],
    ['seal','understood_worker','--worker-roles=understood_worker','--operator-roles=understood_worker','--writers-stopped'],
    ['seal','understood_operator','--operator-roles=unknown','--writers-stopped'],
    ['seal','understood_operator','--operator-roles=understood_operator','--operator-roles=understood_operator','--writers-stopped'],
    ['check','understood_operator','--operator-roles=understood_operator'],
    ['check','understood_worker','--worker-roles=understood_worker'],['seal','pg_shadow','--writers-stopped'],
    ['seal','understood_web,','--writers-stopped'],['seal','understood_web','--writers-stopped','--unexpected']])assert.throws(()=>sourceFenceArguments(args));
});
