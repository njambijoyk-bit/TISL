// components/legal/TermsOfService.jsx
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function TermsOfService() {
    return (
        <div style={{ background: '#0f0a1a', minHeight: '100vh', color: '#9ca3af', fontFamily: 'inherit' }}>
            <div style={{ maxWidth: 760, margin: '0 auto', padding: '56px 24px 100px' }}>

                <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7280', textDecoration: 'none', marginBottom: 48 }}
                    onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
                    onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}>
                    <ArrowLeft size={14} /> Back to Home
                </Link>

                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#a855f7', marginBottom: 12 }}>Legal</p>
                <h1 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800, color: '#f9fafb', margin: '0 0 10px', letterSpacing: '-0.02em' }}>Terms of Service</h1>
                <p style={{ fontSize: 13, color: '#4b5563', marginBottom: 40, paddingBottom: 28, borderBottom: '1px solid rgba(168,85,247,0.12)' }}>Last updated: May 2026</p>

                <div style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.18)', borderLeft: '3px solid #a855f7', borderRadius: 8, padding: '16px 20px', marginBottom: 36, fontSize: 14, color: '#c084fc', lineHeight: 1.75 }}>
                    By creating an account or placing an order on the TISL platform you agree to these Terms of Service. Please read them carefully before using our services.
                </div>

                <h2 style={h2}>1. Acceptance of Terms</h2>
                <p style={p}>
                    These terms govern your use of the TISL platform including the website, mobile app, and all associated services.
                    By registering or transacting, you confirm you have read and agree to be bound by these terms.
                </p>

                <h2 style={h2}>2. Eligibility</h2>
                <ul style={ul}>
                    <li style={li}>You must be at least 18 years of age to use the platform</li>
                    <li style={li}>You must provide accurate and truthful information when registering</li>
                    <li style={li}>Business accounts must be authorised representatives of their organisation</li>
                </ul>

                <h2 style={h2}>3. Orders & Payments</h2>
                <p style={p}>
                    All orders placed on the platform are subject to availability and acceptance by TISL.
                    Prices are displayed in Kenyan Shillings (KES) and are inclusive of applicable taxes unless stated otherwise.
                    Payment is processed via M-Pesa. Orders are confirmed only upon successful payment.
                </p>

                <h2 style={h2}>4. Quotes & Projects</h2>
                <p style={p}>
                    Quote requests submitted through the platform are not binding orders. TISL will review and respond
                    with a formal quote. Acceptance of a quote constitutes agreement to purchase under the quoted terms.
                    Project timelines and deliverables are agreed upon in writing before work commences.
                </p>

                <h2 style={h2}>5. Cancellations & Returns</h2>
                <p style={p}>
                    Orders may be cancelled before dispatch. Returns are accepted within 7 days of delivery for
                    unused items in original condition. Custom or special-order items are non-returnable unless
                    defective. Contact us at{' '}
                    <a href="mailto:web@targetisl.co.ke" style={aStyle}>web@targetisl.co.ke</a> to initiate a return.
                </p>

                <h2 style={h2}>6. Intellectual Property</h2>
                <p style={p}>
                    All content on the TISL platform — including product listings, descriptions, images, branding,
                    and software — is the property of TISL or its licensors. You may not reproduce, distribute,
                    or create derivative works without written permission.
                </p>

                <h2 style={h2}>7. User Conduct</h2>
                <p style={p}>You agree not to:</p>
                <ul style={ul}>
                    <li style={li}>Use the platform for any unlawful purpose</li>
                    <li style={li}>Submit false, misleading, or fraudulent information</li>
                    <li style={li}>Attempt to gain unauthorised access to any part of the platform</li>
                    <li style={li}>Interfere with the platform's operation or other users' experience</li>
                </ul>

                <h2 style={h2}>8. Account Termination</h2>
                <p style={p}>
                    TISL reserves the right to suspend or terminate accounts that violate these terms,
                    engage in fraudulent activity, or behave abusively toward our staff or other users.
                </p>

                <h2 style={h2}>9. Limitation of Liability</h2>
                <p style={p}>
                    TISL is not liable for indirect, incidental, or consequential loss arising from use of the platform,
                    including delays, service interruptions, or errors in product information. Our total liability
                    for any claim shall not exceed the value of the relevant order.
                </p>

                <h2 style={h2}>10. Changes to These Terms</h2>
                <p style={p}>
                    We may update these terms from time to time. Material changes will be communicated by email
                    to registered users. Continued use of the platform after changes are posted constitutes acceptance.
                </p>

                <h2 style={h2}>11. Governing Law</h2>
                <p style={p}>
                    These terms are governed by the laws of Kenya. Any disputes shall be subject to the
                    exclusive jurisdiction of the Kenyan courts.
                </p>

                <h2 style={h2}>12. Contact</h2>
                <p style={p}>
                    Questions about these terms? Reach us at{' '}
                    <a href="mailto:web@targetisl.co.ke" style={aStyle}>web@targetisl.co.ke</a>.
                </p>
            </div>
        </div>
    );
}

const h2 = { fontSize: 17, fontWeight: 700, color: '#e5e7eb', margin: '40px 0 12px', paddingBottom: 8, borderBottom: '1px solid rgba(168,85,247,0.1)' };
const p  = { margin: '0 0 18px', fontSize: 15, lineHeight: 1.85 };
const ul = { paddingLeft: 22, margin: '0 0 18px', display: 'flex', flexDirection: 'column', gap: 8 };
const li = { fontSize: 15, lineHeight: 1.75 };
const aStyle = { color: '#a855f7', textDecoration: 'none' };