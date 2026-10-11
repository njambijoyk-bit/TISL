import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Fingerprint, ShieldAlert, Users } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../components/admin/ui/HubHeader';
import councilAPI from '../../../_shared/api/council';
import { getPasskey, passkeyProblem, passkeysSupported } from '../../../_shared/lib/webauthn';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';

const field = { padding: '9px 11px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'transparent', color: 'inherit', fontSize: '0.86rem', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };

const minutesLeft = (iso) => Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));

/** One request that is waiting for this person: the server's own record of what is being asked, and the two answers. */
function Request({ r, onDone }) {
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const serious = r.class === 'critical';
  const needReason = r.reason_required && reason.trim().length < 3;

  const answered = (message) => { toast.success(message); onDone(); };
  const failed = (e) => {
    const p = passkeyProblem(e);
    if (e?.response?.status === 404 || e?.response?.status === 410) { toast.error('That request is no longer waiting: it was answered, given up or ran out.'); onDone(); return; }
    if (!p.cancelled || p.text) setProblem(p.text || errMsg(e, 'That did not work'));
  };

  const withPasskey = async () => {
    setBusy(true);
    setProblem('');
    try {
      const q = await councilAPI.options(r.id);
      const credential = await getPasskey(q.options);
      const res = await councilAPI.approve(r.id, { challenge_id: q.challenge_id, credential, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      answered(res.message);
    } catch (e) { failed(e); } finally { setBusy(false); }
  };

  const withPassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    setProblem('');
    try {
      const res = await councilAPI.approve(r.id, { current_password: password, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      answered(res.message);
    } catch (err) { failed(err); } finally { setBusy(false); }
  };

  const decline = async () => {
    setBusy(true);
    setProblem('');
    try {
      const res = await councilAPI.reject(r.id, reason.trim() ? { reason: reason.trim() } : {});
      answered(res.message);
    } catch (e) { failed(e); } finally { setBusy(false); }
  };

  return (
    <div data-request={r.id} style={{ ...card, padding: 18, display: 'grid', gap: 12, border: serious ? `2px solid ${colors.primary}` : undefined }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {serious ? <ShieldAlert size={20} aria-hidden="true" /> : <Fingerprint size={20} aria-hidden="true" />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{r.label}</div>
          <div style={{ fontSize: '0.76rem', color: colors.textMuted }}>Asked by {r.asked_by}. Waiting {minutesLeft(r.expires_at)} more minute{minutesLeft(r.expires_at) === 1 ? '' : 's'}.</div>
        </div>
      </div>

      <dl data-testid="council-facts" style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 14px', fontSize: '0.84rem', padding: 12, borderRadius: 10, background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)' }}>
        {r.facts.map((f, i) => (
          <div key={`${f.label}-${i}`} style={{ display: 'contents' }}>
            <dt style={{ color: colors.textFaint, fontWeight: 700 }}>{f.label}</dt>
            <dd style={{ margin: 0, wordBreak: 'break-word', fontWeight: f.label === 'What' ? 800 : 500 }}>{f.value}</dd>
          </div>
        ))}
      </dl>
      {r.their_reason && <p style={{ margin: 0, fontSize: '0.84rem' }}><strong>Their reason:</strong> {r.their_reason}</p>}
      <p style={{ margin: 0, fontSize: '0.76rem', color: colors.textMuted }}>These details are our own record of what was asked, not something the other person typed into this page. Only approve it if they are right and you know why it is being done.</p>

      <label style={{ display: 'grid', gap: 4, fontSize: '0.8rem', fontWeight: 700 }}>
        {r.reason_required ? 'Why are you approving it?' : 'A note (optional)'}
        <textarea aria-label="Your reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...field, resize: 'vertical', fontWeight: 400 }} placeholder="A few words, for the record" />
      </label>

      {problem && <p role="alert" style={{ margin: 0, fontSize: '0.8rem', color: colors.danger }}>{problem}</p>}

      <div style={{ display: 'grid', gap: 8 }}>
        {r.has_passkey && passkeysSupported() && (
          <button type="button" style={{ ...btnPrimary, justifyContent: 'center' }} disabled={busy || needReason} onClick={withPasskey} data-testid="council-approve"><Fingerprint size={15} /> {busy ? 'Waiting for your device…' : 'Approve with my passkey'}</button>
        )}
        {r.can_use_password && (
          <form onSubmit={withPassword} style={{ display: 'grid', gap: 8 }}>
            {r.has_passkey && <span style={{ fontSize: '0.74rem', color: colors.textFaint, textAlign: 'center' }}>or use your password</span>}
            <input type="password" aria-label="Your password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" style={field} />
            <button type="submit" style={r.has_passkey ? btnGhost : btnPrimary} disabled={busy || needReason || !password} data-testid="council-approve-password">Approve with my password</button>
          </form>
        )}
        {!r.has_passkey && !r.can_use_password && <p style={{ margin: 0, fontSize: '0.82rem' }}>This needs a passkey, and you have not added one yet. Add one under your profile, "My devices".</p>}
        <button type="button" style={{ ...btnGhost, color: colors.danger }} disabled={busy} onClick={decline} data-testid="council-decline">No, decline it</button>
      </div>
    </div>
  );
}

/** Admin → Security → Approvals: what a second person is being asked to look at (the Council of Two). */
export default function Approvals() {
  const [data, setData] = useState(null);
  const load = useCallback(() => councilAPI.list().then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the requests'))), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 10000);

    return () => clearInterval(t);
  }, [load]);

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 760, margin: '0 auto' }} data-testid="approvals">
        <HubHeader title="Approvals" description="For the most serious actions, one person is not enough: a second person who can do it too has to look at the same details and approve. Requests that are waiting for you are here." />
        {data && !data.ready && <p role="status" style={{ ...card, padding: 14, fontSize: '0.84rem' }}>Asking a second person is not set up yet: run database script 129 in Workbench.</p>}
        {data?.ready && data.data.length === 0 && (
          <p data-testid="approvals-empty" style={{ ...card, padding: 18, fontSize: '0.88rem', color: colors.textMuted, display: 'flex', gap: 8, alignItems: 'center' }}><Users size={16} aria-hidden="true" /> Nothing is waiting for you.</p>
        )}
        <div style={{ display: 'grid', gap: 14 }}>
          {(data?.data ?? []).map((r) => <Request key={r.id} r={r} onDone={load} />)}
        </div>
      </div>
    </AdminLayout>
  );
}
