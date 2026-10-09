import { useEffect, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import stockAlertsAPI from '../../../../_shared/api/stockAlerts';
import { useAuthStore } from '../../../../_shared/store/index';
import { errMsg } from '../../../../_shared/store/helpers/apiState';

const field = { padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--line, rgba(0,0,0,0.15))', background: 'transparent', color: 'inherit', fontFamily: 'inherit', fontSize: '0.85rem' };

/**
 * "Email me when it is back" for an out-of-stock product or hamper: anyone with an email address can ask; a signed-in customer needs no typing. A product with several
 * options that are out asks which one. Renders nothing when the company has switched the alerts off.
 * Give `productId` (+ `variantId` when an option is chosen) or `hamperId`. `bare` drops the outer margins (inside a card or a dialog); `onDone` is called once it is saved.
 */
export default function StockAlertForm({ productId, variantId, hamperId, bare = false, onDone }) {
  const { user, customer, isAuthenticated } = useAuthStore();
  const known = isAuthenticated ? (customer?.email || user?.email || '') : '';
  const [on, setOn] = useState(false);
  const [email, setEmail] = useState(known);
  const [options, setOptions] = useState([]);
  const [option, setOption] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => { let live = true; stockAlertsAPI.enabled().then((v) => live && setOn(!!v)); return () => { live = false; }; }, []);
  useEffect(() => { setDone(null); setOptions([]); setOption(''); }, [productId, variantId, hamperId]);
  useEffect(() => { if (known && !email) setEmail(known); }, [known]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!on) return null;
  const margin = bare ? 0 : '0 20px 14px';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await stockAlertsAPI.watch({ product_id: hamperId ? undefined : productId, hamper_id: hamperId || undefined, variant_id: (option ? Number(option) : variantId) || undefined, email: email.trim() || undefined });
      setDone(r.message); onDone?.(r);
    } catch (err) {
      const opts = err?.response?.data?.options;
      if (opts?.length) { setOptions(opts); setOption(String(opts[0].id)); }
      else toast.error(errMsg(err, 'Could not save your request'), { duration: 6000 });
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div role="status" style={{ margin, padding: '10px 12px', borderRadius: 10, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', color: '#065f46', fontSize: '0.82rem', display: 'flex', gap: 8, alignItems: 'center' }}>
        <Check size={16} aria-hidden="true" /> {done}
      </div>
    );
  }
  const id = `stock-alert-${hamperId ? 'h' : 'p'}${hamperId || productId}`;
  return (
    <form onSubmit={submit} style={{ margin, padding: bare ? 0 : 12, borderRadius: 10, border: bare ? 'none' : '1px solid var(--line, rgba(0,0,0,0.12))', display: 'grid', gap: 8 }}>
      <label htmlFor={`${id}-email`} style={{ fontSize: '0.82rem', fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center' }}><Bell size={14} aria-hidden="true" /> Email me when it is back in stock</label>
      {options.length > 0 && (
        <select aria-label="Which option" value={option} onChange={(e) => setOption(e.target.value)} style={{ ...field, background: 'var(--surface-card, #fff)' }}>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input id={`${id}-email`} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={{ ...field, flex: '1 1 200px', minWidth: 0 }} />
        <button type="submit" disabled={busy} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', fontWeight: 800, fontFamily: 'inherit', fontSize: '0.82rem', color: 'white', background: 'var(--color-primary-500)', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'Saving…' : options.length ? 'Notify me about this option' : 'Notify me'}</button>
      </div>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary, #6b7280)' }}>One email when it is back. No spam, and every email has a link to stop.</span>
    </form>
  );
}
