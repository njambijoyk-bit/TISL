import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function LegalLayout({ eyebrow, title, lastUpdated, children }) {
    return (
        <div style={{ background: 'var(--bg-primary)', minHeight: '100vh', fontFamily: "var(--font-body, system-ui), sans-serif", color: 'var(--text-primary)' }}>
            <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 32px 96px' }}>

                <Link
                    to="/careers"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-tertiary)', textDecoration: 'none', marginBottom: 40 }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--color-primary-500)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
                >
                    <ArrowLeft size={14} /> Back to Careers
                </Link>

                {eyebrow && (
                    <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-primary-500)', marginBottom: 12 }}>
                        {eyebrow}
                    </p>
                )}

                <h1 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 700, lineHeight: 1.15, margin: '0 0 12px', color: 'var(--color-primary-400)', fontFamily: "var(--font-heading, serif), serif" }}>
                    {title}
                </h1>

                {lastUpdated && (
                    <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 48 }}>Last updated: {lastUpdated}</p>
                )}

                <div style={{ lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                    {children}
                </div>
            </div>
        </div>
    );
}

// ── Shared prose components ────────────────────────────────────────────────────

export function H2({ children }) {
    return <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '40px 0 12px', fontFamily: "var(--font-body, system-ui), sans-serif" }}>{children}</h2>;
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
    return <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{children}</strong>;
}

export function InfoBox({ children }) {
    return (
        <div style={{
            background: 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary-500) 15%, transparent)',
            borderRadius: 10, padding: '16px 20px', marginBottom: 24,
            fontSize: 14, color: 'var(--color-primary-400)', lineHeight: 1.7,
        }}>
            {children}
        </div>
    );
}