export const onboardingSteps: readonly string[];
export function onboardingInput(input: unknown): {revision:number;step:string;firstBriefingId:string|null;confirmed:true};
export function onboardingTechnical(): {processing:string;liveReady:boolean;realDataAllowed:boolean;reason:string};
export function sameOnboarding(a:unknown,b:unknown): boolean;
