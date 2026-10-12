const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
export function sendInvoiceDownload(res,invoice) {
  const filename=String(invoice.number).replace(/[^A-Z0-9-]/g,'').slice(0,40) || 'record';
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-disposition':`attachment; filename="invoice-${filename}.html"`,
    'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',
    'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox"});
  res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Invoice ${escape(invoice.number)}</title>
    <style>body{font:16px system-ui,sans-serif;max-width:760px;margin:40px auto;padding:20px;color:#111827}h1{font-size:28px}dl{display:grid;grid-template-columns:1fr 1fr;gap:14px}dd{margin:0;overflow-wrap:anywhere}p{white-space:pre-wrap;overflow-wrap:anywhere}hr{border:0;border-top:1px solid #ddd}@media(max-width:420px){dl{grid-template-columns:1fr}dd{margin-bottom:12px}}</style>
    <h1>Invoice ${escape(invoice.number)}</h1><p>${escape(invoice.issuerName)}<br>${escape(invoice.siteName)}</p>
    <dl><dt>Issued</dt><dd>${escape(invoice.issueDate)}</dd><dt>Due</dt><dd>${escape(invoice.dueDate)}</dd><dt>Status at download</dt><dd>${escape(invoice.status)}</dd></dl>
    <hr><p>${escape(invoice.description)}</p><dl><dt>Total (USD)</dt><dd>${money(invoice.amountCents)}</dd><dt>Recorded payments</dt><dd>${money(invoice.paidCents)}</dd>${invoice.voidedCents ? `<dt>Voided amount</dt><dd>${money(invoice.voidedCents)}</dd>` : ''}<dt>Outstanding balance</dt><dd>${money(invoice.balanceCents)}</dd></dl>
    ${invoice.voidRecord ? `<h2>Invoice voided</h2><p>${escape(invoice.voidRecord.reason)}</p><p>${escape(invoice.voidRecord.createdAt)}</p><p>The original invoice is retained. No refund or payment was processed.</p>` : ''}
    <hr><p>Payment records are entered manually. This document does not charge a card or confirm bank reconciliation.</p></html>`);
}
