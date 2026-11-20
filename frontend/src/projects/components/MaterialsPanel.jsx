import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message, money } from '../lib/format';
import { Btn, Chip, DataTable, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';
import { td, th } from './uiTokens';

const STATE = { open: ['info', 'Waiting'], part: ['warning', 'Part issued'], done: ['good', 'Issued'], cancelled: ['neutral', 'Cancelled'] };
const qty = (n, unit) => `${Number(n).toLocaleString('en-GB', { maximumFractionDigits: 4 })}${unit ? ` ${unit}` : ''}`;

/** A product from the catalogue, found by name, SKU or barcode. */
export function ProductPicker({ id, value, onChange }) {
  const [q, setQ] = useState(value?.name ?? '');
  const [found, setFound] = useState([]);
  const timer = useRef(null);
  useEffect(() => { setQ(value?.name ?? ''); }, [value]);
  const look = (text) => {
    setQ(text); onChange(null); clearTimeout(timer.current);
    if (text.trim().length < 2) { setFound([]); return; }
    timer.current = setTimeout(async () => { try { setFound((await projectsAPI.findMaterials(text)).products); } catch { setFound([]); } }, 250);
  };
  return (
    <div style={{ position: 'relative' }}>
      <TextInput id={id} value={q} autoComplete="off" placeholder="Name, SKU or barcode" onChange={(e) => look(e.target.value)} />
      {found.length > 0 && !value && (
        <ul role="listbox" style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, margin: '2px 0 0', padding: 4, listStyle: 'none', background: 'var(--surface-card)', border: '1px solid var(--line-strong)', borderRadius: 9, maxHeight: 220, overflowY: 'auto' }}>
          {found.map((p) => <li key={p.id} role="option" aria-selected="false"><button type="button" onClick={() => { onChange(p); setFound([]); }} style={{ width: '100%', textAlign: 'left', padding: '6px 8px', border: 0, background: 'none', cursor: 'pointer', font: 'inherit', color: 'var(--text-primary)' }}>{p.name}{p.unit ? ` · ${p.unit}` : ''}</button></li>)}
        </ul>
      )}
    </div>
  );
}

/**
 * Materials on a piece of work (docs/PROJECTS_STAGE10_SPEC.md, build 10.1): what is planned, asked for and issued. Issuing and returning go
 * through a Stock job for the work at that branch, so stock and the books move; the cost shown is read from Stock.
 */
export default function MaterialsPanel({ projectId, word = (k) => k }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);   // { mode: 'plan' | 'ask', product, quantity, location_id, needed_on, note }
  const [showIssued, setShowIssued] = useState(false);
  const [problem, setProblem] = useState('');
  const load = useCallback(async () => { try { setData(await projectsAPI.materials(projectId)); } catch (e) { setProblem(message(e, 'The materials could not be loaded.')); } }, [projectId]);
  useEffect(() => { load(); }, [load]);
  if (!data) return problem ? <Notice status="problem">{problem}</Notice> : null;
  if (!data.ready) return <Notice>The site is not set up yet. Run script 267.</Notice>;
  const run = async (fn, done) => { try { setData(await fn()); setProblem(''); if (done) toast.success(done); return true; } catch (e) { setProblem(message(e, 'That could not be done.')); return false; } };
  const send = async (e) => {
    e.preventDefault();
    if (!form.product) { setProblem('Choose a product from the list.'); return; }
    const ok = form.mode === 'plan'
      ? await run(() => projectsAPI.planMaterial(projectId, { variant_id: form.product.id, quantity: Number(form.quantity), note: form.note || null }), 'Planned')
      : await run(() => projectsAPI.askMaterial(projectId, { variant_id: form.product.id, quantity: Number(form.quantity), location_id: Number(form.location_id), needed_on: form.needed_on || null, note: form.note || null }), 'Asked. Whoever keeps the store is told.');
    if (ok) setForm(null);
  };
  const issue = (r) => { const left = r.quantity - r.issued; const n = window.prompt(`How much ${r.name} to issue? (${qty(left, r.unit)} still asked for)`, String(left)); if (n && Number(n) > 0) run(() => projectsAPI.issueMaterials(projectId, { request_id: r.id, items: [{ quantity: Number(n) }] }), 'Issued'); };
  const giveBack = (l) => { const n = window.prompt(`How much ${l.name} goes back to stock?`, String(l.quantity)); if (n && Number(n) > 0) run(() => projectsAPI.returnMaterial(projectId, l.id, Number(n)), 'Returned to stock'); };
  const open = (mode) => setForm({ mode, product: null, quantity: '', location_id: data.site.location_id ?? data.branches[0]?.id ?? '', needed_on: '', note: '' });
  const waiting = data.requests.filter((r) => r.state === 'open' || r.state === 'part');

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Panel data-materials>
        <PanelTitle hint="Planned, still waiting at the store, and issued to the work" right={data.can.plan && !form ? <span style={{ display: 'flex', gap: 6 }}><Btn small onClick={() => open('ask')}>Ask for materials</Btn><Btn small variant="quiet" onClick={() => open('plan')}>Plan a material</Btn></span> : null}>{word('material', true)}</PanelTitle>
        {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
        {form && (
          <form onSubmit={send} data-material-form style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 12 }}>
            <Field label="Product" htmlFor="mt-product"><ProductPicker id="mt-product" value={form.product} onChange={(p) => setForm((f) => ({ ...f, product: p }))} /></Field>
            <Field label={form.mode === 'plan' ? 'Needed in all' : 'How much'} htmlFor="mt-qty"><TextInput id="mt-qty" type="number" min="0" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required /></Field>
            {form.mode === 'ask' && <>
              <Field label="From" htmlFor="mt-branch"><SelectInput id="mt-branch" value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })} required>{data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectInput></Field>
              <Field label="Needed by (optional)" htmlFor="mt-needed"><TextInput id="mt-needed" type="date" value={form.needed_on} onChange={(e) => setForm({ ...form, needed_on: e.target.value })} /></Field>
            </>}
            <Field label="Note (optional)" htmlFor="mt-note"><TextInput id="mt-note" value={form.note} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
            <span style={{ display: 'flex', gap: 6, alignItems: 'end' }}><Btn type="submit" small variant="primary">{form.mode === 'plan' ? 'Plan it' : 'Ask'}</Btn><Btn small onClick={() => setForm(null)}>Cancel</Btn></span>
          </form>
        )}
        {data.materials.length === 0 ? <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>Nothing planned or asked for yet.</p> : (
          <DataTable minWidth={560}>
            <thead><tr><th style={th}>Material</th><th style={th}>Planned</th><th style={th}>Waiting</th><th style={th}>Issued</th>{data.can.see_cost && <th style={th}>Cost</th>}</tr></thead>
            <tbody>
              {data.materials.map((m) => (
                <tr key={m.variant_id} data-material={m.name}>
                  <td style={td}>{m.name}</td>
                  <td style={td}>{m.planned == null ? '—' : qty(m.planned, m.unit)}</td>
                  <td style={td}>{m.waiting > 0 ? <Chip status="info">{qty(m.waiting, m.unit)}</Chip> : '—'}</td>
                  <td style={td}>{qty(m.issued, m.unit)}{m.planned ? <span style={{ color: m.issued > m.planned ? 'var(--status-error)' : 'var(--text-secondary)', fontSize: 12 }}> · {Math.round((m.issued / m.planned) * 100)}%</span> : null}</td>
                  {data.can.see_cost && <td style={td}>{money(m.cost)}</td>}
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
        {data.can.see_cost && data.cost > 0 && <p style={{ margin: '8px 0 0', fontSize: 13 }}>Issued so far: <strong>{money(data.cost)}</strong>, at what it cost in stock.</p>}
        {data.jobs.length > 0 && <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)' }} data-material-jobs>Stock jobs: {data.jobs.map((j) => `${j.number} (${j.branch ?? 'branch'}, ${j.status})`).join(', ')}</p>}
      </Panel>

      <Panel data-material-requests>
        <PanelTitle hint={data.can.issue ? 'Issue from the store; it goes through the work\'s Stock job at that branch' : 'Whoever keeps the store issues them'}>Asked for</PanelTitle>
        {data.requests.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>Nothing asked for yet.</p>}
        {data.requests.map((r) => (
          <div key={r.id} data-material-request={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <strong>{qty(r.quantity, r.unit)} × {r.name}</strong>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>from {r.branch}{r.needed_on ? ` · by ${day(r.needed_on)}` : ''}{r.asked_by ? ` · ${r.asked_by}` : ''}{r.issued > 0 && r.state !== 'done' ? ` · ${qty(r.issued, r.unit)} issued` : ''}{r.note ? ` · "${r.note}"` : ''}</span>
            </span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {r.late && <Chip status="problem">Late</Chip>}<Chip status={STATE[r.state][0]}>{STATE[r.state][1]}</Chip>
              {data.can.issue && (r.state === 'open' || r.state === 'part') && <Btn small variant="primary" onClick={() => issue(r)}>Issue</Btn>}
              {(r.state === 'open' || r.state === 'part') && data.can.plan && <Btn small variant="quiet" onClick={() => run(() => projectsAPI.closeMaterialRequest(projectId, r.id), 'Closed')}>Close</Btn>}
            </span>
          </div>
        ))}
        {waiting.length === 0 && data.requests.length > 0 && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>Nothing is waiting at the store.</p>}
        {data.issued.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <Btn small variant="quiet" aria-expanded={showIssued} onClick={() => setShowIssued(!showIssued)}>{showIssued ? 'Hide what was issued' : `What was issued (${data.issued.length})`}</Btn>
            {showIssued && data.issued.map((l) => (
              <div key={l.id} data-issued-line={l.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                <span>{qty(l.quantity, l.unit)} × {l.name} <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>· {l.job} · {l.at?.slice(0, 10)}</span></span>
                {data.can.issue && l.open && l.quantity > 0 && <Btn small variant="quiet" onClick={() => giveBack(l)}>Return to stock</Btn>}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
