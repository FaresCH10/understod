const updateGuardSha256='38eaa5c1a9d3cb4a626fd7179b25a333a64aab24145a31748e443718e5f8a54e';
const guardTables=['staff','staff_accounts','staff_credentials','staff_access_revisions'];

export async function inspectIdentityRuntimeGuards(client,schema) {
  const result=(await client.query(`WITH guard AS (
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname=$1 AND p.proname='restrict_identity_runtime_update' AND p.pronargs=0 AND p.prorettype='trigger'::regtype
      AND p.prokind='f' AND NOT p.prosecdef AND p.proconfig IS NULL AND l.lanname='plpgsql'
      AND encode(sha256(convert_to(replace(p.prosrc,chr(13)||chr(10),chr(10)),'UTF8')),'hex')=$2)
    SELECT (SELECT COUNT(*) FROM guard)=1 AND
      (SELECT COUNT(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
       JOIN guard g ON g.oid=t.tgfoid WHERE n.nspname=$1 AND c.relname=ANY($3::text[])
        AND t.tgname='identity_runtime_update' AND t.tgenabled='O' AND t.tgtype=19 AND NOT t.tgisinternal
        AND t.tgattr::text='' AND t.tgqual IS NULL AND t.tgnargs=0 AND octet_length(t.tgargs)=0)=4 AS valid`,
  [schema,updateGuardSha256,guardTables])).rows[0];
  if(!result?.valid)throw Error('Worker identity runtime guards do not match policy');
}
