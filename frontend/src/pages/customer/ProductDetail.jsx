import { useState, useEffect } from 'react';
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
import ProductCard from '../../components/products/ProductCard';
import ReviewCard from '../../components/products/ReviewCard';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import useWishlistStore from '../../store/wishlistStore';
import useQuoteListStore from '../../store/quoteListStore';

import { productsAPI } from '../../api';
import { useCartStore, useProductStore, useAuthStore } from '../../store';
import toast from 'react-hot-toast';

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
  const [reviewData, setReviewData] = useState({  
    order_id: '',  
    rating: 0,  
    title: '',  
    comment: '',  
    images: [],  
  });  
  const [submittingReview, setSubmittingReview] = useState(false);  
  const [reviewError, setReviewError] = useState('');
  
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '2rem', marginBottom: '4rem', alignItems: 'start' }}>

            {/* ── LEFT: IMAGE GALLERY ── */}
            <div>
              <div className="sticky top-6">
                {/* Main image */}
                <div style={{ position: 'relative', background: '#fff', borderRadius: 16, overflow: 'hidden', aspectRatio: '1 / 1' }}>
                  {/* Badges */}
                  <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {isNew == 1 && (
                      <span style={badgeStyle('#059669', '#d1fae5')}>
                        <Sparkles size={11} /> New
                      </span>
                    )}
                    {isMarkdown && priceDeltaPct && (
    <span style={badgeStyle('#dc2626', '#fee2e2')}>
      −{priceDeltaPct}%
    </span>
  )}
  {isMarkup && priceDeltaPct && (
    <span style={badgeStyle('#d97706', '#fef3c7')}>
      +{priceDeltaPct}%
    </span>
  )}
                    {isFeatured == 1 && (
                      <span style={badgeStyle('#7c3aed', '#ede9fe')}>
                        <Star size={11} /> Featured
                      </span>
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
                      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                      transition: 'transform 150ms ease',
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    <Heart
                      size={18}
                      style={{ color: wished ? '#ef4444' : '#9ca3af', fill: wished ? '#ef4444' : 'none', transition: 'all 200ms' }}
                    />
                  </button>

                  {/* Arrow nav */}
                  {productImages.length > 1 && (
                    <>
                      <button onClick={() => setSelectedImage(i => (i - 1 + productImages.length) % productImages.length)}
                        style={{ ...arrowBtn, left: 12 }}>
                        <ChevronLeft size={18} />
                      </button>
                      <button onClick={() => setSelectedImage(i => (i + 1) % productImages.length)}
                        style={{ ...arrowBtn, right: 12 }}>
                        <ChevronRight size={18} />
                      </button>
                    </>
                  )}

                  {imageErrors[selectedImage] || !productImages[selectedImage] ? (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', gap: 12 }}>
                      <Package size={64} style={{ color: '#d1d5db' }} />
                      <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 500 }}>No image available</span>
                    </div>
                  ) : (
                    <img
                      src={getImageUrl(productImages[selectedImage])}
                      alt={product?.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'opacity 200ms ease' }}
                      onError={() => handleImageError(selectedImage)}
                    />
                  )}
                </div>

                {/* Thumbnails */}
                {productImages.length > 1 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    {productImages.map((img, idx) => {
                      const hasError = imageErrors[idx];
                      return hasError ? (
                        // Failed image — show Package icon, non-clickable
                        <div
                          key={idx}
                          style={{
                            width: 64, height: 64, borderRadius: 10, overflow: 'hidden',
                            border: '2px solid #e5e7eb', background: '#f9fafb',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <Package size={22} style={{ color: '#d1d5db' }} />
                        </div>
                      ) : (
                        <button
                          key={idx}
                          onClick={() => setSelectedImage(idx)}
                          style={{
                            width: 64, height: 64, borderRadius: 10, overflow: 'hidden',
                            border: selectedImage === idx ? '2px solid #a855f7' : '2px solid transparent',
                            background: '#fff', padding: 0, cursor: 'pointer',
                            boxShadow: selectedImage === idx ? '0 0 0 3px rgba(168,85,247,0.2)' : '0 1px 3px rgba(0,0,0,0.1)',
                            transition: 'all 150ms ease', flexShrink: 0,
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

            {/* ── RIGHT: PRODUCT INFO ── */}
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Category + Brand pills */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', fontWeight: 600, color: '#9ca3af', background: 'transparent', borderRadius: 20, padding: '4px 10px', letterSpacing: '0.04em' }}>
                      SKU: {product.sku}
                    </span>
                  )}
                </div>

                {/* Product name */}
                <div>
                  <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#a855f7', lineHeight: 1.2, margin: 0, letterSpacing: '-0.02em' }}>
                    {product?.name}
                  </h1>
                  {(product?.short_description ?? product?.shortdescription) && (
                    <p style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: 8, lineHeight: 1.6 }}>
                      {product?.short_description ?? product?.shortdescription}
                    </p>
                  )}
                </div>

                {/* Rating row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={15} style={{ color: i < Math.round(averageRating) ? '#f59e0b' : '#e5e7eb', fill: i < Math.round(averageRating) ? '#f59e0b' : '#e5e7eb' }} />
                    ))}
                  </div>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>{averageRating.toFixed(1)}</span>
                  <span style={{ fontSize: '0.82rem', color: '#9ca3af' }}>({totalReviews} reviews)</span>
                </div>

                <div style={{ padding: '16px 20px', borderRadius: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '2rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.03em' }}>
                      KSh {Number(currentPrice).toLocaleString()}
                    </span>

                    {priceDiff && (
                      <>
                        <span style={{ fontSize: '1.1rem', color: '#9ca3af', textDecoration: 'line-through', fontWeight: 500 }}>
                          KSh {Number(originalPrice).toLocaleString()}
                        </span>
                        <span style={{
                          fontSize: '0.75rem', fontWeight: 800, padding: '3px 8px', borderRadius: 6,
                          background: isMarkdown ? '#fee2e2' : 'rgba(239,68,68,0.1)',
                          color: isMarkdown ? '#dc2626' : '#dc2626',
                        }}>
                          {isMarkdown ? `SAVE ${priceDeltaPct}%` : `+${priceDeltaPct}%`}
                        </span>
                      </>
                    )}
                  </div>

                  {hasAuction ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 600, color: '#dc2626', marginTop: 6 }}>
                      <Gavel size={13} /> This item is up for auction — place a bid to purchase
                    </span>
                  ) : isPriceNegotiable && (
                    <button type="button" onClick={handleRequestQuote}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 600, color: '#a855f7', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, padding: 0, width: 'fit-content', marginTop: 6 }}>
                      {inQL ? 'Price is negotiable — View in Quote List →' : 'Price is negotiable — request a quote'}
                    </button>
                  )}
                </div>

                {/* Stock status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: inStock ? '#10b981' : '#ef4444', boxShadow: inStock ? '0 0 0 3px rgba(16,185,129,0.2)' : '0 0 0 3px rgba(239,68,68,0.2)' }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: inStock ? '#059669' : '#dc2626' }}>
                    {inStock ? 'In Stock — Ready to Ship' : 'Out of Stock'}
                  </span>
                </div>

                {/* Variants */}
                {hasVariants && Array.isArray(variants) && variants.length > 0 && (
                  <div>
                    <p style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                      Available Options
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {variants.map((variant, idx) => {
                        const label = typeof variant === 'string' ? variant : variant?.name || `Option ${idx + 1}`;
                        const vPrice = typeof variant === 'object' ? variant?.price : null;
                        const isSelected = selectedVariant === variant;
                        return (
                          <button
                            key={idx}
                            onClick={() => setSelectedVariant(variant)}
                            type="button"
                            style={{
                              padding: '8px 16px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
                              border: isSelected ? '2px solid #a855f7' : '2px solid #e5e7eb',
                              background: isSelected ? '#a855f7' : 'white',
                              color: isSelected ? 'white' : '#374151',
                              cursor: 'pointer', transition: 'all 150ms ease',
                              boxShadow: isSelected ? '0 2px 8px rgba(168,85,247,0.3)' : 'none',
                            }}
                          >
                            {label}{vPrice && <span style={{ marginLeft: 6, opacity: 0.8, fontSize: '0.75rem' }}>KSh {Number(vPrice).toLocaleString()}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Quantity + Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Quantity selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Qty</p>
                    <div style={{ display: 'inline-flex', alignItems: 'center', border: '1.5px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', background: 'white' }}>
                      <button
                        onClick={() => setQuantity(q => Math.max(1, q - 1))}
                        type="button"
                        style={{ width: 36, height: 36, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >−</button>
                      <span style={{ width: 40, textAlign: 'center', fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>{quantity}</span>
                      <button
                        onClick={() => setQuantity(q => q + 1)}
                        type="button"
                        style={{ width: 36, height: 36, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >+</button>
                    </div>
                  </div>

                  {/* CTA buttons */}
                  {(() => {
                    if (hasAuction) {
                      return (
                        <button
                          type="button"
                          onClick={() => navigate(`/auctions/${auction.id}`)}
                          style={{
                            width: '100%', height: 48, borderRadius: 12,
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
                      <>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button
                            onClick={handleAddToCart}
                            disabled={!inStock}
                            type="button"
                            style={{
                              flex: 1, height: 48, borderRadius: 12, border: '2px solid #111827',
                              background: addedToCart ? '#111827' : 'white',
                              color: addedToCart ? 'white' : '#111827',
                              fontSize: '0.85rem', fontWeight: 700, cursor: inStock ? 'pointer' : 'not-allowed',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                              transition: 'all 200ms ease', opacity: inStock ? 1 : 0.4,
                              letterSpacing: '0.04em',
                            }}
                          >
                            {addedToCart ? <><Check size={16} /> Added!</> : <><ShoppingCart size={16} /> Add to Cart</>}
                          </button>
                          {!isPriceNegotiable && (
                            <>

                              <button
                                onClick={handleBuyNow}
                                disabled={!inStock}
                                type="button"
                                style={{
                                  flex: 1, height: 48, borderRadius: 12, border: 'none',
                                  background: inStock ? 'linear-gradient(135deg, #a855f7, #7c3aed)' : '#e5e7eb',
                                  color: 'white', fontSize: '0.85rem', fontWeight: 700,
                                  cursor: inStock ? 'pointer' : 'not-allowed',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                  boxShadow: inStock ? '0 4px 15px rgba(168,85,247,0.35)' : 'none',
                                  transition: 'all 200ms ease', opacity: inStock ? 1 : 0.4,
                                  letterSpacing: '0.04em',
                                }}
                              >
                                <ShoppingBag size={16} /> Buy Now
                              </button>
                            </>
                          )}

                          {/* Quote button — full width when negotiable, icon-only when not */}
                          <button
                            onClick={handleRequestQuote}
                            type="button"
                            style={{
                              ...(isPriceNegotiable ? { flex: 1 } : { width: 48, flexShrink: 0 }),
                              height: 48, borderRadius: 12, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                              fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.04em',
                              border: inQL ? '1.5px solid #a855f7' : '1.5px solid rgba(168,85,247,0.35)',
                              background: inQL ? 'rgba(168,85,247,0.15)' : 'transparent',
                              color: inQL ? '#7c3aed' : '#a855f7',
                              transition: 'all 150ms ease',
                            }}
                            title={inQL ? 'In quote list — click to view' : 'Add to quote list'}
                          >
                            <FileText size={16} />
                            {isPriceNegotiable ? (inQL ? 'In Quote List →' : 'Request a Quote') : ''}
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Trust strip */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, paddingTop: 8, borderTop: '1px solid #f3f4f6' }}>
                  {[
                    { icon: <Truck size={16} />, label: 'Free Delivery', sub: 'Orders over KSh 5,000' },
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

                {/* Key features */}
                {Array.isArray(product?.features) && product.features.length > 0 && (
                  <div style={{ background: 'white', borderRadius: 12, padding: '16px 18px', border: '1px solid #f3f4f6' }}>
                    <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Key Features</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {product.features.slice(0, 5).map((feature, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(168,85,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                            <Check size={10} style={{ color: '#a855f7' }} />
                          </span>
                          <span style={{ fontSize: '0.83rem', color: '#374151', lineHeight: 1.4 }}>{feature}</span>
                        </div>
                      ))}
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
                    {/* Rating summary */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28, padding: '20px 24px', background: '#fefce8', borderRadius: 12, border: '1px solid #fef08a' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '3rem', fontWeight: 800, color: '#111827', lineHeight: 1 }}>
                          {averageRating.toFixed(1)}
                        </div>
                        <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: 4 }}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} size={14} style={{ color: i < Math.round(averageRating) ? '#f59e0b' : '#e5e7eb', fill: i < Math.round(averageRating) ? '#f59e0b' : '#e5e7eb' }} />
                          ))}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 4 }}>{totalReviews} reviews</div>
                      </div>
                    </div>

                    {/* Write a Review section */}  
                    {canReview && !showReviewForm && (  
                      <div style={{ marginBottom: 24, textAlign: 'center' }}>  
                        <button  
                          onClick={() => setShowReviewForm(true)}  
                          style={{  
                            padding: '12px 28px', borderRadius: 12, border: 'none',  
                            background: 'linear-gradient(135deg, #a855f7, #7c3aed)',  
                            color: 'white', fontSize: '0.88rem', fontWeight: 700,  
                            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,  
                            boxShadow: '0 4px 14px rgba(168,85,247,0.3)',  
                            transition: 'all 0.2s ease',  
                          }}  
                        >  
                          <Star size={16} fill="white" /> Write a Review  
                        </button>  
                      </div>  
                    )}  
                      
                    {!isAuthenticated && (  
                      <div style={{ marginBottom: 24, textAlign: 'center', padding: '16px', background: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb' }}>  
                        <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: 0 }}>  
                          <a href="/login" style={{ color: '#a855f7', fontWeight: 600 }}>Log in</a> to write a review  
                        </p>  
                      </div>  
                    )}  
                      
                    {isAuthenticated && !canReview && (  
                      <div style={{ marginBottom: 24, textAlign: 'center', padding: '16px', background: '#fefce8', borderRadius: 12, border: '1px solid #fef08a' }}>  
                        <p style={{ fontSize: '0.85rem', color: '#92400e', margin: 0 }}>  
                          Purchase this product to leave a review  
                        </p>  
                      </div>  
                    )}  
                      
                    {showReviewForm && (  
                      <div style={{ marginBottom: 28, padding: 24, borderRadius: 16, border: '1.5px solid rgba(168,85,247,0.2)', background: 'linear-gradient(180deg, #ffffff 0%, #faf5ff 100%)' }}>  
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>  
                          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#7c3aed', margin: 0 }}>Write Your Review</h3>  
                          <button onClick={() => { setShowReviewForm(false); setReviewError(''); }}  
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1.2rem' }}>✕</button>  
                        </div>  
                      
                        {/* Order selector (if multiple eligible orders) */}  
                        {eligibleOrders.length > 1 && (  
                          <div style={{ marginBottom: 16 }}>  
                            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>Select Order *</label>  
                            <select  
                              value={reviewData.order_id}  
                              onChange={e => setReviewData(prev => ({ ...prev, order_id: e.target.value }))}  
                              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: '0.85rem', color: '#111827', background: '#fff' }}  
                            >  
                              <option value="">Choose an order...</option>  
                              {eligibleOrders.map(o => (  
                                <option key={o.order_id} value={o.order_id}>Order #{o.order_number}</option>  
                              ))}  
                            </select>  
                          </div>  
                        )}  
                      
                        {/* Star rating (1-5) */}  
                        <div style={{ marginBottom: 16 }}>  
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>Rating *</label>  
                          <div style={{ display: 'flex', gap: 6 }}>  
                            {[1, 2, 3, 4, 5].map(n => (  
                              <button key={n} onClick={() => setReviewData(prev => ({ ...prev, rating: n }))} type="button"  
                                style={{  
                                  background: 'none', border: 'none', cursor: 'pointer', padding: 2, transition: 'transform 0.1s',  
                                }}  
                                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}  
                                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}  
                              >  
                                <Star size={28} fill={n <= reviewData.rating ? '#f59e0b' : 'none'} color={n <= reviewData.rating ? '#f59e0b' : '#d1d5db'} />  
                              </button>  
                            ))}  
                            {reviewData.rating > 0 && (  
                              <span style={{ alignSelf: 'center', marginLeft: 8, fontSize: '0.82rem', fontWeight: 600, color: '#6b7280' }}>  
                                {reviewData.rating === 1 ? 'Poor' : reviewData.rating === 2 ? 'Fair' : reviewData.rating === 3 ? 'Good' : reviewData.rating === 4 ? 'Very Good' : 'Excellent'}  
                              </span>  
                            )}  
                          </div>  
                        </div>  
                      
                        {/* Title */}  
                        <div style={{ marginBottom: 16 }}>  
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>Review Title</label>  
                          <input  
                            value={reviewData.title}  
                            onChange={e => setReviewData(prev => ({ ...prev, title: e.target.value }))}  
                            placeholder="Sum up your review in one line"  
                            maxLength={255}  
                            style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: '0.85rem', color: '#111827', background: '#fff', boxSizing: 'border-box' }}  
                          />  
                        </div>  
                      
                        {/* Comment */}  
                        <div style={{ marginBottom: 16 }}>  
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>Your Review</label>  
                          <textarea  
                            value={reviewData.comment}  
                            onChange={e => setReviewData(prev => ({ ...prev, comment: e.target.value }))}  
                            placeholder="What did you like or dislike about this product?"  
                            rows={4}  
                            maxLength={2000}  
                            style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: '0.85rem', color: '#111827', background: '#fff', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}  
                          />  
                        </div>  
                      
                        {/* Image upload */}  
                        <div style={{ marginBottom: 20 }}>  
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>Photos (optional, max 5)</label>  
                          <input  
                            type="file"  
                            accept="image/*"  
                            multiple  
                            onChange={e => {  
                              const files = Array.from(e.target.files).slice(0, 5);  
                              setReviewData(prev => ({ ...prev, images: files }));  
                            }}  
                            style={{ fontSize: '0.82rem', color: '#6b7280' }}  
                          />  
                          {reviewData.images.length > 0 && (  
                            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 4 }}>{reviewData.images.length} image(s) selected</p>  
                          )}  
                        </div>  
                      
                        {/* Error message */}  
                        {reviewError && (  
                          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>  
                            <p style={{ fontSize: '0.82rem', color: '#dc2626', margin: 0 }}>{reviewError}</p>  
                          </div>  
                        )}  
                      
                        {/* Submit */}  
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>  
                          <button onClick={() => { setShowReviewForm(false); setReviewError(''); }}  
                            style={{ padding: '10px 20px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>  
                            Cancel  
                          </button>  
                          <button onClick={handleSubmitReview} disabled={submittingReview || !reviewData.rating}  
                            style={{  
                              padding: '10px 24px', borderRadius: 10, border: 'none',  
                              background: !reviewData.rating ? '#d1d5db' : 'linear-gradient(135deg, #a855f7, #7c3aed)',  
                              color: 'white', fontSize: '0.85rem', fontWeight: 700,  
                              cursor: !reviewData.rating ? 'not-allowed' : 'pointer',  
                              opacity: submittingReview ? 0.7 : 1,  
                              display: 'inline-flex', alignItems: 'center', gap: 6,  
                            }}>  
                            {submittingReview ? 'Submitting...' : 'Submit Review'}  
                          </button>  
                        </div>  
                      </div>  
                    )}

                    {reviews.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {reviews.map(review => (
                          <ReviewCard key={review?.id} review={review} onMarkHelpful={handleMarkHelpful} />
                        ))}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '48px 24px', color: '#9ca3af' }}>
                        <Star size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                        <p style={{ fontWeight: 600, marginBottom: 4 }}>No reviews yet</p>
                        <p style={{ fontSize: '0.85rem' }}>Be the first to review this product!</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── RELATED PRODUCTS ─────────────────────────────────────────────── */}
          {relatedProducts.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#c084fc', letterSpacing: '-0.02em', margin: 0 }}>
                  You May Also Like
                </h2>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{relatedProducts.length} items</span>
              </div>
              <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                {relatedProducts.map(rp => (
                  <ProductCard key={rp?.id} product={rp} />
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