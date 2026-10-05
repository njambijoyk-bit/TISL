import { useMemo, useState } from 'react';
import ChargedInBadge from '../../../../_shared/components/common/ChargedInBadge';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  Star,
  Eye,
  Tag,
  Award,
  ChevronLeft,
  ChevronRight,
  Package,
  Sparkles,
  Heart,
  Gavel,
  Info,
} from 'lucide-react';
import useCartAdder from '../useCartAdder';
import useMoney from '../../../../_shared/hooks/useMoney';
import useWishlistStore from '../../../../_shared/store/wishlistStore';
import toast from 'react-hot-toast';
import Badge from '../../../../_shared/components/common/Badge';
import { auctionPath, productPath } from '../../../../_shared/lib/itemPath';

const BOOST_BADGE = {
  promo:        { label: 'Promo',        bg: '#f97316', text: '#fff' },
  social_proof: { label: 'Social Proof', bg: '#3b82f6', text: '#fff' },
  bundle:       { label: 'Bundle',       bg: 'var(--color-primary-400)', text: '#fff' },
  urgency:      { label: 'Urgency',      bg: '#ef4444', text: '#fff' },
  tip:          { label: 'Tip',          bg: '#10b981', text: '#fff' },
};

export default function ProductCard({ product }) {
  const navigate = useNavigate();
  const { add: addToCart, chooser } = useCartAdder();
  const { toggle, has } = useWishlistStore();
  
  const hasAuction = product?.active_auction && product.active_auction.status === 'active';
  const auction = product.active_auction || null;

  // ---------- Normalize fields ----------
  const rating = Number(product?.average_rating ?? product?.averagerating ?? product?.rating ?? 0);
  const reviewsCount = Number(product?.reviews_count ?? product?.totalreviews ?? 0);

  const isNew = Number(product?.is_new ?? product?.isnew ?? 0) === 1;
  const onSale = Number(product?.on_sale ?? product?.onsale ?? 0) === 1;
  const isFeatured = Number(product?.is_featured ?? product?.isfeatured ?? 0) === 1;

  const customBadge = product?.badge ?? null;

  const negotiableValue =
    product?.price_is_negotiable ?? product?.priceisnegotiable ?? product?.priceIsNegotiable ?? 0;
  const isPriceNegotiable = negotiableValue === true || Number(negotiableValue) === 1;

  const stockQuantityRaw = product?.stock_quantity ?? product?.stockquantity ?? null;
  const stockQuantity = stockQuantityRaw == null ? null : Number(stockQuantityRaw);

  const inStock = useMemo(() => {
    if (stockQuantity != null && !Number.isNaN(stockQuantity)) return stockQuantity > 0;
    return Boolean(product?.in_stock ?? product?.instock);
  }, [stockQuantity, product?.in_stock, product?.instock]);

  const price = Number(product?.price ?? 0);
  const originalPrice = product?.original_price ?? product?.originalprice ?? null;
  const originalPriceNum = originalPrice != null ? Number(originalPrice) : null;

  // Prices in the shopper's chosen currency (server-converted display_price)
  const money = useMoney();
  const priceText = money.price(product);
  const originalText = money.originalPrice({ ...product, original_price: originalPrice });

  const images = useMemo(
    () => [product?.main_image_url, ...(product?.additional_images || [])].filter(Boolean),
    [product?.main_image_url, product?.additional_images]
  );

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageError, setImageError] = useState(false);
  const hasMultipleImages = images.length > 1;

  const wished = Boolean(product?.id) ? has(product.id) : false;

  const handleAddToCart = (e) => {
    e.stopPropagation();
    if (!inStock) { toast.error('Product is out of stock'); return; }
    addToCart(product, 1);
  };

  const handleBuyNow = (e) => {
    e.stopPropagation();
    if (!inStock) { toast.error('Product is out of stock'); return; }
    addToCart(product, 1).then((ok) => { if (ok) navigate('/cart'); });
  };

  const handleViewProduct = () => navigate(productPath(product));

  const handleToggleWishlist = (e) => {
    e.stopPropagation();
    if (!product?.id) return;
    toggle(product.id);
    toast.success(wished ? 'Removed from wishlist' : 'Added to wishlist');
  };

  const nextImage = (e) => {
    e.stopPropagation();
    if (!images.length) return;
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
    setImageError(false);
  };

  const prevImage = (e) => {
    e.stopPropagation();
    if (!images.length) return;
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
    setImageError(false);
  };

  const goToImage = (index, e) => {
    e.stopPropagation();
    setCurrentImageIndex(index);
    setImageError(false);
  };

  return (
    <div
      className="product-card group rounded-lg shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden cursor-pointer w-full"
      onClick={handleViewProduct}
      style={{
        background: 'var(--surface-card, #fff)', color: 'var(--text-primary)', border: '1px solid var(--line)',
        ...(product.boost_badge_type ? { borderLeft: `3px solid ${BOOST_BADGE[product.boost_badge_type]?.bg ?? '#10b981'}` } : {}),
      }}
    >
      {/* Image Section */}
      <div className="relative aspect-square overflow-hidden bg-gray-100 dark:bg-gray-700">

        {/* Badges */}
        <div className="absolute top-2 left-2 z-40 flex flex-col gap-2 pointer-events-none">
          {hasAuction   && <div className="pointer-events-auto"><Badge variant="danger"  size="sm" className="shadow-lg gap-1.5 animate-pulse">🔴 LIVE AUCTION</Badge></div>}
          {customBadge  && <div className="pointer-events-auto"><Badge variant="info"    size="sm" className="shadow-lg">{customBadge}</Badge></div>}
          {product.expiry_badge && <div className="pointer-events-auto"><Badge variant="warning" size="sm" className="shadow-lg">{product.clearance_percent ? `Clearance −${Math.round(product.clearance_percent)}% · ` : ''}Expires {new Date(product.expiry_badge).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</Badge></div>}
          {isNew        && <div className="pointer-events-auto"><Badge variant="success" size="sm" className="shadow-lg gap-1.5"><Sparkles size={10} />New Arrival</Badge></div>}
          {onSale       && <div className="pointer-events-auto"><Badge variant="danger"  size="sm" className="shadow-lg gap-1.5"><Tag size={10} />On Sale</Badge></div>}
          {isFeatured   && <div className="pointer-events-auto"><Badge variant="primary" size="sm" className="shadow-lg gap-1.5"><Star size={10} />Featured</Badge></div>}
          {!inStock && !hasAuction && <div className="pointer-events-auto"><Badge variant="danger" size="sm" className="shadow-lg">Out of Stock</Badge></div>}
        </div>
        {/* Boost strip — bottom of image */}
        {product.boost_message && product.boost_badge_type && (() => {
          const badge = BOOST_BADGE[product.boost_badge_type] ?? BOOST_BADGE.tip;
          return (
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30,
              background: badge.bg, padding: '4px 10px',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{
                fontSize: 9, fontWeight: 800, color: badge.text,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                background: 'rgba(255,255,255,0.2)',
                padding: '1px 5px', borderRadius: 3, flexShrink: 0,
              }}>
                {badge.label}
              </span>
              <span style={{
                fontSize: 11, color: badge.text, fontWeight: 500,
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
              }}>
                {product.boost_message}
              </span>
            </div>
          );
        })()}

        {/* Main image */}
        {!imageError && images[currentImageIndex] ? (
          <img
            src={images[currentImageIndex]}
            alt={product?.name ?? 'Product'}
            className="absolute inset-0 z-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="absolute inset-0 z-0 w-full h-full flex items-center justify-center">
            <Package className="w-16 h-16 text-gray-400" />
          </div>
        )}

        {/* Nav arrows */}
        {hasMultipleImages && !imageError && (
          <>
            <button onClick={prevImage} className="image-nav-btn absolute left-2 top-1/2 -translate-y-1/2 z-40 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Previous image" type="button"><ChevronLeft size={20} /></button>
            <button onClick={nextImage} className="image-nav-btn absolute right-2 top-1/2 -translate-y-1/2 z-40 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Next image" type="button"><ChevronRight size={20} /></button>
          </>
        )}

        {/* Dot indicators */}
        {hasMultipleImages && !imageError && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-40 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {images.map((_, index) => (
              <button key={index} onClick={(e) => goToImage(index, e)} className={`image-indicator ${index === currentImageIndex ? 'active' : ''}`} aria-label={`Go to image ${index + 1}`} type="button" />
            ))}
          </div>
        )}

        {/* Top-right controls */}
        <div className="quick-view-controls">
          <button
            onClick={(e) => { e.stopPropagation(); handleViewProduct(); }}
            className="quick-view-btn"
            aria-label="Quick view"
            type="button"
          >
            <Eye size={18} />
          </button>

          {/* Wishlist */}
          <button
            onClick={handleToggleWishlist}
            aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'}
            title={wished ? 'Remove from wishlist' : 'Add to wishlist'}
            type="button"
            style={{
              padding: '0.5rem', borderRadius: '9999px', border: 'none', cursor: 'pointer',
              transition: 'all 200ms', display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: wished ? 'color-mix(in srgb, var(--color-primary-500) 15%, transparent)' : 'white',
              boxShadow: wished ? '0 0 0 1.5px color-mix(in srgb, var(--color-primary-500) 35%, transparent)' : 'none',
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = wished ? 'color-mix(in srgb, var(--color-primary-500) 25%, transparent)' : 'color-mix(in srgb, var(--color-primary-500) 5%, var(--bg-card))'; e.currentTarget.style.transform = 'scale(1.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = wished ? 'color-mix(in srgb, var(--color-primary-500) 15%, transparent)' : 'white'; e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <Heart size={18} style={{ color: 'var(--color-primary-500)', fill: wished ? 'var(--color-primary-500)' : 'none', transition: 'fill 150ms ease' }} />
          </button>

          
        <p className="collapsed-name">
          {product.boost_badge_type && (() => {
            const badge = BOOST_BADGE[product.boost_badge_type] ?? BOOST_BADGE.tip;
            return (
              <span style={{
                marginLeft: 6, fontSize: 8, fontWeight: 800,
                textTransform: 'uppercase', letterSpacing: '0.07em',
                background: badge.bg, color: badge.text,
                padding: '1px 5px', borderRadius: 3,
                verticalAlign: 'middle',
              }}>
                {badge.label}
              </span>
            );
          })()}
        </p>
        </div>
      </div>

      {/* Product Info */}
      <div className="p-4">
        {/* Category & Brand */}
        <div className="flex items-center gap-2 mb-2 text-xs text-gray-500 dark:text-gray-400">
          {product?.category && (
            <span className="flex items-center gap-1">
              <Tag size={12} style={{ color: '#3c57f0' }}/>
              {typeof product.category === 'object' ? product.category.name : product.category}
            </span>
          )}
          {product?.brand && product?.category && <span>•</span>}
          {product?.brand && (
            <span className="flex items-center gap-1">
              <Award size={12} style={{ color: '#fb3ccb' }} />
              {typeof product.brand === 'object' ? product.brand.name : product.brand}
            </span>
          )}
        </div>

        {product?.sku && (
          <span className="flex items-center text-xs gap-1" style={{ color: '#4b5563' }}>
            <Info size={12} />
            SKU: {product?.sku}
          </span>
        )}
        {/* Name */}
        <h3 className="text-sm font-semibold text-primary mb-2 line-clamp-2 min-h-[2.5rem]">
          {product?.name}
        </h3>

        {/* Rating */}
        {rating > 0 && (
          <div className="flex items-center gap-1 mb-2">
            <div className="flex items-center">
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={14} className={i < Math.floor(rating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 dark:text-gray-600'} />
              ))}
            </div>
            <span className="text-xs text-gray-600 dark:text-gray-400">({reviewsCount})</span>
          </div>
        )}

        {/* Price */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg font-bold text-primary">
            {priceText}
          </span>
          <ChargedInBadge />
          {originalText && (
            <span className="text-sm text-secondary line-through">{originalText}</span>
          )}
          {isPriceNegotiable && (
            <span className="mt-1 text-xs font-medium text-primary">Negotiable</span>
          )}
        </div>

        {/* Stock */}
        <div className="text-xs mb-3">
          {inStock ? (
            <span style={{ color: stockQuantity == null || stockQuantity > 10 ? '#16a34a' : '#d97706' }}>
              {stockQuantity == null || stockQuantity > 10 ? '✓ In Stock' : `⚠ Only ${stockQuantity} left`}
            </span>
          ) : (
            <span style={{ color: '#dc2626' }}>✕ Out of Stock</span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {hasAuction ? (
            <button 
              onClick={(e) => { e.stopPropagation(); navigate(auctionPath(auction, product)); }} 
              className="auction-btn flex-1 py-2 px-4 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2"
              type="button"
            >
              <Gavel size={16} /> Place Bid
            </button>
          ) : (
            <>
              {inStock && (
                <button onClick={handleAddToCart} className="add-to-cart-btn flex-1 py-2 px-4 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2" type="button">
                  <ShoppingCart size={16} />
                  Add to Cart
                </button>
              )}
              {!isPriceNegotiable && inStock && (
                <button onClick={handleBuyNow} className="buy-now-btn flex-1 py-2 px-4 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2" type="button">
                  Buy Now
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {chooser}
      <style>{`
        .product-card:hover { transform: translateY(-4px); }

        .image-nav-btn {
          background-color: rgba(255,255,255,0.9); color: #374151;
          padding: 0.5rem; border-radius: 9999px; backdrop-filter: blur(4px);
          transition: all 200ms; border: none;
        }
        .image-nav-btn:hover { background-color: white; color: var(--color-primary-500); transform: scale(1.1); }
        .dark .image-nav-btn { background-color: rgba(31,41,55,0.9); color: #d1d5db; }
        .dark .image-nav-btn:hover { background-color: #1f2937; color: var(--color-primary-300); }

        .image-indicator {
          width: 8px; height: 8px; border-radius: 9999px;
          background-color: rgba(255,255,255,0.6); transition: all 200ms; border: none; padding: 0;
        }
        .image-indicator:hover { background-color: rgba(255,255,255,0.8); transform: scale(1.2); }
        .image-indicator.active { background-color: white; width: 24px; }
        .dark .image-indicator { background-color: rgba(156,163,175,0.6); }
        .dark .image-indicator.active { background-color: var(--color-primary-300); }

        .quick-view-controls {
          position: absolute; top: 8px; right: 8px; z-index: 50;
          display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
          pointer-events: auto;
        }
        .quick-view-btn {
          background-color: white; color: #374151; padding: 0.5rem;
          border-radius: 9999px; transition: all 200ms; border: none;
          display: flex; align-items: center; justify-content: center;
        }
        .quick-view-btn:hover { background-color: color-mix(in srgb, var(--color-primary-500) 4%, var(--bg-primary)); color: var(--color-primary-500); transform: scale(1.1); }
        .dark .quick-view-btn { background-color: #1f2937; color: #d1d5db; }
        .dark .quick-view-btn:hover { background-color: #374151; color: var(--color-primary-300); }

        .auction-btn { background-color: rgba(220,38,38,0.1); color: #dc2626; border: 1px solid rgba(220,38,38,0.4); font-weight: 700; }
        .auction-btn:hover { background-color: #dc2626; color: white; border-color: #dc2626; transform: translateY(-1px); }
        .dark .auction-btn { background-color: rgba(220,38,38,0.15); color: #f87171; border-color: rgba(248,113,113,0.4); }
        .dark .auction-btn:hover { background-color: #dc2626; color: white; }
        
        .add-to-cart-btn { background-color: var(--color-primary-500); color: white; border: none; }
        .add-to-cart-btn:hover:not(:disabled) { background-color: white; color: var(--color-primary-600); border: 1px solid var(--color-primary-600); transform: translateY(-1px); box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
        .add-to-cart-btn:disabled { background-color: #e5e7eb; color: #9ca3af; cursor: not-allowed; }
        .dark .add-to-cart-btn:disabled { background-color: #374151; color: #6b7280; }

        .buy-now-btn { background-color: white; color: var(--color-primary-600); border: 1px solid var(--color-primary-600); }
        .buy-now-btn:hover:not(:disabled) { background-color: var(--color-primary-500); color: white; transform: translateY(-1px); box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.12); }
        .buy-now-btn:disabled { background-color: #e5e7eb; color: #9ca3af; cursor: not-allowed; }
        .dark .buy-now-btn:disabled { background-color: #374151; color: #6b7280; }

      `}</style>
    </div>
  );
}