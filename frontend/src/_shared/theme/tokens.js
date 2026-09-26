/**
 * Admin design tokens — the purple-alpha system used across the admin pages,
 * pulled into one place.
 *
 * New components import from here instead of hard-coding hex values, so the
 * future theme switcher only has to swap this object (or map it onto CSS
 * variables) rather than touch every file.
 */

const PURPLE = '168,85,247';

export const colors = {
  primary:      '#a855f7',
  primaryDeep:  '#7c3aed',
  tint:         (alpha) => `rgba(${PURPLE},${alpha})`,

  text:         '#111827',
  textBody:     '#374151',
  textMuted:    '#6b7280',
  textFaint:    '#9ca3af',
  textGhost:    '#d1d5db',

  surface:      'white',
  overlay:      'rgba(15,10,30,0.65)',

  success:      '#10b981',
  successText:  '#065f46',
  successBg:    'rgba(16,185,129,0.1)',
  danger:       '#ef4444',
  dangerText:   '#991b1b',
  dangerBg:     'rgba(239,68,68,0.08)',
  warning:      '#f59e0b',
  warningText:  '#92400e',
  warningBg:    'rgba(245,158,11,0.1)',
  info:         '#3b82f6',
  infoText:     '#1e40af',
  infoBg:       'rgba(59,130,246,0.1)',
  neutralText:  '#4b5563',
  neutralBg:    'rgba(107,114,128,0.1)',
};

export const radius = { sm: 6, md: 8, lg: 10, xl: 12, pill: 20 };

export const font = {
  xs: '0.65rem', sm: '0.72rem', md: '0.82rem', lg: '0.95rem', xl: '1.5rem',
};

// ── Reusable style objects ────────────────────────────────────────────────

export const input = {
  width: '100%', padding: '7px 11px', borderRadius: radius.md, fontSize: font.md,
  background: colors.tint(0.04),
  border: `1.5px solid ${colors.tint(0.18)}`,
  color: colors.text, outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  fontFamily: 'inherit', boxSizing: 'border-box',
};

export const inputDisabled = {
  ...input,
  background: colors.tint(0.02),
  borderColor: colors.tint(0.08),
  color: colors.textFaint, cursor: 'not-allowed',
};

/** Spread onto inputs/selects: {...focusRing} */
export const focusRing = {
  onFocus: (e) => { e.currentTarget.style.borderColor = colors.primary; e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.tint(0.1)}`; },
  onBlur:  (e) => { e.currentTarget.style.borderColor = colors.tint(0.18); e.currentTarget.style.boxShadow = 'none'; },
};

export const label = {
  fontSize: font.xs, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: colors.primaryDeep, display: 'block', marginBottom: 5,
};

export const hint = { fontSize: '0.68rem', color: colors.textFaint, marginTop: 4 };

export const card = {
  background: colors.surface, borderRadius: radius.xl,
  border: `1px solid ${colors.tint(0.1)}`,
  boxShadow: `0 2px 12px ${colors.tint(0.06)}`,
};

export const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '8px 16px', borderRadius: radius.md, fontSize: font.md, fontWeight: 700,
  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
  background: `linear-gradient(135deg,${colors.primary},${colors.primaryDeep})`, color: 'white',
  boxShadow: `0 2px 10px ${colors.tint(0.3)}`,
};

export const btnGhost = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '8px 16px', borderRadius: radius.md, fontSize: font.md, fontWeight: 600,
  background: 'transparent', border: `1.5px solid ${colors.tint(0.18)}`, color: colors.textMuted,
  cursor: 'pointer', fontFamily: 'inherit',
};

export const btnIcon = {
  width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 7, border: 'none', cursor: 'pointer', background: 'none', color: colors.textFaint,
};
