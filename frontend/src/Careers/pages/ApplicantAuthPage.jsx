import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import useCareersStore from '../../store/useCareersStore';

const s = {
    page: { minHeight: '100vh', background: '#0f0f0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'DM Sans', sans-serif" },
    card: { background: '#161616', border: '1px solid #1e1e1e', borderRadius: 16, padding: '48px 40px', width: '100%', maxWidth: 460 },
    back: { display: 'inline-flex', alignItems: 'center', gap: 6, color: '#555', fontSize: 13, textDecoration: 'none', marginBottom: 32, transition: 'color 0.15s' },
    eyebrow: { fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#a855f7', marginBottom: 10, fontWeight: 600 },
    title: { fontSize: 28, fontWeight: 700, color: '#f0f0f0', marginBottom: 6, fontFamily: "'DM Serif Display', serif" },
    sub: { fontSize: 14, color: '#555', marginBottom: 32 },
    tabs: { display: 'flex', gap: 0, marginBottom: 32, borderBottom: '1px solid #1e1e1e' },
    tab: (active) => ({
        flex: 1, padding: '10px 0', textAlign: 'center', fontSize: 14, fontWeight: 600,
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: active ? '#a855f7' : '#555',
        borderBottom: active ? '2px solid #a855f7' : '2px solid transparent',
        marginBottom: -1, transition: 'all 0.15s',
    }),
    field: { marginBottom: 18 },
    label: { display: 'block', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#555', marginBottom: 7, fontWeight: 600 },
    input: { width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #222', background: '#0f0f0f', color: '#f0f0f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color 0.15s' },
    row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
    submitBtn: { width: '100%', padding: '13px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 8, transition: 'opacity 0.2s' },
    errBox: { background: '#2d1111', border: '1px solid #5a1d1d', borderRadius: 8, padding: '12px 14px', color: '#f87171', fontSize: 13, marginBottom: 20 },
    errField: { fontSize: 12, color: '#f87171', marginTop: 5 },
    divider: { borderTop: '1px solid #1e1e1e', margin: '28px 0' },
    portalLink: { textAlign: 'center', fontSize: 13, color: '#555' },
};

function Field({ label, name, type = 'text', value, onChange, error, placeholder }) {
    return (
        <div style={s.field}>
            <label style={s.label}>{label}</label>
            <input
                style={s.input} type={type} name={name} value={value}
                onChange={onChange} placeholder={placeholder}
                onFocus={(e) => e.target.style.borderColor = '#a855f7'}
                onBlur={(e) => e.target.style.borderColor = '#222'}
            />
            {error && <p style={s.errField}>{error}</p>}
        </div>
    );
}

export default function ApplicantAuthPage() {
    const [searchParams] = useSearchParams();
    const next = searchParams.get('next') ?? '/careers/portal';
    const navigate = useNavigate();
    const { login, register, authLoading } = useCareersStore();

    const [tab, setTab] = useState('login');
    const [accepted, setAccepted] = useState(false);
    const [errors, setErrors] = useState({});
    const [globalError, setGlobalError] = useState(null);

    const [loginForm, setLoginForm] = useState({ email: '', password: '' });
    const [regForm, setRegForm] = useState({
        first_name: '', last_name: '', email: '', password: '',
        password_confirmation: '', phone: '', current_role: '',
    });

    const handleLogin = async (e) => {
        e.preventDefault();
        setErrors({}); setGlobalError(null);
        try {
            const res = await login(loginForm);
            // Admin-initiated password reset — force change before portal access
            if (res.must_change_password) {
                navigate('/careers/portal/change-password', { replace: true });
            } else {
                navigate(next, { replace: true });
            }
        } catch (err) {
            if (err.errors) setErrors(err.errors);
            else setGlobalError(err.message ?? 'Login failed. Please try again.');
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setErrors({}); setGlobalError(null);
        try {
            await register(regForm);
            navigate(next, { replace: true });
        } catch (err) {
            if (err.errors) setErrors(err.errors);
            else setGlobalError(err.message ?? 'Registration failed. Please try again.');
        }
    };

    const patchReg = (field) => (e) => setRegForm((f) => ({ ...f, [field]: e.target.value }));
    const patchLogin = (field) => (e) => setLoginForm((f) => ({ ...f, [field]: e.target.value }));

    return (
        <div style={s.page}>
            <div style={s.card}>
                <Link to="/careers" style={s.back}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#a855f7'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#555'}>
                    ← Back to Careers
                </Link>

                <p style={s.eyebrow}>Applicant Portal</p>
                <h1 style={s.title}>{tab === 'login' ? 'Welcome back.' : 'Create your account.'}</h1>
                <p style={s.sub}>{tab === 'login' ? 'Track your applications and manage your profile.' : 'Apply to roles and track your applications in one place.'}</p>

                <div style={s.tabs}>
                    <button style={s.tab(tab === 'login')} onClick={() => { setTab('login'); setAccepted(false); }}>Login</button>
                    <button style={s.tab(tab === 'register')} onClick={() => { setTab('register'); setAccepted(false); }}>Register</button>
                </div>

                {globalError && <div style={s.errBox}>{globalError}</div>}

                {tab === 'login' ? (
                    <form onSubmit={handleLogin}>
                        <Field label="Email" name="email" type="email" value={loginForm.email} onChange={patchLogin('email')} error={errors.email?.[0]} />
                        <Field label="Password" name="password" type="password" value={loginForm.password} onChange={patchLogin('password')} error={errors.password?.[0]} />
                        <div style={{ textAlign: 'right', marginBottom: 20, marginTop: -10 }}>
                            <Link to="/careers/forgot-password" style={{ fontSize: 12, color: '#555', textDecoration: 'none' }}>Forgot password?</Link>
                        </div>
                        {/* ── Terms checkbox ── */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '16px 0 8px' }}>
                            <input
                                id="accept-terms"
                                type="checkbox"
                                checked={accepted}
                                onChange={e => setAccepted(e.target.checked)}
                                style={{ marginTop: 2, accentColor: '#a855f7', cursor: 'pointer', flexShrink: 0 }}
                            />
                            <label htmlFor="accept-terms" style={{ fontSize: 12, color: '#666', lineHeight: 1.6, cursor: 'pointer' }}>
                                I have read and agree to the{' '}
                                <Link to="/careers/terms" target="_blank" style={{ color: '#a855f7', textDecoration: 'none' }}>Terms of Service</Link>
                                {' '}and{' '}
                                <Link to="/careers/privacy-policy" target="_blank" style={{ color: '#a855f7', textDecoration: 'none' }}>Privacy Policy</Link>
                            </label>
                        </div>
                        <button style={{ ...s.submitBtn, opacity: (!accepted || authLoading) ? 0.4 : 1, cursor: (!accepted || authLoading) ? 'not-allowed' : 'pointer' }} type="submit" disabled={authLoading || !accepted}>
                            {authLoading ? 'Logging in…' : 'Log in'}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleRegister}>
                        <div style={s.row2}>
                            <Field label="First Name" name="first_name" value={regForm.first_name} onChange={patchReg('first_name')} error={errors.first_name?.[0]} />
                            <Field label="Last Name" name="last_name" value={regForm.last_name} onChange={patchReg('last_name')} error={errors.last_name?.[0]} />
                        </div>
                        <Field label="Email" name="email" type="email" value={regForm.email} onChange={patchReg('email')} error={errors.email?.[0]} />
                        <Field label="Phone" name="phone" type="tel" value={regForm.phone} onChange={patchReg('phone')} placeholder="+254 7xx xxx xxx" error={errors.phone?.[0]} />
                        <Field label="Current Role" name="current_role" value={regForm.current_role} onChange={patchReg('current_role')} placeholder="e.g. Mechanical Engineer" error={errors.current_role?.[0]} />
                        <Field label="Password" name="password" type="password" value={regForm.password} onChange={patchReg('password')} error={errors.password?.[0]} />
                        <Field label="Confirm Password" name="password_confirmation" type="password" value={regForm.password_confirmation} onChange={patchReg('password_confirmation')} />
                        {/* ── Terms checkbox ── */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '16px 0 8px' }}>
                            <input
                                id="accept-terms-reg"
                                type="checkbox"
                                checked={accepted}
                                onChange={e => setAccepted(e.target.checked)}
                                style={{ marginTop: 2, accentColor: '#a855f7', cursor: 'pointer', flexShrink: 0 }}
                            />
                            <label htmlFor="accept-terms-reg" style={{ fontSize: 12, color: '#666', lineHeight: 1.6, cursor: 'pointer' }}>
                                I have read and agree to the{' '}
                                <Link to="/careers/terms" target="_blank" style={{ color: '#a855f7', textDecoration: 'none' }}>Terms of Service</Link>
                                {' '}and{' '}
                                <Link to="/careers/privacy-policy" target="_blank" style={{ color: '#a855f7', textDecoration: 'none' }}>Privacy Policy</Link>
                            </label>
                        </div>
                        <button style={{ ...s.submitBtn, opacity: (!accepted || authLoading) ? 0.4 : 1, cursor: (!accepted || authLoading) ? 'not-allowed' : 'pointer' }} type="submit" disabled={authLoading || !accepted}>
                            {authLoading ? 'Creating account…' : 'Create Account'}
                        </button>
                    </form>
                )}

                <div style={s.divider} />
                <p style={s.portalLink}>
                    Looking for the TISL store?{' '}
                    <Link to="/" style={{ color: '#a855f7', textDecoration: 'none' }}>Back to TISL</Link>
                </p>
            </div>
        </div>
    );
}