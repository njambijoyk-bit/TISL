import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ShoppingBag, Tag, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import useCartStore from '../../../_shared/store/cartStore';
import useAuthStore from '../../../_shared/store/authStore';
import useCheckoutPrefs from '../../../_shared/store/checkoutPrefsStore';
import checkoutAPI from '../../../_shared/api/checkout';
import { toApiItem } from '../../../_shared/lib/cartItems';
import { formatMoney } from '../../../_shared/lib/money';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import SummaryLedger from '../../../_shared/components/common/SummaryLedger';

const box = { background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', padding: 20 };
const head = { fontSize: '0.8rem', fontWeight: 700, color: '#111827', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 };

function Pick({ active, onClick, name, detail, amount, tone }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
      border: `1.5px solid ${active ? 'var(--color-primary-500)' : '#e5e7eb'}`, background: active ? 'color-mix(in srgb, var(--color-primary-500) 5%, transparent)' : 'white' }}>
      <span style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${active ? 'var(--color-primary-500)' : '#d1d5db'}`, background: active ? 'var(--color-primary-500)' : 'white', flexShrink: 0 }} />
      <span style={{ flex: 1 }}><span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#111827' }}>{name}</span>{detail && <span style={{ display: 'block', fontSize: '0.7rem', color: '#9ca3af' }}>{detail}</span>}</span>
      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: tone ?? '#111827' }}>{amount}</span>
    </button>
  );
}

/** The cart's money: the summary ledger, the promos on offer, and the delivery methods to choose from. */
export default function CartSummary({ blocked = false }) {
  const navigate = useNavigate();
  const { items } = useCartStore();
  const { isAuthenticated } = useAuthStore();
  const prefs = useCheckoutPrefs();
  const [opts, setOpts] = useState(null);
  const [quote, setQuote] = useState(null);
  const [typed, setTyped] = useState('');

  useEffect(() => { checkoutAPI.options().then(setOpts).catch(() => {}); }, []);
  // a delivery method is always selected — the first one until they choose
  useEffect(() => {
    const list = opts?.shipping ?? [];
    if (list.length && !list.some((o) => o.slug === prefs.delivery_method)) prefs.set({ delivery_method: list[0].slug });
  }, [opts]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!items.length) { setQuote(null); return undefined; }
    const t = setTimeout(() => {
      checkoutAPI.quote({ items: items.map(toApiItem), delivery_method: prefs.delivery_method || undefined, promo_code: prefs.promo_code || undefined })
        .then(setQuote)
        .catch((e) => {
          setQuote(null);
          if (prefs.promo_code) { toast.error(errMsg(e, 'That promo code can not be used'), { duration: 6000 }); prefs.set({ promo_code: '' }); }
        });
    }, 300);
    return () => clearTimeout(t);
  }, [items, prefs.delivery_method, prefs.promo_code]); // eslint-disable-line react-hooks/exhaustive-deps

  const money = (n) => formatMoney(n, quote?.currency);
  const promos = quote?.available?.promo_codes ?? [];
  const chosen = prefs.promo_code.trim().toLowerCase();

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={box}>
        <p style={head}>Order summary</p>
        {quote ? <SummaryLedger quote={quote} /> : <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>Pricing your cart…</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
        <div style={box}>
          <p style={head}><Truck size={14} /> Delivery</p>
          <div style={{ display: 'grid', gap: 7 }}>
            {(opts?.shipping ?? []).map((o) => (
              <Pick key={o.slug} active={prefs.delivery_method === o.slug} onClick={() => prefs.set({ delivery_method: o.slug })} name={o.name}
                detail={[o.description, o.transit_days ? `${o.transit_days} day${o.transit_days > 1 ? 's' : ''}` : null, o.display_free_above ? `free above ${o.display_free_above.formatted}` : null].filter(Boolean).join(' · ')}
                amount={Number(o.cost) === 0 ? 'Free' : o.display_cost?.formatted} />
            ))}
            {opts && !(opts.shipping ?? []).length && <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0 }}>No delivery methods are set up yet.</p>}
          </div>
        </div>

        <div style={box}>
          <p style={head}><Tag size={14} /> Promo codes</p>
          {!isAuthenticated && <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 8px' }}>Sign in to see your tier discount and the promo codes you can use.</p>}
          <div style={{ display: 'grid', gap: 7 }}>
            {promos.map((p) => (
              <Pick key={p.code} active={chosen === p.code.toLowerCase()} onClick={() => prefs.set({ promo_code: chosen === p.code.toLowerCase() ? '' : p.code })} name={p.code} amount={`saves ${money(p.discount)}`} tone="#059669" />
            ))}
            {isAuthenticated && !promos.length && <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0 }}>No promo codes available for this cart.</p>}
            {isAuthenticated && (
              <form onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { prefs.set({ promo_code: typed.trim() }); setTyped(''); } }} style={{ display: 'flex', gap: 6 }}>
                <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Have a code? Type it" aria-label="Promo code" style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.82rem' }} />
                <button type="submit" style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#111827', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Apply</button>
              </form>
            )}
          </div>
        </div>
      </div>

      <button onClick={() => { if (blocked) { toast.error('Choose an option for the items marked above first'); return; } navigate(isAuthenticated ? '/checkout' : '/login?redirect=/checkout'); }} disabled={blocked} style={{ opacity: blocked ? 0.6 : 1,
        width: '100%', padding: '13px', borderRadius: 10, fontSize: '0.9rem', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', color: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
      }}>
        <Lock size={14} /> Proceed to checkout
      </button>
      <button onClick={() => navigate('/products')} style={{
        width: '100%', padding: '11px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 25%, transparent)', color: 'var(--color-primary-600)', background: 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
      }}>
        <ShoppingBag size={14} /> Continue shopping
      </button>
    </div>
  );
}
