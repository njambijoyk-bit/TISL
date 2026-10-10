import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowRightLeft, Fingerprint, KeyRound, Laptop, Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import passkeysAPI from '../../../_shared/api/passkeys';
import { passkeyProblem, passkeysSupported, suggestedName } from '../../../_shared/lib/webauthn';
import { addPasskey, withProtection } from '../../../_shared/lib/passkeyFlows';
import { errMsg } from '../../../_shared/store/helpers/apiState';

const when = (s) => (s ? String(s).replace('T', ' ').slice(0, 16) : '—');
const day = (s) => (s ? String(s).slice(0, 10) : '—');
const btn = { padding: '6px 12px', borderRadius: 8, fontSize: '0.76rem', fontWeight: 700, border: '1.5px solid var(--line)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 };
const primary = { ...btn, border: 'none', background: 'var(--color-primary-600)', color: 'white' };
const input = { padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--line)', fontSize: '0.84rem', background: 'transparent', color: 'inherit', fontFamily: 'inherit', minWidth: 0 };
const faint = { fontSize: '0.74rem', color: 'var(--text-tertiary)' };

const methodText = {
  first: 'The first one, added after signing in',
  approved: 'Added with another of your passkeys',
  recovery: 'Added during an account recovery',
  replacement: 'Added as a replacement',
};
const reasonText = { removed: 'removed', replaced: 'replaced', lost: 'reported lost' };

/**
 * "My devices": the passkeys that can sign this person in. Add, rename, replace (a new phone) and remove (lost, or no longer used), with the story of each one: how it was added, what it replaced.
 * Changing the set needs proof: after the first passkey, a passkey used a few minutes ago (the device asks again when needed); before it, the password.
 */
export default function PasskeyManager() {
  const [state, setState] = useState(null);       // { data, history, max }
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState(null); // { id, name }
  const [confirm, setConfirm] = useState(null);   // { id, reason }
  const [replacing, setReplacing] = useState(null);
  const [ask, setAsk] = useState(null);           // { resolve, reject }: the password prompt
  const [typed, setTyped] = useState('');
  const mounted = useRef(true);

  const load = useCallback(() => passkeysAPI.list().then((r) => mounted.current && setState(r)).catch((e) => toast.error(errMsg(e, 'Could not load your passkeys'))), []);
  useEffect(() => { mounted.current = true; load(); return () => { mounted.current = false; }; }, [load]);

  const askPassword = () => new Promise((resolve, reject) => { setTyped(''); setAsk({ resolve, reject }); });
  const answerPassword = (ok) => { const a = ask; setAsk(null); if (ok) a.resolve(typed); else a.reject(new Error('cancelled')); setTyped(''); };

  // Run something that changes the passkeys, getting the extra proof the server asks for.
  const run = async (fn, done) => {
    setBusy(true);
    try {
      const r = await withProtection(fn, { askPassword });
      if (done) toast.success(done);
      await load();
      return r;
    } catch (e) {
      if (e?.message !== 'cancelled') {
        const p = passkeyProblem(e);
        if (!p.cancelled || p.text) toast.error(p.text || errMsg(e, 'That did not work'));
      }
      return null;
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const items = state?.data ?? [];
  const full = state ? items.length >= state.max : false;

  const add = async () => {
    const r = await run((password) => addPasskey({ name: name.trim() || suggestedName(), password }), 'Passkey added.');
    if (r) setName('');
  };

  const rename = async () => {
    const next = renaming.name.trim();
    if (!next) return;
    await run(() => passkeysAPI.rename(renaming.id, next), 'Renamed.');
    setRenaming(null);
  };

  const remove = async (c, reason) => {
    setConfirm(null);
    const r = await run(() => passkeysAPI.remove(c.id, { reason }), null);
    if (r) toast.success(r.message);
  };

  // A new phone: add the new device first (so there is never a moment with nothing), then retire the old one and say which took its place.
  const replace = async (c) => {
    setReplacing(null);
    setBusy(true);
    try {
      const fresh = await withProtection((password) => addPasskey({ name: name.trim() || suggestedName(), password }), { askPassword });
      const r = await passkeysAPI.remove(c.id, { reason: 'replaced', replaced_by: fresh.data.id });
      toast.success(r.message);
      setName('');
      await load();
    } catch (e) {
      if (e?.message !== 'cancelled') {
        const p = passkeyProblem(e);
        if (!p.cancelled || p.text) toast.error(p.text || errMsg(e, 'That did not work'));
      }
      await load();
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  if (!passkeysSupported()) {
    return <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>This browser can not use passkeys. Try a recent version of Chrome, Edge, Safari or Firefox on a phone or laptop with a fingerprint, face or PIN.</p>;
  }

  return (
    <div style={{ display: 'grid', gap: 12 }} data-testid="passkey-manager">
      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        A passkey lets you sign in with your fingerprint, face or screen PIN instead of a password. It stays on your device and can not be typed in by anyone else, so it can not be guessed or tricked out of you.
      </p>

      {state === null && <p style={{ margin: 0, ...faint }}>Loading…</p>}

      {state && items.length === 0 && (
        <div style={{ padding: '10px 12px', borderRadius: 10, border: '1.5px dashed var(--line)', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          You have not added a passkey yet. Your account is protected by your password alone.
        </div>
      )}

      {items.map((c) => (
        <div key={c.id} data-testid="passkey-row" style={{ padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${c.disabled ? '#fca5a5' : c.current ? 'var(--color-primary-500)' : 'var(--line)'}`, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
              {c.kind === 'security_key' ? <KeyRound size={18} aria-hidden="true" /> : c.synced ? <Fingerprint size={18} aria-hidden="true" /> : <Laptop size={18} aria-hidden="true" />}
              <div style={{ minWidth: 0 }}>
                {renaming?.id === c.id ? (
                  <form onSubmit={(e) => { e.preventDefault(); rename(); }} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <input aria-label="Passkey name" autoFocus maxLength={80} style={input} value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} />
                    <button type="submit" style={primary} disabled={busy}>Save</button>
                    <button type="button" style={btn} onClick={() => setRenaming(null)}>Cancel</button>
                  </form>
                ) : (
                  <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>
                    {c.name}
                    {c.current && <span style={{ marginLeft: 8, padding: '1px 8px', borderRadius: 999, fontSize: '0.68rem', background: 'color-mix(in srgb, var(--color-primary-500) 14%, transparent)', color: 'var(--color-primary-600)' }}>Used to sign in here</span>}
                    {c.synced && <span style={{ marginLeft: 8, ...faint }}>synced across your devices</span>}
                  </div>
                )}
                <div style={faint}>
                  {c.kind === 'security_key' ? 'Security key' : 'Passkey'} · added {day(c.added_at)} · {c.last_used_at ? `last used ${when(c.last_used_at)}${c.last_used_device ? ` on ${c.last_used_device}` : ''}` : 'not used yet'}
                </div>
              </div>
            </div>
            {renaming?.id !== c.id && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" style={btn} disabled={busy} onClick={() => setRenaming({ id: c.id, name: c.name })}><Pencil size={12} /> Rename</button>
                <button type="button" style={btn} disabled={busy || full} title={full ? 'You have the most passkeys allowed' : undefined} onClick={() => setReplacing(replacing === c.id ? null : c.id)}><ArrowRightLeft size={12} /> Replace</button>
                <button type="button" style={{ ...btn, color: '#b91c1c' }} disabled={busy} onClick={() => setConfirm(confirm?.id === c.id ? null : { id: c.id })}><Trash2 size={12} /> Remove</button>
              </div>
            )}
          </div>

          <div style={faint}>
            {methodText[c.added_method] ?? 'Added'}{c.approved_by_name ? ` (approved by “${c.approved_by_name}”)` : ''}.
            {c.replaces?.length > 0 && <> Took the place of {c.replaces.map((r) => `“${r.name}”${r.removed_at ? ` (removed ${day(r.removed_at)})` : ''}`).join(', ')}.</>}
          </div>

          {c.disabled && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.78rem', color: '#b91c1c' }}>
              <ShieldAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>This passkey was switched off because it behaved like a copy. It can not be used. Remove it and add the device again.</span>
            </div>
          )}

          {replacing === c.id && (
            <div style={{ display: 'grid', gap: 8, padding: 10, borderRadius: 8, background: 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)' }}>
              <span style={{ fontSize: '0.78rem' }}>Getting a new phone or laptop? Use <b>this</b> device to add the new passkey, then “{c.name}” is retired and the new one is shown as its replacement.</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <input aria-label="Name for the new passkey" style={{ ...input, flex: '1 1 180px' }} maxLength={80} placeholder={suggestedName()} value={name} onChange={(e) => setName(e.target.value)} />
                <button type="button" style={primary} disabled={busy} onClick={() => replace(c)}>Add the new one and retire this one</button>
                <button type="button" style={btn} onClick={() => setReplacing(null)}>Cancel</button>
              </div>
            </div>
          )}

          {confirm?.id === c.id && (
            <div style={{ display: 'grid', gap: 8, padding: 10, borderRadius: 8, background: '#fff5f5' }}>
              <span style={{ fontSize: '0.78rem', color: '#7f1d1d' }}>Anything signed in with “{c.name}” is signed out at once. {items.length === 1 && 'It is your only passkey, so you will go back to your password alone.'}</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" style={{ ...btn, color: '#b91c1c', borderColor: '#fca5a5' }} disabled={busy} onClick={() => remove(c, 'removed')}>Remove it</button>
                <button type="button" style={{ ...btn, color: '#b91c1c', borderColor: '#fca5a5' }} disabled={busy} onClick={() => remove(c, 'lost')} title="Also signs you out of every other device">I lost this device</button>
                <button type="button" style={btn} onClick={() => setConfirm(null)}>Keep it</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {ask && (
        <form onSubmit={(e) => { e.preventDefault(); answerPassword(true); }} style={{ display: 'grid', gap: 8, padding: 10, borderRadius: 8, border: '1.5px solid var(--color-primary-500)' }} data-testid="passkey-password-ask">
          <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Type your password to add a passkey</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input aria-label="Your password" type="password" autoComplete="current-password" autoFocus style={{ ...input, flex: '1 1 200px' }} value={typed} onChange={(e) => setTyped(e.target.value)} />
            <button type="submit" style={primary} disabled={!typed}>Continue</button>
            <button type="button" style={btn} onClick={() => answerPassword(false)}>Cancel</button>
          </div>
        </form>
      )}

      {state && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input aria-label="Name for the new passkey" style={{ ...input, flex: '1 1 200px', maxWidth: 280 }} maxLength={80} placeholder={`Name it (${suggestedName()})`} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
          <button type="button" style={primary} disabled={busy || full} onClick={add} data-testid="passkey-add"><Plus size={13} /> {items.length ? 'Add another passkey' : 'Add a passkey'}</button>
          {full && <span style={faint}>You have the most passkeys allowed ({state.max}).</span>}
        </div>
      )}
      {state && items.length > 0 && <p style={{ margin: 0, ...faint }}>Adding or removing a passkey asks your device to confirm it is you, so someone who only has your password can not do it.</p>}

      {state?.history?.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>Passkeys you have removed ({state.history.length})</summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
            {state.history.map((h, i) => (
              <li key={i} style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                “{h.name}” · added {day(h.added_at)} · {reasonText[h.reason] ?? 'removed'} {day(h.removed_at)}{h.replaced_by_name ? ` · replaced by “${h.replaced_by_name}”` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
