import { colors, radius } from '../../../../_shared/theme/tokens';

const STATE = {
  open: ['Open', 'rgba(245,158,11,0.15)', 'var(--status-warning, #b45309)'],
  converted: ['Converted', 'rgba(16,185,129,0.15)', 'var(--status-success, #047857)'],
  dismissed: ['Dismissed', 'rgba(127,127,127,0.18)', 'var(--text-tertiary)'],
};

export function StateChip({ state }) {
  const [label, bg, fg] = STATE[state] ?? STATE.open;
  return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: radius.pill, background: bg, color: fg, fontSize: '0.68rem', fontWeight: 700 }}>{label}</span>;
}

export function PurposeChip({ label }) {
  return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: radius.pill, background: colors.tint(0.08), color: colors.primary, fontSize: '0.68rem', fontWeight: 700 }}>{label}</span>;
}

/** Money in (green ▲) or out (red ▼), when the memorandum says which. */
export function Direction({ direction }) {
  if (!direction) return null;
  return <span style={{ color: direction === 'in' ? '#10b981' : '#ef4444', fontWeight: 800, marginRight: 4 }}>{direction === 'in' ? '▲' : '▼'}</span>;
}
