import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import menusAPI from '../../_shared/api/menus';
import { Field, NumberInput, SelectInput, TextInput } from '../../core/components/admin/ui/Form';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../_shared/theme/tokens';

function Row({ s, branches, canEdit, onSaved }) {
  const [f, setF] = useState({ name: s.name ?? '', target_minutes: s.target_minutes ?? 15, location_id: s.location_id ?? '', is_default: Boolean(s.is_default), is_active: s.is_active ?? true });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { const r = await menusAPI.saveStation({ ...f, target_minutes: Number(f.target_minutes), location_id: f.location_id === '' ? null : Number(f.location_id) }, s.id); toast.success(r.message); onSaved(); } catch (e) { toast.error(errMsg(e, 'Could not save the station'), { duration: 8000 }); } finally { setBusy(false); }
  };
  const remove = async () => { try { const r = await menusAPI.removeStation(s.id); toast.success(r.message); onSaved(); } catch (e) { toast.error(errMsg(e, 'Could not remove the station'), { duration: 8000 }); } };

  return (
    <div data-station={s.id ?? 'new'} style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Field label="Name" htmlFor={`st-name-${s.id ?? 'new'}`}><TextInput id={`st-name-${s.id ?? 'new'}`} maxLength={80} value={f.name} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} placeholder="Grill" /></Field>
        <Field label="Late after (minutes)" htmlFor={`st-t-${s.id ?? 'new'}`}><NumberInput id={`st-t-${s.id ?? 'new'}`} min={1} max={240} value={f.target_minutes} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, target_minutes: e.target.value }))} /></Field>
        {branches.length > 1 && <Field label="Branch" htmlFor={`st-b-${s.id ?? 'new'}`}><SelectInput id={`st-b-${s.id ?? 'new'}`} value={f.location_id} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, location_id: e.target.value }))}><option value="">Every branch</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectInput></Field>}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.86rem' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.is_default} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, is_default: e.target.checked }))} /> Takes everything else</label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.is_active} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, is_active: e.target.checked }))} /> On</label>
        {s.id && <span style={{ color: colors.textMuted }}>{s.dishes} dish{s.dishes === 1 ? '' : 'es'} · {s.open_tickets} ticket{s.open_tickets === 1 ? '' : 's'} to make</span>}
      </div>
      {canEdit && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={save}>{s.id ? 'Save station' : 'Add station'}</button>
          {s.id && <button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={remove}>Remove</button>}
        </div>
      )}
    </div>
  );
}

/** Menus → Configuration → Kitchen stations: grill, cold, pastry, bar. Each has its own screen; a dish is sent to a station on the dish itself. */
export default function StationsCard({ canEdit }) {
  const [data, setData] = useState(null);
  const [nonce, setNonce] = useState(0);
  const load = () => menusAPI.stations().then((r) => { setData(r); setNonce((n) => n + 1); }).catch((e) => toast.error(errMsg(e, 'Could not load the stations')));
  useEffect(() => { load(); }, []);
  if (!data) return null;

  return (
    <div style={{ marginTop: 22, display: 'grid', gap: 12 }} data-testid="stations">
      <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Kitchen stations</h2>
      {!data.ready ? <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>Run database script 137_menus_kitchen.sql to switch the kitchen screens on.</p> : (
        <>
          <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>Each station has its own screen under Menus → Kitchen. Choose a dish&apos;s station on the dish; mark one station “takes everything else” so no dish is left off a screen.</p>
          {data.stations.map((s) => <Row key={`${s.id}-${nonce}`} s={s} branches={data.branches} canEdit={canEdit} onSaved={load} />)}
          {canEdit && <Row key={`new-${nonce}`} s={{}} branches={data.branches} canEdit onSaved={load} />}
        </>
      )}
    </div>
  );
}
