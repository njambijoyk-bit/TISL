// careers/components/CareersHeader.jsx
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Briefcase, LayoutDashboard, LogOut, ChevronDown, User, UserCircle } from 'lucide-react';
import useCareersStore from '../../_shared/store/useCareersStore';

export default function CareersHeader() {
    const { applicant, logout } = useCareersStore();
    const navigate = useNavigate();
    const [scrolled, setScrolled]     = useState(false);
    const [menuOpen, setMenuOpen]     = useState(false);
    const menuRef                     = useRef(null);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 12);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    useEffect(() => {
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleLogout = async () => {
        setMenuOpen(false);
        await logout();
        navigate('/careers');
    };

    const navLinkStyle = ({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: '0.02em',
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        textDecoration: 'none',
        padding: '6px 10px',
        borderRadius: 6,
        transition: 'color 0.15s',
        background: isActive ? 'var(--surface-card)' : 'transparent',
    });

    const menuItemStyle = {
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', borderRadius: 6,
        fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none',
        transition: 'background 0.12s, color 0.12s',
    };

    return (
        <>
            <style>{`
                .careers-nav-link:hover { color: var(--text-primary) !important; }
                .careers-menu-item:hover { background: var(--surface-hover) !important; color: var(--text-primary) !important; }
                .careers-auth-btn-primary:hover { background: var(--color-primary-600) !important; }
                .careers-auth-btn-ghost:hover { color: var(--text-primary) !important; }
            `}</style>

            <header style={{
                position: 'sticky',
                top: 0,
                zIndex: 50,
                height: 56,
                display: 'flex',
                alignItems: 'center',
                padding: '0 40px',
                background: scrolled ? 'rgba(15,15,15,0.88)' : 'var(--bg-primary)',
                backdropFilter: scrolled ? 'blur(12px)' : 'none',
                WebkitBackdropFilter: scrolled ? 'blur(12px)' : 'none',
                borderBottom: `1px solid ${scrolled ? 'var(--line)' : 'var(--line)'}`,
                transition: 'background 0.25s, backdrop-filter 0.25s, border-color 0.25s',
                fontFamily: "var(--font-body, system-ui), sans-serif",
            }}>

                {/* ── Brand ─────────────────────────────────────── */}
                <Link to="/careers" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, marginRight: 36 }}>
                    <span style={{
                        width: 28, height: 28, borderRadius: 7,
                        background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        <Briefcase size={14} color="#fff" strokeWidth={2.2} />
                    </span>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>TISL</span>
                        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Careers</span>
                    </span>
                </Link>

                {/* ── Nav ───────────────────────────────────────── */}
                <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                    <NavLink to="/careers" end className="careers-nav-link" style={navLinkStyle}>
                        Open Roles
                    </NavLink>

                    {applicant && (
                        <NavLink to="/careers/portal" className="careers-nav-link" style={navLinkStyle}>
                            <LayoutDashboard size={13} />
                            My Applications
                        </NavLink>
                    )}
                </nav>

                {/* ── Auth ──────────────────────────────────────── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {applicant ? (
                        <div ref={menuRef} style={{ position: 'relative' }}>
                            <button
                                onClick={() => setMenuOpen((v) => !v)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    background: menuOpen ? 'var(--surface-input)' : 'transparent',
                                    border: '1px solid var(--line)',
                                    borderRadius: 8, padding: '5px 10px 5px 8px',
                                    cursor: 'pointer', color: 'var(--text-primary)',
                                    fontSize: 13, fontWeight: 500,
                                    transition: 'background 0.15s',
                                }}
                            >
                                <span style={{
                                    width: 24, height: 24, borderRadius: '50%',
                                    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 11, fontWeight: 700, color: '', flexShrink: 0,
                                }}>
                                    {applicant.first_name?.[0]?.toUpperCase() ?? <User size={12} />}
                                </span>
                                <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {applicant.first_name}.profile
                                </span>
                                <ChevronDown
                                    size={13}
                                    color="var(--text-tertiary)"
                                    style={{ transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                                />
                            </button>

                            {menuOpen && (
                                <div style={{
                                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                                    background: 'var(--bg-primary)', border: '1px solid var(--line)',
                                    borderRadius: 10, overflow: 'hidden',
                                    minWidth: 190,
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                                }}>
                                    {/* Identity */}
                                    <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--line)' }}>
                                        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Signed in as</p>
                                        <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: '2px 0 0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {applicant.email}
                                        </p>
                                    </div>

                                    {/* Links */}
                                    <div style={{ padding: 4 }}>
                                        <Link
                                            to="/careers/portal"
                                            onClick={() => setMenuOpen(false)}
                                            className="careers-menu-item"
                                            style={menuItemStyle}
                                        >
                                            <LayoutDashboard size={14} />
                                            My Applications
                                        </Link>
                                        <Link
                                            to="/careers/portal/profile"
                                            onClick={() => setMenuOpen(false)}
                                            className="careers-menu-item"
                                            style={menuItemStyle}
                                        >
                                            <UserCircle size={14} />
                                            My Profile
                                        </Link>

                                        {/* Divider */}
                                        <div style={{ height: 1, background: 'var(--surface-input)', margin: '4px 8px' }} />

                                        <button
                                            onClick={handleLogout}
                                            className="careers-menu-item"
                                            style={{
                                                ...menuItemStyle,
                                                width: '100%', color: 'var(--status-error)',
                                                background: 'transparent', border: 'none',
                                                cursor: 'pointer', textAlign: 'left',
                                            }}
                                        >
                                            <LogOut size={14} />
                                            Sign out
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <Link
                                to="/careers/login"
                                className="careers-auth-btn-ghost"
                                style={{
                                    fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)',
                                    textDecoration: 'none', padding: '6px 12px',
                                    borderRadius: 7, transition: 'color 0.15s',
                                }}
                            >
                                Sign in
                            </Link>
                            <Link
                                to="/careers/register"
                                className="careers-auth-btn-primary"
                                style={{
                                    fontSize: 13, fontWeight: 600, color: '',
                                    textDecoration: 'none', padding: '6px 14px',
                                    borderRadius: 7, background: 'var(--color-primary-500)',
                                    transition: 'background 0.15s',
                                }}
                            >
                                Apply now
                            </Link>
                        </>
                    )}
                </div>
            </header>
        </>
    );
}