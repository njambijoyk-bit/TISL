import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';

/** Shown inside Mimi's window instead of the chat until the policy is agreed. */
export default function MimiConsent({ policy, onDecline }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => { setBusy(true); setErr(''); try { await policy.accept(); } catch { setErr('Could not save your answer. Please try again.'); } finally { setBusy(false); } };
  if (policy.state === 'loading') return <div style={{ flex: 1, background: 'var(--surface-card)' }} />;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface-card)', color: 'var(--text-primary)', padding: 20, gap: 12, overflowY: 'auto', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ShieldCheck size={22} color="var(--color-primary-500)" />
        <strong style={{ fontSize: '0.95rem' }}>Before you chat with Mimi</strong>
      </div>
      <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
        Mimi is an AI assistant, so her answers can be wrong; check anything important with our team. Your messages are kept for safety and to improve the service,
        and she can only see the information that goes with your account{' '}(or public store details if you are not signed in).
      </p>
      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
        {policy.title || 'Mimi usage policy'}{policy.version ? ` · v${policy.version}` : ''}.{' '}
        <a href="/ai-policy" target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary-500)', fontWeight: 700 }}>Read the full policy</a>
      </p>
      <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>You are asked once, and again only if the policy changes in a major way.</p>
      {err && <p role="alert" style={{ margin: 0, fontSize: '0.76rem', color: 'var(--color-danger, #dc2626)' }}>{err}</p>}
      <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
        <button type="button" onClick={onDecline} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1.5px solid var(--line)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.82rem' }}>No thanks</button>
        <button type="button" onClick={go} disabled={busy} style={{ flex: 1.4, padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.82rem', color: '#fff', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))', opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'I agree'}</button>
      </div>
    </div>
  );
}
