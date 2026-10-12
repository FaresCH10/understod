import {normalizeEmail,credentialInput,tokenHash} from './auth-crypto.mjs';
import {inputKeys} from './people.mjs';

export function recoveryRequestInput(input,remoteAddress) {
  inputKeys(input,['email']);const email=normalizeEmail(input.email);
  if(typeof input.email!=='string' || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || typeof remoteAddress!=='string' || remoteAddress.length>128) throw new Error('Invalid recovery input');
  return email;
}

export function recoveryResetInput(input,remoteAddress) {
  inputKeys(input,['token','password','confirmation']);
  if(typeof input.token!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(input.token) || typeof input.password!=='string'
    || input.password!==input.confirmation || typeof remoteAddress!=='string' || remoteAddress.length>128)
    throw new Error('Invalid recovery link or input');
  credentialInput('validation@example.test',input.password);
}

export const recoveryFingerprint=row=>tokenHash(`${row.password_hash}:${row.role}:${row.access_revision}:${row.account_revision}`);
