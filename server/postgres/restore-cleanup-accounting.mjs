import {createHash,randomUUID} from 'node:crypto';
import {withTransaction,acquirePostgresClient} from './db.mjs';
import {backupTables,databaseInventory,privateObjectInventory} from './backup.mjs';
import {bundleHash} from '../ai/prepared-bundle.mjs';
import {restoreStateHash,validateRestoreReplayState,requireRestorePredecessor} from './restore-replay-state.mjs';

const stages={
  stagedRecording:['recordings'],recordingAudio:['recordings','recording_purges'],sourceAudio:['source_audio_requests','source_audio_purges'],
  attemptText:['text_retention_purges','attempts','assessment_jobs','report_exports'],recordingText:['text_retention_purges','recordings','report_exports'],
  activityIdentity:['activity_identity_purges'],
  briefingContent:['briefing_content_purges','briefing_content_origins','briefings','publications','draft_reviews','briefing_review_requests','briefing_regeneration_requests','generated_bundles','briefing_copies','source_audio_requests'],
  resolvedCaseText:['case_content_purges','clarifications','help_requests','case_messages','case_reviews','case_followups'],
  generatedRetirement:['generated_audio_retirements','generated_bundles'],generatedAudio:['generated_bundles','generated_audio_removals'],
  followupAudio:['case_followup_audio'],caseVoice:['case_voice'],exports:['report_exports'],imports:['worker_imports'],
  deletionRedaction:['directory_reactivations','attempts','help_requests','case_messages','case_reviews','case_repeats','case_followups','clarifications','worker_deletion_redactions'],
  deletionPseudonym:['worker_deletion_pseudonyms','workers','crew_memberships'],deletionCompletion:['worker_deletion_completions'],completionAudit:[],
};
const removalFamilies={stagedRecording:'recording',recordingAudio:'recording',sourceAudio:'source',generatedAudio:'generated',followupAudio:'case-followup',caseVoice:'case-voice'};
const same=(a,b)=>bundleHash(a)===bundleHash(b);
const projection=state=>({database:state.database,objects:state.objects});
const mutableColumns={
  recordings:['status','transcript','lease_token','lease_until','retry_at','error'],source_audio_requests:['title','lease_token','lease_until','retry_at'],
  attempts:['answer_text','reasons_json','evidence_json'],clarifications:['reason','notes'],help_requests:['text'],case_messages:['text'],case_reviews:['reason'],
  case_followups:['source_text','glossary_json','manifest_json','status','lease_token','lease_until','error_code'],
  workers:['code'],briefings:['title','source','prepared_json'],publications:['snapshot_json'],draft_reviews:['content_json'],
  briefing_review_requests:['request_json'],briefing_regeneration_requests:['baseline_review_json'],briefing_copies:['title'],
  generated_bundles:['state','cleanup_token','cleanup_until','manifest_json'],case_followup_audio:['state','cleanup_token','cleanup_until'],
  case_voice:['cleanup_state','cleanup_token','cleanup_until','cleanup_checked_at'],
  report_exports:['status','snapshot_json','csv','checksum','lease_token','lease_until','error'],
  worker_imports:['status','rows_json','errors_json','filename','filename_hash'],
};

async function immutableInputs(client,stage){
  const evidence=[];
  for(const table of stages[stage])if(mutableColumns[table]){
    const hash=createHash('sha256');let count=0;
    await client.query(`DECLARE understood_cleanup_inputs NO SCROLL CURSOR FOR SELECT (to_jsonb(t)-ARRAY[${mutableColumns[table].map(column=>`'${column}'`).join(',')}])::text AS payload
      FROM ${table} t ORDER BY (to_jsonb(t)-ARRAY[${mutableColumns[table].map(column=>`'${column}'`).join(',')}])::text COLLATE "C"`);
    try{for(;;){const rows=(await client.query('FETCH FORWARD 100 FROM understood_cleanup_inputs')).rows;if(!rows.length)break;
      for(const row of rows){hash.update(row.payload+'\n');count++;}}}finally{await client.query('CLOSE understood_cleanup_inputs');}
    evidence.push({table,count,sha256:hash.digest('hex')});
  }
  return evidence;
}

export function validCleanupAdmission(admission,{baseline,ledger,targetIdentitySha256}){
  return admission?.format==='understood-restore-cleanup-admission-v1' && admission.backupId===baseline.id
    && admission.targetIdentitySha256===targetIdentitySha256 && admission.ledgerId===ledger.id && admission.ledgerFingerprint===bundleHash(ledger)
    && admission.sourceInputsRepresented===true && admission.sourceConflicts===0 && admission.retainedBytesVerified===true
    && [admission.predecessorStateSha256,admission.sourceInputComparisonSha256].every(value=>typeof value==='string' && /^[a-f0-9]{64}$/.test(value));
}

async function lockState(client,schema){
  await client.query("SELECT set_config('search_path',quote_ident($1)||',pg_catalog,pg_temp',true)",[schema]);
  await client.query("SET LOCAL timezone='UTC'");await client.query("SET LOCAL lock_timeout='5s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`understood:migrations:${schema}`]);
  const tables=await backupTables(client,schema);
  await client.query(`LOCK TABLE ${tables.map(row=>row.identifier).join(',')} IN ACCESS EXCLUSIVE MODE`);
  return {database:await databaseInventory(client,schema),objects:await privateObjectInventory(client)};
}

function guardTransformation(before,after,stage){
  const writable=new Set([...stages[stage],'audit','operational_audit_receipts']);
  if(before.database.definitionsSha256!==after.database.definitionsSha256 || !same(before.database.sequences,after.database.sequences)
    || before.database.tables.length!==after.database.tables.length || before.database.tables.some((row,i)=>row.name!==after.database.tables[i]?.name
      || !writable.has(row.name) && !same(row,after.database.tables[i])))throw Error('Cleanup changed an unaccounted database surface');
  if(before.objects.length!==after.objects.length || before.objects.some((row,i)=>{
    const {retained,...identity}=row,{retained:nextRetained,...nextIdentity}=after.objects[i]??{};
    return !same(identity,nextIdentity) || retained!==nextRetained && (retained!==true || nextRetained!==false);
  }))throw Error('Cleanup changed an unaccounted private reference');
}

export async function requireCleanupPredecessor(client,state,before,baseline,{storage}={}){
  if(state.format!=='understood-restore-cleanup-state-v1')return requireRestorePredecessor(client,state,before,baseline);
  if(!same(projection(state),before))throw Error('Cleanup target differs from authenticated predecessor state');
  if(state.kind==='database'){
    const sites=(await client.query('SELECT id,org_id FROM sites')).rows;
    const rows=(await client.query(`SELECT org_id,site_id FROM operational_audit_receipts WHERE action='backup.restore.cleanup.transition'
      AND actor_type='system' AND actor_id='restore-operator' AND object_id=$1`,[`${baseline.id}:${state.transitionId}:${state.stage}`])).rows;
    if(!sites.length || rows.length!==sites.length || sites.some(site=>!rows.some(row=>row.site_id===site.id && row.org_id===site.org_id)))
      throw Error('Cleanup checkpoint has no complete committed audit receipt');
  }
  if(storage)for(const object of state.removedObjects){
    const reference=before.objects.find(row=>row.id===object.id);
    if(!reference || reference.retained || !same(reference,object)
      || await (object.format==='original'?storage.existsOriginal(object):storage.exists(object))!==false)
      throw Error('Previously accounted private absence is no longer verified');
  }
}

export async function inspectRestoreCleanupPredecessor({pool,storage,baseline,predecessor,targetIdentitySha256,requireQuarantine}){
  validateRestoreReplayState(predecessor,{baseline,targetIdentitySha256});
  return withTransaction(pool,async client=>{const before=await lockState(client,baseline.schema);
    await requireQuarantine(client,baseline.id);await requireCleanupPredecessor(client,predecessor,before,baseline,{storage});});
}

export async function createRestoreCleanupAccounting({pool,storage,baseline,ledger,predecessor,targetIdentitySha256,persist,requireQuarantine,admission}){
  validateRestoreReplayState(predecessor,{baseline,targetIdentitySha256});
  if(typeof persist!=='function' || typeof requireQuarantine!=='function')throw Error('Cleanup accounting persistence unavailable');
  const rootAdmission=admission??predecessor.admission;
  if(rootAdmission && !validCleanupAdmission(rootAdmission,{baseline,ledger,targetIdentitySha256}))throw Error('Cleanup admission ledger binding unavailable');
  let head=predecessor,stage=null,poisoned=false,active=0,events=0;
  const healthy=()=>{if(poisoned)throw Error('Cleanup accounting stopped after an uncertain transition');};
  const validate=async(client,before)=>{healthy();await requireQuarantine(client,baseline.id);await requireCleanupPredecessor(client,head,before,baseline,{storage});};
  const checkpoint=async(client,after,kind,transitionId)=>({format:'understood-restore-cleanup-state-v1',backupId:baseline.id,targetIdentitySha256,
    capturedAt:new Date((await client.query('SELECT clock_timestamp() AS now')).rows[0].now).toISOString(),predecessorStateSha256:restoreStateHash(head),
    ledgerId:ledger.id,ledgerFingerprint:bundleHash(ledger),stage,kind,transitionId,...after,
    removedObjects:head.removedObjects??[],immutableInputsVerified:true,...(rootAdmission?{admission:rootAdmission}:{}),activationAllowed:false,productionReady:false});
  const save=async(kind,value)=>{
    if(Buffer.byteLength(JSON.stringify(value))>16*1024*1024)throw Error('Cleanup checkpoint exceeds evidence bound');
    if(kind==='state')validateRestoreReplayState(value,{baseline,targetIdentitySha256});
    await persist({sequence:++events,kind,value});
  };
  await withTransaction(pool,async client=>{const before=await lockState(client,baseline.schema);await validate(client,before);});
  await save('run',{format:'understood-restore-cleanup-run-v1',backupId:baseline.id,targetIdentitySha256,ledgerId:ledger.id,
    ledgerFingerprint:bundleHash(ledger),predecessor,activationAllowed:false,productionReady:false});

  const accountedPool={async connect(){healthy();if(!stage || active)throw Error('Cleanup accounting requires serial scoped transactions');
    const client=await acquirePostgresClient(pool);let begun=false,before,inputs;
    return {async query(sql,args){
      if(sql==='ROLLBACK'){try{return await client.query(sql,args);}finally{if(begun){active--;begun=false;}}}
      healthy();
      if(sql==='BEGIN'){
        const result=await client.query(sql,args);begun=true;active++;
        try{before=await lockState(client,baseline.schema);await validate(client,before);inputs=await immutableInputs(client,stage);return result;}
        catch(error){poisoned=true;try{await client.query('ROLLBACK');}finally{active--;begun=false;}throw error;}
      }
      if(!begun)throw Error('Cleanup query outside accounted transaction');
      if(sql!=='COMMIT')return client.query(sql,args);
      try{
        await client.query('SET CONSTRAINTS ALL IMMEDIATE');
        let after={database:await databaseInventory(client,baseline.schema),objects:await privateObjectInventory(client)};
        guardTransformation(before,after,stage);await requireQuarantine(client,baseline.id);
        if(!same(inputs,await immutableInputs(client,stage)))throw Error('Cleanup changed immutable accepted input or outcome');
        if(same(before,after)){const result=await client.query('COMMIT');active--;begun=false;return result;}
        const transitionId=randomUUID();
        for(const site of (await client.query('SELECT id,org_id FROM sites ORDER BY id')).rows)await client.query(`INSERT INTO audit(id,org_id,site_id,actor_type,actor_id,action,object_id)
          VALUES($1,$2,$3,'system','restore-operator','backup.restore.cleanup.transition',$4)`,
          [randomUUID(),site.org_id,site.id,`${baseline.id}:${transitionId}:${stage}`]);
        await client.query('SET CONSTRAINTS ALL IMMEDIATE');
        after={database:await databaseInventory(client,baseline.schema),objects:await privateObjectInventory(client)};
        guardTransformation(before,after,stage);await requireQuarantine(client,baseline.id);
        if(!same(inputs,await immutableInputs(client,stage)))throw Error('Cleanup audit changed immutable accepted input or outcome');
        const state=await checkpoint(client,after,'database',transitionId);await save('state',state);
        const result=await client.query('COMMIT');active--;begun=false;head=state;
        await save('ack',{format:'understood-restore-cleanup-ack-v1',backupId:baseline.id,transitionId,stateSha256:restoreStateHash(state),activationAllowed:false,productionReady:false});
        return result;
      }catch(error){poisoned=true;throw error;}
    },release(error){if(begun)poisoned=true;client.release(error);}};
  }};
  const remove=async(original,row)=>{
    healthy();if(active || !removalFamilies[stage] || original && stage!=='sourceAudio')throw Error('Removal outside an accounted cleanup boundary');
    try{return await withTransaction(pool,async client=>{
      const before=await lockState(client,baseline.schema);await validate(client,before);
      const family=original?'source-original':removalFamilies[stage];
      const reference=before.objects.find(item=>item.id===row.id && item.family===family);
      if(!reference || reference.retained || ['org_id','site_id','sha256','bytes'].some(key=>reference[key]!==row[key]))throw Error('Private removal lacks an exact retired reference');
      const exists=original?storage.existsOriginal.bind(storage):storage.exists.bind(storage);
      const present=await exists(reference);if(typeof present!=='boolean')throw Error('Private absence observation unavailable');
      const transitionId=randomUUID(),intent={format:'understood-restore-cleanup-removal-intent-v1',backupId:baseline.id,targetIdentitySha256,
        ledgerId:ledger.id,ledgerFingerprint:bundleHash(ledger),stage,transitionId,reference,present,predecessor:head,activationAllowed:false,productionReady:false};
      await save('removal-intent',intent);
      if(present)await (original?storage.removeOriginal(row):storage.remove(row));
      if(await exists(reference)!==false)throw Error('Accounted removal absence is not verified');
      const after={database:await databaseInventory(client,baseline.schema),objects:await privateObjectInventory(client)};
      if(!same(before,after))throw Error('Database changed during private removal');
      const state=await checkpoint(client,after,'removal',transitionId);
      state.removedObjects=[...(head.removedObjects??[]).filter(item=>item.id!==reference.id),reference].sort((a,b)=>a.id.localeCompare(b.id));
      await save('state',state);head=state;return undefined;
    });}catch(error){poisoned=true;throw error;}
  };
  const accountedStorage=new Proxy(storage,{get(target,key){
    if(key==='remove')return row=>remove(false,row);if(key==='removeOriginal')return row=>remove(true,row);
    if(['save','saveOriginal','restore','restoreOriginal'].includes(key))return ()=>{throw Error('Cleanup cannot write private objects');};
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  return {async run(name,task){healthy();if(stage || !stages[name])throw Error('Invalid or overlapping cleanup stage');stage=name;
    try{return await task(accountedPool,accountedStorage);}finally{stage=null;}},
    assertHealthy:healthy,get state(){return head;},get events(){return events;},
    async verify(){await withTransaction(pool,async client=>{const before=await lockState(client,baseline.schema);await validate(client,before);});return head;}};
}
