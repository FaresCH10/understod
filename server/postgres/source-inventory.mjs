import {bundleHash} from '../ai/prepared-bundle.mjs';

const digest=value=>typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
const keys=(value,expected)=>value!==null && typeof value==='object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',')===expected;
export function validateDatabaseInventory(inventory){
  if(!keys(inventory,'definitionsSha256,sequences,tables') || !digest(inventory.definitionsSha256)
    || !Array.isArray(inventory.tables) || !inventory.tables.length || inventory.tables.length>10000
    || !Array.isArray(inventory.sequences) || inventory.sequences.length>10000)throw Error('Invalid complete database inventory');
  for(const [family,fields] of [['tables','count,name,sha256'],['sequences','is_called,name,value']]){
    const seen=new Set();
    for(const row of inventory[family]){
      if(!keys(row,fields) || typeof row.name!=='string' || !row.name.length || row.name.length>1000 || seen.has(row.name))throw Error('Invalid complete database inventory row');
      seen.add(row.name);
      if(family==='tables' && (!Number.isSafeInteger(row.count) || row.count<0 || !digest(row.sha256))
        || family==='sequences' && (typeof row.is_called!=='boolean' || typeof row.value!=='string' || !/^-?[0-9]{1,19}$/.test(row.value)
          || BigInt(row.value)<-9223372036854775808n || BigInt(row.value)>9223372036854775807n))throw Error('Invalid complete database inventory value');
    }
  }
  if(!inventory.tables.some(row=>row.name==='schema_migrations'))throw Error('Complete inventory migration ledger unavailable');
  return inventory;
}

function differences(before,after,key){
  const older=new Map(before.map(row=>[row[key],row])),newer=new Map(after.map(row=>[row[key],row])),changed=[];
  for(const identity of [...new Set([...older.keys(),...newer.keys()])].sort()){
    const old=older.get(identity),current=newer.get(identity);
    if(bundleHash(old ?? null)!==bundleHash(current ?? null))changed.push({key:identity,reason:!old?'added':!current?'removed':'changed'});
  }
  return changed;
}

export function compareSourceSnapshot(baseline,ledger){
  validateDatabaseInventory(baseline.database);validateDatabaseInventory(ledger.sourceInventory);
  const tables=differences(baseline.database.tables,ledger.sourceInventory.tables,'name');
  const sequences=differences(baseline.database.sequences,ledger.sourceInventory.sequences,'name');
  const objects=differences(baseline.objects,ledger.objects,'id');
  const definitionsChanged=baseline.database.definitionsSha256!==ledger.sourceInventory.definitionsSha256;
  return {tables,sequences,objects,definitionsChanged,sourceMatchesBackupAtCapture:!tables.length && !sequences.length && !objects.length && !definitionsChanged,
    backupInventorySha256:bundleHash({database:baseline.database,objects:baseline.objects}),
    sourceInventorySha256:bundleHash({database:ledger.sourceInventory,objects:ledger.objects})};
}
