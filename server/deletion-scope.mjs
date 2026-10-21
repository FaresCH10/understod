const fields=['scope','providerHistory','backups','deviceCaches','irreversibleErasure'];

// Existing deletion receipts attest to application checks, not external erasure.
export function applicationCleanupEvidence(){
  return {scope:'application_current_view',providerHistory:'not_verified',backups:'not_verified',deviceCaches:'not_verified',irreversibleErasure:'not_verified'};
}

export function validApplicationCleanupEvidence(value){
  return !!value&&typeof value==='object'&&!Array.isArray(value)
    &&Object.keys(value).length===fields.length&&fields.every(field=>Object.hasOwn(value,field))
    &&value.scope==='application_current_view'&&fields.slice(1).every(field=>value[field]==='not_verified');
}
