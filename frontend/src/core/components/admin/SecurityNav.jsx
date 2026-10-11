import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Fingerprint, ScrollText, ShieldAlert, UserCheck } from 'lucide-react';
import useAuthStore from '../../../_shared/store/authStore';
import { hasPermission } from '../../../_shared/lib/roles';

/** The four security pages, with the icon and colour they have on the Settings overview. Approvals needs no permission of its own (anyone who can answer sees it). */
const SECURITY_PAGES = [
  { path: '/admin/security', title: 'Sign-in log', short: 'Sign-in log', icon: ScrollText, color: '#38bdf8', perm: 'security.view' },
  { path: '/admin/security/passkeys', title: 'Passkey rule', short: 'Passkey rule', icon: Fingerprint, color: '#34d399', perm: 'security.view' },
  { path: '/admin/security/actions', title: 'Sensitive actions', short: 'Sensitive actions', icon: ShieldAlert, color: '#fb923c', perm: 'security.view' },
  { path: '/admin/security/approvals', title: 'Approvals', short: 'Approvals', icon: UserCheck, color: '#a78bfa', perm: null },
];

/** Settings › Access › this page, and a row to jump between the four security pages. Put it at the top of each of them. */
export default function SecurityNav() {
  const { pathname } = useLocation();
  const user = useAuthStore((s) => s.user);
  const pages = SECURITY_PAGES.filter((p) => !p.perm || hasPermission(user, p.perm));
  const here = SECURITY_PAGES.find((p) => p.path === pathname);
  const crumb = { color: 'var(--color-text-muted, #9ca3af)', textDecoration: 'none', fontWeight: 600 };

  return (
    <div data-testid="security-nav" style={{ marginBottom: 18 }}>
      <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, fontSize: '0.78rem', marginBottom: 12 }}>
        <Link to="/admin/settings" style={crumb}>Settings</Link>
        <ChevronRight size={12} aria-hidden="true" style={{ opacity: 0.6 }} />
        <Link to="/admin/settings" style={crumb}>Access</Link>
        <ChevronRight size={12} aria-hidden="true" style={{ opacity: 0.6 }} />
        <span aria-current="page" style={{ fontWeight: 700, color: here?.color }}>{here?.title ?? 'Security'}</span>
      </nav>
      <div role="tablist" aria-label="Security pages" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {pages.map(({ path, short, icon, color }) => {
          const Icon = icon;
          const active = path === pathname;
          return (
            <Link key={path} to={path} role="tab" aria-selected={active} aria-current={active ? 'page' : undefined} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 999, fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none',
              border: `1.5px solid ${active ? color : 'var(--line, rgba(148,163,184,0.3))'}`,
              background: active ? `color-mix(in srgb, ${color} 16%, transparent)` : 'transparent',
              color: active ? color : 'var(--color-text-muted, #94a3b8)',
            }}>
              <Icon size={14} aria-hidden="true" /> {short}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
