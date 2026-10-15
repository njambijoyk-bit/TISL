import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Pause, Play, X, Search, ScanLine, Lock, LifeBuoy, KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import posAPI from '../../../../_shared/api/pos';
import { PAPER, printReceipt } from './printReceipt';
import useViewport from './useViewport';
import ItemTile, { ViewToggle } from './ItemTile';
import ThemeSwitch from '../../../../_shared/components/common/ThemeSwitch';
import useItemView from './useItemView';
import { Stepper, RemoveButton } from './BasketControls';
import CodeScanner from '../../../../core/components/admin/codes/CodeScanner';
import { OpenShiftDialog, ShiftDialog, ShiftList } from './ShiftDialogs';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';

const money = (n, cur) => `${cur?.symbol ?? ''} ${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`).slice(0, 60);
const field = { padding: '9px 11px', borderRadius: 8, border: '1.5px solid var(--line)', fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' };

/** Pay: one or several tenders, change due. Cash may be more than owed; other ways must match. */
function PayDialog({ total, methods, cur, busy, mode, customer, giftMethodId, canRound, rounding, onRound, onCancel, onPay }) {
  const cash = methods.find((m) => m.kind === 'cash') ?? methods[0];
  const later = mode !== 'cash';   // an invoice or an order: paying something now is optional
  const [rows, setRows] = useState([{ payment_method_id: cash?.id ?? '', amount: '', reference: '' }]);   // typed by the cashier: nothing is filled in for them
  const [giftCode, setGiftCode] = useState('');
  const handed = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const change = Math.round((handed - total) * 100) / 100;
  const set = (i, patch) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const left = Math.max(0, Math.round((total - handed) * 100) / 100);
  const first = rows.findIndex((r) => !r.gift);   // the cash line the quick buttons work on
  const giftTotal = rows.reduce((a, r) => a + (r.gift ? Number(r.amount) || 0 : 0), 0);
  const applyGift = async () => {   // look the voucher up, then take what it can pay of what is still owed
    try {
      const g = await posAPI.gift(giftCode, customer?.id);
      if (rows.some((r) => r.gift && r.code === g.code)) { toast.error('That voucher is already on this sale.'); return; }
      const owed = Math.max(0, Math.round((total - handed) * 100) / 100);
      setRows((rs) => [...rs, { gift: true, code: g.code, amount: String(Math.min(g.balance, owed)), balance: g.balance, payment_method_id: giftMethodId }]);
      setGiftCode('');
    } catch (e) { toast.error(errMsg(e, 'That voucher can not be used')); }
  };

  return (
    <div role="dialog" aria-label="Payment" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ ...card, padding: 20, width: 'min(480px, 100%)', display: 'grid', gap: 12, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto' }}>
        <div style={{ fontSize: '0.8rem', color: colors.textMuted }}>{mode === 'invoice' ? `Invoice for ${customer?.name}` : 'Amount due'}</div>
        <div style={{ fontSize: '2rem', fontWeight: 800 }}>{money(total, cur)}</div>
        {canRound && (rounding !== 'none' || Math.abs(total * 2 - Math.round(total * 2)) > 0.004) && (
          <div style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: colors.textMuted }}>Round the amount (optional)</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[['none', 'Exact'], ['whole', 'Nearest whole'], ['half', 'Nearest 0.50']].map(([k, label]) => (
                <button key={k} type="button" aria-pressed={rounding === k} style={{ ...btnGhost, ...(rounding === k ? { borderColor: colors.primary, color: colors.primary, fontWeight: 800 } : {}) }} onClick={() => onRound(k)}>{label}</button>
              ))}
            </div>
          </div>
        )}
        {later && <div style={{ fontSize: '0.8rem', color: colors.textMuted }}>The rest goes on their account. Take a part payment now if they are paying some.</div>}
        {rows.map((r, i) => (r.gift ? (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr) auto', gap: 8, alignItems: 'center', padding: 8, borderRadius: 8, background: colors.tint(0.07) }}>
            <span style={{ fontSize: '0.85rem' }}><strong>Gift voucher {r.code}</strong>{r.balance != null && <span style={{ color: colors.textMuted }}> · balance {money(r.balance, cur)}</span>}</span>
            <input style={field} inputMode="decimal" value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} aria-label="Amount taken from the voucher" />
            <button type="button" style={btnGhost} aria-label="Remove gift voucher" onClick={() => setRows(rows.filter((_, k) => k !== i))}><X size={14} /></button>
          </div>
        ) : (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr) auto', gap: 8, alignItems: 'start' }}>
            <label style={{ display: 'grid', gap: 3, fontSize: '0.72rem', fontWeight: 700, color: colors.textMuted }}>Paid by
              <select style={field} value={r.payment_method_id} onChange={(e) => set(i, { payment_method_id: Number(e.target.value) })} aria-label="Way of paying">
                {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 3, fontSize: '0.72rem', fontWeight: 700, color: colors.textMuted }}>{methods.find((m) => m.id === r.payment_method_id)?.kind === 'cash' ? 'Cash tendered' : 'Amount paid'}
              <input style={field} inputMode="decimal" autoFocus={i === 0} value={r.amount} placeholder="Type the amount" onChange={(e) => set(i, { amount: e.target.value })} aria-label={methods.find((m) => m.id === r.payment_method_id)?.kind === 'cash' ? 'Cash tendered' : 'Amount paid'} />
            </label>
            {rows.length > 1 ? <button type="button" style={btnGhost} aria-label="Remove" onClick={() => setRows(rows.filter((_, k) => k !== i))}><X size={14} /></button> : <span />}
            {methods.find((m) => m.id === r.payment_method_id)?.kind !== 'cash' && (
              <input style={{ ...field, gridColumn: '1 / -1' }} placeholder="Reference (transaction code)" value={r.reference} onChange={(e) => set(i, { reference: e.target.value })} aria-label="Reference" />
            )}
          </div>
        )))}
        {giftMethodId && !later && customer && (
          <div style={{ display: 'grid', gap: 6, padding: 10, borderRadius: 8, border: '1px dashed var(--line)' }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: colors.textMuted }}>Gift voucher for {customer.name}</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input style={field} value={giftCode} placeholder="Type the voucher code" aria-label="Gift voucher code" onChange={(e) => setGiftCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && giftCode.trim() && applyGift()} />
              <button type="button" style={btnGhost} disabled={!giftCode.trim()} onClick={applyGift}>Apply</button>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={{ ...btnGhost, display: later ? 'none' : undefined }} onClick={() => left > 0 && setRows([...rows, { payment_method_id: methods.find((m) => m.id !== rows.find((x) => !x.gift)?.payment_method_id)?.id ?? cash?.id, amount: String(left), reference: '' }])}>Split payment</button>
          <button type="button" style={{ ...btnGhost, display: later ? 'none' : undefined }} onClick={() => first >= 0 && set(first, { amount: String(Math.max(0, Math.round((total - giftTotal) * 100) / 100)) })}>Exact amount</button>
          {[50, 100, 500, 1000].map((n) => <button key={n} type="button" style={btnGhost} onClick={() => first >= 0 && set(first, { amount: String((Number(rows[first].amount) || 0) + n) })}>+{n}</button>)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
          <span>{later ? 'Left on account' : (change >= 0 ? 'Change due' : 'Still to pay')}</span>
          <span style={{ color: later || change >= 0 ? colors.primary : colors.danger }}>{money(later ? Math.max(0, total - handed) : Math.abs(change), cur)}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={btnGhost} disabled={busy} onClick={onCancel}>Back</button>
          <button type="button" style={btnPrimary} disabled={busy || (later ? handed > total + 0.004 : change < 0)} onClick={() => onPay(rows.map((r) => (r.gift ? { payment_method_id: giftMethodId, amount: Number(r.amount) || 0, gift_voucher_code: r.code.trim() } : { payment_method_id: r.payment_method_id, amount: Number(r.amount) || 0, reference: r.reference })))}>{busy ? 'Posting…' : ({ cash: 'Complete sale', invoice: 'Post invoice', order: 'Place order' })[mode]}</button>
        </div>
      </div>
    </div>
  );
}


/** A supervisor approves: name and their own PIN. The approval is for one thing, lasts five minutes and is used once. */
function ApproveDialog({ purpose, stationId, why, me, selfOk, onDone, onCancel }) {
  const [mode, setMode] = useState(selfOk ? 'self' : 'other');   // a supervisor at the till approves with their own PIN; anyone can ask another supervisor
  const [list, setList] = useState(null);
  const [who, setWho] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (mode !== 'other') return;
    posAPI.supervisors(stationId).then((r) => { setList(r.supervisors); setWho(r.supervisors[0]?.id ?? ''); }).catch((e) => { toast.error(errMsg(e, 'Could not load supervisors')); onCancel(); });
  }, [mode, stationId, onCancel]);
  const go = async () => {
    setBusy(true);
    try { const r = await posAPI.approve({ supervisor_id: mode === 'self' ? me.id : Number(who), pin, purpose, station_id: stationId }); onDone(r); } catch (e) { toast.error(errMsg(e, 'Not approved')); setPin(''); } finally { setBusy(false); }
  };
  const pinBox = (placeholder) => <input style={field} type="password" inputMode="numeric" autoComplete="off" autoFocus maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && pin.length === 6 && go()} placeholder={placeholder} aria-label="PIN" />;
  const ready = mode === 'self' ? pin.length === 6 : pin.length === 6 && !!who;

  return (
    <div role="dialog" aria-label="Approval" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ ...card, padding: 20, width: 'min(380px, 100%)', display: 'grid', gap: 10, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto' }}>
        <strong>{mode === 'self' ? 'Enter your PIN' : 'Supervisor approval'}</strong>
        <div style={{ fontSize: '0.82rem', color: colors.textMuted }}>{why}</div>
        {mode === 'self' && (
          <>
            <div style={{ fontSize: '0.85rem' }}>Approving as <strong>{me?.name}</strong></div>
            {pinBox('Your 6-digit PIN')}
            <button type="button" style={{ ...btnGhost, justifySelf: 'start', padding: '4px 10px', fontSize: '0.76rem' }} onClick={() => { setMode('other'); setPin(''); }}>Ask another supervisor instead</button>
          </>
        )}
        {mode === 'other' && list && list.length === 0 && <p style={{ margin: 0, color: colors.danger, fontSize: '0.85rem' }}>No other supervisor with a PIN is set up for this branch. A supervisor sets theirs from the till (My PIN).</p>}
        {mode === 'other' && list && list.length > 0 && (
          <>
            <select style={field} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Supervisor">{list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            {pinBox('Their 6-digit PIN')}
            {selfOk && <button type="button" style={{ ...btnGhost, justifySelf: 'start', padding: '4px 10px', fontSize: '0.76rem' }} onClick={() => { setMode('self'); setPin(''); }}>Use my own PIN instead</button>}
          </>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={btnGhost} onClick={onCancel}>Cancel</button>
          <button type="button" style={{ ...btnPrimary, opacity: busy || !ready ? 0.5 : 1, cursor: busy || !ready ? 'not-allowed' : 'pointer' }} disabled={busy || !ready} onClick={go}>{busy ? 'Checking...' : 'Approve'}</button>
        </div>
      </div>
    </div>
  );
}

/** A supervisor sets their own PIN. */
function PinDialog({ onClose }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const save = async () => {
    try { const r = await posAPI.setPin(a); toast.success(r.message); onClose(true); } catch (e) { toast.error(errMsg(e, 'Could not save the PIN')); }
  };

  return (
    <div role="dialog" aria-label="My PIN" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ ...card, padding: 20, width: 'min(340px, 100%)', display: 'grid', gap: 10, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto' }}>
        <strong>My supervisor PIN</strong>
        <input style={field} type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, ''))} placeholder="New 6-digit PIN" aria-label="New PIN" />
        <input style={field} type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, ''))} placeholder="Type it again" aria-label="Repeat PIN" />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={btnGhost} onClick={() => onClose(false)}>Cancel</button>
          <button type="button" style={btnPrimary} disabled={a.length !== 6 || a !== b} onClick={save}>Save PIN</button>
        </div>
      </div>
    </div>
  );
}

/** Take a whole sale or invoice back. A supervisor's PIN completes it; the sale's points, promo code and gift voucher are undone with it. */
function ReturnPanel({ ctx, cur, onDone }) {
  const [number, setNumber] = useState('');
  const [doc, setDoc] = useState(null);
  const [reason, setReason] = useState('');
  const [ledger, setLedger] = useState('');
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);

  const find = async () => {
    try {
      const r = await posAPI.findReturn(number); setDoc(r); setLedger(r.refund?.default_id ?? r.refund?.ledgers?.[0]?.id ?? '');
    } catch (e) { setDoc(null); toast.error(errMsg(e, 'Not found')); }
  };
  const canTakeBack = !busy && !!doc && !doc.blocked && reason.trim().length >= 3;   // nothing to approve until there is a reason for it
  const submit = async (approval) => {
    setBusy(true);
    try {
      const r = await posAPI.makeReturn({ station_id: ctx.station.id, voucher_id: doc.source.id, reason, refund_ledger_id: ledger || undefined, approval_token: approval.token });
      onDone(r);
    } catch (e) { toast.error(errMsg(e, 'The return did not post'), { duration: 9000 }); } finally { setBusy(false); setAsk(false); }
  };
  const giftPaid = doc?.source?.gift_paid || 0;

  return (
    <section style={{ ...card, padding: 16, display: 'grid', gap: 10, maxWidth: 720 }}>
      <strong>Return a sale</strong>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={field} value={number} onChange={(e) => setNumber(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && find()} placeholder="Receipt or invoice number (type it or scan the receipt)" aria-label="Receipt number" />
        <button type="button" style={btnPrimary} onClick={find} disabled={!number.trim()}>Find</button>
      </div>
      {doc && (
        <>
          <div style={{ fontSize: '0.85rem', color: colors.textMuted }}>{doc.source.type} {doc.source.voucher_number} · {doc.source.date}{doc.source.party ? ` · ${doc.source.party}` : ''}{doc.source.customer ? ` · ${doc.source.customer}` : ''} · {money(doc.source.total, cur)}</div>
          {doc.blocked ? (
            <p role="alert" style={{ margin: 0, padding: 10, borderRadius: 8, background: 'rgba(239,68,68,0.08)', fontSize: '0.85rem' }}>{doc.blocked}</p>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>Everything on this document comes back together.{doc.source.customer ? ' Their loyalty points, promo code and gift voucher on this sale are taken back too.' : ''}</p>
              {doc.lines.map((l) => (
                <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', paddingBottom: 6, borderBottom: '1px solid var(--line)' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{l.description}</div>
                  <div style={{ fontSize: '0.8rem', color: colors.textMuted }}>{l.is_charge ? money(l.available_amount, cur) : `${l.available_quantity} x`}</div>
                </div>
              ))}
              <input style={{ ...field, ...(reason.trim().length < 3 ? { borderColor: colors.warning } : {}) }} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Why is it coming back? (required)" aria-label="Reason" />
              {doc.paid_at_once && doc.refund?.ledgers?.length > 0 && (
                <label style={{ fontSize: '0.8rem', color: colors.textMuted, display: 'grid', gap: 4 }}>Money goes back from
                  <select style={field} value={ledger} onChange={(e) => setLedger(Number(e.target.value))}>{doc.refund.ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
                </label>
              )}
              {giftPaid > 0 && <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>{money(giftPaid, cur)} was paid with a gift voucher: it goes back on the voucher and is not paid out in cash.</p>}
              {!doc.paid_at_once && <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>This invoice is on account: the credit note lowers what the customer owes. No cash is paid out.</p>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 800 }}>Total {money(doc.source.total, cur)}</span>
                <button type="button" style={{ ...btnPrimary, opacity: canTakeBack ? 1 : 0.45, cursor: canTakeBack ? 'pointer' : 'not-allowed', boxShadow: canTakeBack ? btnPrimary.boxShadow : 'none' }} disabled={!canTakeBack} onClick={() => setAsk(true)}>{ctx.can.supervise && ctx.can.has_pin ? 'Take back: enter my PIN' : 'Take back: needs supervisor'}</button>
              </div>
              {!canTakeBack && <p role="status" style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>Write why it is coming back to continue.</p>}
            </>
          )}
        </>
      )}
      {ask && <ApproveDialog purpose="return" stationId={ctx.station.id} me={ctx.me} selfOk={!!(ctx.can.supervise && ctx.can.has_pin)} why="Every return needs a PIN." onCancel={() => setAsk(false)} onDone={submit} />}
    </section>
  );
}

/** A small icon button: its name shows when the pointer rests on it or it has the keyboard; a badge (a count) is always visible. */
function IconBtn({ icon, label, badge, danger, disabled, onClick }) {
  const [hover, setHover] = useState(false);
  const lit = badge > 0 && danger;

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} onFocus={() => setHover(true)} onBlur={() => setHover(false)}
        style={{ ...(lit ? { ...btnPrimary, background: '#dc2626' } : btnGhost), width: 38, height: 38, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
        {icon}
      </button>
      {badge > 0 && <span aria-hidden="true" style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, padding: '0 5px', boxSizing: 'border-box', borderRadius: 9, background: '#dc2626', color: '#fff', fontSize: '0.68rem', fontWeight: 800, display: 'grid', placeItems: 'center', border: '2px solid var(--bg-secondary, #f9fafb)' }}>{badge}</span>}
      {hover && <span role="tooltip" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50, whiteSpace: 'nowrap', padding: '4px 8px', borderRadius: 6, background: '#111827', color: '#fff', fontSize: '0.74rem', fontWeight: 600, pointerEvents: 'none' }}>{label}</span>}
    </span>
  );
}

/** The till fills the whole page: no admin menu around it. The footer holds what is rarely needed. */
function Shell({ children, footer }) {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-secondary, #f9fafb)', padding: 'clamp(8px, 2vw, 16px)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Link to="/admin" style={{ fontSize: '0.78rem', color: colors.textMuted, textDecoration: 'none' }}>← Back to admin</Link>
        <span style={{ fontSize: '0.74rem', color: colors.textMuted }}>Ctrl + B shows the menu</span>
      </div>
      <div style={{ flex: 1 }}>{children}</div>
      {footer && <footer style={{ marginTop: 18, paddingTop: 10, borderTop: '1px solid var(--line)', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>{footer}</footer>}
    </main>
  );
}

/** Point of sale: search or scan, a basket, hold and recall, pay and post a cash sale. */
export default function PosTill() {
  const [ctx, setCtx] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [cart, setCart] = useState([]);   // { variant_id, name, quantity, discount_pct, price }
  const [priced, setPriced] = useState(null);
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [holds, setHolds] = useState(null);
  const [mode, setMode] = useState('cash');
  const [approval, setApproval] = useState(null);   // a supervisor's approval for a discount: { token, supervisor }
  const [ask, setAsk] = useState(null);             // { purpose, why, then }
  const [pinOpen, setPinOpen] = useState(false);
  const [returned, setReturned] = useState(null);
  const [paper, setPaper] = useState('');
  const [auto, setAuto] = useState(() => { try { return localStorage.getItem('pos.autoprint') === '1'; } catch { return false; } });
  const [mine, setMine] = useState(null);
  const { narrow, tiny } = useViewport();
  const [view, setView] = useItemView('pos.view');
  const [locked, setLocked] = useState(true);   // the touch-to-start screen
  const [helpList, setHelpList] = useState(null);   // open requests from self-checkout screens
  const [helpDlg, setHelpDlg] = useState(false);
  const [heldCount, setHeldCount] = useState({ total: 0, customers: 0 });   // held sales waiting at this branch, and those from customers
  const lastCustomers = useRef(0);
  const [shiftUi, setShiftUi] = useState(null);   // 'open' | 'list' | { id }
  const [customer, setCustomer] = useState(null);
  const [phone, setPhone] = useState('');   // the only way to find a customer: their phone number, which shows one name or none
  const [phoneMsg, setPhoneMsg] = useState(null);
  const [note, setNote] = useState('');   // the cashier's words on the sale: the customer sees them
  const [rounding, setRounding] = useState('none');   // none | whole | half: optional, chosen at the payment
  const [walkin, setWalkin] = useState('');
  const [promo, setPromo] = useState('');   // an optional name for a cash sale to a walk-in customer
  const key = useRef(newKey());
  const search = useRef(null);

  const loadCtx = useCallback((stationId) => posAPI.context(stationId).then(setCtx).catch((e) => setError(errMsg(e, 'Could not open the point of sale'))), []);
  useEffect(() => { loadCtx(); }, [loadCtx]);
  useEffect(() => {   // customers who pressed Call for help at a self-checkout screen
    if (!ctx?.station) return undefined;
    let live = true;
    const load = () => {
      posAPI.helpRequests().then((r) => live && setHelpList(r.requests)).catch(() => {});
      posAPI.holdCounts().then((c) => {
        if (!live) return;
        if (c.customers > lastCustomers.current) toast(`${c.customers - lastCustomers.current} new basket${c.customers - lastCustomers.current === 1 ? '' : 's'} from a customer, waiting under Recall.`, { icon: '🛒', duration: 6000 });
        lastCustomers.current = c.customers;
        setHeldCount(c);
      }).catch(() => {});
    };
    load();
    const t = setInterval(load, 15000);
    return () => { live = false; clearInterval(t); };
  }, [ctx?.station?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [tick, setTick] = useState(0);   // bumped to fetch the stock again
  useEffect(() => {   // search as they type; also again after every sale and every half minute (other tills sell too)
    const t = setTimeout(() => { if (ctx?.ready !== false) posAPI.catalogue(q, ctx?.station?.id).then((r) => setFound(r.items)).catch(() => {}); }, tick === 0 ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, ctx, tick]);
  useEffect(() => {
    if (locked) return undefined;
    const t = setInterval(() => { if (!document.hidden) setTick((n) => n + 1); }, 30000);
    return () => clearInterval(t);
  }, [locked]);

  const body = useCallback(() => ({ station_id: ctx?.station?.id, mode, approval_token: approval?.token, customer_id: customer?.id, promo_code: customer && promo.trim() ? promo.trim() : undefined, customer_name: mode === 'cash' && !customer && walkin.trim() ? walkin.trim() : undefined, narration: note.trim() || undefined, rounding: rounding !== 'none' ? rounding : undefined, items: cart.map((c) => ({ variant_id: c.variant_id, quantity: c.quantity, discount_pct: c.discount_pct || 0 })) }), [ctx, cart, mode, customer, approval, walkin, promo, note, rounding]);
  useEffect(() => {   // the books price the basket: the total shown is the one that will post
    if (!cart.length || !ctx?.station) { setPriced(null); return undefined; }
    let live = true;
    const t = setTimeout(() => { posAPI.price(body()).then((r) => live && setPriced(r)).catch((e) => { if (!live) return; if (e?.response?.data?.approval === 'discount') { setApproval(null); setAsk({ purpose: 'discount', why: e.response.data.message, then: (a) => setApproval(a) }); } else toast.error(errMsg(e, 'Could not price the basket')); }); }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [cart, ctx, body]);


  const add = (it) => {
    if (!(it.price > 0)) { toast.error(`${it.name} has NO PRICE and can not be sold. Ask a manager to set its price.`, { duration: 9000 }); return; }
    if (it.stock != null && it.stock <= 0) { toast.error(`${it.name} is out of stock.`); return; }
    const inCart = cart.find((x) => x.variant_id === it.variant_id)?.quantity ?? 0;
    if (it.stock != null && inCart + 1 > it.stock) { toast.error(`Only ${it.stock} of ${it.name} in stock.`); return; }
    setCart((c) => (c.some((x) => x.variant_id === it.variant_id) ? c.map((x) => (x.variant_id === it.variant_id ? { ...x, quantity: x.quantity + 1 } : x)) : [...c, { variant_id: it.variant_id, name: it.name, quantity: 1, discount_pct: 0, price: it.price, stock: it.stock }]));
  };
  const change = (id, patch) => setCart((c) => c.map((x) => {
    if (x.variant_id !== id) return x;
    const next = { ...x, ...patch };
    if (x.stock != null && next.quantity > x.stock) { toast.error(`Only ${x.stock} of ${x.name} in stock.`); next.quantity = x.stock; }
    return next;
  }).filter((x) => x.quantity > 0));
  const remove = (c, i) => {   // taking an item out is recorded; without the right to void it needs a supervisor
    const note = (token) => posAPI.logVoid({ station_id: ctx.station.id, what: 'line', item: c.name, quantity: c.quantity, amount: priced?.lines?.[i]?.amount ?? 0, approval_token: token }).then(() => change(c.variant_id, { quantity: 0 })).catch((e) => toast.error(errMsg(e, 'Could not remove')));
    if (ctx.can.void) note(undefined); else setAsk({ purpose: 'void', why: `Removing ${c.name} from the sale needs a supervisor.`, then: (a) => note(a.token) });
  };

  const findByPhone = async () => {
    try {
      const r = await posAPI.customerByPhone(phone);
      if (r.customer) { setCustomer(r.customer); setWalkin(''); setPhoneMsg(null); } else setPhoneMsg('No account with that number.');
    } catch (e) { setPhoneMsg(errMsg(e, 'Could not look that up.')); }
  };
  const scanCode = async (code) => {   // a handheld scanner or the camera: the code goes straight into the sale
    try {
      const r = await posAPI.scan(code, ctx.station.id);
      if (r.item) add(r.item); else toast.error(`No item with the barcode ${code}.`);
    } catch (err) { toast.error(errMsg(err, 'Scan failed')); }
  };
  const onEnter = async (e) => {
    if (e.key !== 'Enter' || !q.trim()) return;
    try {
      const r = await posAPI.scan(q.trim(), ctx.station.id);
      if (r.item) { add(r.item); setQ(''); } else if (found.length === 1) { add(found[0]); setQ(''); } else toast('No item with that code - pick from the list.');
    } catch (err) { toast.error(errMsg(err, 'Scan failed')); }
  };

  const pay = async (tenders) => {
    setBusy(true);
    try {
      const sold = cart.map((c) => [c.variant_id, c.quantity]);
      const r = await posAPI.sell({ ...body(), key: key.current, tenders: tenders.filter((t) => t.amount > 0) });
      if (r.mode !== 'order') {   // the cards drop by what was sold at once; the fresh numbers follow
        setFound((f) => f.map((it) => { const q = sold.find(([id]) => id === it.variant_id)?.[1]; return q && it.stock != null ? { ...it, stock: Math.max(0, it.stock - q) } : it; }).filter((it) => it.stock == null || it.stock > 0));
        setTick((n) => n + 1);
      }
      setDone(r); if (auto) print(r.id); setCart([]); setPaying(false); setCustomer(null); setPhone(''); setPhoneMsg(null); setWalkin(''); setPromo(''); setNote(''); setRounding('none'); setApproval(null); key.current = newKey(); toast.success(`${r.type ?? 'Sale'} ${r.number} posted.`);
    } catch (e) { if (e?.response?.data?.approval === 'discount') { setPaying(false); setApproval(null); } toast.error(errMsg(e, 'The sale did not post'), { duration: 9000 }); } finally { setBusy(false); }
  };

  const print = async (id) => {
    try { printReceipt(await posAPI.receipt(id, paper || ctx.station.paper)); } catch (e) { toast.error(errMsg(e, 'Could not print'), { duration: 8000 }); }
  };
  const setAutoPrint = (v) => { setAuto(v); try { localStorage.setItem('pos.autoprint', v ? '1' : '0'); } catch { /* the choice is just not remembered */ } };
  const openMine = async () => { try { setMine((await posAPI.mySales()).sales); } catch (e) { toast.error(errMsg(e, 'Could not load your sales')); } };

  const hold = async () => {
    try { const label = window.prompt('Name this held sale (optional)') ?? ''; await posAPI.hold({ ...body(), label, customer_name: customer?.name ?? (walkin.trim() || undefined), items: cart.map((c) => ({ variant_id: c.variant_id, quantity: c.quantity, name: c.name, discount_pct: c.discount_pct || 0 })) }); setCart([]); toast.success('Sale held.'); } catch (e) { toast.error(errMsg(e, 'Could not hold')); }
  };
  const openHolds = async () => { try { setHolds((await posAPI.holds()).holds); posAPI.holdCounts().then((c) => { lastCustomers.current = c.customers; setHeldCount(c); }).catch(() => {}); } catch (e) { toast.error(errMsg(e, 'Could not load held sales')); } };
  const recall = async (id) => {
    try {
      const h = await posAPI.recall(id);
      if (h.mode && ctx.can[h.mode === 'cash' ? 'sell' : h.mode]) setMode(h.mode);
      if (h.customer_id) setCustomer({ id: h.customer_id, name: h.customer_name ?? `Customer ${h.customer_id}` });
      else if (h.customer_name) setWalkin(h.customer_name);
      if (h.promo_code) setPromo(h.promo_code);
      setCart((c) => [...c, ...h.items.map((i) => ({ variant_id: i.variant_id, name: i.name, quantity: i.quantity, discount_pct: i.discount_pct || 0, price: null }))]);
      setHolds(null);
      posAPI.holdCounts().then((c) => { lastCustomers.current = c.customers; setHeldCount(c); }).catch(() => {});
    } catch (e) { toast.error(errMsg(e, 'Could not recall')); openHolds(); }
  };

  if (!ctx) return <Shell><div style={{ padding: 32, color: colors.textFaint }}>{error ?? 'Loading…'}</div></Shell>;
  if (ctx.ready === false) return <Shell><p role="alert" style={{ ...card, padding: 16 }}>{ctx.message ?? 'The point of sale is not set up yet.'}</p></Shell>;
  if (!ctx.station) return <Shell><p role="alert" style={{ ...card, padding: 16 }}>You have no station to sell from. Ask a manager to add a station at your branch (POS stations) and give you one.</p></Shell>;

  const cur = ctx.currency;
  const totalDiscount = (priced?.lines ?? []).reduce((a, l) => a + (Number(l.discount_amount) || 0), 0);
  const anyDiscount = totalDiscount > 0.004;
  const unpriced = (priced?.lines ?? []).filter((l) => l.item_type !== 'charge' && !(l.rate > 0));   // a line the books priced at nothing can not be sold
  const needShift = ctx.shift_ready && ctx.shift_required && !ctx.shift;
  const total = priced?.total ?? 0;
  const lineOf = (i) => priced?.lines?.[i];

  const helpCount = helpList?.length ?? 0;
  if (locked) {
    return (
      <main onClick={() => setLocked(false)} role="button" tabIndex={0} onKeyDown={() => setLocked(false)} aria-label="Touch to start" style={{ minHeight: '100vh', cursor: 'pointer', background: 'linear-gradient(160deg, var(--color-primary-500), var(--color-primary-600))', color: 'var(--text-inverse, #fff)', display: 'grid', placeContent: 'center', gap: 22, textAlign: 'center', padding: 40 }}>
        <ScanLine size={96} aria-hidden="true" style={{ justifySelf: 'center' }} />
        <span style={{ fontSize: 'clamp(2.4rem, 7vw, 4.5rem)', fontWeight: 900 }}>{ctx.business}</span>
        <span style={{ fontSize: 'clamp(1.5rem, 4vw, 2.4rem)', opacity: 0.9 }}>Point of sale - touch to start</span>
        <span style={{ opacity: 0.7 }}>{ctx.station.name} · {ctx.station.location}</span>
        {heldCount.total > 0 && <span style={{ background: heldCount.customers > 0 ? '#dc2626' : 'rgba(255,255,255,0.22)', borderRadius: 999, padding: '8px 18px', justifySelf: 'center', fontWeight: 800 }}>{heldCount.total} held sale{heldCount.total === 1 ? '' : 's'} waiting{heldCount.customers > 0 ? `, ${heldCount.customers} from customers` : ''}</span>}
        {helpCount > 0 && <span style={{ background: '#dc2626', borderRadius: 999, padding: '8px 18px', justifySelf: 'center', fontWeight: 800 }}>{helpCount} customer{helpCount === 1 ? '' : 's'} asking for help</span>}
      </main>
    );
  }

  const tabs = (
    <div style={{ display: "flex", gap: 6 }} role="tablist" aria-label="Kind of document">
      {[['cash', 'Cash sale', ctx.can.sell], ['invoice', 'Invoice', ctx.can.invoice], ['order', 'Sales order', ctx.can.order], ['return', 'Return', ctx.can.return]].filter((m) => m[2]).map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} style={{ ...(mode === k ? btnPrimary : btnGhost), flex: 1 }}>{l}</button>
      ))}
    </div>
  );

  const extraDialogs = (
    <>
      {ask && <ApproveDialog purpose={ask.purpose} stationId={ctx.station.id} me={ctx.me} selfOk={!!(ctx.can.supervise && ctx.can.has_pin)} why={ask.why} onCancel={() => setAsk(null)} onDone={(a) => { const f = ask.then; setAsk(null); f(a); }} />}
      {shiftUi === 'open' && <OpenShiftDialog stationId={ctx.station.id} stationName={ctx.station.name} onCancel={() => setShiftUi(null)} onDone={() => { setShiftUi(null); loadCtx(ctx.station.id); }} />}
      {shiftUi === 'list' && <ShiftList onClose={() => setShiftUi(null)} onPick={(id) => setShiftUi({ id })} />}
      {shiftUi?.id && <ShiftDialog shiftId={shiftUi.id} paper={ctx.station.paper} onClose={() => setShiftUi(null)} onClosed={() => loadCtx(ctx.station.id)} />}
      {helpDlg && (
        <div role="dialog" aria-label="Help requests" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div style={{ ...card, padding: 18, width: 'min(420px, 100%)', display: 'grid', gap: 8, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto' }}>
            <strong>Customers asking for help</strong>
            {helpCount === 0 && <p style={{ color: colors.textMuted, margin: 0 }}>Nobody is waiting.</p>}
            {(helpList ?? []).map((h) => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>{h.station} <span style={{ color: colors.textMuted, fontSize: '0.75rem' }}>· {h.minutes < 1 ? 'just now' : `${h.minutes} min ago`}{h.tries > 1 ? ` · asked ${h.tries} times` : ''}</span>
                  {h.note && <div style={{ marginTop: 4, padding: '6px 8px', borderRadius: 6, background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: '0.8rem' }}>{h.note}</div>}</span>
                <button type="button" style={btnPrimary} onClick={async () => {
                  try { await posAPI.helpDone(h.id); toast.success('Cleared.'); } catch (e) { toast.error(errMsg(e, 'Could not clear that request'), { duration: 8000 }); }
                  posAPI.helpRequests().then((r) => setHelpList(r.requests)).catch(() => {});
                }}>Done</button>
              </div>
            ))}
            {helpCount > 1 && <button type="button" style={btnGhost} onClick={async () => {
              try { const r = await posAPI.helpClear(); toast.success(`${r.cleared} cleared.`); } catch (e) { toast.error(errMsg(e, 'Could not clear')); }
              posAPI.helpRequests().then((r) => setHelpList(r.requests)).catch(() => {});
            }}>Clear all</button>}
            <p style={{ margin: 0, fontSize: '0.75rem', color: colors.textMuted }}>Go to the screen. A supervisor can clear a stuck basket there with their email and PIN.</p>
            <button type="button" style={btnGhost} onClick={() => setHelpDlg(false)}>Close</button>
          </div>
        </div>
      )}
      {mine && (
        <div role="dialog" aria-label="My sales today" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div style={{ ...card, padding: 0, width: 'min(460px, 100%)', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', background: 'var(--surface-card, #fff)', borderBottom: '1px solid var(--line)' }}>
              <strong>My sales today</strong>
              <button type="button" style={{ ...btnGhost, padding: '4px 8px' }} aria-label="Close" onClick={() => setMine(null)}><X size={16} /></button>
            </div>
            <div style={{ display: 'grid', gap: 8, padding: 18 }}>
              {mine.length === 0 && <p style={{ color: colors.textMuted, margin: 0 }}>Nothing yet today.</p>}
              {mine.map((m) => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span>{m.number} <span style={{ color: colors.textMuted, fontSize: '0.75rem' }}>· {money(m.total, cur)}{m.status !== 'posted' ? ` · ${m.status}` : ''}</span></span>
                  {ctx.can.reprint ? <button type="button" style={btnGhost} onClick={() => print(m.id)}>Reprint (copy)</button> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {pinOpen && <PinDialog onClose={(ok) => { setPinOpen(false); if (ok) loadCtx(ctx.station.id); }} />}
      {returned && (
        <div role="dialog" aria-label="Return done" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div style={{ ...card, padding: 22, width: 'min(380px, 100%)', display: 'grid', gap: 8, textAlign: 'center', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto' }}>
            <strong style={{ fontSize: '1.1rem' }}>{returned.type ?? 'Credit note'} {returned.number}</strong>
            <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{money(returned.total, cur)}</div>
            <div style={{ fontSize: '0.85rem', color: colors.textMuted }}>Against {returned.against} · approved by {returned.approved_by}</div>
            <button type="button" style={btnPrimary} onClick={() => { setReturned(null); setMode('cash'); }}>Done</button>
          </div>
        </div>
      )}
    </>
  );

  const toolbar = (
    <div style={{ marginBottom: 10, display: 'flex', gap: 8, justifyContent: narrow ? 'flex-start' : 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
      {ctx.shift_ready && !ctx.shift && <button type="button" style={btnPrimary} onClick={() => setShiftUi('open')}>Open shift</button>}
      <ThemeSwitch />
      <IconBtn icon={<LifeBuoy size={17} />} label="Help requests" badge={helpCount} danger onClick={() => setHelpDlg(true)} />
      <IconBtn icon={<Lock size={17} />} label={cart.length ? 'Finish or hold the sale first' : 'Lock the screen'} disabled={cart.length > 0} onClick={() => setLocked(true)} />
      {ctx.can.supervise && <IconBtn icon={<KeyRound size={17} />} label={ctx.can.has_pin ? 'Change my PIN' : 'Set my PIN'} onClick={() => setPinOpen(true)} />}
    </div>
  );
  const footer = (
    <>
      {ctx.shift_ready && ctx.shift && <button type="button" style={btnGhost} onClick={() => setShiftUi({ id: ctx.shift.id })}>Shift open since {String(ctx.shift.opened_at).slice(11, 16)} - report / close</button>}
      {ctx.shift_ready && ctx.can.supervise && <button type="button" style={btnGhost} onClick={() => setShiftUi('list')}>All shifts</button>}
      <button type="button" style={btnGhost} onClick={openMine}>My sales today</button>
    </>
  );

  if (mode === 'return') {
    return (
      <Shell footer={footer}>
        {toolbar}
        <div style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
          <div style={{ ...card, padding: 10 }}>{tabs}</div>
          <ReturnPanel ctx={ctx} cur={cur} onDone={(r) => { setReturned(r); setTick((n) => n + 1); }} />
        </div>
        {extraDialogs}
      </Shell>
    );
  }

  return (
    <Shell footer={footer}>
      {toolbar}
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0, 1fr)' : 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 16, alignItems: 'start', paddingBottom: narrow && cart.length ? 84 : 0 }}>
        <section style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
          <CodeScanner onScan={scanCode} placeholder="Scan an item's barcode: scanner or camera" autoFocus />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search size={16} />
            <input ref={search} style={field} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onEnter} placeholder="Scan a barcode or search by name or code" aria-label="Search items" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><ViewToggle view={view} onChange={setView} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: view === 'list' ? '1fr' : `repeat(auto-fill, minmax(${tiny ? 130 : 160}px, 1fr))`, gap: 8, maxHeight: narrow ? '48vh' : '68vh', overflowY: 'auto', alignContent: 'start' }}>
            {found.map((it) => (
              <ItemTile key={it.variant_id} item={it} view={view} onAdd={add} price={money(it.price, cur)} noPrice={!(it.price > 0)}
                stockText={it.stock != null ? `${it.stock} in stock` : null} stockLow={it.stock != null && it.stock <= 3} />
            ))}
            {found.length === 0 && <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>Nothing found.</p>}
          </div>
        </section>

        <section style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong>Sale</strong>
            <label style={{ fontSize: '0.78rem', color: colors.textMuted, display: 'flex', gap: 6, alignItems: 'center' }}>
              Station
              <select value={ctx.station.id} onChange={(e) => { setCart([]); loadCtx(Number(e.target.value)); }} style={{ ...field, width: 'auto', padding: '4px 8px' }} aria-label="Station">
                {ctx.stations.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.location}</option>)}
              </select>
            </label>
          </div>
          {unpriced.length > 0 && (
            <div role="alert" style={{ padding: '14px 16px', borderRadius: 10, background: '#dc2626', color: '#fff', fontWeight: 900, fontSize: '1.05rem', textAlign: 'center', letterSpacing: '0.02em' }}>
              NO PRICE - CANNOT CHECK OUT<div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{unpriced.map((l) => l.description).join(', ')}: remove {unpriced.length === 1 ? 'it' : 'them'} from the sale and ask a manager to set a price.</div>
            </div>
          )}
          {needShift && <p role="alert" style={{ margin: 0, padding: '8px 10px', borderRadius: 8, background: 'color-mix(in srgb, #d97706 12%, transparent)', fontSize: '0.82rem' }}>Open your shift to start selling.</p>}
          {tabs}
          {mode !== 'return' && (customer ? (
            <div style={{ display: 'grid', gap: 6, padding: '8px 10px', borderRadius: 8, background: colors.tint(0.08), border: `1px solid ${colors.tint(0.25)}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>
                  <strong>{customer.name}</strong>
                  <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>
                    {customer.points != null ? ` · ${customer.points} points` : ''}
                    {mode === 'cash' ? ' · earns points on this sale' : ''}
                    {mode === 'invoice' && customer.credit_room != null ? ` · credit room ${money(customer.credit_room, cur)}` : ''}
                  </span>
                  {mode === 'invoice' && customer.credit === false && <span style={{ fontSize: '0.75rem', color: colors.danger }}> · no credit account</span>}
                </span>
                <button type="button" style={{ ...btnGhost, padding: '2px 8px' }} aria-label="Remove customer" onClick={() => { setCustomer(null); setPromo(''); setPhone(''); }}><X size={13} /></button>
              </div>
              <input style={{ ...field, height: 32, fontSize: '0.82rem' }} maxLength={40} value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} placeholder="Promo code (optional)" aria-label="Promo code" />
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input style={{ ...field, height: 34, fontSize: '0.84rem' }} inputMode="tel" maxLength={30} value={phone} onChange={(e) => { setPhone(e.target.value.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '')); setPhoneMsg(null); }} onKeyDown={(e) => e.key === 'Enter' && findByPhone()} placeholder={mode === 'cash' ? "Customer's phone number (optional)" : "Customer's phone number"} aria-label="Customer phone number" />
                <button type="button" style={btnGhost} disabled={phone.replace(/\D/g, '').length < 7} onClick={findByPhone}>Find</button>
              </div>
              {phoneMsg && <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>{phoneMsg}</span>}
              {mode === 'cash' && (
                <>
                  <div style={{ fontSize: '0.74rem', color: colors.textMuted }}>No customer: walk-in sale. No loyalty points, discounts, promo codes or gift vouchers.</div>
                  <input style={{ ...field, height: 32, fontSize: '0.82rem' }} maxLength={80} value={walkin} onChange={(e) => setWalkin(e.target.value)} placeholder="A name for the receipt (otherwise Walk-in customer)" aria-label="Customer name" />
                </>
              )}
            </div>
          ))}
          {cart.length === 0 && <p style={{ color: colors.textMuted, fontSize: '0.85rem', margin: 0 }}>The basket is empty. Scan or tap an item.</p>}
          {anyDiscount && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 86px 96px', gap: 6, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: colors.textMuted }}>
              <span>Item</span><span style={{ textAlign: 'right' }}>Discount</span><span style={{ textAlign: 'right' }}>Amount</span>
            </div>
          )}
          {cart.map((c, i) => (
            <div key={c.variant_id} style={{ display: 'grid', gridTemplateColumns: anyDiscount ? '1fr 86px 96px' : '1fr auto', gap: 6, paddingBottom: 8, borderBottom: '1px solid var(--line)', alignItems: 'start' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{c.name}</div>
                <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>{lineOf(i) ? `${money(lineOf(i).rate, cur)} each` : ''}</div>
              </div>
              {anyDiscount && <div style={{ textAlign: 'right', fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary-600)' }}>{lineOf(i)?.discount_amount > 0 ? `-${money(lineOf(i).discount_amount, cur)}` : ''}</div>}
              <div style={{ textAlign: 'right', fontWeight: 800 }}>{lineOf(i) ? money(lineOf(i).amount, cur) : ''}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', gridColumn: anyDiscount ? '1 / 3' : undefined }}>
                <Stepper label={c.name} value={c.quantity} onMinus={() => change(c.variant_id, { quantity: c.quantity - 1 })} onPlus={() => change(c.variant_id, { quantity: c.quantity + 1 })} onType={(v) => change(c.variant_id, { quantity: Number(v) || 0 })} />
                {ctx.can.discount && <input style={{ ...field, width: 64, height: 30, padding: '2px 8px', fontSize: '0.8rem' }} inputMode="decimal" placeholder="% off" value={c.discount_pct || ''} onChange={(e) => change(c.variant_id, { discount_pct: Number(e.target.value) || 0 })} aria-label="Discount percent" />}
              </div>
              <span style={{ justifySelf: 'end' }}><RemoveButton label={c.name} onClick={() => remove(c, i)} /></span>
            </div>
          ))}
          <div style={{ display: 'grid', gap: 4, fontSize: '0.88rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{money(priced?.subtotal, cur)}</span></div>
            {anyDiscount && <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-primary-600)', fontWeight: 700 }}><span>Discounts</span><span>-{money(totalDiscount, cur)}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tax</span><span>{money(priced?.tax_total, cur)}</span></div>
            {Math.abs(priced?.rounding ?? 0) >= 0.005 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Rounding</span><span>{priced.rounding > 0 ? '+' : '-'}{money(Math.abs(priced.rounding), cur)}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.3rem', fontWeight: 800 }}><span>Total</span><span>{money(total, cur)}</span></div>
          </div>
          {cart.length > 0 && (
            <label style={{ display: 'grid', gap: 3, fontSize: '0.72rem', fontWeight: 700, color: colors.textMuted }}>Note (the customer can see this on their receipt and documents)
              <input style={{ ...field, height: 32, fontSize: '0.82rem', fontWeight: 400 }} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional: for example a delivery or warranty note" aria-label="Note for the customer" />
            </label>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={btnGhost} disabled={!cart.length} onClick={hold}><Pause size={14} /> Hold</button>
            <button type="button" style={heldCount.customers > 0 ? { ...btnPrimary, background: '#dc2626' } : btnGhost} onClick={openHolds}><Play size={14} /> Recall{heldCount.total > 0 ? ` (${heldCount.total})` : ''}{heldCount.customers > 0 ? ` · ${heldCount.customers} from customers` : ''}</button>
            <button type="button" style={{ ...btnPrimary, flex: 1 }} disabled={!cart.length || !priced || (mode !== 'cash' && !customer) || needShift || unpriced.length > 0} onClick={() => (mode === 'order' ? pay([]) : setPaying(true))}>{{ cash: 'Checkout', invoice: 'Invoice', order: 'Place order' }[mode]} {money(total, cur)}</button>
          </div>
        </section>
      </div>

      {narrow && cart.length > 0 && !paying && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface-card, #fff)', borderTop: '1.5px solid var(--line)', boxShadow: '0 -6px 20px rgba(0,0,0,0.12)' }}>
          <span style={{ fontWeight: 800 }}>{cart.reduce((a, c) => a + c.quantity, 0)} items · {money(total, cur)}</span>
          <button type="button" style={btnPrimary} disabled={!cart.length || !priced || (mode !== 'cash' && !customer) || needShift || unpriced.length > 0} onClick={() => (mode === 'order' ? pay([]) : setPaying(true))}>{{ cash: 'Checkout', invoice: 'Invoice', order: 'Place order' }[mode]}</button>
        </div>
      )}
      {paying && <PayDialog total={total} methods={ctx.methods} cur={cur} busy={busy} mode={mode} customer={customer} giftMethodId={ctx.gift_method_id} canRound={!!ctx.rounding} rounding={rounding} onRound={setRounding} onCancel={() => { setPaying(false); setRounding('none'); }} onPay={pay} />}

      {holds && (
        <div role="dialog" aria-label="Held sales" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div style={{ ...card, padding: 18, width: 'min(460px, 100%)', display: 'grid', gap: 8, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto' }}>
            <strong>Held sales</strong>
            {holds.length === 0 && <p style={{ color: colors.textMuted, margin: 0 }}>Nothing is on hold.</p>}
            {holds.map((h) => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, ...(h.from_customer ? { background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)' } : {}) }}>
                <span>
                  {h.from_customer && <span style={{ background: '#dc2626', color: '#fff', borderRadius: 6, padding: '1px 6px', fontSize: '0.68rem', fontWeight: 800, marginRight: 6 }}>CUSTOMER</span>}
                  {h.label || `Sale #${h.id}`}
                  <span style={{ display: 'block', color: colors.textMuted, fontSize: '0.75rem' }}>{h.lines} line{h.lines === 1 ? '' : 's'} · {h.quantity} item{h.quantity === 1 ? '' : 's'} · {h.minutes < 1 ? 'just now' : `${h.minutes} min ago`}{h.from_customer ? (h.station ? ` · ${h.station}` : '') : (h.by ? ` · ${h.by}` : '')}</span>
                </span>
                <button type="button" style={btnPrimary} onClick={() => recall(h.id)}>Recall</button>
              </div>
            ))}
            <button type="button" style={btnGhost} onClick={() => setHolds(null)}>Close</button>
          </div>
        </div>
      )}

      {done && (
        <div role="dialog" aria-label="Sale done" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div style={{ ...card, padding: 22, width: 'min(380px, 100%)', display: 'grid', gap: 8, textAlign: 'center', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto' }}>
            <strong style={{ fontSize: '1.1rem' }}>{done.type ?? 'Sale'} {done.number}</strong>
            <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{money(done.total, cur)}</div>
            {done.paid_now != null && <div style={{ fontSize: '0.9rem' }}>Paid now: <strong>{money(done.paid_now, cur)}</strong> · to pay later: <strong>{money(done.total - done.paid_now, cur)}</strong></div>}
            {done.change > 0 && <div style={{ fontSize: '1.1rem' }}>Change due: <strong>{money(done.change, cur)}</strong></div>}
            <div style={{ fontSize: '0.8rem', color: colors.textMuted }}>{done.tenders.map((t) => `${t.method} ${money(t.amount, cur)}`).join(' · ')}</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
              <select style={{ ...field, width: 'auto' }} value={paper || ctx.station.paper} onChange={(e) => setPaper(e.target.value)} aria-label="Receipt paper">
                {(ctx.branch?.paper_allowed ?? Object.keys(PAPER)).map((k) => <option key={k} value={k}>{PAPER[k]?.label ?? k}</option>)}
              </select>
              <button type="button" style={btnGhost} onClick={() => print(done.id)}>Print 2 copies</button>
            </div>
            <label style={{ fontSize: '0.78rem', color: colors.textMuted }}><input type="checkbox" checked={auto} onChange={(e) => setAutoPrint(e.target.checked)} /> Print automatically after each sale</label>
            <button type="button" style={btnPrimary} onClick={() => { setDone(null); setMode('cash'); }}>New sale</button>
          </div>
        </div>
      )}
      {extraDialogs}
    </Shell>
  );
}
