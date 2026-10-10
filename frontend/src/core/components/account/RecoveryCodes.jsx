import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, Download, LifeBuoy, Printer } from 'lucide-react';
import recoveryAPI from '../../../_shared/api/recovery';
import { passkeyProblem } from '../../../_shared/lib/webauthn';
import { withProtection } from '../../../_shared/lib/passkeyFlows';
import { errMsg } from '../../../_shared/store/helpers/apiState';

const btn = { padding: '6px 12px', borderRadius: 8, fontSize: '0.76rem', fontWeight: 700, border: '1.5px solid var(--line)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 };
const primary = { ...btn, border: 'none', background: 'var(--color-primary-600)', color: 'white' };

const sheet = (codes) => `TISL recovery codes\nMade ${new Date().toLocaleString('en-KE')}\n\nEach code works once. Keep this somewhere safe, away from your phone.\n\n${codes.join('\n')}\n`;

/**
 * Recovery codes: ten single-use codes for the day a phone with a passkey is lost. Shown once, right after they are made; the page insists they are saved before it lets go of them.
 * Making a set needs proof (a passkey used just now, or the password if there is no passkey); a new set ends the old one.
 */
export default function RecoveryCodes() {
  const [status, setStatus] = useState(null);
  const [fresh, setFresh] = useState(null);       // the codes just made: the only time they are on screen
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(null);
  const [typed, setTyped] = useState('');
  const mounted = useRef(true);

  const load = useCallback(() => recoveryAPI.status().then((r) => mounted.current && setStatus(r)).catch(() => {}), []);
  useEffect(() => { mounted.current = true; load(); return () => { mounted.current = false; }; }, [load]);

  const make = async () => {
    setBusy(true);
    try {
      const r = await withProtection((password) => recoveryAPI.generate(password ? { current_password: password } : {}), { askPassword: () => new Promise((resolve, reject) => { setTyped(''); setAsk({ resolve, reject }); }) });
      setFresh(r.codes);
      setSaved(false);
      await load();
    } catch (e) {
      if (e?.message !== 'cancelled') {
        const p = passkeyProblem(e);
        if (!p.cancelled || p.text) toast.error(p.text || errMsg(e, 'Could not make the codes'));
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const copy = async () => { try { await navigator.clipboard.writeText(sheet(fresh)); toast.success('Copied'); } catch { toast.error('Could not copy: select the codes and copy them'); } };
  const download = () => {
    const url = URL.createObjectURL(new Blob([sheet(fresh)], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'tisl-recovery-codes.txt' });
    a.click();
    URL.revokeObjectURL(url);
  };
  const print = () => {
    const w = window.open('', '_blank', 'width=480,height=640');
    if (!w) return toast.error('Allow pop-ups to print');
    w.document.write(`<pre style="font:16px/1.7 monospace">${sheet(fresh).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`);
    w.document.close();
    w.print();
  };
  const answer = (ok) => { const a = ask; setAsk(null); if (ok) a.resolve(typed); else a.reject(new Error('cancelled')); setTyped(''); };

  if (!status || status.ready === false) return null;

  return (
    <div style={{ display: 'grid', gap: 10 }} data-testid="recovery-codes">
      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <LifeBuoy size={13} style={{ verticalAlign: -2 }} /> If you lose the phone or computer that holds your passkey, one of these codes lets you add a new one. Print them or keep them in a safe place that is not on that phone.
      </p>

      {fresh ? (
        <div style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 10, border: '1.5px solid var(--color-primary-500)' }} data-testid="recovery-fresh">
          <strong style={{ fontSize: '0.84rem' }}>Your new recovery codes - this is the only time they are shown</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6, fontFamily: 'ui-monospace, monospace', fontSize: '0.95rem', letterSpacing: '0.06em' }}>
            {fresh.map((c) => <span key={c} data-testid="recovery-code">{c}</span>)}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" style={btn} onClick={copy}><Copy size={12} /> Copy</button>
            <button type="button" style={btn} onClick={download}><Download size={12} /> Download</button>
            <button type="button" style={btn} onClick={print}><Printer size={12} /> Print</button>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.8rem' }}>
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I have saved these codes somewhere safe
          </label>
          <button type="button" style={{ ...primary, justifySelf: 'start', opacity: saved ? 1 : 0.5 }} disabled={!saved} onClick={() => setFresh(null)} data-testid="recovery-done">Done</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.84rem', fontWeight: 700 }} data-testid="recovery-remaining">{status.remaining > 0 ? `${status.remaining} of ${status.total} recovery codes left` : 'You have no recovery codes'}</span>
          <button type="button" style={primary} disabled={busy} onClick={make} data-testid="recovery-make">{status.remaining > 0 ? 'Make a new set' : 'Make recovery codes'}</button>
          {status.remaining > 0 && <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>A new set ends the old one.</span>}
        </div>
      )}

      {ask && (
        <form onSubmit={(e) => { e.preventDefault(); answer(true); }} style={{ display: 'grid', gap: 8, padding: 10, borderRadius: 8, border: '1.5px solid var(--color-primary-500)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Type your password to make recovery codes</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input aria-label="Your password" type="password" autoComplete="current-password" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)}
              style={{ flex: '1 1 200px', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'transparent', color: 'inherit' }} />
            <button type="submit" style={primary} disabled={!typed}>Continue</button>
            <button type="button" style={btn} onClick={() => answer(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
