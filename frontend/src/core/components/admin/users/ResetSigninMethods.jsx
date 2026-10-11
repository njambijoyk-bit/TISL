import { useState } from 'react';
import toast from 'react-hot-toast';
import { ShieldAlert, X } from 'lucide-react';
import usersAPI from '../../../../_shared/api/users';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, colors } from '../../../../_shared/theme/tokens';

const field = { padding: '9px 11px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'transparent', color: 'inherit', fontSize: '0.86rem', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };

/**
 * "Reset sign-in methods": take away every passkey and recovery code of a person and end all their sign-ins, so they start again with their password. It is NOT a password reset (that leaves passkeys alone),
 * and it is a serious action: the server asks for the administrator's own passkey and a reason first (the "one more step" window appears by itself), and may ask a second administrator too.
 * For staff the passkey rule is for, it waits a day before it happens, so the person can stop it. `onDone` is told when it was asked for (or done).
 */
export default function ResetSigninMethods({ user, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setProblem('');
    try {
      const r = await usersAPI.resetSigninMethods(user.id, reason.trim());
      toast.success(r.message, { duration: 9000 });
      onDone?.(r);
      onClose?.();
    } catch (err) {
      if (err?.response?.data?.step_up) setProblem('Not done: it was not confirmed.');   // they closed the "one more step" window
      else setProblem(errMsg(err, 'That did not work'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,10,30,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <form role="dialog" aria-modal="true" aria-label="Reset sign-in methods" data-testid="reset-methods" onClick={(e) => e.stopPropagation()} onSubmit={submit}
        style={{ width: '100%', maxWidth: 460, background: 'var(--surface-card, #fff)', color: colors.text, borderRadius: 14, padding: 22, display: 'grid', gap: 12, boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldAlert size={18} aria-hidden="true" /><strong style={{ flex: 1 }}>Reset sign-in methods for {user.name}</strong>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex' }}><X size={16} /></button>
        </div>
        <p style={{ margin: 0, fontSize: '0.84rem', color: colors.textMuted }}>
          This takes away <strong>all</strong> of their passkeys and recovery codes and signs them out everywhere. They start again with their password (and add a passkey, if their role needs one). It does <strong>not</strong> change their password.
        </p>
        <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>
          For staff who handle money or access, it waits a day before it happens: they and the other administrators are told, and any of them can cancel it. Use it only when you have checked with the person another way.
        </p>
        <label style={{ display: 'grid', gap: 4, fontSize: '0.8rem', fontWeight: 700 }}>
          Why?
          <textarea aria-label="Reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...field, resize: 'vertical', fontWeight: 400 }} placeholder="For the record: for example, their phone was lost and they have no recovery codes" />
        </label>
        {problem && <p role="alert" style={{ margin: 0, fontSize: '0.8rem', color: colors.danger }}>{problem}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={btnGhost} onClick={onClose}>Cancel</button>
          <button type="submit" data-testid="reset-methods-go" disabled={busy || reason.trim().length < 3} style={{ ...btnGhost, background: colors.danger, color: '#fff', border: 'none', opacity: busy || reason.trim().length < 3 ? 0.5 : 1 }}>{busy ? 'Working…' : 'Reset their sign-in methods'}</button>
        </div>
      </form>
    </div>
  );
}
