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
            borderTop: '1px solid var(--line)',
            background: 'var(--bg-primary)',
            padding: '32px 40px',
            fontFamily: "var(--font-body, system-ui), sans-serif",
        }}>
            <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>

                {/* Brand */}
                <Link to="/careers" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                        width: 22, height: 22, borderRadius: 5,
                        background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <Briefcase size={11} color="#fff" strokeWidth={2.2} />
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '-0.01em' }}>
                        TISL Careers
                    </span>
                </Link>

                {/* Links */}
                <nav style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    {LINKS.map(({ to, label }, i) => (
                        <span key={to} style={{ display: 'flex', alignItems: 'center' }}>
                            {i > 0 && <span style={{ color: 'var(--text-tertiary)', margin: '0 4px', fontSize: 12 }}>·</span>}
                            <Link
                                to={to}
                                style={{ fontSize: 12, color: 'var(--text-tertiary)', textDecoration: 'none', transition: 'color 0.15s' }}
                                onMouseEnter={e => e.currentTarget.style.color = 'var(--color-primary-500)'}
                                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
                            >
                                {label}
                            </Link>
                        </span>
                    ))}
                </nav>

                {/* Copyright */}
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
                    © {new Date().getFullYear()} TISL. All rights reserved.
                </p>
            </div>
        </footer>
    );
}