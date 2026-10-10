import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Laptop, LogOut, Smartphone } from 'lucide-react';
import sessionsAPI from '../../../_shared/api/sessions';
import { errMsg } from '../../../_shared/store/helpers/apiState';

const when = (s) => (s ? String(s).replace('T', ' ').slice(0, 16) : '—');
const btn = { padding: '6px 12px', borderRadius: 8, fontSize: '0.76rem', fontWeight: 700, border: '1.5px solid var(--line)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit' };

/**
 * "Where you are signed in": every browser that holds a login for this account, which one is this, and a button to end any of them. Ending the others is the answer to "I think someone else is in".
 * `onSignedOut` is called when the person ends their own session here (they are signed out of this browser too).
 */
export default function SignedInDevices({ onSignedOut }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => sessionsAPI.list().then(setRows).catch((e) => toast.error(errMsg(e, 'Could not load your sessions'))), []);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, after) => {
    setBusy(true);
    try { const r = await fn(); toast.success(r.message); after ? after() : load(); } catch (e) { toast.error(errMsg(e, 'That did not work')); } finally { setBusy(false); }
  };
  const phone = (l) => /iPhone|Android|iPad/.test(l || '');
  const others = (rows ?? []).filter((r) => !r.current).length;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>These are the browsers and phones that are signed in to your account. If one is not yours, sign it out and change your password.</p>
      {rows === null && <p style={{ margin: 0, color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>Loading…</p>}
      {rows?.map((r) => (
        <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${r.current ? 'var(--color-primary-500)' : 'var(--line)'}` }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
            {phone(r.label) ? <Smartphone size={18} aria-hidden="true" /> : <Laptop size={18} aria-hidden="true" />}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>{r.label}{r.current && <span style={{ marginLeft: 8, padding: '1px 8px', borderRadius: 999, fontSize: '0.68rem', background: 'color-mix(in srgb, var(--color-primary-500) 14%, transparent)', color: 'var(--color-primary-600)' }}>This device</span>}</div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>{r.ip ? `${r.ip} · ` : ''}signed in {when(r.signed_in_at)} · last used {when(r.last_seen_at)}</div>
            </div>
          </div>
          {!r.current && <button type="button" style={btn} disabled={busy} onClick={() => act(() => sessionsAPI.end(r.id))}>Sign out</button>}
        </div>
      ))}
      {rows && rows.length === 0 && <p style={{ margin: 0, color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>Nothing is listed.</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {others > 0 && <button type="button" style={btn} disabled={busy} onClick={() => act(() => sessionsAPI.endOthers())}><LogOut size={13} style={{ verticalAlign: -2 }} /> Sign out of all other devices ({others})</button>}
        <button type="button" style={{ ...btn, color: '#b91c1c' }} disabled={busy} onClick={() => act(() => sessionsAPI.endAll(), onSignedOut)}>Sign out everywhere, including here</button>
      </div>
    </div>
  );
}
