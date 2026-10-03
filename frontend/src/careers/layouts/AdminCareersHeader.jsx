// careers/admin/components/AdminCareersHeader.jsx
import { NavLink, Link } from 'react-router-dom';
import { LayoutDashboard, Briefcase, FileText, BarChart2, Home, Users } from 'lucide-react';

const NAV = [
    { to: '/admin/careers',              label: 'Overview',     icon: BarChart2, end: true  },
    { to: '/admin/careers/jobs',         label: 'Jobs',         icon: Briefcase, end: false },
    { to: '/admin/careers/applications', label: 'Applications', icon: FileText,  end: false },
    { to: '/admin/careers/applicants',   label: 'Applicants',   icon: Users,     end: false },
];

export default function AdminCareersHeader() {
    return (
        <>
            <style>{`
                .ach-tab:hover  { color: var(--text-primary) !important; border-bottom-color: var(--line) !important; }
                .ach-home:hover { background: var(--surface-hover) !important; color: var(--text-primary) !important; }
                .ach-nav::-webkit-scrollbar { display: none; }
            `}</style>

            <header style={{
                background: 'var(--bg-primary)',
                borderBottom: '1px solid var(--line)',
                padding: '0 32px',
                display: 'flex',
                alignItems: 'center',
                gap: 0,
                height: 52,
                fontFamily: "var(--font-body, system-ui), sans-serif",
            }}>

                {/* ── Home button ─────────────────────────────── */}
                <Link
                    to="/admin"
                    className="ach-home"
                    title="Admin Dashboard"
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 32, height: 32, borderRadius: 7,
                        background: 'transparent', color: 'var(--text-tertiary)',
                        transition: 'background 0.15s, color 0.15s',
                        marginRight: 20, flexShrink: 0,
                        textDecoration: 'none',
                    }}
                >
                    <Home size={15} strokeWidth={2} />
                </Link>

                {/* ── Divider ──────────────────────────────────── */}
                <span style={{ width: 1, height: 18, background: 'var(--surface-input)', marginRight: 20, flexShrink: 0 }} />

                {/* ── Section label ────────────────────────────── */}
                <span style={{
                    fontSize: 11, fontWeight: 600,
                    letterSpacing: '0.15em', textTransform: 'uppercase',
                    color: 'var(--color-primary-500)', marginRight: 28, flexShrink: 0,
                }}>
                    Careers
                </span>

                {/* ── Tab nav ──────────────────────────────────── */}
                <nav style={{ display: 'flex', alignItems: 'stretch', gap: 0, height: '100%', overflowX: 'auto', scrollbarWidth: 'none' }}>
                    {NAV.map(({ to, label, icon: Icon, end }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            className="ach-tab"
                            style={({ isActive }) => ({
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '0 14px',
                                fontSize: 13, fontWeight: isActive ? 600 : 400,
                                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                                textDecoration: 'none',
                                borderBottom: `2px solid ${isActive ? 'var(--color-primary-500)' : 'transparent'}`,
                                transition: 'color 0.15s, border-bottom-color 0.15s',
                                whiteSpace: 'nowrap',
                            })}
                        >
                            <Icon size={13} strokeWidth={2} />
                            {label}
                        </NavLink>
                    ))}
                </nav>

            </header>
        </>
    );
}