import { colors } from '../../../_shared/theme/tokens';

export const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
export const td = { padding: '9px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'top', color: colors.textBody };
export const mono = { fontFamily: 'monospace', fontSize: '0.76rem' };
export const linkStyle = { color: colors.primary, fontWeight: 600, textDecoration: 'none' };

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');
export const kes = (n) => `KES ${Number(n || 0).toLocaleString()}`;
