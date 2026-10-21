export type SettingsKind='organization'|'site';
export type SettingsValue={revision:number;name:string;supportEmail?:string;timezone?:string;generationLanguages?:string[];primaryContactId?:string|null;deputyContactId?:string|null};
export function settingsRequestId(value:unknown):string;
export function settingsInput(kind:SettingsKind,input:unknown):SettingsValue;
export function sameSettingsRequest(old:unknown,value:SettingsValue):boolean;
export function generationLanguages(value:unknown):string[];
