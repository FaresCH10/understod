export function invitationReference(id:unknown):string;
export function invitationEmailKey(email:string):string;
export function invitationIssueInput(input:unknown):{name:string;email:string;role:string};
export function invitationChangeInput(input:unknown):{revision:number};
export function invitationFilters(input?:unknown):{status:string;page:number;pageSize:number};
export function invitationTokenInput(input:unknown,remoteAddress?:string):string;
export function invitationAcceptInput(input:unknown,kind:string,remoteAddress?:string):{requestId:string;token:string};
export function invitationRolePolicy(actor:{role?:string},role:string):void;
