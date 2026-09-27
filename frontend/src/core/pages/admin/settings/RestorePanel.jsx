import React, { useState, useEffect, useCallback } from 'react';
import backupsAPI from '../../../../_shared/api/backups';
import { Upload, DownloadCloud, RotateCcw, AlertTriangle, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const input = {
  padding: '8px 11px', borderRadius: 8, fontSize: '0.82rem',
  background: 'color-mix(in srgb, var(--color-primary-500) 4%, transparent)',
  border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)',
  color: '#111827', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%',
};
const label = {
  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--color-primary-600)', display: 'block', marginBottom: 5,
};
const btn = (bg, fg = 'white') => ({
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 15px',
  borderRadius: 9, border: 'none', background: bg, color: fg, cursor: 'pointer',
  fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit',
});
const seg = (active) => ({
  ...btn(active ? 'var(--color-primary-600)' : 'rgba(107,114,128,0.12)', active ? 'white' : '#374151'),
  padding: '7px 12px', fontSize: '0.78rem',
});
const fmtSize = (b) => (b == null ? '' : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);

export default function RestorePanel({ destinationDriver }) {
  const remote = ['ftp', 'sftp', 's3'].includes(destinationDriver);
  const [source, setSource] = useState('upload');       // 'upload' | 'pull'
  const [mode, setMode] = useState('merge');            // 'merge' | 'replace'
  const [pass, setPass] = useState('');
  const [file, setFile] = useState(null);
  const [files, setFiles] = useState([]);
  const [chosen, setChosen] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);

  const loadFiles = useCallback(async () => {
    if (!remote) return;
    try {
      const d = await backupsAPI.restoreFiles();
      setFiles(d.files || []);
    } catch { /* ignore */ }
  }, [remote]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const canRun =
    pass.trim() &&
    (source === 'upload' ? !!file : !!chosen) &&
    (mode !== 'replace' || confirm) &&
    !busy;

  const run = async () => {
    setBusy(true);
    setReport(null);
    const t = toast.loading('Restoring…');
    try {
      const res = source === 'upload'
        ? await backupsAPI.restoreUpload(file, pass, mode)
        : await backupsAPI.restorePull(chosen, pass, mode);
      toast.dismiss(t);
      if (res.ok) {
        toast.success(res.message || 'Restore complete.');
        setReport(res.report || []);
      } else {
        toast.error(res.message || 'Restore failed.');
      }
    } catch (e) {
      toast.dismiss(t);
      toast.error(e.response?.data?.message || 'Restore failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 14, marginTop: 12 }}>
      {/* Source toggle */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setSource('upload')} style={seg(source === 'upload')}><Upload size={14} /> Upload file</button>
        {remote && <button onClick={() => setSource('pull')} style={seg(source === 'pull')}><DownloadCloud size={14} /> From destination</button>}
      </div>

      {/* Source input */}
      {source === 'upload' ? (
        <div>
          <label style={label}>Backup file (.wnkjba)</label>
          <input type="file" accept=".wnkjba" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ ...input, padding: '7px' }} />
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={label}>Backup at destination</label>
            <button onClick={loadFiles} style={{ ...btn('transparent', 'var(--color-primary-600)'), padding: 2, fontSize: '0.72rem' }}><RefreshCw size={13} /> Refresh</button>
          </div>
          <select style={input} value={chosen} onChange={(e) => setChosen(e.target.value)}>
            <option value="">{files.length ? '— choose a backup —' : 'No backups found at destination'}</option>
            {files.map((f) => <option key={f.filename} value={f.filename}>{f.filename} {f.size ? `(${fmtSize(f.size)})` : ''}</option>)}
          </select>
        </div>
      )}

      {/* Passphrase */}
      <div>
        <label style={label}>Backup passphrase</label>
        <input type="password" style={{ ...input, maxWidth: 360 }} value={pass} placeholder="The passphrase this backup was made with" onChange={(e) => setPass(e.target.value)} />
        <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '4px 0 0' }}>Must match the backup exactly — a wrong passphrase can't decrypt it.</p>
      </div>

      {/* Mode */}
      <div>
        <label style={label}>How to apply</label>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.82rem' }}>
          <label style={{ display: 'inline-flex', gap: 7, alignItems: 'flex-start', cursor: 'pointer', maxWidth: 320 }}>
            <input type="radio" checked={mode === 'merge'} onChange={() => { setMode('merge'); setConfirm(false); }} style={{ marginTop: 3 }} />
            <span><strong>Merge</strong> — insert or update rows by their id, keeping everything else. Safe.</span>
          </label>
          <label style={{ display: 'inline-flex', gap: 7, alignItems: 'flex-start', cursor: 'pointer', maxWidth: 320 }}>
            <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} style={{ marginTop: 3 }} />
            <span><strong>Replace</strong> — wipe each table and load the backup's rows. Overwrites current data.</span>
          </label>
        </div>
      </div>

      {mode === 'replace' && (
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 9, padding: '10px 13px' }}>
          <AlertTriangle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
          <label style={{ fontSize: '0.8rem', color: '#991b1b', display: 'inline-flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} style={{ marginTop: 2 }} />
            I understand Replace <strong>permanently overwrites</strong> the current data in the backed-up tables.
          </label>
        </div>
      )}

      <div>
        <button onClick={run} disabled={!canRun} style={{ ...btn(mode === 'replace' ? '#b91c1c' : 'var(--color-primary-600)'), opacity: canRun ? 1 : 0.5 }}>
          <RotateCcw size={15} /> {busy ? 'Restoring…' : `Restore (${mode})`}
        </button>
      </div>

      {/* Report */}
      {report && (
        <div style={{ overflowX: 'auto', border: '1px solid #eee', borderRadius: 9 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#9ca3af', background: '#fafafa' }}>
                <th style={{ padding: '6px 8px' }}>Table</th>
                <th style={{ padding: '6px 8px' }}>Action</th>
                <th style={{ padding: '6px 8px' }}>Rows</th>
                <th style={{ padding: '6px 8px' }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {report.map((r) => (
                <tr key={r.table} style={{ borderTop: '1px solid #f3f3f3' }}>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{r.table}</td>
                  <td style={{ padding: '6px 8px' }}>
                    {r.action === 'skipped'
                      ? <span style={{ color: '#9ca3af', display: 'inline-flex', gap: 4, alignItems: 'center' }}><XCircle size={12} /> skipped</span>
                      : <span style={{ color: '#059669', display: 'inline-flex', gap: 4, alignItems: 'center' }}><CheckCircle2 size={12} /> {r.action}</span>}
                  </td>
                  <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums' }}>{(r.rows ?? 0).toLocaleString()}</td>
                  <td style={{ padding: '6px 8px', color: '#9ca3af' }}>{r.reason || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
