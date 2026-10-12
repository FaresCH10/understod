import {withTransaction} from './db.mjs';
import {schemaName} from './migrate.mjs';
import {assessmentInput} from './assessment-claim.mjs';
import {assessmentInputHash} from '../ai/assessment-config.mjs';

export function readAssessmentFingerprint(pool,{orgId,siteId,attemptId,confirmedSynthetic},{schema='public'}={}) {
  if(confirmedSynthetic!==true || ![orgId,siteId,attemptId].every(value=>typeof value==='string' && /^[A-Za-z0-9_-]{1,100}$/.test(value)))throw Error('Confirm a known synthetic scoped answer');
  schemaName(schema);
  return withTransaction(pool,async client=>{
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    await client.query("SELECT set_config('search_path',quote_ident($1)||',pg_catalog',true),set_config('lock_timeout','5s',true),set_config('statement_timeout','10s',true)",[schema]);
    const row=(await client.query(`SELECT t.answer_text,a.language,a.publication_id,p.version,p.snapshot_json FROM attempts t
      JOIN assignments a ON a.id=t.assignment_id AND a.org_id=t.org_id AND a.site_id=t.site_id
      JOIN publications p ON p.id=a.publication_id AND p.org_id=a.org_id AND p.site_id=a.site_id
      WHERE t.id=$1 AND t.org_id=$2 AND t.site_id=$3 AND t.assessment_status='pending'`,[attemptId,orgId,siteId])).rows[0];
    const input=assessmentInput(row);
    return {version:input.version,language:input.language,fingerprint:assessmentInputHash(input)};
  });
}
