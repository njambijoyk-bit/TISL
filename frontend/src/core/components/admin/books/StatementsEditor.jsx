import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { Field, TextInput, SelectInput, FormGrid } from '../ui/Form';
import { btnPrimary, card, colors } from '../../../../_shared/theme/tokens';

/**
 * The statements tree: the Balance sheet and the Income statement, their sections and lines (database/sql/227_statements.sql).
 * Ledgers and ledger groups are put on a line; the reports add up by line. Anyone who can open the Reports settings sees the tree;
 * changing it needs books.statements. The built-in rows can be renamed, hidden and shown but not deleted.
 */

const NATURES = { BS: { asset: 'An asset', liability: 'A liability or equity' }, IS: { income: 'Income', expense: 'An expense' } };

const CASH_FLOW = { operating: 'Operating', investing: 'Investing', financing: 'Financing', non_cash: 'Non-cash' };   // where the row counts in the cash flow statement

function Row({ r, canEdit, onChange }) {
  const [name, setName] = useState(r.name);
  useEffect(() => setName(r.name), [r.name]);
  const run = async (fn, ok) => { try { const res = await fn(); onChange(res.rows); if (ok) toast.success(ok); } catch (e) { toast.error(errMsg(e, 'Could not save')); setName(r.name); } };
  const members = r.groups + r.ledgers;
  return (
    <tr style={{ borderTop: `1px solid ${colors.tint(0.05)}`, opacity: r.is_active ? 1 : 0.5 }}>
      <td style={{ padding: '6px 8px', paddingLeft: 8 + r.depth * 20 }}>
        {canEdit
          ? <TextInput aria-label={`Name of ${r.code}`} value={name} onChange={(e) => setName(e.target.value)} style={{ fontWeight: r.kind === 'heading' ? 700 : 500, maxWidth: 320 }}
              onBlur={() => { const n = name.trim(); if (n && n !== r.name) run(() => booksAPI.updateStatement(r.id, { name: n }), 'Renamed'); else setName(r.name); }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
          : <span style={{ fontWeight: r.kind === 'heading' ? 700 : 500 }}>{r.name}</span>}
      </td>
      <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: '0.72rem', color: colors.textMuted }}>{r.code}</td>
      <td style={{ padding: '6px 8px', fontSize: '0.72rem', color: colors.textMuted }}>{r.kind === 'heading' ? 'Section' : `Line · ${r.nature}`}</td>
      <td style={{ padding: '6px 8px', fontSize: '0.75rem', textAlign: 'right' }}>{r.kind === 'line' ? `${r.groups} group${r.groups === 1 ? '' : 's'}, ${r.ledgers} ledger${r.ledgers === 1 ? '' : 's'}` : ''}</td>
      <td style={{ padding: '6px 8px' }}>
        {r.code === 'BS' || r.code === 'IS' ? null : (
          <select aria-label={`Cash flow section of ${r.name}`} disabled={!canEdit} value={r.cash_flow_category ?? ''} style={{ fontSize: '0.74rem', padding: '3px 6px' }}
            onChange={(e) => run(() => booksAPI.updateStatement(r.id, { cash_flow_category: e.target.value || null }), 'Saved')}>
            <option value="">{r.cash_flow_effective ? `Follows: ${CASH_FLOW[r.cash_flow_effective]}` : 'Follows the row above'}</option>
            {Object.entries(CASH_FLOW).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
      </td>
      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
        {canEdit && (
          <>
            <button type="button" aria-label={r.is_active ? `Hide ${r.name}` : `Show ${r.name}`} title={r.is_active ? 'Hide from the statements' : 'Show again'} onClick={() => run(() => booksAPI.updateStatement(r.id, { is_active: !r.is_active }))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted }}>{r.is_active ? <Eye size={15} /> : <EyeOff size={15} />}</button>
            {!r.is_system && members === 0 && (
              <button type="button" aria-label={`Delete ${r.name}`} onClick={() => { if (confirm(`Delete "${r.name}"?`)) run(() => booksAPI.deleteStatement(r.id), 'Deleted'); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.danger }}><Trash2 size={15} /></button>
            )}
          </>
        )}
      </td>
    </tr>
  );
}

function AddRow({ rows, onAdded }) {
  const headings = useMemo(() => rows.filter((r) => r.kind === 'heading' && r.is_active), [rows]);
  const [f, setF] = useState({ parent_id: '', kind: 'line', nature: '', name: '' });
  const [busy, setBusy] = useState(false);
  const parent = headings.find((h) => String(h.id) === String(f.parent_id));
  const natures = parent ? NATURES[parent.code.split('.')[0]] ?? {} : {};
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await booksAPI.createStatement({ parent_id: Number(f.parent_id), kind: f.kind, name: f.name.trim(), ...(f.kind === 'line' ? { nature: f.nature } : {}) });
      toast.success('Added'); onAdded(r.rows); setF({ ...f, name: '' });
    } catch (err) { toast.error(errMsg(err, 'Could not add')); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${colors.tint(0.08)}` }}>
      <p style={{ margin: '0 0 8px', fontSize: '0.8rem', fontWeight: 700, color: colors.text }}>Add a row</p>
      <FormGrid min={200}>
        <Field label="Under">
          <SelectInput required value={f.parent_id} onChange={(e) => setF({ ...f, parent_id: e.target.value, nature: '' })}>
            <option value="">Choose a section…</option>
            {headings.map((h) => <option key={h.id} value={h.id}>{'— '.repeat(h.depth)}{h.name}</option>)}
          </SelectInput>
        </Field>
        <Field label="It is">
          <SelectInput value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            <option value="line">A line (ledgers go on it)</option><option value="heading">A section (holds other rows)</option>
          </SelectInput>
        </Field>
        {f.kind === 'line' && (
          <Field label="Accepts">
            <SelectInput required value={f.nature} onChange={(e) => setF({ ...f, nature: e.target.value })} disabled={!parent}>
              <option value="">Choose…</option>
              {Object.entries(natures).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </SelectInput>
          </Field>
        )}
        <Field label="Name"><TextInput required maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      </FormGrid>
      <div style={{ marginTop: 10 }}><button type="submit" style={btnPrimary} disabled={busy}><Plus size={14} /> Add</button></div>
    </form>
  );
}

export default function StatementsEditor({ canEdit }) {
  const [data, setData] = useState(null);
  const load = useCallback(() => booksAPI.statements().then(setData).catch((e) => { toast.error(errMsg(e, 'Could not load the statements')); setData({ ready: false, message: errMsg(e, 'Could not load the statements.'), rows: [] }); }), []);
  useEffect(() => { load(); }, [load]);
  const setRows = (rows) => setData((d) => ({ ...d, rows }));

  return (
    <div style={{ ...card, padding: 18, marginBottom: 16 }}>
      <p style={{ margin: 0, fontWeight: 700, color: colors.text }}>Statements</p>
      <p style={{ margin: '3px 0 12px', fontSize: '0.75rem', color: colors.textMuted, maxWidth: 640, lineHeight: 1.5 }}>
        The balance sheet and income statement are built from these lines. Each ledger group and ledger is put on one line. The built-in rows can be renamed or hidden, not deleted.
        {!canEdit && ' You can see them but not change them.'}
      </p>
      {!data ? <p style={{ color: colors.textMuted }}>Loading…</p> : data.ready === false ? <p style={{ fontSize: '0.8rem', color: colors.textMuted }}>{data.message}</p> : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead><tr style={{ textAlign: 'left', color: colors.textFaint, fontSize: '0.68rem' }}><th style={{ padding: '6px 8px' }}>Name</th><th style={{ padding: '6px 8px' }}>Code</th><th style={{ padding: '6px 8px' }}>Kind</th><th style={{ padding: '6px 8px', textAlign: 'right' }}>On it</th><th style={{ padding: '6px 8px' }}>Cash flow</th><th /></tr></thead>
              <tbody>{data.rows.map((r) => <Row key={r.id} r={r} canEdit={canEdit} onChange={setRows} />)}</tbody>
            </table>
          </div>
          {canEdit && <AddRow rows={data.rows} onAdded={setRows} />}
        </>
      )}
      {!canEdit && <p style={{ margin: '10px 0 0', fontSize: '0.72rem', color: colors.textFaint }}>Changing the statements needs the "books.statements" permission.</p>}
    </div>
  );
}
