import { Link, useLocation } from 'react-router-dom';
import { BookOpenText, ChevronRight, ClipboardList, Salad, Settings2, UtensilsCrossed } from 'lucide-react';

const PAGES = [
  { path: '/admin/menus/dishes', title: 'Dishes', icon: UtensilsCrossed, color: '#f97316' },
  { path: '/admin/menus/ingredients', title: 'Ingredients', icon: Salad, color: '#22c55e' },
  { path: '/admin/menus/recipes', title: 'Recipes', icon: ClipboardList, color: '#f59e0b' },
  { path: '/admin/menus/settings', title: 'Settings', icon: Settings2, color: '#64748b' },
];

/** Menus › this page, and a row to move between the Menus pages. */
export default function MenusNav() {
  const { pathname } = useLocation();
  const here = PAGES.find((p) => p.path === pathname);
  const crumb = { color: 'var(--color-text-muted, #9ca3af)', textDecoration: 'none', fontWeight: 600 };

  return (
    <div data-testid="menus-nav" style={{ marginBottom: 18 }}>
      <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, fontSize: '0.78rem', marginBottom: 12 }}>
        <BookOpenText size={13} aria-hidden="true" style={{ opacity: 0.6 }} />
        <Link to="/admin/menus/dishes" style={crumb}>Menus</Link>
        <ChevronRight size={12} aria-hidden="true" style={{ opacity: 0.6 }} />
        <span aria-current="page" style={{ fontWeight: 700, color: here?.color }}>{here?.title ?? 'Menus'}</span>
      </nav>
      <div role="tablist" aria-label="Menus pages" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PAGES.map(({ path, title, icon, color }) => {
          const Icon = icon;
          const active = path === pathname;

          return (
            <Link key={path} to={path} role="tab" aria-selected={active} aria-current={active ? 'page' : undefined} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 999, fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none',
              border: `1.5px solid ${active ? color : 'var(--line, rgba(148,163,184,0.3))'}`,
              background: active ? `color-mix(in srgb, ${color} 16%, transparent)` : 'transparent',
              color: active ? color : 'var(--color-text-muted, #94a3b8)',
            }}>
              <Icon size={14} aria-hidden="true" /> {title}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
