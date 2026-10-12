export function reviewInput(input:unknown):{revision:number;question:string;facts:string[];askedFacts:string[];translations?:ReturnType<typeof import('./translation-input.mjs').translationEdits>};
export function sameReview(a:unknown,b:unknown):boolean;
export function publicationInput(input:unknown):{revision:number;workerIds:string[];dueAt:string|null;reminderMinutes?:number;nextVersion?:number};
export function schedulePublicationInput(input:unknown):ReturnType<typeof publicationInput>&{nextVersion:number;publishAt:string};
export function publicationReceiptReference(briefingId:unknown,kind:unknown,requestId:unknown):void;
export function draftInput(input:unknown,mode:'create'|'edit'):{title:string;source:string;generationLanguages?:string[]};
export function sourceAudioMetadata(input:unknown):{requestId:string;title:string;originalType:string;generationLanguages?:string[]};
