import { useEffect, useState } from 'react';
import { SERIOUS_EVENT, installSerious } from '../lib/serious';
import { Btn, Field, Notice, TextInput } from './ui';

/**
 * Asks before a serious action is sent to a supervisor (build 2.4): what it is, that nothing changes until someone approves, and why it is
 * needed. Mounted once on every Projects page. Draws nothing until an action needs it.
 */
export default function SeriousDialog() {
  const [ask, setAsk] = useState(null);   // { info, resolve, reject }
  const [reason, setReason] = useState('');

  useEffect(() => {
    installSerious();
    const onAsk = (e) => { setReason(''); setAsk(e.detail); };
    window.addEventListener(SERIOUS_EVENT, onAsk);
    return () => window.removeEventListener(SERIOUS_EVENT, onAsk);
  }, []);
  useEffect(() => {
    if (!ask) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { ask.reject(); setAsk(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ask]);

  if (!ask) return null;
  const { info } = ask;
  const close = (send) => { if (send) ask.resolve({ reason: reason.trim() }); else ask.reject(); setAsk(null); };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'grid', placeItems: 'center', padding: 16, background: 'color-mix(in srgb, var(--text-primary) 40%, transparent)' }}>
      <form
        role="dialog" aria-modal="true" aria-labelledby="serious-title" onSubmit={(e) => { e.preventDefault(); close(true); }}
        style={{ width: 'min(480px, 100%)', padding: 20, borderRadius: 14, background: 'var(--surface-card)', border: '1px solid var(--line-strong)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', display: 'grid', gap: 12 }}
      >
        <h2 id="serious-title" style={{ margin: 0, fontSize: 17, fontFamily: 'var(--font-heading)' }}>This needs a supervisor first</h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}><strong>{info.label}</strong> is marked as a serious action here. It will be sent to the people who can approve it, and nothing changes until one of them does.</p>
        {info.needs === 'both' && <Notice>Once it is approved you will also be asked to confirm it is really you.</Notice>}
        <Field label={info.reason_required ? 'Why it needs doing' : 'Why it needs doing (optional)'} htmlFor="serious-reason" hint="The supervisor reads this, and it is kept in the log.">
          <TextInput id="serious-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} required={info.reason_required} autoFocus />
        </Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Btn onClick={() => close(false)}>Do not ask</Btn>
          <Btn type="submit" variant="primary">Ask a supervisor</Btn>
        </div>
      </form>
    </div>
  );
}
