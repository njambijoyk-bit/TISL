import { useEffect } from 'react';
import { CheckCircle2, Gift, ShieldAlert, Sparkles, X } from 'lucide-react';

const cardStyle = {
  background: 'white',
  borderRadius: 18,
  border: '2px solid #111827',
  boxShadow: '10px 10px 0 #c4b5fd',
  width: '100%',
  maxWidth: 520,
  overflow: 'hidden',
};

const pillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 999,
  fontSize: '0.72rem',
  fontWeight: 800,
  border: '1.5px solid #e5e7eb',
  background: '#f9fafb',
  color: '#374151',
};

const ruleTypeMeta = {
  cashback: {
    label: 'Cashback',
    color: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    emoji: '💸',
  },
  voucher: {
    label: 'Voucher',
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    emoji: '🎟️',
  },
  gift: {
    label: 'Gift',
    color: '#d97706',
    bg: '#fff7ed',
    border: '#fed7aa',
    emoji: '🎁',
  },
};

function formatKes(value) {
  return Number(value ?? 0).toLocaleString('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
  });
}

function formatPoints(value) {
  return Number(value ?? 0).toLocaleString('en-KE');
}

export default function LoyaltyRedemptionModal({
  open,
  rule,
  rules = [],
  currentPoints = 0,
  minRedemptionPoints = 0,
  loading = false,
  success = null,
  onClose,
  onConfirm,
}) {
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !rule) return null;

  const meta = ruleTypeMeta[rule.type] ?? ruleTypeMeta.cashback;
  const requiredPoints = Number(rule.points_required ?? 0);
  const valueKes = Number(rule.value_kes ?? 0);
  const meetsMinThreshold = Number(currentPoints) >= Number(minRedemptionPoints);
  const hasEnoughPoints = Number(currentPoints) >= requiredPoints;
  const canConfirm = hasEnoughPoints && meetsMinThreshold && !loading && !success;

  const availableRules = rules.filter((item) => {
    const itemPoints = Number(item.points_required ?? 0);
    return Number(currentPoints) >= itemPoints && Number(currentPoints) >= Number(minRedemptionPoints);
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="loyalty-redemption-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(17,24,39,0.68)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div style={cardStyle}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            padding: '18px 20px 16px',
            borderBottom: '2px solid #111827',
            background: '#faf5ff',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: '0 0 6px', fontSize: '0.72rem', fontWeight: 900, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Redeem points
            </p>
            <h2
              id="loyalty-redemption-title"
              style={{
                margin: 0,
                fontSize: '1.15rem',
                fontWeight: 900,
                color: '#111827',
                lineHeight: 1.2,
              }}
            >
              {rule.name}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close redemption modal"
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              border: '2px solid #111827',
              background: 'white',
              color: '#111827',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {!success ? (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  borderRadius: 16,
                  border: `2px solid ${meta.border}`,
                  background: meta.bg,
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'white',
                    border: '2px solid #111827',
                    fontSize: '1.2rem',
                    flexShrink: 0,
                  }}
                >
                  {meta.emoji}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: '0 0 2px', fontSize: '0.85rem', fontWeight: 800, color: meta.color }}>
                    {meta.label}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#374151' }}>
                    {formatPoints(requiredPoints)} points → {valueKes > 0 ? formatKes(valueKes) : 'reward value not set'}
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                <div style={{ ...pillStyle, justifyContent: 'center' }}>
                  <Sparkles size={14} color="#7c3aed" />
                  Your points: {formatPoints(currentPoints)}
                </div>
                <div style={{ ...pillStyle, justifyContent: 'center' }}>
                  <Gift size={14} color="#d97706" />
                  Min threshold: {formatPoints(minRedemptionPoints)}
                </div>
                <div style={{ ...pillStyle, justifyContent: 'center' }}>
                  <CheckCircle2 size={14} color={canConfirm ? '#059669' : '#dc2626'} />
                  {canConfirm ? 'Eligible' : 'Not eligible'}
                </div>
              </div>

              <div
                style={{
                  padding: 16,
                  borderRadius: 16,
                  border: '2px solid #111827',
                  background: '#f9fafb',
                  marginBottom: 16,
                }}
              >
                <p style={{ margin: '0 0 10px', fontSize: '0.82rem', fontWeight: 800, color: '#111827' }}>
                  Redemption checks
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: hasEnoughPoints ? '#059669' : '#dc2626', fontWeight: 700 }}>
                    <CheckCircle2 size={14} />
                    {hasEnoughPoints
                      ? `You have enough points for this rule.`
                      : `You need ${formatPoints(requiredPoints - Number(currentPoints))} more points.`}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: meetsMinThreshold ? '#059669' : '#dc2626', fontWeight: 700 }}>
                    <CheckCircle2 size={14} />
                    {meetsMinThreshold
                      ? `You meet the global minimum redemption threshold.`
                      : `You need ${formatPoints(minRedemptionPoints - Number(currentPoints))} more points to redeem anything.`}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: '#6b7280' }}>
                    <ShieldAlert size={14} />
                    Only active rules from LoyaltySetting are shown on the profile page.
                  </div>
                </div>
              </div>

              {availableRules.length > 1 && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ margin: '0 0 8px', fontSize: '0.78rem', fontWeight: 800, color: '#374151' }}>
                    Other redeemable options
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {availableRules
                      .filter((item) => item.id !== rule.id)
                      .slice(0, 4)
                      .map((item) => (
                        <span
                          key={item.id}
                          style={{
                            ...pillStyle,
                            background: '#fff',
                            borderColor: '#111827',
                            color: '#111827',
                          }}
                        >
                          {item.name}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  justifyContent: 'flex-end',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 12,
                    border: '2px solid #111827',
                    background: 'white',
                    color: '#111827',
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    minWidth: 100,
                  }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={!canConfirm}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 12,
                    border: '2px solid #111827',
                    background: canConfirm ? '#7c3aed' : '#d1d5db',
                    color: canConfirm ? 'white' : '#6b7280',
                    fontSize: '0.82rem',
                    fontWeight: 900,
                    fontFamily: 'inherit',
                    cursor: canConfirm ? 'pointer' : 'not-allowed',
                    minWidth: 128,
                  }}
                >
                  {loading ? 'Redeeming…' : 'Confirm redeem'}
                </button>
              </div>
            </>
          ) : (
            <div
              style={{
                padding: 18,
                borderRadius: 16,
                border: '2px solid #bbf7d0',
                background: '#f0fdf4',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 14,
                    background: '#ffffff',
                    border: '2px solid #111827',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <CheckCircle2 size={22} color="#059669" />
                </div>
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: '0.9rem', fontWeight: 900, color: '#065f46' }}>
                    Redemption successful
                  </p>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#047857' }}>
                    {success.message}
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 10,
                }}
              >
                <div style={{ ...pillStyle, justifyContent: 'center', background: '#fff', borderColor: '#bbf7d0', color: '#065f46' }}>
                  Points used: {formatPoints(success.points_used ?? requiredPoints)}
                </div>
                <div style={{ ...pillStyle, justifyContent: 'center', background: '#fff', borderColor: '#bbf7d0', color: '#065f46' }}>
                  Credit added: {formatKes(success.credit_granted ?? valueKes)}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 12,
                    border: '2px solid #111827',
                    background: '#7c3aed',
                    color: 'white',
                    fontSize: '0.82rem',
                    fontWeight: 900,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    minWidth: 120,
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
