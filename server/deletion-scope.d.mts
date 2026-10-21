export type ApplicationCleanupEvidence={scope:'application_current_view';providerHistory:'not_verified';backups:'not_verified';deviceCaches:'not_verified';irreversibleErasure:'not_verified'};
export function applicationCleanupEvidence():ApplicationCleanupEvidence;
export function validApplicationCleanupEvidence(value:unknown):value is ApplicationCleanupEvidence;
