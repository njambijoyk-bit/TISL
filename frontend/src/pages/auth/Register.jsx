import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Mail, Phone, Lock, Eye, EyeOff, Building, ArrowRight } from 'lucide-react';
import { authAPI } from '../../api';
import { useAuthStore } from '../../store';
import toast from 'react-hot-toast';

// ── Reusable field renderer (must be OUTSIDE Register to preserve focus) ──
function Field({ name, label, type = 'text', placeholder, icon: Icon, onChange, rightEl, error: fieldError, value, focused, setFocused, handleChange }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }} className="text-gray-500 dark:text-gray-400">
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        {Icon && <Icon size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: focused === name ? '#a855f7' : '#9ca3af', transition: 'color 150ms', flexShrink: 0 }} />}
        <input
          name={name} type={type}
          value={value}
          onChange={onChange || handleChange}
          onFocus={() => setFocused(name)} onBlur={() => setFocused('')}
          placeholder={placeholder}
          style={{
            width: '100%', padding: `10px ${rightEl ? '44px' : '13px'} 10px ${Icon ? '36px' : '13px'}`,
            borderRadius: 10, fontSize: '0.85rem', outline: 'none', transition: 'border-color 150ms',
            border: `1.5px solid ${fieldError ? '#ef4444' : focused === name ? '#a855f7' : '#e5e7eb'}`,
            boxSizing: 'border-box',
          }}
          className="bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
        />
        {rightEl}
      </div>
      {fieldError && <p style={{ color: '#ef4444', fontSize: '0.72rem', marginTop: 3 }}>{fieldError}</p>}
    </div>
  );
}

function EyeBtn({ show, toggle }) {
  return (
    <button type="button" onClick={toggle}
      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2 }}>
      {show ? <EyeOff size={15} /> : <Eye size={15} />}
    </button>
  );
}

export default function Register() {
  const navigate = useNavigate();
  const { login } = useAuthStore();

  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', company_name: '',
    password: '', password_confirmation: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [focused, setFocused] = useState('');

  const refCode = new URLSearchParams(window.location.search).get('ref');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(e => ({ ...e, [name]: '' }));
  };

  const handlePhoneChange = (e) => {
    let value = e.target.value.replace(/[^0-9+\-\s\(\)]/g, '').substring(0, 20);
    setFormData(f => ({ ...f, phone: value }));
    if (errors.phone) setErrors(e => ({ ...e, phone: '' }));
  };

  const validate = () => {
    const e = {};
    if (!formData.name) e.name = 'Name is required';
    if (!formData.email) e.email = 'Email is required';
    if (!formData.phone) {
      e.phone = 'Phone is required';
    } else if (formData.phone.replace(/\D/g, '').length < 10) {
      e.phone = 'Phone must be at least 10 digits';
    }
    if (!formData.password) e.password = 'Password is required';
    else if (formData.password.length < 8) e.password = 'At least 8 characters';
    if (formData.password !== formData.password_confirmation) e.password_confirmation = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      setLoading(true);
      const response = await authAPI.register({
        ...formData,
        ...(refCode ? { referral_code: refCode } : {}),
      });
      login(response.user, response.token);
      toast.success('Account created successfully!');
      navigate('/');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Registration failed');
      if (error.response?.data?.errors) setErrors(error.response.data.errors);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = (provider) => authAPI.oauthRedirect(provider);

  const fieldProps = { focused, setFocused, handleChange };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="tisl-outer" style={{ width: '100%', maxWidth: 900, display: 'flex', flexDirection: 'column' }}>

      {/* ── MOBILE TOP BAR (hidden on desktop) ────────────────────────── */}
      <div className="tisl-mobile-bar" style={{
        display: 'none',
        background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
        padding: '20px 24px',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(255,255,255,0.2)', border: '1.5px solid rgba(255,255,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: '1rem', fontWeight: 900, color: 'white' }}>T</span>
          </div>
          <div>
            <div style={{ color: 'white', fontWeight: 800, fontSize: '0.95rem', letterSpacing: '-0.01em' }}>Target</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.65rem', fontWeight: 500 }}>Industrial Suppliers LTD</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/login" style={{
            color: 'rgba(255,255,255,0.9)', borderRadius: 8, padding: '7px 16px',
            fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none',
            border: '1.5px solid rgba(255,255,255,0.35)',
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>Login</Link>
          <div style={{
            background: 'white', color: '#a855f7',
            borderRadius: 8, padding: '7px 16px',
            fontSize: '0.78rem', fontWeight: 800,
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>Sign Up</div>
        </div>
      </div>

      <div className="tisl-card" style={{
        display: 'grid', gridTemplateColumns: '1fr 1.5fr',
        width: '100%',
        borderRadius: 24, overflow: 'hidden',
        boxShadow: '0 32px 80px rgba(0,0,0,0.14)',
      }}>

        {/* ── LEFT PANEL ────────────────────────────────────────────────── */}
        <div className="tisl-sidebar" style={{
          position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(145deg, #c084fc 0%, #a855f7 40%, #7c3aed 100%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '40px 28px', gap: 24,
        }}>
          {/* Shapes */}
          <div style={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
          <div style={{ position: 'absolute', bottom: -60, left: -40, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ position: 'absolute', top: '35%', right: -25, width: 100, height: 100, borderRadius: 20, background: 'rgba(255,255,255,0.07)', transform: 'rotate(25deg)' }} />
          <div style={{ position: 'absolute', bottom: '30%', left: -15, width: 80, height: 80, borderRadius: 14, background: 'rgba(255,255,255,0.08)', transform: 'rotate(-20deg)' }} />

          {/* Logo */}
          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
            <div style={{
              width: 72, height: 72, borderRadius: 20,
              background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)',
              border: '1.5px solid rgba(255,255,255,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            }}>
              <span style={{ fontSize: '1.6rem', fontWeight: 900, color: 'white', letterSpacing: '-0.04em' }}>T</span>
            </div>
            <h2 style={{ color: 'white', fontSize: '1.5rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Target</h2>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.78rem', margin: '6px 0 0', fontWeight: 500 }}>
              Industrial Suppliers LTD
            </p>
          </div>

          {/* Tab pills */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            <Link to="/login" style={{
              color: 'rgba(255,255,255,0.8)', borderRadius: 12, padding: '12px 20px',
              fontSize: '0.85rem', fontWeight: 600, textAlign: 'center', textDecoration: 'none',
              border: '1.5px solid rgba(255,255,255,0.25)', transition: 'all 150ms',
              letterSpacing: '0.04em', textTransform: 'uppercase',
            }}
              onMouseEnter={e => { e.target.style.background = 'rgba(255,255,255,0.12)'; e.target.style.color = 'white'; }}
              onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.color = 'rgba(255,255,255,0.8)'; }}
            >
              Login
            </Link>
            <div style={{
              background: 'white', color: '#a855f7',
              borderRadius: 12, padding: '12px 20px',
              fontSize: '0.85rem', fontWeight: 800, textAlign: 'center',
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>
              Sign Up
            </div>
          </div>

          {/* Perks */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['Track orders & quotes', 'Manage projects', 'Exclusive deals'].map((perk, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.6rem', color: 'white', fontWeight: 800 }}>✓</span>
                </div>
                <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{perk}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT PANEL ────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-800" style={{ padding: '36px 36px' }}>
          <div style={{ marginBottom: 22 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.02em' }} className="text-gray-900 dark:text-white">
              Create your account
            </h1>
            <p style={{ fontSize: '0.82rem', margin: 0 }} className="text-gray-500 dark:text-gray-400">
              Join TISL for easy industrial shopping
            </p>
          </div>

          {refCode && (
            <div style={{
              marginBottom: 16, padding: '10px 14px', borderRadius: 10,
              background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.25)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: '1rem' }}>🎁</span>
              <div>
                <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#7c3aed', margin: 0 }}>
                  You were referred!
                </p>
                <p style={{ fontSize: '0.72rem', color: '#a855f7', margin: 0 }}>
                  Code <strong>{refCode}</strong> — get 5% off your first order after signing up.
                </p>
              </div>
            </div>
          )}

          {/* OAuth */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
            {/* Google — active */}
            <button type="button" onClick={() => handleOAuth('google')}
              style={{
                height: 40, borderRadius: 10, border: '1.5px solid #e5e7eb',
                background: 'transparent', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, transition: 'all 150ms',
              }}
              className="text-gray-700 dark:text-gray-300 dark:border-gray-600 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-gray-700">
              <GoogleIcon /> Google
            </button>

            {/* Microsoft — disabled / coming soon */}
            <button type="button" disabled title="Microsoft login coming soon"
              style={{
                height: 40, borderRadius: 10, border: '1.5px solid #e5e7eb',
                background: '#f9fafb', cursor: 'not-allowed', fontSize: '0.8rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                opacity: 0.5, position: 'relative',
              }}
              className="text-gray-400 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-500">
              <MicrosoftIcon /> Microsoft
              <span style={{ position: 'absolute', top: -8, right: 6, fontSize: '0.55rem', fontWeight: 800, background: '#e5e7eb', color: '#9ca3af', padding: '1px 5px', borderRadius: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Soon
              </span>
            </button>
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{ flex: 1, height: 1 }} className="bg-gray-200 dark:bg-gray-600" />
            <span style={{ fontSize: '0.72rem', fontWeight: 600 }} className="text-gray-400">Or register with email</span>
            <div style={{ flex: 1, height: 1 }} className="bg-gray-200 dark:bg-gray-600" />
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Name + Email row */}
            <div className="tisl-field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field name="name" label="Full Name" placeholder="John Doe" icon={User} error={errors.name} value={formData.name} {...fieldProps} />
              <Field name="email" label="Email" type="email" placeholder="you@example.com" icon={Mail} error={errors.email} value={formData.email} {...fieldProps} />
            </div>

            {/* Phone + Company row */}
            <div className="tisl-field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field name="phone" label="Phone" type="tel" placeholder="+254712345678" icon={Phone} onChange={handlePhoneChange} error={errors.phone} value={formData.phone} {...fieldProps} />
              <Field name="company_name" label="Company (Optional)" placeholder="Your Company" icon={Building} error={errors.company_name} value={formData.company_name} {...fieldProps} />
            </div>

            {/* Password */}
            <Field
              name="password" label="Password" type={showPassword ? 'text' : 'password'}
              placeholder="At least 8 characters" icon={Lock} error={errors.password}
              rightEl={<EyeBtn show={showPassword} toggle={() => setShowPassword(s => !s)} />}
              value={formData.password} {...fieldProps}
            />

            {/* Confirm */}
            <Field
              name="password_confirmation" label="Confirm Password" type={showConfirm ? 'text' : 'password'}
              placeholder="Confirm your password" icon={Lock} error={errors.password_confirmation}
              rightEl={<EyeBtn show={showConfirm} toggle={() => setShowConfirm(s => !s)} />}
              value={formData.password_confirmation} {...fieldProps}
            />

            {/* Terms */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: '0.78rem' }} className="text-gray-600 dark:text-gray-400">
              <input type="checkbox" required style={{ accentColor: '#a855f7', marginTop: 2, flexShrink: 0 }} />
              <span>
                I agree to the{' '}
                <Link to="/terms" style={{ color: '#a855f7', textDecoration: 'none', fontWeight: 600 }}>Terms</Link>
                {' '}and{' '}
                <Link to="/privacy" style={{ color: '#a855f7', textDecoration: 'none', fontWeight: 600 }}>Privacy Policy</Link>
              </span>
            </label>

            {/* Submit */}
            <button
              type="submit" disabled={loading}
              style={{
                height: 46, borderRadius: 12, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                background: loading ? '#e5e7eb' : 'linear-gradient(135deg, #a855f7, #7c3aed)',
                color: loading ? '#9ca3af' : 'white', fontSize: '0.88rem', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: loading ? 'none' : '0 4px 14px rgba(168,85,247,0.35)',
                transition: 'all 200ms', letterSpacing: '0.04em',
              }}
            >
              {loading ? 'Creating account…' : <><span>Create Account</span><ArrowRight size={16} /></>}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: '0.8rem', marginTop: 16 }} className="text-gray-500 dark:text-gray-400">
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#a855f7', fontWeight: 700, textDecoration: 'none' }}>Sign in</Link>
          </p>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .tisl-mobile-bar { display: flex !important; }
          .tisl-card {
            grid-template-columns: 1fr !important;
            border-radius: 0 0 24px 24px !important;
            box-shadow: 0 8px 32px rgba(0,0,0,0.10) !important;
          }
          .tisl-sidebar { display: none !important; }
          .tisl-outer { padding: 0 !important; }
          .tisl-field-row {
            grid-template-columns: 1fr !important;
          }
        }
        @media (min-width: 641px) {
          .tisl-mobile-bar { display: none !important; }
        }
      `}</style>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
      <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
    </svg>
  );
}