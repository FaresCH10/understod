export const staffRoles:string[];
export function staffReference(id:unknown):string;
export function staffChangeInput(action:string,input:unknown):{revision:number;role?:string};
export function staffSignature(id:string,action:string,value:{revision:number;role?:string}):string;
