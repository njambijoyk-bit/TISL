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
                .ach-tab:hover  { color: #e0e0e0 !important; border-bottom-color: #444 !important; }
                .ach-home:hover { background: #1e1e1e !important; color: #ccc !important; }
                .ach-nav::-webkit-scrollbar { display: none; }
            `}</style>

            <header style={{
                background: '#111',
                borderBottom: '1px solid #1e1e1e',
                padding: '0 32px',
                display: 'flex',
                alignItems: 'center',
                gap: 0,
                height: 52,
                fontFamily: "'DM Sans', sans-serif",
            }}>

                {/* ── Home button ─────────────────────────────── */}
                <Link
                    to="/admin"
                    className="ach-home"
                    title="Admin Dashboard"
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 32, height: 32, borderRadius: 7,
                        background: 'transparent', color: '#555',
                        transition: 'background 0.15s, color 0.15s',
                        marginRight: 20, flexShrink: 0,
                        textDecoration: 'none',
                    }}
                >
                    <Home size={15} strokeWidth={2} />
                </Link>

                {/* ── Divider ──────────────────────────────────── */}
                <span style={{ width: 1, height: 18, background: '#222', marginRight: 20, flexShrink: 0 }} />

                {/* ── Section label ────────────────────────────── */}
                <span style={{
                    fontSize: 11, fontWeight: 600,
                    letterSpacing: '0.15em', textTransform: 'uppercase',
                    color: '#a855f7', marginRight: 28, flexShrink: 0,
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
                                color: isActive ? '#f0f0f0' : '#666',
                                textDecoration: 'none',
                                borderBottom: `2px solid ${isActive ? '#a855f7' : 'transparent'}`,
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