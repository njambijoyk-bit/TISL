// careers/components/CareersHeader.jsx
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Briefcase, LayoutDashboard, LogOut, ChevronDown, User, UserCircle } from 'lucide-react';
import useCareersStore from '../../store/useCareersStore';

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
        color: isActive ? '#f0f0f0' : '#666',
        textDecoration: 'none',
        padding: '6px 10px',
        borderRadius: 6,
        transition: 'color 0.15s',
        background: isActive ? '#1a1a1a' : 'transparent',
    });

    const menuItemStyle = {
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', borderRadius: 6,
        fontSize: 13, color: '#aaa', textDecoration: 'none',
        transition: 'background 0.12s, color 0.12s',
    };

    return (
        <>
            <style>{`
                .careers-nav-link:hover { color: #d0d0d0 !important; }
                .careers-menu-item:hover { background: #1e1e1e !important; color: #f0f0f0 !important; }
                .careers-auth-btn-primary:hover { background: #9333ea !important; }
                .careers-auth-btn-ghost:hover { color: #f0f0f0 !important; }
            `}</style>

            <header style={{
                position: 'sticky',
                top: 0,
                zIndex: 50,
                height: 56,
                display: 'flex',
                alignItems: 'center',
                padding: '0 40px',
                background: scrolled ? 'rgba(15,15,15,0.88)' : '#0f0f0f',
                backdropFilter: scrolled ? 'blur(12px)' : 'none',
                WebkitBackdropFilter: scrolled ? 'blur(12px)' : 'none',
                borderBottom: `1px solid ${scrolled ? '#2a2a2a' : '#1e1e1e'}`,
                transition: 'background 0.25s, backdrop-filter 0.25s, border-color 0.25s',
                fontFamily: "'DM Sans', sans-serif",
            }}>

                {/* ── Brand ─────────────────────────────────────── */}
                <Link to="/careers" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, marginRight: 36 }}>
                    <span style={{
                        width: 28, height: 28, borderRadius: 7,
                        background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        <Briefcase size={14} color="#fff" strokeWidth={2.2} />
                    </span>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#f0f0f0', letterSpacing: '-0.02em' }}>TISL</span>
                        <span style={{ fontSize: 12, fontWeight: 400, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Careers</span>
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
                                    background: menuOpen ? '#1e1e1e' : 'transparent',
                                    border: '1px solid #2a2a2a',
                                    borderRadius: 8, padding: '5px 10px 5px 8px',
                                    cursor: 'pointer', color: '#ccc',
                                    fontSize: 13, fontWeight: 500,
                                    transition: 'background 0.15s',
                                }}
                            >
                                <span style={{
                                    width: 24, height: 24, borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
                                }}>
                                    {applicant.first_name?.[0]?.toUpperCase() ?? <User size={12} />}
                                </span>
                                <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {applicant.first_name}.profile
                                </span>
                                <ChevronDown
                                    size={13}
                                    color="#555"
                                    style={{ transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                                />
                            </button>

                            {menuOpen && (
                                <div style={{
                                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                                    background: '#111', border: '1px solid #2a2a2a',
                                    borderRadius: 10, overflow: 'hidden',
                                    minWidth: 190,
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                                }}>
                                    {/* Identity */}
                                    <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #1e1e1e' }}>
                                        <p style={{ fontSize: 12, color: '#555', margin: 0 }}>Signed in as</p>
                                        <p style={{ fontSize: 13, color: '#ccc', margin: '2px 0 0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                                        <div style={{ height: 1, background: '#1e1e1e', margin: '4px 8px' }} />

                                        <button
                                            onClick={handleLogout}
                                            className="careers-menu-item"
                                            style={{
                                                ...menuItemStyle,
                                                width: '100%', color: '#ef4444',
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
                                    fontSize: 13, fontWeight: 500, color: '#777',
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
                                    fontSize: 13, fontWeight: 600, color: '#fff',
                                    textDecoration: 'none', padding: '6px 14px',
                                    borderRadius: 7, background: '#a855f7',
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