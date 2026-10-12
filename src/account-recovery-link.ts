export function accountRecoveryToken(hash:string):string {
  const match=/^#reset-password\/([A-Za-z0-9_-]{43})$/.exec(hash);return match ? match[1] : '';
}
