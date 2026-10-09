import { useMemo, useState } from 'react';
import { Download, Printer, Search } from 'lucide-react';
import { downloadCsv, downloadJson, printTable } from '../../../../../_shared/lib/tableExport';
import { btnGhost, card, colors } from '../../../../../_shared/theme/tokens';

const th = { padding: '8px 12px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' };
const td = { padding: '7px 12px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}`, verticalAlign: 'top' };

/**
 * A table of another company's rows, read-only: search, sort, pages, and export to CSV, JSON or a printed page (save as PDF).
 * columns: [{ key, label, value?(row), render?(row), num?: true }]. `file` names the exports; `subtitle` heads the printed page.
 */
export default function DataGrid({ columns, rows, file, title, subtitle = '', onRow, pageSize = 100, empty = 'Nothing here.', footer }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(null);   // { key, dir }
  const [page, setPage] = useState(0);
  const val = (c, r) => (c.value ? c.value(r) : r[c.key]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = needle ? rows.filter((r) => columns.some((c) => String(val(c, r) ?? '').toLowerCase().includes(needle))) : rows;
    if (sort) {
      const c = columns.find((x) => x.key === sort.key);
      out = [...out].sort((a, b) => {
        const x = val(c, a); const y = val(c, b);
        const r = c.num ? (Number(x) || 0) - (Number(y) || 0) : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true });
        return sort.dir === 'asc' ? r : -r;
      });
    }
    return out;
  }, [rows, columns, q, sort]);

  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const at = Math.min(page, pages - 1);
  const slice = shown.slice(at * pageSize, at * pageSize + pageSize);
  const numeric = columns.filter((c) => c.num).map((c) => c.key);
  // exports carry what is on screen after searching and sorting, every page of it
  const exportCols = columns.map((c) => ({ key: c.key, label: c.label, value: (r) => val(c, r) }));

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: 10, color: colors.textFaint }} />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search…" aria-label="Search this table" style={{ padding: '7px 10px 7px 28px', borderRadius: 8, border: `1px solid ${colors.tint(0.15)}`, fontSize: '0.8rem', minWidth: 200 }} />
        </div>
        <span style={{ fontSize: '0.74rem', color: colors.textMuted }}>{shown.length === rows.length ? `${rows.length} rows` : `${shown.length} of ${rows.length} rows`}</span>
        <span style={{ flex: 1 }} />
        <button type="button" style={btnGhost} onClick={() => downloadCsv(file, exportCols, shown)}><Download size={13} /> CSV</button>
        <button type="button" style={btnGhost} onClick={() => downloadJson(file, exportCols, shown)}><Download size={13} /> JSON</button>
        <button type="button" style={btnGhost} onClick={() => printTable(title ?? file, subtitle, exportCols, shown, numeric)}><Printer size={13} /> PDF</button>
      </div>
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: colors.tint(0.02) }}>
                {columns.map((c) => (
                  <th key={c.key} style={{ ...th, textAlign: c.num ? 'right' : 'left' }} onClick={() => { setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'asc' })); setPage(0); }}
                    aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>{c.label}{sort?.key === c.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.length === 0 && <tr><td colSpan={columns.length} style={{ ...td, textAlign: 'center', color: colors.textMuted, padding: 28 }}>{empty}</td></tr>}
              {slice.map((r, i) => (
                <tr key={i} onClick={onRow ? () => onRow(r) : undefined} style={{ cursor: onRow ? 'pointer' : 'default' }}>
                  {columns.map((c) => <td key={c.key} style={{ ...td, textAlign: c.num ? 'right' : 'left', fontVariantNumeric: c.num ? 'tabular-nums' : undefined }}>{c.render ? c.render(r) : val(c, r)}</td>)}
                </tr>
              ))}
              {footer}
            </tbody>
          </table>
        </div>
      </div>
      {pages > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', fontSize: '0.78rem' }}>
          <button type="button" style={btnGhost} disabled={at === 0} onClick={() => setPage(at - 1)}>Previous</button>
          <span>Page {at + 1} of {pages}</span>
          <button type="button" style={btnGhost} disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
