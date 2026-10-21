export function assertGeminiKey(value) {
  // Credentials are opaque; Google authenticates them, not a legacy prefix regex.
  if(typeof value!=='string' || !value.length || value.length>512 || /[^\x21-\x7e]/.test(value))
    throw Error('Local Gemini credential is unavailable or unsafe for an HTTP header');
  return value;
}
