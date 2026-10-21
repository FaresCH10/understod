const guards=[
  {table_name:'provider_verification_workers',trigger_name:'verification_worker_frozen',trigger_type:31,func:'protect_verification_worker',sha256:'41378666ab0d9592e6a8cb8f90465ed551af1e420512cfb89466951bd95f3bc1'},
  {table_name:'provider_verification_authorities',trigger_name:'verification_authority_frozen',trigger_type:27,func:'protect_verification_authority',sha256:'a98e0cfbd07a438a71d02ccc416fd5701e15ee84fbc78057f18f4e25c308a4b7'},
  {table_name:'provider_verifications',trigger_name:'verification_authority_capture',trigger_type:21,func:'capture_verification_authority',sha256:'e6f57a6da52d19e8f1e4eb006a67c8cc67641fa7d1e249619c4713dab8086e2a'},
  {table_name:'operator_sessions',trigger_name:'verification_authority_session',trigger_type:25,func:'revoke_verification_authority',sha256:'8aa5e22d93e0b2998034e5839dde82866cf426ce533492ae429da90b84b4c121'},
  {table_name:'platform_operators',trigger_name:'verification_authority_operator',trigger_type:17,func:'revoke_verification_authority',sha256:'8aa5e22d93e0b2998034e5839dde82866cf426ce533492ae429da90b84b4c121'},
  {table_name:'provider_operations',trigger_name:'verification_reservation_scope',trigger_type:7,func:'restrict_verification_reservation',sha256:'ddcb236ca2bc35d944d5c69a1e20e6ecfe2967f239e3df1cc0efd43580870d54'},
  {table_name:'provider_verifications',trigger_name:'verification_approval_scope',trigger_type:7,func:'restrict_verification_approval',sha256:'7c538dd9bdd019b1a26fc1140194ca8d4544079c3f67e2b7865c732e52643928'},
  {table_name:'provider_verification_jobs',trigger_name:'verification_job_frozen',trigger_type:31,func:'protect_verification_job',sha256:'cc9cf72b52917c014c8d8853198e7272d71fae3253c8e493fe1834753c597c19'},
  {table_name:'provider_verification_authorities',trigger_name:'verification_authority_insert_scope',trigger_type:7,func:'restrict_verification_approval',sha256:'7c538dd9bdd019b1a26fc1140194ca8d4544079c3f67e2b7865c732e52643928'},
];
export async function inspectVerificationAuthorityGuards(client,schema) {
  const result=(await client.query(`SELECT NOT EXISTS(
    SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS e(table_name text,trigger_name text,trigger_type integer,func text,sha256 text)
    WHERE NOT EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_language l ON l.oid=p.prolang
      WHERE n.nspname=$1 AND c.relname=e.table_name AND t.tgname=e.trigger_name AND t.tgtype=e.trigger_type
        AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgattr::text='' AND t.tgqual IS NULL AND t.tgnargs=0 AND octet_length(t.tgargs)=0
        AND p.pronamespace=n.oid AND p.proname=e.func AND p.pronargs=0 AND p.prorettype='trigger'::regtype
        AND p.prokind='f' AND NOT p.prosecdef AND p.proconfig IS NULL AND l.lanname='plpgsql'
        AND encode(sha256(convert_to(replace(p.prosrc,chr(13)||chr(10),chr(10)),'UTF8')),'hex')=e.sha256)) AS valid`,[schema,JSON.stringify(guards)])).rows[0];
  if(result?.valid!==true)throw Error('Provider verification authority guards do not match policy');
}

export async function currentVerificationAuthority(client,requestId) {
  if(typeof requestId!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId))throw Error('Invalid verification request');
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema()||':verification-authority',0))");
  const row=(await client.query(`SELECT NOT revoked AND expires_at>clock_timestamp()
    AND NOT EXISTS(SELECT 1 FROM provider_verification_jobs j WHERE j.request_id=$1 AND j.status NOT IN ('queued','processing')) AS active
    FROM provider_verification_authorities WHERE request_id=$1`,[requestId])).rows[0];
  if(row?.active!==true)throw Error('Provider verification authority changed');
}
