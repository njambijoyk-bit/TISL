import { NavLink } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { colors } from '../../../../_shared/theme/tokens';

const TABS = [
  { to: '/admin/price-lists', label: 'Price lists', also: ['/admin/price-lists'] },
  { to: '/admin/price-list-archive', label: 'Archive' },
  { to: '/admin/catalogues', label: 'Catalogues', also: ['/admin/catalogues'] },
  { to: '/admin/catalogue-items', label: 'Item configuration' },
  { to: '/admin/catalogue-settings', label: 'Configuration' },
];

/** The small bar on every price list and brochure page, so it is one click between them. */
export default function CatalogueTabs({ back = '/admin/products', backLabel = 'Products' }) {
  return (
    <nav aria-label="Price lists and brochures" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
      <NavLink to={back} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.76rem', color: colors.textFaint, textDecoration: 'none', marginRight: 6 }}><ArrowLeft size={13} /> {backLabel}</NavLink>
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={!t.also}
          style={({ isActive }) => ({ padding: '5px 12px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none', border: '1px solid var(--line)',
            background: isActive ? 'var(--color-primary-500)' : 'var(--surface-card)', color: isActive ? '#fff' : colors.text })}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
