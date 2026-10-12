import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Download, FileText, TriangleAlert, Upload, Users } from 'lucide-react';

type Row = { row: number; workerId: string; language: string; crew: string; errors: string[]; valid: boolean };
type Preview = { id: string; filename: string; status: string; totalRows: number; validRows: number; invalidRows: number;
  rows: Row[]; errors: string[]; imported: number; expiresAt: string };
type Props = { id?: string; navigate: (path: string) => void };

async function responseData(response: Response): Promise<Preview> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export function WorkerImportPage({ id, navigate }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const uploadKey = useRef<string | null>(null);
  const sending = useRef(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!id) return;
    let current = true;
    setLoading(true); setError('');
    fetch(`/api/people/imports/${encodeURIComponent(id)}`, { credentials: 'include' }).then(responseData)
      .then((data) => { if (current) { setPreview(data); setPage(1); } })
      .catch((err: Error) => { if (current) setError(err.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [id]);
  const validate = async () => {
    if (!file || sending.current) return;
    sending.current = true; setBusy(true); setError('');
    uploadKey.current ??= crypto.randomUUID();
    try {
      if (file.size === 0 || file.size > 256 * 1024) throw new Error('CSV must contain 1 byte to 256 KiB');
      const query = new URLSearchParams({ requestId: uploadKey.current, filename: file.name });
      const data = await responseData(await fetch(`/api/people/imports/preview?${query}`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'text/csv' }, body: file,
      }));
      setPreview(data); setPage(1); setFile(null); uploadKey.current = null;
      navigate(`people/import/${data.id}`);
    } catch (err) { setError((err as Error).message); }
    finally { sending.current = false; setBusy(false); }
  };
  const confirm = async () => {
    if (!preview || sending.current) return;
    sending.current = true; setBusy(true); setError('');
    try {
      const response = await fetch(`/api/people/imports/${preview.id}/confirm`, { method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' }, body: '{}' });
      const result = await response.json();
      if (!response.ok) {
        const fresh = await responseData(await fetch(`/api/people/imports/${preview.id}`, { credentials: 'include' }));
        setPreview(fresh);
        throw new Error(result.error || 'Import failed');
      }
      setPreview({ ...preview, status: result.status, imported: result.imported });
    } catch (err) { setError((err as Error).message); }
    finally { sending.current = false; setBusy(false); }
  };
  const imported = preview?.status === 'imported';
  const expired = preview?.status === 'expired';
  const blocked = !preview || !!preview.errors.length || !!preview.invalidRows || !preview.totalRows || expired;
  const rows = preview?.rows.slice((page - 1) * 10, page * 10) || [];
  const pages = Math.max(1, Math.ceil((preview?.totalRows || 0) / 10));
  return <>
    <button className="back-link" onClick={() => navigate('people')}><ArrowLeft size={18} />Workers</button>
    <div className="page-header"><div><h1>Import workers</h1></div><a className="button outline" href="/worker-import-template.csv" download><Download size={18} />CSV template</a></div>
    <ol className="import-steps" aria-label="Import progress">{['Upload', 'Validate', 'Confirm'].map((step, index) => <li key={step} aria-current={index === (imported ? 2 : preview ? 1 : 0) ? 'step' : undefined}>
      <span className={imported || preview && index === 0 ? 'done' : ''}>{imported || preview && index === 0 ? <Check size={18} /> : index + 1}</span><strong>{step}</strong></li>)}</ol>
    <section className="import-file-band"><FileText size={34} /><div><h2>{file?.name || preview?.filename || 'CSV file'}</h2>{preview && <p>{preview.totalRows} rows · {preview.validRows} valid · {preview.invalidRows} need attention</p>}</div>
      <button className="button outline" disabled={busy || loading} onClick={() => fileInput.current?.click()}><Upload size={18} />{preview ? 'Replace file' : 'Choose file'}</button>
      <input ref={fileInput} type="file" accept=".csv,text/csv" className="sr-only" aria-label="CSV file" disabled={busy || loading}
        onChange={(event) => { const selected = event.target.files?.[0]; if (selected) { setFile(selected); setPreview(null); setError(''); uploadKey.current = null; setPage(1); } event.target.value = ''; }} />
    </section>
    {file && <button className="button primary" disabled={busy} onClick={() => void validate()}><Check size={18} />{busy ? 'Validating...' : 'Validate file'}</button>}
    {loading && <p>Loading import...</p>}
    {error && <p role="alert" className="record-error">{error}</p>}
    {preview && <section className="panel import-preview"><div className="people-panel-heading"><h2>Preview rows ({preview.totalRows})</h2>{!expired && (preview.errors.length > 0 || preview.invalidRows > 0) && <a className="button outline" href={`/api/people/imports/${preview.id}/errors.csv`} download><Download size={18} />Download errors</a>}</div>
      {!!preview.rows.length && <div className="table-wrap"><table><thead><tr><th>Row</th><th>Worker ID</th><th>Language</th><th>Crew</th><th>Status</th><th>Notes</th></tr></thead><tbody>{rows.map((row) => <tr key={row.row}><td>{row.row}</td><td>{row.workerId}</td><td>{row.language}</td><td>{row.crew || '-'}</td><td><span className={`status status-${row.valid ? 'green' : 'amber'}`}>{row.valid ? 'Valid' : 'Needs attention'}</span></td><td>{row.errors.join('; ') || '-'}</td></tr>)}</tbody></table></div>}
      {pages > 1 && <div className="people-pagination"><span>Page {page} of {pages}</span><div><button className="icon-button" title="Previous page" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={19} /></button><button className="icon-button" title="Next page" aria-label="Next page" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}><ChevronRight size={19} /></button></div></div>}
      {expired ? <div className="notice" role="status"><TriangleAlert size={22} /><span>This import has expired.{preview.imported > 0 && ` ${preview.imported} workers were previously imported.`}</span></div>
        : imported ? <div className="notice notice-green" role="status"><Check size={22} /><span>{preview.imported} workers imported.</span></div>
        : blocked && <div className="notice" role="status"><TriangleAlert size={22} /><span>{preview.errors.length ? preview.errors.join('. ') : `Fix ${preview.invalidRows} rows before importing.`}</span></div>}
      {!imported && !expired && <div className="actions"><button className="button primary" disabled={blocked || busy} onClick={() => void confirm()}><Users size={18} />{busy ? 'Importing...' : `Import ${preview.totalRows} workers`}</button><p>Nothing has been imported yet.</p></div>}
      {imported && <button className="button primary" onClick={() => navigate('people')}><Users size={18} />View workers</button>}
    </section>}
  </>;
}
