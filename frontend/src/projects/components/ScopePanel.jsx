import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message, money } from '../lib/format';
import { Btn, Chip, DataTable, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';
import { td, th } from './uiTokens';

const blank = () => ({ code: '', description: '', unit: '', quantity: '', phase_id: '' });
const num = (n) => (n === null || n === undefined ? '' : new Intl.NumberFormat('en-KE', { maximumFractionDigits: 4 }).format(n));

/**
 * Scope lines (docs/PROJECTS_STAGE5_SPEC.md, build 5.3): what is agreed, with progress. A line can be priced by a line of a linked Books sales
 * order; the price shown is read from Books, never kept here. The lines of a linked order can be copied in at once.
 */
export default function ScopePanel({ projectId, word }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);   // new or changed line
  const [moving, setMoving] = useState(null);   // { id, value, note }
  const [copyFrom, setCopyFrom] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setData(await projectsAPI.scope(projectId)); } catch (e) { setProblem(message(e, 'The scope could not be loaded.')); } }, [projectId]);
  useEffect(() => { load(); }, [load]);
  const run = async (call, done) => {
    setBusy(true);
    try { setData(await call()); setProblem(''); toast.success(done); return true; } catch (e) { setProblem(message(e, 'That could not be done. Try again.')); return false; } finally { setBusy(false); }
  };
  if (!data) return problem ? <Notice status="problem">{problem}</Notice> : null;
  const name = word ? word('scope_line', true) : 'Scope lines';
  const set = (patch) => { setForm({ ...form, ...patch }); setProblem(''); };
  const save = (e) => {
    e.preventDefault();
    const body = { ...form, phase_id: form.phase_id || null, voucher_item_id: form.voucher_item_id || null };
    run(() => (form.id ? projectsAPI.changeScope(projectId, form.id, body) : projectsAPI.addScope(projectId, body)), form.id ? 'Saved' : 'Line added').then((ok) => ok && setForm(null));
  };
  const orderLines = data.orders.flatMap((o) => o.lines.map((l) => ({ ...l, label: `${o.number} · ${l.description ?? 'line'}` })));

  return (
    <Panel data-scope>
      <PanelTitle hint={data.overall !== null ? `${data.overall}% done overall, each line counting equally` : 'What was agreed, line by line'}
        right={data.can.manage && !form && <Btn small variant="primary" onClick={() => { setForm(blank()); setProblem(''); }}>Add a line</Btn>}>{name}</PanelTitle>

      {data.can.manage && data.orders.length > 0 && !form && (
        <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }} onSubmit={(e) => { e.preventDefault(); run(() => projectsAPI.addScope(projectId, { copy_from: Number(copyFrom) }), 'Copied in'); }}>
          <Field label="Copy the lines of" htmlFor="sc-copy"><SelectInput id="sc-copy" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} required><option value="">Choose…</option>{data.orders.map((o) => <option key={o.id} value={o.id}>{o.kind} {o.number} ({o.lines.length} lines)</option>)}</SelectInput></Field>
          <Btn type="submit" small busy={busy}>Copy them in</Btn>
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Lines already copied are skipped.</span>
        </form>
      )}

      {form && (
        <form onSubmit={save} style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginBottom: 12 }} data-scope-form>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <Field label="Code" htmlFor="sc-code"><TextInput id="sc-code" value={form.code} maxLength={30} onChange={(e) => set({ code: e.target.value })} /></Field>
            <Field label="Description" htmlFor="sc-desc" style={{ gridColumn: 'span 2' }}><TextInput id="sc-desc" value={form.description} maxLength={300} onChange={(e) => set({ description: e.target.value })} required /></Field>
            <Field label="Unit (empty: progress in %)" htmlFor="sc-unit"><TextInput id="sc-unit" value={form.unit} maxLength={20} onChange={(e) => set({ unit: e.target.value })} /></Field>
            <Field label="Quantity" htmlFor="sc-qty"><TextInput id="sc-qty" type="number" min={0} step="any" value={form.quantity} onChange={(e) => set({ quantity: e.target.value })} required={form.unit.trim() !== ''} /></Field>
            {data.phases.length > 0 && <Field label="Phase" htmlFor="sc-phase"><SelectInput id="sc-phase" value={form.phase_id} onChange={(e) => set({ phase_id: e.target.value })}><option value="">None</option>{data.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectInput></Field>}
            {orderLines.length > 0 && <Field label="Priced by" htmlFor="sc-item" style={{ gridColumn: 'span 2' }}><SelectInput id="sc-item" value={form.voucher_item_id ?? ''} onChange={(e) => set({ voucher_item_id: e.target.value })}><option value="">Not linked</option>{orderLines.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</SelectInput></Field>}
          </div>
          {problem && <Notice status="problem">{problem}</Notice>}
          <div style={{ display: 'flex', gap: 8 }}><Btn type="submit" small variant="primary" busy={busy}>{form.id ? 'Save' : 'Add the line'}</Btn><Btn small onClick={() => setForm(null)}>Cancel</Btn></div>
        </form>
      )}

      {data.lines.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No lines yet.</p>}
      {data.lines.length > 0 && (
        <DataTable minWidth={780}>
          <thead><tr><th style={th}>Code</th><th style={th}>Line</th><th style={{ ...th, textAlign: 'right' }}>Agreed</th><th style={th}>Done</th><th style={th}>Priced by (from Books)</th><th style={th}><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {data.lines.map((l) => (
              <tr key={l.id} data-line={l.description}>
                <td style={td}>{l.code}</td>
                <td style={td}><strong style={{ fontWeight: 600 }}>{l.description}</strong>{l.tasks.total > 0 && <Chip style={{ marginLeft: 6 }}>{l.tasks.done} of {l.tasks.total} tasks done</Chip>}</td>
                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{l.unit ? `${num(l.quantity)} ${l.unit}` : '·'}</td>
                <td style={{ ...td, minWidth: 170 }}>
                  {moving?.id === l.id ? (
                    <form style={{ display: 'flex', gap: 6, alignItems: 'center' }} onSubmit={(e) => { e.preventDefault(); run(() => projectsAPI.changeScope(projectId, l.id, { progress: Number(moving.value), note: moving.note }), 'Progress recorded').then((ok) => ok && setMoving(null)); }}>
                      <TextInput aria-label={l.unit ? `Done, in ${l.unit}` : 'Done, in %'} type="number" min={0} step="any" value={moving.value} onChange={(e) => setMoving({ ...moving, value: e.target.value })} style={{ width: 90 }} required autoFocus />
                      <span style={{ fontSize: 12.5 }}>{l.unit ?? '%'}</span>
                      <TextInput aria-label="What was done (optional)" placeholder="Note" value={moving.note} maxLength={200} onChange={(e) => setMoving({ ...moving, note: e.target.value })} style={{ width: 120 }} />
                      <Btn type="submit" small variant="primary" busy={busy}>Save</Btn><Btn small onClick={() => setMoving(null)}>×</Btn>
                    </form>
                  ) : (
                    <div style={{ display: 'grid', gap: 4 }}>
                      <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-input)', overflow: 'hidden' }} aria-hidden="true"><div style={{ height: '100%', width: `${l.progress ?? 0}%`, background: l.progress >= 100 ? 'var(--status-success)' : 'var(--color-primary-500)' }} /></div>
                      <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{l.progress ?? 0}%{l.unit ? ` · ${num(l.done_quantity)} ${l.unit}` : ''}</span>
                    </div>
                  )}
                </td>
                <td style={td}>{l.priced_by ? (l.priced_by.gone ? <Chip status="warning">The Books line is gone</Chip> : <span style={{ fontSize: 12.5 }}>{l.priced_by.voucher}{l.priced_by.rate !== null ? ` · ${money(l.priced_by.rate)}${l.priced_by.unit ? ` per ${l.priced_by.unit}` : ''}` : ''}{l.priced_by.cancelled ? ' (cancelled)' : ''}</span>) : <span style={{ color: 'var(--text-secondary)' }}>·</span>}</td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {data.can.manage && moving?.id !== l.id && <Btn small onClick={() => setMoving({ id: l.id, value: String(l.unit ? l.done_quantity : (l.done_percent ?? 0)), note: '' })} aria-label={`Record progress on ${l.description}`}>Progress</Btn>}
                  {data.can.manage && <Btn small variant="quiet" aria-label={`Change ${l.description}`} onClick={() => setForm({ id: l.id, code: l.code ?? '', description: l.description, unit: l.unit ?? '', quantity: l.quantity ?? '', phase_id: l.phase_id ?? '', voucher_item_id: l.priced_by?.id ?? '' })}>Change</Btn>}
                  {data.can.manage && <Btn small variant="quiet" aria-label={`Delete ${l.description}`} onClick={() => run(() => projectsAPI.deleteScope(projectId, l.id), 'Line deleted')}>Delete</Btn>}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      {problem && !form && <Notice status="problem" style={{ marginTop: 10 }}>{problem}</Notice>}
    </Panel>
  );
}
