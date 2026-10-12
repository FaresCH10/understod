import {createHash} from 'node:crypto';
import {importLabelHashes} from './worker-import.mjs';

const array=(value)=>{
  const parsed=typeof value==='string'?JSON.parse(value):value??[];
  if(!Array.isArray(parsed))throw new Error('Deletion evidence unavailable');
  return parsed;
};

export function deletionSnapshotsClear(imports,exports,codeHash){
  for(const row of imports)if(importLabelHashes(array(row.rows_json),row.filename_hash?'':row.filename).includes(codeHash))return false;
  for(const row of exports)for(const entry of array(row.snapshot_json)){
    if(!Array.isArray(entry) || typeof entry[0]!=='string')throw new Error('Deletion evidence unavailable');
    if(createHash('sha256').update(entry[0]).digest('hex')===codeHash)return false;
  }
  return true;
}
