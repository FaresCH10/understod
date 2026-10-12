import {AUTH_GLOBAL_KEY,AUTH_GLOBAL_LIMIT,AUTH_KEY_LIMIT} from '../auth-budget.mjs';

// Short admission lock only; callers commit it before password derivation/account locks.
export async function consumeAuthBudget(client,keys,limit,{increment=true}={}) {
  const unique=[...new Set(keys)].sort();
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['understood:public-auth-budget:v1']);
  for(const key of unique) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`understood:auth:${key}`]);
  const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
  await client.query("DELETE FROM auth_attempts WHERE window_started_at<=$1::timestamptz-interval '15 minutes'",[now]);
  const rows=(await client.query('SELECT key_hash,count FROM auth_attempts WHERE key_hash=ANY($1::text[])',[[AUTH_GLOBAL_KEY,...unique]])).rows;
  const counts=new Map(rows.map(row=>[row.key_hash,row.count]));
  if((counts.get(AUTH_GLOBAL_KEY) ?? 0)>=AUTH_GLOBAL_LIMIT || unique.some(key=>(counts.get(key) ?? 0)>=limit)) return false;
  const missing=[AUTH_GLOBAL_KEY,...unique].filter(key=>!counts.has(key)).length;
  if((await client.query('SELECT COUNT(*)::int n FROM auth_attempts')).rows[0].n+missing>AUTH_KEY_LIMIT) return false;
  for(const key of [AUTH_GLOBAL_KEY,...unique]) await client.query(`INSERT INTO auth_attempts VALUES($1,$2,$3)
    ON CONFLICT(key_hash) DO UPDATE SET count=excluded.count`,[key,(counts.get(key) ?? 0)+(key===AUTH_GLOBAL_KEY || increment ? 1 : 0),now]);
  return true;
}
