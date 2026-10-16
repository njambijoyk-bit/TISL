import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { MapPin, Monitor, Wifi } from 'lucide-react';
import { Link } from 'react-router-dom';
import menusAPI from '../../_shared/api/menus';
import { Field, NumberInput, TextInput } from '../../core/components/admin/ui/Form';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../_shared/theme/tokens';
import { Pill } from './FoodChips';

const RESULT = { outside: ['danger', 'Away from the branch'], warned: ['warn', 'Away (allowed)'], no_position: ['warn', 'No position'], poor_signal: ['warn', 'Position too rough'] };

function Row({ s, canEdit, onSaved }) {
  const [f, setF] = useState({ latitude: s.latitude ?? '', longitude: s.longitude ?? '', radius_m: s.radius_m, is_active: s.is_active, networks: s.networks ?? '' });
  const [busy, setBusy] = useState(false);
  const here = () => {
    if (!navigator.geolocation) { toast.error('This browser can not tell where you are.'); return; }
    navigator.geolocation.getCurrentPosition((p) => setF((x) => ({ ...x, latitude: p.coords.latitude.toFixed(7), longitude: p.coords.longitude.toFixed(7) })), () => toast.error('Allow location access to use your position.'), { enableHighAccuracy: true, timeout: 15000 });
  };
  const addIp = async () => {
    try { const r = await menusAPI.myIp(); setF((x) => ({ ...x, networks: x.networks.split(/[\s,;]+/).includes(r.ip) ? x.networks : `${x.networks}${x.networks ? '\n' : ''}${r.ip}` })); } catch (e) { toast.error(errMsg(e, 'Could not find this connection\'s address')); }
  };
  const save = async () => {
    setBusy(true);
    try { const r = await menusAPI.saveSite(s.location_id, { latitude: f.latitude === '' ? null : Number(f.latitude), longitude: f.longitude === '' ? null : Number(f.longitude), radius_m: Number(f.radius_m), is_active: f.is_active, networks: f.networks }); toast.success(r.message); onSaved(); } catch (e) { toast.error(errMsg(e, 'Could not save'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <div data-site={s.name} style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '0.92rem' }}>{s.name}</strong>
        {s.checked ? <Pill tone="ok">Checked</Pill> : <Pill tone="neutral">No point known: not checked</Pill>}
        {s.latitude === null && s.branch_latitude !== null && <span style={{ fontSize: '0.78rem', color: colors.textMuted }}>using the branch&apos;s own point ({s.branch_latitude}, {s.branch_longitude})</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Field label="Latitude" htmlFor={`cp-lat-${s.location_id}`} hint="Empty: the branch's own point."><TextInput id={`cp-lat-${s.location_id}`} value={f.latitude} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, latitude: e.target.value }))} /></Field>
        <Field label="Longitude" htmlFor={`cp-lng-${s.location_id}`}><TextInput id={`cp-lng-${s.location_id}`} value={f.longitude} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, longitude: e.target.value }))} /></Field>
        <Field label="Counts as there within (metres)" htmlFor={`cp-r-${s.location_id}`}><NumberInput id={`cp-r-${s.location_id}`} min="20" max="5000" value={f.radius_m} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, radius_m: e.target.value }))} /></Field>
      </div>
      <Field label="The branch's Wi-Fi: its public internet address(es)" htmlFor={`cp-net-${s.location_id}`} hint="One per line: an address like 41.90.12.34 or a range like 41.90.12.0/24. Only used when the Wi-Fi option is on above. Stand on the branch Wi-Fi and press the button to add this connection's address.">
        <textarea id={`cp-net-${s.location_id}`} rows={2} maxLength={2000} value={f.networks} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, networks: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--line, #d1d5db)', font: 'inherit', boxSizing: 'border-box' }} />
      </Field>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {canEdit && <button type="button" style={{ ...btnGhost, padding: '6px 12px', fontSize: '0.78rem' }} onClick={addIp}><Wifi size={13} aria-hidden="true" /> Add this connection&apos;s address</button>}
        <Link to={`/admin/menus/door/${s.location_id}`} style={{ ...btnGhost, padding: '6px 12px', fontSize: '0.78rem', textDecoration: 'none', display: 'inline-flex', gap: 5, alignItems: 'center' }}><Monitor size={13} aria-hidden="true" /> Open the door screen</Link>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.86rem' }}><input type="checkbox" checked={f.is_active} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, is_active: e.target.checked }))} /> Check this branch</label>
        {canEdit && <button type="button" style={{ ...btnGhost, padding: '6px 12px', fontSize: '0.78rem' }} onClick={here}><MapPin size={13} aria-hidden="true" /> Use my position now (stand at the branch)</button>}
        {canEdit && <button type="button" style={{ ...btnPrimary, padding: '6px 14px', fontSize: '0.78rem', opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={save}>Save</button>}
      </div>
    </div>
  );
}

/** Settings → Menus → Clock-in places: where each branch is for clocking in from the rota page, and the recent clock-ins that were away from it. */
export default function ClockPlacesCard({ canEdit }) {
  const [d, setD] = useState(null);
  const load = useCallback(() => menusAPI.clockSites().then(setD).catch(() => setD({ sites: [], events: [], ready: false })), []);
  useEffect(() => { load(); }, [load]);
  if (!d) return null;

  return (
    <section style={{ marginTop: 28 }} aria-label="Clock-in places" data-testid="clock-places">
      <h2 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 800 }}>Clock-in places</h2>
      <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: colors.textMuted }}>Set the chef rota to check the place under Menus configuration above ({d.mode === 'off' ? 'it is off now' : d.mode === 'warn' ? 'warn: kept in the log, the chef is let in' : 'require: a chef away from the branch is turned away'}). The position comes from the chef&apos;s phone: it is a record and a deterrent, not proof.</p>
      {!d.ready && <p role="status" style={{ ...card, padding: 12, fontSize: '0.84rem' }}>Run database script 148_menus_rota_pay.sql first.</p>}
      <div style={{ display: 'grid', gap: 10 }}>{d.sites.map((s) => <Row key={s.location_id} s={s} canEdit={canEdit && d.ready} onSaved={load} />)}</div>
      {d.events.length > 0 && (
        <div style={{ marginTop: 14 }} data-testid="clock-events">
          <h3 style={{ margin: '0 0 6px', fontSize: '0.88rem', fontWeight: 800 }}>Clock-ins that were not at the branch (last 14 days)</h3>
          <div style={{ ...card, padding: 0 }}>
            {d.events.map((e) => {
              const [tone, text] = RESULT[e.result] ?? ['neutral', e.result];

              return <div key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 12px', fontSize: '0.82rem', borderTop: `1px solid ${colors.border ?? '#e5e7eb'}` }}><strong>{e.chef}</strong><span>{e.action === 'in' ? 'clock in' : 'clock out'}</span><Pill tone={tone}>{text}</Pill><span style={{ color: colors.textMuted }}>{e.distance_m !== null ? `${e.distance_m} m from ${e.branch}` : e.branch}{e.accuracy_m !== null ? ` (±${e.accuracy_m} m)` : ''}</span><span style={{ flex: 1 }} /><span style={{ color: colors.textMuted }}>{new Date(e.at).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}</span></div>;
            })}
          </div>
        </div>
      )}
    </section>
  );
}
