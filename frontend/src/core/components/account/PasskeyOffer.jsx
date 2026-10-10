import { useEffect, useRef, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Fingerprint, X } from 'lucide-react';
import { useAuthStore } from '../../../_shared/store/index';
import passkeysAPI from '../../../_shared/api/passkeys';
import { passkeyProblem, passkeysSupported, suggestedName } from '../../../_shared/lib/webauthn';
import { addPasskey, withProtection } from '../../../_shared/lib/passkeyFlows';
import { errMsg } from '../../../_shared/store/helpers/apiState';

// Pages where an offer would be in the way (signing in, signing up, being made to change a password, the "secure my account" link from an email).
const QUIET = ['/login', '/register', '/force-change-password', '/secure-account', '/forgot-password', '/reset-password', '/oauth', '/careers'];
const DAY = 24 * 3600 * 1000;
const key = (user) => `passkey-offer:${user.id}`;

const read = (user) => { try { return JSON.parse(localStorage.getItem(key(user)) || '{}'); } catch { return {}; } };
const write = (user, value) => { try { localStorage.setItem(key(user), JSON.stringify(value)); } catch { /* storage may be off: the offer just comes back sooner */ } };

/**
 * Right after signing in with a password, a person with no passkey is offered one, once in a while. "Not now" waits a week; "Don't ask again" stays quiet (unless the business requires passkeys).
 * A passkey is only ever added by the person at the device: this just opens the same flow as "My devices".
 */
export default function PasskeyOffer() {
  const { pathname } = useLocation();
  const user = useAuthStore((s) => s.user);
  const authed = useAuthStore((s) => s.isAuthenticated);
  const account = useAuthStore((s) => s.access?.account);
  const security = useAuthStore((s) => s.security);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [needPassword, setNeedPassword] = useState(null);   // { resolve, reject }
  const [typed, setTyped] = useState('');
  const checked = useRef(null);

  const quiet = QUIET.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const userId = user?.id;
  const gated = !!security?.gate;
  useEffect(() => {
    if (!authed || !userId || quiet || gated || checked.current === userId || !passkeysSupported()) return;
    const saved = read({ id: userId });
    checked.current = userId;                                  // ask the server once per person per visit, not on every page
    if (saved.never || (saved.until && saved.until > Date.now())) return;
    passkeysAPI.list().then((r) => { if (checked.current === userId && !useAuthStore.getState().security?.gate && (r.data ?? []).length === 0) setOpen(true); }).catch(() => { /* not signed in after all: nothing to offer */ });
  }, [authed, userId, quiet, gated]);

  useEffect(() => { if (gated) setOpen(false); }, [gated]);   // the gate screen has the one thing to do; the offer must not come back behind it

  useEffect(() => { if (!authed) { setOpen(false); checked.current = null; } }, [authed]);

  if (!open || !authed || !user || quiet || gated) return null;

  const required = !!security?.applies;   // the rule is for them: they can put it off, not refuse it
  const later = () => { write(user, { until: Date.now() + (required ? 1 : 7) * DAY }); setOpen(false); };
  const never = () => { write(user, { never: true }); setOpen(false); };

  const add = async () => {
    setBusy(true);
    try {
      await withProtection((password) => addPasskey({ name: suggestedName(), password }), {
        askPassword: () => new Promise((resolve, reject) => { setTyped(''); setNeedPassword({ resolve, reject }); }),
      });
      toast.success('Passkey added. Next time you can sign in with your fingerprint, face or PIN.');
      setOpen(false);
      useAuthStore.getState().fetchCustomer();
    } catch (e) {
      if (e?.message !== 'cancelled') {
        const p = passkeyProblem(e);
        if (!p.cancelled || p.text) toast.error(p.text || errMsg(e, 'That did not work'));
      }
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = (ok) => { const a = needPassword; setNeedPassword(null); if (ok) a.resolve(typed); else a.reject(new Error('cancelled')); setTyped(''); };

  const mine = account === 'customer' ? '/profile' : '/admin/profile';

  return (
    <div role="dialog" aria-modal="true" aria-label="Sign in faster and safer" data-testid="passkey-offer"
      style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.45)' }}>
      <div style={{ width: '100%', maxWidth: 420, borderRadius: 16, padding: 24, background: 'var(--surface-card, #fff)', color: 'var(--text-primary)', boxShadow: '0 24px 60px rgba(0,0,0,0.25)', position: 'relative' }}>
        <button type="button" onClick={later} aria-label="Close" style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}><X size={18} /></button>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'color-mix(in srgb, var(--color-primary-500) 14%, transparent)', color: 'var(--color-primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><Fingerprint size={24} /></div>
        <h2 style={{ margin: '0 0 6px', fontSize: '1.1rem', fontWeight: 800 }}>Sign in with your fingerprint or face</h2>
        <p style={{ margin: '0 0 14px', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
          Add a passkey to this device and you will not need to type your password here again. It can not be guessed, and it can not be handed to a fake website. It takes about ten seconds.
        </p>

        {needPassword ? (
          <form onSubmit={(e) => { e.preventDefault(); submitPassword(true); }} style={{ display: 'grid', gap: 8 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Type your password to continue</label>
            <input type="password" autoComplete="current-password" autoFocus aria-label="Your password" value={typed} onChange={(e) => setTyped(e.target.value)}
              style={{ padding: '9px 11px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'transparent', color: 'inherit', fontSize: '0.88rem' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={!typed} style={{ flex: 1, height: 40, borderRadius: 10, border: 'none', background: 'var(--color-primary-600)', color: 'white', fontWeight: 700, cursor: 'pointer' }}>Continue</button>
              <button type="button" onClick={() => submitPassword(false)} style={{ height: 40, padding: '0 14px', borderRadius: 10, border: '1.5px solid var(--line)', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>Cancel</button>
            </div>
          </form>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <button type="button" onClick={add} disabled={busy} data-testid="passkey-offer-add"
              style={{ height: 44, borderRadius: 12, border: 'none', background: 'var(--color-primary-600)', color: 'white', fontWeight: 700, fontSize: '0.88rem', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
              {busy ? 'Waiting for your device…' : 'Add a passkey'}
            </button>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <button type="button" onClick={later} data-testid="passkey-offer-later" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600 }}>Not now</button>
              {!required && <button type="button" onClick={never} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>Don't ask again</button>}
            </div>
            <Link to={mine} onClick={() => setOpen(false)} style={{ fontSize: '0.76rem', color: 'var(--color-primary-600)', textAlign: 'center' }}>Manage my passkeys</Link>
          </div>
        )}
      </div>
    </div>
  );
}
