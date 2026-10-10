import { useState } from 'react';
import toast from 'react-hot-toast';
import recoveryAPI from '../../../_shared/api/recovery';
import { errMsg } from '../../../_shared/store/helpers/apiState';

/**
 * "I lost my device": type one of the recovery codes. It does not sign anyone in: it lets this sign-in add a new passkey for the next 15 minutes.
 * `onRecovered` is told when the code was accepted.
 */
export default function RecoveryUse({ onRecovered, compact = false }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await recoveryAPI.use(code);
      toast.success(r.message);
      setCode('');
      onRecovered?.(r);
    } catch (err) {
      toast.error(errMsg(err, 'That code did not work'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} data-testid="recovery-use" style={{ display: 'grid', gap: 8, marginTop: compact ? 0 : 12 }}>
      <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Type one of your recovery codes</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <input aria-label="Recovery code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXXX-XXXXX" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} maxLength={20}
          style={{ flex: '1 1 160px', padding: '9px 11px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'transparent', color: 'inherit', fontFamily: 'ui-monospace, monospace', letterSpacing: '0.08em', fontSize: '0.9rem' }} />
        <button type="submit" disabled={busy || code.replace(/[^A-Za-z0-9]/g, '').length < 10} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: 'var(--color-primary-600)', color: 'white', fontWeight: 700, cursor: 'pointer' }}>Use this code</button>
      </div>
      <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>Each code works once. It lets you add a new passkey for the next 15 minutes; it does not sign you in.</span>
    </form>
  );
}
