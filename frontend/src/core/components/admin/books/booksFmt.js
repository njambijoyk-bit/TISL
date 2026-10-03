import { colors, radius } from '../../../../_shared/theme/tokens';

export const money = (n) => Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const FORMATS = [
  ['pdf', 'PDF'], ['html', 'HTML'], ['csv', 'CSV'], ['xml', 'XML'], ['json', 'JSON'],
];

export const today = () => new Date().toLocaleDateString('en-CA');
export const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA'); };
export const yearStart = () => `${new Date().getFullYear()}-01-01`;

/** Shared look for the small filter inputs above the books tables. */
export const filterStyle = {
  padding: '7px 10px', borderRadius: radius.md, border: '1.5px solid var(--line)', fontSize: '0.8rem', fontFamily: 'var(--font-body, inherit)', background: 'var(--bg-primary)', color: 'var(--text-primary, #111827)',
};

/** Which Delivery Notes can still be put on a manifest: not on a live stop (a failed stop frees its notes). */
export const canManifest = (v) => v?.status === 'posted' && v?.type?.base_type === 'delivery_note' && ['not_assigned', 'failed'].includes(v?.delivery?.status);
