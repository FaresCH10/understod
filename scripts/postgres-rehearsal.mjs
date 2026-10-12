import { createPostgresPool } from '../server/postgres/db.mjs';
import { verifyMigrations } from '../server/postgres/migrate.mjs';
import { rehearsalConfig,startRehearsalApi,runRehearsalWorker } from '../server/postgres/runtime.mjs';
import { localAudioStore } from '../server/private-storage.mjs';
import {readPreparationFingerprint} from '../server/postgres/preparation-fingerprint.mjs';
import {readAssessmentFingerprint} from '../server/postgres/assessment-fingerprint.mjs';

async function main() {
  const mode=process.argv[2];
  if (!['api','worker','check','fingerprint','assessment-fingerprint'].includes(mode)) throw new Error('Use postgres-rehearsal.mjs api, worker, check, fingerprint or assessment-fingerprint');
  const config=rehearsalConfig(),pool=await createPostgresPool(),storage=localAudioStore(config.audioRoot);
  const stop=new AbortController();
  let server=null;
  const shutdown=() => stop.abort();
  process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
  try {
    if (mode==='api') {
      server=await startRehearsalApi(pool,storage,config);
      console.log(`Synthetic credential PostgreSQL rehearsal API: http://127.0.0.1:${config.port}`);
      if (!stop.signal.aborted) await new Promise((done) => stop.signal.addEventListener('abort',done,{once:true}));
    } else {
      const verified=await verifyMigrations(pool,{schema:config.schema});
      if (mode==='check') {console.log(`Synthetic rehearsal schema verified (${verified.migrations} migrations).`);return;}
      if(mode==='fingerprint') {
        const result=await readPreparationFingerprint(pool,{orgId:process.env.UNDERSTOOD_REHEARSAL_ORG_ID,siteId:process.env.UNDERSTOOD_REHEARSAL_SITE_ID,
          briefingId:process.env.UNDERSTOOD_REHEARSAL_BRIEFING_ID,confirmedSynthetic:process.env.UNDERSTOOD_FINGERPRINT_SYNTHETIC==='true'},config);
        console.log(JSON.stringify(result));return;
      }
      if(mode==='assessment-fingerprint') {
        const result=await readAssessmentFingerprint(pool,{orgId:process.env.UNDERSTOOD_REHEARSAL_ORG_ID,siteId:process.env.UNDERSTOOD_REHEARSAL_SITE_ID,
          attemptId:process.env.UNDERSTOOD_REHEARSAL_ATTEMPT_ID,confirmedSynthetic:process.env.UNDERSTOOD_FINGERPRINT_SYNTHETIC==='true'},config);
        console.log(JSON.stringify(result));return;
      }
      console.log('Synthetic PostgreSQL rehearsal worker started. Source transcription remains disabled unless explicitly configured for allowlisted synthetic audio.');
      await runRehearsalWorker(pool,storage,config,{signal:stop.signal,onError:(stage) => console.error(`Rehearsal stage failed: ${stage}`)});
    }
  } finally {
    process.off('SIGINT',shutdown);process.off('SIGTERM',shutdown);
    if (server) {
      const timer=setTimeout(() => server.closeAllConnections(),30000);timer.unref();
      try {await new Promise((done) => server.close(done));} finally {clearTimeout(timer);}
    }
    await pool.end();
  }
}

main().catch(() => {console.error('PostgreSQL rehearsal startup/run failed. Check isolated schema, credentials, TLS and configuration; connection details are not logged.');process.exitCode=1;});
