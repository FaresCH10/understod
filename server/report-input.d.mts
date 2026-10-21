export type ReportFilters={crewId:string;responseFrom:string;responseThrough:string};
export function reportPublicationFilters(value?:unknown):{search:string;from:string;through:string;page:number;pageSize:number};
export function reportScope(value?:unknown):ReportFilters;
export function exportRequestId(value:unknown):string;
export function exportInput(value:unknown):{requestId:string;publicationId:string;filters:ReportFilters};
export function exportRetryInput(id:unknown,value:unknown):{requestId:string;exportId:string;attempts:number};
