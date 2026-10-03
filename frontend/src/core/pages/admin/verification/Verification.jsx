import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../components/admin/ui/HubHeader';
import Modal from '../../../components/admin/ui/Modal';
import { Field, SelectInput, TextInput, FormStack, ModalActions } from '../../../components/admin/ui/Form';
import verificationAPI from '../../../../_shared/api/verification';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';
import { money } from '../../../components/admin/books/booksFmt';

/**
 * Verification: a second pair of eyes that never changes the books. Pick a month, open a type, and go through what you have been given to check: record that it is
 * verified, or an observation to clarify internally, or a query that needs clarifying from outside — each with a note. Everything is logged with who and when.
 * A verified voucher that is edited afterwards comes back as altered. What is left shows on your calendar.
 */

const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 };
const th = { padding: '8px 10px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}`, verticalAlign: 'top' };
const CHIP = { pending: ['#6b7280', '#f3f4f6'], verified: ['#15803d', '#dcfce7'], internal_observation: ['#b45309', '#fef3c7'], internal_clarified: ['#0369a1', '#e0f2fe'], external_query: ['#b91c1c', '#fee2e2'], external_clarified: ['#0369a1', '#e0f2fe'], altered: ['#7c2d12', '#ffedd5'] };
const mname = (m) => new Date(`${m}-01`).toLocaleString([], { month: 'long', year: 'numeric' });
const Chip = ({ s, label }) => <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, color: CHIP[s]?.[0], background: CHIP[s]?.[1], whiteSpace: 'nowrap' }}>{label}</span>;

function Detail({ d }) {
  if (!d) return <p style={{ color: colors.textMuted, fontSize: '0.8rem' }}>This record is no longer there.</p>;
  if (d.kind === 'voucher') {
    const s = d.snapshot;
    return (
      <div style={{ fontSize: '0.78rem', display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>{Object.entries(s.header).map(([k, v]) => <span key={k}><span style={{ color: colors.textFaint }}>{k}: </span><strong>{typeof v === 'number' ? money(v) : String(v)}</strong></span>)}</div>
        {d.created_by && <div style={{ color: colors.textFaint }}>Entered by {d.created_by}{d.versions > 1 ? ` · edited — ${d.versions} versions` : ''}</div>}
        {s.items?.length > 0 && <div><div style={{ fontWeight: 700 }}>Items</div>{s.items.map((i, n) => <div key={n} style={{ color: colors.textMuted }}>{Object.entries(i).map(([k, v]) => `${k} ${typeof v === 'number' ? money(v) : v}`).join(' · ')}</div>)}</div>}
        {s.entries?.length > 0 && <div><div style={{ fontWeight: 700 }}>Accounts</div>{s.entries.map((e, n) => <div key={n} style={{ color: colors.textMuted }}>{e.Ledger} — {e.Amount}</div>)}</div>}
        {s.payments?.length > 0 && <div><div style={{ fontWeight: 700 }}>Payments</div>{s.payments.map((p, n) => <div key={n} style={{ color: colors.textMuted }}>{Object.values(p).join(' · ')}</div>)}</div>}
      </div>
    );
  }
  if (d.kind === 'payroll') {
    const r = d.run;
    return (
      <div style={{ fontSize: '0.78rem' }}>
        <div>Gross <strong>{money(r.total_gross)}</strong> · deductions <strong>{money(r.total_deductions)}</strong> · net <strong>{money(r.total_net)}</strong> · employer cost <strong>{money(r.total_employer)}</strong> · {r.status}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}><tbody>{r.lines.map((l) => <tr key={l.user_id}><td style={td}>{l.name}</td><td style={{ ...td, textAlign: 'right' }}>{money(l.gross)}</td><td style={{ ...td, textAlign: 'right' }}>{money(l.total_deductions)}</td><td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(l.net)}</td></tr>)}</tbody></table>
      </div>
    );
  }
  return (
    <div style={{ fontSize: '0.78rem' }}>
      <div><strong>{d.name}</strong> — {d.total_days} days marked, {d.verified_days} verified, {Math.round(d.overtime_minutes / 60 * 10) / 10} h overtime</div>
      <div style={{ color: colors.textMuted }}>{Object.entries(d.counts).map(([k, v]) => `${k.replace('_', ' ')} ${v}`).join(' · ')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>{d.days.map((x) => <span key={x.date} title={`${x.in ?? ''}–${x.out ?? ''}`} style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: 4, background: x.verified ? '#dcfce7' : '#fef3c7' }}>{x.date.slice(8)} {x.status.slice(0, 3)}</span>)}</div>
    </div>
  );
}

function ItemModal({ id, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const [status, setStatus] = useState('verified');
  const [note, setNote] = useState('');
  const [by, setBy] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => verificationAPI.show(id).then(setD).catch((e) => { toast.error(errMsg(e, 'Could not open it')); onClose(); }), [id, onClose]);
  useEffect(() => { load(); }, [load]);
  if (!d) return null;
  const it = d.item;
  const next = { pending: ['verified', 'internal_observation', 'external_query'], altered: ['verified', 'internal_observation', 'external_query'], verified: ['internal_observation', 'external_query'],
    internal_observation: ['internal_clarified', 'internal_observation'], internal_clarified: ['verified', 'internal_observation', 'external_query'], external_query: ['external_clarified', 'external_query'], external_clarified: ['verified', 'internal_observation'] }[it.status] ?? ['verified'];
  const LBL = { verified: 'Verified', internal_observation: 'Observation — clarify internally', internal_clarified: 'Clarified internally', external_query: 'Query — clarify from outside', external_clarified: 'Clarified from outside' };
  const go = async () => {
    setBusy(true);
    try { await verificationAPI.mark(id, { status, note: note || null, clarified_by: by || null }); toast.success('Recorded'); setNote(''); setBy(''); onChanged(); load(); } catch (e) { toast.error(errMsg(e, 'Could not record it')); } finally { setBusy(false); }
  };
  return (
    <Modal title={`${it.type_label} — ${it.ref ?? ''}`} subtitle={`${it.particulars ?? ''}${it.amount != null ? ` · ${money(it.amount)}` : ''}${it.date ? ` · ${it.date}` : ''}`} onClose={onClose}>
      <div style={{ display: 'grid', gap: 10 }}>
        <div><Chip s={it.status} label={it.status_label} /> {it.verified_by && <span style={{ fontSize: '0.74rem', color: colors.textFaint }}>by {it.verified_by}</span>}</div>
        <Detail d={d.detail} />
        {d.log.length > 0 && <div style={{ borderTop: '1px solid var(--line)', paddingTop: 6 }}>{d.log.map((l, n) => <div key={n} style={{ fontSize: '0.74rem', color: colors.textMuted }}><strong>{l.status_label}</strong>{l.by ? ` — ${l.by}` : ''} · {new Date(l.at.replace(' ', 'T')).toLocaleString()}{l.note ? ` — ${l.note}` : ''}</div>)}</div>}
        {it.can_mark ? (
          <FormStack>
            <Field label="Record"><SelectInput value={status} onChange={(e) => setStatus(e.target.value)}>{next.map((k) => <option key={k} value={k}>{LBL[k]}</option>)}</SelectInput></Field>
            {status === 'external_clarified' && <Field label="Who cleared it up"><TextInput value={by} onChange={(e) => setBy(e.target.value)} placeholder="Name, and where they are from" /></Field>}
            <Field label={status === 'verified' ? 'Note (optional)' : 'Note (required)'}><TextInput value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <ModalActions onCancel={onClose} submitLabel="Record" busyLabel="Saving…" busy={busy} onSubmit={go} />
          </FormStack>
        ) : <p style={{ margin: 0, fontSize: '0.76rem', color: colors.textFaint }}>You can read this, but you cannot verify it (it is not assigned to you, or it is your own work).</p>}
      </div>
    </Modal>
  );
}

function Setup({ month, onChanged }) {
  const [cfg, setCfg] = useState(null);
  const [f, setF] = useState({ user_id: '', scope_type: 'voucher_type', scope_id: '', location_id: '', sampling: 'all', percent: 20, from_month: '', to_month: '' });
  const [pickType, setPickType] = useState('');
  const [pickRows, setPickRows] = useState([]);
  const [due, setDue] = useState(10);
  const load = useCallback(() => verificationAPI.config().then((c) => { setCfg(c); setDue(c.due_day); }).catch((e) => toast.error(errMsg(e, 'Could not load'))), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (pickType) verificationAPI.pickList(month, pickType).then((r) => setPickRows(r.items)).catch(() => setPickRows([])); else setPickRows([]); }, [pickType, month]);
  if (!cfg) return <p style={{ color: colors.textMuted }}>Loading…</p>;
  const add = async () => {
    try { await verificationAPI.saveAssignment({ ...f, user_id: Number(f.user_id), scope_id: f.scope_id ? Number(f.scope_id) : null, location_id: f.location_id ? Number(f.location_id) : null, percent: Number(f.percent) || 100, from_month: f.from_month || null, to_month: f.to_month || null }); toast.success('Assigned'); load(); onChanged(); }
    catch (e) { toast.error(errMsg(e, 'Could not assign')); }
  };
  const del = async (a) => { try { toast.success((await verificationAPI.deleteAssignment(a.id)).message); load(); onChanged(); } catch (e) { toast.error(errMsg(e, 'Could not delete')); } };
  const pick = async (r) => { try { await verificationAPI.pick(r.id, !r.selected); setPickRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, selected: !x.selected } : x))); onChanged(); } catch (e) { toast.error(errMsg(e, 'Could not change it')); } };
  const manual = cfg.assignments.filter((a) => a.sampling === 'manual' && a.is_active);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={{ ...card, padding: 16 }}>
        <div style={{ fontWeight: 700, color: colors.primaryDeep }}>Who verifies what</div>
        <p style={{ margin: '2px 0 10px', fontSize: '0.74rem', color: colors.textFaint, maxWidth: 680 }}>Assign a person to a voucher type (or every voucher), to payroll runs or to attendance months — and whether they check every one, a percentage each month, or only ones you pick by hand. If two assignments cover the same item, the earlier one has it. People never verify their own work.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <SelectInput value={f.user_id} onChange={(e) => setF({ ...f, user_id: e.target.value })}><option value="">Verifier…</option>{cfg.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectInput>
          <SelectInput value={f.scope_type} onChange={(e) => setF({ ...f, scope_type: e.target.value, scope_id: '' })}>{Object.entries(cfg.scopes).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput>
          {f.scope_type === 'voucher_type' && <SelectInput value={f.scope_id} onChange={(e) => setF({ ...f, scope_id: e.target.value })}><option value="">Which type…</option>{cfg.voucher_types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</SelectInput>}
          {['voucher_type', 'all_vouchers'].includes(f.scope_type) && <SelectInput value={f.location_id} onChange={(e) => setF({ ...f, location_id: e.target.value })}><option value="">Every branch</option>{cfg.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectInput>}
          <SelectInput value={f.sampling} onChange={(e) => setF({ ...f, sampling: e.target.value })}>{Object.entries(cfg.sampling).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput>
          {f.sampling === 'percent' && <input type="number" min="1" max="100" value={f.percent} onChange={(e) => setF({ ...f, percent: e.target.value })} style={{ width: 70, padding: 8, borderRadius: 8, border: '1px solid var(--line)' }} aria-label="Percent" />}
          <input type="month" value={f.from_month} onChange={(e) => setF({ ...f, from_month: e.target.value })} style={{ padding: 7, borderRadius: 8, border: '1px solid var(--line)' }} aria-label="From month" title="From month (optional)" />
          <input type="month" value={f.to_month} onChange={(e) => setF({ ...f, to_month: e.target.value })} style={{ padding: 7, borderRadius: 8, border: '1px solid var(--line)' }} aria-label="To month" title="To month (optional)" />
          <button type="button" style={btnPrimary} disabled={!f.user_id || (f.scope_type === 'voucher_type' && !f.scope_id)} onClick={add}>Assign</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
          <thead><tr><th style={th}>Verifier</th><th style={th}>Verifies</th><th style={th}>How many</th><th style={th}>Months</th><th style={th} /></tr></thead>
          <tbody>{cfg.assignments.map((a) => (
            <tr key={a.id} style={{ opacity: a.is_active ? 1 : 0.5 }}>
              <td style={td}>{a.verifier}</td><td style={td}>{a.scope_label}{a.branch ? ` · ${a.branch}` : ''}</td><td style={td}>{a.sampling === 'all' ? 'Every one' : a.sampling === 'percent' ? `${a.percent}% each month` : 'Picked by hand'}</td>
              <td style={td}>{a.from_month || a.to_month ? `${a.from_month ?? '…'} to ${a.to_month ?? '…'}` : 'Always'}{a.is_active ? '' : ' (off)'}</td>
              <td style={td}><button type="button" style={small} onClick={() => del(a)}>Remove</button></td>
            </tr>))}</tbody>
        </table>
        <div style={{ marginTop: 10, fontSize: '0.8rem' }}>A month should be verified by day <input type="number" min="1" max="28" value={due} onChange={(e) => setDue(Number(e.target.value))} style={{ width: 60, padding: 4 }} /> of the next month. <button type="button" style={small} onClick={async () => { try { await verificationAPI.saveSettings({ due_day: due }); toast.success('Saved'); } catch (e) { toast.error(errMsg(e, 'Could not save')); } }}>Save</button></div>
      </section>

      {manual.length > 0 && (
        <section style={{ ...card, padding: 16 }}>
          <div style={{ fontWeight: 700, color: colors.primaryDeep }}>Pick by hand — {mname(month)}</div>
          <SelectInput value={pickType} onChange={(e) => setPickType(e.target.value)}><option value="">Choose a type…</option>{manual.map((a) => <option key={a.id} value={a.scope_type === 'voucher_type' ? `vt:${a.scope_id}` : a.scope_type}>{a.scope_label} — {a.verifier}</option>)}</SelectInput>
          {pickRows.map((r) => <label key={r.id} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: '0.8rem' }}><input type="checkbox" checked={r.selected} onChange={() => pick(r)} /> {r.date} · {r.ref} · {r.particulars} {r.amount != null && `· ${money(r.amount)}`}</label>)}
        </section>
      )}

      <section style={{ ...card, padding: 16 }}>
        <div style={{ fontWeight: 700, color: colors.primaryDeep, marginBottom: 6 }}>Workload</div>
        {!cfg.workload.length && <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>Nothing assigned yet.</p>}
        {cfg.workload.map((w, i) => <div key={i} style={{ fontSize: '0.8rem', padding: '3px 0' }}><strong>{w.name}</strong> · {mname(w.month)} · {w.verified}/{w.total} verified{w.total - w.verified > 0 ? <span style={{ color: '#b45309' }}> · {w.total - w.verified} left</span> : ' ✓'}</div>)}
      </section>
    </div>
  );
}

export default function Verification() {
  const init = new URLSearchParams(window.location.search).get('month');
  const [month, setMonth] = useState(init ?? (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })());
  const [all, setAll] = useState(false);
  const [tab, setTab] = useState('work');
  const [data, setData] = useState(null);
  const [type, setType] = useState(null);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => verificationAPI.get(month, all).then(setData).catch((e) => setError(errMsg(e, 'Could not load verification'))), [month, all]);
  useEffect(() => { load(); }, [load]);
  const loadItems = useCallback(() => (type ? verificationAPI.items(month, type.type_key, all).then((r) => setItems(r.items)).catch(() => setItems([])) : setItems([])), [month, type, all]);
  useEffect(() => { loadItems(); }, [loadItems]);
  const changed = () => { load(); loadItems(); };
  const shift = (n) => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); setType(null); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <HubHeader title="Verification" description="A second pair of eyes on the month's records. It never changes the books — it records that someone looked, and what they found." />
        {error && <p role="alert" style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: '0.82rem' }}>{error}</p>}
        {data && !data.table_ready && <p style={{ padding: '8px 12px', borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: '0.8rem' }}>Run script 65_verification.sql to use verification.</p>}
        {data?.is_manager && <div style={{ display: 'flex', gap: 6, margin: '4px 0 10px' }}>{[['work', 'Verification'], ['setup', 'Set-up']].map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} style={{ ...small, fontWeight: tab === k ? 700 : 500, background: tab === k ? 'color-mix(in srgb, var(--color-primary-500) 14%, var(--surface-card, #fff))' : 'var(--surface-card, #fff)' }}>{l}</button>)}</div>}
        {data?.table_ready && tab === 'setup' && <Setup month={month} onChanged={load} />}
        {data?.table_ready && tab === 'work' && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" style={small} onClick={() => shift(-1)}>‹</button><strong style={{ minWidth: 140, textAlign: 'center' }}>{mname(month)}</strong><button type="button" style={small} onClick={() => shift(1)}>›</button>
              <span style={{ fontSize: '0.76rem', color: colors.textFaint }}>Due by {new Date(data.due).toLocaleDateString([], { day: 'numeric', month: 'long' })}</span>
              {data.is_manager && <label style={{ marginLeft: 'auto', fontSize: '0.78rem' }}><input type="checkbox" checked={all} onChange={(e) => { setAll(e.target.checked); setType(null); }} /> Show everyone's</label>}
            </div>
            {data.months.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{data.months.map((m) => <button key={m.month} type="button" style={{ ...small, background: m.month === month ? 'color-mix(in srgb, var(--color-primary-500) 14%, var(--surface-card, #fff))' : 'var(--surface-card, #fff)' }} onClick={() => { setType(null); setMonth(m.month); }}>{mname(m.month)} · {m.open ? `${m.open} left` : 'done'}</button>)}</div>}
            {!data.types.length && <p style={{ ...card, padding: 18, fontSize: '0.84rem', color: colors.textMuted }}>Nothing to verify for {mname(month)}. {data.is_manager ? 'Assign people under Set-up.' : 'Nothing has been assigned to you for this month.'}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 10 }}>
              {data.types.map((t) => (
                <button key={t.type_key} type="button" onClick={() => setType(t)} style={{ ...card, padding: 14, textAlign: 'left', cursor: 'pointer', border: `1.5px solid ${type?.type_key === t.type_key ? '#2563eb' : 'transparent'}` }}>
                  <div style={{ fontWeight: 700 }}>{t.label}</div>
                  <div style={{ fontSize: '0.78rem', color: colors.textMuted, margin: '4px 0' }}>{t.verified} of {t.total} verified{t.amount ? ` · ${money(t.amount)}` : ''}</div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-input)' }}><div style={{ width: `${t.total ? (t.verified / t.total) * 100 : 0}%`, height: 6, borderRadius: 3, background: '#16a34a' }} /></div>
                  {t.attention > 0 && <div style={{ fontSize: '0.72rem', color: '#b45309', marginTop: 4 }}>{t.attention} need attention</div>}
                </button>
              ))}
            </div>
            {type && (
              <section style={{ ...card, padding: 8, overflowX: 'auto' }}>
                <div style={{ padding: '8px 10px', fontWeight: 700 }}>{type.label} — {mname(month)}</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Date</th><th style={th}>Reference</th><th style={th}>Particulars</th><th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={th}>Status</th></tr></thead>
                  <tbody>{items.map((i) => (
                    <tr key={i.id} onClick={() => setOpen(i.id)} style={{ cursor: 'pointer' }}>
                      <td style={td}>{i.date}</td><td style={td}><strong>{i.ref}</strong></td><td style={td}>{i.particulars}</td><td style={{ ...td, textAlign: 'right' }}>{i.amount != null ? money(i.amount) : ''}</td>
                      <td style={td}><Chip s={i.status} label={i.status_label} />{i.note && i.status !== 'verified' && <div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{i.note}</div>}</td>
                    </tr>))}</tbody>
                </table>
              </section>
            )}
          </div>
        )}
        {open && <ItemModal id={open} onClose={() => setOpen(null)} onChanged={changed} />}
      </div>
    </AdminLayout>
  );
}
