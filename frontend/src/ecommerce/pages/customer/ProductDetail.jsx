import { useState, useEffect, useRef } from 'react';
import ChargedInBadge from '../../../_shared/components/common/ChargedInBadge';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ShoppingCart,
  Star,
  Truck,
  Shield,
  Award,
  Package,
  Tag,
  Sparkles,
  FileText,
  Wand2,
  WalletCards,
  ShoppingBag,
  Heart,
  ChevronLeft,
  ChevronRight,
  Check,
  Gavel,
  MapPin,
} from 'lucide-react';

import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import Breadcrumb from '../../../_shared/components/layout/Breadcrumb';
import Button from '../../../_shared/components/common/Button';
import Badge from '../../../_shared/components/common/Badge';
import PriceBreakdown from '../../../_shared/components/common/PriceBreakdown';
import CollapsedProductCard from '../../components/storefront/products/CollapsedProductCard';
import Discussion from '../../../extras/components/engagement/Discussion';
import useEngagement from '../../../_shared/lib/engagementConfig';
import LoadingSpinner from '../../../_shared/components/layout/LoadingSpinner';
import useWishlistStore from '../../../_shared/store/wishlistStore';
import useRequestListStore from '../../../_shared/store/requestListStore';

import { productsAPI } from '../../../_shared/api/index';
import { useCartStore, useProductStore } from '../../../_shared/store/index';
import toast from 'react-hot-toast';
import useMoney from '../../../_shared/hooks/useMoney';
import VariantPicker from '../../components/storefront/products/VariantPicker';
import ItemBrochureButton from '../../components/catalogue/ItemBrochureButton';
import { storageUrl } from '../../../_shared/lib/storageUrl';
import { auctionPath, idFromParam, itemSlug, productPath } from '../../../_shared/lib/itemPath';

export default function ProductDetail() {
  const money = useMoney();   // before any early return (hooks rule)
  const reviewsOn = useEngagement().on('product', 'review');
  const { id: idParam } = useParams();
  const id = idFromParam(idParam);   // the address is id-SKU (12-ANG-001); the id is what is looked up
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  // tidy the address to the current id-SKU once the product is known (an old link, a bare id or an edited SKU)
  useEffect(() => { if (product?.id && String(product.id) === String(id) && idParam !== itemSlug(product)) navigate(productPath(product), { replace: true }); }, [product]); // eslint-disable-line react-hooks/exhaustive-deps
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState(null);
  // Structured variants: { variant, unit, image } from <VariantPicker>
  const [choice, setChoice] = useState(null);
  const [hasStructured, setHasStructured] = useState(false);
  const [activeTab, setActiveTab] = useState('description');
  
  const [addedToCart, setAddedToCart] = useState(false);
  const [imageErrors, setImageErrors] = useState({});

  const [qtyDir, setQtyDir] = useState(1);
  const [qtyAnimKey, setQtyAnimKey] = useState(0);
  const [arcDeg, setArcDeg] = useState(0);
  const [arcTransDur, setArcTransDur] = useState(320);
  const [arcOverlayKey, setArcOverlayKey] = useState(0);
  const [arcOverlayAnim, setArcOverlayAnim] = useState('none');
  const [qtyEditing, setQtyEditing] = useState(false);
  const [qtyDraft, setQtyDraft] = useState('');
  const qtyInputRef = useRef(null); 
  
  const handleImageError = (idx) => setImageErrors(prev => ({ ...prev, [idx]: true }));

  const { addItem } = useCartStore();
  const { setCurrentProduct } = useProductStore();
  const { toggle, has } = useWishlistStore();
  const wished = Boolean(product?.id) ? has(product.id) : false;


  const getImageUrl = (imagePath) => {
    if (!imagePath) return '/placeholder-product.png';
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) return imagePath;
    if (imagePath.startsWith('/storage/')) return `http://localhost:8000${imagePath}`;
    if (imagePath.startsWith('storage/')) return `http://localhost:8000/${imagePath}`;
    return `http://localhost:8000/storage/${imagePath}`;
  };

  const getQtyTheme = (qty) => {
    if (qty > 0 && qty % 10 === 0)
      return { color: '#dc143c', ring: 'rgba(220,20,60,0.5)', glow: '0 0 28px rgba(220,20,60,0.5)', spin: 'double', badge: '×10' };
    if (qty > 0 && qty % 5 === 0)
      return { color: '#16a34a', ring: 'rgba(22,163,74,0.45)', glow: '0 0 22px rgba(22,163,74,0.4)', spin: 'erratic', badge: '×5' };
    const m = qty % 20;
    if (m >= 15)
      return { color: '#16a34a', ring: 'rgba(22,163,74,0.35)', glow: 'none', spin: 'normal', badge: null };
    return { color: '#f97316', ring: 'rgba(249,115,22,0.4)', glow: 'none', spin: 'normal', badge: null };
  };

  const changeQty = (next) => {
    next = Math.max(1, next);
    if (next === quantity) return;
    const theme = getQtyTheme(next);
    const delta = next - quantity;
    setQtyDir(delta > 0 ? 1 : -1);
    setQtyAnimKey(k => k + 1);
    setQuantity(next);
    if (theme.spin === 'double') {
      setArcDeg(d => d + (delta > 0 ? 760 : -760));
      setArcTransDur(900);
      setArcOverlayAnim('doubleRev');
      setArcOverlayKey(k => k + 1);
    } else if (theme.spin === 'erratic') {
      setArcDeg(d => d + (delta > 0 ? 407 : -407));
      setArcTransDur(650);
      setArcOverlayAnim('erratic');
      setArcOverlayKey(k => k + 1);
    } else {
      setArcDeg(d => d + (delta > 0 ? 47 : -47));
      setArcTransDur(320);
      setArcOverlayAnim('none');
    }
  };

  const commitQtyEdit = () => {
    const val = parseInt(qtyDraft, 10);
    if (!isNaN(val) && val >= 1) changeQty(val);
    setQtyEditing(false);
    setQtyDraft('');
  };

  useEffect(() => {   
    setImageErrors({});   
    fetchProductData();   
  }, [id]);

  const fetchProductData = async () => {
    try {
      setLoading(true);
      const [productRes, relatedRes] = await Promise.all([
        productsAPI.getProduct(id),
        productsAPI.getRelatedProducts(id),
      ]);
      const productData = productRes?.product || productRes;
      setProduct(productData);
      setCurrentProduct(productData);

      const normalizeRelatedProduct = (p) => {
        const rawMain = p?.main_image_url ?? p?.mainimageurl ?? p?.mainimage ?? p?.main_image ?? null;
        const rawAdditional = p?.additional_images ?? p?.additionalimages ?? p?.images ?? [];
        return {
          ...p,
          main_image_url: rawMain ? getImageUrl(rawMain) : null,
          additional_images: Array.isArray(rawAdditional) ? rawAdditional.map(getImageUrl) : [],
        };
      };

      const relatedArray = Array.isArray(relatedRes?.products) ? relatedRes.products
        : Array.isArray(relatedRes?.data) ? relatedRes.data
        : Array.isArray(relatedRes) ? relatedRes : [];
      setRelatedProducts(relatedArray.map(normalizeRelatedProduct));
    } catch (error) {
      console.error('Failed to fetch product:', error);
      toast.error('Failed to load product');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = () => {
    const inStock = choice
      ? choice.variant.in_stock && choice.unit.available_quantity >= 1
      : (product?.in_stock ?? product?.instock ?? false);
    if (!inStock) { toast.error(choice ? 'That option is out of stock' : 'Product is out of stock'); return; }
    if (hasStructured && !choice) { toast.error('Please choose from the available options'); return; }
    if (choice && choice.unit.available_quantity < quantity) {
      toast.error(`Only ${Math.floor(choice.unit.available_quantity)} available`); return;
    }
    addItem(cartLine(), quantity);
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
    toast.success(`${product?.name} added to cart!`);
  };

  /** The product as a cart / quote line — with the chosen variant and unit if any. */
  const cartLine = () => {
    if (!choice) return { ...product, selectedVariant };
    const { variant, unit } = choice;
    return {
      ...product,
      // Price in the product's own currency, like product.price
      price: unit.price ?? product.price,
      original_price: unit.compare_at_price ?? null,
      line_key: `${product.id}:${variant.id}:${unit.id}`,   // separate cart line per variant + unit
      variant_id: variant.id,
      variant_unit_id: unit.id,
      selectedVariant: {
        id: variant.id,
        name: variantLabel,
        sku: variant.sku,
        unit: unit.unit?.name,
        unit_code: unit.unit?.code,
      },
    };
  };

  const handleBuyNow = () => { handleAddToCart(); navigate('/cart'); };
  const addToRequest = useRequestListStore((s) => s.add);
  const handleRequestQuote = () => {
    if (hasStructured && !choice) { toast.error('Please choose from the available options'); return; }
    addToRequest({
      kind: 'product', product_id: product.id, variant_id: choice?.variant.id ?? null, variant_unit_id: choice?.unit.id ?? null,
      name: product.name, variant_label: choice ? (choice.variant.name || choice.label) : null, unit_code: choice?.unit.unit?.code ?? null, quantity,
    });
    toast.success(`${product?.name} added to your quote request`, { action: { label: 'View', onClick: () => navigate('/request-quote') } });
  };
  const handleToggleWishlist = (e) => {
    e.stopPropagation();
    if (!product?.id) return;
    toggle(product.id);
    toast.success(wished ? 'Removed from wishlist' : 'Added to wishlist');
  };

  if (loading) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <LoadingSpinner size="lg" />
        </div>
        <Footer />
      </>
    );
  }

  if (!product) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Product Not Found</h2>
            <Button onClick={() => navigate('/products')}>Back to Products</Button>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  const isNew = product?.is_new ?? product?.isnew ?? 0;
  const onSale = product?.on_sale ?? product?.onsale ?? 0;
  const isFeatured = product?.is_featured ?? product?.isfeatured ?? 0;
  const averageRating = parseFloat(product?.average_rating ?? product?.averagerating ?? 0);
  const totalReviews = product?.total_reviews ?? product?.totalreviews ?? 0;
  const inStock = choice
    ? choice.variant.in_stock && choice.unit.available_quantity >= 1
    : (product?.in_stock ?? product?.instock ?? false);
  const variantLabel = choice ? (choice.variant.name || choice.label) : null;
  const negotiableValue = product?.price_is_negotiable ?? product?.priceisnegotiable ?? product?.priceIsNegotiable ?? 0;
  const isPriceNegotiable = negotiableValue === true || Number(negotiableValue) === 1;
  const hasAuction = product?.active_auction && product.active_auction.status === 'active';
  const auction = product?.active_auction || null;
  const additionalImages = product?.additional_images ?? product?.additionalimages ?? [];
  const productImages = [
    ...(choice?.image?.path ? [storageUrl(choice.image.path)] : []),
    product?.main_image_url, product?.mainimageurl, product?.main_image, product?.mainimage,
    ...(Array.isArray(additionalImages) ? additionalImages : []),
    ...(Array.isArray(product?.images) ? product.images : []),
  ].filter(Boolean);
  const currentPrice = choice ? (choice.unit.price ?? 0) : (selectedVariant?.price ?? product?.price ?? 0);
  const originalPrice = choice
    ? choice.unit.compare_at_price
    : selectedVariant?.original_price ?? selectedVariant?.originalprice ?? product?.original_price ?? product?.originalprice ?? null;
  
  const priceDiff = originalPrice && Number(originalPrice) !== Number(currentPrice);
  const isMarkdown = priceDiff && Number(originalPrice) > Number(currentPrice);

  // Shown in the shopper's chosen currency. A (legacy) variant's own price is
  // in the product's currency, so it's converted the same way.
  const currentNative = choice ? choice.unit.price : (selectedVariant?.price ?? product?.price);
  const taxParts = currentNative != null && currentNative !== '' ? money.breakdown(currentNative, product) : null;
  const originalParts = originalPrice != null ? money.breakdown(originalPrice, product) : null;
  const currentPriceText = choice
    ? (choice.unit.price != null ? (taxParts ? money.formatIn(taxParts.gross, taxParts.symbol) : money.itemAmount(choice.unit.price, product)) : 'Price on request')
    : selectedVariant?.price != null
      ? (taxParts ? money.formatIn(taxParts.gross, taxParts.symbol) : money.itemAmount(selectedVariant.price, product))
      : money.price(product);
  const originalPriceText = originalPrice != null ? (originalParts ? money.formatIn(originalParts.gross, originalParts.symbol) : money.itemAmount(originalPrice, product)) : null;
  const isMarkup   = priceDiff && Number(originalPrice) < Number(currentPrice);
  const priceDeltaPct = priceDiff
    ? Math.round(Math.abs(Number(originalPrice) - Number(currentPrice)) / Number(originalPrice) * 100)
    : null;
  const hasVariants = product?.has_variants ?? product?.hasvariants ?? false;
  const variants = product?.variants;
  const hasSpecs = product?.specifications && Object.keys(product.specifications).length > 0;
  const hasDescription = (product?.description ?? '').length > 0;

  const tabs = [
    ...(hasDescription ? [{ id: 'description', label: 'Description' }] : []),
    ...(hasSpecs ? [{ id: 'specs', label: 'Specifications' }] : []),
    ...(reviewsOn ? [{ id: 'reviews', label: totalReviews > 0 ? `Reviews (${totalReviews})` : 'Reviews' }] : []),
  ];
  // the chosen tab may not exist for this product (no description or specifications): fall back to the first one that does
  const shownTab = tabs.some((t) => t.id === activeTab) ? activeTab : tabs[0]?.id;

  return (
    <>
    <Helmet>
      <title>{product.name} — TISL Store</title>
      <meta name="description" content={
        (product?.short_description ?? product?.shortdescription ?? product?.description ?? '')
          .slice(0, 155) || `Buy ${product.name} at TISL Store.`
      } />
      <meta property="og:title" content={product.name} />
      <meta property="og:description" content={
        (product?.short_description ?? product?.shortdescription ?? product?.description ?? '').slice(0, 155)
      } />
      <meta property="og:image" content={
        product?.main_image_url ?? product?.mainimageurl ?? product?.main_image ?? ''
      } />
      <meta property="og:type" content="product" />
      <script type="application/ld+json">{JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Product",
        "name": product.name,
        "description": product?.description ?? '',
        "image": product?.main_image_url ?? product?.mainimageurl ?? product?.main_image ?? '',
        "brand": {
          "@type": "Brand",
          "name": product?.brand?.name ?? "TISL"
        },
        "offers": {
          "@type": "Offer",
          // Structured data uses the product's own price and currency
          "price": currentPrice,
          "priceCurrency": product?.currency?.code ?? "KES",
          "availability": inStock
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock"
        },
        ...(averageRating > 0 && {
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": averageRating.toFixed(1),
            "reviewCount": totalReviews
          }
        })
      })}</script>
    </Helmet>
      <Header />

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

          {/* Breadcrumb */}
          <div className="mb-6">
            <Breadcrumb
              items={[
                { label: 'Home', path: '/' },
                { label: 'Products', path: '/products' },
                product?.category?.name ? { label: product.category.name, path: `/products?category=${product?.category?.id}` } : null,
                { label: product?.name || 'Product Details' },
              ].filter(Boolean)}
            />
          </div>

          {/* Not sold at the current branch — point to where it is */}
          {product?.offered_here === false && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(217,119,6,0.10)', border: '1px solid rgba(217,119,6,0.25)', color: '#92400e', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem' }}>
              <MapPin size={16} style={{ flexShrink: 0 }} />
              <span>
                Not available at your selected branch.
                {product.available_branches && Object.keys(product.available_branches).length > 0
                  ? ` Available at: ${Object.values(product.available_branches).join(', ')}.`
                  : ' Currently out of stock at all branches.'}
              </span>
            </div>
          )}

          {/* ── MAIN PRODUCT GRID ─────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginBottom: '4rem' }}>
            {/* Title + Pills row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--color-primary-500)', lineHeight: 1.15, margin: 0, letterSpacing: '-0.03em', flex: '1 1 auto' }}>
                {product?.name}
              </h1>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0, paddingTop: 6 }}>
                {product?.sku && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', fontWeight: 600, color: '#9ca3af', borderRadius: 20, padding: '4px 10px', letterSpacing: '0.04em' }}>
                    SKU: {product.sku}
                  </span>
                )}
              </div>
            </div>

            {/* ── IMAGE GALLERY ── */}
            <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', maxHeight: 480, border: '1px solid color-mix(in srgb, var(--color-primary-500) 30%, transparent)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--color-primary-500) 8%, transparent), 0 0 20px color-mix(in srgb, var(--color-primary-500) 15%, transparent)' }}>
            
              <div
                style={{ position: 'relative', background: '#fff', aspectRatio: '16 / 9', overflow: 'hidden', cursor: 'zoom-in' }}
                onMouseEnter={e => e.currentTarget.querySelector('img')?.style && (e.currentTarget.querySelector('img').style.transform = 'scale(1.06)')}
                onMouseLeave={e => e.currentTarget.querySelector('img')?.style && (e.currentTarget.querySelector('img').style.transform = 'scale(1)')}
              >
                {/* Badges */}
                <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {isNew == 1 && (
                    <span style={badgeStyle('#059669', '#d1fae5')}><Sparkles size={11} /> New</span>
                  )}
                  {isMarkdown && priceDeltaPct && (
                    <span style={badgeStyle('#dc2626', '#fee2e2')}>−{priceDeltaPct}%</span>
                  )}
                  {isMarkup && priceDeltaPct && (
                    <span style={badgeStyle('#d97706', '#fef3c7')}>+{priceDeltaPct}%</span>
                  )}
                  {isFeatured == 1 && (
                    <span style={badgeStyle('var(--color-primary-600)', 'color-mix(in srgb, var(--color-primary-500) 10%, var(--bg-primary))')}><Star size={11} /> Featured</span>
                  )}
                </div>

                {/* Wishlist */}
                <button
                  onClick={handleToggleWishlist}
                  style={{
                    position: 'absolute', top: 16, right: 16, zIndex: 10,
                    width: 40, height: 40, borderRadius: '50%',
                    background: 'white', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.12)', transition: 'transform 150ms ease',
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <Heart size={18} style={{ color: wished ? '#ef4444' : '#9ca3af', fill: wished ? '#ef4444' : 'none', transition: 'all 200ms' }} />
                </button>

                {/* Image counter */}
                {productImages.length > 1 && (
                  <div style={{
                    position: 'absolute', top: 14, right: 66, zIndex: 10,
                    background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)',
                    color: '#fff', fontSize: '0.72rem', fontWeight: 700,
                    padding: '4px 10px', borderRadius: 20, letterSpacing: '0.05em',
                  }}>
                    {selectedImage + 1} / {productImages.length}
                  </div>
                )}

                {/* Arrow nav */}
                {productImages.length > 1 && (
                  <>
                    <button onClick={() => setSelectedImage(i => (i - 1 + productImages.length) % productImages.length)}
                      style={{ ...arrowBtn, left: 12 }}><ChevronLeft size={18} /></button>
                    <button onClick={() => setSelectedImage(i => (i + 1) % productImages.length)}
                      style={{ ...arrowBtn, right: 12 }}><ChevronRight size={18} /></button>
                  </>
                )}

                {/* Image or placeholder */}
                {imageErrors[selectedImage] || !productImages[selectedImage] ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', gap: 12 }}>
                    <Package size={56} style={{ color: '#d1d5db' }} />
                    <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 500 }}>No image available</span>
                  </div>
                ) : (
                  <img
                    src={getImageUrl(productImages[selectedImage])}
                    alt={product?.name}
                    style={{
                      width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                      transition: 'transform 400ms ease, opacity 200ms ease',
                    }}
                    onError={() => handleImageError(selectedImage)}
                  />
                )}

                {/* Thumbnail strip — floats inside image at bottom */}
                {productImages.length > 1 && (
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)',
                    padding: '32px 14px 14px',
                    display: 'flex', gap: 8, overflowX: 'auto',
                  }}>
                    {productImages.map((img, idx) => {
                      const hasError = imageErrors[idx];
                      return hasError ? (
                        <div key={idx} style={{ width: 52, height: 52, borderRadius: 8, border: '2px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Package size={18} style={{ color: 'rgba(255,255,255,0.5)' }} />
                        </div>
                      ) : (
                        <button
                          key={idx}
                          onClick={() => setSelectedImage(idx)}
                          style={{
                            width: 52, height: 52, borderRadius: 8, overflow: 'hidden', padding: 0,
                            border: selectedImage === idx ? '2px solid #fff' : '2px solid rgba(255,255,255,0.35)',
                            background: 'transparent', cursor: 'pointer', flexShrink: 0,
                            opacity: selectedImage === idx ? 1 : 0.65,
                            transform: selectedImage === idx ? 'scale(1.08)' : 'scale(1)',
                            transition: 'all 150ms ease',
                            boxShadow: selectedImage === idx ? '0 0 0 2px color-mix(in srgb, var(--color-primary-500) 70%, transparent)' : 'none',
                          }}
                        >
                          <img
                            src={getImageUrl(img)}
                            alt={`View ${idx + 1}`}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={() => handleImageError(idx)}
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── PRODUCT INFO ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* Title + Pills row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-primary-500)', lineHeight: 1.15, margin: 0, letterSpacing: '-0.03em', flex: '1 1 auto' }}>
                  {product?.name}
                </h1>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0, paddingTop: 6 }}>
                  {product?.category && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', fontWeight: 700, color: '#6366f1', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 20, padding: '4px 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      <Tag size={10} /> {product.category.name}
                    </span>
                  )}
                  {product?.brand && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', fontWeight: 700, color: '#374151', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 20, padding: '4px 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      <Award size={10} /> {product.brand.name}
                    </span>
                  )}
                  {product?.sku && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', fontWeight: 600, color: '#9ca3af', borderRadius: 20, padding: '4px 10px', letterSpacing: '0.04em' }}>
                      SKU: {product.sku}
                    </span>
                  )}
                </div>
              </div>

              {/* Short description */}
              {(product?.short_description ?? product?.shortdescription) && (
                <p style={{ fontSize: '0.9rem', color: '#6b7280', margin: '-12px 0 0', lineHeight: 1.6 }}>
                  {product?.short_description ?? product?.shortdescription}
                </p>
              )}

              {/* Rating row (only while reviews are on and there are some) */}
              {reviewsOn && totalReviews > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
                <div style={{ display: 'flex', gap: 2 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={15} style={{ color: i < Math.round(averageRating) ? '#f59e0b' : '#e5e7eb', fill: i < Math.round(averageRating) ? '#f59e0b' : '#e5e7eb' }} />
                  ))}
                </div>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>{averageRating.toFixed(1)}</span>
                <span style={{ fontSize: '0.82rem', color: '#9ca3af' }}>({totalReviews} reviews)</span>
              </div>}

              {/* ── Pricing + Stock card ── */}
              <div style={{ borderRadius: 16, border: '1px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', overflow: 'hidden' }}>

                {/* Price row */}
                <div style={{ padding: '20px 20px 16px', background: 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)', borderBottom: '1px solid color-mix(in srgb, var(--color-primary-500) 12%, transparent)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--color-primary-500)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                      {currentPriceText}
                    </span>
                    <ChargedInBadge />
                    {priceDiff && (
                      <>
                        <span style={{ fontSize: '1.1rem', color: '#9ca3af', textDecoration: 'line-through', fontWeight: 500 }}>
                          {originalPriceText}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: isMarkdown ? '#fee2e2' : '#fef3c7', color: isMarkdown ? '#dc2626' : '#d97706' }}>
                          {isMarkdown ? `SAVE ${priceDeltaPct}%` : `+${priceDeltaPct}%`}
                        </span>
                      </>
                    )}
                  </div>
                  {taxParts?.info && <PriceBreakdown parts={taxParts} style={{ marginTop: 12 }} />}

                  {hasAuction ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 600, color: '#dc2626', marginTop: 8 }}>
                      <Gavel size={13} /> This item is up for auction — place a bid to purchase
                    </span>
                  ) : isPriceNegotiable && (
                    <span style={{ display: 'inline-flex', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-primary-500)', marginTop: 8 }}>Price is negotiable — contact us</span>
                  )}
                </div>

                {/* Stock status row */}
                <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: inStock ? '#10b981' : '#ef4444', boxShadow: inStock ? '0 0 0 3px rgba(16,185,129,0.2)' : '0 0 0 3px rgba(239,68,68,0.2)', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: inStock ? '#059669' : '#dc2626' }}>
                    {inStock ? 'In Stock — Ready to Ship' : 'Out of Stock'}
                  </span>
                </div>
                {product.expiry_badge && inStock && (
                  <div style={{ padding: '0 20px 12px', fontSize: '0.8rem', color: '#92400e', fontWeight: 600 }}>
                    {product.clearance_percent ? `Clearance −${Math.round(product.clearance_percent)}% · ` : ''}Expires {new Date(product.expiry_badge).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                )}
              </div>

              {/* ── Variant & unit choice (renders nothing without structured variants) ── */}
              <VariantPicker
                product={product}
                onLoaded={setHasStructured}
                onChange={(c) => { setChoice(c); if (c?.image) setSelectedImage(0); }}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* ── Quantity Wheel ── */}
                {(() => {
                  const theme = getQtyTheme(quantity);
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                      <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                        Quantity
                      </h2>
                      <style>{`
                        @keyframes rollUp   { from{transform:translateY(70%);opacity:0} to{transform:translateY(0);opacity:1} }
                        @keyframes rollDown { from{transform:translateY(-70%);opacity:0} to{transform:translateY(0);opacity:1} }
                        @keyframes erratic  {
                          0%  {transform:rotate(0deg)}   20%{transform:rotate(200deg)}
                          40% {transform:rotate(55deg)}  65%{transform:rotate(315deg)}
                          85% {transform:rotate(165deg)} 100%{transform:rotate(360deg)}
                        }
                        @keyframes doubleRev {
                          0%  {transform:rotate(0deg)}   35%{transform:rotate(430deg)}
                          65% {transform:rotate(-55deg)} 85%{transform:rotate(410deg)}
                          100%{transform:rotate(360deg)}
                        }
                        @keyframes btnPress  { 0%,100%{transform:scale(1)} 50%{transform:scale(0.8)} }
                        @keyframes badgePop  { 0%{transform:scale(0) translateY(4px);opacity:0} 60%{transform:scale(1.2) translateY(-1px)} 100%{transform:scale(1) translateY(0);opacity:1} }
                        @keyframes glowPulse { 0%,100%{opacity:0.6} 50%{opacity:1} }
                      `}</style>

                      {/* − button */}
                      <button
                        onClick={() => changeQty(quantity - 1)}
                        disabled={quantity <= 1}
                        type="button"
                        style={{
                          width: 40, height: 40, borderRadius: '50%', border: `1.5px solid ${theme.ring}`,
                          background: 'transparent', color: theme.color, flexShrink: 0,
                          cursor: quantity <= 1 ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '1.4rem', fontWeight: 300,
                          opacity: quantity <= 1 ? 0.25 : 1,
                          transition: 'all 250ms ease',
                        }}
                        onMouseEnter={e => { if (quantity > 1) { e.currentTarget.style.background = theme.color; e.currentTarget.style.color = 'white'; }}}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = theme.color; }}
                        onMouseDown={e => { e.currentTarget.style.animation = 'btnPress 180ms ease'; }}
                        onAnimationEnd={e => { e.currentTarget.style.animation = 'none'; }}
                      >−</button>

                      {/* Wheel */}
                      <div style={{
                        width: 76, height: 76, borderRadius: '50%', position: 'relative', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: theme.glow !== 'none' ? theme.glow : '0 2px 10px rgba(0,0,0,0.06)',
                        transition: 'box-shadow 400ms ease',
                      }}>
                        {/* Static outer ring */}
                        <div style={{
                          position: 'absolute', inset: 0, borderRadius: '50%',
                          border: `1.5px solid ${theme.ring}`,
                          transition: 'border-color 350ms ease',
                        }} />

                        {/* Base rotating arc */}
                        <div style={{
                          position: 'absolute', inset: 4, borderRadius: '50%',
                          border: '2.5px solid transparent',
                          borderTopColor: theme.color,
                          borderRightColor: theme.ring,
                          transform: `rotate(${arcDeg}deg)`,
                          transition: `transform ${arcTransDur}ms cubic-bezier(0.34,1.3,0.64,1), border-color 350ms ease`,
                        }} />

                        {/* Overlay arc — special animations */}
                        {arcOverlayAnim !== 'none' && (
                          <div
                            key={arcOverlayKey}
                            style={{
                              position: 'absolute', inset: 10, borderRadius: '50%',
                              border: '2px solid transparent',
                              borderTopColor: theme.color,
                              borderLeftColor: theme.ring,
                              opacity: 0.65,
                              animationName: arcOverlayAnim,
                              animationDuration: arcOverlayAnim === 'doubleRev' ? '900ms' : '660ms',
                              animationTimingFunction: 'ease-in-out',
                              animationFillMode: 'both',
                            }}
                          />
                        )}

                        {/* Counter-rotating inner arc for depth */}
                        <div style={{
                          position: 'absolute', inset: 14, borderRadius: '50%',
                          border: '1.5px solid transparent',
                          borderBottomColor: theme.ring,
                          opacity: 0.4,
                          transform: `rotate(${-arcDeg * 0.6}deg)`,
                          transition: `transform ${arcTransDur}ms cubic-bezier(0.34,1.3,0.64,1), border-color 350ms ease`,
                        }} />

                        {/* Number / editable input */}
                        <div style={{ overflow: 'hidden', height: 32, display: 'flex', alignItems: 'center', position: 'relative', zIndex: 2 }}>
                          {qtyEditing ? (
                            <input
                              ref={qtyInputRef}
                              value={qtyDraft}
                              onChange={e => setQtyDraft(e.target.value.replace(/\D/g, ''))}
                              onKeyDown={e => {
                                if (e.key === 'Enter') commitQtyEdit();
                                if (e.key === 'Escape') { setQtyEditing(false); setQtyDraft(''); }
                              }}
                              onBlur={commitQtyEdit}
                              autoFocus
                              maxLength={4}
                              style={{
                                width: 52, textAlign: 'center', border: 'none', outline: 'none',
                                fontSize: '1rem', fontWeight: 800,
                                color: theme.color, background: 'transparent', padding: 0,
                                caretColor: theme.color,
                              }}
                            />
                          ) : (
                            <span
                              key={qtyAnimKey}
                              onClick={() => { setQtyEditing(true); setQtyDraft(String(quantity)); }}
                              title="Click to enter quantity"
                              style={{
                                fontSize: '1.25rem', fontWeight: 800, color: theme.color,
                                display: 'block', lineHeight: 1, cursor: 'text',
                                transition: 'color 350ms ease',
                                animation: `${qtyDir > 0 ? 'rollUp' : 'rollDown'} 220ms cubic-bezier(0.22,1,0.36,1) both`,
                                userSelect: 'none',
                              }}
                            >
                              {quantity}
                            </span>
                          )}
                        </div>

                        {/* Milestone badge */}
                        {theme.badge && (
                          <div
                            key={`badge-${quantity}`}
                            style={{
                              position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)',
                              fontSize: '0.55rem', fontWeight: 800, color: theme.color,
                              letterSpacing: '0.06em', textTransform: 'uppercase',
                              animation: 'badgePop 300ms cubic-bezier(0.34,1.56,0.64,1) both, glowPulse 1.8s ease-in-out 300ms infinite',
                            }}
                          >
                            {theme.badge}
                          </div>
                        )}
                      </div>

                      {/* + button */}
                      <button
                        onClick={() => changeQty(quantity + 1)}
                        type="button"
                        style={{
                          width: 40, height: 40, borderRadius: '50%', border: `1.5px solid ${theme.ring}`,
                          background: 'transparent', color: theme.color, flexShrink: 0,
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '1.4rem', fontWeight: 300,
                          transition: 'all 250ms ease',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = theme.color; e.currentTarget.style.color = 'white'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = theme.color; }}
                        onMouseDown={e => { e.currentTarget.style.animation = 'btnPress 180ms ease'; }}
                        onAnimationEnd={e => { e.currentTarget.style.animation = 'none'; }}
                      >+</button>

                    </div>
                  );
                })()}

                {/* CTA buttons */}
                {(() => {
                  if (hasAuction) {
                    return (
                      <button type="button" onClick={() => navigate(auctionPath(auction, product))}
                        style={{
                          width: '100%', height: 50, borderRadius: 12,
                          border: '1.5px solid rgba(220,38,38,0.4)',
                          background: 'rgba(220,38,38,0.08)', color: '#dc2626',
                          fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          transition: 'all 150ms ease', letterSpacing: '0.04em',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#dc2626'; e.currentTarget.style.color = 'white'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.08)'; e.currentTarget.style.color = '#dc2626'; }}
                      >
                        <Gavel size={18} /> Place Bid
                      </button>
                    );
                  }
                  return (
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button onClick={handleAddToCart} disabled={!inStock} type="button"
                        style={{
                          flex: '1 1 130px', height: 50, borderRadius: 12, border: '0.5px solid var(--color-primary-500)',
                          background: addedToCart ? 'var(--color-primary-500)' : 'rgba(229, 200, 255, 0.03)',
                          color: addedToCart ? 'white' : 'var(--color-primary-500)',
                          fontSize: '0.85rem', fontWeight: 700, cursor: inStock ? 'pointer' : 'not-allowed',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          transition: 'all 200ms ease', opacity: inStock ? 1 : 0.4, letterSpacing: '0.04em',
                        }}>
                        {addedToCart ? <><Check size={16} /> Added!</> : <><ShoppingCart size={16} /> Add to Cart</>}
                      </button>

                      {!isPriceNegotiable && (
                        <button onClick={handleBuyNow} disabled={!inStock} type="button"
                          style={{
                            flex: '1 1 130px', height: 50, borderRadius: 12, border: 'none',
                            background: inStock ? 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))' : '#e5e7eb',
                            color: 'white', fontSize: '0.85rem', fontWeight: 700,
                            cursor: inStock ? 'pointer' : 'not-allowed',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            boxShadow: inStock ? '0 4px 15px color-mix(in srgb, var(--color-primary-500) 35%, transparent)' : 'none',
                            transition: 'all 200ms ease', opacity: inStock ? 1 : 0.4, letterSpacing: '0.04em',
                          }}>
                          <ShoppingBag size={16} /> Buy Now
                        </button>
                      )}

                      <button onClick={handleRequestQuote} type="button" title="Add to your quote request"
                        style={{
                          ...(isPriceNegotiable ? { flex: '1 1 130px' } : { flex: '1 1 130px' }),
                          height: 50, borderRadius: 12, cursor: 'pointer', background: 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.04em',
                          border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 35%, transparent)', color: 'var(--color-primary-500)',
                        }}>
                        <FileText size={16} /> Request a quote
                      </button>
                    </div>
                  );
                })()}
              </div>
              <div><ItemBrochureButton type="product" id={product?.id} /></div>
              
              {/* Side-by-side layout */}
              <style>{`
                @keyframes fadeSlideIn {
                  from { opacity: 0; transform: translateX(-10px); }
                  to   { opacity: 1; transform: translateX(0); }
                }
                @keyframes popIn {
                  from { opacity: 0; transform: scale(0.85); }
                  to   { opacity: 1; transform: scale(1); }
                }
              `}</style>

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>

                {/* Key features */}
                {Array.isArray(product?.features) && product.features.length > 0 && (
                  <div style={{ flex: '1 1 220px', borderRadius: 12, padding: '16px 18px' }}>
                    <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>Key Features</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {product.features.slice(0, 5).map((feature, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 8,
                            animation: `fadeSlideIn 250ms ease both`,
                            animationDelay: `${idx * 60}ms`,
                          }}
                        >
                          <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                            <Check size={10} style={{ color: 'var(--color-primary-500)' }} />
                          </span>
                          <span style={{ fontSize: '0.83rem', lineHeight: 1.4 }}>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Variants */}
                {!hasStructured && hasVariants && Array.isArray(variants) && variants.length > 0 && (
                  <div style={{ flex: '1 1 220px' }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary-500)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
                      Available Options
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {variants.map((variant, idx) => {
                        const label = typeof variant === 'string' ? variant : variant?.name || `Option ${idx + 1}`;
                        const vPrice = typeof variant === 'object' ? variant?.price : null;
                        const isSelected = selectedVariant === variant;
                        return (
                          <div
                            key={idx}
                            onClick={() => setSelectedVariant(variant)}
                            title="Mention this option in your order notes"
                            style={{
                              position: 'relative',
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '5px 12px', borderRadius: 20,
                              border: isSelected ? '1.5px solid var(--color-primary-500)' : '1.5px dashed #d1d5db',
                              background: isSelected ? 'color-mix(in srgb, var(--color-primary-500) 7%, transparent)' : 'transparent',
                              color: isSelected ? 'var(--color-primary-500)' : '#6b7280',
                              fontSize: '0.83rem', fontWeight: isSelected ? 700 : 500,
                              cursor: 'pointer', transition: 'all 180ms ease',
                              animation: `popIn 200ms ease both`,
                              animationDelay: `${idx * 50}ms`,
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.setAttribute('data-hovered', 'true');
                              const tip = e.currentTarget.querySelector('.variant-tip');
                              if (tip) tip.style.opacity = '1';
                            }}
                            onMouseLeave={e => {
                              const tip = e.currentTarget.querySelector('.variant-tip');
                              if (tip) tip.style.opacity = '0';
                            }}
                          >
                            {isSelected && (
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-primary-500)', flexShrink: 0 }} />
                            )}
                            {label}
                            {vPrice && (
                              <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>· {money.itemAmount(vPrice, product)}</span>
                            )}

                            {/* Hover tooltip */}
                            <span
                              className="variant-tip"
                              style={{
                                opacity: 0,
                                position: 'absolute', bottom: 'calc(100% + 7px)', left: '50%',
                                transform: 'translateX(-50%)',
                                background: '#1f2937', color: '#fff',
                                fontSize: '0.72rem', fontWeight: 500, whiteSpace: 'nowrap',
                                padding: '4px 10px', borderRadius: 6,
                                pointerEvents: 'none',
                                transition: 'opacity 150ms ease',
                                zIndex: 10,
                              }}
                            >
                              Mention this in your order notes
                              <span style={{
                                position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                                width: 0, height: 0,
                                borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
                                borderTop: '5px solid #1f2937',
                              }} />
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>

            </div>
          </div>

          {/* ── TABS SECTION ─────────────────────────────────────────────────── */}
          {tabs.length > 0 && (
            <div style={{ background: 'var(--surface-card, #fff)', borderRadius: 16, border: '1px solid var(--line)', overflow: 'hidden', marginBottom: 48 }}>
              {/* Tab headers */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', padding: '0 24px' }}>
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    type="button"
                    style={{
                      padding: '16px 20px', fontSize: '0.85rem', fontWeight: 700,
                      color: shownTab === tab.id ? 'var(--color-primary-500)' : 'var(--text-tertiary)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      borderBottom: shownTab === tab.id ? '2px solid var(--color-primary-500)' : '2px solid transparent',
                      marginBottom: -1, transition: 'all 150ms ease', letterSpacing: '0.02em',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ padding: '32px' }}>
                {shownTab === 'description' && hasDescription && (
                  <div style={{ maxWidth: 720 }}>
                    <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-line' }}>
                      {product?.description}
                    </div>
                  </div>
                )}

                {shownTab === 'specs' && hasSpecs && (
                  <div style={{ maxWidth: 720 }}>
                    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)' }}>
                      {Object.entries(product.specifications).map(([key, value], idx) => (
                        <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', background: idx % 2 === 0 ? 'var(--surface-hover, rgba(148,163,184,0.10))' : 'transparent' }}>
                          <div style={{ padding: '12px 16px', fontSize: '0.83rem', fontWeight: 700, color: 'var(--text-primary)', borderRight: '1px solid var(--line)', textTransform: 'capitalize' }}>
                            {String(key).replace(/_/g, ' ')}
                          </div>
                          <div style={{ padding: '12px 16px', fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
                            {String(value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {shownTab === 'reviews' && reviewsOn && product?.id && <Discussion type="product" id={product.id} />}
              </div>

              {/* Trust strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, paddingTop: 8 }}>
                {[
                  { icon: <Truck size={16} />, label: 'Fast Delivery', sub: 'Straight to your door' },
                  { icon: <Shield size={16} />, label: 'Secure Payment', sub: '100% protected' },
                  { icon: <Package size={16} />, label: 'Easy Returns', sub: '30-day policy' },
                ].map((item, i) => (
                  <div key={i} style={{ textAlign: 'center', padding: '10px 8px', background: 'white', borderRadius: 10, border: '1px solid #f3f4f6' }}>
                    <div style={{ color: 'var(--color-primary-500)', display: 'flex', justifyContent: 'center', marginBottom: 4 }}>{item.icon}</div>
                    <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#374151', margin: 0 }}>{item.label}</p>
                    <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: '2px 0 0' }}>{item.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── RELATED PRODUCTS ─────────────────────────────────────────────── */}
          {relatedProducts.length > 0 && (
            <div style={{ marginTop: 40, paddingBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 }}>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-primary-500)', letterSpacing: '-0.02em', margin: 0 }}>
                  You May Also Like
                </h2>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{relatedProducts.length} items</span>
              </div>
              <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                {relatedProducts.map(rp => (
                  <CollapsedProductCard key={rp?.id} product={rp} />
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      <Footer />
    </>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const badgeStyle = (color, bg) => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.06em',
  color, background: bg, padding: '4px 10px', borderRadius: 20,
  textTransform: 'uppercase',
});

const arrowBtn = {
  position: 'absolute', top: '50%', transform: 'translateY(-50%)', zIndex: 10,
  width: 36, height: 36, borderRadius: '50%', background: 'white',
  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 2px 8px rgba(0,0,0,0.15)', color: '#374151',
  transition: 'transform 150ms ease',
};