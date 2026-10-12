import {randomUUID} from 'node:crypto';
import {bindPreparationAuthority} from './preparation-authority.mjs';
import {domainTransaction,requirePrincipal,requireActiveBriefing,domainAudit} from './domain.mjs';
import {reviewInput,sameReview,reviewRequestId} from '../briefing-input.mjs';
import {expiredBriefingContentMatches} from './briefing-retention.mjs';

export async function saveDraftReview(pool,session,id,input,{schema='public'}={}) {
  const content=reviewInput(input);
  return domainTransaction(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`understood:review:${schema}:${session.org_id}:${session.site_id}:${input.requestId}`]);
    const row=(await client.query('SELECT revision FROM briefings WHERE id=$1 AND org_id=$2 AND site_id=$3 FOR UPDATE',[id,session.org_id,session.site_id])).rows[0];
    if(!row) throw new Error('Briefing unavailable');
    const old=(await client.query('SELECT * FROM briefing_review_requests WHERE request_id=$1 AND org_id=$2 AND site_id=$3',[input.requestId,session.org_id,session.site_id])).rows[0];
    if(old) {
      if(old.briefing_id!==id || !(sameReview(old.request_json,content) || await expiredBriefingContentMatches(client,id,'briefing_review_requests',old.request_id,{request_json:content}))) throw new Error('Draft review request conflict');
      return {id,revision:old.accepted_revision,duplicate:true};
    }
    await requireActiveBriefing(client,session,id);
    if(row.revision!==content.revision) throw new Error('Draft revision changed');
    const revision=row.revision+1;
    await client.query("UPDATE jobs SET status='failed',lease_token=NULL,lease_until=NULL,error='Obsolete draft revision' WHERE briefing_id=$1 AND org_id=$2 AND site_id=$3 AND kind='prepare' AND status IN ('queued','processing')",[id,session.org_id,session.site_id]);
    await client.query("UPDATE briefings SET revision=$4,state='processing',prepared_json=NULL,updated_at=clock_timestamp() WHERE id=$1 AND org_id=$2 AND site_id=$3",[id,session.org_id,session.site_id,revision]);
    await client.query('INSERT INTO draft_reviews VALUES($1,$2,$3,$4) ON CONFLICT(briefing_id) DO UPDATE SET content_json=excluded.content_json',[id,session.org_id,session.site_id,JSON.stringify({...content,revision})]);
    const jobId=randomUUID();
    await client.query("INSERT INTO jobs(id,org_id,site_id,briefing_id,revision,kind,status,due_at) VALUES($1,$2,$3,$4,$5,'prepare','queued',clock_timestamp())",[jobId,session.org_id,session.site_id,id,revision]);
    await bindPreparationAuthority(client,session,jobId);
    await client.query('INSERT INTO briefing_review_requests(request_id,org_id,site_id,briefing_id,accepted_revision,request_json,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[input.requestId,session.org_id,session.site_id,id,revision,JSON.stringify(content),session.principal_id]);
    await domainAudit(client,session,'briefing.review_updated',id);
    return {id,revision,duplicate:false};
  });
}
export async function draftReviewReceipt(pool,session,requestId,{schema='public'}={}) {
  reviewRequestId(requestId);
  return domainTransaction(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff');
    const row=(await client.query(`SELECT r.briefing_id AS id,r.accepted_revision AS revision,r.request_json AS request,
      p.briefing_id IS NOT NULL AS "contentExpired" FROM briefing_review_requests r LEFT JOIN briefing_content_purges p ON p.briefing_id=r.briefing_id
      WHERE r.request_id=$1 AND r.org_id=$2 AND r.site_id=$3`,[requestId,session.org_id,session.site_id])).rows[0];
    if(!row)return {found:false};
    if(row.contentExpired){const {request,...receipt}=row;return {found:true,...receipt};}
    const {contentExpired,...receipt}=row;return {found:true,...receipt};
  });
}

// Verification is read-only: an expired receipt is matched against its retained hash,
// never by resubmitting the original review command or returning erased content.
export function verifyDraftReviewReceipt(pool,session,requestId,input,{schema='public'}={}) {
  reviewRequestId(requestId);
  const content=reviewInput({...input,requestId});
  return domainTransaction(pool,schema,async client=>{
    await requirePrincipal(client,session,'staff');
    const row=(await client.query('SELECT * FROM briefing_review_requests WHERE request_id=$1 AND org_id=$2 AND site_id=$3',[requestId,session.org_id,session.site_id])).rows[0];
    if(!row)return {found:false};
    if(!(sameReview(row.request_json,content) || await expiredBriefingContentMatches(client,row.briefing_id,'briefing_review_requests',requestId,{request_json:content})))throw Error('Draft review request conflict');
    return {found:true,id:row.briefing_id,revision:row.accepted_revision,matches:true};
  });
}
