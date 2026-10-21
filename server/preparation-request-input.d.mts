export type PreparationRequest={requestId:string;briefingId:string;revision:number;jobId:string|null;generation:number};
export function preparationRequestId(value:unknown):string;
export function preparationReference(value:unknown):string;
export function preparationRequestInput(briefingId:unknown,value:unknown):PreparationRequest;
