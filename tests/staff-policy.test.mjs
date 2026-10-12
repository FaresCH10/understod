import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageStaff,staffDate,staffGreeting } from '../src/staff-policy.ts';

test('staff mutation affordances match owner/supervisor authority and reject unknown roles',() => {
  assert.equal(canManageStaff('owner'),true);assert.equal(canManageStaff('supervisor'),true);
  for(const role of ['auditor','worker','operator','administrator','OWNER','',undefined,null]) assert.equal(canManageStaff(role),false);
});

test('staff header uses the site civil date and an explicit UTC fallback for invalid timezone',() => {
  const instant=new Date('2026-10-04T22:30:00Z');
  assert.equal(staffDate('UTC',instant),'Sunday, 4 October 2026');
  assert.equal(staffDate('Asia/Beirut',instant),'Monday, 5 October 2026');
  assert.equal(staffDate('Invalid/Timezone',instant),'Sunday, 4 October 2026 (UTC)');
  assert.equal(staffGreeting('UTC',instant),'Good evening');
  const morning=new Date('2026-10-04T10:30:00Z');assert.equal(staffGreeting('UTC',morning),'Good morning');assert.equal(staffGreeting('Asia/Beirut',morning),'Good afternoon');
});
