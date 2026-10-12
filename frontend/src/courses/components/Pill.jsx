import { colors } from '../../_shared/theme/tokens';

const TONES = { ok: '#16a34a', warn: '#d97706', danger: '#dc2626', neutral: '#64748b' };

/** A small label. */
export default function Pill({ tone = 'neutral', children }) {
  const c = TONES[tone] ?? colors.textMuted;

  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}>{children}</span>;
}
