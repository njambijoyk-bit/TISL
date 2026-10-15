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
  const [f, setF] = useState({ paper_default: branch.paper_default, paper_allowed: branch.paper_allowed, require_shift: branch.require_shift });
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
      <div><button type="button" style={btnPrimary} disabled={busy || f.paper_allowed.length === 0} onClick={save}>Save paper settings</button></div>
    </div>
  );
}

function StationRow({ s, branchId, kinds, paper, onSaved }) {
  const [f, setF] = useState({ name: s.name ?? '', code: s.code ?? '', kind: s.kind ?? 'staff', paper: s.paper ?? '', is_default: !!s.is_default, is_active: s.is_active ?? true });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { const r = await posAPI.saveStation({ ...f, location_id: branchId, paper: f.paper || null }, s.id); toast.success(r.message); onSaved(); } catch (e) { toast.error(errMsg(e, 'Could not save the station'), { duration: 8000 }); } finally { setBusy(false); }
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
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.86rem' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.is_default} disabled={f.kind !== 'staff'} onChange={(e) => setF((x) => ({ ...x, is_default: e.target.checked }))} /> Branch default</label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.is_active} onChange={(e) => setF((x) => ({ ...x, is_active: e.target.checked }))} /> On</label>
        {s.id && <span style={sub}>{s.people} {s.people === 1 ? 'person' : 'people'} · {s.documents} documents</span>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={btnPrimary} disabled={busy || !f.name.trim()} onClick={save}>{s.id ? 'Save' : 'Add station'}</button>
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
            <Paper key={`${b.paper_default}-${b.paper_allowed.join()}-${b.require_shift}`} branch={b} paper={d.paper} onSaved={load} />
            <div style={{ fontSize: '0.78rem', fontWeight: 800 }}>Stations</div>
            {b.stations.length === 0 && <p style={{ ...sub, margin: 0 }}>None yet. The first staff till you add becomes the branch default.</p>}
            {b.stations.map((s) => <StationRow key={s.id} s={s} branchId={b.id} kinds={d.kinds} paper={d.paper} onSaved={load} />)}
            <StationRow key={`new-${b.stations.length}`} s={{}} branchId={b.id} kinds={d.kinds} paper={d.paper} onSaved={load} />
          </section>
        ))}
      </div>
    </AdminLayout>
  );
}
