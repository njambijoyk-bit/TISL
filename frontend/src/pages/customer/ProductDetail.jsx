import { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';

import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumb from '../../components/layout/Breadcrumb';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import CollapsedProductCard from '../../components/products/CollapsedProductCard';
import ReviewCard from '../../components/products/ReviewCard';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import useWishlistStore from '../../store/wishlistStore';
import useQuoteListStore from '../../store/quoteListStore';

import { productsAPI } from '../../api';
import { useCartStore, useProductStore, useAuthStore } from '../../store';
import toast from 'react-hot-toast';

function Lightbox({ url, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
 
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        backdropFilter: 'blur(6px)',
      }}
    >
      {/* close button */}
      <button
        onClick={onClose}
        style={{
          position: 'fixed', top: 20, right: 20,
          width: 36, height: 36, borderRadius: '50%',
          background: 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.2)',
          color: 'white', fontSize: '1.1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', zIndex: 10000,
        }}
      >
        ✕
      </button>
      <img
        src={url}
        alt="Review image"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '90vw', maxHeight: '88vh',
          borderRadius: 16,
          border: '2px solid rgba(168,85,247,0.5)',
          boxShadow: '0 0 40px rgba(168,85,247,0.35), 0 0 80px rgba(124,58,237,0.15)',
          objectFit: 'contain',
        }}
      />
    </div>
  );
}

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [activeTab, setActiveTab] = useState('description');
  
  const [addedToCart, setAddedToCart] = useState(false);
  const [imageErrors, setImageErrors] = useState({});

  const [canReview, setCanReview] = useState(false);  
  const [eligibleOrders, setEligibleOrders] = useState([]);  
  const [showReviewForm, setShowReviewForm] = useState(false);  
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [reviewData, setReviewData] = useState({  
    order_id: '',  
    rating: 0,  
    title: '',  
    comment: '',  
    images: [],  
  });  
  const [submittingReview, setSubmittingReview] = useState(false);  
  const [reviewError, setReviewError] = useState('');
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

  const { addItem: addToQuoteList, has: inQuoteList } = useQuoteListStore();
  const inQL = Boolean(product?.id) ? inQuoteList(product.id) : false;
  const { isAuthenticated } = useAuthStore();

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
    setShowReviewForm(false);  
    setCanReview(false);  
    setReviewError('');  
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
      // productData.reviews is an integer count, not review objects  
      // Fetch actual reviews from the dedicated endpoint  
      try {  
          const reviewsRes = await productsAPI.getProductReviews(id);  
          setReviews(reviewsRes?.reviews?.data || []);  
      } catch (err) {  
          console.warn('Failed to fetch reviews:', err);  
          setReviews([]);  
      }

      // Check if logged-in user can review this product  
      if (isAuthenticated) {  
        try {  
          const eligibility = await productsAPI.canReview(id);  
          setCanReview(eligibility.can_review);  
          setEligibleOrders(eligibility.orders || []);  
          if (eligibility.orders?.length === 1) {  
            setReviewData(prev => ({ ...prev, order_id: eligibility.orders[0].order_id }));  
          }  
        } catch (err) {  
          console.warn('Failed to check review eligibility:', err);  
          setCanReview(false);  
        }  
      }
      
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
    const inStock = product?.in_stock ?? product?.instock ?? false;
    if (!inStock) { toast.error('Product is out of stock'); return; }
    addItem({ ...product, selectedVariant }, quantity);
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
    toast.success(`${product?.name} added to cart!`);
  };

  const handleBuyNow = () => { handleAddToCart(); navigate('/cart'); };
  const handleRequestQuote = () => {
    if (inQL) { navigate('/quote-list'); return; }
    addToQuoteList({ ...product, selectedVariant }, quantity);
    toast.success(`${product?.name} added to quote list`);
  };
  const handleToggleWishlist = (e) => {
    e.stopPropagation();
    if (!product?.id) return;
    toggle(product.id);
    toast.success(wished ? 'Removed from wishlist' : 'Added to wishlist');
  };

  const handleMarkHelpful = async (reviewId) => {  
    try {   
      await productsAPI.markReviewHelpful(reviewId);   
      toast.success('Thank you!');   
      fetchProductData();   
    } catch (err) {  
      if (err.response?.status === 400) {  
        toast.info('You have already marked this review as helpful');  
      } else {  
        toast.error('Failed to mark review as helpful');  
      }  
    }  
  };

  const handleSubmitReview = async () => {  
    if (!reviewData.rating || !reviewData.order_id) {  
      setReviewError('Please select a rating and an order');  
      return;  
    }  
    setSubmittingReview(true);  
    setReviewError('');  
    try {  
      const formData = new FormData();  
      formData.append('order_id', reviewData.order_id);  
      formData.append('rating', reviewData.rating);  
      if (reviewData.title) formData.append('title', reviewData.title);  
      if (reviewData.comment) formData.append('comment', reviewData.comment);  
      if (reviewData.images?.length) {  
        reviewData.images.forEach(img => formData.append('images[]', img));  
      }  
      await productsAPI.createReview(id, formData);  
      toast.success('Review submitted! It will appear after approval.');  
      setShowReviewForm(false);  
      setReviewData({ order_id: '', rating: 0, title: '', comment: '', images: [] });  
      fetchProductData(); // Refresh reviews and eligibility  
    } catch (err) {  
      const msg = err.response?.data?.message || err.response?.data?.errors?.rating?.[0] || 'Failed to submit review';  
      setReviewError(msg);  
      toast.error(msg);  
    } finally {  
      setSubmittingReview(false);  
    }  
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
  const inStock = product?.in_stock ?? product?.instock ?? false;
  const negotiableValue = product?.price_is_negotiable ?? product?.priceisnegotiable ?? product?.priceIsNegotiable ?? 0;
  const isPriceNegotiable = negotiableValue === true || Number(negotiableValue) === 1;
  const hasAuction = product?.active_auction && product.active_auction.status === 'active';
  const auction = product?.active_auction || null;
  const additionalImages = product?.additional_images ?? product?.additionalimages ?? [];
  const productImages = [
    product?.main_image_url, product?.mainimageurl, product?.main_image, product?.mainimage,
    ...(Array.isArray(additionalImages) ? additionalImages : []),
    ...(Array.isArray(product?.images) ? product.images : []),
  ].filter(Boolean);
  const currentPrice = selectedVariant?.price ?? product?.price ?? 0;
  const originalPrice = selectedVariant?.original_price ?? selectedVariant?.originalprice ?? product?.original_price ?? product?.originalprice ?? null;
  
  const priceDiff = originalPrice && Number(originalPrice) !== Number(currentPrice);
  const isMarkdown = priceDiff && Number(originalPrice) > Number(currentPrice);
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
    ...(reviews.length > 0 ? [{ id: 'reviews', label: `Reviews (${totalReviews})` }] : [{ id: 'reviews', label: 'Reviews' }]),
  ];

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
          "price": currentPrice,
          "priceCurrency": "KES",
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

          {/* ── MAIN PRODUCT GRID ─────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginBottom: '4rem' }}>
            {/* Title + Pills row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: '#a855f7', lineHeight: 1.15, margin: 0, letterSpacing: '-0.03em', flex: '1 1 auto' }}>
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
            <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', maxHeight: 480, border: '1px solid rgba(168,85,247,0.3)', boxShadow: '0 0 0 3px rgba(168,85,247,0.08), 0 0 20px rgba(168,85,247,0.15)' }}>
            
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
                    <span style={badgeStyle('#7c3aed', '#ede9fe')}><Star size={11} /> Featured</span>
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
                            boxShadow: selectedImage === idx ? '0 0 0 2px rgba(168,85,247,0.7)' : 'none',
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
                <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#a855f7', lineHeight: 1.15, margin: 0, letterSpacing: '-0.03em', flex: '1 1 auto' }}>
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

              {/* Rating row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
                <div style={{ display: 'flex', gap: 2 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={15} style={{ color: i < Math.round(averageRating) ? '#f59e0b' : '#e5e7eb', fill: i < Math.round(averageRating) ? '#f59e0b' : '#e5e7eb' }} />
                  ))}
                </div>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>{averageRating.toFixed(1)}</span>
                <span style={{ fontSize: '0.82rem', color: '#9ca3af' }}>({totalReviews} reviews)</span>
              </div>

              {/* ── Pricing + Stock card ── */}
              <div style={{ borderRadius: 16, border: '1px solid rgba(168,85,247,0.2)', overflow: 'hidden' }}>

                {/* Price row */}
                <div style={{ padding: '20px 20px 16px', background: 'rgba(168,85,247,0.06)', borderBottom: '1px solid rgba(168,85,247,0.12)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '2.2rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.03em', lineHeight: 1 }}>
                      KSh {Number(currentPrice).toLocaleString()}
                    </span>
                    {priceDiff && (
                      <>
                        <span style={{ fontSize: '1.1rem', color: '#9ca3af', textDecoration: 'line-through', fontWeight: 500 }}>
                          KSh {Number(originalPrice).toLocaleString()}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: isMarkdown ? '#fee2e2' : '#fef3c7', color: isMarkdown ? '#dc2626' : '#d97706' }}>
                          {isMarkdown ? `SAVE ${priceDeltaPct}%` : `+${priceDeltaPct}%`}
                        </span>
                      </>
                    )}
                  </div>

                  {hasAuction ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 600, color: '#dc2626', marginTop: 8 }}>
                      <Gavel size={13} /> This item is up for auction — place a bid to purchase
                    </span>
                  ) : isPriceNegotiable && (
                    <button type="button" onClick={handleRequestQuote}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 600, color: '#a855f7', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, padding: 0, marginTop: 8 }}>
                      {inQL ? 'Price is negotiable — View in Quote List →' : 'Price is negotiable — request a quote'}
                    </button>
                  )}
                </div>

                {/* Stock status row */}
                <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: inStock ? '#10b981' : '#ef4444', boxShadow: inStock ? '0 0 0 3px rgba(16,185,129,0.2)' : '0 0 0 3px rgba(239,68,68,0.2)', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: inStock ? '#059669' : '#dc2626' }}>
                    {inStock ? 'In Stock — Ready to Ship' : 'Out of Stock'}
                  </span>
                </div>
              </div>

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
                      <button type="button" onClick={() => navigate(`/auctions/${auction.id}`)}
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
                          flex: '1 1 130px', height: 50, borderRadius: 12, border: '0.5px solid #a855f7',
                          background: addedToCart ? '#a855f7' : 'rgba(229, 200, 255, 0.03)',
                          color: addedToCart ? 'white' : '#a855f7',
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
                            background: inStock ? 'linear-gradient(135deg, #a855f7, #7c3aed)' : '#e5e7eb',
                            color: 'white', fontSize: '0.85rem', fontWeight: 700,
                            cursor: inStock ? 'pointer' : 'not-allowed',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            boxShadow: inStock ? '0 4px 15px rgba(168,85,247,0.35)' : 'none',
                            transition: 'all 200ms ease', opacity: inStock ? 1 : 0.4, letterSpacing: '0.04em',
                          }}>
                          <ShoppingBag size={16} /> Buy Now
                        </button>
                      )}

                      <button onClick={handleRequestQuote} type="button"
                        title={inQL ? 'In quote list — click to view' : 'Add to quote list'}
                        style={{
                          ...(isPriceNegotiable ? { flex: '1 1 130px' } : { width: 50, flexShrink: 0 }),
                          height: 50, borderRadius: 12, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.04em',
                          border: inQL ? '1.5px solid #a855f7' : '1.5px solid rgba(168,85,247,0.35)',
                          background: inQL ? 'rgba(168,85,247,0.15)' : 'transparent',
                          color: inQL ? '#7c3aed' : '#a855f7', transition: 'all 150ms ease',
                        }}>
                        <FileText size={16} />
                        {isPriceNegotiable ? (inQL ? 'In Quote List →' : 'Request a Quote') : ''}
                      </button>
                    </div>
                  );
                })()}
              </div>
              
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
                          <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(168,85,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                            <Check size={10} style={{ color: '#a855f7' }} />
                          </span>
                          <span style={{ fontSize: '0.83rem', lineHeight: 1.4 }}>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Variants */}
                {hasVariants && Array.isArray(variants) && variants.length > 0 && (
                  <div style={{ flex: '1 1 220px' }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
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
                              border: isSelected ? '1.5px solid #a855f7' : '1.5px dashed #d1d5db',
                              background: isSelected ? 'rgba(168,85,247,0.07)' : 'transparent',
                              color: isSelected ? '#a855f7' : '#6b7280',
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
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7', flexShrink: 0 }} />
                            )}
                            {label}
                            {vPrice && (
                              <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>· KSh {Number(vPrice).toLocaleString()}</span>
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
            <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f3f4f6', overflow: 'hidden', marginBottom: 48 }}>
              {/* Tab headers */}
              <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', padding: '0 24px' }}>
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    type="button"
                    style={{
                      padding: '16px 20px', fontSize: '0.85rem', fontWeight: 700,
                      color: activeTab === tab.id ? '#a855f7' : '#6b7280',
                      background: 'none', border: 'none', cursor: 'pointer',
                      borderBottom: activeTab === tab.id ? '2px solid #a855f7' : '2px solid transparent',
                      marginBottom: -1, transition: 'all 150ms ease', letterSpacing: '0.02em',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ padding: '32px' }}>
                {activeTab === 'description' && hasDescription && (
                  <div style={{ maxWidth: 720 }}>
                    <div style={{ fontSize: '0.95rem', color: '#374151', lineHeight: 1.8, whiteSpace: 'pre-line' }}>
                      {product?.description}
                    </div>
                  </div>
                )}

                {activeTab === 'specs' && hasSpecs && (
                  <div style={{ maxWidth: 720 }}>
                    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #f3f4f6' }}>
                      {Object.entries(product.specifications).map(([key, value], idx) => (
                        <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', background: idx % 2 === 0 ? '#f9fafb' : 'white' }}>
                          <div style={{ padding: '12px 16px', fontSize: '0.83rem', fontWeight: 700, color: '#374151', borderRight: '1px solid #f3f4f6', textTransform: 'capitalize' }}>
                            {String(key).replace(/_/g, ' ')}
                          </div>
                          <div style={{ padding: '12px 16px', fontSize: '0.83rem', color: '#6b7280' }}>
                            {String(value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'reviews' && (
                  <div>
                    {/* Lightbox */}
                    {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

                    {/* ── Rating summary ───────────────────────────────────────────────── */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28,
                      padding: '22px 26px',
                      background: 'rgba(245, 158, 11, 0.04)',
                      borderRadius: 14, border: '1px solid rgba(245, 158, 11, 0.15)',
                    }}>
                      <div style={{
                        width: 80, height: 80, borderRadius: 14,
                        background: 'linear-gradient(135deg, #f59e0b, #583801)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <span style={{ fontSize: '1.6rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>
                          {averageRating.toFixed(1)}
                        </span>
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgba(255,255,255,0.75)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          of 5
                        </span>
                      </div>
                      <div>
                        <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i} size={16}
                              style={{
                                color: i < Math.round(averageRating) ? '#f59e0b' : '#e5e7eb',
                                fill: i < Math.round(averageRating) ? '#f59e0b' : '#e5e7eb',
                              }}
                            />
                          ))}
                        </div>
                        <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151', margin: 0 }}>
                          {totalReviews} {totalReviews === 1 ? 'review' : 'reviews'}
                        </p>
                        <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '2px 0 0' }}>
                          Based on verified purchases
                        </p>
                      </div>
                    </div>

                    {/* ── Write a review CTA ───────────────────────────────────────────── */}
                    {canReview && !showReviewForm && (
                      <div style={{ marginBottom: 24, textAlign: 'center' }}>
                        <button
                          onClick={() => setShowReviewForm(true)}
                          style={{
                            padding: '10px 24px', borderRadius: 10, border: 'none',
                            background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                            color: 'white', fontSize: '0.82rem', fontWeight: 700,
                            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7,
                            boxShadow: '0 4px 14px rgba(168,85,247,0.3)',
                            transition: 'transform 150ms ease, box-shadow 150ms ease',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(168,85,247,0.4)'; }}
                          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(168,85,247,0.3)'; }}
                        >
                          <Star size={14} fill="white" /> Write a Review
                        </button>
                      </div>
                    )}

                    {!isAuthenticated && (
                      <div style={{
                        marginBottom: 24, textAlign: 'center', padding: '14px 18px',
                        background: 'rgba(168,85,247,0.04)', borderRadius: 12,
                        border: '1px solid rgba(168,85,247,0.12)',
                      }}>
                        <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: 0 }}>
                          <a href="/login" style={{ color: '#a855f7', fontWeight: 700, textDecoration: 'none' }}>Log in</a> to write a review
                        </p>
                      </div>
                    )}

                    {isAuthenticated && !canReview && (
                      <div style={{
                        marginBottom: 24, textAlign: 'center', padding: '14px 18px',
                        background: 'rgba(245,158,11,0.06)', borderRadius: 12,
                        border: '1px solid rgba(245,158,11,0.2)',
                      }}>
                        <p style={{ fontSize: '0.82rem', color: '#92400e', margin: 0 }}>Purchase this product to leave a review</p>
                      </div>
                    )}

                    {/* ── Review form ──────────────────────────────────────────────────── */}
                    {showReviewForm && (
                      <div style={{
                        marginBottom: 28, padding: '22px 24px', borderRadius: 14,
                        border: '1.5px solid rgba(168,85,247,0.2)',
                        background: 'linear-gradient(180deg, #ffffff 0%, #faf5ff 100%)',
                        boxShadow: '0 4px 20px rgba(168,85,247,0.06)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: 8,
                              background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <Star size={13} color="#a855f7" />
                            </div>
                            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#7c3aed', margin: 0 }}>Write Your Review</h3>
                          </div>
                          <button
                            onClick={() => { setShowReviewForm(false); setReviewError(''); }}
                            style={{
                              width: 28, height: 28, borderRadius: 8, background: 'rgba(0,0,0,0.04)',
                              border: '1px solid rgba(0,0,0,0.06)', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: '#9ca3af', fontSize: '0.9rem', fontWeight: 600,
                            }}
                          >✕</button>
                        </div>

                        {/* Order selector */}
                        {eligibleOrders.length > 1 && (
                          <div style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Select Order *</label>
                            <select
                              value={reviewData.order_id}
                              onChange={e => setReviewData(prev => ({ ...prev, order_id: e.target.value }))}
                              style={{
                                width: '100%', padding: '9px 14px', borderRadius: 10,
                                border: '1.5px solid #e5e7eb', fontSize: '0.82rem', color: '#111827',
                                background: '#fff', outline: 'none',
                              }}
                              onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.08)'; }}
                              onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
                            >
                              <option value="">Choose an order...</option>
                              {eligibleOrders.map(o => (
                                <option key={o.order_id} value={o.order_id}>Order #{o.order_number}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Star rating */}
                        <div style={{ marginBottom: 16 }}>
                          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Rating *</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {[1, 2, 3, 4, 5].map(n => (
                              <button
                                key={n} type="button"
                                onClick={() => setReviewData(prev => ({ ...prev, rating: n }))}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, transition: 'transform 0.1s' }}
                                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                              >
                                <Star size={24} fill={n <= reviewData.rating ? '#f59e0b' : 'none'} color={n <= reviewData.rating ? '#f59e0b' : '#d1d5db'} />
                              </button>
                            ))}
                            {reviewData.rating > 0 && (
                              <span style={{
                                marginLeft: 8, fontSize: '0.72rem', fontWeight: 700, color: '#f59e0b',
                                background: 'rgba(245,158,11,0.08)', padding: '3px 10px', borderRadius: 20,
                                border: '1px solid rgba(245,158,11,0.2)',
                              }}>
                                {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][reviewData.rating]}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Title */}
                        <div style={{ marginBottom: 16 }}>
                          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Review Title</label>
                          <input
                            value={reviewData.title}
                            onChange={e => setReviewData(prev => ({ ...prev, title: e.target.value }))}
                            placeholder="Sum up your review in one line"
                            maxLength={255}
                            style={{
                              width: '100%', padding: '9px 14px', borderRadius: 10,
                              border: '1.5px solid #e5e7eb', fontSize: '0.82rem', color: '#111827',
                              background: '#fff', boxSizing: 'border-box', outline: 'none',
                            }}
                            onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.08)'; }}
                            onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
                          />
                        </div>

                        {/* Comment */}
                        <div style={{ marginBottom: 16 }}>
                          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Your Review</label>
                          <textarea
                            value={reviewData.comment}
                            onChange={e => setReviewData(prev => ({ ...prev, comment: e.target.value }))}
                            placeholder="What did you like or dislike about this product?"
                            rows={4} maxLength={2000}
                            style={{
                              width: '100%', padding: '9px 14px', borderRadius: 10,
                              border: '1.5px solid #e5e7eb', fontSize: '0.82rem', color: '#111827',
                              background: '#fff', resize: 'vertical', boxSizing: 'border-box',
                              fontFamily: 'inherit', outline: 'none',
                            }}
                            onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.08)'; }}
                            onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
                          />
                        </div>

                        {/* Image upload */}
                        <div style={{ marginBottom: 20 }}>
                          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Photos <span style={{ fontWeight: 400, color: '#9ca3af', textTransform: 'none', letterSpacing: 'normal' }}>(optional, max 5)</span>
                          </label>
                          <input
                            type="file" accept="image/*" multiple
                            onChange={e => {
                              const files = Array.from(e.target.files).slice(0, 5);
                              setReviewData(prev => ({ ...prev, images: files }));
                            }}
                            style={{ fontSize: '0.78rem', color: '#6b7280' }}
                          />
                          {/* Selected image previews */}
                          {reviewData.images.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                              {reviewData.images.map((file, i) => (
                                <img
                                  key={i}
                                  src={URL.createObjectURL(file)}
                                  alt={`Preview ${i + 1}`}
                                  onClick={() => setLightboxUrl(URL.createObjectURL(file))}
                                  style={{
                                    width: 48, height: 48, objectFit: 'cover',
                                    borderRadius: 8,
                                    border: '1.5px solid rgba(168,85,247,0.3)',
                                    cursor: 'pointer',
                                    transition: 'border-color 0.15s, box-shadow 0.15s',
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.12)';
                                    e.currentTarget.style.borderColor = '#a855f7';
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.boxShadow = 'none';
                                    e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)';
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Error */}
                        {reviewError && (
                          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                            <p style={{ fontSize: '0.78rem', color: '#dc2626', margin: 0, fontWeight: 600 }}>{reviewError}</p>
                          </div>
                        )}

                        {/* Submit */}
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => { setShowReviewForm(false); setReviewError(''); }}
                            style={{
                              padding: '9px 18px', borderRadius: 10,
                              border: '1.5px solid #e5e7eb', background: '#fff',
                              color: '#6b7280', fontSize: '0.82rem', fontWeight: 600,
                              cursor: 'pointer', transition: 'border-color 150ms',
                            }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = '#9ca3af'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = '#e5e7eb'}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSubmitReview}
                            disabled={submittingReview || !reviewData.rating}
                            style={{
                              padding: '9px 22px', borderRadius: 10, border: 'none',
                              background: !reviewData.rating ? '#d1d5db' : 'linear-gradient(135deg, #a855f7, #7c3aed)',
                              color: 'white', fontSize: '0.82rem', fontWeight: 700,
                              cursor: !reviewData.rating ? 'not-allowed' : 'pointer',
                              opacity: submittingReview ? 0.6 : 1,
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              boxShadow: reviewData.rating ? '0 4px 12px rgba(168,85,247,0.3)' : 'none',
                              transition: 'transform 150ms ease, box-shadow 150ms ease',
                            }}
                            onMouseEnter={e => { if (reviewData.rating) { e.currentTarget.style.transform = 'translateY(-1px)'; } }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
                          >
                            {submittingReview ? 'Submitting...' : 'Submit Review'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── Review list ──────────────────────────────────────────────────── */}
                    {reviews.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {reviews.map(review => (
                          <ReviewCard
                            key={review?.id}
                            review={review}
                            onMarkHelpful={handleMarkHelpful}
                            onImageClick={setLightboxUrl}
                          />
                        ))}
                      </div>
                    ) : (
                      <div style={{
                        textAlign: 'center', padding: '48px 24px',
                        background: 'rgba(168,85,247,0.03)', borderRadius: 14,
                        border: '1px dashed rgba(168,85,247,0.15)',
                      }}>
                        <Star size={36} style={{ margin: '0 auto 10px', display: 'block', color: '#c084fc' }} />
                        <p style={{ fontWeight: 700, marginBottom: 4, color: '#374151', fontSize: '0.9rem' }}>No reviews yet</p>
                        <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Be the first to review this product!</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Trust strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, paddingTop: 8 }}>
                {[
                  { icon: <Truck size={16} />, label: 'Fast Delivery', sub: 'Straight to your door' },
                  { icon: <Shield size={16} />, label: 'Secure Payment', sub: '100% protected' },
                  { icon: <Package size={16} />, label: 'Easy Returns', sub: '30-day policy' },
                ].map((item, i) => (
                  <div key={i} style={{ textAlign: 'center', padding: '10px 8px', background: 'white', borderRadius: 10, border: '1px solid #f3f4f6' }}>
                    <div style={{ color: '#a855f7', display: 'flex', justifyContent: 'center', marginBottom: 4 }}>{item.icon}</div>
                    <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#374151', margin: 0 }}>{item.label}</p>
                    <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: '2px 0 0' }}>{item.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── RELATED PRODUCTS ─────────────────────────────────────────────── */}
          {relatedProducts.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.02em', margin: 0 }}>
                  You May Also Like
                </h2>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{relatedProducts.length} items</span>
              </div>
              <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
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