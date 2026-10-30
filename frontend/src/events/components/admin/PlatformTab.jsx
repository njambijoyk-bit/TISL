import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, ChevronRight, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import eventsAPI from '../../../_shared/api/events';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import Modal from '../../../core/components/admin/ui/Modal';
import SimpleTable from '../../../core/components/admin/ui/SimpleTable';
import { CheckboxRow, Field, FormGrid, FormStack, ModalActions, NumberInput, SelectInput, TextArea, TextInput } from '../../../core/components/admin/ui/Form';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';

const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.74rem' };
const SECTIONS = [{ id: 'categories', label: 'Categories' }, { id: 'organisers', label: 'Organisers' }, { id: 'vendors', label: 'Vendors' }, { id: 'venues', label: 'Venues' }];
const TONE = { verified: [colors.successBg, colors.successText], pending: [colors.warningBg, colors.warningText], suspended: [colors.dangerBg, colors.dangerText], rejected: [colors.dangerBg, colors.dangerText] };

function Pill({ status }) {
  const [bg, fg] = TONE[status] ?? [colors.tint(0.08), colors.textMuted];
  return <span style={{ background: bg, color: fg, padding: '2px 9px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, textTransform: 'capitalize' }}>{status}</span>;
}

/** Events → Platform (events.admin): the category tree, and the outside organisers, vendors and venues waiting to be verified. */
export default function PlatformTab() {
  const [section, setSection] = useState('categories');
  return (
    <div>
      <div role="tablist" aria-label="Platform" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={section === s.id} onClick={() => setSection(s.id)}
            style={{ ...btnGhost, padding: '6px 14px', fontSize: '0.8rem', ...(section === s.id ? { background: colors.primary, color: '#fff', borderColor: colors.primary } : {}) }}>{s.label}</button>
        ))}
      </div>
      {section === 'categories' ? <Categories /> : <Providers key={section} kind={section} />}
    </div>
  );
}

// ── categories ───────────────────────────────────────────────────────────

function Categories() {
  const [tree, setTree] = useState([]);
  const [modes, setModes] = useState({});
  const [ready, setReady] = useState(true);
  const [edit, setEdit] = useState(null);   // the category being written
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => eventsAPI.categories().then((r) => { setTree(r.data); setModes(r.participation ?? {}); setReady(true); })
    .catch((e) => { if (e?.response?.status === 409) setReady(false); else toast.error(errMsg(e, 'Could not load the categories')); }), []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      await eventsAPI.saveCategory(edit.id, { name: edit.name, parent_id: edit.parent_id || null, icon: edit.icon || null, description: edit.description || null, default_participation: edit.default_participation || null, is_active: edit.is_active });
      toast.success('Saved'); setEdit(null); load();
    } catch (e) { toast.error(errMsg(e, 'Could not save'), { duration: 8000 }); } finally { setBusy(false); }
  };
  const remove = async (c) => {
    try { const r = await eventsAPI.removeCategory(c.id); toast.success(r.message); load(); } catch (e) { toast.error(errMsg(e, 'Could not delete')); }
  };
  const standard = async () => {
    try { const r = await eventsAPI.standardCategories(); toast.success(r.made ? `${r.made} categories added` : 'Already there'); setTree(r.data); } catch (e) { toast.error(errMsg(e, 'Could not add them')); }
  };

  if (!ready) return <p role="status" style={{ fontSize: '0.82rem', color: colors.textMuted }}>Run database script 253_events_foundation.sql, then reload.</p>;
  const roots = tree.map((c) => ({ id: c.id, name: c.name }));
  const row = (c, depth) => (
    <div key={c.id}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', paddingLeft: 12 + depth * 24, borderBottom: `1px solid ${colors.tint(0.07)}`, opacity: c.is_active ? 1 : 0.55 }}>
        {depth > 0 && <ChevronRight size={12} aria-hidden="true" color={colors.textFaint} />}
        <span style={{ fontWeight: depth ? 500 : 700, flex: 1 }}>{c.name}{!c.is_active && <em style={{ fontWeight: 400, color: colors.textFaint }}> · off</em>}</span>
        <span style={{ fontSize: '0.74rem', color: colors.textFaint }}>{c.events} event{c.events === 1 ? '' : 's'}</span>
        <button type="button" style={small} onClick={() => setEdit({ ...c, parent_id: c.parent_id ?? '' })} aria-label={`Edit ${c.name}`}><Pencil size={12} /></button>
        <button type="button" style={{ ...small, color: colors.danger }} onClick={() => remove(c)} aria-label={`Delete ${c.name}`}><Trash2 size={12} /></button>
      </div>
      {c.children.map((k) => row(k, depth + 1))}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button type="button" style={btnPrimary} onClick={() => setEdit({ id: null, name: '', parent_id: '', icon: '', description: '', default_participation: '', is_active: true })}><Plus size={14} /> New category</button>
        <button type="button" style={btnGhost} onClick={standard}><Sparkles size={14} /> Add the standard set</button>
      </div>
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        {tree.length ? tree.map((c) => row(c, 0)) : <p style={{ margin: 0, padding: 20, fontSize: '0.84rem', color: colors.textMuted }}>No categories yet. "Add the standard set" gives you weddings, corporate, entertainment, exhibitions, community and sports to start from.</p>}
      </div>
      {edit && (
        <Modal title={edit.id ? 'Edit category' : 'New category'} width={480} onClose={() => setEdit(null)}
          footer={<ModalActions onCancel={() => setEdit(null)} onSubmit={save} busy={busy} disabled={!edit.name.trim()} submitLabel="Save" busyLabel="Saving…" />}>
          <FormStack>
            <Field label="Name" htmlFor="cat-name"><TextInput id="cat-name" maxLength={120} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <FormGrid min={180}>
              <Field label="Under" htmlFor="cat-parent" hint="Two levels only."><SelectInput id="cat-parent" value={edit.parent_id} onChange={(e) => setEdit({ ...edit, parent_id: e.target.value })}>
                <option value="">Top level</option>{roots.filter((r) => r.id !== edit.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</SelectInput></Field>
              <Field label="Usually" htmlFor="cat-part" hint="How people join events of this kind."><SelectInput id="cat-part" value={edit.default_participation ?? ''} onChange={(e) => setEdit({ ...edit, default_participation: e.target.value })}>
                <option value="">No default</option>{Object.entries(modes).map(([k, v]) => <option key={k} value={k}>{typeof v === 'string' ? v : k}</option>)}</SelectInput></Field>
            </FormGrid>
            <Field label="Description" htmlFor="cat-desc"><TextArea id="cat-desc" rows={3} maxLength={300} value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <CheckboxRow checked={edit.is_active} onChange={(v) => setEdit({ ...edit, is_active: v })} label="In use" description="Switch off to stop offering it on new events." />
          </FormStack>
        </Modal>
      )}
    </div>
  );
}

// ── organisers, vendors and venues ───────────────────────────────────────

function Providers({ kind }) {
  const singular = kind.replace(/s$/, '').replace(/ue$/, 'ue');
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);   // the one being looked at

  const load = useCallback(() => {
    setLoading(true);
    return eventsAPI.providers(kind, status).then(setRows).catch((e) => toast.error(errMsg(e, 'Could not load them'))).finally(() => setLoading(false));
  }, [kind, status]);
  useEffect(() => { load(); }, [load]);

  const columns = [
    { key: 'name', label: singular[0].toUpperCase() + singular.slice(1), render: (r) => <button type="button" onClick={() => setOpen(r.id)} style={{ background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 700, color: colors.primary, cursor: 'pointer', textAlign: 'left' }}>{r.name}{r.is_internal && <em style={{ fontWeight: 400, color: colors.textFaint }}> · TISL</em>}</button> },
    { key: 'status', label: 'Status', render: (r) => <Pill status={r.status} /> },
    { key: 'commission_in_force', label: 'Commission', align: 'right', render: (r) => (r.commission_in_force != null ? `${r.commission_in_force}%` : '—') },
    { key: 'events', label: 'Events', align: 'right', render: (r) => (r.events ?? '—') },
    { key: 'documents_waiting', label: 'Proof waiting', align: 'right', render: (r) => (r.documents_waiting ? <strong style={{ color: colors.warningText }}>{r.documents_waiting}</strong> : '—') },
  ];

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <SelectInput value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" style={{ width: 'auto' }}>
          <option value="">Any status</option><option value="pending">Waiting for verification</option><option value="verified">Verified</option><option value="suspended">Suspended</option><option value="rejected">Rejected</option>
        </SelectInput>
      </div>
      <SimpleTable columns={columns} rows={rows} loading={loading} empty={status === 'pending' ? `No ${kind} are waiting for verification.` : `No ${kind} yet.`} />
      {open && <ProviderModal kind={kind} id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

function ProviderModal({ kind, id, onClose, onChanged }) {
  const [p, setP] = useState(null);
  const [note, setNote] = useState('');
  const [rate, setRate] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => eventsAPI.provider(kind, id).then((d) => { setP(d); setRate(d.commission_percent ?? ''); }).catch((e) => { toast.error(errMsg(e, 'Could not open it')); onClose(); }), [kind, id, onClose]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, ok) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); onChanged(); } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 8000 }); } finally { setBusy(false); }
  };
  if (!p) return null;
  const line = (label, v) => (v ? <p style={{ margin: '0 0 4px', fontSize: '0.82rem' }}><span style={{ color: colors.textFaint }}>{label}: </span>{v}</p> : null);

  return (
    <Modal title={p.name} subtitle={<Pill status={p.status} />} width={620} onClose={onClose}>
      <FormStack gap={16}>
        <div>
          {line('Email', p.email)}{line('Phone', p.phone)}{line('Website', p.website)}{line('Tax PIN', p.tax_pin)}{line('Registration no.', p.registration_no)}
          {line('Area', [p.town, p.county].filter(Boolean).join(', '))}{line('Offers', p.category_name)}{line('About', p.description || p.summary)}
          {p.status_note && line('Last note', p.status_note)}
        </div>

        <div>
          <p style={{ margin: '0 0 6px', fontSize: '0.8rem', fontWeight: 700 }}>Proof they sent</p>
          {(p.documents ?? []).length === 0 ? <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textFaint }}>Nothing uploaded yet. Ask for an ID, business registration or tax PIN certificate before you verify.</p> : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
              {p.documents.map((d) => (
                <li key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
                  <span style={{ flex: 1 }}>{(d.title || d.type || '').replace(/_/g, ' ')} · <em style={{ color: colors.textFaint }}>{d.status}</em></span>
                  {d.status === 'pending' && <>
                    <button type="button" style={small} disabled={busy} onClick={() => act(() => eventsAPI.reviewDocument(d.id, 'accepted'), 'Accepted')}><Check size={12} /> Accept</button>
                    <button type="button" style={{ ...small, color: colors.danger }} disabled={busy} onClick={() => act(() => eventsAPI.reviewDocument(d.id, 'rejected', note), 'Rejected')}><X size={12} /> Reject</button>
                  </>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <FormGrid min={200}>
          <Field label="Commission on their sales (%)" htmlFor="pv-rate" hint={`Leave empty for the events default (${p.commission_in_force ?? 10}% now).`}>
            <div style={{ display: 'flex', gap: 8 }}>
              <NumberInput id="pv-rate" min={0} max={100} step="0.1" value={rate} onChange={(e) => setRate(e.target.value)} />
              <button type="button" style={btnGhost} disabled={busy} onClick={() => act(() => eventsAPI.setProviderCommission(kind, id, rate === '' ? null : Number(rate)), 'Commission saved')}>Save</button>
            </div>
          </Field>
          <Field label="Note (shown to them)" htmlFor="pv-note"><TextInput id="pv-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why, if you suspend or reject" /></Field>
        </FormGrid>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {p.status !== 'verified' && <button type="button" style={btnPrimary} disabled={busy} onClick={() => act(() => eventsAPI.setProviderStatus(kind, id, 'verified', note), 'Verified')}><Check size={14} /> Verify</button>}
          {p.status !== 'rejected' && !p.is_internal && <button type="button" style={btnGhost} disabled={busy} onClick={() => act(() => eventsAPI.setProviderStatus(kind, id, 'rejected', note), 'Rejected')}>Reject</button>}
          {p.status === 'verified' && !p.is_internal && <button type="button" style={{ ...btnGhost, color: colors.danger }} disabled={busy} onClick={() => act(() => eventsAPI.setProviderStatus(kind, id, 'suspended', note), 'Suspended')}>Suspend</button>}
          {p.status !== 'pending' && !p.is_internal && <button type="button" style={btnGhost} disabled={busy} onClick={() => act(() => eventsAPI.setProviderStatus(kind, id, 'pending', note), 'Sent back to pending')}>Back to pending</button>}
        </div>
      </FormStack>
    </Modal>
  );
}
