import { useEffect, useState } from 'react';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Field, Notice, SelectInput, TextInput } from './ui';

/**
 * Adding or changing an opportunity (build 3.2): a piece of work a lead or a client might give. `opportunity` is the one being changed;
 * for a new one `forWhom` can say who it is for ({ type: 'lead' | 'client', id, name }), else the form asks. `onSaved(opportunity)`.
 * What it is worth comes from the books once a quotation is linked; until then an estimate can be given, and it says so.
 */
export default function OpportunityForm({ opportunity, forWhom, onSaved, onCancel }) {
  const o = opportunity;
  const [options, setOptions] = useState(null);
  const [form, setForm] = useState({ title: o?.title || '', type_id: o?.kind?.id || '', owner_id: o?.owner?.id || '', expected_on: o?.expected_on || '', estimate: o?.estimate ?? '', estimate_currency: o?.estimate_currency || 'KES', notes: o?.notes || '' });
  const [who, setWho] = useState(o?.for || forWhom || null);
  const [kind, setKind] = useState('client');   // which of the two is being searched for
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [voucher, setVoucher] = useState(o?.value?.from === 'quotation' ? { id: o.quotation_voucher_id, title: o.value.title } : null);
  const [vq, setVq] = useState('');
  const [vouchers, setVouchers] = useState([]);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch) => { setForm({ ...form, ...patch }); setProblem(''); };

  useEffect(() => { projectsAPI.pipelineOptions().then(setOptions).catch(() => setOptions({ types: [], owners: [], can: { books: false } })); }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return undefined; }
    let live = true;
    const id = setTimeout(() => {
      const call = kind === 'client' ? projectsAPI.customers(q) : projectsAPI.leads({ scope: 'all', status: 'open', q }).then((r) => r.data);
      call.then((r) => { if (live) setFound(r); }).catch(() => { if (live) setFound([]); });
    }, 250);
    return () => { live = false; clearTimeout(id); };
  }, [q, kind]);
  useEffect(() => {
    if (!options?.can.books || vq.trim().length < 2) { setVouchers([]); return undefined; }
    let live = true;
    const id = setTimeout(() => { projectsAPI.pipelineQuotations(vq).then((r) => { if (live) setVouchers(r); }).catch(() => { if (live) setVouchers([]); }); }, 250);
    return () => { live = false; clearTimeout(id); };
  }, [vq, options]);

  const submit = async (e) => {
    e.preventDefault();
    if (!who) { setProblem('Say who it is for: a lead, or a client.'); return; }
    setBusy(true);
    const data = { title: form.title, type_id: form.type_id ? Number(form.type_id) : null, owner_id: form.owner_id ? Number(form.owner_id) : undefined, expected_on: form.expected_on || null,
      estimate: voucher || form.estimate === '' ? null : form.estimate, estimate_currency: form.estimate_currency, quotation_voucher_id: voucher?.id || null, notes: form.notes,
      ...(o ? {} : who.type === 'lead' ? { lead_id: who.id } : { customer_id: who.id }) };
    try { onSaved(o ? await projectsAPI.changeOpportunity(o.id, data) : await projectsAPI.addOpportunity(data)); }
    catch (err) { setProblem(message(err, 'That could not be saved. Try again.')); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <Field label="What the work is" htmlFor="opp-title"><TextInput id="opp-title" value={form.title} maxLength={160} onChange={(e) => set({ title: e.target.value })} required autoFocus={!o} /></Field>
        <Field label="Who it is for" htmlFor="opp-who" hint={who || o ? undefined : 'Type two letters to search.'}>
          {who
            ? <div style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 36 }}><strong style={{ fontSize: 13.5 }}>{who.name}</strong><span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{who.type === 'lead' ? 'a lead' : 'a client'}</span>{!o && !forWhom && <Btn small onClick={() => setWho(null)}>Change</Btn>}</div>
            : <>
              <div style={{ display: 'flex', gap: 6 }}>
                <SelectInput aria-label="A lead or a client" value={kind} onChange={(e) => { setKind(e.target.value); setFound([]); }} style={{ width: 110 }}><option value="client">A client</option><option value="lead">A lead</option></SelectInput>
                <TextInput id="opp-who" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" style={{ flex: 1 }} />
              </div>
              {found.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{found.map((c) => <Btn key={c.id} small onClick={() => { setWho({ type: kind, id: c.id, name: c.name }); setQ(''); setProblem(''); }}>{c.name}</Btn>)}</div>}
            </>}
        </Field>
        <Field label="Kind of work" htmlFor="opp-type">
          <SelectInput id="opp-type" value={form.type_id} onChange={(e) => set({ type_id: e.target.value })}>
            <option value="">Not decided</option>
            {(options?.types || []).map((t) => <option key={t.id} value={t.id}>{t.industry}: {t.name}</option>)}
          </SelectInput>
        </Field>
        <Field label="Owner" htmlFor="opp-owner">
          <SelectInput id="opp-owner" value={form.owner_id} onChange={(e) => set({ owner_id: e.target.value })}>
            {!o && <option value="">Me</option>}
            {(options?.owners || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </SelectInput>
        </Field>
        <Field label="Expected by" htmlFor="opp-expected"><TextInput id="opp-expected" type="date" value={form.expected_on} onChange={(e) => set({ expected_on: e.target.value })} /></Field>
      </div>

      <div style={{ padding: 12, borderRadius: 10, background: 'var(--surface-input)', display: 'grid', gap: 10 }}>
        <strong style={{ fontSize: 13.5 }}>What it is worth</strong>
        {voucher
          ? <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13.5 }}><span>From the books: <strong>{voucher.title}</strong>. Its total is read each time it is shown.</span><Btn small onClick={() => setVoucher(null)}>Unlink</Btn></div>
          : <>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) 100px', gap: 10, maxWidth: 360 }}>
              <Field label="Estimate" htmlFor="opp-estimate"><TextInput id="opp-estimate" type="number" min={0} step="0.01" value={form.estimate} onChange={(e) => set({ estimate: e.target.value })} /></Field>
              <Field label="Currency" htmlFor="opp-currency"><TextInput id="opp-currency" value={form.estimate_currency} maxLength={3} onChange={(e) => set({ estimate_currency: e.target.value.toUpperCase() })} /></Field>
            </div>
            <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>An estimate is a guess. It is never posted to the books, and a linked quotation replaces it.</span>
            {options?.can.books && (
              <Field label="Or link a quotation from the books" htmlFor="opp-voucher" hint="Type its number or the name on it.">
                <TextInput id="opp-voucher" value={vq} onChange={(e) => setVq(e.target.value)} autoComplete="off" style={{ maxWidth: 360 }} />
                {vouchers.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{vouchers.map((v) => <Btn key={v.id} small onClick={() => { setVoucher({ id: v.id, title: v.title }); setVq(''); }}>{v.title}{v.detail ? ` · ${v.detail}` : ''}</Btn>)}</div>}
              </Field>
            )}
          </>}
      </div>

      <Field label="Notes" htmlFor="opp-notes"><textarea id="opp-notes" value={form.notes} maxLength={5000} rows={2} onChange={(e) => set({ notes: e.target.value })}
        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line-strong)', background: 'var(--surface-input)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: 13.5, resize: 'vertical', boxSizing: 'border-box' }} /></Field>
      {problem && <Notice status="problem">{problem}</Notice>}
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn type="submit" variant="primary" busy={busy}>{o ? 'Save' : 'Add the opportunity'}</Btn>
        <Btn onClick={onCancel}>Cancel</Btn>
      </div>
    </form>
  );
}
