import { domainTransaction, requirePrincipal } from './domain.mjs';
import { responseRead } from './responses.mjs';
import { languageReadinessModel } from '../language-readiness.mjs';
import {readGenerationLanguages} from './settings.mjs';
import {readProviderStageTests} from './provider-controls.mjs';

async function latestPublication(client, session) {
  const row = (await client.query(`SELECT id,version,state,snapshot_json FROM publications
    WHERE org_id=$1 AND site_id=$2 AND state='published' ORDER BY published_at DESC,id LIMIT 1`, [session.org_id, session.site_id])).rows[0];
  if (!row) return null;
  return { id: row.id, version: row.version, state: row.state, snapshot: row.snapshot_json };
}

function parseSnapshot(publication) {
  if (!publication) return null;
  try { return { ...publication, snapshot: typeof publication.snapshot === 'string' ? JSON.parse(publication.snapshot) : publication.snapshot }; }
  catch { return { ...publication, snapshot: null }; }
}

export function getLanguageReadiness(pool, session, { schema = 'public',pipeline,providerVerification } = {}) {
  return responseRead(pool, schema, async (client) => {
    await requirePrincipal(client, session, 'staff', ['owner', 'administrator', 'supervisor', 'auditor']);
    const publication = parseSnapshot(await latestPublication(client, session));
    return languageReadinessModel({ mode: 'synthetic-credential', publication,pipeline,stageTests:await readProviderStageTests(client,providerVerification),generationDefaults:await readGenerationLanguages(client,session.org_id,session.site_id) });
  });
}

export function runLanguageReadiness(pool, session, input = {}, { schema = 'public',pipeline,providerVerification } = {}) {
  if (!input || typeof input !== 'object' || Object.keys(input).length) throw new Error('Invalid language readiness request');
  return domainTransaction(pool, schema, async (client) => {
    await requirePrincipal(client, session, 'staff', ['owner', 'administrator', 'supervisor']);
    const publication = parseSnapshot(await latestPublication(client, session));
    return languageReadinessModel({ mode: 'synthetic-credential', publication,pipeline,stageTests:await readProviderStageTests(client,providerVerification), testedAt: new Date().toISOString(),generationDefaults:await readGenerationLanguages(client,session.org_id,session.site_id) });
  });
}
