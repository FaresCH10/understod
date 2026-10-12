import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const parameters = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
export const tokenHash = (value) => createHash('sha256').update(value).digest('hex');
export const normalizeEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';

export function credentialInput(email, password) {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254 ||
      typeof password !== 'string' || password.length < 12 || password.length > 256) throw new Error('Invalid credential input');
  return normalized;
}

export function passwordRecordSync(password) {
  const salt = randomBytes(16).toString('hex');
  return { salt, derived: scryptSync(password, Buffer.from(salt,'hex'),64,parameters).toString('hex') };
}

export async function passwordRecord(password) {
  const salt = randomBytes(16).toString('hex');
  return { salt, derived: (await scryptAsync(password,Buffer.from(salt,'hex'),64,parameters)).toString('hex') };
}

function comparisonInput(password, row) {
  const valid = typeof password === 'string' && password.length <= 256 &&
    /^[0-9a-f]{32}$/.test(row?.password_salt) && /^[0-9a-f]{128}$/.test(row?.password_hash);
  return { valid, password: typeof password === 'string' && password.length <= 256 ? password : '',
    salt: valid ? row.password_salt : '00'.repeat(16), expected: Buffer.from(valid ? row.password_hash : '00'.repeat(64),'hex') };
}

export function passwordMatchesSync(password, row) {
  const input = comparisonInput(password,row);
  const derived = scryptSync(input.password,Buffer.from(input.salt,'hex'),64,parameters);
  return input.valid && timingSafeEqual(derived,input.expected);
}

export async function passwordMatches(password, row) {
  const input = comparisonInput(password,row);
  const derived = await scryptAsync(input.password,Buffer.from(input.salt,'hex'),64,parameters);
  return input.valid && timingSafeEqual(derived,input.expected);
}
