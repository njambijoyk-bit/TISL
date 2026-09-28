import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FileText, Package, Trash2, Plus, Minus, ArrowRight, ShoppingBag, X } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import useQuoteListStore, { quoteKey } from '../../../_shared/store/quoteListStore';
import toast from 'react-hot-toast';

const purple   = 'var(--color-primary-500)';
const purpleDk = 'var(--color-primary-600)';
const purpleLt = 'color-mix(in srgb, var(--color-primary-500) 8%, transparent)';
const purpleBd = 'color-mix(in srgb, var(--color-primary-500) 20%, transparent)';
const fieldStyle = { padding: '7px 10px', border: `1px solid ${purpleBd}`, borderRadius: 8, fontSize: '0.78rem', outline: 'none', background: purpleLt, fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' };

export default function QuoteList() {
  const navigate = useNavigate();
  const { items, removeItem, updateQuantity, updateNotes, updateAnswers, clearList } = useQuoteListStore();

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
    // A service's required details must be filled in before it can be quoted.
    const missing = items.flatMap(({ product, answers }) =>
      (product.requirement_fields ?? [])
        .filter(f => f.is_required && f.field_type !== 'file' && !String(answers?.[f.id] ?? '').trim())
        .map(f => `${product.name}: ${f.label}`));
    if (missing.length) {
      toast.error(`Please fill in: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` and ${missing.length - 3} more` : ''}`);
      return;
    }
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
              boxShadow: '0 4px 14px color-mix(in srgb, var(--color-primary-500) 35%, transparent)',
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
          {items.map(({ product, quantity, notes, answers }) => (
            <QuoteListItem
              key={quoteKey(product)}
              product={product}
              quantity={quantity}
              notes={notes}
              answers={answers ?? {}}
              onRemove={() => handleRemove(quoteKey(product), product.name)}
              onQuantityChange={(q) => updateQuantity(quoteKey(product), q)}
              onNotesChange={(n) => updateNotes(quoteKey(product), n)}
              onAnswersChange={(a) => updateAnswers(quoteKey(product), a)}
            />
          ))}
        </div>

        {/* ── Summary panel ──────────────────────────────────────────────── */}
        <div style={{
          background: 'white', borderRadius: 16, padding: 24,
          border: `1px solid ${purpleBd}`,
          boxShadow: '0 4px 24px color-mix(in srgb, var(--color-primary-500) 8%, transparent)',
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
              boxShadow: '0 4px 14px color-mix(in srgb, var(--color-primary-500) 35%, transparent)',
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
function QuoteListItem({ product, quantity, notes, answers, onRemove, onQuantityChange, onNotesChange, onAnswersChange }) {
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
        {product.package ? (
          <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 10px' }}>
            {[product.package.label && product.package.label !== 'Standard' ? product.package.label : null,
              product.package.duration,
              product.package.display_price != null ? `${Number(product.package.display_price).toLocaleString()} ${product.package.display_currency ?? ''}${product.package.price_unit ? ` per ${product.package.price_unit.toLowerCase()}` : ''}` : null,
            ].filter(Boolean).join(' · ') || 'Standard package'}
          </p>
        ) : product.short_description && (
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

        {(product.requirement_fields ?? []).length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ margin: 0, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280' }}>What we need from you</p>
            {product.requirement_fields.map(f => (
              <label key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '0.76rem', color: '#374151' }}>
                <span>{f.label}{f.is_required ? ' *' : ''}{f.help_text ? <span style={{ color: '#9ca3af' }}> — {f.help_text}</span> : null}</span>
                {f.field_type === 'select' ? (
                  <select value={answers[f.id] ?? ''} onChange={e => onAnswersChange({ ...answers, [f.id]: e.target.value })} style={fieldStyle}>
                    <option value="">Choose…</option>
                    {(f.choices ?? []).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : f.field_type === 'textarea' ? (
                  <textarea rows={2} value={answers[f.id] ?? ''} onChange={e => onAnswersChange({ ...answers, [f.id]: e.target.value })} style={{ ...fieldStyle, resize: 'vertical' }} />
                ) : f.field_type === 'file' ? (
                  <span style={{ color: '#9ca3af' }}>You can send photos or documents after the quote request is submitted.</span>
                ) : (
                  <input type={f.field_type === 'number' ? 'number' : 'text'} value={answers[f.id] ?? ''} onChange={e => onAnswersChange({ ...answers, [f.id]: e.target.value })} style={fieldStyle} />
                )}
              </label>
            ))}
          </div>
        )}

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