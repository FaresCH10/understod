export function send(res,status,data,extraHeaders={}) {
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff','referrer-policy':'no-referrer',...extraHeaders});
  res.end(JSON.stringify(data));
}

export async function readJson(req,maxBytes=16384) {
  const chunks=[]; let size=0;
  for await (const chunk of req) {
    size+=chunk.length;
    if (size>maxBytes) throw new Error('Request too large');
    chunks.push(Buffer.from(chunk));
  }
  let value;
  try {value=size ? JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size))) : {};} catch {throw new Error('Invalid JSON');}
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error('Invalid JSON');
  return value;
}
