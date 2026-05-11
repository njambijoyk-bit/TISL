import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FileText, Package, Trash2, Plus, Minus, ArrowRight, ShoppingBag, X } from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import useQuoteListStore from '../../store/quoteListStore';
import toast from 'react-hot-toast';

const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

export default function QuoteList() {
  const navigate = useNavigate();
  const { items, removeItem, updateQuantity, updateNotes, clearList } = useQuoteListStore();

  const handleRemove = (productId, name) => {
    removeItem(productId);
    toast.success(`${name} removed from quote list`);
  };

  const handleClear = () => {
    clearList();
    toast.success('Quote list cleared');
  };

  const handleRequestQuote = () => {
    if (items.length === 0) return;
    navigate('/request-quote', { state: { fromQuoteList: true } });
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header />
        <div style={{ maxWidth: 600, margin: '80px auto', textAlign: 'center', padding: '0 24px' }}>
          <div style={{
            width: 80, height: 80, borderRadius: 24, margin: '0 auto 24px',
            background: purpleLt, border: `1.5px solid ${purpleBd}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FileText size={36} color={purple} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#111827', marginBottom: 8 }}
            className="dark:text-white">
            Your quote list is empty
          </h2>
          <p style={{ color: '#6b7280', marginBottom: 32 }}>
            Add products you'd like to request a quote for, then submit them all at once.
          </p>
          <button
            onClick={() => navigate('/products')}
            style={{
              padding: '12px 28px', borderRadius: 12,
              background: `linear-gradient(135deg,${purple},${purpleDk})`,
              color: 'white', border: 'none', cursor: 'pointer',
              fontSize: '0.9rem', fontWeight: 700,
              boxShadow: '0 4px 14px rgba(168,85,247,0.35)',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
          >
            <ShoppingBag size={16} /> Browse Products
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{
        borderBottom: `1px solid ${purpleBd}`,
        padding: '32px 24px 28px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* BG blobs */}
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: purpleLt, pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: purpleLt, border: `1.5px solid ${purpleBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <FileText size={24} color={purple} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: purple, margin: '0 0 2px' }}>
                Quote List
              </h1>
              <p style={{ fontSize: '0.83rem', color: '#6b7280', margin: 0 }}>
                {items.length} item{items.length !== 1 ? 's' : ''} — review then request quote
              </p>
            </div>
          </div>
          <button
            onClick={handleClear}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, color: '#ef4444', border: '1px solid #fca5a5', background: 'rgba(239,68,68,0.05)', cursor: 'pointer' }}
          >
            <Trash2 size={13} /> Clear All
          </button>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start"
      style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {/* ── Item list ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map(({ product, quantity, notes }) => (
            <QuoteListItem
              key={product.id}
              product={product}
              quantity={quantity}
              notes={notes}
              onRemove={() => handleRemove(product.id, product.name)}
              onQuantityChange={(q) => updateQuantity(product.id, q)}
              onNotesChange={(n) => updateNotes(product.id, n)}
            />
          ))}
        </div>

        {/* ── Summary panel ──────────────────────────────────────────────── */}
        <div style={{
          background: 'white', borderRadius: 16, padding: 24,
          border: `1px solid ${purpleBd}`,
          boxShadow: '0 4px 24px rgba(168,85,247,0.08)',
          position: 'sticky', top: 80,
        }} className="dark:bg-gray-800">
          <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#111827', marginBottom: 20 }} className="dark:text-white">
            Summary
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {items.map(({ product, quantity }) => (
              <div key={product.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#6b7280' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                  {product.name}
                </span>
                <span style={{ fontWeight: 600, flexShrink: 0 }}>× {quantity}</span>
              </div>
            ))}
          </div>

          <div style={{ height: 1, background: purpleBd, marginBottom: 20 }} />

          <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: 20, lineHeight: 1.6 }}>
            Prices will be confirmed in the quote. You can add notes per item to specify requirements.
          </div>

          <button
            onClick={handleRequestQuote}
            style={{
              width: '100%', padding: '13px', borderRadius: 12,
              background: `linear-gradient(135deg,${purple},${purpleDk})`,
              color: 'white', border: 'none', cursor: 'pointer',
              fontSize: '0.9rem', fontWeight: 800,
              boxShadow: '0 4px 14px rgba(168,85,247,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'opacity 150ms',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            <FileText size={16} /> Request Quote <ArrowRight size={15} />
          </button>

          <Link
            to="/products"
            style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: '0.8rem', color: purple, textDecoration: 'none', fontWeight: 600 }}
          >
            + Add more products
          </Link>
        </div>
      </div>

      <Footer />

      {/* Responsive: stack on mobile */}
      <style>{`
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 1fr 320px"] {
            grid-template-columns: 1fr !important;
          }
          div[style*="position: sticky"] {
            position: static !important;
          }
        }
      `}</style>
    </div>
  );
}

// ── Individual item row ───────────────────────────────────────────────────────
function QuoteListItem({ product, quantity, notes, onRemove, onQuantityChange, onNotesChange }) {
  const [showNotes, setShowNotes] = useState(!!notes);
  const [imageError, setImageError] = useState(false);
  const imageUrl = product?.main_image_url ?? null;

  return (
    <div style={{
      background: 'white', borderRadius: 14, padding: '16px',
      border: `1px solid ${purpleBd}`,
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      display: 'flex', gap: 14, alignItems: 'flex-start',
    }} className="dark:bg-gray-800">

      {/* Thumbnail */}
      <div style={{ width: 60, height: 60, borderRadius: 10, overflow: 'hidden', background: '#f3f4f6', flexShrink: 0 }} className="dark:bg-gray-700">
        {!imageError && imageUrl ? (
          <img src={imageUrl} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setImageError(true)} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Package size={24} color="#d1d5db" />
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 700, fontSize: '0.88rem', color: purple, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {product.name}
        </p>
        {product.short_description && (
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '0 0 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {product.short_description}
          </p>
        )}

        {/* Quantity control */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${purpleBd}`, borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => onQuantityChange(quantity - 1)} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: purpleLt, border: 'none', cursor: 'pointer', color: purple }}>
              <Minus size={12} />
            </button>
            <span style={{ padding: '0 12px', fontSize: '0.83rem', fontWeight: 700, color: '#111827', minWidth: 32, textAlign: 'center' }} className="dark:text-white">
              {quantity}
            </span>
            <button onClick={() => onQuantityChange(quantity + 1)} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: purpleLt, border: 'none', cursor: 'pointer', color: purple }}>
              <Plus size={12} />
            </button>
          </div>

          <button
            onClick={() => setShowNotes(s => !s)}
            style={{ fontSize: '0.72rem', fontWeight: 600, color: showNotes ? purple : '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
          >
            {showNotes ? 'Hide notes' : '+ Add notes'}
          </button>
        </div>

        {showNotes && (
          <textarea
            value={notes}
            onChange={e => onNotesChange(e.target.value)}
            placeholder="Specifications, size, color, quantity unit, delivery requirements…"
            rows={2}
            style={{
              marginTop: 10, width: '100%', padding: '8px 12px',
              border: `1px solid ${purpleBd}`, borderRadius: 8,
              fontSize: '0.78rem', color: '#374151', resize: 'vertical',
              outline: 'none', background: purpleLt,
              fontFamily: 'inherit', boxSizing: 'border-box',
            }}
            className="dark:text-gray-200 dark:bg-gray-700"
          />
        )}
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.07)', border: '1px solid #fca5a5', cursor: 'pointer', color: '#ef4444', transition: 'all 150ms' }}
        onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = 'white'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.07)'; e.currentTarget.style.color = '#ef4444'; }}
      >
        <X size={13} />
      </button>
    </div>
  );
}