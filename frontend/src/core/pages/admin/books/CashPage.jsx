import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../components/admin/ui/HubHeader';
import Modal from '../../../components/admin/ui/Modal';
import { Field, NumberInput, SelectInput, TextInput, TextArea, FormStack, ModalActions, FormError } from '../../../components/admin/ui/Form';
import booksAPI from '../../../../_shared/api/books';
import useAuthStore from '../../../../_shared/store/authStore';
import { canReadFinance, canWriteFinance } from '../../../../_shared/lib/roles';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';
import { money, today } from '../../../components/admin/books/booksFmt';

const th = { padding: '8px 10px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}` };
const KIND = { till: 'Till', petty: 'Petty cash', driver: 'Driver cash — cash on delivery', undeposited: 'Undeposited' };

function CountModal({ ledger, onClose, onDone }) {
  const [date, setDate] = useState(today());
  const [counted, setCounted] = useState('');
  const [reason, setReason] = useState('');
  const [post, setPost] = useState(true);
  const [book, setBook] = useState(ledger.balance);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  // what the books said on the day counted
  useEffect(() => { if (date === today()) setBook(ledger.balance); else setBook(null); }, [date, ledger.balance]);
  const diff = counted === '' || book === null ? null : Math.round((Number(counted) - book) * 100) / 100;
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const res = await booksAPI.cashCount({ ledger_id: ledger.ledger_id, date, counted: Number(counted), reason: reason || undefined, post }); toast.success(res.message, { duration: 6000 }); onDone(); }
    catch (x) { setErr(errMsg(x, 'Could not save the count')); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={`Count ${ledger.name}`} subtitle="Count what is physically there and enter it. The books say what should be there." onClose={onClose}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label="Date counted"><TextInput type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>The books say <strong>{book === null ? 'the balance on that date (shown after you save)' : money(book)}</strong>.</p>
          <Field label="Amount counted"><NumberInput required min="0" step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} /></Field>
          {diff !== null && <p role="status" style={{ margin: 0, fontWeight: 700, color: Math.abs(diff) < 0.005 ? colors.successText : colors.dangerText }}>{Math.abs(diff) < 0.005 ? 'It agrees with the books.' : `${money(Math.abs(diff))} ${diff < 0 ? 'short' : 'over'}`}</p>}
          {(diff === null || Math.abs(diff) >= 0.005) && (
            <>
              <Field label={diff === null ? 'Reason (needed if there is a difference)' : 'Reason for the difference (required)'}><TextArea rows={2} required={diff !== null && Math.abs(diff) >= 0.005} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Change given wrongly, float topped up, not yet banked…" /></Field>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.82rem', cursor: 'pointer' }}><input type="checkbox" checked={post} onChange={(e) => setPost(e.target.checked)} /> Post the difference to Cash over / short</label>
            </>
          )}
          <ModalActions onCancel={onClose} submitLabel="Save the count" busyLabel="Saving…" busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

function HandInModal({ from, tills, onClose, onDone }) {
  const [to, setTo] = useState(tills[0]?.ledger_id ?? '');
  const [amount, setAmount] = useState(String(from.balance));
  const [by, setBy] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const res = await booksAPI.cashHandIn({ from_ledger_id: from.ledger_id, to_ledger_id: Number(to), amount: Number(amount), by: by || undefined }); toast.success(res.message); onDone(); }
    catch (x) { setErr(errMsg(x, 'Could not hand it in')); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={`Hand in ${from.name}`} subtitle={`The books say ${money(from.balance)} is with the drivers.`} onClose={onClose}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label="Amount handed in"><NumberInput required min="0.01" step="0.01" max={from.balance} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Into"><SelectInput required value={to} onChange={(e) => setTo(e.target.value)}>{tills.map((t) => <option key={t.ledger_id} value={t.ledger_id}>{t.name}</option>)}</SelectInput></Field>
          <Field label="Handed in by"><TextInput value={by} onChange={(e) => setBy(e.target.value)} placeholder="Driver's name" /></Field>
          <ModalActions onCancel={onClose} submitLabel="Hand in" busyLabel="Saving…" busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

/** Day-end cash: what the books say each till holds, counting it, and the drivers' cash handed in. */
export default function CashPage() {
  const user = useAuthStore((s) => s.user);
  const canWrite = canWriteFinance(user);
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [err, setErr] = useState(null);
  const [count, setCount] = useState(null);
  const [handIn, setHandIn] = useState(null);

  const load = useCallback(() => {
    booksAPI.cash().then((d) => { setData(d); setErr(null); }).catch((e) => setErr(errMsg(e, 'Could not load the cash ledgers')));
    booksAPI.cashCounts().then((d) => setHistory(d.rows)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const tills = (data?.ledgers ?? []).filter((l) => l.cash_kind !== 'driver');
  const codTotal = (data?.cod_orders ?? []).reduce((t, o) => t + o.total, 0);

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
        {!canReadFinance(user) ? <NoAccess what="the cash ledgers" /> : (
          <>
            <HubHeader title="Cash & bank" description="Count each till against the books, hand in the cash drivers collected on delivery, and see what each bank account holds." />
            {err && <p role="alert" style={{ color: colors.dangerText }}>{err}</p>}
            {data && data.ledgers.length === 0 && !data.banks?.length && <p style={{ color: colors.textMuted }}>No cash or bank ledgers yet. Add them under Cash-in-hand and Bank Accounts in the chart of accounts.</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12, margin: '14px 0' }}>
              {(data?.ledgers ?? []).map((l) => (
                <div key={l.ledger_id} style={{ ...card, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                    <strong>{l.name}</strong><span style={{ fontSize: '0.68rem', color: colors.textFaint }}>{KIND[l.cash_kind] ?? ''}</span>
                  </div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, margin: '6px 0 2px' }}>{money(l.balance)}</div>
                  <div style={{ fontSize: '0.72rem', color: colors.textMuted }}>the books say</div>
                  <div style={{ fontSize: '0.78rem', margin: '8px 0', color: l.last_count ? (Math.abs(l.last_count.difference) < 0.005 ? colors.successText : colors.dangerText) : colors.textMuted }}>
                    {l.last_count ? `Counted ${l.last_count.date}: ${money(l.last_count.counted)}${Math.abs(l.last_count.difference) < 0.005 ? ' — agreed' : ` — ${money(Math.abs(l.last_count.difference))} ${l.last_count.difference < 0 ? 'short' : 'over'}`}` : 'Never counted'}
                    {l.days_since > 1 && <span style={{ color: colors.textFaint }}> · {l.days_since} days ago</span>}
                  </div>
                  {canWrite && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" style={{ ...btnPrimary, padding: '6px 14px' }} onClick={() => setCount(l)}>Count</button>
                      {l.cash_kind === 'driver' && l.balance > 0.005 && tills.length > 0 && <button type="button" style={{ ...btnGhost, padding: '6px 14px' }} onClick={() => setHandIn(l)}>Hand in</button>}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {data?.banks?.length > 0 && (
              <>
                <p style={{ margin: '18px 0 6px', fontWeight: 700 }}>Bank and mobile money accounts <span style={{ fontWeight: 500, color: colors.textFaint, fontSize: '0.8rem' }}>· {money(data.banks_total)} in all, as the books say</span></p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12, margin: '0 0 16px' }}>
                  {data.banks.map((b) => (
                    <div key={b.ledger_id} style={{ ...card, padding: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                        <strong>{b.name}</strong><span style={{ fontSize: '0.68rem', color: colors.textFaint }}>{b.mobile_kind ? 'Mobile money' : 'Bank'}</span>
                      </div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, margin: '6px 0 2px', color: b.balance < 0 ? colors.dangerText : undefined }}>{money(Math.abs(b.balance))}{b.balance < 0 ? ' Cr' : ''}</div>
                      <div style={{ fontSize: '0.72rem', color: colors.textMuted }}>{b.balance < 0 ? 'overdrawn, the books say' : 'the books say'}</div>
                      <div style={{ fontSize: '0.74rem', color: colors.textMuted, margin: '6px 0' }}>{[b.bank_name, b.account_number, b.branch, b.mobile_number].filter(Boolean).join(' · ') || 'No bank details on the ledger'}</div>
                      <Link to={`/admin/books?tab=reports&report=ledger&ledger=${b.ledger_id}`} style={{ fontSize: '0.78rem' }}>Statement →</Link>
                    </div>
                  ))}
                </div>
              </>
            )}

            {data?.cod_orders?.length > 0 && (
              <div style={{ ...card, padding: 14, marginBottom: 16 }}>
                <p style={{ margin: '0 0 8px', fontWeight: 700 }}>Cash on delivery still to collect: {data.cod_orders.length} order{data.cod_orders.length === 1 ? '' : 's'}, {money(codTotal)}</p>
                <div style={{ display: 'grid', gap: 4, fontSize: '0.8rem' }}>
                  {data.cod_orders.map((o) => <div key={o.id}><Link to={`/admin/books/vouchers/${o.id}`}>{o.voucher_number}</Link> · {o.customer ?? '—'} · {money(o.total)} <span style={{ color: colors.textFaint }}>({o.date})</span></div>)}
                </div>
                <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: colors.textMuted }}>When the driver has been paid, open the order and convert it to a Cash Sale — it starts on the driver-cash ledger. Then hand the cash in here.</p>
              </div>
            )}

            <div style={{ ...card, overflow: 'auto' }}>
              <p style={{ margin: 0, padding: '12px 14px 0', fontWeight: 700 }}>Counts</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead><tr><th style={th}>Date</th><th style={th}>Ledger</th><th style={{ ...th, textAlign: 'right' }}>Books</th><th style={{ ...th, textAlign: 'right' }}>Counted</th><th style={{ ...th, textAlign: 'right' }}>Difference</th><th style={th}>Reason</th><th style={th}>Posted as</th></tr></thead>
                <tbody>
                  {history.length === 0 && <tr><td style={{ ...td, color: colors.textMuted }} colSpan={7}>No counts yet.</td></tr>}
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td style={td}>{h.date}</td><td style={td}>{h.ledger}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{money(h.book_balance)}</td><td style={{ ...td, textAlign: 'right' }}>{money(h.counted)}</td>
                      <td style={{ ...td, textAlign: 'right', color: Math.abs(h.difference) < 0.005 ? colors.successText : colors.dangerText }}>{Math.abs(h.difference) < 0.005 ? '—' : `${h.difference < 0 ? '−' : '+'}${money(Math.abs(h.difference))}`}</td>
                      <td style={td}>{h.reason ?? ''}</td>
                      <td style={td}>{h.adjust_voucher_id ? <Link to={`/admin/books/vouchers/${h.adjust_voucher_id}`}>{h.adjust_voucher_number}</Link> : (Math.abs(h.difference) >= 0.005 ? <span style={{ color: colors.textFaint }}>not posted</span> : '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      {count && <CountModal ledger={count} onClose={() => setCount(null)} onDone={() => { setCount(null); load(); }} />}
      {handIn && <HandInModal from={handIn} tills={tills} onClose={() => setHandIn(null)} onDone={() => { setHandIn(null); load(); }} />}
    </AdminLayout>
  );
}
