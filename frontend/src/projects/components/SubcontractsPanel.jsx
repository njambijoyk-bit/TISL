import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message, money } from '../lib/format';
import Finder from './Finder';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';

const STATE = { active: ['info', 'Active'], complete: ['good', 'Complete'], ended: ['neutral', 'Ended'] };
const CLAIM = { submitted: ['warning', 'Waiting'], certified: ['good', 'Certified'], rejected: ['problem', 'Not certified'] };
const vendorName = (v) => `${v.name}${v.number ? ` · ${v.number}` : ''}`;
const lookVendors = async (q) => (await projectsAPI.findVendors(q)).vendors;
const pct = (n) => `${Number(n).toLocaleString('en-GB', { maximumFractionDigits: 2 })}%`;
const quiet = { fontSize: 12, color: 'var(--text-secondary)' };

/**
 * Subcontracts (docs/PROJECTS_STAGE10_SPEC.md, build 10.3): a vendor, what they do and the vendor order that holds the agreed value. Claims
 * say how far the whole work is; certifying posts a supplier bill in Books for the difference since the last certificate and holds
 * retention back. Amounts show only to those who see the work's money.
 */
export default function SubcontractsPanel({ projectId, word = (k) => k }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [claimOn, setClaimOn] = useState(null);
  const [problem, setProblem] = useState('');
  const load = useCallback(async () => { try { setData(await projectsAPI.subcontracts(projectId)); } catch (e) { setProblem(message(e, 'The subcontracts could not be loaded.')); } }, [projectId]);
  useEffect(() => { load(); }, [load]);
  if (!data) return problem ? <Notice status="problem">{problem}</Notice> : null;
  if (!data.ready) return <Notice>The site is not set up yet. Run script 267.</Notice>;
  const run = async (fn, done) => { try { setData(await fn()); setProblem(''); if (done) toast.success(done); return true; } catch (e) { setProblem(message(e, 'That could not be done.')); return false; } };
  const add = async (e) => {
    e.preventDefault();
    if (!form.vendor) { setProblem('Choose the subcontractor from the vendors.'); return; }
    if (await run(() => projectsAPI.addSubcontract(projectId, { vendor_id: form.vendor.id, vendor_order_id: form.order ? Number(form.order) : null, title: form.title, scope: form.scope || null, retention_pct: Number(form.retention_pct || 0), starts_on: form.starts_on || null, ends_on: form.ends_on || null }), 'Added')) setForm(null);
  };
  const claim = async (e) => { e.preventDefault(); if (await run(() => projectsAPI.claimSubcontract(projectId, claimOn.id, { claimed_pct: Number(claimOn.pct), period_to: claimOn.period_to || null, note: claimOn.note || null }), 'Claim made')) setClaimOn(null); };
  const certify = (c) => { const n = window.prompt(`Certify claim ${c.number} to what % of the whole? (claimed ${pct(c.claimed_pct)})`, String(c.claimed_pct)); if (n !== null && n !== '') { const note = Number(n) < c.claimed_pct ? (window.prompt('Why less than claimed? (optional)') ?? '') : ''; run(() => projectsAPI.certifyClaim(projectId, c.id, { certified_pct: Number(n), note: note || null }), 'Certified: the bill is in the books'); } };
  const reject = (c) => { const note = window.prompt(`Why is claim ${c.number} not certified?`); if (note) run(() => projectsAPI.rejectClaim(projectId, c.id, note), 'Not certified'); };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Panel data-subcontracts>
        <PanelTitle hint="Each on a vendor order; certified claims are supplier bills in the books" right={data.can.manage && !form ? <Btn small onClick={() => setForm({ vendor: null, order: '', title: '', scope: '', retention_pct: '', starts_on: '', ends_on: '' })}>Add a subcontract</Btn> : null}>{word('subcontractor', true)}</PanelTitle>
        {problem && <Notice status="problem" style={{ marginBottom: 10 }}>{problem}</Notice>}
        {data.can.manage && !data.ledgers_chosen && <Notice status="warning" style={{ marginBottom: 10 }}>Choose the subcontract ledgers in Configuration → Site before certifying a claim.</Notice>}
        {form && (
          <form onSubmit={add} data-subcontract-form style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginBottom: 12 }}>
            <Field label="Subcontractor" htmlFor="sc-vendor"><Finder id="sc-vendor" value={form.vendor} onChange={(vendor) => setForm((f) => ({ ...f, vendor, order: '' }))} look={lookVendors} label={vendorName} placeholder="Name or number" /></Field>
            <Field label="Vendor order (the agreed value)" htmlFor="sc-order"><SelectInput id="sc-order" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} disabled={!form.vendor}><option value="">Choose later</option>{(form.vendor?.orders ?? []).map((o) => <option key={o.id} value={o.id}>{o.number} ({o.status})</option>)}</SelectInput></Field>
            <Field label="For" htmlFor="sc-title"><TextInput id="sc-title" value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
            <Field label="Retention %" htmlFor="sc-ret"><TextInput id="sc-ret" type="number" min="0" max="50" step="any" value={form.retention_pct} onChange={(e) => setForm({ ...form, retention_pct: e.target.value })} /></Field>
            <Field label="From (optional)" htmlFor="sc-from"><TextInput id="sc-from" type="date" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} /></Field>
            <Field label="To (optional)" htmlFor="sc-to"><TextInput id="sc-to" type="date" value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} /></Field>
            <Field label="What they do (optional)" htmlFor="sc-scope" style={{ gridColumn: '1 / -1' }}><TextInput id="sc-scope" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} /></Field>
            <span style={{ display: 'flex', gap: 6, alignItems: 'end' }}><Btn type="submit" small variant="primary">Add it</Btn><Btn small onClick={() => setForm(null)}>Cancel</Btn></span>
          </form>
        )}
        {data.subcontracts.length === 0 && !form && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No subcontracts yet.</p>}
      </Panel>

      {data.subcontracts.map((s) => {
        const waiting = s.claims.some((c) => c.state === 'submitted');
        return (
          <Panel key={s.id} data-subcontract={s.title}>
            <PanelTitle hint={`${s.vendor}${s.order ? ` · ${s.order.number}` : ' · no vendor order yet'} · retention ${pct(s.retention_pct)}${s.starts_on ? ` · from ${day(s.starts_on)}` : ''}${s.ends_on ? ` to ${day(s.ends_on)}` : ''}`}
              right={<Chip status={STATE[s.state][0]}>{STATE[s.state][1]}</Chip>}>{s.title}</PanelTitle>
            {s.scope && <p style={{ margin: '0 0 8px', fontSize: 13.5 }}>{s.scope}</p>}
            <div aria-label={`Certified ${pct(s.certified_pct)}`} style={{ height: 8, borderRadius: 999, background: 'var(--surface-hover)', overflow: 'hidden', margin: '4px 0 6px' }}><div style={{ width: `${Math.min(100, s.certified_pct)}%`, height: '100%', background: 'var(--color-primary-500)' }} /></div>
            <p style={{ margin: 0, fontSize: 13 }} data-subcontract-totals>Certified {pct(s.certified_pct)}{data.can.money && s.value != null ? ` · ${money(s.certified)} of ${money(s.value)} before tax · held back ${money(s.held)}${s.released ? ' (released)' : ''}` : ''}</p>
            {data.can.manage && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0 4px' }}>
                {s.state === 'active' && !waiting && <Btn small onClick={() => setClaimOn({ id: s.id, pct: '', period_to: '', note: '' })}>Make a claim</Btn>}
                {s.state === 'active' && <Btn small variant="quiet" onClick={() => run(() => projectsAPI.saveSubcontract(projectId, s.id, { state: 'complete' }), 'Marked complete')}>Mark complete</Btn>}
                {s.state !== 'active' && !s.released && (s.held ?? 0) > 0 && <Btn small variant="quiet" onClick={() => run(() => projectsAPI.releaseSubRetention(projectId, s.id), 'Retention released')}>Release retention</Btn>}
              </div>
            )}
            {claimOn?.id === s.id && (
              <form onSubmit={claim} data-claim-form style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, margin: '8px 0' }}>
                <Field label="How far the whole work is (%)" htmlFor="cl-pct"><TextInput id="cl-pct" type="number" min="0" max="100" step="any" value={claimOn.pct} onChange={(e) => setClaimOn({ ...claimOn, pct: e.target.value })} required /></Field>
                <Field label="Up to (optional)" htmlFor="cl-to"><TextInput id="cl-to" type="date" value={claimOn.period_to} onChange={(e) => setClaimOn({ ...claimOn, period_to: e.target.value })} /></Field>
                <Field label="Note (optional)" htmlFor="cl-note"><TextInput id="cl-note" value={claimOn.note} onChange={(e) => setClaimOn({ ...claimOn, note: e.target.value })} /></Field>
                <span style={{ display: 'flex', gap: 6, alignItems: 'end' }}><Btn type="submit" small variant="primary">Claim</Btn><Btn small onClick={() => setClaimOn(null)}>Cancel</Btn></span>
              </form>
            )}
            {s.claims.map((c) => (
              <div key={c.id} data-claim={c.number} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--line)', fontSize: 13.5 }}>
                <span>Claim {c.number}: <strong>{pct(c.claimed_pct)}</strong>{c.certified_pct != null ? `, certified ${pct(c.certified_pct)}` : ''} <span style={quiet}>{c.period_to ? `· up to ${day(c.period_to)} ` : ''}{c.by_vendor ? '· from the subcontractor ' : ''}{c.note ? `· "${c.note}" ` : ''}{c.answer_note ? `· answer: "${c.answer_note}" ` : ''}{c.bill ? `· ${c.bill.number}${c.bill.total != null ? ` ${money(c.bill.total)}` : ''}` : ''}</span></span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Chip status={CLAIM[c.state][0]}>{CLAIM[c.state][1]}</Chip>
                  {c.state === 'submitted' && data.can.manage && <><Btn small variant="primary" onClick={() => certify(c)}>Certify</Btn><Btn small variant="quiet" onClick={() => reject(c)}>Not certified</Btn></>}
                </span>
              </div>
            ))}
          </Panel>
        );
      })}
    </div>
  );
}
