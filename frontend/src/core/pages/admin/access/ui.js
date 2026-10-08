/** Shared look for the Roles & access screens (theme variables only). */
export const card = {
  background: 'var(--surface-card, #fff)', borderRadius: 12, padding: 18, marginBottom: 14,
  border: '1px solid color-mix(in srgb, var(--color-primary-500) 10%, transparent)',
  boxShadow: '0 2px 12px color-mix(in srgb, var(--color-primary-500) 6%, transparent)',
};
export const input = {
  width: '100%', padding: '8px 11px', borderRadius: 8, fontSize: '0.82rem', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  background: 'var(--surface-input, color-mix(in srgb, var(--color-primary-500) 4%, transparent))',
  border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)',
};
export const label = { fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-primary-600)', display: 'block', marginBottom: 5 };
export const btn = (primary, danger) => ({
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit',
  border: primary ? 'none' : `1.5px solid color-mix(in srgb, ${danger ? '#ef4444' : 'var(--color-primary-500)'} 30%, transparent)`,
  background: primary ? (danger ? '#ef4444' : 'var(--color-primary-500)') : 'transparent',
  color: primary ? 'white' : (danger ? '#ef4444' : 'var(--color-primary-600)'),
});
export const h2 = { margin: '0 0 4px', fontSize: '0.95rem', fontWeight: 800 };
export const sub = { margin: '0 0 12px', fontSize: '0.78rem', color: 'var(--text-secondary)' };
export const chip = (tone) => ({
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap',
  background: `color-mix(in srgb, ${tone ?? 'var(--color-primary-500)'} 12%, transparent)`, color: tone ?? 'var(--color-primary-600)',
});
export const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)' };
export const td = { padding: '9px 10px', fontSize: '0.82rem', borderTop: '1px solid color-mix(in srgb, var(--color-primary-500) 8%, transparent)', verticalAlign: 'middle' };

export const GROUP_ORDER = ['Admin area', 'Books', 'Tax and money', 'Stock', 'Purchases', 'Customers', 'Payroll', 'People', 'Delivery', 'Catalogue', 'Campaigns', 'Menus', 'Marketing', 'Projects', 'Insight', 'Operations', 'Vault', 'Support', 'Access', 'System'];
export const DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']];
export const MODULE_NAMES = {
  ecommerce: 'E-commerce', listings: 'Listings', campaigns: 'Campaigns', courses: 'Courses', accommodations: 'Accommodations', menus: 'Menus', events: 'Events',
  memberships: 'Memberships', careers: 'Careers', projects: 'Projects', extras: 'Extras',
};
export const moduleName = (k) => (k ? (MODULE_NAMES[k] ?? k) : 'Core');

/** "2026-10-08T14:30:00+00:00" → "8 Oct 2026, 14:30" */
export const when = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
/** ISO → value for a datetime-local input */
export const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
