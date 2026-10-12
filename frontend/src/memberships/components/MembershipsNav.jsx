import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, IdCard, Settings2, Layers, Users } from 'lucide-react';

const PAGES = [
  { path: '/admin/memberships', title: 'Plans', icon: Layers, color: '#8b5cf6' },
  { path: '/admin/memberships/members', title: 'Members', icon: Users, color: '#0ea5e9' },
  { path: '/admin/memberships/settings', title: 'Settings', icon: Settings2, color: '#64748b' },
];

/** Memberships › this page, and a row to move between the Memberships pages. */
export default function MembershipsNav({ here: title }) {
  const { pathname } = useLocation();
  const crumb = { color: 'var(--color-text-muted, #9ca3af)', textDecoration: 'none', fontWeight: 600 };

  return (
    <div data-testid="memberships-nav" style={{ marginBottom: 18 }}>
      <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, fontSize: '0.78rem', marginBottom: 12 }}>
        <IdCard size={13} aria-hidden="true" style={{ opacity: 0.6 }} />
        <Link to="/admin/memberships" style={crumb}>Memberships</Link>
        <ChevronRight size={12} aria-hidden="true" style={{ opacity: 0.6 }} />
        <span aria-current="page" style={{ fontWeight: 700 }}>{title ?? PAGES.find((p) => p.path === pathname)?.title ?? 'Memberships'}</span>
      </nav>
      <div role="tablist" aria-label="Memberships pages" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PAGES.map(({ path, title: t, icon, color }) => {
          const Icon = icon;
          const active = path === pathname;

          return (
            <Link key={path} to={path} role="tab" aria-selected={active} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 10, textDecoration: 'none', fontSize: '0.84rem', fontWeight: active ? 800 : 600,
              color: active ? color : 'inherit', border: `1.5px solid ${active ? color : 'rgba(148,163,184,0.35)'}`,
            }}><Icon size={14} aria-hidden="true" /> {t}</Link>
          );
        })}
      </div>
    </div>
  );
}
