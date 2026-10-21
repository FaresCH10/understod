import {inspectRuntimeUpdateColumns} from './runtime-column-permissions.mjs';

export const verificationJobUpdates=Object.freeze(['status','attempts','lease_token','lease_until','finished_at','result_json','diagnostic_code']);
export async function inspectWorkerVerificationJobColumns(client,{schema,role}) {
  await inspectRuntimeUpdateColumns(client,{schema,role,table:'provider_verification_jobs',updates:verificationJobUpdates});
}
