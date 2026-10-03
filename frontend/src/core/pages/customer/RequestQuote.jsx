import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import QuoteItemPicker from '../../components/cart/QuoteItemPicker';
import useRequestListStore from '../../../_shared/store/requestListStore';
import useAuthStore from '../../../_shared/store/authStore';
import quotationsAPI from '../../../_shared/api/quotations';
import { errMsg } from '../../../_shared/store/helpers/apiState';

const cell = { padding: '10px 8px', fontSize: '0.88rem', borderTop: '1px solid var(--line)' };

/** The customer's list of items they want prices for. Sending it creates a quotation the admin prices. */
export default function RequestQuote() {
  const nav = useNavigate();
  const { items, setQuantity, remove, clear } = useRequestListStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!isAuthenticated) { toast('Sign in to send your request — your list will be waiting.'); nav('/login', { state: { from: '/request-quote' } }); return; }
    setBusy(true);
    try {
      const res = await quotationsAPI.request({
        note: note.trim() || undefined,
        items: items.map((i) => ({ product_id: i.product_id, variant_id: i.variant_id, variant_unit_id: i.variant_unit_id, service_id: i.service_id, service_variant_id: i.service_variant_id, quantity: Number(i.quantity) || 1 })),
      });
      toast.success(res.message);
      clear();
      nav(`/my-quotes/${res.data.id}`);
    } catch (e) { toast.error(errMsg(e, 'Could not send your request'), { duration: 7000 }); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Header />
      <main style={{ maxWidth: 820, margin: '0 auto', padding: '32px 16px 64px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 6px' }}>Request a quote</h1>
        <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Tell us what you need and how many. We'll add our prices and send you a quotation.</p>

        <QuoteItemPicker />

        {items.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>Your list is empty. Search above to add products or services, or open any product and choose <strong>Request a quote</strong>.</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: '0.7rem' }}><th style={{ padding: 8 }}>Name</th><th>Variant</th><th style={{ textAlign: 'right' }}>Qty</th><th /></tr></thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.key}>
                      <td style={cell}><strong>{i.name}</strong></td>
                      <td style={{ ...cell, color: 'var(--text-secondary)' }}>{i.variant_label && i.variant_label !== 'Standard' ? i.variant_label : '—'}</td>
                      <td style={{ ...cell, textAlign: 'right' }}>
                        <input type="number" min="1" step="any" value={i.quantity} onChange={(e) => setQuantity(i.key, e.target.value)} aria-label={`Quantity of ${i.name}`}
                          style={{ width: 80, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--line)', textAlign: 'right', background: 'var(--surface-input)', color: 'var(--text-primary)' }} />{i.unit_code ? <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}> {i.unit_code}</span> : null}
                      </td>
                      <td style={{ ...cell, textAlign: 'right' }}><button type="button" onClick={() => remove(i.key)} aria-label={`Remove ${i.name}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}><Trash2 size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label style={{ display: 'block', margin: '18px 0 6px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Anything we should know? (optional)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} placeholder="When you need it, where it goes, special requirements…"
              style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-input)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.88rem' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button type="button" disabled={busy} onClick={send}
                style={{ padding: '12px 24px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 700, color: 'white', background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))' }}>
                {busy ? 'Sending…' : isAuthenticated ? 'Send request' : 'Sign in to send'}
              </button>
              <button type="button" onClick={clear} style={{ padding: '12px 18px', borderRadius: 12, border: '1px solid var(--line)', background: 'transparent', cursor: 'pointer' }}>Clear list</button>
            </div>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
