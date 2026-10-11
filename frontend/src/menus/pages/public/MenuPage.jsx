import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ShoppingBasket } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import menusPublicAPI from '../../../_shared/api/menusPublic';
import { AllergenChips, DietChips, Pill } from '../../components/FoodChips';
import DishPicker from '../../components/DishPicker';
import OrderCheckout from '../../components/OrderCheckout';
import { useBasket } from '../../lib/basket';

const money = (n) => Number(n).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const chipBtn = (on) => ({ padding: '6px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, border: `1.5px solid ${on ? 'var(--color-primary-500)' : 'var(--line, #e5e7eb)'}`, background: on ? 'color-mix(in srgb, var(--color-primary-500) 14%, transparent)' : 'transparent', color: on ? 'var(--color-primary-600)' : 'var(--text-secondary)' });

export function DishCard({ d, avoid, data, ordering, onAdd }) {
  const hit = d.allergens.filter((a) => avoid.includes(a));
  const unsure = avoid.length > 0 && !d.info_complete;
  const price = d.price_incl ?? d.price;

  return (
    <article data-dish={d.name} style={{ display: 'grid', gridTemplateColumns: d.photo ? '96px 1fr' : '1fr', gap: 14, padding: 14, borderRadius: 14, border: '1px solid var(--line, #e5e7eb)', background: 'var(--surface-card, #fff)', opacity: d.available ? 1 : 0.65 }}>
      {d.photo && <img src={d.photo} alt="" loading="lazy" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 10 }} />}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>{d.name}</h3>
          {price != null && <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{money(price)}{d.price_incl == null && <small style={{ fontWeight: 500, color: 'var(--text-tertiary)' }}> + tax</small>}</span>}
        </div>
        {d.chef && <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }} data-testid="by-chef">by {d.chef}</p>}
        {d.description && <p style={{ margin: '4px 0 6px', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{d.description}</p>}
        <div>
          {!d.available && <Pill tone="danger">{d.sold_out_today ? 'Sold out today' : 'Not available right now'}</Pill>}
          {hit.length > 0 && <Pill tone="danger">Contains {hit.map((a) => data.allergens[a] ?? a).join(', ')}</Pill>}
          {unsure && <Pill tone="warn">Ask us: not every ingredient is classified</Pill>}
          <DietChips codes={d.diets} names={data.diets} />
        </div>
        <div style={{ marginTop: 2 }}><AllergenChips codes={d.allergens} names={data.allergens} /></div>
        {ordering && d.available && d.price != null && (
          <button type="button" onClick={() => onAdd(d)} aria-label={`Add ${d.name}`} style={{ marginTop: 8, padding: '7px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.8rem', color: '#fff', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))' }}>
            {d.options.length ? 'Choose' : 'Add'}
          </button>
        )}
        {d.options.length > 0 && (
          <details style={{ marginTop: 6, fontSize: '0.8rem' }}>
            <summary style={{ cursor: 'pointer', color: 'var(--color-primary-600)', fontWeight: 700 }}>Choices</summary>
            {d.options.map((g) => (
              <div key={g.id} style={{ margin: '6px 0' }}>
                <strong>{g.name}</strong> <span style={{ color: 'var(--text-tertiary)' }}>{g.min_choices > 0 ? 'choose ' : 'optional, '}{g.kind === 'single' ? 'one' : g.max_choices ? `up to ${g.max_choices}` : 'any'}</span>
                <div style={{ color: 'var(--text-secondary)' }}>{g.options.map((o) => `${o.name}${o.price_delta ? ` (${o.price_delta > 0 ? '+' : ''}${money(o.price_delta)})` : ''}`).join(' · ')}</div>
              </div>
            ))}
          </details>
        )}
      </div>
    </article>
  );
}

/** The menu: what is served now and later, filtered by diet and by the allergens a person wants to avoid. */
export default function MenuPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [current, setCurrent] = useState(null);
  const [diet, setDiet] = useState('');
  const [avoid, setAvoid] = useState([]);
  const basket = useBasket();
  const [ordering, setOrdering] = useState(false);   // is any way to order switched on?
  const [picking, setPicking] = useState(null);
  const [checkout, setCheckout] = useState(false);

  useEffect(() => { menusPublicAPI.channels().then((r) => setOrdering(r.channels.length > 0)).catch(() => setOrdering(false)); }, []);
  const addDish = (d) => (d.options.length ? setPicking(d) : basket.add(d));
  useEffect(() => { menusPublicAPI.get().then((r) => { setData(r); setCurrent((c) => c ?? (r.menus.find((m) => m.serving_now) ?? r.menus[0])?.id ?? null); }).catch(() => setError(true)); }, []);
  const menu = data?.menus.find((m) => m.id === current);
  const sections = useMemo(() => (menu?.sections ?? []).map((s) => ({ ...s, dishes: s.dishes.filter((d) => (!diet || d.diets.includes(diet)) && !d.allergens.some((a) => avoid.includes(a))) })).filter((s) => s.dishes.length), [menu, diet, avoid]);
  const hidden = menu ? menu.sections.reduce((n, s) => n + s.dishes.length, 0) - sections.reduce((n, s) => n + s.dishes.length, 0) : 0;

  return (
    <div className="min-h-screen">
      <Helmet><title>Menu | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 980, margin: '0 auto', padding: '40px 24px 64px' }} data-testid="public-menu">
        <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(1.7rem, 4vw, 2.4rem)', fontWeight: 900, color: 'var(--color-primary-500)', letterSpacing: '-0.02em' }}>Menu</h1>
        <p style={{ margin: '0 0 8px' }}><Link to="/chefs" style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--color-primary-600)' }}>Meet our chefs</Link></p>
        {error && <p style={{ color: 'var(--text-secondary)' }}>We could not load the menu. Please try again.</p>}
        {data && data.menus.length === 0 && <p style={{ color: 'var(--text-tertiary)' }}>The menu is not ready yet. Please check back soon.</p>}
        {data && data.menus.length > 0 && (
          <>
            <div role="tablist" aria-label="Menus" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0' }}>
              {data.menus.map((m) => (
                <button key={m.id} type="button" role="tab" aria-selected={m.id === current} onClick={() => setCurrent(m.id)} style={chipBtn(m.id === current)}>{m.name}{m.serving_now ? '' : ' · later'}</button>
              ))}
            </div>
            {menu && <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{menu.description && <>{menu.description} · </>}<span data-testid="serves">{menu.serving_now ? 'Serving now' : 'Not being served right now'} · {menu.serves}</span></p>}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }} aria-label="Diet">
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-tertiary)' }}>Show only</span>
              {Object.entries(data.diets).map(([k, name]) => <button key={k} type="button" aria-pressed={diet === k} onClick={() => setDiet(diet === k ? '' : k)} style={chipBtn(diet === k)}>{name}</button>)}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }} aria-label="Allergens to avoid">
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-tertiary)' }}>Avoid</span>
              {Object.entries(data.allergens).map(([k, name]) => <button key={k} type="button" aria-pressed={avoid.includes(k)} onClick={() => setAvoid((xs) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k]))} style={chipBtn(avoid.includes(k))}>{name}</button>)}
            </div>
            {hidden > 0 && <p role="status" data-testid="hidden-count" style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{hidden} dish{hidden === 1 ? '' : 'es'} hidden by your choices.</p>}

            {sections.map((s) => (
              <section key={s.id} style={{ marginBottom: 26 }}>
                <h2 style={{ margin: '0 0 4px', fontSize: '1.15rem', fontWeight: 800 }}>{s.name}</h2>
                {s.description && <p style={{ margin: '0 0 10px', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>{s.description}</p>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>{s.dishes.map((d) => <DishCard key={d.id} d={d} avoid={avoid} data={data} ordering={ordering} onAdd={addDish} />)}</div>
              </section>
            ))}
            {menu && sections.length === 0 && <p style={{ color: 'var(--text-tertiary)' }}>Nothing here matches your choices.</p>}
            {data.note && <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: 24 }} data-testid="allergen-note">{data.note}</p>}
          </>
        )}
      </main>
      {ordering && basket.count > 0 && (
        <button type="button" data-testid="basket-bar" onClick={() => setCheckout(true)} style={{ position: 'fixed', left: '50%', bottom: 18, transform: 'translateX(-50%)', zIndex: 60, display: 'inline-flex', alignItems: 'center', gap: 10, padding: '12px 22px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))', boxShadow: '0 6px 24px rgba(0,0,0,0.25)' }}>
          <ShoppingBasket size={18} aria-hidden="true" /> Your order · {basket.count} item{basket.count === 1 ? '' : 's'} · {money(basket.subtotal)} + tax
        </button>
      )}
      {picking && <DishPicker dish={picking} onClose={() => setPicking(null)} onAdd={(d, o) => { basket.add(d, o); setPicking(null); }} />}
      {checkout && basket.count > 0 && <OrderCheckout basket={basket} onClose={() => setCheckout(false)} />}
      <Footer />
    </div>
  );
}
