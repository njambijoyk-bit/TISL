import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Users } from 'lucide-react';
import recoveryRequestsAPI from '../../../_shared/api/recoveryRequests';
import { errMsg } from '../../../_shared/store/helpers/apiState';

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const small = { fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 };
const button = { height: 40, padding: '0 16px', borderRadius: 10, border: 'none', background: 'var(--color-primary-600)', color: 'white', fontWeight: 700, cursor: 'pointer' };
const ghost = { height: 40, padding: '0 14px', borderRadius: 10, border: '1.5px solid var(--line)', background: 'transparent', color: 'inherit', fontWeight: 600, cursor: 'pointer' };

/**
 * "No recovery codes either": a member of staff asks two other administrators to help them back in. They check it is really them another way and approve; then there is a waiting day (so that, if this was
 * not the person, they have time to stop it); then the person starts the recovery, which lets this sign-in add a new passkey for 15 minutes. `onStarted` is told when it has started.
 */
export default function AssistedRecoveryPanel({ onStarted }) {
  const [status, setStatus] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const load = useCallback(() => recoveryRequestsAPI.mine().then(setStatus).catch(() => {}), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);

    return () => clearInterval(t);
  }, [load]);

  const act = async (fn, ok) => {
    setBusy(true);
    setProblem('');
    try {
      const r = await fn();
      if (ok) toast.success(r.message ?? ok);
      if (r?.request !== undefined) setStatus(r); else await load();

      return r;
    } catch (e) {
      setProblem(errMsg(e, 'That did not work'));
      load();

      return null;
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;
  if (!status.ready) return <p data-testid="assist-unavailable" style={small}>Help from administrators is not set up on this server. Ask the owner to use the emergency recovery on the server.</p>;
  if (!status.staff) return null;
  const r = status.request;

  return (
    <div data-testid="assist" style={{ display: 'grid', gap: 8, marginTop: 14, padding: 14, borderRadius: 12, border: '1.5px solid var(--line)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800, fontSize: '0.86rem' }}><Users size={16} aria-hidden="true" /> No recovery codes either?</div>

      {!r && (
        <>
          <p style={small}>Ask {status.needed} other administrators to help you back in. They will check it is really you another way (a phone call, or in person) and approve. Then there is a waiting day, so that if this was not you there is time to stop it.</p>
          <textarea aria-label="What happened" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened? (for example: my phone was stolen)"
            style={{ padding: '9px 11px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'transparent', color: 'inherit', fontFamily: 'inherit', fontSize: '0.86rem', resize: 'vertical' }} />
          <button type="button" disabled={busy} onClick={() => act(() => recoveryRequestsAPI.ask(note.trim() || null), 'Asked')} data-testid="assist-ask" style={button}>Ask {status.needed} administrators to help me</button>
        </>
      )}

      {r?.state === 'pending' && (
        <>
          <p data-testid="assist-state" style={small}>Waiting for administrators to approve: <strong>{r.approved} of {r.needed}</strong>{r.approved_by.length > 0 && ` (${r.approved_by.join(' and ')} so far)`}. They will contact you another way first. It runs out at {when(r.expires_at)}.</p>
          <button type="button" disabled={busy} onClick={() => act(() => recoveryRequestsAPI.cancel(r.id), 'Cancelled')} data-testid="assist-cancel" style={ghost}>Cancel this request</button>
        </>
      )}

      {r?.state === 'cooling' && (
        <>
          <p data-testid="assist-state" style={small}>Approved by <strong>{r.approved_by.join(' and ')}</strong>. You can start the recovery from <strong>{when(r.release_at)}</strong>. The wait is there so that, if this was not you, there is time to stop it.</p>
          <button type="button" disabled={busy} onClick={() => act(() => recoveryRequestsAPI.cancel(r.id), 'Cancelled')} data-testid="assist-cancel" style={ghost}>Cancel this request</button>
        </>
      )}

      {r?.state === 'ready' && (
        <>
          <p data-testid="assist-state" style={small}>Approved by <strong>{r.approved_by.join(' and ')}</strong> and the waiting day is over. Starting it ends every other sign-in of yours and lets this one add a new passkey for 15 minutes. Start it until {when(r.expires_at)}.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={busy} data-testid="assist-start" style={button}
              onClick={async () => { const done = await act(() => recoveryRequestsAPI.start(r.id), 'Started'); if (done) onStarted?.(done); }}>Start the recovery</button>
            <button type="button" disabled={busy} onClick={() => act(() => recoveryRequestsAPI.cancel(r.id), 'Cancelled')} data-testid="assist-cancel" style={ghost}>Cancel</button>
          </div>
        </>
      )}

      {problem && <p role="alert" data-testid="assist-problem" style={{ ...small, color: '#b91c1c' }}>{problem}</p>}
    </div>
  );
}
