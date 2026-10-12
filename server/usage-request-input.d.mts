export type UsageChange={kind:string;message:string;confirmed:true};
export function usageRequestInput(input:unknown):UsageChange;
export function sameUsageRequest(a:unknown,b:unknown):boolean;
