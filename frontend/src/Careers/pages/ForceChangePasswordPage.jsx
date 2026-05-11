// careers/pages/ForceChangePasswordPage.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import useCareersStore from '../../store/useCareersStore';

const s = {
    page: { minHeight: '100vh', background: '#0f0f0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'DM Sans', sans-serif" },
    card: { background: '#161616', border: '1px solid #2a1a00', borderRadius: 16, padding: '48px 40px', width: '100%', maxWidth: 440 },
    banner: { display: 'flex', alignItems: 'flex-start', gap: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '14px 16px', marginBottom: 32 },
    bannerText: { fontSize: 13, color: '#d97706', lineHeight: 1.6 },
    title: { fontSize: 24, fontWeight: 700, color: '#f0f0f0', marginBottom: 6, fontFamily: "'DM Serif Display', serif" },
    sub: { fontSize: 14, color: '#555', marginBottom: 32 },
    field: { marginBottom: 18 },
    label: { display: 'block', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#555', marginBottom: 7, fontWeight: 600 },
    input: { width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #222', background: '#0f0f0f', color: '#f0f0f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color 0.15s' },
    btn: { width: '100%', padding: '13px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 8, transition: 'opacity 0.2s', fontFamily: 'inherit' },
    errField: { fontSize: 12, color: '#f87171', marginTop: 5 },
    errBox: { background: '#2d1111', border: '1px solid #5a1d1d', borderRadius: 8, padding: '12px 14px', color: '#f87171', fontSize: 13, marginBottom: 20 },
};

export default function ForceChangePasswordPage() {
    const navigate = useNavigate();
    const { changePassword, logout } = useCareersStore();

    const [form, setForm]       = useState({ password: '', password_confirmation: '' });
    const [loading, setLoading] = useState(false);
    const [errors, setErrors]   = useState({});
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
            await changePassword(form);
            navigate('/careers/portal', { replace: true });
        } catch (err) {
            if (err?.errors) setErrors(err.errors);
            else setGlobalError(err?.message ?? 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await logout();
        navigate('/careers/login', { replace: true });
    };

    return (
        <div style={s.page}>
            <div style={s.card}>

                <div style={s.banner}>
                    <ShieldAlert size={18} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
                    <p style={{ ...s.bannerText, margin: 0 }}>
                        An administrator has reset your password. You must set a new password before continuing.
                    </p>
                </div>

                <h1 style={s.title}>Set a new password</h1>
                <p style={s.sub}>Choose something secure — you won't be asked again unless another reset is triggered.</p>

                {globalError && <div style={s.errBox}>{globalError}</div>}

                <form onSubmit={handleSubmit}>
                    <div style={s.field}>
                        <label style={s.label}>New password</label>
                        <input
                            style={s.input} type="password"
                            value={form.password} onChange={patch('password')}
                            placeholder="Min. 8 characters" required autoFocus
                            onFocus={e => e.target.style.borderColor = '#a855f7'}
                            onBlur={e => e.target.style.borderColor = '#222'}
                        />
                        {errors.password && <p style={s.errField}>{errors.password[0]}</p>}
                    </div>
                    <div style={s.field}>
                        <label style={s.label}>Confirm password</label>
                        <input
                            style={s.input} type="password"
                            value={form.password_confirmation} onChange={patch('password_confirmation')}
                            placeholder="Repeat your new password" required
                            onFocus={e => e.target.style.borderColor = '#a855f7'}
                            onBlur={e => e.target.style.borderColor = '#222'}
                        />
                        {errors.password_confirmation && <p style={s.errField}>{errors.password_confirmation[0]}</p>}
                    </div>
                    <button style={s.btn} type="submit" disabled={loading}>
                        {loading ? 'Saving…' : 'Set new password'}
                    </button>
                </form>

                <button
                    onClick={handleLogout}
                    style={{ display: 'block', margin: '20px auto 0', background: 'none', border: 'none', color: '#444', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                    Sign out instead
                </button>
            </div>
        </div>
    );
}