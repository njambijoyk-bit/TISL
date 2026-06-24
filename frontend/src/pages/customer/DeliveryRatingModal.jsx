import { useState } from 'react';
import { Star, X, Loader2 } from 'lucide-react';
import deliveryAPI from '../../api/delivery';
import toast from 'react-hot-toast';

// ── Overlay / Modal shell ─────────────────────────────────────────────────────
function ModalShell({ onClose, children }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 20, width: '100%', maxWidth: 440,
          boxShadow: '0 24px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(168,85,247,0.12)',
          overflow: 'hidden',
        }}
      >
        {/* Purple accent top bar */}
        <div style={{ height: 4, background: 'linear-gradient(90deg,#a855f7,#7c3aed)' }} />
        {children}
      </div>
    </div>
  );
}

// ── Star rating input ─────────────────────────────────────────────────────────
const STAR_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

function StarRating({ value, onChange }) {
  const [hovered, setHovered] = useState(0);
  const active = hovered || value;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 8 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 2,
              transition: 'transform 0.15s',
              transform: active >= n ? 'scale(1.15)' : 'scale(1)',
            }}
          >
            <Star
              size={34}
              fill={active >= n ? '#f59e0b' : 'none'}
              color={active >= n ? '#f59e0b' : '#d1d5db'}
              strokeWidth={1.5}
            />
          </button>
        ))}
      </div>
      <p style={{
        textAlign: 'center', fontSize: 13, fontWeight: 600, margin: 0,
        color: active ? '#d97706' : '#9ca3af',
        minHeight: 20,
        transition: 'color 0.15s',
      }}>
        {active ? STAR_LABELS[active] : 'Tap a star to rate'}
      </p>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function DeliveryRatingModal({ orderId, deliveryItemId, onClose, onSuccess }) {
  const [rating, setRating]   = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = rating > 0 && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      await deliveryAPI.rateDelivery({
        order_id:         Number(orderId),
        delivery_item_id: deliveryItemId,
        rating,
        comment: comment.trim() || null,
      });
      onSuccess?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not submit rating.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      {/* Header */}
      <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#111827' }}>Rate Your Delivery</p>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: '#9ca3af' }}>Your feedback helps us improve.</p>
        </div>
        <button
          type="button" onClick={onClose}
          style={{ background: 'rgba(168,85,247,0.07)', border: '1px solid rgba(168,85,247,0.15)', borderRadius: 10, padding: 6, cursor: 'pointer', lineHeight: 0 }}
        >
          <X size={15} color="#a855f7" />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '24px 20px 20px' }}>

        {/* Stars */}
        <div style={{
          background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)',
          borderRadius: 16, padding: '20px 16px', marginBottom: 16,
        }}>
          <StarRating value={rating} onChange={setRating} />
        </div>

        {/* Comment */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#c084fc', marginBottom: 6 }}>
            Comment <span style={{ color: '#9ca3af', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(optional)</span>
          </label>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Anything you'd like to share about this delivery…"
            style={{
              width: '100%', resize: 'vertical', boxSizing: 'border-box',
              border: '1px solid rgba(168,85,247,0.2)', borderRadius: 12,
              padding: '10px 12px', fontSize: 13, color: '#111827',
              outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
            }}
            onFocus={e => e.target.style.borderColor = '#a855f7'}
            onBlur={e => e.target.style.borderColor = 'rgba(168,85,247,0.2)'}
          />
          <p style={{ textAlign: 'right', fontSize: 11, color: '#9ca3af', margin: '4px 0 0' }}>
            {comment.length}/1000
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button" onClick={onClose}
            style={{
              flex: 1, padding: '10px 16px', borderRadius: 12, border: '1px solid #e5e7eb',
              background: 'transparent', fontSize: 13, fontWeight: 600, color: '#6b7280', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button" onClick={handleSubmit} disabled={!canSubmit}
            style={{
              flex: 2, padding: '10px 16px', borderRadius: 12, border: 'none',
              background: canSubmit
                ? 'linear-gradient(135deg,#fbbf24,#d97706)'
                : 'rgba(245,158,11,0.25)',
              fontSize: 13, fontWeight: 700, color: canSubmit ? 'white' : '#d97706',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              boxShadow: canSubmit ? '0 4px 14px rgba(245,158,11,0.3)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {loading ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Submitting…</> : <><Star size={14} fill="white" /> Submit Rating</>}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </ModalShell>
  );
}
