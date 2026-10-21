export const caseWorkflowUpdates=Object.freeze({case_reviews:Object.freeze(['reason']),case_repeats:Object.freeze(['status']),
  case_voice:Object.freeze(['status','lease_token','lease_until','cleanup_state','cleanup_token','cleanup_until','cleanup_checked_at'])});

// Pin the existing evidence/retirement guards as well as the cleanup-column ACLs.
const guards=Object.freeze([
  ['case_reviews','case_review_guard','guard_case_review','0018e5c7482ad035f6220528b827d76e89708b45c1b9c445175c12b2a83d91c9'],
  ['case_repeats','case_repeat_guard','guard_case_repeat','2c97163dd4aa4e0aa8670afce4e18f3c7494f34aeb6ac41471d70176339c432c'],
  ['case_voice','case_voice_guard','guard_case_voice','d5447010e1dcbc8a6c13cceef8c814bf85482f4a59db26d085751479dcd3632e'],
]);
export async function inspectCaseWorkflowRuntimeGuards(client,schema){
  for(const [table,trigger,name,sha256] of guards){
    const row=(await client.query(`WITH guard AS (
      SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
      WHERE n.nspname=$1 AND p.proname=$4 AND p.pronargs=0 AND p.prorettype='trigger'::regtype
        AND p.prokind='f' AND NOT p.prosecdef AND p.proconfig IS NULL AND l.lanname='plpgsql'
        AND encode(sha256(convert_to(replace(p.prosrc,chr(13)||chr(10),chr(10)),'UTF8')),'hex')=$5)
      SELECT (SELECT count(*) FROM guard)=1 AND
        (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
         JOIN guard g ON g.oid=t.tgfoid WHERE n.nspname=$1 AND c.relname=$2 AND t.tgname=$3
          AND t.tgenabled='O' AND t.tgtype=31 AND NOT t.tgisinternal AND t.tgattr::text=''
          AND t.tgqual IS NULL AND t.tgnargs=0 AND octet_length(t.tgargs)=0)=1 AS valid`,[schema,table,trigger,name,sha256])).rows[0];
    if(!row?.valid)throw Error('Worker case workflow guards do not match policy');
  }
}
