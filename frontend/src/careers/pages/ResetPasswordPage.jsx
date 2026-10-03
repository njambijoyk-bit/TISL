// careers/pages/ResetPasswordPage.jsx
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import useCareersStore from '../../_shared/store/useCareersStore';

const s = {
    page: { minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "var(--font-body, system-ui), sans-serif" },
    card: { background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 16, padding: '48px 40px', width: '100%', maxWidth: 440 },
    eyebrow: { fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-primary-500)', marginBottom: 10, fontWeight: 600 },
    title: { fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, fontFamily: "var(--font-heading, serif), serif" },
    sub: { fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 32 },
    field: { marginBottom: 18 },
    label: { display: 'block', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 7, fontWeight: 600 },
    input: { width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color 0.15s' },
    btn: { width: '100%', padding: '13px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))', color: '', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 8, transition: 'opacity 0.2s', fontFamily: 'inherit' },
    errBox: { background: 'color-mix(in srgb, var(--status-error) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--status-error) 40%, transparent)', borderRadius: 8, padding: '12px 14px', color: 'var(--status-error)', fontSize: 13, marginBottom: 20 },
    errField: { fontSize: 12, color: 'var(--status-error)', marginTop: 5 },
    successBox: { background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '16px 18px', color: 'var(--status-success)', fontSize: 14, lineHeight: 1.6, marginBottom: 20 },
};

export default function ResetPasswordPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token') ?? '';
    const email = searchParams.get('email') ?? '';

    const { resetPassword } = useCareersStore();

    const [form, setForm]         = useState({ password: '', password_confirmation: '' });
    const [loading, setLoading]   = useState(false);
    const [success, setSuccess]   = useState(false);
    const [errors, setErrors]     = useState({});
    const [globalError, setGlobalError] = useState(null);

    const patch = (key) => (e) => {
        setForm(f => ({ ...f, [key]: e.target.value }));
        setErrors(er => { const n = { ...er }; delete n[key]; return n; });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});
        setGlobalError(null);
        try {
            await resetPassword({ token, email, ...form });
            setSuccess(true);
            setTimeout(() => navigate('/careers/login', { replace: true }), 2500);
        } catch (err) {
            if (err?.errors) setErrors(err.errors);
            else setGlobalError(err?.message ?? 'Reset failed. The link may have expired.');
        } finally {
            setLoading(false);
        }
    };

    if (!token || !email) {
        return (
            <div style={s.page}>
                <div style={s.card}>
                    <p style={s.eyebrow}>Applicant Portal</p>
                    <h1 style={{ ...s.title, color: 'var(--status-error)' }}>Invalid link</h1>
                    <p style={s.sub}>This reset link is missing required information. Please request a new one.</p>
                    <Link to="/careers/forgot-password" style={{ color: 'var(--color-primary-500)', fontSize: 14 }}>
                        Request a new link →
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div style={s.page}>
            <div style={s.card}>
                <p style={s.eyebrow}>Applicant Portal</p>
                <h1 style={s.title}>Set new password</h1>
                <p style={s.sub}>Choose a strong password for <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>.</p>

                {success && (
                    <div style={s.successBox}>
                        ✓ Password reset! Redirecting you to login…
                    </div>
                )}

                {globalError && <div style={s.errBox}>{globalError}</div>}

                {!success && (
                    <form onSubmit={handleSubmit}>
                        <div style={s.field}>
                            <label style={s.label}>New password</label>
                            <input
                                style={s.input} type="password"
                                value={form.password} onChange={patch('password')}
                                placeholder="Min. 8 characters" required
                                onFocus={e => e.target.style.borderColor = 'var(--color-primary-500)'}
                                onBlur={e => e.target.style.borderColor = 'var(--line)'}
                            />
                            {errors.password && <p style={s.errField}>{errors.password[0]}</p>}
                        </div>
                        <div style={s.field}>
                            <label style={s.label}>Confirm password</label>
                            <input
                                style={s.input} type="password"
                                value={form.password_confirmation} onChange={patch('password_confirmation')}
                                placeholder="Repeat your new password" required
                                onFocus={e => e.target.style.borderColor = 'var(--color-primary-500)'}
                                onBlur={e => e.target.style.borderColor = 'var(--line)'}
                            />
                            {errors.password_confirmation && <p style={s.errField}>{errors.password_confirmation[0]}</p>}
                        </div>
                        <button style={s.btn} type="submit" disabled={loading}>
                            {loading ? 'Saving…' : 'Reset password'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}