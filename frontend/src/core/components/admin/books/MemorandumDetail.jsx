import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRightLeft, Ban, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import memorandaAPI from '../../../../_shared/api/memoranda';
import useAuthStore from '../../../../_shared/store/authStore';
import { canWriteFinance } from '../../../../_shared/lib/roles';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';
import { money } from './booksFmt';
import { StateChip, PurposeChip, Direction } from './memoBits';

/** A memorandum on the voucher page: what it says, what it is about, its lines, and (for finance) edit, convert and dismiss. */
export default function MemorandumDetail({ voucherId, onChanged }) {
  const nav = useNavigate();
  const user = useAuthStore((s) => s.user);
  const finance = canWriteFinance(user);
  const [m, setM] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => memorandaAPI.get(voucherId).then(setM).catch((e) => setError(errMsg(e, 'Could not load the memorandum')));
  useEffect(() => { load(); }, [voucherId]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn, ok) => {
    setBusy(true);
    try { const r = await fn(); toast.success(ok ?? r.message); await load(); onChanged?.(); return r; }
    catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 7000 }); return null; }
    finally { setBusy(false); }
  };
  const convert = async (to) => {
    if (!window.confirm(`Convert ${m.number} into a ${to === 'contra' ? 'Contra' : 'Journal'}? The debit and credit lines will be posted to the books.`)) return;
    const r = await run(() => memorandaAPI.convert(m.id, { to }));
    if (r?.voucher_id) nav(`/admin/books/vouchers/${r.voucher_id}`);
  };
  const dismiss = () => { const reason = window.prompt(`Dismiss ${m.number}? Say why (optional):`); if (reason !== null) run(() => memorandaAPI.dismiss(m.id, reason || null)); };

  if (error) return <p role="alert" style={{ color: colors.dangerText }}>{error}</p>;
  if (!m) return <p style={{ color: colors.textMuted }}>Loading…</p>;
  const open = m.state === 'open';
  const cashOnly = m.lines.length > 0 && m.lines.every((l) => /cash|bank|till|m-pesa|mpesa/i.test(l.ledger));
  return (
    <div style={{ padding: '32px 24px', maxWidth: 900, margin: '0 auto' }}>
      <Link to="/admin/books/memoranda" style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: '0.8rem', color: colors.textMuted, textDecoration: 'none', marginBottom: 12 }}><ArrowLeft size={14} /> Memoranda</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: colors.primary }}>Memorandum <span style={{ fontFamily: 'monospace' }}>{m.number}</span></h1>
          <p style={{ margin: '8px 0 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.8rem', color: colors.textMuted }}>
            <StateChip state={m.state} /> <PurposeChip label={m.purpose_label} /> {m.date} · written by {m.created_by ?? '—'}
          </p>
        </div>
        {finance && open && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <button type="button" style={btnGhost} onClick={() => nav(`/admin/books/memoranda/${m.id}/edit`)}><Pencil size={14} /> Edit</button>
            <button type="button" style={btnPrimary} disabled={busy || !m.balanced} title={m.balanced ? undefined : 'Add equal debit and credit lines first'} onClick={() => convert('journal')}><ArrowRightLeft size={14} /> Convert to journal</button>
            {cashOnly && m.balanced && <button type="button" style={btnGhost} disabled={busy} onClick={() => convert('contra')}>As a contra</button>}
            <button type="button" style={{ ...btnGhost, color: colors.danger }} disabled={busy} onClick={dismiss}><Ban size={14} /> Dismiss</button>
          </div>
        )}
      </div>

      <div role="note" style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: '0.8rem', background: colors.tint(0.05), border: `1px solid ${colors.tint(0.1)}` }}>
        {m.state === 'converted' && m.converted ? <>Converted into <Link to={`/admin/books/vouchers/${m.converted.id}`} style={{ fontFamily: 'monospace' }}>{m.converted.number}</Link>. The books carry it from there.</>
          : m.state === 'dismissed' ? <>Dismissed{m.cancel_reason ? `: ${m.cancel_reason}` : ''}. It never touched the books.</>
            : <>This memorandum posts nothing. It does not appear in any ledger, trial balance or report until finance converts it.</>}
      </div>

      <div style={{ ...card, padding: 18, marginBottom: 14 }}>
        <p style={{ margin: '0 0 12px', whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: '0.9rem' }}>{m.narration}</p>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: '0.8rem' }}>
          <div><div style={{ fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint }}>AMOUNT</div><strong style={{ fontVariantNumeric: 'tabular-nums' }}><Direction direction={m.direction} />{Number(m.amount) ? `${m.currency ?? ''} ${money(m.amount)}` : '—'}</strong></div>
          <div><div style={{ fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint }}>ABOUT</div>{m.about ? <Link to={`/admin/books/vouchers/${m.about.id}`} style={{ fontFamily: 'monospace', color: colors.text }}>{m.about.number} <span style={{ color: colors.textFaint, fontFamily: 'inherit' }}>· {m.about.type}</span></Link> : <span style={{ color: colors.textFaint }}>—</span>}</div>
          {m.reference_no && <div><div style={{ fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint }}>REFERENCE</div>{m.reference_no}</div>}
        </div>
      </div>

      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', fontWeight: 800, fontSize: '0.82rem' }}>Debit and credit lines</div>
        {m.lines.length === 0 ? <p style={{ margin: 0, padding: '4px 14px 14px', fontSize: '0.8rem', color: colors.textMuted }}>No lines yet. {finance && open ? 'Edit it to add them; once they balance it can be converted.' : 'Finance adds them when they review it.'}</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: colors.tint(0.02) }}>{['Ledger', 'Note', 'Debit', 'Credit'].map((h, i) => <th key={h} style={{ padding: '8px 14px', fontSize: '0.65rem', color: colors.textFaint, textAlign: i > 1 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>
              {m.lines.map((l, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${colors.tint(0.05)}` }}>
                  <td style={{ padding: '8px 14px', fontSize: '0.82rem' }}>{l.ledger}</td><td style={{ padding: '8px 14px', fontSize: '0.78rem', color: colors.textMuted }}>{l.narration}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{l.side === 'D' ? money(l.amount) : ''}</td><td style={{ padding: '8px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{l.side === 'C' ? money(l.amount) : ''}</td>
                </tr>
              ))}
              <tr style={{ background: colors.tint(0.03), fontWeight: 700 }}><td style={{ padding: '8px 14px' }} colSpan={2}>Total {m.balanced ? <span style={{ color: 'var(--status-success, #059669)', fontWeight: 600 }}>· balanced ✓</span> : <span style={{ color: 'var(--status-warning, #b45309)', fontWeight: 600 }}>· not balanced</span>}</td>
                <td style={{ padding: '8px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(m.debit)}</td><td style={{ padding: '8px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(m.credit)}</td></tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
