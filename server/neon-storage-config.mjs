const REGIONS = ['us-east-1', 'us-east-2', 'eu-central-1', 'ap-southeast-1'];

export function validateNeonStorageConfig(config = {}) {
  const fail = () => {throw Error('Private Neon storage configuration is incomplete or invalid');};
  const {endpoint, region, bucket, accessKeyId, secretAccessKey} = config;
  if (typeof endpoint !== 'string' || endpoint.length > 512
    || /[\s\x00-\x1f\x7f]/.test(endpoint) || !REGIONS.includes(region)
    || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket || '')) fail();
  let url;
  try {url = new URL(endpoint);} catch {fail();}
  const host = /^br-[a-z0-9]+(?:-[a-z0-9]+)*\.storage\.c-[0-9]+\.(us-east-1|us-east-2|eu-central-1|ap-southeast-1)\.aws\.neon\.tech$/;
  if (url.protocol !== 'https:' || url.port || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash || !host.test(url.hostname)
    || url.hostname.match(host)[1] !== region) fail();
  for (const value of [accessKeyId, secretAccessKey]) {
    if (typeof value !== 'string' || !value.length || value.length > 4096
      || /[^\x21-\x7e]/.test(value)) fail();
  }
  return Object.freeze({endpoint: url.origin, region, bucket, accessKeyId, secretAccessKey});
}

export function neonStorageClientOptions(config) {
  return {endpoint: config.endpoint, region: config.region, forcePathStyle: true,
    credentials: {accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey},
    maxAttempts: 1, followRegionRedirects: false};
}
