import test from 'node:test';
import assert from 'node:assert/strict';
import {accountRecoveryToken} from '../src/account-recovery-link.ts';
test('reset links accept only a complete fragment token and reject query/path or appended input',()=>{
  const token='a'.repeat(43);assert.equal(accountRecoveryToken(`#reset-password/${token}`),token);
  for(const value of [`?token=${token}`,`/reset-password/${token}`,`#reset-password/${token}?next=evil`,`#reset-password/${token}/extra`,'#reset-password/bad','#worker-access/'+token]) assert.equal(accountRecoveryToken(value),'');
});
