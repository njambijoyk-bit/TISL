import { useCallback, useEffect, useRef, useState } from 'react';
import { Lock, X } from 'lucide-react';
import { btnGhost, btnPrimary, colors } from '../../../../_shared/theme/tokens';

/**
 * "Type your password to confirm": a change to payment keys moves money, so a screen left open is not enough. `ask(message)` returns a promise of the password, or null if
 * they cancelled. Render `dialog` somewhere in the page. The password is only held while the box is open and is never stored.
 */
export default function usePasswordPrompt() {
  const [state, setState] = useState(null);   // { message, resolve }
  const [value, setValue] = useState('');
  const input = useRef(null);

  const ask = useCallback((message) => new Promise((resolve) => { setValue(''); setState({ message, resolve }); }), []);
  const done = (v) => { state?.resolve(v); setState(null); setValue(''); };
  useEffect(() => { if (state) input.current?.focus(); }, [state]);
  useEffect(() => {
    if (!state) return undefined;
    const h = (e) => { if (e.key === 'Escape') { state.resolve(null); setState(null); setValue(''); } };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [state]);

  const dialog = state && (
    <div role="presentation" onClick={() => done(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,10,30,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <form role="dialog" aria-modal="true" aria-label="Confirm it is you" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (value) done(value); }}
        style={{ width: '100%', maxWidth: 400, background: 'var(--surface-card, #fff)', color: colors.text, borderRadius: 14, padding: 20, display: 'grid', gap: 12, boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Lock size={16} aria-hidden="true" /><strong style={{ flex: 1 }}>Confirm it is you</strong>
          <button type="button" onClick={() => done(null)} aria-label="Cancel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex' }}><X size={16} /></button>
        </div>
        <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>{state.message}</p>
        <input ref={input} type="password" autoComplete="current-password" aria-label="Your password" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Your password"
          style={{ padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--line, #d1d5db)', background: 'var(--surface-input, #fff)', color: 'inherit', fontFamily: 'inherit', fontSize: '0.9rem' }} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={btnGhost} onClick={() => done(null)}>Cancel</button>
          <button type="submit" style={{ ...btnPrimary, opacity: value ? 1 : 0.5 }} disabled={!value}>Confirm</button>
        </div>
      </form>
    </div>
  );

  return [ask, dialog];
}
