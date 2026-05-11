import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Package, FileText, Heart, Gavel } from 'lucide-react';
import useCartStore from '../../store/cartStore';
import useWishlistStore from '../../store/wishlistStore';
import useQuoteListStore from '../../store/quoteListStore';
import toast from 'react-hot-toast';

export default function CollapsedProductCard({ product }) {
  const navigate = useNavigate();
  const { addItem } = useCartStore();
  const { toggle, has } = useWishlistStore();
  const { addItem: addToQuoteList, has: inQuoteList } = useQuoteListStore();
  const [imageError, setImageError] = useState(false);

  const hasAuction = product?.active_auction && product.active_auction.status === 'active';
  const auction = product?.active_auction || null;

  // ---------- Normalize fields ----------
  const price = Number(product?.price ?? 0);
  const originalPrice = product?.original_price ?? product?.originalprice ?? null;
  const originalPriceNum = originalPrice != null ? Number(originalPrice) : null;

  const negotiableValue =
    product?.price_is_negotiable ?? product?.priceisnegotiable ?? product?.priceIsNegotiable ?? 0;
  const isPriceNegotiable = negotiableValue === true || Number(negotiableValue) === 1;

  const stockQuantityRaw = product?.stock_quantity ?? product?.stockquantity ?? null;
  const stockQuantity = stockQuantityRaw == null ? null : Number(stockQuantityRaw);
  const inStock =
    stockQuantity != null && !Number.isNaN(stockQuantity)
      ? stockQuantity > 0
      : Boolean(product?.in_stock ?? product?.instock);

  const imageUrl = product?.main_image_url ?? null;
  const description =
    product?.short_description ?? product?.shortdescription ?? product?.description ?? '';

  const wished = product?.id ? has(product.id) : false;
  const inQL   = product?.id ? inQuoteList(product.id) : false;

  // ---------- Handlers ----------
  const handleAddToCart = (e) => {
    e.stopPropagation();
    if (!inStock) { toast.error('Product is out of stock'); return; }
    addItem(product, 1);
    toast.success(`${product?.name} added to cart!`);
  };

  const handleAddToQuoteList = (e) => {
    e.stopPropagation();
    if (inQL) {
      navigate('/quote-list');
      return;
    }
    addToQuoteList(product, 1);
    toast.success(`${product?.name} added to quote list`, {
      icon: '📋',
      action: { label: 'View', onClick: () => navigate('/quote-list') },
    });
  };

  const handleViewProduct = () => navigate(`/products/${product?.id}`);

  const handleToggleWishlist = (e) => {
    e.stopPropagation();
    if (!product?.id) return;
    toggle(product.id);
    toast.success(wished ? 'Removed from wishlist' : 'Added to wishlist');
  };

  // ---------- Price label ----------
  const PriceLabel = () => {
    if (!inStock) return <span className="collapsed-price out-of-stock">Out of Stock</span>;
    return (
      <div className="collapsed-price-group">
        {originalPriceNum != null && Number.isFinite(originalPriceNum) && originalPriceNum > price && (
          <span className="collapsed-original-price">KSh {originalPriceNum.toLocaleString()}</span>
        )}
        <span className="collapsed-price">KSh {price.toLocaleString()}</span>
      </div>
    );
  };

  return (
    <div className="collapsed-card" onClick={handleViewProduct}>
      {/* Full-width name banner on hover */}
      <div className="collapsed-hover-name">{product?.name}</div>
      {/* Thumbnail */}
      <div className="collapsed-thumb">
        {!imageError && imageUrl ? (
          <img src={imageUrl} alt={product?.name ?? 'Product'} className="collapsed-thumb-img" onError={() => setImageError(true)} />
        ) : (
          <div className="collapsed-thumb-placeholder"><Package size={22} className="text-gray-400" /></div>
        )}
      </div>

      {/* Info */}
      <div className="collapsed-info">
        <p className="collapsed-name">{product?.name}</p>
        {description ? <p className="collapsed-desc">{description}</p> : null}
      </div>

      {/* Right: price + buttons */}
      <div className="collapsed-right">
        {isPriceNegotiable ? null : <PriceLabel />}

        {hasAuction ? (
          <button type="button" onClick={(e) => { e.stopPropagation(); navigate(`/auctions/${auction.id}`); }} className="collapsed-action-btn auction" aria-label="Place bid">
            <Gavel size={13} /> Bid
          </button>
        ) : (
          <>
            <div className="collapsed-btn-row">
              <button type="button" onClick={handleToggleWishlist} className="collapsed-wand-btn" aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'}>
                <Heart size={13} style={{ color: '#a855f7', fill: wished ? '#a855f7' : 'none', transition: 'fill 150ms ease' }} />
              </button>
              {isPriceNegotiable ? (
                <button type="button" onClick={handleAddToQuoteList} className={`collapsed-action-btn ${inQL ? 'in-quote-list' : 'negotiable'}`}>
                  <FileText size={13} /> {inQL ? 'In List →' : 'Quote'}
                </button>
              ) : (
                <button type="button" onClick={handleAddToQuoteList} className={`collapsed-action-btn ${inQL ? 'in-quote-list' : 'quote'}`} title={inQL ? 'Already in quote list — click to view' : 'Add to quote list'}>
                  <FileText size={13} />
                </button>
              )}
            </div>
            <button type="button" onClick={handleAddToCart} disabled={!inStock} className="collapsed-action-btn primary">
              <ShoppingCart size={13} /> {inStock ? 'Add' : 'N/A'}
            </button>
          </>
        )}
      </div>

      <style>{`
        .collapsed-card {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 12px; background: white; border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.07); cursor: pointer;
          transition: box-shadow 150ms ease, transform 150ms ease; width: 100%;
          position: relative;
        }
        .collapsed-hover-name {
          position: absolute; bottom: calc(100% + 6px); left: 0; right: 0;
          background: #a855f7; color: white;
          font-size: 0.78rem; font-weight: 600; line-height: 1.4;
          padding: 6px 12px; border-radius: 8px;
          opacity: 0; pointer-events: none;
          transition: opacity 150ms ease, transform 150ms ease;
          transform: translateY(4px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 100;
          white-space: normal; word-break: break-word;
        }
        .collapsed-hover-name::after {
          content: ''; position: absolute; top: 100%; left: 20px;
          border: 5px solid transparent; border-top-color: #1f2937;
        }
        .collapsed-card:hover .collapsed-hover-name {
          opacity: 1; transform: translateY(0);
        }
        .collapsed-card:hover { box-shadow: 0 4px 12px rgba(168,85,247,0.12); transform: translateY(-1px); }
        .dark .collapsed-card { background: #1f2937; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
        .collapsed-thumb { flex-shrink:0; width:52px; height:52px; border-radius:10px; overflow:hidden; background:#f3f4f6; }
        .dark .collapsed-thumb { background:#374151; }
        .collapsed-thumb-img { width:100%; height:100%; object-fit:cover; }
        .collapsed-thumb-placeholder { width:100%; height:100%; display:flex; align-items:center; justify-content:center; }
        .collapsed-info { flex:1; min-width:0; }
        .collapsed-name { font-size:0.825rem; font-weight:600; color:#a855f7; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin:0 0 2px; line-height:1.3; }
        .collapsed-desc { font-size:0.72rem; color:#6b7280; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin:0; line-height:1.4; }
        .dark .collapsed-desc { color:#9ca3af; }
        .collapsed-right { flex-shrink:0; display:flex; flex-direction:column; align-items:flex-end; gap:5px; }
        .collapsed-btn-row { display:flex; align-items:center; gap:5px; }
        .collapsed-wand-btn { display:flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:50%; border:none; background:transparent; cursor:pointer; transition:background 150ms ease, transform 150ms ease; padding:0; }
        .collapsed-wand-btn:hover { background:#faf5ff; transform:scale(1.12); }
        .dark .collapsed-wand-btn:hover { background:#374151; }
        .collapsed-price-group { display:flex; flex-direction:column; align-items:flex-end; gap:1px; }
        .collapsed-price { font-size:0.78rem; font-weight:700; color:#a855f7; white-space:nowrap; }
        .collapsed-price.out-of-stock { color:#ef4444; font-weight:500; font-size:0.72rem; }
        .collapsed-original-price { font-size:0.68rem; color:#9ca3af; text-decoration:line-through; white-space:nowrap; }
        .collapsed-action-btn { display:flex; align-items:center; gap:4px; padding:5px 11px; border-radius:20px; font-size:0.72rem; font-weight:600; cursor:pointer; transition:all 150ms ease; white-space:nowrap; border:none; }
        .collapsed-action-btn.primary { background:#a855f7; color:white; }
        .collapsed-action-btn.primary:hover:not(:disabled) { background:#9333ea; transform:scale(1.04); }
        .collapsed-action-btn.primary:disabled { background:#e5e7eb; color:#9ca3af; cursor:not-allowed; }
        .dark .collapsed-action-btn.primary:disabled { background:#374151; color:#6b7280; }
        .collapsed-action-btn.negotiable { background:#eff6ff; color:#3b82f6; border:1px solid #bfdbfe; }
        .collapsed-action-btn.negotiable:hover { background:#3b82f6; color:white; }
        .collapsed-action-btn.quote { background:rgba(168,85,247,0.08); color:#a855f7; border:1px solid rgba(168,85,247,0.25); padding:5px 8px; }
        .collapsed-action-btn.quote:hover { background:#a855f7; color:white; }
        .collapsed-action-btn.in-quote-list { background:rgba(168,85,247,0.15); color:#7c3aed; border:1px solid #a855f7; font-weight:700; }
        .collapsed-action-btn.in-quote-list:hover { background:#7c3aed; color:white; }
        .dark .collapsed-action-btn.negotiable { background:#1e3a8a; color:#93c5fd; border-color:#1e40af; }
        .collapsed-action-btn.auction { background-color: rgba(220,38,38,0.1); color: #dc2626; border: 1px solid rgba(220,38,38,0.4); font-weight: 700; }
        .collapsed-action-btn.auction:hover { background-color: #dc2626; color: white; }
      `}</style>
    </div>
  );
}