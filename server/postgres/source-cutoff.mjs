import {createHash} from 'node:crypto';
import {withPrivacyLedgerSnapshot,privacyLedgerFingerprint} from './privacy-ledger.mjs';
import {compareRestoreInputs} from './restore-input-lifecycle.mjs';
import {compareSourceSnapshot} from './source-inventory.mjs';
import {inspectSourceRuntimeFence} from './runtime-permissions.mjs';
export {compareSourceSnapshot,validateDatabaseInventory} from './source-inventory.mjs';

export async function inspectSourceCutoff(pool,baseline,storage,options={}){
  if(!['read','readOriginal','exists','existsOriginal'].every(name=>typeof storage?.[name]==='function'))throw Error('Complete private source verification unavailable');
  return withPrivacyLedgerSnapshot(pool,baseline,options,async(ledger,client)=>{
    const runtimeRoles=options.runtimeRoles;
    if(runtimeRoles!==undefined)await inspectSourceRuntimeFence(client,{schema:ledger.schema,roles:runtimeRoles});
    const coverage=compareSourceSnapshot(baseline,ledger),input=compareRestoreInputs(ledger.tables,ledger.tables,ledger.objects,ledger.objects);
    let retained=0,retired=0,unverifiedRetained=0,unverifiedRetired=0;
    for(const reference of ledger.objects){
      if(reference.retained){
        retained++;
        try{
          const bytes=await (reference.format==='original'?storage.readOriginal(reference):storage.read(reference));
          if(bytes.length!==reference.bytes || createHash('sha256').update(bytes).digest('hex')!==reference.sha256)unverifiedRetained++;
        }catch{unverifiedRetained++;}
      }else{
        retired++;
        try{if(await (reference.format==='original'?storage.existsOriginal(reference):storage.exists(reference))!==false)unverifiedRetired++;}
        catch{unverifiedRetired++;}
      }
    }
    if(runtimeRoles!==undefined)await inspectSourceRuntimeFence(client,{schema:ledger.schema,roles:runtimeRoles});
    const verifiedAt=new Date((await client.query('SELECT clock_timestamp() AS now')).rows[0].now).toISOString();
    const report={format:'understood-source-cutoff-observation-v1',backupId:baseline.id,ledgerId:ledger.id,ledgerFingerprint:privacyLedgerFingerprint(ledger),
      sourceIdentitySha256:ledger.sourceIdentitySha256,capturedAt:ledger.capturedAt,verifiedAt,coverage,
      privateVerification:{retained,retired,unverifiedRetained,unverifiedRetired},unboundSourceInputs:input.gapCount,
      runtimeWriteFence:{verified:runtimeRoles!==undefined,roles:runtimeRoles??[],scope:'Explicit listed database runtime roles only; maintenance/storage authority must remain stopped.'},
      cutoffCandidate:coverage.sourceMatchesBackupAtCapture && unverifiedRetained===0 && unverifiedRetired===0 && input.sourceInputsRepresented,
      sourceCutoffEstablished:false,activationAllowed:false,productionReady:false,
      limitation:'Read-only stopped-source snapshot observation. It does not fence subsequent writers, prove native/cloud restore, establish target business-state parity or authorize release.'};
    return {ledger,report};
  });
}

export function sourceCutoffSummary(report){
  return {backupId:report.backupId,ledgerId:report.ledgerId,capturedAt:report.capturedAt,verifiedAt:report.verifiedAt,
    changedTables:report.coverage.tables.length,changedSequences:report.coverage.sequences.length,changedObjects:report.coverage.objects.length,
    definitionsChanged:report.coverage.definitionsChanged,sourceMatchesBackupAtCapture:report.coverage.sourceMatchesBackupAtCapture,
    privateVerification:report.privateVerification,unboundSourceInputs:report.unboundSourceInputs,cutoffCandidate:report.cutoffCandidate,
    runtimeWriteFenceVerified:report.runtimeWriteFence?.verified===true,runtimeRoles:report.runtimeWriteFence?.roles.length??0,
    sourceCutoffEstablished:false,activationAllowed:false,productionReady:false};
}
