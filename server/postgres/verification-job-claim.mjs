import {currentVerificationAuthority} from './verification-authority.mjs';
import {requireVerificationWorkers} from './verification-workers.mjs';

export async function currentVerificationClaim(client,{id,operationId,token}) {
  if(typeof token!=='string' || !/^[a-f0-9-]{36}$/i.test(token))throw Error('Verification claim unavailable');
  const row=(await client.query(`SELECT * FROM provider_verification_jobs WHERE request_id=$1 AND operation_id=$2
    AND status='processing' AND lease_token=$3 AND lease_until>clock_timestamp() FOR UPDATE`,[id,operationId,token])).rows[0];
  if(!row)throw Error('Verification claim unavailable');
  await currentVerificationAuthority(client,id);await requireVerificationWorkers(client,row.config_hash);return row;
}
