import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Fingerprint, LogOut, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../../../_shared/store/index';
import authAPI from '../../../_shared/api/auth';
import { passkeyProblem, passkeysSupported, suggestedName } from '../../../_shared/lib/webauthn';
import { addPasskey, proveWithPasskey, withProtection } from '../../../_shared/lib/passkeyFlows';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import RecoveryUse from './RecoveryUse';

const WORDS = {
  passkey_missing: {
    title: 'Add a passkey to carry on',
    body: 'Your role can move money or change who may do what, so it needs a passkey: your fingerprint, face or screen PIN instead of only a password. It takes about ten seconds, and you only do it once on each device.',
    action: 'Add a passkey',
  },
  second_missing: {
    title: 'Add a passkey on a second device',
    body: 'Your role needs two passkeys, on two different devices, so losing one never locks you out. Use another phone, another computer, or a security key. (A device that already has one for your account will say so.)',
    action: 'Add the second passkey',
  },
  device_bound_missing: {
    title: 'Add a passkey that stays on its device',
    body: 'Your role needs two passkeys that stay on their device: a security key you plug in or tap, or this computer’s own sign-in. Passkeys that are copied to a Google or Apple account do not count for this role.',
    action: 'Add a passkey',
  },
  passkey_needed: {
    title: 'Confirm it is you',
    body: 'You signed in with your password. Your role also needs your passkey, so that someone who only learned your password can not get in. Use your fingerprint, face or screen PIN.',
    action: 'Use my passkey',
  },
};

/**
 * "One more step": when the passkey rule holds this sign-in to adding or using a passkey, nothing else in the app works until it is done (the server refuses everything else), so this covers the page
 * with the one thing to do and a way to sign out. Appears from what the server said at sign-in, or the moment the server refuses something because of the rule.
 */
export default function SecurityGate() {
  const authed = useAuthStore((s) => s.isAuthenticated);
  const security = useAuthStore((s) => s.security);
  const fetchCustomer = useAuthStore((s) => s.fetchCustomer);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(null);   // { resolve, reject } the password prompt
  const [typed, setTyped] = useState('');
  const [lost, setLost] = useState(false);          // "I lost the device": the recovery code form is open
  const [recovered, setRecovered] = useState(null); // when a recovery code was accepted (it is good for 15 minutes)

  // the server turned something away because of the rule, though the page did not know: find out why
  useEffect(() => {
    const onRestricted = () => { if (useAuthStore.getState().isAuthenticated) fetchCustomer(); };
    window.addEventListener('tisl:restricted', onRestricted);

    return () => window.removeEventListener('tisl:restricted', onRestricted);
  }, [fetchCustomer]);

  const gate = authed ? security?.gate : null;
  if (!gate) return null;
  const recoveredNow = recovered !== null && Date.now() - recovered < 15 * 60 * 1000;
  const words = recoveredNow ? { ...(WORDS[gate] ?? WORDS.passkey_needed), title: 'Add a new passkey', body: 'Your recovery code was accepted. For the next 15 minutes you can add a passkey on this device. Afterwards, remove the one that was lost under My devices.', action: 'Add a new passkey' } : (WORDS[gate] ?? WORDS.passkey_needed);

  const go = async () => {
    setBusy(true);
    try {
      if (gate === 'passkey_needed' && !recoveredNow) {
        await proveWithPasskey();
      } else {
        await withProtection((password) => addPasskey({ name: suggestedName(), password }), { askPassword: () => new Promise((resolve, reject) => { setTyped(''); setAsking({ resolve, reject }); }) });
        toast.success('Passkey added.');
      }
      await fetchCustomer();   // the server decides whether that was enough: the screen goes when it says so
    } catch (e) {
      if (e?.message !== 'cancelled') {
        const p = passkeyProblem(e);
        if (!p.cancelled || p.text) toast.error(p.text || errMsg(e, 'That did not work'));
      }
    } finally {
      setBusy(false);
    }
  };

  const answer = (ok) => { const a = asking; setAsking(null); if (ok) a.resolve(typed); else a.reject(new Error('cancelled')); setTyped(''); };
  const signOut = async () => { try { await authAPI.logout(); } catch { /* the session may already be gone */ } logout(); navigate('/login'); };

  return (
    <div role="dialog" aria-modal="true" aria-label={words.title} data-testid="security-gate"
      style={{ position: 'fixed', inset: 0, zIndex: 9500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'var(--bg-secondary, #f9fafb)' }}>
      <div style={{ width: '100%', maxWidth: 460, borderRadius: 16, padding: 28, background: 'var(--surface-card, #fff)', color: 'var(--text-primary)', border: '1px solid var(--line)', boxShadow: '0 24px 60px rgba(0,0,0,0.12)' }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'color-mix(in srgb, var(--color-primary-500) 14%, transparent)', color: 'var(--color-primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          {gate === 'passkey_needed' ? <ShieldCheck size={26} /> : <Fingerprint size={26} />}
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: '1.2rem', fontWeight: 800 }}>{words.title}</h2>
        <p style={{ margin: '0 0 6px', fontSize: '0.86rem', color: 'var(--text-secondary)' }}>{words.body}</p>
        {security?.needs === 2 && gate !== 'passkey_needed' && <p style={{ margin: '0 0 14px', fontSize: '0.8rem', fontWeight: 700 }}>{security.passkeys} of 2 added so far.</p>}

        {!passkeysSupported() && <p style={{ margin: '10px 0', fontSize: '0.82rem', color: '#b91c1c' }}>This browser can not use passkeys. Open the site in a recent Chrome, Edge, Safari or Firefox on a phone or laptop with a fingerprint, face or PIN.</p>}

        {asking ? (
          <form onSubmit={(e) => { e.preventDefault(); answer(true); }} style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Type your password to continue</label>
            <input type="password" autoComplete="current-password" autoFocus aria-label="Your password" value={typed} onChange={(e) => setTyped(e.target.value)}
              style={{ padding: '9px 11px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'transparent', color: 'inherit', fontSize: '0.88rem' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={!typed} style={{ flex: 1, height: 42, borderRadius: 10, border: 'none', background: 'var(--color-primary-600)', color: 'white', fontWeight: 700, cursor: 'pointer' }}>Continue</button>
              <button type="button" onClick={() => answer(false)} style={{ height: 42, padding: '0 14px', borderRadius: 10, border: '1.5px solid var(--line)', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>Cancel</button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={go} disabled={busy || !passkeysSupported()} data-testid="security-gate-go"
            style={{ width: '100%', height: 46, marginTop: 12, borderRadius: 12, border: 'none', background: 'var(--color-primary-600)', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Waiting for your device…' : words.action}
          </button>
        )}

        {gate !== 'passkey_missing' && !recoveredNow && (
          lost ? <RecoveryUse onRecovered={() => { setLost(false); setRecovered(Date.now()); }} />
            : <button type="button" onClick={() => setLost(true)} data-testid="gate-lost" style={{ marginTop: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary-600)', fontWeight: 700, fontSize: '0.8rem', padding: 0, display: 'block' }}>I can't use my passkey device (lost or broken)</button>
        )}

        <button type="button" onClick={signOut} style={{ marginTop: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </div>
  );
}
