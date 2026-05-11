// careers/pages/ForgotPasswordPage.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import useCareersStore from '../../store/useCareersStore';

const s = {
    page: { minHeight: '100vh', background: '#0f0f0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'DM Sans', sans-serif" },
    card: { background: '#161616', border: '1px solid #1e1e1e', borderRadius: 16, padding: '48px 40px', width: '100%', maxWidth: 440 },
    back: { display: 'inline-flex', alignItems: 'center', gap: 6, color: '#555', fontSize: 13, textDecoration: 'none', marginBottom: 32, transition: 'color 0.15s' },
    eyebrow: { fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#a855f7', marginBottom: 10, fontWeight: 600 },
    title: { fontSize: 26, fontWeight: 700, color: '#f0f0f0', marginBottom: 6, fontFamily: "'DM Serif Display', serif" },
    sub: { fontSize: 14, color: '#555', marginBottom: 32, lineHeight: 1.6 },
    label: { display: 'block', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#555', marginBottom: 7, fontWeight: 600 },
    input: { width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #222', background: '#0f0f0f', color: '#f0f0f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color 0.15s' },
    btn: { width: '100%', padding: '13px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 8, transition: 'opacity 0.2s', fontFamily: 'inherit' },
    successBox: { background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '16px 18px', color: '#10b981', fontSize: 14, lineHeight: 1.6 },
};

export default function ForgotPasswordPage() {
    const { forgotPassword } = useCareersStore();
    const [email, setEmail]     = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent]       = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await forgotPassword(email);
            setSent(true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={s.page}>
            <div style={s.card}>
                <Link to="/careers/login" style={s.back}
                    onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
                    onMouseLeave={e => e.currentTarget.style.color = '#555'}>
                    ← Back to login
                </Link>

                <p style={s.eyebrow}>Applicant Portal</p>
                <h1 style={s.title}>Forgot password?</h1>
                <p style={s.sub}>
                    Enter the email address on your account and we'll send a reset link your way.
                </p>

                {sent ? (
                    <div style={s.successBox}>
                        ✓ If that email is registered, a reset link is on its way. Check your inbox (and spam folder).
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div style={{ marginBottom: 20 }}>
                            <label style={s.label}>Email address</label>
                            <input
                                style={s.input}
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                required
                                autoFocus
                                onFocus={e => e.target.style.borderColor = '#a855f7'}
                                onBlur={e => e.target.style.borderColor = '#222'}
                            />
                        </div>
                        <button style={s.btn} type="submit" disabled={loading}>
                            {loading ? 'Sending…' : 'Send reset link'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}