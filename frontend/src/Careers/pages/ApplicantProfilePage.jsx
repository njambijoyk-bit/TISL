import { useState } from 'react';
import { Linkedin, Globe, Phone, MapPin, Briefcase, Clock, Save, CheckCircle, KeyRound, Eye, EyeOff } from 'lucide-react';
import useCareersStore from '../../store/useCareersStore';

const FIELD = {
    input: (style = {}) => ({
        width: '100%', padding: '10px 13px',
        background: '#161616', border: '1px solid #222',
        borderRadius: 8, color: '#f0f0f0', fontSize: 14,
        outline: 'none', boxSizing: 'border-box',
        fontFamily: "'DM Sans', sans-serif",
        transition: 'border-color 0.15s',
        ...style,
    }),
};

export default function ApplicantProfilePage() {
    const { applicant, updateProfile, changePasswordSelf } = useCareersStore();

    const [form, setForm] = useState({
        first_name:          applicant?.first_name          ?? '',
        last_name:           applicant?.last_name           ?? '',
        phone:               applicant?.phone               ?? '',
        linkedin_url:        applicant?.linkedin_url        ?? '',
        portfolio_url:       applicant?.portfolio_url       ?? '',
        current_role:        applicant?.current_role        ?? '',
        years_of_experience: applicant?.years_of_experience ?? '',
        location:            applicant?.location            ?? '',
    });

    const [saving,  setSaving]  = useState(false);
    const [saved,   setSaved]   = useState(false);
    const [errors,  setErrors]  = useState({});

    const set = (key, val) => {
        setForm(f => ({ ...f, [key]: val }));
        setErrors(e => { const n = { ...e }; delete n[key]; return n; });
        setSaved(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setErrors({});
        try {
            await updateProfile({
                ...form,
                years_of_experience: form.years_of_experience === '' ? null : Number(form.years_of_experience),
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            if (err?.errors) setErrors(err.errors);
        } finally {
            setSaving(false);
        }
    };

    const err = (key) => errors[key]?.[0];

    // ── Password change ───────────────────────────────────────────────────────
    const [pwForm, setPwForm]   = useState({ current_password: '', password: '', password_confirmation: '' });
    const [pwSaving, setPwSaving] = useState(false);
    const [pwSaved,  setPwSaved]  = useState(false);
    const [pwErrors, setPwErrors] = useState({});
    const [pwGlobalError, setPwGlobalError] = useState(null);
    const [showPw, setShowPw]   = useState({ current: false, next: false, confirm: false });

    const patchPw = (key) => (e) => {
        setPwForm(f => ({ ...f, [key]: e.target.value }));
        setPwErrors(er => { const n = { ...er }; delete n[key]; return n; });
        setPwGlobalError(null);
        setPwSaved(false);
    };

    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        setPwSaving(true);
        setPwErrors({});
        setPwGlobalError(null);
        try {
            await changePasswordSelf(pwForm);
            setPwSaved(true);
            setPwForm({ current_password: '', password: '', password_confirmation: '' });
            setTimeout(() => setPwSaved(false), 3000);
        } catch (err) {
            if (err?.errors) setPwErrors(err.errors);
            else setPwGlobalError(err?.message ?? 'Something went wrong. Please try again.');
        } finally {
            setPwSaving(false);
        }
    };

    const pwErr = (key) => pwErrors[key]?.[0];

    return (
        <div style={{ minHeight: '100vh', background: '#0f0f0f' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 32px 80px', fontFamily: "'DM Sans', sans-serif" }}>

            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
                <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, fontWeight: 700, color: '#fff', flexShrink: 0,
                }}>
                    {applicant?.first_name?.[0]?.toUpperCase()}
                </div>
                <div>
                    <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f0f0f0' }}>My Profile</h1>
                    <p style={{ margin: '2px 0 0', fontSize: 13, color: '#555' }}>{applicant?.email}</p>
                </div>
            </div>

            <form onSubmit={handleSubmit}>

                {/* ── Name row ── */}
                <Section label="Name">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Field label="First name" error={err('first_name')}>
                            <input style={FIELD.input()} value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="First name" />
                        </Field>
                        <Field label="Last name" error={err('last_name')}>
                            <input style={FIELD.input()} value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Last name" />
                        </Field>
                    </div>
                </Section>

                {/* ── Professional ── */}
                <Section label="Professional Info">
                    <Field label="Current role" error={err('current_role')} icon={<Briefcase size={14} />}>
                        <input style={FIELD.input()} value={form.current_role} onChange={e => set('current_role', e.target.value)} placeholder="e.g. Software Engineer at Acme" />
                    </Field>
                    <Field label="Years of experience" error={err('years_of_experience')} icon={<Clock size={14} />}>
                        <input style={FIELD.input()} type="number" min={0} max={60} value={form.years_of_experience} onChange={e => set('years_of_experience', e.target.value)} placeholder="0" />
                    </Field>
                    <Field label="Location" error={err('location')} icon={<MapPin size={14} />}>
                        <input style={FIELD.input()} value={form.location} onChange={e => set('location', e.target.value)} placeholder="City, Country" />
                    </Field>
                </Section>

                {/* ── Contact ── */}
                <Section label="Contact & Links">
                    <Field label="Phone" error={err('phone')} icon={<Phone size={14} />}>
                        <input style={FIELD.input()} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+254 7xx xxx xxx" />
                    </Field>
                    <Field label="LinkedIn URL" error={err('linkedin_url')} icon={<Linkedin size={14} />}>
                        <input style={FIELD.input()} value={form.linkedin_url} onChange={e => set('linkedin_url', e.target.value)} placeholder="https://linkedin.com/in/…" />
                    </Field>
                    <Field label="Portfolio / Website" error={err('portfolio_url')} icon={<Globe size={14} />}>
                        <input style={FIELD.input()} value={form.portfolio_url} onChange={e => set('portfolio_url', e.target.value)} placeholder="https://…" />
                    </Field>
                </Section>

                {/* ── Submit ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <button
                        type="submit"
                        disabled={saving}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 7,
                            padding: '10px 22px', borderRadius: 8,
                            background: saved ? '#10b981' : '#a855f7',
                            border: 'none', color: '#fff', fontSize: 14, fontWeight: 600,
                            cursor: saving ? 'default' : 'pointer',
                            opacity: saving ? 0.7 : 1,
                            transition: 'background 0.3s',
                            fontFamily: "'DM Sans', sans-serif",
                        }}
                    >
                        {saved
                            ? <><CheckCircle size={15} /> Saved</>
                            : saving
                                ? 'Saving…'
                                : <><Save size={15} /> Save changes</>
                        }
                    </button>
                    {Object.keys(errors).length > 0 && (
                        <p style={{ margin: 0, fontSize: 12, color: '#ef4444' }}>Please fix the errors above.</p>
                    )}
                </div>
            </form>

            {/* ── Security ── */}
            <div style={{ marginTop: 40, paddingTop: 32, borderTop: '1px solid #1e1e1e' }}>
                <p style={{ margin: '0 0 20px', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#555', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <KeyRound size={12} /> Security
                </p>

                {pwGlobalError && (
                    <div style={{ background: '#2d1111', border: '1px solid #5a1d1d', borderRadius: 8, padding: '10px 14px', color: '#f87171', fontSize: 13, marginBottom: 16 }}>
                        {pwGlobalError}
                    </div>
                )}

                <form onSubmit={handlePasswordSubmit}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                        <PwField
                            label="Current password"
                            value={pwForm.current_password}
                            onChange={patchPw('current_password')}
                            show={showPw.current}
                            onToggle={() => setShowPw(s => ({ ...s, current: !s.current }))}
                            error={pwErr('current_password')}
                            placeholder="Your current password"
                        />
                        <PwField
                            label="New password"
                            value={pwForm.password}
                            onChange={patchPw('password')}
                            show={showPw.next}
                            onToggle={() => setShowPw(s => ({ ...s, next: !s.next }))}
                            error={pwErr('password')}
                            placeholder="Min. 8 characters"
                        />
                        <PwField
                            label="Confirm new password"
                            value={pwForm.password_confirmation}
                            onChange={patchPw('password_confirmation')}
                            show={showPw.confirm}
                            onToggle={() => setShowPw(s => ({ ...s, confirm: !s.confirm }))}
                            error={pwErr('password_confirmation')}
                            placeholder="Repeat new password"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={pwSaving}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 7,
                            padding: '10px 22px', borderRadius: 8,
                            background: pwSaved ? '#10b981' : '#1e1e1e',
                            border: `1px solid ${pwSaved ? '#10b981' : '#2a2a2a'}`,
                            color: pwSaved ? '#fff' : '#ccc',
                            fontSize: 14, fontWeight: 600,
                            cursor: pwSaving ? 'default' : 'pointer',
                            opacity: pwSaving ? 0.7 : 1,
                            transition: 'all 0.3s',
                            fontFamily: "'DM Sans', sans-serif",
                        }}
                    >
                        {pwSaved
                            ? <><CheckCircle size={15} /> Password updated</>
                            : pwSaving ? 'Saving…'
                            : <><KeyRound size={15} /> Update password</>
                        }
                    </button>
                </form>
            </div>
        </div>
        </div>
    );
}

function Section({ label, children }) {
    return (
        <div style={{ marginBottom: 28 }}>
            <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#555' }}>
                {label}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {children}
            </div>
        </div>
    );
}

function PwField({ label, value, onChange, show, onToggle, error, placeholder }) {
    return (
        <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#666', marginBottom: 5 }}>
                {label}
            </label>
            <div style={{ position: 'relative' }}>
                <input
                    type={show ? 'text' : 'password'}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    required
                    style={{
                        width: '100%', padding: '10px 40px 10px 13px',
                        background: '#161616', border: `1px solid ${error ? '#5a1d1d' : '#222'}`,
                        borderRadius: 8, color: '#f0f0f0', fontSize: 14,
                        outline: 'none', boxSizing: 'border-box',
                        fontFamily: "'DM Sans', sans-serif",
                        transition: 'border-color 0.15s',
                    }}
                    onFocus={e => e.target.style.borderColor = '#a855f7'}
                    onBlur={e => e.target.style.borderColor = error ? '#5a1d1d' : '#222'}
                />
                <button
                    type="button"
                    onClick={onToggle}
                    style={{
                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: 2,
                    }}
                >
                    {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
            </div>
            {error && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#ef4444' }}>{error}</p>}
        </div>
    );
}

function Field({ label, error, icon, children }) {
    return (
        <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#666', marginBottom: 5 }}>
                {icon && <span style={{ color: '#555' }}>{icon}</span>}
                {label}
            </label>
            {children}
            {error && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#ef4444' }}>{error}</p>}
        </div>
    );
}