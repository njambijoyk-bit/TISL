// components/legal/CookiePolicy.jsx
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function CookiePolicy() {
    return (
        <div style={{ background: '#0f0a1a', minHeight: '100vh', color: '#9ca3af', fontFamily: 'inherit' }}>
            <div style={{ maxWidth: 760, margin: '0 auto', padding: '56px 24px 100px' }}>

                <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7280', textDecoration: 'none', marginBottom: 48 }}
                    onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
                    onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}>
                    <ArrowLeft size={14} /> Back to Home
                </Link>

                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#a855f7', marginBottom: 12 }}>Legal</p>
                <h1 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800, color: '#f9fafb', margin: '0 0 10px', letterSpacing: '-0.02em' }}>Cookie Policy</h1>
                <p style={{ fontSize: 13, color: '#4b5563', marginBottom: 40, paddingBottom: 28, borderBottom: '1px solid rgba(168,85,247,0.12)' }}>Last updated: May 2026</p>

                <div style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.18)', borderLeft: '3px solid #a855f7', borderRadius: 8, padding: '16px 20px', marginBottom: 36, fontSize: 14, color: '#c084fc', lineHeight: 1.75 }}>
                    The TISL platform uses a small number of essential cookies to function correctly. We do not use advertising, tracking, or third-party cookies.
                </div>

                <h2 style={h2}>1. What Are Cookies</h2>
                <p style={p}>
                    Cookies are small text files stored on your device by your browser when you visit a website.
                    They help the site remember information about your visit, such as your login session and preferences.
                </p>

                <h2 style={h2}>2. Cookies We Use</h2>
                <p style={p}>We use only essential cookies necessary for the platform to function:</p>
                <ul style={ul}>
                    <li style={li}>
                        <strong style={strong}>Authentication token</strong> — stored in your browser's local storage to keep you logged in.
                        Cleared automatically when you sign out or your session expires.
                    </li>
                    <li style={li}>
                        <strong style={strong}>Session cookie</strong> — a short-lived cookie used to maintain your browsing session and CSRF protection.
                        Expires when you close your browser.
                    </li>
                    <li style={li}>
                        <strong style={strong}>Theme preference</strong> — stores your light/dark mode preference so it persists across visits.
                        No personal data is involved.
                    </li>
                </ul>

                <h2 style={h2}>3. Cookies We Do Not Use</h2>
                <ul style={ul}>
                    <li style={li}>Advertising or retargeting cookies</li>
                    <li style={li}>Analytics or behaviour tracking cookies (e.g. Google Analytics)</li>
                    <li style={li}>Social media tracking pixels</li>
                    <li style={li}>Any third-party cookies</li>
                </ul>

                <h2 style={h2}>4. Managing Cookies</h2>
                <p style={p}>
                    You can control and delete cookies through your browser settings. Note that disabling
                    essential cookies will prevent you from logging in or using account features.
                    Clearing your browser's local storage will sign you out of the platform.
                </p>
                <p style={p}>
                    Most browsers allow you to view, manage, and delete cookies via their settings menu.
                    Refer to your browser's help documentation for specific instructions.
                </p>

                <h2 style={h2}>5. Changes to This Policy</h2>
                <p style={p}>
                    If we introduce new cookies in the future this policy will be updated. Registered users
                    will be notified of material changes by email.
                </p>

                <h2 style={h2}>6. Contact</h2>
                <p style={p}>
                    Cookie-related questions? Contact us at{' '}
                    <a href="mailto:web@targetisl.co.ke" style={aStyle}>web@targetisl.co.ke</a>{' '}
                    or visit our <Link to="/contact" style={aStyle}>Contact page</Link>.
                </p>
            </div>
        </div>
    );
}

const h2 = { fontSize: 17, fontWeight: 700, color: '#e5e7eb', margin: '40px 0 12px', paddingBottom: 8, borderBottom: '1px solid rgba(168,85,247,0.1)' };
const p  = { margin: '0 0 18px', fontSize: 15, lineHeight: 1.85 };
const ul = { paddingLeft: 22, margin: '0 0 18px', display: 'flex', flexDirection: 'column', gap: 8 };
const li = { fontSize: 15, lineHeight: 1.75 };
const strong = { color: '#e5e7eb', fontWeight: 600 };
const aStyle = { color: '#a855f7', textDecoration: 'none' };