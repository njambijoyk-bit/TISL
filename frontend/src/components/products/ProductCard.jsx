import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  Star,
  Eye,
  Tag,
  Award,
  FileText,
  ChevronLeft,
  ChevronRight,
  Package,
  Sparkles,
  Heart,
} from 'lucide-react';
import useCartStore from '../../store/cartStore';
import useWishlistStore from '../../store/wishlistStore';
import useQuoteListStore from '../../store/quoteListStore';
import toast from 'react-hot-toast';
import Badge from '../common/Badge';

export default function ProductCard({ product }) {
  const navigate = useNavigate();
  const { addItem } = useCartStore();
  const { toggle, has } = useWishlistStore();
  const { addItem: addToQuoteList, has: inQuoteList } = useQuoteListStore();

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

  const images = useMemo(
    () => [product?.main_image_url, ...(product?.additional_images || [])].filter(Boolean),
    [product?.main_image_url, product?.additional_images]
  );

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageError, setImageError] = useState(false);
  const hasMultipleImages = images.length > 1;

  const wished = Boolean(product?.id) ? has(product.id) : false;
  const inQL   = Boolean(product?.id) ? inQuoteList(product.id) : false;

  const handleAddToCart = (e) => {
    e.stopPropagation();
    if (!inStock) { toast.error('Product is out of stock'); return; }
    addItem(product, 1);
    toast.success(`${product?.name} added to cart!`);
  };

  const handleBuyNow = (e) => {
    e.stopPropagation();
    if (!inStock) { toast.error('Product is out of stock'); return; }
    addItem(product, 1);
    navigate('/cart');
  };

  const handleAddToQuoteList = (e) => {
    e.stopPropagation();
    if (inQL) { navigate('/quote-list'); return; }
    addToQuoteList(product, 1);
    toast.success(`${product?.name} added to quote list`, { icon: '📋' });
  };

  const handleViewProduct = () => navigate(`/products/${product?.id}`);

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
      className="product-card group bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden cursor-pointer w-full"
      onClick={handleViewProduct}
    >
      {/* Image Section */}
      <div className="relative aspect-square overflow-hidden bg-gray-100 dark:bg-gray-700">

        {/* Badges */}
        <div className="absolute top-2 left-2 z-40 flex flex-col gap-2 pointer-events-none">
          {customBadge && <div className="pointer-events-auto"><Badge variant="info" size="sm" className="shadow-lg">{customBadge}</Badge></div>}
          {isNew && <div className="pointer-events-auto"><Badge variant="success" size="sm" className="shadow-lg gap-1.5"><Sparkles className="w-4 h-4" />New Arrival</Badge></div>}
          {onSale && <div className="pointer-events-auto"><Badge variant="danger" size="sm" className="shadow-lg gap-1.5"><Tag className="w-4 h-4" />On Sale</Badge></div>}
          {isFeatured && <div className="pointer-events-auto"><Badge variant="primary" size="sm" className="shadow-lg gap-1.5"><Star className="w-4 h-4" />Featured</Badge></div>}
          {!inStock && <div className="pointer-events-auto"><Badge variant="danger" size="sm" className="shadow-lg">Out of Stock</Badge></div>}
        </div>

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
              backgroundColor: wished ? 'rgba(168,85,247,0.15)' : 'white',
              boxShadow: wished ? '0 0 0 1.5px rgba(168,85,247,0.35)' : 'none',
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = wished ? 'rgba(168,85,247,0.25)' : '#faf5ff'; e.currentTarget.style.transform = 'scale(1.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = wished ? 'rgba(168,85,247,0.15)' : 'white'; e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <Heart size={18} style={{ color: '#a855f7', fill: wished ? '#a855f7' : 'none', transition: 'fill 150ms ease' }} />
          </button>

          {/* Quote list */}
          <button
            onClick={handleAddToQuoteList}
            aria-label={inQL ? 'View quote list' : 'Add to quote list'}
            title={inQL ? 'Already in quote list — click to view' : 'Add to quote list'}
            type="button"
            style={{
              padding: '0.5rem', borderRadius: '9999px', border: 'none', cursor: 'pointer',
              transition: 'all 200ms', display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: inQL ? 'rgba(168,85,247,0.15)' : 'white',
              boxShadow: inQL ? '0 0 0 1.5px rgba(124,58,237,0.5)' : 'none',
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = inQL ? 'rgba(124,58,237,0.25)' : '#faf5ff'; e.currentTarget.style.transform = 'scale(1.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = inQL ? 'rgba(168,85,247,0.15)' : 'white'; e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <FileText size={18} style={{ color: inQL ? '#7c3aed' : '#a855f7', transition: 'color 150ms ease' }} />
          </button>
        </div>
      </div>

      {/* Product Info */}
      <div className="p-4">
        {/* Category & Brand */}
        <div className="flex items-center gap-2 mb-2 text-xs text-gray-500 dark:text-gray-400">
          {product?.category && (
            <span className="flex items-center gap-1">
              <Tag size={12} />
              {typeof product.category === 'object' ? product.category.name : product.category}
            </span>
          )}
          {product?.brand && product?.category && <span>•</span>}
          {product?.brand && (
            <span className="flex items-center gap-1">
              <Award size={12} />
              {typeof product.brand === 'object' ? product.brand.name : product.brand}
            </span>
          )}
        </div>

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
            KSh {Number.isFinite(price) ? price.toLocaleString() : '0'}
          </span>
          {originalPriceNum != null && Number.isFinite(originalPriceNum) && originalPriceNum > price && (
            <span className="text-sm text-secondary line-through">KSh {originalPriceNum.toLocaleString()}</span>
          )}
          {isPriceNegotiable && (
            <button type="button" onClick={(e) => { e.stopPropagation(); handleAddToQuoteList(e); }}
              className="mt-1 p-0 bg-transparent hover:bg-transparent border-none text-xs font-medium text-primary underline underline-offset-2"
              title="Add to quote list">
              Negotiable
            </button>
          )}
        </div>

        {/* Stock */}
        <div className="text-xs mb-3">
          {inStock ? (
            <span className={stockQuantity == null || stockQuantity > 10 ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}>
              {stockQuantity == null || stockQuantity > 10 ? '✓ In Stock' : `⚠ Only ${stockQuantity} left`}
            </span>
          ) : (
            <span className="text-red-600 dark:text-red-400">✕ Out of Stock</span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {/* Add to cart — hidden for negotiable-only, shown for all others */}
          {!isPriceNegotiable && (
            <>
              <button onClick={handleAddToCart} disabled={!inStock} className="add-to-cart-btn flex-1 py-2 px-4 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2" type="button">
                <ShoppingCart size={16} />
                Add to Cart
              </button>
              <button onClick={handleBuyNow} disabled={!inStock} className="buy-now-btn flex-1 py-2 px-4 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2" type="button">
                Buy Now
              </button>
            </>
          )}

          {/* Quote list button — always visible, full width when negotiable */}
          <button
            onClick={handleAddToQuoteList}
            className={`quote-btn py-2 px-3 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 font-medium text-sm ${isPriceNegotiable ? 'flex-1' : ''} ${inQL ? 'in-list' : ''}`}
            title={inQL ? 'In quote list — click to view' : 'Add to quote list'}
            type="button"
          >
            <FileText size={16} />
            {isPriceNegotiable ? (inQL ? 'In Quote List →' : 'Add to Quote List') : ''}
          </button>
        </div>
      </div>

      <style>{`
        .product-card:hover { transform: translateY(-4px); }

        .image-nav-btn {
          background-color: rgba(255,255,255,0.9); color: #374151;
          padding: 0.5rem; border-radius: 9999px; backdrop-filter: blur(4px);
          transition: all 200ms; border: none;
        }
        .image-nav-btn:hover { background-color: white; color: #a855f7; transform: scale(1.1); }
        .dark .image-nav-btn { background-color: rgba(31,41,55,0.9); color: #d1d5db; }
        .dark .image-nav-btn:hover { background-color: #1f2937; color: #d8b4fe; }

        .image-indicator {
          width: 8px; height: 8px; border-radius: 9999px;
          background-color: rgba(255,255,255,0.6); transition: all 200ms; border: none; padding: 0;
        }
        .image-indicator:hover { background-color: rgba(255,255,255,0.8); transform: scale(1.2); }
        .image-indicator.active { background-color: white; width: 24px; }
        .dark .image-indicator { background-color: rgba(156,163,175,0.6); }
        .dark .image-indicator.active { background-color: #d8b4fe; }

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
        .quick-view-btn:hover { background-color: #faf5ff; color: #a855f7; transform: scale(1.1); }
        .dark .quick-view-btn { background-color: #1f2937; color: #d1d5db; }
        .dark .quick-view-btn:hover { background-color: #374151; color: #d8b4fe; }

        .add-to-cart-btn { background-color: #a855f7; color: white; border: none; }
        .add-to-cart-btn:hover:not(:disabled) { background-color: white; color: #9333ea; border: 1px solid #9333ea; transform: translateY(-1px); box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
        .add-to-cart-btn:disabled { background-color: #e5e7eb; color: #9ca3af; cursor: not-allowed; }
        .dark .add-to-cart-btn:disabled { background-color: #374151; color: #6b7280; }

        .buy-now-btn { background-color: white; color: #9333ea; border: 1px solid #9333ea; }
        .buy-now-btn:hover:not(:disabled) { background-color: #a855f7; color: white; transform: translateY(-1px); box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.12); }
        .buy-now-btn:disabled { background-color: #e5e7eb; color: #9ca3af; cursor: not-allowed; }
        .dark .buy-now-btn:disabled { background-color: #374151; color: #6b7280; }

        .quote-btn { background-color: rgba(168,85,247,0.08); color: #a855f7; border: 1px solid rgba(168,85,247,0.25); }
        .quote-btn:hover { background-color: #a855f7; color: white; border-color: #a855f7; transform: translateY(-1px); }
        .quote-btn.in-list { background-color: rgba(124,58,237,0.15); color: #7c3aed; border-color: #7c3aed; font-weight: 700; }
        .quote-btn.in-list:hover { background-color: #7c3aed; color: white; }
        .dark .quote-btn { background-color: rgba(168,85,247,0.1); color: #c084fc; border-color: rgba(168,85,247,0.3); }
      `}</style>
    </div>
  );
}