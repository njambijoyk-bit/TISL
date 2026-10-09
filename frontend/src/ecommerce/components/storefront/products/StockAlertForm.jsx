import { useEffect, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import stockAlertsAPI from '../../../../_shared/api/stockAlerts';
import { useAuthStore } from '../../../../_shared/store/index';
import { errMsg } from '../../../../_shared/store/helpers/apiState';

/**
 * "Email me when it is back" on an out-of-stock product: anyone with an email address can ask; a signed-in customer needs no typing. Shown nothing at all when the
 * company has switched the alerts off. `variantId` is the chosen option (none = the product's own).
 */
export default function StockAlertForm({ productId, variantId }) {
  const { user, customer, isAuthenticated } = useAuthStore();
  const known = isAuthenticated ? (customer?.email || user?.email || '') : '';
  const [on, setOn] = useState(false);
  const [email, setEmail] = useState(known);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => { let live = true; stockAlertsAPI.enabled().then((v) => live && setOn(!!v)).catch(() => live && setOn(false)); return () => { live = false; }; }, []);
  useEffect(() => { setDone(null); }, [productId, variantId]);
  useEffect(() => { if (known && !email) setEmail(known); }, [known]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!on) return null;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { const r = await stockAlertsAPI.watch({ product_id: productId, variant_id: variantId || undefined, email: email.trim() || undefined }); setDone(r.message); }
    catch (err) { toast.error(errMsg(err, 'Could not save your request'), { duration: 6000 }); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div role="status" style={{ margin: '0 20px 14px', padding: '10px 12px', borderRadius: 10, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', color: '#065f46', fontSize: '0.82rem', display: 'flex', gap: 8, alignItems: 'center' }}>
        <Check size={16} aria-hidden="true" /> {done}
      </div>
    );
  }
  return (
    <form onSubmit={submit} style={{ margin: '0 20px 14px', padding: 12, borderRadius: 10, border: '1px solid var(--line, rgba(0,0,0,0.12))', display: 'grid', gap: 8 }}>
      <label htmlFor="stock-alert-email" style={{ fontSize: '0.82rem', fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center' }}><Bell size={14} aria-hidden="true" /> Email me when it is back in stock</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input id="stock-alert-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
          style={{ flex: '1 1 200px', minWidth: 0, padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--line, rgba(0,0,0,0.15))', background: 'transparent', color: 'inherit', fontFamily: 'inherit', fontSize: '0.85rem' }} />
        <button type="submit" disabled={busy} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', fontWeight: 800, fontFamily: 'inherit', fontSize: '0.82rem', color: 'white', background: 'var(--color-primary-500)', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'Saving…' : 'Notify me'}</button>
      </div>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary, #6b7280)' }}>One email when it is back. No spam, and every email has a link to stop.</span>
    </form>
  );
}
