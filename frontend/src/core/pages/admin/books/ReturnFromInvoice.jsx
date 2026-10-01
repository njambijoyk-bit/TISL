import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import booksAPI from '../../../../_shared/api/books';
import useAuthStore from '../../../../_shared/store/authStore';
import { canWriteFinance } from '../../../../_shared/lib/roles';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';
import { money, today } from '../../../components/admin/books/booksFmt';
import { NoAccess } from '../../../components/admin/ui/HubHeader';

const th = { padding: '8px 10px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}`, verticalAlign: 'middle' };
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const input = { width: 90, padding: '6px 8px', borderRadius: 8, border: `1px solid ${colors.tint(0.2)}`, fontSize: '0.8rem', textAlign: 'right', background: 'transparent', color: 'inherit' };
const select = { padding: '6px 8px', borderRadius: 8, border: `1px solid ${colors.tint(0.2)}`, fontSize: '0.78rem', background: 'transparent', color: 'inherit', maxWidth: 220 };

const trim = (n) => String(Number(Number(n).toFixed(4)));

/**
 * Credit note against a sales invoice / debit note against a purchase. The invoice's lines come in with
 * their prices and taxes; the admin ticks what to reverse and how much.
 */
export default function ReturnFromInvoice() {
  const { id } = useParams();
  const nav = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canWrite = canWriteFinance(user);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [picks, setPicks] = useState({});   // item id -> { on, mode, quantity, amount }
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState(null);

  useEffect(() => {
    booksAPI.returnable(id).then(setData).catch((e) => setError(errMsg(e, 'Could not load the invoice')));
  }, [id]);

  const sale = data?.note_base === 'credit_note';
  const noun = sale ? 'Credit note' : 'Debit note';
  const set = (lineId, patch) => setPicks((p) => ({ ...p, [lineId]: { ...(p[lineId] ?? {}), ...patch } }));

  const tick = (l, on) => {
    if (!on) { set(l.id, { on: false }); return; }
    const byAmountOnly = l.is_charge || l.is_header || !l.can_return_stock;   // services, hampers and charges are reversed by amount
    set(l.id, { on: true, mode: byAmountOnly ? 'adjust' : 'return', quantity: trim(l.available_quantity), amount: l.available_amount.toFixed(2) });
  };

  /** What a picked line reverses: its net amount and the tax that goes with it, at the invoice's own rates. */
  const figures = (l) => {
    const p = picks[l.id];
    if (!p?.on) return null;
    const mode = l.is_charge || l.is_header ? 'adjust' : p.mode;
    let ratio;
    if (mode === 'adjust') ratio = l.amount > 0 ? Math.min(1, (Number(p.amount) || 0) / l.amount) : 1;
    else ratio = l.quantity > 0 ? Math.min(1, (Number(p.quantity) || 0) / l.quantity) : 1;
    const sign = l.negative ? -1 : 1;
    return { net: sign * l.amount * ratio, tax: sign * l.tax_amount * ratio, mode };
  };

  const totals = useMemo(() => {
    let net = 0; let tax = 0;
    (data?.lines ?? []).forEach((l) => { const f = figures(l); if (f) { net += f.net; tax += f.tax; } });
    return { net, tax, total: net + tax };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, picks]);

  const picked = (data?.lines ?? []).filter((l) => picks[l.id]?.on);
  const problem = (data?.lines ?? []).map((l) => {
    const p = picks[l.id];
    if (!p?.on) return null;
    const f = figures(l);
    if (f.mode === 'adjust') {
      const a = Number(p.amount);
      if (!(a > 0)) return `${l.description}: enter an amount.`;
      if (a - l.available_amount > 0.005) return `${l.description}: at most ${money(l.available_amount)}.`;
    } else {
      const q = Number(p.quantity);
      if (!(q > 0)) return `${l.description}: enter a quantity.`;
      if (q - l.available_quantity > 0.00005) return `${l.description}: at most ${trim(l.available_quantity)}.`;
    }
    return null;
  }).find(Boolean);

  const save = async () => {
    setBusy(true); setSaveErr(null);
    try {
      const lines = picked.map((l) => {
        const p = picks[l.id];
        const mode = l.is_charge || l.is_header ? 'adjust' : p.mode;
        return mode === 'adjust' ? { item_id: l.id, mode, amount: Number(p.amount) } : { item_id: l.id, mode, quantity: Number(p.quantity) };
      });
      const res = await booksAPI.createReturn(id, { lines, date, reason: reason.trim() || undefined });
      toast.success(res.message);
      nav(`/admin/books/vouchers/${res.data.id}`);
    } catch (e) { const m = errMsg(e, `Could not save the ${noun.toLowerCase()}`); setSaveErr(m); toast.error(m, { duration: 7000 }); }
    finally { setBusy(false); }
  };

  if (!canWrite) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="credit and debit notes" /></div></AdminLayout>;
  if (error) return <AdminLayout><div style={{ padding: 32 }}><p role="alert" style={{ color: colors.dangerText }}>{error}</p><Link to={`/admin/books/vouchers/${id}`}>Back to the voucher</Link></div></AdminLayout>;
  if (!data) return <AdminLayout><div style={{ padding: 32, color: colors.textMuted }}>Loading…</div></AdminLayout>;

  const modes = sale
    ? [['return', 'Goods back to stock'], ['writeoff', 'Damaged — write off stock'], ['adjust', 'Price adjustment (no goods)']]
    : [['return', 'Goods go back to the supplier'], ['adjust', 'Price adjustment (no goods)']];

  return (
    <AdminLayout>
      <div style={{ padding: '28px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <Link to={`/admin/books/vouchers/${id}`} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.78rem', color: colors.textMuted, textDecoration: 'none', marginBottom: 10 }}><ArrowLeft size={14} /> {data.source.voucher_number}</Link>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: colors.primary }}>New {noun.toLowerCase()}</h1>
        <p style={{ margin: '6px 0 16px', fontSize: '0.82rem', color: colors.textMuted }}>
          Against <strong>{data.source.voucher_number}</strong> · {data.source.party} · {data.source.date} · {money(data.source.total)}. Tick what to reverse. Prices, discounts and tax come from the {sale ? 'invoice' : 'purchase'}.
        </p>

        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 34 }} />
                <th style={th}>Item</th>
                <th style={{ ...th, ...num }}>{sale ? 'Sold' : 'Bought'}</th>
                <th style={{ ...th, ...num }}>Already reversed</th>
                <th style={{ ...th, ...num }}>Left</th>
                <th style={th}>What happens</th>
                <th style={{ ...th, ...num }}>Quantity / amount</th>
                <th style={{ ...th, ...num }}>{noun} (net)</th>
                <th style={{ ...th, ...num }}>Tax</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l) => {
                const p = picks[l.id] ?? {};
                const f = figures(l);
                const gone = l.available_amount <= 0.004 && l.amount > 0;
                const byAmount = l.is_charge || l.is_header || p.mode === 'adjust';
                return (
                  <tr key={l.id} style={{ opacity: gone ? 0.5 : 1 }}>
                    <td style={td}><input type="checkbox" checked={Boolean(p.on)} disabled={gone} onChange={(e) => tick(l, e.target.checked)} aria-label={`Reverse ${l.description}`} /></td>
                    <td style={td}>
                      <strong>{l.description}</strong>{l.variant_label ? <span style={{ color: colors.textMuted }}> — {l.variant_label}</span> : null}
                      {l.is_charge && <div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{l.negative ? 'Discount on the invoice' : 'Charge on the invoice'}</div>}
                    </td>
                    <td style={{ ...td, ...num }}>{l.is_charge ? money(l.amount) : `${trim(l.quantity)}${l.unit_code ? ` ${l.unit_code}` : ''}`}</td>
                    <td style={{ ...td, ...num }}>{l.reversed_amount > 0 ? (l.is_charge ? money(l.reversed_amount) : trim(l.reversed_quantity)) : '—'}</td>
                    <td style={{ ...td, ...num }}>{l.is_charge ? money(l.available_amount) : trim(l.available_quantity)}</td>
                    <td style={td}>
                      {p.on && !l.is_charge && !l.is_header && l.can_return_stock
                        ? <select value={p.mode} onChange={(e) => set(l.id, { mode: e.target.value })} style={select} aria-label="What happens">{modes.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
                        : p.on && !l.is_charge && !l.is_header
                          ? <select value={p.mode} onChange={(e) => set(l.id, { mode: e.target.value })} style={select} aria-label="What happens"><option value="adjust">Reverse the amount</option></select>
                          : <span style={{ color: colors.textFaint, fontSize: '0.75rem' }}>{p.on ? 'Reverse the charge' : ''}</span>}
                    </td>
                    <td style={{ ...td, ...num }}>
                      {p.on && (byAmount
                        ? <input type="number" step="0.01" min="0" value={p.amount} onChange={(e) => set(l.id, { amount: e.target.value })} style={input} aria-label="Amount to reverse" />
                        : <input type="number" step="any" min="0" value={p.quantity} onChange={(e) => set(l.id, { quantity: e.target.value })} style={input} aria-label="Quantity to take back" />)}
                    </td>
                    <td style={{ ...td, ...num }}>{f ? money(f.net) : ''}</td>
                    <td style={{ ...td, ...num, color: colors.textMuted }}>{f ? money(f.tax) : ''}</td>
                  </tr>
                );
              })}
              <tr>
                <td style={td} colSpan={7}><button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => data.lines.filter((l) => !l.is_charge && l.available_amount > 0.004).forEach((l) => tick(l, true))}>Tick all items</button> <span style={{ fontSize: '0.72rem', color: colors.textFaint }}>Delivery, discounts and other charges are their own lines — tick them too if they should be reversed.</span></td>
                <td style={{ ...td, ...num, fontWeight: 700 }}>{money(totals.net)}</td>
                <td style={{ ...td, ...num, fontWeight: 700 }}>{money(totals.tax)}</td>
              </tr>
              <tr>
                <td style={{ ...td, ...num, fontWeight: 800 }} colSpan={7}>Total {noun.toLowerCase()}</td>
                <td style={{ ...td, ...num, fontWeight: 800 }} colSpan={2}>{money(totals.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ ...card, padding: 16, marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: colors.textFaint }}>Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...input, width: '100%', textAlign: 'left', marginTop: 4 }} />
          </label>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: colors.textFaint, gridColumn: 'span 2' }}>Reason (printed in the narration)
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wrong size, damaged in transit, price agreed after delivery…" style={{ ...input, width: '100%', textAlign: 'left', marginTop: 4 }} />
          </label>
        </div>

        {picked.some((l) => picks[l.id].mode === 'writeoff') && <p role="status" style={{ margin: '12px 0 0', fontSize: '0.78rem', color: colors.warningText }}>Written-off goods do not go back into stock, and their cost stays as an expense (cost of goods sold is not reversed for them). The customer is still credited.</p>}
        {saveErr && <p role="alert" style={{ margin: '12px 0 0', color: colors.dangerText, fontSize: '0.82rem' }}>{saveErr}</p>}
        {problem && <p role="alert" style={{ margin: '12px 0 0', color: colors.dangerText, fontSize: '0.8rem' }}>{problem}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button type="button" style={{ ...btnPrimary, opacity: busy || !picked.length || problem ? 0.6 : 1 }} disabled={busy || !picked.length || Boolean(problem)} onClick={save}>{busy ? 'Saving…' : `Create ${noun.toLowerCase()}`}</button>
          <Link to={`/admin/books/vouchers/${id}`} style={{ ...btnGhost, textDecoration: 'none' }}>Cancel</Link>
        </div>
      </div>
    </AdminLayout>
  );
}
