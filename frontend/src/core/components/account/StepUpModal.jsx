import { useCallback, useEffect, useRef, useState } from 'react';
import { Fingerprint, ShieldAlert, Users, X } from 'lucide-react';
import stepUpAPI from '../../../_shared/api/stepUp';
import { getPasskey, passkeyProblem, passkeysSupported } from '../../../_shared/lib/webauthn';
import { errMsg } from '../../../_shared/store/helpers/apiState';

const field = { padding: '9px 11px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'transparent', color: 'inherit', fontSize: '0.88rem', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };

/**
 * The Sphinx's question: "Is this the action you intended?" Shown whenever the server holds a sensitive action back (403 with `step_up`): the facts come from the server's own record of what was asked, never from
 * this page; a serious action also asks why; the answer is a passkey (or, where the rule allows, the password). When it is answered, the action that was held is tried again by itself.
 *
 * Mounted once, in App. The API client (axios.js) raises `tisl:step-up` with a promise to settle; several at once wait their turn.
 */
export default function StepUpModal() {
  const [queue, setQueue] = useState([]);
  const current = queue[0] ?? null;

  useEffect(() => {
    const on = (e) => setQueue((q) => [...q, e.detail]);
    window.addEventListener('tisl:step-up', on);

    return () => window.removeEventListener('tisl:step-up', on);
  }, []);

  const done = useCallback(() => setQueue((q) => q.slice(1)), []);
  if (!current) return null;

  return <Question key={current.info.pending} request={current} onDone={done} />;
}

function Question({ request, onDone }) {
  const { info, resolve, reject } = request;
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [second, setSecond] = useState(null);      // set once the first answer is in and a second person has to approve too: { state, by, note, until }
  const settled = useRef(false);

  const needReason = info.reason_required && reason.trim().length < 3;
  const serious = info.class === 'critical';

  const finish = (ok) => {
    if (settled.current) return;
    settled.current = true;
    ok ? resolve(info.pending) : reject(new Error('cancelled'));
    onDone();
  };

  useEffect(() => () => { if (!settled.current) { settled.current = true; reject(new Error('cancelled')); } }, [reject]);

  // While a second person is asked, look for their answer every few seconds; when they approve, the action goes ahead by itself.
  useEffect(() => {
    if (!second || second.state !== 'waiting') return undefined;
    let stop = false;
    const look = async () => {
      try {
        const r = await stepUpAPI.show(info.pending);
        if (stop) return;
        if (r.second?.state === 'approved') finish(true);
        else if (r.second && r.second.state !== 'waiting') setSecond(r.second);
      } catch { /* try again in a moment */ }
    };
    const timer = setInterval(look, 3000);

    return () => { stop = true; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [second?.state, info.pending]);

  const cancel = async () => {
    stepUpAPI.cancel(info.pending).catch(() => {});
    finish(false);
  };

  const answered = (r) => {
    if (r?.waiting_for_second) setSecond(r.second ?? { state: 'waiting' });
    else finish(true);
  };

  const withPasskey = async () => {
    setBusy(true);
    setProblem('');
    try {
      const q = await stepUpAPI.options(info.pending);
      const credential = await getPasskey(q.options);
      answered(await stepUpAPI.approve(info.pending, { challenge_id: q.challenge_id, credential, ...(reason.trim() ? { reason: reason.trim() } : {}) }));
    } catch (e) {
      const p = passkeyProblem(e);
      if (!p.cancelled || p.text) setProblem(p.text || errMsg(e, 'That did not work'));
    } finally {
      setBusy(false);
    }
  };

  const withPassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    setProblem('');
    try {
      answered(await stepUpAPI.approve(info.pending, { current_password: password, ...(reason.trim() ? { reason: reason.trim() } : {}) }));
    } catch (err) {
      setProblem(errMsg(err, 'That did not work'));
    } finally {
      setBusy(false);
    }
  };

  if (second) {
    const state = second.state;
    const title = state === 'waiting' ? 'Waiting for a second person' : state === 'declined' ? 'A second person declined' : state === 'cancelled' ? 'Given up' : 'It ran out';
    const text = state === 'waiting'
      ? 'Someone else who can do this too has been asked to look at the same details and approve. This closes by itself when they answer, and the action then goes ahead.'
      : state === 'declined'
        ? `${second.by ?? 'The second person'} declined${second.note ? `: "${second.note}"` : '.'} Nothing was done.`
        : 'Nobody approved it in time. Nothing was done: try again when they are ready.';

    return (
      <div role="dialog" aria-modal="true" aria-label="Waiting for a second person" data-testid="step-up-waiting"
        style={{ position: 'fixed', inset: 0, zIndex: 9600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.5)' }}>
        <div style={{ width: '100%', maxWidth: 440, borderRadius: 16, padding: 24, background: 'var(--surface-card, #fff)', color: 'var(--text-primary)', border: '2px solid var(--color-primary-600)', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--color-primary-500) 14%, transparent)', color: 'var(--color-primary-600)' }}><Users size={22} /></span>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }} data-testid="step-up-waiting-title">{title}</h2>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>{text}</p>
          {state === 'waiting' && second.until && <p style={{ margin: '0 0 14px', fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>It runs out at {new Date(second.until).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}.</p>}
          <button type="button" onClick={state === 'waiting' ? cancel : () => finish(false)} data-testid={state === 'waiting' ? 'step-up-cancel' : 'step-up-close'}
            style={{ height: 40, borderRadius: 12, border: '1.5px solid var(--line)', background: 'transparent', color: 'inherit', fontWeight: 700, cursor: 'pointer', width: '100%' }}>{state === 'waiting' ? 'Give this up' : 'Close'}</button>
        </div>
      </div>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Confirm this action" data-testid="step-up"
      style={{ position: 'fixed', inset: 0, zIndex: 9600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ width: '100%', maxWidth: 480, maxHeight: '92vh', overflow: 'auto', borderRadius: 16, padding: 24, background: 'var(--surface-card, #fff)', color: 'var(--text-primary)', border: serious ? '2px solid var(--color-primary-600)' : '1px solid var(--line)', boxShadow: '0 24px 60px rgba(0,0,0,0.3)', position: 'relative' }}>
        <button type="button" onClick={cancel} aria-label="Cancel" style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}><X size={18} /></button>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--color-primary-500) 14%, transparent)', color: 'var(--color-primary-600)' }}>{serious ? <ShieldAlert size={22} /> : <Fingerprint size={22} />}</span>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: serious ? 'var(--color-primary-600)' : 'var(--text-tertiary)' }}>{serious ? 'Serious action' : 'Important action'}</div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Is this what you meant to do?</h2>
          </div>
        </div>
        <p style={{ margin: '4px 0 12px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          Read what is about to happen. These details come from our records of your request, not from your screen. Only go on if they are right.
        </p>

        <dl data-testid="step-up-facts" style={{ margin: '0 0 14px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 14px', fontSize: '0.84rem', padding: 12, borderRadius: 10, background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)' }}>
          {info.facts.map((f, i) => (
            <div key={`${f.label}-${i}`} style={{ display: 'contents' }}>
              <dt style={{ color: 'var(--text-tertiary)', fontWeight: 700 }}>{f.label}</dt>
              <dd style={{ margin: 0, wordBreak: 'break-word', fontWeight: f.label === 'What' ? 800 : 500 }}>{f.value}</dd>
            </div>
          ))}
        </dl>

        {info.reason_required && (
          <label style={{ display: 'grid', gap: 4, marginBottom: 12, fontSize: '0.8rem', fontWeight: 700 }}>
            Why are you doing this?
            <textarea aria-label="Reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...field, resize: 'vertical', fontWeight: 400 }} placeholder="A few words, for the record" />
          </label>
        )}
        {info.will_need_second && <p data-testid="step-up-second-note" style={{ margin: '0 0 12px', fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: 6 }}><Users size={14} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" /> After you confirm, a second person who can do this too has to look at the same details and approve it before it goes through.</p>}

        {problem && <p role="alert" style={{ margin: '0 0 10px', fontSize: '0.8rem', color: '#b91c1c' }}>{problem}</p>}

        <div style={{ display: 'grid', gap: 10 }}>
          {info.has_passkey && passkeysSupported() && (
            <button type="button" onClick={withPasskey} disabled={busy || needReason} data-testid="step-up-passkey"
              style={{ height: 46, borderRadius: 12, border: 'none', background: 'var(--color-primary-600)', color: 'white', fontWeight: 800, fontSize: '0.9rem', cursor: busy || needReason ? 'not-allowed' : 'pointer', opacity: busy || needReason ? 0.55 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Fingerprint size={18} /> {busy ? 'Waiting for your device…' : 'Yes, confirm with my passkey'}
            </button>
          )}
          {info.can_use_password && (
            <form onSubmit={withPassword} style={{ display: 'grid', gap: 8 }}>
              {info.has_passkey && <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>or use your password</span>}
              <input type="password" aria-label="Your password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" style={field} />
              <button type="submit" disabled={busy || needReason || !password} data-testid="step-up-password"
                style={{ height: info.has_passkey ? 40 : 46, borderRadius: 12, border: info.has_passkey ? '1.5px solid var(--line)' : 'none', background: info.has_passkey ? 'transparent' : 'var(--color-primary-600)', color: info.has_passkey ? 'inherit' : 'white', fontWeight: 700, cursor: busy || needReason || !password ? 'not-allowed' : 'pointer', opacity: busy || needReason || !password ? 0.55 : 1 }}>
                Yes, confirm with my password
              </button>
            </form>
          )}
          {!info.has_passkey && !info.can_use_password && <p style={{ margin: 0, fontSize: '0.82rem' }}>This needs a passkey, and you have not added one yet. Add one under your profile, "My devices", then try again.</p>}
          <button type="button" onClick={cancel} data-testid="step-up-cancel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600 }}>No, cancel</button>
        </div>
      </div>
    </div>
  );
}
