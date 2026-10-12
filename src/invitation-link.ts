export function invitationLinkToken(fragment:string) {const match=fragment.match(/^#accept-invitation\/([A-Za-z0-9_-]{43})$/);return match?.[1] || '';}
