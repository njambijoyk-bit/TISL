import { useState, useEffect, useCallback } from 'react';
import { Banknote, Receipt, Fuel, Trash2, Plus, Loader2 } from 'lucide-react';
import deliveryAPI from '../../../../_shared/api/delivery';
import { D, DeliveryCard, DeliveryDivider, DeliveryBtn } from './DeliveryShared';

const money = (n) => Number(n ?? 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().split('T')[0];
const input = { background: D.card, border: `1px solid ${D.purpleBorder}`, borderRadius: D.radiusSm, color: D.text, fontSize: '0.8rem', padding: '7px 9px', outline: 'none', boxSizing: 'border-box' };
const label = { fontSize: '0.66rem', fontWeight: 700, color: D.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 3 };

/**
 * Money on a manifest: cash collected at the door (posted as a Receipt for the customer) and what the trip cost
 * (posted as a Payment: Dr Delivery Expenses, Cr the cash / bank it came from).
 */
export default function ManifestMoneyPanel({ manifestId, items, onChanged }) {
    const [data, setData]     = useState(null);
    const [error, setError]   = useState('');
    const [busy, setBusy]     = useState(false);
    const [collecting, setCollecting] = useState(null);   // stop id with its form open
    const [col, setCol]       = useState({ amount: '', payment_method_id: '', reference_no: '' });
    const [showCost, setShowCost] = useState(false);
    const [cost, setCost]     = useState({ category: 'fuel', amount: '', paid_ledger_id: '', expense_ledger_id: '', payee: '', notes: '', paid_on: today() });

    const load = useCallback(async () => {
        try { setData((await deliveryAPI.getManifestMoney(manifestId)).data); setError(''); }
        catch (e) { setError(e?.response?.data?.message ?? 'Could not load the money for this manifest.'); }
    }, [manifestId]);
    useEffect(() => { load(); }, [load]);

    const run = async (fn, after) => {
        setBusy(true); setError('');
        try { await fn(); after?.(); await load(); onChanged?.(); }
        catch (e) { setError(e?.response?.data?.message ?? 'That did not work.'); }
        finally { setBusy(false); }
    };

    if (!data) return error ? <div style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: 16 }}>{error}</div> : null;
    if (!data.ready) return null;   // script 69 not run yet — the panel stays out of the way

    const stopMoney = Object.fromEntries((data.stops ?? []).map(s => [s.id, s]));
    const collectable = (items ?? []).filter(i => ['out_for_delivery', 'delivered'].includes(i.status));

    return (
        <div style={{ marginBottom: 'clamp(20px, 4vw, 32px)' }}>
            <DeliveryDivider label="Money" />
            {error && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: 10 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <DeliveryCard style={{ flex: '1 1 180px', padding: '12px 16px' }}>
                    <div style={label}>Collected at the door</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: D.teal }}>{money(data.collected_total)}</div>
                </DeliveryCard>
                <DeliveryCard style={{ flex: '1 1 180px', padding: '12px 16px' }}>
                    <div style={label}>Cost of the trip</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: D.text }}>{money(data.cost_total)}</div>
                </DeliveryCard>
            </div>

            {/* cash collected, per stop */}
            <DeliveryCard style={{ padding: 'clamp(12px, 2vw, 16px)', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontWeight: 700, fontSize: '0.85rem', color: D.text }}>
                    <Banknote size={15} color={D.purple} /> Cash collected on delivery
                </div>
                <div style={{ fontSize: '0.74rem', color: D.textDim, marginBottom: 10 }}>
                    Recording what was paid at the door posts a Receipt for the customer. It settles their open invoice for these Delivery Notes first; anything over stays as their credit.
                </div>
                {collectable.length === 0 && <div style={{ fontSize: '0.78rem', color: D.textDim }}>Stops that are out for delivery or delivered will show here.</div>}
                {collectable.map(it => {
                    const m = stopMoney[it.id] ?? {};
                    const name = it.contact_name || it.order?.customer?.first_name || 'Stop';
                    return (
                        <div key={it.id} style={{ borderTop: `1px solid ${D.purpleBorder}`, padding: '10px 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 160 }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: D.text }}>{name} <span style={{ color: D.textDim, fontWeight: 400 }}>· {it.order?.order_number}</span></div>
                                    <div style={{ fontSize: '0.72rem', color: D.textDim }}>{m.owed > 0 ? `Owes ${money(m.owed)} on open invoices` : 'No open invoice yet — money goes on account'}</div>
                                </div>
                                {m.collected != null ? (
                                    <>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: D.teal }}>Collected {money(m.collected)}</span>
                                        <DeliveryBtn variant="ghost" size="sm" disabled={busy} onClick={() => run(() => deliveryAPI.cancelCollection(manifestId, it.id))}>Cancel</DeliveryBtn>
                                    </>
                                ) : (
                                    <DeliveryBtn variant="ghost" size="sm" onClick={() => { setCollecting(collecting === it.id ? null : it.id); setCol({ amount: m.owed > 0 ? String(m.owed) : '', payment_method_id: data.payment_methods?.[0]?.id ?? '', reference_no: '' }); }}>
                                        <Receipt size={13} /> Collect
                                    </DeliveryBtn>
                                )}
                            </div>
                            {collecting === it.id && (
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
                                    <div><label style={label}>Amount</label><input type="number" min="0" step="0.01" style={{ ...input, width: 120 }} value={col.amount} onChange={e => setCol({ ...col, amount: e.target.value })} /></div>
                                    <div><label style={label}>Paid by</label>
                                        <select style={input} value={col.payment_method_id} onChange={e => setCol({ ...col, payment_method_id: e.target.value })}>
                                            {(data.payment_methods ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select></div>
                                    <div><label style={label}>Reference</label><input style={{ ...input, width: 140 }} placeholder="M-Pesa code…" value={col.reference_no} onChange={e => setCol({ ...col, reference_no: e.target.value })} /></div>
                                    <DeliveryBtn size="sm" disabled={busy || !col.amount || !col.payment_method_id} onClick={() => run(() => deliveryAPI.collectOnStop(manifestId, it.id, col), () => setCollecting(null))}>
                                        {busy ? <Loader2 size={13} className="spin" /> : 'Record'}
                                    </DeliveryBtn>
                                </div>
                            )}
                        </div>
                    );
                })}
            </DeliveryCard>

            {/* cost of the trip */}
            <DeliveryCard style={{ padding: 'clamp(12px, 2vw, 16px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.85rem', color: D.text, flex: 1 }}><Fuel size={15} color={D.purple} /> What this trip cost</div>
                    <DeliveryBtn variant="ghost" size="sm" onClick={() => setShowCost(v => !v)}><Plus size={13} /> Record a cost</DeliveryBtn>
                </div>
                {showCost && (
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${D.purpleBorder}` }}>
                        <div><label style={label}>What for</label>
                            <select style={input} value={cost.category} onChange={e => setCost({ ...cost, category: e.target.value })}>
                                {(data.categories ?? []).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                            </select></div>
                        <div><label style={label}>Amount</label><input type="number" min="0" step="0.01" style={{ ...input, width: 110 }} value={cost.amount} onChange={e => setCost({ ...cost, amount: e.target.value })} /></div>
                        <div><label style={label}>Paid from</label>
                            <select style={input} value={cost.paid_ledger_id} onChange={e => setCost({ ...cost, paid_ledger_id: e.target.value })}>
                                <option value="">Choose…</option>
                                {(data.pay_from ?? []).map(l => <option key={l.id} value={l.id}>{l.name} ({l.group})</option>)}
                            </select></div>
                        <div><label style={label}>Expense account</label>
                            <select style={input} value={cost.expense_ledger_id} onChange={e => setCost({ ...cost, expense_ledger_id: e.target.value })}>
                                <option value="">Delivery Expenses (default)</option>
                                {(data.expense_ledgers ?? []).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select></div>
                        <div><label style={label}>Paid to</label><input style={{ ...input, width: 130 }} placeholder="Shell, courier…" value={cost.payee} onChange={e => setCost({ ...cost, payee: e.target.value })} /></div>
                        <div><label style={label}>Date</label><input type="date" max={today()} style={input} value={cost.paid_on} onChange={e => setCost({ ...cost, paid_on: e.target.value })} /></div>
                        <div style={{ flex: '1 1 160px' }}><label style={label}>Note</label><input style={{ ...input, width: '100%' }} value={cost.notes} onChange={e => setCost({ ...cost, notes: e.target.value })} /></div>
                        <DeliveryBtn size="sm" disabled={busy || !cost.amount || !cost.paid_ledger_id} onClick={() => run(() => deliveryAPI.addManifestCost(manifestId, cost), () => { setShowCost(false); setCost({ ...cost, amount: '', payee: '', notes: '' }); })}>
                            {busy ? <Loader2 size={13} className="spin" /> : 'Save cost'}
                        </DeliveryBtn>
                    </div>
                )}
                {(data.costs ?? []).length === 0 && <div style={{ fontSize: '0.78rem', color: D.textDim }}>No costs recorded. Fuel, courier fees and driver pay post to Delivery Expenses.</div>}
                {(data.costs ?? []).map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: `1px solid ${D.purpleBorder}`, opacity: c.cancelled ? 0.5 : 1 }}>
                        <div style={{ flex: 1, fontSize: '0.8rem', color: D.text, textDecoration: c.cancelled ? 'line-through' : 'none' }}>
                            {c.label}{c.payee ? ` — ${c.payee}` : ''} <span style={{ color: D.textDim, fontSize: '0.72rem' }}>· {c.paid_on} · from {c.paid_from}</span>
                        </div>
                        <strong style={{ fontSize: '0.82rem' }}>{money(c.amount)}</strong>
                        {!c.cancelled && <button title="Cancel this cost" disabled={busy} onClick={() => run(() => deliveryAPI.cancelManifestCost(manifestId, c.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.textDim, display: 'flex' }}><Trash2 size={14} /></button>}
                    </div>
                ))}
            </DeliveryCard>
        </div>
    );
}
