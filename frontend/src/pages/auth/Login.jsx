import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, CheckCircle } from 'lucide-react';
import { authAPI } from '../../api';
import { useAuthStore } from '../../store';
import toast from 'react-hot-toast';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';
  const { login } = useAuthStore();
  const resetSuccess = searchParams.get('reset') === 'success';

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [focused, setFocused] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(e => ({ ...e, [name]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!formData.email) e.email = 'Email is required';
    if (!formData.password) e.password = 'Password is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      setLoading(true);
      const response = await authAPI.login(formData);
      login(response.user, response.customer, response.token); // ← add customer
      toast.success('Welcome back!');
      navigate(redirect);
    } catch (error) {
      // ── Force password change intercept ──────────────────────────
      if (
        error.response?.status === 403 &&
        error.response?.data?.force_password_change
      ) {
        navigate('/force-change-password', {
          state: { email: formData.email },
        });
        return;
      }
      // Suspended account 
      if (error.response?.status === 403) {
        toast.error('Your account has been suspended. Please contact support.');
        return;
      }

      // Account locked
      if (error.response?.status === 423) {
        toast.error('Account locked due to too many failed attempts. Try again later or contact support.');
        return;
      }
      // ─────────────────────────────────────────────────────────────
      toast.error(error.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = (provider) => authAPI.oauthRedirect(provider);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="tisl-outer" style={{ width: '100%', maxWidth: 860, display: 'flex', flexDirection: 'column' }}>

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
            <div style={{ color: 'white', fontWeight: 800, fontSize: '0.95rem', letterSpacing: '-0.01em' }}>BlueArc</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.65rem', fontWeight: 500 }}>Industrial Solutions</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            background: 'white', color: '#a855f7',
            borderRadius: 8, padding: '7px 16px',
            fontSize: '0.78rem', fontWeight: 800,
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>Login</div>
          <Link to="/register" style={{
            color: 'rgba(255,255,255,0.9)', borderRadius: 8, padding: '7px 16px',
            fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none',
            border: '1.5px solid rgba(255,255,255,0.35)',
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>Sign Up</Link>
        </div>
      </div>

      <div className="tisl-card" style={{
        display: 'grid', gridTemplateColumns: '1fr 1.4fr',
        width: '100%', minHeight: 540,
        borderRadius: 24, overflow: 'hidden',
        boxShadow: '0 32px 80px rgba(0,0,0,0.14)',
      }}>

        {/* ── LEFT PANEL — decorative ────────────────────────────────────── */}
        <div className="tisl-sidebar" style={{
          position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(145deg, #c084fc 0%, #a855f7 40%, #7c3aed 100%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '40px 32px', gap: 24,
        }}>
          {/* Geometric shapes */}
          <div style={{ position: 'absolute', top: -60, left: -60, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ position: 'absolute', bottom: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ position: 'absolute', top: '40%', left: -30, width: 120, height: 120, borderRadius: 24, background: 'rgba(255,255,255,0.07)', transform: 'rotate(20deg)' }} />
          <div style={{ position: 'absolute', bottom: '25%', right: -20, width: 90, height: 90, borderRadius: 16, background: 'rgba(255,255,255,0.07)', transform: 'rotate(-15deg)' }} />

          {/* Logo mark */}
          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
            <div style={{
              width: 72, height: 72, borderRadius: 20, background: 'rgba(255,255,255,0.18)',
              backdropFilter: 'blur(8px)', border: '1.5px solid rgba(255,255,255,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            }}>
              <span style={{ fontSize: '1.6rem', fontWeight: 900, color: 'white', letterSpacing: '-0.04em' }}>T</span>
            </div>
            <h2 style={{ color: 'white', fontSize: '1.5rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>BlueArc</h2>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', margin: '6px 0 0', fontWeight: 500 }}>
              Industrial Solutions
            </p>
          </div>

          {/* Tab pills */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            <div style={{
              background: 'white', color: '#a855f7',
              borderRadius: 12, padding: '12px 20px',
              fontSize: '0.88rem', fontWeight: 800, textAlign: 'center',
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>
              Login
            </div>
            <Link to="/register" style={{
              color: 'rgba(255,255,255,0.8)', borderRadius: 12, padding: '12px 20px',
              fontSize: '0.88rem', fontWeight: 600, textAlign: 'center', textDecoration: 'none',
              border: '1.5px solid rgba(255,255,255,0.25)', transition: 'all 150ms',
              letterSpacing: '0.04em', textTransform: 'uppercase',
            }}
              onMouseEnter={e => { e.target.style.background = 'rgba(255,255,255,0.12)'; e.target.style.color = 'white'; }}
              onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.color = 'rgba(255,255,255,0.8)'; }}
            >
              Sign Up
            </Link>
          </div>
        </div>

        {/* ── RIGHT PANEL — form ─────────────────────────────────────────── */}
        <div className="tisl-form-panel bg-white dark:bg-gray-800" style={{ padding: '44px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>

          {/* Heading */}
          <div style={{ marginBottom: 28 }}>
            {resetSuccess && (
              <div style={{
                marginBottom: 16, padding: '10px 14px', borderRadius: 10,
                background: '#f0fdf4', border: '1px solid #bbf7d0',
                fontSize: '0.82rem', color: '#15803d', fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <CheckCircle size={15} color="#15803d" />
                Password reset successfully. Sign in with your new password.
              </div>
            )}
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.02em' }} className="text-gray-900 dark:text-white">
              Welcome back
            </h1>
            <p style={{ fontSize: '0.85rem', margin: 0 }} className="text-gray-500 dark:text-gray-400">
              Sign in to your account to continue
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Email */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }} className="text-gray-500 dark:text-gray-400">
                Email
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: focused === 'email' ? '#a855f7' : '#9ca3af', transition: 'color 150ms' }} />
                <input
                  name="email" type="email" value={formData.email}
                  onChange={handleChange}
                  onFocus={() => setFocused('email')} onBlur={() => setFocused('')}
                  placeholder="you@example.com"
                  style={{
                    width: '100%', padding: '11px 14px 11px 40px', borderRadius: 10,
                    border: `1.5px solid ${errors.email ? '#ef4444' : focused === 'email' ? '#a855f7' : '#e5e7eb'}`,
                    fontSize: '0.88rem', outline: 'none', transition: 'border-color 150ms',
                    boxSizing: 'border-box',
                  }}
                  className="bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                />
              </div>
              {errors.email && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: 4 }}>{errors.email}</p>}
            </div>

            {/* Password */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }} className="text-gray-500 dark:text-gray-400">
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: focused === 'password' ? '#a855f7' : '#9ca3af', transition: 'color 150ms' }} />
                <input
                  name="password" type={showPassword ? 'text' : 'password'} value={formData.password}
                  onChange={handleChange}
                  onFocus={() => setFocused('password')} onBlur={() => setFocused('')}
                  placeholder="Enter your password"
                  style={{
                    width: '100%', padding: '11px 44px 11px 40px', borderRadius: 10,
                    border: `1.5px solid ${errors.password ? '#ef4444' : focused === 'password' ? '#a855f7' : '#e5e7eb'}`,
                    fontSize: '0.88rem', outline: 'none', transition: 'border-color 150ms',
                    boxSizing: 'border-box',
                  }}
                  className="bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                />
                <button type="button" onClick={() => setShowPassword(s => !s)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2 }}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: 4 }}>{errors.password}</p>}
            </div>

            {/* Remember + forgot */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.8rem', cursor: 'pointer' }} className="text-gray-600 dark:text-gray-400">
                <input type="checkbox" style={{ accentColor: '#a855f7', width: 14, height: 14 }} />
                Remember me
              </label>
              
              <Link to="/forgot-password" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#a855f7', textDecoration: 'none' }}>
                Forgot password?
              </Link>
            </div>

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
              {loading ? 'Signing in…' : <><span>Sign In</span> <ArrowRight size={16} /></>}
            </button>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
              <div style={{ flex: 1, height: 1 }} className="bg-gray-200 dark:bg-gray-600" />
              <span style={{ fontSize: '0.75rem', fontWeight: 600 }} className="text-gray-400">Or login with</span>
              <div style={{ flex: 1, height: 1 }} className="bg-gray-200 dark:bg-gray-600" />
            </div>

            {/* OAuth */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {/* Google — active */}
              <button type="button" onClick={() => handleOAuth('google')}
                style={{
                  height: 42, borderRadius: 10, border: '1.5px solid #e5e7eb',
                  background: 'transparent', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 150ms',
                }}
                className="text-gray-700 dark:text-gray-300 dark:border-gray-600 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-gray-700"
              >
                <GoogleIcon /> Google
              </button>

              {/* Microsoft — disabled / coming soon */}
              <button type="button" disabled title="Microsoft login coming soon"
                style={{
                  height: 42, borderRadius: 10, border: '1.5px solid #e5e7eb',
                  background: '#f9fafb', cursor: 'not-allowed', fontSize: '0.82rem', fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: 0.5, position: 'relative',
                }}
                className="text-gray-400 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-500"
              >
                <MicrosoftIcon /> Microsoft
                <span style={{ position: 'absolute', top: -8, right: 6, fontSize: '0.55rem', fontWeight: 800, background: '#e5e7eb', color: '#9ca3af', padding: '1px 5px', borderRadius: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Soon
                </span>
              </button>
            </div>
          </form>

          {/* Sign up link */}
          <p style={{ textAlign: 'center', fontSize: '0.82rem', marginTop: 20 }} className="text-gray-500 dark:text-gray-400">
            Don't have an account?{' '}
            <Link to="/register" style={{ color: '#a855f7', fontWeight: 700, textDecoration: 'none' }}>
              Sign up free
            </Link>
          </p>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .tisl-mobile-bar { display: flex !important; }
          .tisl-card {
            grid-template-columns: 1fr !important;
            border-radius: 0 0 24px 24px !important;
            min-height: unset !important;
            box-shadow: 0 8px 32px rgba(0,0,0,0.10) !important;
          }
          .tisl-sidebar { display: none !important; }
          .tisl-outer { padding: 0 !important; }
          .tisl-form-panel {
            padding: 24px 20px !important;
          }
        }
        @media (max-width: 480px) {
          .tisl-mobile-bar {
            padding: 16px 16px !important;
          }
          .tisl-form-panel {
            padding: 20px 16px !important;
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
    <svg width="16" height="16" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21">
      <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
      <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
    </svg>
  );
}
