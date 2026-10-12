import { readFileSync } from 'node:fs';

export async function createPostgresPool({ connectionString = process.env.UNDERSTOOD_POSTGRES_URL,
  tls = process.env.UNDERSTOOD_POSTGRES_TLS === 'true', caFile = process.env.UNDERSTOOD_POSTGRES_CA_FILE } = {}) {
  if (!connectionString) throw new Error('UNDERSTOOD_POSTGRES_URL is required');
  let url;
  try { url = new URL(connectionString); } catch { throw new Error('Invalid PostgreSQL connection URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new Error('Invalid PostgreSQL connection URL');
  if (['sslmode', 'sslcert', 'sslkey', 'sslrootcert'].some((key) => url.searchParams.has(key))) {
    throw new Error('Configure PostgreSQL TLS outside the connection URL');
  }
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  if (!local && !tls) throw new Error('TLS is required for a nonlocal PostgreSQL connection');
  const module = await import('pg');
  const Pool = module.Pool ?? module.default.Pool;
  return new Pool({
    connectionString,
    ssl: tls ? { rejectUnauthorized: true, ...(caFile ? { ca: readFileSync(caFile, 'utf8') } : {}) } : false,
    max: 8,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
  });
}

export async function withTransaction(pool, fn) {
  const client = await pool.connect();
  let begun = false;
  try {
    await client.query('BEGIN');
    begun = true;
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (begun) {
      try { await client.query('ROLLBACK'); } catch (rollbackError) { error.cause = rollbackError; }
    }
    throw error;
  } finally {
    client.release();
  }
}
