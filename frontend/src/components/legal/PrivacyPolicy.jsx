// components/legal/PrivacyPolicy.jsx
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPolicy() {
    return (
        <div style={{ background: '#0f0a1a', minHeight: '100vh', color: '#9ca3af', fontFamily: 'inherit' }}>
            <div style={{ maxWidth: 760, margin: '0 auto', padding: '56px 24px 100px' }}>

                <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7280', textDecoration: 'none', marginBottom: 48 }}
                    onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
                    onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}>
                    <ArrowLeft size={14} /> Back to Home
                </Link>

                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#a855f7', marginBottom: 12 }}>Legal</p>
                <h1 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800, color: '#f9fafb', margin: '0 0 10px', letterSpacing: '-0.02em' }}>Privacy Policy</h1>
                <p style={{ fontSize: 13, color: '#4b5563', marginBottom: 40, paddingBottom: 28, borderBottom: '1px solid rgba(168,85,247,0.12)' }}>Last updated: May 2026</p>

                <div style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.18)', borderLeft: '3px solid #a855f7', borderRadius: 8, padding: '16px 20px', marginBottom: 36, fontSize: 14, color: '#c084fc', lineHeight: 1.75 }}>
                    This Privacy Policy explains how Target Industrial Suppliers 11 Limited ("TISL", "we", "us") collects, uses, and protects your personal data when you use our platform.
                </div>

                <h2 style={h2}>1. Information We Collect</h2>
                <p style={p}>When you use TISL we may collect:</p>
                <ul style={ul}>
                    <li style={li}><strong style={strong}>Account information</strong> — name, email address, phone number, and password when you register</li>
                    <li style={li}><strong style={strong}>Order & transaction data</strong> — products purchased, payment status, delivery addresses, and order history</li>
                    <li style={li}><strong style={strong}>Quote & project data</strong> — quote requests, project details, and associated documents you submit</li>
                    <li style={li}><strong style={strong}>Usage data</strong> — pages visited, search queries, and interactions with the platform</li>
                    <li style={li}><strong style={strong}>Communications</strong> — messages sent through our platform, support tickets, and chat interactions</li>
                </ul>

                <h2 style={h2}>2. How We Use Your Information</h2>
                <ul style={ul}>
                    <li style={li}>Process and fulfil your orders and quote requests</li>
                    <li style={li}>Manage your account and provide customer support</li>
                    <li style={li}>Send transactional emails (order confirmations, payment receipts, quote updates)</li>
                    <li style={li}>Improve our platform and personalise your experience</li>
                    <li style={li}>Comply with legal and regulatory obligations</li>
                </ul>

                <h2 style={h2}>3. Data Sharing</h2>
                <p style={p}>
                    We do not sell or rent your personal data. We may share data with trusted service providers
                    who assist in operating our platform (payment processors, logistics partners, email delivery).
                    All third parties are bound by confidentiality obligations and may not use your data for their own purposes.
                </p>

                <h2 style={h2}>4. Payments</h2>
                <p style={p}>
                    Payment transactions are processed via M-Pesa (Safaricom Daraja). We do not store card numbers
                    or mobile money PINs. Transaction references and statuses are recorded for order management purposes.
                </p>

                <h2 style={h2}>5. Data Retention</h2>
                <p style={p}>
                    We retain your account and order data for as long as your account is active or as required by
                    Kenyan law. You may request deletion of your account by contacting us at{' '}
                    <a href="mailto:web@targetisl.co.ke" style={aStyle}>web@targetisl.co.ke</a>.
                </p>

                <h2 style={h2}>6. Security</h2>
                <p style={p}>
                    We use industry-standard security practices including HTTPS encryption, hashed passwords,
                    and token-based authentication. Access to your personal data is restricted to authorised TISL staff only.
                </p>

                <h2 style={h2}>7. Your Rights</h2>
                <ul style={ul}>
                    <li style={li}>Access and review your personal data via your account profile</li>
                    <li style={li}>Correct inaccurate information at any time</li>
                    <li style={li}>Request deletion of your account and associated data</li>
                    <li style={li}>Opt out of marketing communications</li>
                </ul>

                <h2 style={h2}>8. Cookies</h2>
                <p style={p}>
                    We use essential cookies for authentication and session management. See our{' '}
                    <Link to="/cookies" style={aStyle}>Cookie Policy</Link> for details.
                </p>

                <h2 style={h2}>9. Contact</h2>
                <p style={p}>
                    For privacy enquiries contact us at{' '}
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