import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../../core/components/admin/ui/HubHeader';
import { Field, SelectInput } from '../../../../core/components/admin/ui/Form';
import bulkImportAPI from '../../../../_shared/api/bulkImport';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';

const FORMAT_NAMES = { csv: 'CSV', json: 'JSON', xml: 'XML', xlsx: 'Excel (.xlsx)', markdown: 'Markdown table' };
const small = { fontSize: '0.74rem', color: colors.textMuted };
const th = { textAlign: 'left', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint, padding: '6px 8px' };
const td = { padding: '6px 8px', fontSize: '0.8rem', borderTop: '1px solid var(--line)', verticalAlign: 'top' };

function Errors({ result }) {
  return (
    <div style={{ ...card, padding: 14, marginTop: 12, borderColor: colors.danger }}>
      <p style={{ margin: '0 0 8px', fontWeight: 700, color: colors.dangerText }}>{result.message}</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Row</th><th style={th}>Column</th><th style={th}>Problem</th><th style={th}>Code</th></tr></thead>
          <tbody>
            {result.errors.map((e, i) => (
              <tr key={i}>
                <td style={td}>{e.row || 'File'}</td>
                <td style={td}>{e.column || ''}</td>
                <td style={td}>{e.message}</td>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.72rem' }}>{e.code}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.truncated && <p style={small}>Showing the first {result.errors.length} of {result.error_count} problems. Fix these and check again.</p>}
    </div>
  );
}

/** Extras > Bulk import: pick what to import, download its template in the format you work in, check the file, then import it. All of it goes in, or none of it. */
export default function BulkImportPage() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [key, setKey] = useState('');
  const [format, setFormat] = useState('csv');
  const [file, setFile] = useState(null);
  const [mapping, setMapping] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    bulkImportAPI.index().then(setData).catch((e) => setLoadError(errMsg(e)));
  }, []);

  const entity = useMemo(() => data?.entities.find((e) => e.key === key), [data, key]);
  const groups = useMemo(() => {
    const g = {};
    (data?.entities || []).forEach((e) => { (g[e.module_name] ||= []).push(e); });
    return g;
  }, [data]);
  const unknownHeadings = (result?.errors || []).filter((e) => e.code === 'unknown_column').map((e) => e.column);

  const reset = () => { setResult(null); setMapping({}); };
  const pick = (k) => { setKey(k); setFile(null); reset(); };

  const go = useCallback(async (step) => {
    if (!file || !entity) return;
    setBusy(true);
    try {
      const r = await bulkImportAPI[step](entity.key, file, format, mapping);
      setResult(r);
      if (step === 'import' && r.committed) toast.success(r.message);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [file, entity, format, mapping]);

  const checked = result?.ok && result.preview;

  return (
    <AdminLayout>
      <HubHeader title="Bulk import" description="Bring in many records at once from a CSV, JSON, XML, Excel or Markdown file. Every row is checked first; if any row has a problem, nothing is saved." />
      {loadError && <p style={{ color: colors.dangerText }}>{loadError}</p>}
      {!data && !loadError && <p style={small}>Loading…</p>}
      {data && !data.entities.length && <p style={small}>Your role has no import permissions. Ask an administrator for the import permission of the module you need.</p>}

      {Object.entries(groups).map(([module, list]) => (
        <section key={module} style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: '0.8rem', margin: '0 0 8px' }}>{module}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
            {list.map((e) => (
              <button key={e.key} type="button" disabled={!e.available} onClick={() => pick(e.key)}
                style={{ ...card, padding: 12, textAlign: 'left', cursor: e.available ? 'pointer' : 'not-allowed', opacity: e.available ? 1 : 0.55, outline: key === e.key ? `2px solid ${colors.primary}` : 'none' }}>
                <strong>{e.label}</strong>
                <span style={{ ...small, display: 'block', marginTop: 4 }}>{e.description}</span>
                {!e.available && <span style={{ ...small, display: 'block', marginTop: 6, color: colors.dangerText }}>{e.unavailable_reason}</span>}
                {e.available && e.missing.length > 0 && <span style={{ ...small, display: 'block', marginTop: 6, color: colors.dangerText }}>Needs {e.missing.map((m) => m.label).join(', ')} in the system first.</span>}
              </button>
            ))}
          </div>
        </section>
      ))}

      {entity && entity.available && (
        <div style={{ ...card, padding: 16 }}>
          <h3 style={{ margin: '0 0 4px' }}>{entity.label}</h3>
          {entity.grouped_by && <p style={small}>One record can take several rows: repeat the “{entity.grouped_by}” value on each row of the same record.</p>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, margin: '12px 0' }}>
            <Field label="File format">
              <SelectInput value={format} onChange={(e) => { setFormat(e.target.value); reset(); }}>
                {data.formats.map((f) => <option key={f} value={f}>{FORMAT_NAMES[f] || f}</option>)}
              </SelectInput>
            </Field>
            <div style={{ alignSelf: 'end' }}>
              <button type="button" style={btnGhost} onClick={() => bulkImportAPI.downloadTemplate(entity.key, format).catch((e) => toast.error(errMsg(e)))}>Download {FORMAT_NAMES[format]} template</button>
            </div>
          </div>

          <details style={{ marginBottom: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Columns the template uses</summary>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Column</th><th style={th}>Type</th><th style={th}>Required</th><th style={th}>Notes</th></tr></thead>
                <tbody>
                  {entity.columns.map((c) => (
                    <tr key={c.key}>
                      <td style={td}><code>{c.key}</code></td>
                      <td style={td}>{c.type}{c.options.length ? `: ${c.options.join(' / ')}` : ''}</td>
                      <td style={td}>{c.required ? 'yes' : ''}</td>
                      <td style={td}>{c.help}{c.per_row ? ' (one per row)' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <input type="file" onChange={(e) => { setFile(e.target.files?.[0] || null); reset(); }} />
          <p style={small}>Up to {data.max_mb} MB and {data.max_rows} rows.</p>

          {unknownHeadings.length > 0 && (
            <div style={{ margin: '12px 0' }}>
              <p style={{ ...small, fontWeight: 600 }}>These columns of your file are not in the template. Match them, or leave them out:</p>
              {unknownHeadings.map((h) => (
                <Field key={h} label={h}>
                  <SelectInput value={mapping[h] || ''} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value || 'skip' })}>
                    <option value="">Choose…</option>
                    <option value="skip">Leave this column out</option>
                    {entity.columns.map((c) => <option key={c.key} value={c.key}>{c.label} ({c.key})</option>)}
                  </SelectInput>
                </Field>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button type="button" style={btnGhost} disabled={!file || busy || !entity.ready} onClick={() => go('preview')}>{busy ? 'Working…' : 'Check the file'}</button>
            <button type="button" style={btnPrimary} disabled={!checked || busy} onClick={() => go('import')}>Import</button>
          </div>
          {!entity.ready && <p style={{ ...small, color: colors.dangerText }}>Needs {entity.missing.map((m) => m.label).join(', ')} in the system first.</p>}

          {result?.ok && (
            <p style={{ marginTop: 12, color: colors.successText, fontWeight: 600 }}>
              {result.message} ({result.records} record{result.records === 1 ? '' : 's'} from {result.rows} row{result.rows === 1 ? '' : 's'})
            </p>
          )}
          {result && !result.ok && <Errors result={result} />}
        </div>
      )}
    </AdminLayout>
  );
}
