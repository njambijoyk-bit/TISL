import React from 'react';
import {
  AlertCircle,
  X,
  TrendingDown,
  TrendingUp,
  DollarSign,
  CheckCircle,
} from 'lucide-react';

// ─── Design tokens ────────────────────────────────────────────────────────────
const purple = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

const Btn = ({ children, onClick }) => (
  <button
    onClick={onClick}
    type="button"
    style={{
      background: `linear-gradient(135deg,${purple},${purpleDk})`,
      color: 'white',
      border: 'none',
      boxShadow: '0 4px 12px rgba(168,85,247,0.3)',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '10px 24px',
      borderRadius: 10,
      fontSize: '0.85rem',
      fontWeight: 700,
      cursor: 'pointer',
      transition: 'transform 0.1s',
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translateY(-1px)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'translateY(0)';
    }}
  >
    {children}
  </button>
);

const ScenarioCard = ({
  icon: Icon,
  iconColor,
  bg,
  border,
  title,
  subtitle,
  rows,
  currency,
}) => (
  <div
    style={{
      borderRadius: 12,
      background: bg,
      border: `1px solid ${border}`,
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        padding: '10px 14px',
        borderBottom: `1px solid ${border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <Icon size={15} color={iconColor} />
      <p
        style={{
          fontSize: '0.78rem',
          fontWeight: 800,
          color: iconColor,
          margin: 0,
        }}
      >
        {title}
      </p>
    </div>

    <div style={{ padding: '10px 14px' }}>
      {subtitle && (
        <p style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: 8 }}>
          {subtitle}
        </p>
      )}

      <div
        style={{
          fontFamily: 'monospace',
          fontSize: '0.78rem',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {rows.map(([label, value, valueColor], i, arr) => (
          <div
            key={label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: i === arr.length - 1 ? 6 : 0,
              borderTop:
                i === arr.length - 1 ? '1px solid rgba(0,0,0,0.1)' : 'none',
            }}
          >
            <span style={{ color: '#6b7280' }}>{label}</span>
            <span
              style={{
                fontWeight: 700,
                color: valueColor || '#111827',
              }}
            >
              {typeof value === 'string' && value.startsWith('-')
                ? value
                : `${currency} ${value}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const getIssueConfig = (err) => {
  if (err.issueType === 'high_discount') {
    return {
      bg: 'rgba(245,158,11,0.05)',
      border: 'rgba(245,158,11,0.2)',
      borderLeft: '#f59e0b',
      titleColor: '#92400e',
      valueColor: '#d97706',
      badgeBg: 'rgba(245,158,11,0.12)',
      badgeColor: '#f59e0b',
      label: 'High Discount',
    };
  }

  if (err.issueType === 'high_markup') {
    return {
      bg: 'rgba(239,68,68,0.05)', border: 'rgba(239,68,68,0.2)',
      borderLeft: '#f97316', titleColor: '#9a3412', valueColor: '#ea580c',
      badgeBg: 'rgba(249,115,22,0.12)', badgeColor: '#f97316', label: 'High Markup',
    };
  }

  return {
    bg: 'rgba(239,68,68,0.05)',
    border: 'rgba(239,68,68,0.2)',
    borderLeft: '#ef4444',
    titleColor: '#b91c1c',
    valueColor: '#ef4444',
    badgeBg: 'rgba(239,68,68,0.12)',
    badgeColor: '#ef4444',
    label: 'Pricing Error',
  };
};

  const getOriginalPrice = (err) => {
    const value = err.originalPrice ?? err.original_price ?? 0;
    return Number(value) || 0;
  };

  const getUnitPrice = (err) => {
    const value = err.unitPrice ?? err.unit_price ?? 0;
    return Number(value) || 0;
  };

  const getDiscountPercent = (err) => {
    const value = err.discountPercent ?? err.discount_percent ?? 0;
    return Number(value) || 0;
  };

/**
 * PricingValidationModal — purple design system
 * Supports:
 * - zero price / invalid pricing errors
 * - unusually high discount warnings
 */
const PricingValidationModal = ({ errors, onClose, currencySymbol = 'KSh' }) => {
  if (!errors || errors.length === 0) return null;

  const zeroPriceCount = errors.filter(
    (e) => !e.issueType || e.issueType === 'zero_price'
  ).length;

  const highDiscountCount = errors.filter(
    (e) => e.issueType === 'high_discount'
  ).length;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        overflowY: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        backdropFilter: 'blur(6px)',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'relative',
          background: 'var(--panel-bg,white)',
          borderRadius: 20,
          boxShadow: '0 25px 60px rgba(0,0,0,0.18)',
          width: '100%',
          maxWidth: 680,
          overflow: 'hidden',
          animation: 'fadeUp 0.25s ease both',
        }}
      >
        <style>
          {`@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}`}
        </style>

        {/* Header */}
        <div
          style={{
            background: `linear-gradient(135deg,#f59e0b,#d97706)`,
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertCircle size={22} color="white" />
            </div>

            <div>
              <p
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 900,
                  color: 'white',
                  margin: '0 0 2px',
                }}
              >
                Pricing Issues Detected
              </p>

              <p
                style={{
                  fontSize: '0.78rem',
                  color: 'rgba(255,255,255,0.8)',
                  margin: 0,
                }}
              >
                {zeroPriceCount > 0 &&
                  `${zeroPriceCount} pricing issue${
                    zeroPriceCount > 1 ? 's' : ''
                  }`}
                {zeroPriceCount > 0 && highDiscountCount > 0 && ' · '}
                {highDiscountCount > 0 &&
                  `${highDiscountCount} unusually high discount${
                    highDiscountCount > 1 ? 's' : ''
                  }`}
                {zeroPriceCount === 0 && highDiscountCount === 0 &&
                  `${errors.length} item${errors.length > 1 ? 's' : ''} need${
                    errors.length === 1 ? 's' : ''
                  } attention`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            type="button"
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: 8,
              width: 32,
              height: 32,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} color="white" />
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            maxHeight: '65vh',
            overflowY: 'auto',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {/* Error / warning items */}
          {errors.map((err, i) => {
            const issue = getIssueConfig(err);

            return (
              <div
                key={i}
                style={{
                  padding: '14px 16px',
                  borderRadius: 12,
                  background: issue.bg,
                  border: `1px solid ${issue.border}`,
                  borderLeft: `4px solid ${issue.borderLeft}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                  }}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      background: issue.badgeBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 900,
                        color: issue.badgeColor,
                      }}
                    >
                      {err.itemIndex + 1}
                    </span>
                  </div>

                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        marginBottom: 10,
                        alignItems: 'center',
                      }}
                    >
                      <p
                        style={{
                          fontSize: '0.88rem',
                          fontWeight: 800,
                          color: issue.titleColor,
                          margin: 0,
                        }}
                      >
                        {err.itemDescription}
                      </p>

                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          color: issue.badgeColor,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {issue.label}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 8,
                      }}
                    >
                      {[
                        [
                          'Original Price',
                          getOriginalPrice(err) === 0
                            ? '⚠ Zero'
                            : `${currencySymbol} ${getOriginalPrice(err).toFixed(2)}`,
                        ],
                        [
                          'Unit Price',
                          getUnitPrice(err) === 0
                            ? '⚠ Zero'
                            : `${currencySymbol} ${getUnitPrice(err).toFixed(2)}`,
                        ],
                      ].map(([label, val]) => (
                        <div
                          key={label}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 8,
                            background: 'white',
                            border: `1px solid ${issue.border}`,
                          }}
                        >
                          <p
                            style={{
                              fontSize: '0.65rem',
                              color: '#9ca3af',
                              textTransform: 'uppercase',
                              letterSpacing: '0.08em',
                              margin: '0 0 3px',
                            }}
                          >
                            {label}
                          </p>
                          <p
                            style={{
                              fontSize: '0.85rem',
                              fontWeight: 800,
                              color: issue.valueColor,
                              margin: 0,
                            }}
                          >
                            {val}
                          </p>
                        </div>
                      ))}
                    </div>

                    {err.issueType === 'high_discount' && (
                      <div
                        style={{
                          marginTop: 10,
                          padding: '10px 12px',
                          borderRadius: 8,
                          background: 'rgba(245,158,11,0.08)',
                          border: '1px solid rgba(245,158,11,0.18)',
                        }}
                      >
                        <p
                          style={{
                            fontSize: '0.78rem',
                            color: '#92400e',
                            margin: 0,
                            fontWeight: 700,
                          }}
                        >
                          Discount is {getDiscountPercent(err).toFixed(1)}%,
                          which is unusually high.
                        </p>
                      </div>
                    )}
                    {err.issueType === 'high_markup' && (
                      <div style={{
                        marginTop: 10, padding: '10px 12px', borderRadius: 8,
                        background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.18)',
                      }}>
                        <p style={{ fontSize: '0.78rem', color: '#9a3412', margin: 0, fontWeight: 700 }}>
                          Markup is {(err.markup_percent).toFixed(1)}%, which is unusually high.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Action required */}
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 12,
              background: 'rgba(245,158,11,0.06)',
              border: '1px solid rgba(245,158,11,0.3)',
              borderLeft: '4px solid #f59e0b',
            }}
          >
            <p
              style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#92400e',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <AlertCircle size={12} />
              Action Required
            </p>

            {[
              'Set both prices to the same value if no discount is intended',
              'Set Original Price higher than Unit Price for a discount',
              'Set Unit Price higher than Original Price for a markup',
              'Both prices cannot be zero',
              'Review discounts that are unusually high before continuing',
            ].map((s, i) => (
              <p
                key={s}
                style={{
                  fontSize: '0.8rem',
                  color: '#78350f',
                  margin: '0 0 5px',
                  display: 'flex',
                  gap: 7,
                  fontWeight: i === 3 ? 700 : 400,
                }}
              >
                <span
                  style={{
                    color: '#f59e0b',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  ·
                </span>
                {s}
              </p>
            ))}
          </div>

          {/* Educational section */}
          <div
            style={{
              padding: '16px 18px',
              borderRadius: 12,
              background: purpleLt,
              border: `1px solid ${purpleBd}`,
            }}
          >
            <p
              style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: purple,
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <DollarSign size={12} />
              How Discount Pricing Works
            </p>

            {/* Field explanations */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 10,
                background: 'white',
                border: '1px solid var(--border,#f3f4f6)',
                marginBottom: 12,
              }}
            >
              <p
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#9ca3af',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: 10,
                }}
              >
                Price Fields
              </p>

              {[
                ['Original Price', 'The list/catalog price before any discounts'],
                ['Unit Price', 'The actual selling price the customer pays'],
                ['Discount', 'Auto-calculated: Original Price − Unit Price'],
              ].map(([label, desc]) => (
                <p
                  key={label}
                  style={{
                    fontSize: '0.78rem',
                    color: '#6b7280',
                    margin: '0 0 6px',
                    display: 'flex',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      color: purple,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    ·
                  </span>
                  <span>
                    <strong style={{ color: '#374151' }}>{label}</strong> — {desc}
                  </span>
                </p>
              ))}
            </div>

            {/* Scenario cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                marginBottom: 10,
              }}
            >
              <ScenarioCard
                icon={CheckCircle}
                iconColor="#059669"
                bg="rgba(16,185,129,0.05)"
                border="rgba(16,185,129,0.2)"
                title="No Discount"
                subtitle="Both prices equal:"
                currency={currencySymbol}
                rows={[
                  ['Original:', '1,000'],
                  ['Unit Price:', '1,000'],
                  ['Discount:', `${currencySymbol} 0`, '#059669'],
                ]}
              />

              <ScenarioCard
                icon={TrendingDown}
                iconColor="#2563eb"
                bg="rgba(59,130,246,0.05)"
                border="rgba(59,130,246,0.2)"
                title="With Discount"
                subtitle="Unit Price is lower:"
                currency={currencySymbol}
                rows={[
                  ['Original:', '1,000'],
                  ['Unit Price:', '850', '#2563eb'],
                  ['Discount:', `- ${currencySymbol} 150 (15%)`, '#059669'],
                ]}
              />
            </div>

            <ScenarioCard
              icon={TrendingUp}
              iconColor="#d97706"
              bg="rgba(245,158,11,0.05)"
              border="rgba(245,158,11,0.2)"
              title="Price Increase (Markup)"
              subtitle="Unit Price is higher — for rush orders, premium service, etc.:"
              currency={currencySymbol}
              rows={[
                ['Original:', '1,000'],
                ['Unit Price:', '1,200', '#d97706'],
                ['Markup:', `+ ${currencySymbol} 200 (20%)`, '#ef4444'],
              ]}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border,#f3f4f6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--panel-bg,white)',
          }}
        >
          <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0 }}>
            Fix the pricing issues above to continue
          </p>
          <Btn onClick={onClose}>
            <CheckCircle size={15} />
            Got it
          </Btn>
        </div>
      </div>
    </div>
  );
};

export default PricingValidationModal;