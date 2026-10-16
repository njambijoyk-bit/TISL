import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import menusAPI from '../../_shared/api/menus';
import { Field, NumberInput, SelectInput, TextInput } from '../../core/components/admin/ui/Form';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../_shared/theme/tokens';

function Row({ k, branches, canEdit, onSaved }) {
  const [f, setF] = useState({ name: k.name ?? '', location_id: k.location_id ?? branches[0]?.id ?? '', pay_at_screen: k.pay_at_screen ?? true, pay_at_counter: k.pay_at_counter ?? true, idle_seconds: k.idle_seconds ?? 60, welcome: k.welcome ?? '', is_active: k.is_active ?? true });
  const [busy, setBusy] = useState(false);
  const id = k.id ?? 'new';
  const save = async () => {
    setBusy(true);
    try { const r = await menusAPI.saveKiosk({ ...f, location_id: Number(f.location_id), idle_seconds: Number(f.idle_seconds) }, k.id); toast.success(r.message); onSaved(); } catch (e) { toast.error(errMsg(e, 'Could not save the kiosk'), { duration: 8000 }); } finally { setBusy(false); }
  };
  const act = async (fn, ok) => { try { const r = await fn(); toast.success(ok ?? r.message); onSaved(); } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 8000 }); } };
  const copy = async () => { try { await navigator.clipboard.writeText(k.url); toast.success('Address copied.'); } catch { toast.error('Copy it by hand from the box.'); } };

  return (
    <div data-kiosk={id} style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <Field label="Name" htmlFor={`ks-name-${id}`}><TextInput id={`ks-name-${id}`} maxLength={60} value={f.name} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} placeholder="Front kiosk" /></Field>
        <Field label="Branch" htmlFor={`ks-loc-${id}`}><SelectInput id={`ks-loc-${id}`} value={f.location_id} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, location_id: e.target.value }))}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectInput></Field>
        <Field label="Resets after (seconds)" htmlFor={`ks-idle-${id}`}><NumberInput id={`ks-idle-${id}`} min={15} max={600} value={f.idle_seconds} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, idle_seconds: e.target.value }))} /></Field>
      </div>
      <Field label="Line on the welcome screen" htmlFor={`ks-welcome-${id}`}><TextInput id={`ks-welcome-${id}`} maxLength={160} value={f.welcome} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, welcome: e.target.value }))} placeholder="Touch to order" /></Field>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.86rem' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.pay_at_screen} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, pay_at_screen: e.target.checked }))} /> Pay at the screen (M-Pesa)</label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.pay_at_counter} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, pay_at_counter: e.target.checked }))} /> Pay at the counter</label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.is_active} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, is_active: e.target.checked }))} /> On</label>
      </div>
      {k.url && (
        <div style={{ display: 'grid', gap: 6 }}>
          <label htmlFor={`ks-url-${id}`} style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.textMuted }}>Open this address on the screen</label>
          <input id={`ks-url-${id}`} readOnly value={k.url} onFocus={(e) => e.target.select()} style={{ padding: 9, borderRadius: 8, border: '1.5px solid var(--line)', fontFamily: 'monospace', fontSize: '0.78rem' }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={btnGhost} onClick={copy}>Copy</button>
            <a href={k.url} target="_blank" rel="noreferrer" style={{ ...btnGhost, textDecoration: 'none' }}>Open</a>
            {canEdit && <button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={() => act(() => menusAPI.renewKiosk(k.id))}>New address</button>}
          </div>
        </div>
      )}
      {canEdit && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={busy || !f.name.trim()} onClick={save}>{k.id ? 'Save kiosk' : 'Add kiosk'}</button>
          {k.id && <button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={() => act(() => menusAPI.removeKiosk(k.id))}>Remove</button>}
        </div>
      )}
    </div>
  );
}

/** Menus → Configuration → Kiosks: the self-order screens in the venue. Each has its own secret address that is opened on the screen (nobody signs in on it). */
export default function KiosksCard({ canEdit }) {
  const [data, setData] = useState(null);
  const [nonce, setNonce] = useState(0);
  const load = () => menusAPI.kiosks().then((r) => { setData(r); setNonce((n) => n + 1); }).catch((e) => toast.error(errMsg(e, 'Could not load the kiosks')));
  useEffect(() => { load(); }, []);
  if (!data) return null;

  return (
    <div style={{ marginTop: 22, display: 'grid', gap: 12 }} data-testid="kiosks">
      <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Kiosks</h2>
      {!data.ready ? <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>Run database script 140_menus_kiosk.sql to switch kiosks on.</p> : (
        <>
          <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>A kiosk is a screen guests order on themselves. Open its address on the screen in full-screen mode. Which menus it shows is chosen under “Ways to order” (Kiosk).</p>
          {data.kiosks.map((k) => <Row key={`${k.id}-${nonce}`} k={k} branches={data.branches} canEdit={canEdit} onSaved={load} />)}
          {canEdit && <Row key={`new-${nonce}`} k={{}} branches={data.branches} canEdit onSaved={load} />}
        </>
      )}
    </div>
  );
}
