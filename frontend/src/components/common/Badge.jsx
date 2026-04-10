import React from 'react';

/**
 * Badge component
 * Variants: primary | success | danger | warning | info | default
 * Style: dark pill with glowing colored border — matches the "Flash Deal" aesthetic
 */

// Each bg is layered: a near-opaque dark base + a tinted color wash on top.
// This makes badges legible on any image — bright yellow, dark, or busy.
const variantTokens = {
  primary: {
    text:   '#d8b4fe',
    border: 'rgba(168,85,247,0.7)',
    bg:     'linear-gradient(135deg, rgba(10,4,20,0.82) 0%, rgba(88,28,135,0.55) 100%)',
    glow:   '0 0 10px rgba(168,85,247,0.45), inset 0 0 0 1px rgba(168,85,247,0.2)',
  },
  success: {
    text:   '#6ee7b7',
    border: 'rgba(52,211,153,0.65)',
    bg:     'linear-gradient(135deg, rgba(2,20,14,0.82) 0%, rgba(6,78,59,0.55) 100%)',
    glow:   '0 0 10px rgba(52,211,153,0.38), inset 0 0 0 1px rgba(52,211,153,0.15)',
  },
  danger: {
    text:   '#fca5a5',
    border: 'rgba(248,113,113,0.65)',
    bg:     'linear-gradient(135deg, rgba(20,4,4,0.82) 0%, rgba(127,29,29,0.55) 100%)',
    glow:   '0 0 10px rgba(248,113,113,0.38), inset 0 0 0 1px rgba(248,113,113,0.15)',
  },
  warning: {
    text:   '#fde68a',
    border: 'rgba(251,191,36,0.65)',
    bg:     'linear-gradient(135deg, rgba(20,14,2,0.82) 0%, rgba(120,53,15,0.55) 100%)',
    glow:   '0 0 10px rgba(251,191,36,0.38), inset 0 0 0 1px rgba(251,191,36,0.15)',
  },
  info: {
    text:   '#93c5fd',
    border: 'rgba(96,165,250,0.65)',
    bg:     'linear-gradient(135deg, rgba(2,8,20,0.82) 0%, rgba(30,58,138,0.55) 100%)',
    glow:   '0 0 10px rgba(96,165,250,0.38), inset 0 0 0 1px rgba(96,165,250,0.15)',
  },
  default: {
    text:   '#d4d4d8',
    border: 'rgba(161,161,170,0.5)',
    bg:     'linear-gradient(135deg, rgba(10,10,12,0.82) 0%, rgba(39,39,42,0.65) 100%)',
    glow:   'none',
  },
};

const sizeStyles = {
  xs: { fontSize: '9px',  padding: '2px 7px',  letterSpacing: '0.14em', gap: '3px' },
  sm: { fontSize: '10px', padding: '3px 9px',  letterSpacing: '0.16em', gap: '4px' },
  md: { fontSize: '11px', padding: '4px 11px', letterSpacing: '0.16em', gap: '5px' },
  lg: { fontSize: '12px', padding: '5px 14px', letterSpacing: '0.14em', gap: '6px' },
};

const Badge = ({
  children,
  variant = 'default',
  size = 'sm',
  className = '',
  style: extraStyle = {},
  ...props
}) => {
  const t = variantTokens[variant] ?? variantTokens.default;
  const s = sizeStyles[size]     ?? sizeStyles.sm;

  return (
    <span
      className={className}
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        gap:            s.gap,
        padding:        s.padding,
        borderRadius:   '9999px',
        fontSize:       s.fontSize,
        fontWeight:     800,
        textTransform:  'uppercase',
        letterSpacing:  s.letterSpacing,
        whiteSpace:     'nowrap',
        color:              t.text,
        background:         t.bg,
        border:             `1px solid ${t.border}`,
        boxShadow:          t.glow,
        backdropFilter:     'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        lineHeight:     1,
        ...extraStyle,
      }}
      {...props}
    >
      {children}
    </span>
  );
};

export default Badge;