import { createPostgresPool } from '../server/postgres/db.mjs';
import { verifyMigrations } from '../server/postgres/migrate.mjs';
import { provisionStaffCredential } from '../server/postgres/auth.mjs';
import { rehearsalConfig } from '../server/postgres/runtime.mjs';

async function main() {
  if (process.argv[2]!=='--rotate-staff') throw new Error('An explicit credential rotation argument is required');
  const config=rehearsalConfig();
  const input={staffId:process.env.UNDERSTOOD_REHEARSAL_STAFF_ID,orgId:process.env.UNDERSTOOD_REHEARSAL_ORG_ID,
    siteId:process.env.UNDERSTOOD_REHEARSAL_SITE_ID,email:process.env.UNDERSTOOD_REHEARSAL_EMAIL,password:process.env.UNDERSTOOD_REHEARSAL_PASSWORD};
  if (![input.staffId,input.orgId,input.siteId].every((value) => typeof value==='string' && value.length>0 && value.length<=100)
    || typeof input.password!=='string' || input.password.length<12) throw new Error('Scoped credential configuration is required');
  const pool=await createPostgresPool();
  try {
    await verifyMigrations(pool,{schema:config.schema});
    await provisionStaffCredential(pool,input,{schema:config.schema});
    console.log('Synthetic rehearsal staff credential rotated; prior sessions revoked.');
  } finally {delete process.env.UNDERSTOOD_REHEARSAL_PASSWORD;await pool.end();}
}

main().catch(() => {console.error('Rehearsal credential provisioning failed. No credential values or connection details are logged.');process.exitCode=1;});
