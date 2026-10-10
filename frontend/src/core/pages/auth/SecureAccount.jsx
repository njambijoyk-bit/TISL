import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import sessionsAPI from '../../../_shared/api/sessions';

/** The page the "This was not me" button in the new-sign-in email opens. Nothing happens until the person presses the button here (so an email scanner opening the link does no harm). */
export default function SecureAccount() {
  const [params] = useSearchParams();
  const code = { t: params.get('t'), i: params.get('i'), e: params.get('e'), k: params.get('k') };
  const complete = Object.values(code).every(Boolean);
  const [state, setState] = useState({ busy: false, done: null, error: '' });

  const press = async () => {
    setState({ busy: true, done: null, error: '' });
    try {
      const r = await sessionsAPI.notMe(code);
      setState({ busy: false, done: r.message, error: '' });
    } catch (e) {
      setState({ busy: false, done: null, error: e.response?.data?.message ?? 'That did not work. Please use "Forgot password" on the sign-in page.' });
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px',
      background: 'linear-gradient(135deg, var(--bg-primary) 0%, color-mix(in srgb, var(--color-primary-500) 10%, var(--bg-primary)) 100%)',
    }}>
      <div style={{ width: '100%', maxWidth: 440, background: 'var(--surface-card, #fff)', borderRadius: 16, boxShadow: '0 8px 40px rgba(99,102,241,0.12)', padding: '36px 32px', textAlign: 'center' }}>
        {state.done ? (
          <>
            <CheckCircle2 size={40} style={{ color: '#10b981', marginBottom: 12 }} aria-hidden="true" />
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 8px', color: 'var(--text-primary)' }}>Done</h1>
            <p role="status" style={{ margin: '0 0 20px', fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{state.done}</p>
            <Link to="/login" style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--color-primary-500)' }}>Go to sign in</Link>
          </>
        ) : (
          <>
            <ShieldAlert size={40} style={{ color: '#f59e0b', marginBottom: 12 }} aria-hidden="true" />
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 8px', color: 'var(--text-primary)' }}>Was this not you?</h1>
            <p style={{ margin: '0 0 20px', fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              If you did not sign in, press the button. We sign everyone out of your account, including you, and email you a link to choose a new password.
            </p>
            {!complete && <p role="alert" style={{ color: '#b91c1c', fontSize: '0.84rem' }}>This link is not complete. Please open it again from the email.</p>}
            {state.error && <p role="alert" style={{ color: '#b91c1c', fontSize: '0.84rem', lineHeight: 1.5 }}>{state.error}</p>}
            <button type="button" onClick={press} disabled={!complete || state.busy} style={{
              padding: '11px 22px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: '0.9rem', fontFamily: 'inherit', color: '#fff',
              background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))', cursor: !complete || state.busy ? 'not-allowed' : 'pointer', opacity: !complete || state.busy ? 0.6 : 1,
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
              {state.busy && <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />}
              {state.busy ? 'Signing everyone out…' : 'Yes, sign everyone out'}
            </button>
            <div style={{ marginTop: 16 }}><Link to="/login" style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>No, it was me</Link></div>
          </>
        )}
      </div>
    </div>
  );
}
