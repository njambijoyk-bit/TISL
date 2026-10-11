import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, MailCheck, MailX } from 'lucide-react';
import toast from 'react-hot-toast';
import { authAPI } from '../../../_shared/api/index';
import { useAuthStore, useModuleStore } from '../../../_shared/store/index';
import PolicyConsentCheckbox from '../../../_shared/components/legal/shared/PolicyConsentCheckbox';

/**
 * The page the emailed sign-in link opens. Looking at it signs nobody in (a mail program that "clicks" every link to check it for viruses must not use the link up):
 * the person presses the button here. The link only works in the browser it was asked for from, so the answer to "wrong browser" is spelled out.
 */
export default function EmailLinkSignIn() {
  const [params] = useSearchParams();
  const code = params.get('k') || '';
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [state, setState] = useState({ phase: code ? 'checking' : 'bad', name: '', reason: 'expired', message: '' });
  const [busy, setBusy] = useState(false);
  const [policy, setPolicy] = useState({ accepted: false, list: [] });

  useEffect(() => {
    if (!code) return undefined;
    let current = true;
    authAPI.checkEmailLink(code)
      .then((r) => { if (current) setState({ phase: 'ready', name: r.name || '', reason: '', message: '' }); })
      .catch((e) => { if (current) setState({ phase: 'bad', name: '', reason: e.response?.data?.reason || 'expired', message: e.response?.data?.message || '' }); });
    return () => { current = false; };
  }, [code]);

  const press = async () => {
    setBusy(true);
    try {
      const r = await authAPI.confirmEmailLink(code, policy.list.length ? { policy_acceptances: policy.list } : {});
      if (r.requires_policy_acceptance) { toast.error('Please accept the updated policies to continue.'); return; }
      login(r.user, r.customer, r.token, r.access ?? null, r.csrf ?? null, r.security);
      useModuleStore.getState().refresh();
      toast.success('Welcome back!');
      navigate('/');
    } catch (e) {
      if (e.response?.data?.policy_disagreement) { toast.error(e.response.data.message || 'You must accept this policy to continue.'); setPolicy({ accepted: false, list: [] }); return; }
      setState({ phase: 'bad', name: '', reason: e.response?.data?.reason || 'expired', message: e.response?.data?.message || 'That did not work. Please ask for a new link.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', background: 'linear-gradient(135deg, var(--bg-primary) 0%, color-mix(in srgb, var(--color-primary-500) 10%, var(--bg-primary)) 100%)' }}>
      <div style={{ width: '100%', maxWidth: 440, background: 'var(--surface-card, #fff)', borderRadius: 16, boxShadow: '0 8px 40px rgba(99,102,241,0.12)', padding: '36px 32px', textAlign: 'center' }}>
        {state.phase === 'checking' && <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-primary-500)' }} aria-label="Checking your link" />}
        {state.phase === 'bad' && (
          <>
            <MailX size={40} style={{ color: '#f59e0b', marginBottom: 12 }} aria-hidden="true" />
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 8px', color: 'var(--text-primary)' }}>{state.reason === 'other_browser' ? 'Open this in the same browser' : 'This link cannot be used'}</h1>
            <p role="alert" data-testid="email-link-problem" style={{ margin: '0 0 20px', fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {state.message || 'This link has expired or was already used. Ask for a new one.'}
            </p>
            <Link to="/login" style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--color-primary-500)' }}>Back to sign in</Link>
          </>
        )}
        {state.phase === 'ready' && (
          <>
            <MailCheck size={40} style={{ color: '#10b981', marginBottom: 12 }} aria-hidden="true" />
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 8px', color: 'var(--text-primary)' }}>{state.name ? `Sign in as ${state.name}?` : 'Sign in?'}</h1>
            <p style={{ margin: '0 0 16px', fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>You asked for a link to sign in without a password. Press the button to finish.</p>
            <div style={{ textAlign: 'left', marginBottom: 16 }}>
              <PolicyConsentCheckbox policyKeys={['terms_of_use', 'privacy_policy']} actionContext="login" onChange={(isChecked, acceptances) => setPolicy({ accepted: isChecked, list: acceptances })} />
            </div>
            <button type="button" onClick={press} disabled={busy || !policy.accepted} data-testid="email-link-confirm" style={{
              padding: '11px 22px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: '0.9rem', fontFamily: 'inherit', color: '#fff',
              background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))', cursor: busy || !policy.accepted ? 'not-allowed' : 'pointer', opacity: busy || !policy.accepted ? 0.6 : 1,
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
              {busy && <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />}
              {busy ? 'Signing you in…' : 'Sign me in'}
            </button>
            <div style={{ marginTop: 16 }}><Link to="/login" style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>Not you? Back to sign in</Link></div>
          </>
        )}
      </div>
    </div>
  );
}
