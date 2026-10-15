import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../../core/components/admin/ui/HubHeader';
import { Field, TextInput, SelectInput, CheckboxRow } from '../../../../core/components/admin/ui/Form';
import posAPI from '../../../../_shared/api/pos';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';

const sub = { fontSize: '0.72rem', color: colors.textMuted };

function Paper({ branch, paper, onSaved }) {
  const [f, setF] = useState({ paper_default: branch.paper_default, paper_allowed: branch.paper_allowed, require_shift: branch.require_shift, variance_limit: branch.variance_limit ?? 100 });
  const [busy, setBusy] = useState(false);
  const toggle = (k) => setF((x) => ({ ...x, paper_allowed: x.paper_allowed.includes(k) ? x.paper_allowed.filter((p) => p !== k) : [...x.paper_allowed, k] }));
  const save = async () => {
    setBusy(true);
    try { const r = await posAPI.saveBranch(branch.id, f); toast.success(r.message); onSaved(); } catch (e) { toast.error(errMsg(e, 'Could not save'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'grid', gap: 10, padding: '10px 0' }}>
      <div style={{ fontSize: '0.78rem', fontWeight: 800 }}>Receipt paper at this branch</div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {Object.entries(paper).map(([k, l]) => <CheckboxRow key={k} checked={f.paper_allowed.includes(k)} onChange={() => toggle(k)} label={l} />)}
      </div>
      <Field label="Used when nothing else is chosen" htmlFor={`pd-${branch.id}`}>
        <SelectInput id={`pd-${branch.id}`} value={f.paper_default} onChange={(e) => setF((x) => ({ ...x, paper_default: e.target.value }))}>
          {Object.entries(paper).filter(([k]) => f.paper_allowed.includes(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </SelectInput>
      </Field>
      <CheckboxRow checked={f.require_shift} onChange={(v) => setF((x) => ({ ...x, require_shift: v?.target ? v.target.checked : v }))} label="A cashier must open a shift before selling" />
      <Field label="A cash over or short bigger than this needs a supervisor's PIN to close the shift (0 = any difference)" htmlFor={`vl-${branch.id}`}>
        <input id={`vl-${branch.id}`} inputMode="decimal" value={f.variance_limit} onChange={(e) => setF((x) => ({ ...x, variance_limit: e.target.value.replace(/[^\d.]/g, '') }))} style={{ width: 140, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', fontFamily: 'inherit' }} />
      </Field>
      <div><button type="button" style={btnPrimary} disabled={busy || f.paper_allowed.length === 0} onClick={save}>Save paper settings</button></div>
    </div>
  );
}

function StationRow({ s, branchId, kinds, paper, ledgers, ledgersReady, onSaved }) {
  const [f, setF] = useState({ name: s.name ?? '', code: s.code ?? '', kind: s.kind ?? 'staff', paper: s.paper ?? '', is_default: !!s.is_default, is_active: s.is_active ?? true, cash_ledger_id: s.cash_ledger_id ?? '', bank_ledger_id: s.bank_ledger_id ?? '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { const r = await posAPI.saveStation({ ...f, location_id: branchId, paper: f.paper || null, cash_ledger_id: f.cash_ledger_id || null, bank_ledger_id: f.bank_ledger_id || null }, s.id); toast.success(r.message); onSaved(); } catch (e) { toast.error(errMsg(e, 'Could not save the station'), { duration: 8000 }); } finally { setBusy(false); }
  };
  const [address, setAddress] = useState(null);
  const makeAddress = async () => {
    if (s.kind !== 'self_checkout') return;
    if (!window.confirm('Make a new address? The old one stops working at once, and this one is shown only once.')) return;
    try { const r = await posAPI.stationAddress(s.id); setAddress(r.url); } catch (e) { toast.error(errMsg(e, 'Could not make the address'), { duration: 8000 }); }
  };
  const remove = async () => {
    if (!window.confirm(`Remove ${s.name}?`)) return;
    try { const r = await posAPI.deleteStation(s.id); toast.success(r.message); onSaved(); } catch (e) { toast.error(errMsg(e, 'Could not remove'), { duration: 8000 }); }
  };

  return (
    <div style={{ ...card, padding: 12, display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Field label="Name" htmlFor={`sn-${s.id ?? 'new'}-${branchId}`}><TextInput id={`sn-${s.id ?? 'new'}-${branchId}`} maxLength={80} value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} placeholder="Till 1" /></Field>
        <Field label="Code" htmlFor={`sc-${s.id ?? 'new'}-${branchId}`}><TextInput id={`sc-${s.id ?? 'new'}-${branchId}`} maxLength={20} value={f.code} onChange={(e) => setF((x) => ({ ...x, code: e.target.value }))} placeholder="T1" /></Field>
        <Field label="Kind" htmlFor={`sk-${s.id ?? 'new'}-${branchId}`}><SelectInput id={`sk-${s.id ?? 'new'}-${branchId}`} value={f.kind} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value, is_default: e.target.value === 'staff' ? x.is_default : false }))}>{Object.entries(kinds).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
        <Field label="Paper (blank = the branch's)" htmlFor={`sp-${s.id ?? 'new'}-${branchId}`}><SelectInput id={`sp-${s.id ?? 'new'}-${branchId}`} value={f.paper} onChange={(e) => setF((x) => ({ ...x, paper: e.target.value }))}><option value="">Branch default</option>{Object.entries(paper).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
      </div>
      {ledgersReady && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <Field label="Cash-in-hand ledger (cash taken here posts to it)" htmlFor={`scl-${s.id ?? 'new'}-${branchId}`}>
            <SelectInput id={`scl-${s.id ?? 'new'}-${branchId}`} value={f.cash_ledger_id} onChange={(e) => setF((x) => ({ ...x, cash_ledger_id: e.target.value ? Number(e.target.value) : '' }))}>
              <option value="">The cash payment method's ledger</option>{ledgers.cash.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </SelectInput>
          </Field>
          <Field label="Bank ledger (bank transfer, card and M-Pesa post to it)" htmlFor={`sbl-${s.id ?? 'new'}-${branchId}`}>
            <SelectInput id={`sbl-${s.id ?? 'new'}-${branchId}`} value={f.bank_ledger_id} onChange={(e) => setF((x) => ({ ...x, bank_ledger_id: e.target.value ? Number(e.target.value) : '' }))}>
              <option value="">Each payment method's own ledger</option>{ledgers.bank.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </SelectInput>
          </Field>
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.86rem' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.is_default} disabled={f.kind !== 'staff'} onChange={(e) => setF((x) => ({ ...x, is_default: e.target.checked }))} /> Branch default</label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.is_active} onChange={(e) => setF((x) => ({ ...x, is_active: e.target.checked }))} /> On</label>
        {s.id && <span style={sub}>{s.people} {s.people === 1 ? 'person' : 'people'} · {s.documents} documents</span>}
      </div>
      {address && (
        <div style={{ display: 'grid', gap: 4 }}>
          <label htmlFor={`sa-${s.id}`} style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.textMuted }}>Open this address on the screen (shown once — copy it now)</label>
          <input id={`sa-${s.id}`} readOnly value={address} onFocus={(e) => e.target.select()} style={{ padding: 9, borderRadius: 8, border: '1.5px solid var(--line)', fontFamily: 'monospace', fontSize: '0.78rem' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={btnGhost} onClick={async () => { try { await navigator.clipboard.writeText(address); toast.success('Address copied.'); } catch { toast.error('Copy it by hand from the box.'); } }}>Copy</button>
            <a href={address} target="_blank" rel="noreferrer" style={{ ...btnGhost, textDecoration: 'none' }}>Open</a>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={btnPrimary} disabled={busy || !f.name.trim()} onClick={save}>{s.id ? 'Save' : 'Add station'}</button>
        {s.id && s.kind === 'self_checkout' && <button type="button" style={btnGhost} onClick={makeAddress}>New screen address</button>}
        {s.id && <button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={remove}>Remove</button>}
      </div>
    </div>
  );
}

/** Point of sale → Stations: the tills and self-checkout screens of each branch, and the receipt paper each branch offers. */
export default function PosStations() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => { posAPI.stations().then(setD).catch((e) => setError(errMsg(e, 'Could not load the stations'))); }, []);
  useEffect(() => { load(); }, [load]);

  if (!d) return <AdminLayout><div style={{ padding: 32, color: colors.textFaint }}>{error ?? 'Loading…'}</div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '8px 0 40px', display: 'grid', gap: 16 }}>
        <HubHeader title="POS stations" description="Each branch has stations: the tills cashiers sell from and, later, self-checkout screens. Every sale is tagged with its station. Choose which receipt papers each branch prints on." />
        {!d.ready && <p role="alert" style={{ ...card, padding: 14, margin: 0, fontSize: '0.86rem' }}>The point of sale is not set up yet. Ask an admin to run script 169_pos.sql, then reload this page.</p>}
        {error && <p role="alert" style={{ color: colors.dangerText, margin: 0, fontSize: '0.86rem' }}>{error}</p>}
        {d.branches.map((b) => (
          <section key={b.id} style={{ ...card, padding: 18, display: 'grid', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>{b.name}</h2>
            <Paper key={`${b.paper_default}-${b.paper_allowed.join()}-${b.require_shift}-${b.variance_limit}`} branch={b} paper={d.paper} onSaved={load} />
            <div style={{ fontSize: '0.78rem', fontWeight: 800 }}>Stations</div>
            {b.stations.length === 0 && <p style={{ ...sub, margin: 0 }}>None yet. The first staff till you add becomes the branch default.</p>}
            {b.stations.map((s) => <StationRow key={s.id} s={s} branchId={b.id} kinds={d.kinds} paper={d.paper} ledgers={d.ledgers} ledgersReady={!!d.ledgers_ready} onSaved={load} />)}
            <StationRow key={`new-${b.stations.length}`} s={{}} branchId={b.id} kinds={d.kinds} paper={d.paper} ledgers={d.ledgers} ledgersReady={!!d.ledgers_ready} onSaved={load} />
          </section>
        ))}
      </div>
    </AdminLayout>
  );
}
