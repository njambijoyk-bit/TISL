export const money = (n) => Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const card = { background: 'var(--surface-card, #fff)', borderRadius: 14, border: '1px solid var(--line, #e5e7eb)', padding: 18 };
export const field = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--line, #d1d5db)', background: 'var(--surface-input, #fff)', font: 'inherit', boxSizing: 'border-box' };
export const primaryBtn = { padding: '12px 20px', borderRadius: 12, border: 'none', background: 'var(--color-primary-500, #6366f1)', color: '#fff', font: 'inherit', fontWeight: 800, cursor: 'pointer' };
export const chip = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px', borderRadius: 999, fontSize: '0.74rem', fontWeight: 700, background: 'color-mix(in srgb, var(--color-primary-500, #6366f1) 12%, transparent)', color: 'var(--color-primary-600, #4f46e5)' };
export const hours = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
