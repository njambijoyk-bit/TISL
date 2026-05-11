import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function LegalLayout({ eyebrow, title, lastUpdated, children }) {
    return (
        <div style={{ background: '#0f0f0f', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif", color: '#f0f0f0' }}>
            <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 32px 96px' }}>

                <Link
                    to="/careers"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#555', textDecoration: 'none', marginBottom: 40 }}
                    onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
                    onMouseLeave={e => e.currentTarget.style.color = '#555'}
                >
                    <ArrowLeft size={14} /> Back to Careers
                </Link>

                {eyebrow && (
                    <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#a855f7', marginBottom: 12 }}>
                        {eyebrow}
                    </p>
                )}

                <h1 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 700, lineHeight: 1.15, margin: '0 0 12px', color: '#d799f0', fontFamily: "'DM Serif Display', serif" }}>
                    {title}
                </h1>

                {lastUpdated && (
                    <p style={{ fontSize: 13, color: '#444', marginBottom: 48 }}>Last updated: {lastUpdated}</p>
                )}

                <div style={{ lineHeight: 1.8, color: '#aaa' }}>
                    {children}
                </div>
            </div>
        </div>
    );
}

// ── Shared prose components ────────────────────────────────────────────────────

export function H2({ children }) {
    return <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e0e0e0', margin: '40px 0 12px', fontFamily: "'DM Sans', sans-serif" }}>{children}</h2>;
}

export function P({ children }) {
    return <p style={{ margin: '0 0 16px', fontSize: 15 }}>{children}</p>;
}

export function Ul({ children }) {
    return <ul style={{ paddingLeft: 20, margin: '0 0 16px' }}>{children}</ul>;
}

export function Li({ children }) {
    return <li style={{ marginBottom: 8, fontSize: 15 }}>{children}</li>;
}

export function Highlight({ children }) {
    return <strong style={{ color: '#d0d0d0', fontWeight: 600 }}>{children}</strong>;
}

export function InfoBox({ children }) {
    return (
        <div style={{
            background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)',
            borderRadius: 10, padding: '16px 20px', marginBottom: 24,
            fontSize: 14, color: '#c084fc', lineHeight: 1.7,
        }}>
            {children}
        </div>
    );
}