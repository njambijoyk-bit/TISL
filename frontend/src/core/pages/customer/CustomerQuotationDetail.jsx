import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import quotationsAPI from '../../../_shared/api/quotations';
import { formatMoney } from '../../../_shared/lib/money';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import useDocId from '../../../_shared/hooks/useDocId';

const btn = { padding: '10px 18px', borderRadius: 10, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', border: '1.5px solid var(--line)', background: 'var(--surface-card, #fff)', color: 'var(--text-primary)', fontFamily: 'inherit' };

export default function CustomerQuotationDetail() {
  const { id: ref } = useParams();
  const nav = useNavigate();
  const { id, failed } = useDocId(ref);   // the address carries the quotation number; the id is looked up
  const [q, setQ] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [mode, setMode] = useState(null); // 'decline' | 'revision'

  const load = useCallback(() => (id ? quotationsAPI.mineShow(id).then(setQ).catch((e) => setError(errMsg(e, 'Could not load this quotation'))) : (failed ? setError('We could not find that quotation.') : undefined)), [id, failed]);
  useEffect(() => { if (q?.number && ref !== q.number) nav(`/my-quotes/${encodeURIComponent(q.number)}`, { replace: true }); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const run = async (fn) => {
    setBusy(true);
    try { const res = await fn(); toast.success(res.message); setMode(null); await load(); return res; }
    catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 7000 }); return null; }
    finally { setBusy(false); }
  };

  const accept = async () => {
    const res = await run(() => quotationsAPI.accept(id));
    if (res?.order) nav(`/orders/${encodeURIComponent(res.order.number ?? res.order.id)}`);
  };

  if (error) return <><Header /><main style={{ padding: 32 }}><p role="alert" style={{ color: '#991b1b' }}>{error}</p><Link to="/my-quotes">Back</Link></main><Footer /></>;
  if (!q) return <><Header /><main style={{ padding: 32 }}>Loading…</main><Footer /></>;

  const open = q.doc_status === 'quoted';
  const cur = q.currency;

  return (
    <>
      <Header />
      <main style={{ maxWidth: 820, margin: '0 auto', padding: '32px 16px 64px' }}>
        <Link to="/my-quotes" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-primary-500)', textDecoration: 'none' }}>← My quotations</Link>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '8px 0' }}>Quotation <span style={{ fontFamily: 'monospace', color: 'var(--color-primary-500)' }}>{q.number}</span></h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{q.valid_until ? `Valid until ${q.valid_until}` : 'We are preparing your prices'}</p>

        {q.doc_status === 'requested' && <p style={{ padding: 12, borderRadius: 10, background: 'rgba(245,158,11,0.1)' }}>We're preparing your prices. You'll be notified when this is ready.</p>}
        {q.doc_status === 'accepted' && <p style={{ padding: 12, borderRadius: 10, background: 'rgba(16,185,129,0.1)' }}>You accepted this quotation{q.order ? <> — order <Link to={`/orders/${q.order.id}`}>{q.order.number}</Link></> : ''}.</p>}
        {q.doc_status === 'declined' && <p style={{ padding: 12, borderRadius: 10, background: 'rgba(239,68,68,0.08)' }}>You declined this quotation.</p>}
        {q.doc_status === 'expired' && <p style={{ padding: 12, borderRadius: 10, background: 'rgba(107,114,128,0.1)' }}>This quotation has expired. You can request a new one.</p>}
        {q.doc_status === 'revision_requested' && <p style={{ padding: 12, borderRadius: 10, background: 'rgba(245,158,11,0.1)' }}>You asked for changes{q.response_note ? `: “${q.response_note}”` : ''}. We'll send a revised quotation.</p>}

        <div style={{ overflowX: 'auto', margin: '16px 0', padding: '4px 12px', background: 'var(--surface-card, #fff)', border: '1px solid var(--line)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: '0.7rem' }}><th style={{ padding: 8 }}>Item</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Price</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
            <tbody>
              {q.lines.map((l) => (
                <tr key={l.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: 8 }}>{l.description}{l.variant_label && l.variant_label !== 'Standard' ? ` — ${l.variant_label}` : ''}{l.notes && <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{l.notes}</div>}</td>
                  <td style={{ textAlign: 'right' }}>{l.quantity} {l.unit_code}</td>
                  <td style={{ textAlign: 'right' }}>{l.pending_price ? 'to be confirmed' : formatMoney(l.rate, cur)}</td>
                  <td style={{ textAlign: 'right' }}>{l.pending_price ? '—' : formatMoney(l.amount, cur)}</td>
                </tr>
              ))}
              {q.doc_status !== 'requested' && q.charges.map((c, i) => <tr key={`c${i}`} style={{ borderTop: '1px solid var(--line)' }}><td style={{ padding: 8 }} colSpan={3}>{c.description}</td><td style={{ textAlign: 'right' }}>{formatMoney(c.amount, cur)}</td></tr>)}
              {q.doc_status !== 'requested' && q.tax_total > 0 && <tr style={{ borderTop: '1px solid var(--line)' }}><td style={{ padding: 8 }} colSpan={3}>Tax</td><td style={{ textAlign: 'right' }}>{formatMoney(q.tax_total, cur)}</td></tr>}
              {q.doc_status !== 'requested' && <tr style={{ borderTop: '2px solid var(--color-primary-500)', fontWeight: 800, color: 'var(--color-primary-500)' }}><td style={{ padding: 8 }} colSpan={3}>Total</td><td style={{ textAlign: 'right' }}>{formatMoney(q.total, cur)}</td></tr>}
            </tbody>
          </table>
        </div>

        {open && !mode && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" disabled={busy} onClick={accept} style={{ ...btn, background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', color: 'white', border: 'none' }}>{busy ? 'Working…' : 'Accept and place order'}</button>
            <button type="button" disabled={busy} onClick={() => setMode('revision')} style={btn}>Ask for changes</button>
            <button type="button" disabled={busy} onClick={() => setMode('decline')} style={{ ...btn, color: '#b91c1c' }}>Decline</button>
          </div>
        )}
        {open && mode && (
          <div style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>{mode === 'revision' ? 'What should change?' : 'Reason (optional)'}
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-input)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={btn} onClick={() => setMode(null)}>Back</button>
              <button type="button" disabled={busy || (mode === 'revision' && !note.trim())} style={{ ...btn, background: '#6d28d9', color: 'white', border: 'none' }}
                onClick={() => run(() => (mode === 'revision' ? quotationsAPI.revision(id, note) : quotationsAPI.decline(id, note)))}>Send</button>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
