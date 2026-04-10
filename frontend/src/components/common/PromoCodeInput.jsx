import { useState } from 'react';
import { Tag, X, CheckCircle, Loader } from 'lucide-react';
import usePromoCodeStore from '../../store/promoCodeStore';

/**
 * PromoCodeInput — reusable promo code entry + validation component.
 *
 * Props:
 *   orderValue        {number}   current subtotal for discount calculation
 *   referralDiscount  {number}   existing referral discount (for stacking check)
 *   customerId        {number?}  if set, uses admin validate endpoint
 *   onApplied         {fn}       called with { code, discount } when applied
 *   onCleared         {fn}       called when promo removed
 *   disabled          {boolean}
 *   symbol            {string}   currency symbol e.g. 'KSh'
 */
export default function PromoCodeInput({
  orderValue       = 0,
  referralDiscount = 0,
  customerId       = null,
  onApplied,
  onCleared,
  disabled         = false,
  symbol           = 'KSh',
}) {
  const [input, setInput] = useState('');
  const {
    appliedPromo,
    promoError,
    promoLoading,
    applyPromoCode,
    adminApplyPromoCode,
    clearPromo,
  } = usePromoCodeStore();

  const fmt = (n) =>
    new Intl.NumberFormat('en-KE', {
      minimumFractionDigits:  2,
      maximumFractionDigits:  2,
    }).format(Number(n || 0));

  const handleApply = async () => {
    if (!input.trim()) return;
    try {
      if (customerId) {
        await adminApplyPromoCode(input, orderValue, customerId, referralDiscount);
      } else {
        await applyPromoCode(input, orderValue, referralDiscount);
      }
      onApplied?.(usePromoCodeStore.getState().appliedPromo);
    } catch {
      // error already set in store
    }
  };

  const handleClear = () => {
    setInput('');
    clearPromo();
    onCleared?.();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleApply(); }
  };

  // ── Applied state ─────────────────────────────────────────────────────────
  if (appliedPromo) {
    return (
      <div style={{
        padding:      '12px 14px',
        borderRadius: 12,
        background:   'rgba(168,85,247,0.06)',
        border:       '1.5px solid rgba(168,85,247,0.25)',
        display:      'flex',
        alignItems:   'flex-start',
        gap:          10,
      }}>
        <CheckCircle size={16} color="#a855f7" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#7c3aed', margin: 0 }}>
                {appliedPromo.code}
              </p>
              <p style={{ fontSize: '0.72rem', color: '#a855f7', margin: '2px 0 0' }}>
                {appliedPromo.name}
              </p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{ fontSize: '0.92rem', fontWeight: 800, color: '#7c3aed', margin: 0 }}>
                -{symbol} {fmt(appliedPromo.discount)}
              </p>
              <p style={{ fontSize: '0.68rem', color: '#a855f7', margin: '1px 0 0' }}>
                {appliedPromo.reward_type === 'percentage'
                  ? `${appliedPromo.reward_value}% off`
                  : 'Fixed discount'}
              </p>
            </div>
          </div>
          {appliedPromo.stackable && referralDiscount > 0 && (
            <p style={{
              fontSize: '0.68rem', color: '#10b981', marginTop: 4,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              ✓ Stacked with referral discount
            </p>
          )}
        </div>
        {!disabled && (
          <button
            onClick={handleClear}
            type="button"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#9ca3af', padding: 2, flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>
    );
  }

  // ── Input state ───────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        {/* Input */}
        <div style={{ position: 'relative', flex: 1 }}>
          <Tag
            size={13}
            color="#9ca3af"
            style={{
              position:  'absolute', left: 11,
              top:       '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder="Enter promo code"
            disabled={disabled || promoLoading}
            style={{
              width:        '100%',
              padding:      '9px 12px 9px 32px',
              borderRadius: 10,
              border:       `1.5px solid ${promoError ? '#ef4444' : '#e5e7eb'}`,
              fontSize:     '0.82rem',
              fontWeight:   600,
              outline:      'none',
              background:   'white',
              color:        '#111827',
              letterSpacing:'0.05em',
              boxSizing:    'border-box',
              transition:   'border-color 0.15s',
              fontFamily:   'monospace',
            }}
            onFocus={e => {
              if (!promoError) e.currentTarget.style.borderColor = '#a855f7';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.08)';
            }}
            onBlur={e => {
              if (!promoError) e.currentTarget.style.borderColor = '#e5e7eb';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>

        {/* Apply button */}
        <button
          type="button"
          onClick={handleApply}
          disabled={disabled || promoLoading || !input.trim()}
          style={{
            padding:      '9px 16px',
            borderRadius: 10,
            border:       'none',
            background:   (disabled || promoLoading || !input.trim())
                            ? '#e5e7eb'
                            : 'linear-gradient(135deg,#a855f7,#7c3aed)',
            color:        (disabled || promoLoading || !input.trim())
                            ? '#9ca3af'
                            : 'white',
            fontSize:     '0.82rem',
            fontWeight:   700,
            cursor:       (disabled || promoLoading || !input.trim())
                            ? 'not-allowed'
                            : 'pointer',
            display:      'inline-flex',
            alignItems:   'center',
            gap:          6,
            whiteSpace:   'nowrap',
            transition:   'all 0.15s',
            boxShadow:    (disabled || promoLoading || !input.trim())
                            ? 'none'
                            : '0 4px 12px rgba(168,85,247,0.3)',
          }}
        >
          {promoLoading
            ? <><Loader size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Checking…</>
            : 'Apply'}
        </button>
      </div>

      {/* Error message */}
      {promoError && (
        <p style={{
          fontSize: '0.72rem', color: '#ef4444',
          marginTop: 5, display: 'flex', alignItems: 'center', gap: 4,
        }}>
          ✕ {promoError}
        </p>
      )}

      {/* Hint */}
      {!promoError && (
        <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 4 }}>
          Press Enter or click Apply to validate
        </p>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}