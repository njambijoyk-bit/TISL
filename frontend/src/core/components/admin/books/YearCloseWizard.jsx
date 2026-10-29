import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { hasPermission } from '../../../../_shared/lib/roles';
import Modal from '../ui/Modal';
import { TextInput } from '../ui/Form';
import { btnPrimary, btnGhost, colors } from '../../../../_shared/theme/tokens';
import { money } from './booksFmt';

const STATUS = { prepared: 'Prepared, waiting for approval', approved: 'Approved, ready to lock', locked: 'Closed and locked', reopened: 'Reopened', superseded: 'Replaced' };
const ICON = { pass: <CheckCircle2 size={16} color={colors.success} />, warn: <AlertTriangle size={16} color={colors.warning} />, fail: <XCircle size={16} color={colors.danger} /> };

/**
 * The year-end close for one financial year: the checklist, then prepare, approve, lock, and reopen with a reason. Nothing is posted: the close stores what each
 * ledger carries into the next year and locks the year. The preparer cannot approve it when the second-approver rule is on (Reports settings).
 */
export default function YearCloseWizard({ year, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const [ticked, setTicked] = useState([]);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => booksAPI.yearCloseShow(year.id).then(setD).catch((e) => toast.error(errMsg(e, 'Could not load the close'))), [year.id]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, ok) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); onChanged?.(); } catch (e) { toast.error(errMsg(e, 'That did not work')); } finally { setBusy(false); }
  };
  const close = d?.close;
  const canPrepare = hasPermission(null, 'books.close.prepare');
  const owner = hasPermission(null, 'books.period');
  const status = close?.status;
  const open = !close || ['reopened', 'superseded'].includes(status);
  const blocked = (d?.checklist ?? []).some((i) => i.blocking);
  const manual = (d?.checklist ?? []).filter((i) => i.manual);
  const sum = close?.summary;

  return (
    <Modal title={`Year-end close: ${year.name}`} subtitle="Nothing is posted. The close stores what each ledger carries into the next year, then locks this one." onClose={onClose} width={680}>
      {!d ? <p style={{ color: colors.textMuted }}>Loading…</p> : (
        <div style={{ display: 'grid', gap: 14, fontSize: '0.85rem' }}>
          {status && <p style={{ margin: 0, fontWeight: 800, color: status === 'locked' ? colors.successText : colors.text }}>{STATUS[status] ?? status}</p>}

          <div>
            <p style={{ margin: '0 0 6px', fontWeight: 700 }}>Checklist</p>
            {d.checklist.map((i) => (
              <div key={i.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0' }}>
                <span style={{ marginTop: 2 }}>{ICON[i.status]}</span>
                <span style={{ flex: 1 }}>
                  {i.manual && open && canPrepare && i.key in d.confirmations
                    ? <label style={{ cursor: 'pointer' }}><input type="checkbox" checked={ticked.includes(i.key)} onChange={(e) => setTicked((t) => (e.target.checked ? [...t, i.key] : t.filter((k) => k !== i.key)))} /> {i.label}</label>
                    : i.label}
                  {i.detail && !(i.manual && i.key in d.confirmations) && <span style={{ display: 'block', fontSize: '0.74rem', color: i.status === 'fail' ? colors.dangerText : colors.textMuted }}>{i.detail}</span>}
                </span>
              </div>
            ))}
          </div>

          {sum && (
            <div style={{ background: colors.tint(0.04), borderRadius: 10, padding: 12 }}>
              <p style={{ margin: '0 0 4px', fontWeight: 700 }}>What the close stores (to {sum.to})</p>
              <div>Profit for the year: <strong style={{ color: sum.profit < 0 ? colors.dangerText : colors.successText }}>{money(sum.profit)}</strong> {sum.profit < 0 ? '(a loss)' : ''}</div>
              <div>Kept from earlier years: <strong>{money(sum.earlier_years)}</strong> · Retained earnings carried forward: <strong>{money(sum.retained_earnings)}</strong></div>
              <div style={{ color: colors.textMuted }}>{sum.ledgers} ledgers carry a balance. Income and expense ledgers start the next year at zero.</div>
            </div>
          )}

          {open && canPrepare && (
            <>
              <TextInput placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} />
              <div><button type="button" style={{ ...btnPrimary, opacity: blocked ? 0.5 : 1 }} disabled={busy || blocked || ticked.length < manual.filter((i) => i.key in d.confirmations).length}
                onClick={() => act(() => booksAPI.yearClosePrepare(year.id, { confirmed: ticked, note: note || undefined }), 'Close prepared')}>Prepare the close</button>
                {blocked && <span style={{ marginLeft: 10, color: colors.dangerText, fontSize: '0.78rem' }}>Fix the red items first.</span>}</div>
            </>
          )}
          {status === 'prepared' && canPrepare && <p style={{ margin: 0, color: colors.textMuted }}>Prepared by {close.prepared_by ?? 'someone'}. {d.second_approver ? 'A second person must approve it.' : 'It can be approved by the owner.'} Prepare again to replace it.</p>}
          {status === 'prepared' && owner && <div><button type="button" style={btnPrimary} disabled={busy} onClick={() => act(() => booksAPI.yearCloseStep(close.id, 'approve'), 'Approved')}>Approve</button></div>}
          {status === 'approved' && owner && <div><button type="button" style={btnPrimary} disabled={busy} onClick={() => act(() => booksAPI.yearCloseStep(close.id, 'lock'), 'Year locked')}>Lock the year</button> <span style={{ color: colors.textMuted }}>No voucher dated in it can change after this.</span></div>}
          {status === 'locked' && owner && (
            <div style={{ display: 'flex', gap: 8 }}>
              <TextInput placeholder="Reason for reopening" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} />
              <button type="button" style={btnGhost} disabled={busy || !reason.trim()} onClick={() => act(() => booksAPI.yearCloseStep(close.id, 'reopen', { reason }), 'Year reopened')}>Reopen</button>
            </div>
          )}
          {close?.reopen_reason && status === 'reopened' && <p style={{ margin: 0, color: colors.textMuted }}>Reopened by {close.reopened_by}: {close.reopen_reason}</p>}

          {d.log.length > 0 && (
            <div>
              <p style={{ margin: '0 0 4px', fontWeight: 700 }}>History</p>
              {d.log.map((l) => <div key={l.id} style={{ fontSize: '0.76rem', color: colors.textMuted }}>{String(l.created_at).slice(0, 16)} · {l.action} · {l.user_name ?? ''}{l.note ? ` — ${l.note}` : ''}</div>)}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
