// careers/pages/ForgotPasswordPage.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import useCareersStore from '../../_shared/store/useCareersStore';

const s = {
    page: { minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "var(--font-body, system-ui), sans-serif" },
    card: { background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 16, padding: '48px 40px', width: '100%', maxWidth: 440 },
    back: { display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-tertiary)', fontSize: 13, textDecoration: 'none', marginBottom: 32, transition: 'color 0.15s' },
    eyebrow: { fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-primary-500)', marginBottom: 10, fontWeight: 600 },
    title: { fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, fontFamily: "var(--font-heading, serif), serif" },
    sub: { fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 32, lineHeight: 1.6 },
    label: { display: 'block', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 7, fontWeight: 600 },
    input: { width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color 0.15s' },
    btn: { width: '100%', padding: '13px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))', color: '', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 8, transition: 'opacity 0.2s', fontFamily: 'inherit' },
    successBox: { background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '16px 18px', color: 'var(--status-success)', fontSize: 14, lineHeight: 1.6 },
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
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--color-primary-500)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}>
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
                                onFocus={e => e.target.style.borderColor = 'var(--color-primary-500)'}
                                onBlur={e => e.target.style.borderColor = 'var(--line)'}
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