import { Link, useLocation } from 'react-router-dom';
import { GraduationCap, ChevronRight, Settings2, LibraryBig } from 'lucide-react';

const PAGES = [
  { path: '/admin/courses', title: 'Offerings', icon: LibraryBig, color: '#6366f1' },
  { path: '/admin/courses/settings', title: 'Settings', icon: Settings2, color: '#64748b' },
];

/** Courses › this page, and a row to move between the Courses pages. */
export default function CoursesNav({ here: title }) {
  const { pathname } = useLocation();
  const crumb = { color: 'var(--color-text-muted, #9ca3af)', textDecoration: 'none', fontWeight: 600 };

  return (
    <div data-testid="courses-nav" style={{ marginBottom: 18 }}>
      <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, fontSize: '0.78rem', marginBottom: 12 }}>
        <GraduationCap size={13} aria-hidden="true" style={{ opacity: 0.6 }} />
        <Link to="/admin/courses" style={crumb}>Courses</Link>
        <ChevronRight size={12} aria-hidden="true" style={{ opacity: 0.6 }} />
        <span aria-current="page" style={{ fontWeight: 700 }}>{title ?? PAGES.find((p) => p.path === pathname)?.title ?? 'Courses'}</span>
      </nav>
      <div role="tablist" aria-label="Courses pages" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PAGES.map(({ path, title: t, icon, color }) => {
          const Icon = icon;
          const active = path === pathname;

          return (
            <Link key={path} to={path} role="tab" aria-selected={active} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 999, fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none',
              border: `1.5px solid ${active ? color : 'var(--line, rgba(148,163,184,0.3))'}`, background: active ? `color-mix(in srgb, ${color} 16%, transparent)` : 'transparent', color: active ? color : 'var(--color-text-muted, #94a3b8)',
            }}>
              <Icon size={14} aria-hidden="true" /> {t}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
