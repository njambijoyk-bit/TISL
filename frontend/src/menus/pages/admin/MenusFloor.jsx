import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Move, Pencil, QrCode, Users } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, FormStack, ModalActions, NumberInput, SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import menusAPI from '../../../_shared/api/menus';
import useAuthStore from '../../../_shared/store/authStore';
import { canViewMenus, canManageMenus } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { colors } from '../../../_shared/theme/tokens';
import MenusNav from '../../components/MenusNav';

const CELL = 44;   // pixels per grid square on the plan
const STATE = {
  free: ['#e2e8f0', '#0f172a', 'Free'], reserved: ['#ddd6fe', '#4c1d95', 'Reserved'], seated: ['#bae6fd', '#075985', 'Seated'], ordered: ['#fde68a', '#78350f', 'Ordered'],
  eating: ['#bbf7d0', '#14532d', 'Eating'], bill: ['#fecaca', '#7f1d1d', 'Bill asked'], paying: ['#fbcfe8', '#831843', 'Paying'], cleaning: ['#d6d3d1', '#292524', 'Cleaning'], merged: ['#f1f5f9', '#64748b', 'Joined'],
};
const btn = (bg, fg = '#fff') => ({ padding: '9px 14px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.85rem', background: bg, color: fg });
const line = { border: '1.5px solid var(--line, #cbd5e1)', background: 'transparent', color: 'inherit' };
const money = (n) => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function TableForm({ table, areas, resources, onClose, onDone }) {
  const [f, setF] = useState({ name: table?.name ?? '', area_id: table?.area_id ?? areas[0]?.id ?? '', seats: table?.seats ?? 4, shape: table?.shape ?? 'square', resource_id: table?.resource_id ?? '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await menusAPI.saveTable({ ...f, area_id: Number(f.area_id), seats: Number(f.seats), resource_id: f.resource_id ? Number(f.resource_id) : null }, table?.id); toast.success('Table saved.'); onDone(); } catch (e) { toast.error(errMsg(e, 'Could not save the table'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title={table ? `Edit ${table.name}` : 'New table'} onClose={onClose} width={460} footer={<ModalActions onCancel={onClose} onSubmit={save} submitLabel="Save table" busy={busy} disabled={!f.name || !f.area_id} />}>
      <FormStack>
        <Field label="Name or number" htmlFor="tb-name"><TextInput id="tb-name" maxLength={40} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="T1" /></Field>
        <Field label="Area" htmlFor="tb-area"><SelectInput id="tb-area" value={f.area_id} onChange={(e) => setF({ ...f, area_id: e.target.value })}>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectInput></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Seats" htmlFor="tb-seats"><NumberInput id="tb-seats" min={1} max={60} value={f.seats} onChange={(e) => setF({ ...f, seats: e.target.value })} /></Field>
          <Field label="Shape" htmlFor="tb-shape"><SelectInput id="tb-shape" value={f.shape} onChange={(e) => setF({ ...f, shape: e.target.value })}><option value="square">Square</option><option value="round">Round</option></SelectInput></Field>
        </div>
        {resources.length > 0 && <Field label="Same table in Bookings" htmlFor="tb-res" hint="Reservations made for that table show here."><SelectInput id="tb-res" value={f.resource_id} onChange={(e) => setF({ ...f, resource_id: e.target.value })}><option value="">Not linked</option>{resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</SelectInput></Field>}
      </FormStack>
    </Modal>
  );
}

function QrModal({ table, onClose, onRenew }) {
  const [svg, setSvg] = useState(null);
  useEffect(() => { menusAPI.tableQr(table.id).then(setSvg).catch(() => setSvg('')); }, [table.id, table.qr_token]);
  const print = () => { const w = window.open('', '_blank', 'width=420,height=560'); if (!w) return; w.document.write(`<!doctype html><title>${table.name}</title><body style="font-family:sans-serif;text-align:center"><h1>${table.name}</h1><div style="width:300px;margin:auto">${svg}</div><p>Scan to see the menu and order from your table.</p>`); w.document.close(); w.focus(); w.print(); };

  return (
    <Modal title={`QR code · ${table.name}`} onClose={onClose} width={400} footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}><button type="button" style={{ ...btn('transparent', '#b91c1c'), border: '1.5px solid #fca5a5' }} onClick={onRenew}>New code</button><button type="button" style={btn('#0f172a')} onClick={print} disabled={!svg}>Print</button></div>}>
      <div data-testid="qr" style={{ display: 'grid', placeItems: 'center', minHeight: 240 }} dangerouslySetInnerHTML={{ __html: svg ?? 'Making the code…' }} />
      <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: colors.textMuted }}>Guests scan this to see the menu and order. “New code” makes the printed one stop working (use it if a photo of it was shared).</p>
    </Modal>
  );
}

/** Menus → Floor: the plan of the tables with what each is doing, one tap to seat, ask for the bill, clean, join tables or open its tab in the till; and, when editing, the places of the tables. */
export default function MenusFloor() {
  const user = useAuthStore((s) => s.user);
  const canAct = canManageMenus(user);
  const [data, setData] = useState(null);
  const [locationId, setLocationId] = useState('');
  const [areaId, setAreaId] = useState(null);
  const [pick, setPick] = useState(null);
  const [editing, setEditing] = useState(false);
  const [places, setPlaces] = useState({});
  const [form, setForm] = useState(null);
  const [qr, setQr] = useState(null);
  const [joining, setJoining] = useState(null);
  const [areaName, setAreaName] = useState('');
  const drag = useRef(null);

  const load = useCallback(() => menusAPI.floor(locationId ? { location_id: locationId } : undefined).then((r) => { setData(r); setLocationId((l) => l || String(r.location_id ?? '')); setAreaId((a) => a ?? r.areas?.[0]?.id ?? null); }).catch((e) => toast.error(errMsg(e, 'Could not load the floor'))), [locationId]);
  useEffect(() => { load(); const t = setInterval(() => { if (!editing) load(); }, 10000); return () => clearInterval(t); }, [load, editing]);

  const area = data?.areas.find((a) => a.id === areaId) ?? data?.areas[0];
  const tables = useMemo(() => (area?.tables ?? []).map((t) => ({ ...t, ...(places[t.id] ?? {}) })), [area, places]);
  const sel = tables.find((t) => t.id === pick) ?? null;
  const act = async (id, action, payload, ok) => { try { await menusAPI.tableAct(id, action, payload); if (ok) toast.success(ok); setJoining(null); await load(); } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 8000 }); } };

  const down = (e, t) => {
    if (!editing) { setPick(t.id); return; }
    drag.current = { id: t.id, sx: e.clientX, sy: e.clientY, x: t.x, y: t.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current; if (!d) return;
    setPlaces((p) => ({ ...p, [d.id]: { x: Math.max(0, d.x + Math.round((e.clientX - d.sx) / CELL)), y: Math.max(0, d.y + Math.round((e.clientY - d.sy) / CELL)) } }));
  };
  const up = () => { drag.current = null; };
  const saveLayout = async () => {
    try { await menusAPI.saveLayout(Object.entries(places).map(([id, p]) => ({ id: Number(id), ...p }))); toast.success('Layout saved.'); setPlaces({}); setEditing(false); await load(); } catch (e) { toast.error(errMsg(e, 'Could not save the layout'), { duration: 8000 }); }
  };
  const addArea = async () => { try { await menusAPI.saveArea({ name: areaName, location_id: Number(locationId) }); setAreaName(''); await load(); } catch (e) { toast.error(errMsg(e, 'Could not add the area'), { duration: 8000 }); } };

  if (!canViewMenus(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="the floor" /></div></AdminLayout>;
  const width = Math.max(14, ...tables.map((t) => t.x + t.w + 1)) * CELL;
  const height = Math.max(8, ...tables.map((t) => t.y + t.h + 1)) * CELL;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1400, margin: '0 auto' }} data-testid="menus-floor">
        <MenusNav />
        <HubHeader title="Floor" description="Every table at a glance. Tap a table to seat guests, take their order, ask for the bill or clean it." />
        {data && !data.ready && <p role="status" style={{ color: colors.textMuted }}>Run database script 139_menus_floor.sql to switch the floor on.</p>}
        {data?.ready && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
              {data.branches.length > 1 && <SelectInput aria-label="Branch" value={locationId} onChange={(e) => { setLocationId(e.target.value); setAreaId(null); setPick(null); }} style={{ width: 'auto' }}>{data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectInput>}
              <div role="tablist" aria-label="Areas" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {data.areas.map((a) => <button key={a.id} type="button" role="tab" aria-selected={a.id === area?.id} onClick={() => { setAreaId(a.id); setPick(null); }} style={{ ...btn(a.id === area?.id ? '#0f172a' : 'transparent', a.id === area?.id ? '#fff' : 'inherit'), ...(a.id === area?.id ? {} : line) }}>{a.name}</button>)}
              </div>
              {canAct && (editing
                ? <><button type="button" style={btn('#059669')} onClick={saveLayout}>Save layout</button><button type="button" style={{ ...btn('transparent', 'inherit'), ...line }} onClick={() => { setPlaces({}); setEditing(false); }}>Cancel</button></>
                : <button type="button" aria-label="Edit the plan" style={{ ...btn('transparent', 'inherit'), ...line }} onClick={() => setEditing(true)}><Pencil size={14} aria-hidden="true" /> Edit the plan</button>)}
            </div>
            {editing && canAct && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <button type="button" style={btn('#0ea5e9')} onClick={() => setForm({})} disabled={data.all_areas.length === 0}>Add a table</button>
                <input aria-label="New area" placeholder="New area (Patio)" value={areaName} onChange={(e) => setAreaName(e.target.value)} style={{ padding: 9, borderRadius: 8, ...line }} />
                <button type="button" style={btn('#64748b')} disabled={!areaName.trim()} onClick={addArea}>Add area</button>
              </div>
            )}
            {data.areas.length === 0 && <p style={{ color: colors.textMuted }}>No area yet. {canAct ? 'Press “Edit the plan”, add an area (Indoor, Patio…) and then your tables.' : ''}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 16, alignItems: 'start' }}>
              <div style={{ overflow: 'auto', border: '1.5px solid var(--line, #cbd5e1)', borderRadius: 14, background: editing ? 'repeating-linear-gradient(0deg, transparent 0 43px, rgba(148,163,184,.25) 43px 44px), repeating-linear-gradient(90deg, transparent 0 43px, rgba(148,163,184,.25) 43px 44px)' : 'transparent' }}>
                <div data-testid="plan" onPointerMove={move} onPointerUp={up} style={{ position: 'relative', width, height, minWidth: '100%' }}>
                  {tables.filter((t) => t.state !== 'merged').map((t) => {
                    const [bg, fg, label] = STATE[t.state] ?? STATE.free;

                    return (
                      <button key={t.id} type="button" data-table={t.name} data-state={t.state} onPointerDown={(e) => down(e, t)} aria-pressed={pick === t.id}
                        style={{ position: 'absolute', left: t.x * CELL + 2, top: t.y * CELL + 2, width: t.w * CELL - 4, height: t.h * CELL - 4, borderRadius: t.shape === 'round' ? 999 : 10, background: bg, color: fg, border: pick === t.id ? '3px solid #0f172a' : '2px solid rgba(0,0,0,.15)', cursor: editing ? 'grab' : 'pointer', fontFamily: 'inherit', display: 'grid', placeContent: 'center', textAlign: 'center', padding: 2, touchAction: 'none' }}>
                        <strong style={{ fontSize: '0.95rem' }}>{t.name}</strong>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700 }}>{label}{t.minutes != null && !['free', 'reserved', 'cleaning'].includes(t.state) ? ` · ${t.minutes}m` : ''}</span>
                        <span style={{ fontSize: '0.66rem', display: 'inline-flex', gap: 3, justifyContent: 'center', alignItems: 'center' }}><Users size={10} aria-hidden="true" />{t.seats}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <aside aria-label="Table" data-testid="table-panel" style={{ border: '1.5px solid var(--line, #cbd5e1)', borderRadius: 14, padding: 14, display: 'grid', gap: 10, minHeight: 120 }}>
                {!sel && <span style={{ color: colors.textMuted, fontSize: '0.86rem' }}>{editing ? 'Drag a table to move it.' : 'Tap a table.'}</span>}
                {sel && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><strong style={{ fontSize: '1.15rem' }}>{sel.name}</strong><span style={{ color: colors.textMuted, fontSize: '0.8rem' }}>{STATE[sel.state][2]} · {sel.seats} seats{sel.joined.length > 0 ? ` (with ${sel.joined.join(', ')})` : ''}</span></div>
                    {sel.reservation && <p style={{ margin: 0, fontSize: '0.84rem' }}>Reserved for {sel.reservation.name ?? 'a guest'}, {sel.reservation.people} people, {new Date(sel.reservation.at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false })}</p>}
                    {sel.tab && <p style={{ margin: 0, fontSize: '0.9rem' }}>Tab so far <strong>{money(sel.tab.total)}</strong></p>}
                    {editing ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" style={btn('#0ea5e9')} onClick={() => setForm(sel)}>Edit table</button>
                        <button type="button" style={{ ...btn('transparent', '#b91c1c'), border: '1.5px solid #fca5a5' }} onClick={async () => { try { await menusAPI.removeTable(sel.id); setPick(null); await load(); } catch (e) { toast.error(errMsg(e, 'Could not remove the table'), { duration: 8000 }); } }}>Remove</button>
                      </div>
                    ) : canAct && (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {['free', 'reserved'].includes(sel.state) && <button type="button" style={btn('#0ea5e9')} onClick={() => { const g = window.prompt('How many guests?', String(Math.min(sel.seats, 2))); if (g) act(sel.id, 'seat', { guests: Number(g) }, 'Seated.'); }}>Seat guests</button>}
                        {!sel.tab && ['free', 'reserved', 'seated'].includes(sel.state) && <Link to={`/admin/menus/till?table=${sel.id}`} style={{ ...btn('#059669'), textDecoration: 'none', textAlign: 'center' }}>Take their order</Link>}
                        {sel.tab && <Link to={`/admin/menus/till?tab=${sel.tab.id}`} style={{ ...btn('#059669'), textDecoration: 'none', textAlign: 'center' }}>Open the tab</Link>}
                        {sel.tab && sel.state !== 'bill' && sel.state !== 'paying' && <button type="button" style={btn('#d97706')} onClick={() => act(sel.id, 'bill', {}, 'The bill is asked for.')}>Bill asked</button>}
                        {['cleaning', 'seated'].includes(sel.state) && !sel.tab && <button type="button" style={btn('#64748b')} onClick={() => act(sel.id, 'clear', {}, 'Table is free.')}>{sel.state === 'cleaning' ? 'Cleaned: free' : 'Nobody came: free'}</button>}
                        {!sel.tab && !sel.joined.length && ['free', 'seated'].includes(sel.state) && <button type="button" style={{ ...btn('transparent', 'inherit'), ...line }} onClick={() => setJoining(sel.id)}>Join tables…</button>}
                        {sel.joined.length > 0 && !sel.tab && <button type="button" style={{ ...btn('transparent', 'inherit'), ...line }} onClick={() => act(sel.id, 'unmerge', {}, 'Tables separated.')}>Separate the tables</button>}
                        <button type="button" aria-label={`QR code for ${sel.name}`} style={{ ...btn('transparent', 'inherit'), ...line }} onClick={() => setQr(sel)}><QrCode size={14} aria-hidden="true" /> QR code</button>
                      </div>
                    )}
                    {joining === sel.id && (
                      <div role="group" aria-label="Join with" style={{ display: 'grid', gap: 6, fontSize: '0.85rem' }}>
                        <strong>Join {sel.name} with:</strong>
                        {tables.filter((t) => t.id !== sel.id && !t.tab && !t.joined.length && ['free', 'seated'].includes(t.state)).map((t) => (
                          <button key={t.id} type="button" style={{ ...btn('transparent', 'inherit'), ...line, textAlign: 'left' }} onClick={() => act(sel.id, 'merge', { ids: [t.id] }, `${t.name} joined.`)}><Move size={12} aria-hidden="true" /> {t.name} ({t.seats} seats)</button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </aside>
            </div>
            <ul aria-label="Key" style={{ listStyle: 'none', display: 'flex', gap: 10, flexWrap: 'wrap', padding: 0, marginTop: 14, fontSize: '0.75rem' }}>
              {Object.entries(STATE).filter(([k]) => k !== 'merged').map(([k, [bg, fg, label]]) => <li key={k} style={{ background: bg, color: fg, padding: '2px 10px', borderRadius: 999, fontWeight: 700 }}>{label}</li>)}
            </ul>
          </>
        )}
      </div>
      {form && data && <TableForm table={form.id ? form : null} areas={data.all_areas.filter((a) => a.is_active)} resources={data.resources} onClose={() => setForm(null)} onDone={() => { setForm(null); load(); }} />}
      {qr && <QrModal table={qr} onClose={() => setQr(null)} onRenew={async () => { try { const r = await menusAPI.tableAct(qr.id, 'renew-qr'); setQr(r.table); await load(); toast.success('A new code was made. Print it again.'); } catch (e) { toast.error(errMsg(e, 'Could not renew the code')); } }} />}
    </AdminLayout>
  );
}
