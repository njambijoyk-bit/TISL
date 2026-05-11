import { Link } from 'react-router-dom';
import { Briefcase } from 'lucide-react';

const LINKS = [
    { to: '/careers/about',          label: 'About' },
    { to: '/careers/contact',        label: 'Contact' },
    { to: '/careers/privacy-policy', label: 'Privacy Policy' },
    { to: '/careers/terms',          label: 'Terms of Service' },
    { to: '/careers/cookies',        label: 'Cookie Policy' },
];

export default function CareersFooter() {
    return (
        <footer style={{
            borderTop: '1px solid #1a1a1a',
            background: '#0a0a0a',
            padding: '32px 40px',
            fontFamily: "'DM Sans', sans-serif",
        }}>
            <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>

                {/* Brand */}
                <Link to="/careers" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                        width: 22, height: 22, borderRadius: 5,
                        background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <Briefcase size={11} color="#fff" strokeWidth={2.2} />
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#444', letterSpacing: '-0.01em' }}>
                        TISL Careers
                    </span>
                </Link>

                {/* Links */}
                <nav style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    {LINKS.map(({ to, label }, i) => (
                        <span key={to} style={{ display: 'flex', alignItems: 'center' }}>
                            {i > 0 && <span style={{ color: '#2a2a2a', margin: '0 4px', fontSize: 12 }}>·</span>}
                            <Link
                                to={to}
                                style={{ fontSize: 12, color: '#444', textDecoration: 'none', transition: 'color 0.15s' }}
                                onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
                                onMouseLeave={e => e.currentTarget.style.color = '#444'}
                            >
                                {label}
                            </Link>
                        </span>
                    ))}
                </nav>

                {/* Copyright */}
                <p style={{ margin: 0, fontSize: 12, color: '#333' }}>
                    © {new Date().getFullYear()} TISL. All rights reserved.
                </p>
            </div>
        </footer>
    );
}