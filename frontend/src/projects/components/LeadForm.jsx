import { useEffect, useState } from 'react';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Field, Notice, SelectInput, TextInput } from './ui';
import KnownNotice from './KnownNotice';

/**
 * Adding or changing a lead (build 3.1). `lead` is the one being changed, or nothing for a new one. `onSaved(lead)` gets it back.
 * A lead is a person or company that is not a client yet; it is not a customer and Books does not know it.
 */
export default function LeadForm({ lead, onSaved, onCancel }) {
  const [options, setOptions] = useState(null);
  const [form, setForm] = useState({ name: lead?.name || '', contact_name: lead?.contact_name || '', email: lead?.email || '', phone: lead?.phone || '', source_id: lead?.source?.id || '',
    owner_id: lead?.owner?.id || '', industry_key: lead?.industry || '', notes: lead?.notes || '' });
  const [referrer, setReferrer] = useState(lead?.referred_by || null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch) => { setForm({ ...form, ...patch }); setProblem(''); };

  useEffect(() => { projectsAPI.leadOptions().then(setOptions).catch(() => setOptions({ sources: [], owners: [], industries: [] })); }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return undefined; }
    let live = true;
    const id = setTimeout(() => { projectsAPI.customers(q).then((r) => { if (live) setFound(r); }).catch(() => { if (live) setFound([]); }); }, 250);
    return () => { live = false; clearTimeout(id); };
  }, [q]);

  const isReferral = options?.sources.find((s) => String(s.id) === String(form.source_id))?.key === 'referral';
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const data = { ...form, source_id: form.source_id ? Number(form.source_id) : null, owner_id: form.owner_id ? Number(form.owner_id) : undefined, industry_key: form.industry_key || null, referred_by_customer_id: isReferral && referrer ? referrer.id : null };
    try { onSaved(lead ? await projectsAPI.changeLead(lead.id, data) : await projectsAPI.addLead(data)); }
    catch (err) { setProblem(message(err, 'That could not be saved. Try again.')); } finally { setBusy(false); }
  };

  // a source that has since been switched off stays offered for the lead that already has it
  const sources = options ? [...options.sources, ...(lead?.source && !options.sources.some((s) => s.id === lead.source.id) ? [lead.source] : [])] : [];

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <Field label="Lead (the company, or the person)" htmlFor="lead-name"><TextInput id="lead-name" value={form.name} maxLength={160} onChange={(e) => set({ name: e.target.value })} required autoFocus={!lead} /></Field>
        <Field label="Who to talk to there" htmlFor="lead-contact"><TextInput id="lead-contact" value={form.contact_name} maxLength={120} onChange={(e) => set({ contact_name: e.target.value })} /></Field>
        <Field label="Email" htmlFor="lead-email"><TextInput id="lead-email" type="email" value={form.email} maxLength={160} onChange={(e) => set({ email: e.target.value })} /></Field>
        <Field label="Phone" htmlFor="lead-phone"><TextInput id="lead-phone" value={form.phone} maxLength={40} onChange={(e) => set({ phone: e.target.value })} /></Field>
        <Field label="Where they came from" htmlFor="lead-source">
          <SelectInput id="lead-source" value={form.source_id} onChange={(e) => set({ source_id: e.target.value })}>
            <option value="">Not known</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </SelectInput>
        </Field>
        {isReferral && (
          <Field label="Referred by which client" htmlFor="lead-referrer" hint={referrer ? undefined : 'Type two letters to search.'}>
            {referrer
              ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><strong style={{ fontSize: 13.5 }}>{referrer.name}</strong><Btn small onClick={() => setReferrer(null)}>Change</Btn></div>
              : <>
                <TextInput id="lead-referrer" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
                {found.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{found.map((c) => <Btn key={c.id} small onClick={() => { setReferrer({ id: c.id, name: c.name }); setQ(''); }}>{c.name}</Btn>)}</div>}
              </>}
          </Field>
        )}
        <Field label="Industry" htmlFor="lead-industry">
          <SelectInput id="lead-industry" value={form.industry_key} onChange={(e) => set({ industry_key: e.target.value })}>
            <option value="">Not set</option>
            {(options?.industries || []).map((i) => <option key={i.key} value={i.key}>{i.name}</option>)}
          </SelectInput>
        </Field>
        <Field label="Owner" htmlFor="lead-owner">
          <SelectInput id="lead-owner" value={form.owner_id} onChange={(e) => set({ owner_id: e.target.value })}>
            {!lead && <option value="">Me</option>}
            {(options?.owners || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </SelectInput>
        </Field>
      </div>
      <Field label="Notes" htmlFor="lead-notes"><textarea id="lead-notes" value={form.notes} maxLength={5000} rows={3} onChange={(e) => set({ notes: e.target.value })}
        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line-strong)', background: 'var(--surface-input)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: 13.5, resize: 'vertical', boxSizing: 'border-box' }} /></Field>
      <KnownNotice name={form.name} email={form.email} phone={form.phone} except={lead ? { type: 'lead', id: lead.id } : null} />
      {problem && <Notice status="problem">{problem}</Notice>}
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn type="submit" variant="primary" busy={busy}>{lead ? 'Save' : 'Add the lead'}</Btn>
        <Btn onClick={onCancel}>Cancel</Btn>
      </div>
    </form>
  );
}
