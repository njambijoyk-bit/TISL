import { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  Tag, Zap, Clock, Sparkles, ArrowRight, Gavel, FileText,
  ShoppingCart, Heart, Star, Package, Wrench, ChevronRight,
  ChevronLeft, Flame, TrendingUp, BadgePercent, Truck, Award, Wand2,
  LayoutGrid, Images,
} from 'lucide-react';
import ClockDialHero from './ClockDialHero';
import SpecialsPolaroidCard from './SpecialsPolaroidCard';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import useProductStore from '../../store/productStore';
import auctionsAPI from '../../api/auctions';
import useServiceStore from '../../store/serviceStore';
import useCartStore from '../../store/cartStore';
import useWishlistStore from '../../store/wishlistStore';
import toast from 'react-hot-toast';
import CollapsedProductCard from '../../components/products/CollapsedProductCard';
import AuctionCard from '../../components/products/AuctionCard';
import CollapsedServiceCard from '../../components/services/CollapsedServiceCard';

function useCountdown() {
  const [time, setTime] = useState({ h: 0, m: 0, s: 0 });
  useEffect(() => {
    const getMidnight = () => {
      const d = new Date();
      d.setHours(24, 0, 0, 0);
      return d.getTime();
    };
    const tick = () => {
      const diff = Math.max(0, getMidnight() - Date.now());
      setTime({
        h: Math.floor(diff / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

const CollapsedSkeleton = () => (
  <div className="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse">
    <div className="rounded-lg bg-zinc-800 flex-shrink-0" style={{ width: 52, height: 52 }} />
    <div className="flex-1 space-y-2">
      <div className="h-3 bg-zinc-800 rounded w-3/4" />
      <div className="h-2.5 bg-zinc-800 rounded w-1/2" />
    </div>
    <div className="flex flex-col items-end gap-2 flex-shrink-0">
      <div className="h-3 bg-zinc-800 rounded w-20" />
      <div className="h-6 bg-zinc-800 rounded-full w-14" />
    </div>
  </div>
);

function ViewToggle({ fun, onToggle, accent = '#a855f7' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2,
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10, padding: 3,
    }}>
      {[
        { mode: false, Icon: LayoutGrid, label: 'List view' },
        { mode: true,  Icon: Images,     label: 'Fun view'  },
      ].map(({ mode, Icon, label }) => (
        <button
          key={label}
          onClick={() => onToggle(mode)}
          title={label}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: 7, border: 'none', cursor: 'pointer',
            transition: 'all 0.2s',
            background: fun === mode ? `${accent}33` : 'transparent',
            color: fun === mode ? accent : 'rgba(255,255,255,0.35)',
            boxShadow: fun === mode ? `0 0 8px ${accent}55` : 'none',
          }}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}

function SectionHead({ eyebrow, title, subtitle, cta, ctaLink, accent = '#a855f7', icon: Icon, fun, onToggle }) {
  const eyebrowColor = accent + 'cc';
  return (
    <div className="flex items-end justify-between mb-6 gap-4">
      <div>
        <p style={{ color: eyebrowColor, textShadow: `0 0 10px ${accent}66` }}
           className="text-[10px] font-black uppercase tracking-[0.2em] mb-2">
          {eyebrow}
        </p>
        <h2
          className="text-2xl lg:text-3xl font-black leading-tight flex items-center gap-3"
          style={{ color: accent, textShadow: `0 0 18px ${accent}88, 0 0 40px ${accent}44` }}
        >
          {Icon && <Icon size={22} />}
          {title}
        </h2>
        {subtitle && <p className="text-sm text-zinc-400 mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {onToggle && <ViewToggle fun={fun} onToggle={onToggle} accent={accent} />}
        {cta && ctaLink && (
          <Link
            to={ctaLink}
            style={{ color: accent, textShadow: `0 0 8px ${accent}66` }}
            className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider hover:gap-2 transition-all"
          >
            {cta} <ChevronRight size={13} />
          </Link>
        )}
      </div>
    </div>
  );
}

function FlashBanner({ countdown }) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
      gap: '16px', marginBottom: '24px', padding: '20px 24px',
      background: 'linear-gradient(135deg, rgba(168,85,247,0.12) 0%, rgba(139,92,246,0.08) 100%)',
      border: '1px solid rgba(168,85,247,0.25)', borderRadius: '16px',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: '-40px', left: '-40px', width: '180px', height: '180px', background: 'radial-gradient(circle, rgba(168,85,247,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0, background: 'linear-gradient(135deg, #a855f7, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(168,85,247,0.4)' }}>
          <Clock size={18} color="white" />
        </div>
        <div>
          <p style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#c084fc', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Zap size={9} /> Flash Sale
          </p>
          <p style={{ fontSize: '1rem', fontWeight: 900, margin: 0 }}>Limited Time Deals</p>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', position: 'relative' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, color: '#c084fc', paddingBottom: '18px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Resets in</span>
        {[{ v: countdown.h, l: 'HRS' }, { v: countdown.m, l: 'MIN' }, { v: countdown.s, l: 'SEC' }].map(({ v, l }, i) => (
          <div key={l} style={{ display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
            {i > 0 && <span style={{ color: '#a855f7', fontWeight: 900, fontSize: '1.4rem', lineHeight: 1, paddingBottom: '18px' }}>:</span>}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '44px', height: '44px', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(168,85,247,0.45)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(168,85,247,0.2), inset 0 1px 0 rgba(168,85,247,0.15)' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#e9d5ff', fontVariantNumeric: 'tabular-nums' }}>{String(v).padStart(2, '0')}</span>
              </div>
              <span style={{ fontSize: '8px', fontWeight: 700, color: 'rgba(192,132,252,0.6)', marginTop: '4px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{l}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty({ icon: Icon, message, sub, cta, ctaLink }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-zinc-600">
      <Icon size={36} className="mb-3 opacity-30" />
      <p className="text-sm">{message}</p>
      {sub && <p className="text-xs text-zinc-700 mt-1">{sub}</p>}
      {cta && ctaLink && (
        <Link to={ctaLink} className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-purple-400 hover:text-purple-300 transition-colors">
          {cta} <ArrowRight size={12} />
        </Link>
      )}
    </div>
  );
}

function WishlistSection() {
  const { ids, items, loading, fetchWishlistItems } = useWishlistStore();
  useEffect(() => { if (ids.length > 0) fetchWishlistItems(); }, []); // eslint-disable-line
  if (ids.length === 0) return null;
  return (
    <section>
      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5" style={{ color: '#fb3ccb' }}><Wand2 size={10} /> Your Picks</p>
          <h2 className="text-2xl lg:text-3xl font-black leading-tight flex items-center gap-3" style={{ color: '#fb3ccb' }}><Heart size={22} className="fill-pink-400" /> What You Like</h2>
          <p className="text-sm text-zinc-400 mt-1">{ids.length} item{ids.length !== 1 ? 's' : ''} saved to your wishlist</p>
        </div>
        <Link to="/wishlist" className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider hover:gap-2 transition-all" style={{ color: '#fb3ccb' }}>View all <ChevronRight size={13} /></Link>
      </div>
      <div className="flex gap-5">
        <div className="w-1 rounded-full bg-gradient-to-b from-pink-400 via-pink-400/40 to-transparent flex-shrink-0" />
        <div className="flex-1">
          {loading
            ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>{Array.from({ length: Math.min(ids.length, 6) }).map((_, i) => <CollapsedSkeleton key={i} />)}</div>
            : items.length > 0
              ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>{items.map((p) => <CollapsedProductCard key={p.id} product={p} />)}</div>
              : <Empty icon={Heart} message="Couldn't load your saved items." sub="They may have been removed or are temporarily unavailable." />
          }
        </div>
      </div>
    </section>
  );
}

function CartSection() {
  const navigate = useNavigate();
  const { items, removeItem, clearCart } = useCartStore();
  const cartProducts = (items || []).map((entry) => ({ product: entry.product ?? entry, quantity: entry.quantity ?? 1 }));
  if (cartProducts.length === 0) return null;
  const totalItems = cartProducts.reduce((sum, { quantity }) => sum + quantity, 0);
  return (
    <section>
      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5" style={{ color: '#fb923c' }}><ShoppingCart size={10} /> Your Cart</p>
          <h2 className="text-2xl lg:text-3xl font-black leading-tight flex items-center gap-3" style={{ color: '#fb923c' }}><ShoppingCart size={22} style={{ color: '#fb923c' }} /> Want to Clear Your Cart?</h2>
          <p className="text-sm text-zinc-400 mt-1">{totalItems} item{totalItems !== 1 ? 's' : ''} waiting — head to checkout or remove what you don't need</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button type="button" onClick={() => { clearCart(); toast.success('Cart cleared'); }} style={{ background: 'rgba(251,60,60,0.15)', border: '1px solid rgba(251,60,60,0.35)', color: '#fb3c3c', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(251,60,60,0.25)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(251,60,60,0.15)'}>Clear all</button>
          <button type="button" onClick={() => navigate('/cart')} style={{ background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.35)', color: '#fb923c', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(251,146,60,0.25)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(251,146,60,0.15)'}>Checkout <ArrowRight size={12} /></button>
        </div>
      </div>
      <div className="flex gap-5">
        <div className="w-1 rounded-full bg-gradient-to-b from-orange-400 via-orange-400/40 to-transparent flex-shrink-0" />
        <div className="flex-1">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>
            {cartProducts.map(({ product, quantity }) => <CartProductRow key={product.id} product={product} quantity={quantity} onRemove={() => removeItem(product.id)} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

function AuctionSection() {
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const res = await auctionsAPI.getAllAuctions({ status: 'active', page: 1, per_page: 4 });
        setAuctions(res.data || []);
      } catch { setAuctions([]); } finally { setLoading(false); }
    };
    fetch();
  }, []);
  return (
    <section>
      <div className="flex items-end justify-between mb-6 gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5" style={{ color: '#dc2626' }}><Gavel size={10} className="animate-pulse" /> Live Bidding</p>
          <h2 className="text-2xl lg:text-3xl font-black leading-tight" style={{ color: '#dc2626' }}>Hot Auctions</h2>
          <p className="text-sm text-zinc-400 mt-1">Bid before time runs out — prices update in real-time</p>
        </div>
        <Link to="/auctions" className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-red-400 hover:gap-2 transition-all">View all <ChevronRight size={13} /></Link>
      </div>
      <div className="flex gap-5">
        <div className="w-1 rounded-full bg-gradient-to-b from-red-500 via-red-500/40 to-transparent flex-shrink-0" />
        <div className="flex-1">
          {loading
            ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>{Array.from({ length: 4 }).map((_, i) => <CollapsedSkeleton key={i} />)}</div>
            : auctions.length > 0
              ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>{auctions.map((a) => <div key={a.id} className="bg-zinc-900/50 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(168,85,247,0.2)' }}><AuctionCard auction={a} /></div>)}</div>
              : <Empty icon={Gavel} message="No active auctions right now." sub="Check back soon or browse our regular products." cta="Browse Products" ctaLink="/products" />
          }
        </div>
      </div>
    </section>
  );
}

function CartProductRow({ product, quantity, onRemove }) {
  const navigate = useNavigate();
  const [imageError, setImageError] = useState(false);
  const price = Number(product?.price ?? 0);
  const imageUrl = product?.main_image_url ?? product?.main_image ?? null;
  const description = product?.short_description ?? product?.description ?? '';
  return (
    <div onClick={() => navigate(`/products/${product?.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.18)', borderRadius: 12, cursor: 'pointer', transition: 'box-shadow 150ms ease, transform 150ms ease', width: '100%', position: 'relative' }} onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(251,146,60,0.15)'; e.currentTarget.style.transform = 'translateY(-1px)'; }} onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}>
      <div style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 10, overflow: 'hidden', background: '#27272a', position: 'relative' }}>
        {!imageError && imageUrl ? <img src={imageUrl} alt={product?.name ?? 'Product'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setImageError(true)} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Package size={22} style={{ color: '#52525b' }} /></div>}
        {quantity > 1 && <div style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#fb923c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, color: '#fff', border: '1.5px solid #18181b' }}>{quantity}</div>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '0.825rem', fontWeight: 600, color: '#fb923c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: '0 0 2px', lineHeight: 1.3 }}>{product?.name}</p>
        {description ? <p style={{ fontSize: '0.72rem', color: '#71717a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0, lineHeight: 1.4 }}>{description}</p> : null}
      </div>
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fb923c', whiteSpace: 'nowrap' }}>KSh {(price * quantity).toLocaleString()}</span>
        {quantity > 1 && <span style={{ fontSize: '0.65rem', color: '#71717a', whiteSpace: 'nowrap' }}>{quantity} × KSh {price.toLocaleString()}</span>}
        <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); toast.success(`${product?.name} removed from cart`); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '4px 9px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#f87171', transition: 'all 150ms ease', whiteSpace: 'nowrap' }} onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#ef4444'; }} onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; }}>Remove</button>
      </div>
    </div>
  );
}

// Polaroid grid wrapper — looser columns so cards have room to breathe + rotate
function PolaroidGrid({ products, type }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
      gap: '40px 24px',
      padding: '24px 0 32px',
    }}>
      {products.map((p, i) => (
        <SpecialsPolaroidCard key={p.id} product={p} type={type} index={i} />
      ))}
    </div>
  );
}

export default function SpecialsPage() {
  const countdown = useCountdown();

  const [funDeals,    setFunDeals]    = useState(false);
  const [funFeatured, setFunFeatured] = useState(false);
  const [funNew,      setFunNew]      = useState(false);
  const [funServices, setFunServices] = useState(false);

  const {
    fetchFeaturedProducts, fetchOnSaleProducts, fetchNewArrivals,
    featuredProducts, onSaleProducts, newArrivals,
    loadingFeatured, loadingOnSale, loadingNewArrivals,
  } = useProductStore();

  const { fetchFeaturedServices, featuredServices, loadingFeatured: serviceLoading } = useServiceStore();

  useEffect(() => {
    fetchFeaturedProducts();
    fetchOnSaleProducts();
    fetchNewArrivals();
    fetchFeaturedServices();
  }, []);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    return () => document.documentElement.classList.remove('dark');
  }, []);

  const carouselSlides = (() => {
    const seen = new Set();
    const tagged = (arr, type) =>
      arr.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; }).map((p) => ({ ...p, _type: type }));
    return [
      ...tagged(onSaleProducts.slice(0, 3),   'deal'),
      ...tagged(featuredProducts.slice(0, 3),  'featured'),
      ...tagged(newArrivals.slice(0, 2),       'new'),
    ];
  })();

  const heroLoading    = loadingOnSale && loadingFeatured && loadingNewArrivals;
  const dealsToShow    = onSaleProducts.length > 0 ? onSaleProducts.slice(0, 8) : featuredProducts.slice(0, 8);
  const dealsAreOnSale = onSaleProducts.length > 0;

  const isPageLoading = loadingOnSale || loadingFeatured || loadingNewArrivals || serviceLoading;
  if (isPageLoading) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <LoadingSpinner fullScreen />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Helmet>
        <title>Specials & Deals — TISL Store</title>
        <meta name="description" content="Shop the latest deals and special offers at TISL Store. Limited time discounts on top products in Nairobi." />
        <meta property="og:title" content="Specials & Deals — TISL Store" />
        <meta property="og:type" content="website" />
      </Helmet>
      <Header />


      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16 space-y-24">
        <ClockDialHero slides={carouselSlides} countdown={countdown} loading={heroLoading} />

        {/* Flash sale deals */}
        <section>
          <FlashBanner countdown={countdown} />
          <SectionHead
            eyebrow="Limited Time" title="Flash Deals"
            subtitle={dealsAreOnSale ? 'Products currently on sale' : 'Hand-picked deals for you'}
            accent="#f87171"
            fun={funDeals} onToggle={setFunDeals}
          />
          {loadingOnSale
            ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>{Array.from({ length: 8 }).map((_, i) => <CollapsedSkeleton key={i} />)}</div>
            : dealsToShow.length > 0
              ? funDeals
                ? <PolaroidGrid products={dealsToShow} type="deal" />
                : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>{dealsToShow.map((p) => <CollapsedProductCard key={p.id} product={p} badge={dealsAreOnSale ? 'Sale' : 'Featured'} badgeColor={dealsAreOnSale ? 'red' : 'yellow'} theme="dark" />)}</div>
              : <Empty icon={Tag} message="No deals right now — check back soon." />
          }
        </section>

        <WishlistSection />
        <CartSection />

        {/* Featured products */}
        <section>
          <SectionHead
            eyebrow="Hand-picked" title="Featured Products"
            subtitle="Top-rated industrial tools selected for quality and value"
            cta="View all" ctaLink="/products?featured=true"
            accent="#a855f7"
            fun={funFeatured} onToggle={setFunFeatured}
          />
          {loadingFeatured
            ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>{Array.from({ length: 8 }).map((_, i) => <CollapsedSkeleton key={i} />)}</div>
            : featuredProducts.length > 0
              ? funFeatured
                ? <PolaroidGrid products={featuredProducts.slice(0, 8)} type="featured" />
                : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>{featuredProducts.slice(0, 8).map((p) => <CollapsedProductCard key={p.id} product={p} badge="Featured" badgeColor="yellow" theme="dark" />)}</div>
              : <Empty icon={Package} message="No featured products yet." />
          }
        </section>

        <AuctionSection />

        {/* New arrivals */}
        <section>
          <div className="flex gap-5">
            <div className="w-1 rounded-full bg-gradient-to-b from-emerald-400 via-emerald-400/40 to-transparent flex-shrink-0" />
            <div className="flex-1">
              <SectionHead
                eyebrow="Just In" title="New Arrivals"
                subtitle="Fresh stock added to our catalogue — be the first to order"
                cta="Browse all" ctaLink="/products?is_new=true"
                accent="#34d399"
                fun={funNew} onToggle={setFunNew}
              />
              {loadingNewArrivals
                ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>{Array.from({ length: 6 }).map((_, i) => <CollapsedSkeleton key={i} />)}</div>
                : newArrivals.length > 0
                  ? funNew
                    ? <PolaroidGrid products={newArrivals.slice(0, 6)} type="new" />
                    : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>{newArrivals.slice(0, 6).map((p) => <CollapsedProductCard key={p.id} product={p} badge="New" badgeColor="green" theme="dark" />)}</div>
                  : <Empty icon={Sparkles} message="No new arrivals yet." />
              }
            </div>
          </div>
        </section>

        {/* Featured services — services don't have a polaroid type so toggle hidden */}
        <section>
          <SectionHead
            eyebrow="Save More" title="Featured Services"
            subtitle="Expert services for your industrial and construction needs"
            cta="All services" ctaLink="/services"
            accent="#38bdf8"
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>
            {serviceLoading
              ? Array.from({ length: 4 }).map((_, i) => <CollapsedSkeleton key={i} />)
              : featuredServices.length > 0
                ? featuredServices.slice(0, 8).map((service) => <CollapsedServiceCard key={service.id} service={service} />)
                : <Empty icon={Wrench} message="No featured services yet." cta="Browse all services" ctaLink="/services" />
            }
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="mt-16 lg:mt-24">
          <div className="relative rounded-2xl overflow-hidden group" style={{ border: '1.5px solid rgba(168, 85, 247, 0.5)', boxShadow: '0 0 24px rgba(168, 85, 247, 0.18)', transition: 'all 0.3s ease-out' }} onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.8)'; e.currentTarget.style.boxShadow = '0 0 36px rgba(168, 85, 247, 0.35)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.5)'; e.currentTarget.style.boxShadow = '0 0 24px rgba(168, 85, 247, 0.18)'; }}>
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800" />
            <div className="absolute -top-20 -right-20 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-purple-500/20 transition-all duration-500" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-purple-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-purple-500/15 transition-all duration-500" />
            <div className="relative px-8 py-14 lg:px-16 lg:py-20 text-center">
              <h2 className="text-3xl lg:text-5xl font-black text-primary mb-5 leading-[1.05]">Can't find what you're looking for?</h2>
              <p className="text-zinc-400 text-sm max-w-md mx-auto mb-10 leading-relaxed">Send us a quote request and we'll respond within <span className="text-purple-400 font-semibold">24 hours</span>.</p>
              <div className="flex flex-wrap gap-4 justify-center">
                <Link to="/request-quote" className="inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 text-white font-black rounded-lg text-sm transition-all duration-200 shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 hover:-translate-y-0.5">Request a Quote <ArrowRight size={15} /></Link>
                <Link to="/products" className="inline-flex items-center gap-2 px-8 py-3.5 border border-purple-500/40 hover:border-purple-400/70 text-zinc-300 hover:text-purple-300 font-semibold rounded-lg text-sm transition-all duration-200 bg-zinc-900/50 hover:bg-zinc-900/80 hover:-translate-y-0.5">Browse Catalogue</Link>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-6 mt-10 pt-8">
                {[{ icon: Truck, text: 'Nationwide Delivery' }, { icon: BadgePercent, text: 'Price Match Guarantee' }, { icon: Award, text: 'Verified Suppliers' }].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-2 text-xs text-zinc-400"><Icon size={14} className="text-primary" /><span>{text}</span></div>
                ))}
              </div>
            </div>
          </div>
        </section>

      </div>
      <Footer />
    </div>
  );
}