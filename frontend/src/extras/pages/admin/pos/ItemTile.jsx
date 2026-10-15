import { LayoutGrid, List } from 'lucide-react';
import { card, colors } from '../../../../_shared/theme/tokens';

export function ViewToggle({ view, onChange }) {
  const seg = (v, Icon, label) => (
    <button type="button" role="radio" aria-checked={view === v} onClick={() => onChange(v)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 11px', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.76rem', fontWeight: 700, transition: 'background 120ms',
        background: view === v ? 'var(--color-primary-500)' : 'transparent', color: view === v ? 'var(--text-inverse, #fff)' : 'var(--text-secondary)' }}>
      <Icon size={13} />{label}
    </button>
  );

  return <div role="radiogroup" aria-label="How to show items" style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 10, background: 'var(--bg-tertiary, #f3f4f6)', border: '1px solid var(--line)' }}>{seg('pictures', LayoutGrid, 'Pictures')}{seg('list', List, 'List')}</div>;
}

/**
 * One item to add to the sale. Pictures: the image fills the card with the name and price over it (a plain tinted card when there is no image). List: a compact row.
 * price: text; noPrice: the red warning in its place; stockText / stockLow: the stock line.
 */
export default function ItemTile({ item, view, onAdd, price, noPrice = false, stockText = null, stockLow = false, big = false }) {
  const warn = noPrice ? { border: '2px solid #dc2626' } : {};
  const badge = noPrice
    ? <span style={{ fontWeight: 900, color: '#fff', background: '#dc2626', borderRadius: 6, padding: '3px 6px', fontSize: '0.72rem', letterSpacing: '0.03em', justifySelf: 'start' }}>NO PRICE, CANNOT SELL</span>
    : <strong style={{ fontSize: '0.9rem' }}>{price}</strong>;

  if (view === 'list') {
    return (
      <button type="button" onClick={() => onAdd(item)} style={{ ...card, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: '8px 12px', textAlign: 'left', cursor: 'pointer', width: '100%', fontFamily: 'inherit', ...warn }}>
        {item.image
          ? <img src={item.image} alt="" loading="lazy" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8 }} />
          : <span aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 8, background: colors.tint(0.12), color: colors.primary, display: 'grid', placeItems: 'center', fontWeight: 900 }}>{String(item.name).slice(0, 1).toUpperCase()}</span>}
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 700, fontSize: '0.86rem', overflowWrap: 'anywhere' }}>{item.name}</span>
          {item.sku && !big && <span style={{ display: 'block', fontSize: '0.74rem', color: colors.textMuted }}>{item.sku}</span>}
          {stockText && <span style={{ display: 'block', fontSize: '0.74rem', color: stockLow ? '#b45309' : colors.textMuted, fontWeight: stockLow ? 700 : 400 }}>{stockText}</span>}
        </span>
        <span style={{ textAlign: 'right' }}>{badge}</span>
      </button>
    );
  }

  if (item.image) {
    return (
      <button type="button" onClick={() => onAdd(item)} style={{ position: 'relative', aspectRatio: big ? '1 / 1' : '4 / 3', minHeight: 120, borderRadius: 12, overflow: 'hidden', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', background: `center / cover no-repeat url("${item.image}")`, ...(noPrice ? { outline: '2px solid #dc2626' } : {}) }}>
        <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0) 65%)' }} />
        <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 10, display: 'grid', gap: 3, color: '#fff' }}>
          <span style={{ fontWeight: 800, fontSize: '0.84rem', overflowWrap: 'anywhere', textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>{item.name}</span>
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {noPrice ? badge : <strong style={{ fontSize: '0.9rem' }}>{price}</strong>}
            {stockText && <span style={{ fontSize: '0.72rem', fontWeight: 700, background: stockLow ? '#f59e0b' : 'rgba(255,255,255,0.22)', color: stockLow ? '#111' : '#fff', borderRadius: 999, padding: '2px 8px' }}>{stockText}</span>}
          </span>
        </span>
      </button>
    );
  }

  return (
    <button type="button" onClick={() => onAdd(item)} style={{ ...card, padding: 12, textAlign: 'left', cursor: 'pointer', display: 'grid', gap: 5, alignContent: 'space-between', minHeight: 120, fontFamily: 'inherit', ...warn }}>
      <span style={{ fontWeight: 800, fontSize: '0.84rem', overflowWrap: 'anywhere' }}>{item.name}</span>
      <span style={{ display: 'grid', gap: 3 }}>
        {item.sku && !big && <span style={{ fontSize: '0.74rem', color: colors.textMuted }}>{item.sku}</span>}
        {badge}
        {stockText && <span style={{ fontSize: '0.74rem', color: stockLow ? '#b45309' : colors.textMuted, fontWeight: stockLow ? 700 : 400 }}>{stockText}</span>}
      </span>
    </button>
  );
}
