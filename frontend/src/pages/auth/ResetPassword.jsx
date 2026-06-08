import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Lock, Eye, EyeOff, ArrowRight, ArrowLeft } from 'lucide-react';
import authAPI from '../../api/auth';
import toast from 'react-hot-toast';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const [form, setForm] = useState({ password: '', password_confirmation: '' });
  const [show, setShow] = useState({ password: false, confirm: false });
  const [focused, setFocused] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setErrors(ev => ({ ...ev, [e.target.name]: '' }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});
    setError('');
    try {
      await authAPI.resetPassword({
        token,
        email,
        password: form.password,
        password_confirmation: form.password_confirmation,
      });
      toast.success('Password reset successfully!');
      navigate('/login?reset=success');
    } catch (err) {
      if (err.response?.status === 422) {
        setErrors(err.response.data.errors || {});
      } else {
        setError(err.response?.data?.message || 'Something went wrong.');
        toast.error(err.response?.data?.message || 'Reset failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Broken link guard
  if (!token || !email) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div style={{
          background: 'white', borderRadius: 20, padding: '40px 36px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.10)', textAlign: 'center', maxWidth: 400,
        }} className="dark:bg-gray-800">
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: '#fee2e2',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <Lock size={22} color="#ef4444" />
          </div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 8px' }} className="text-gray-900 dark:text-white">
            Invalid reset link
          </h2>
          <p style={{ fontSize: '0.85rem', margin: '0 0 24px' }} className="text-gray-500 dark:text-gray-400">
            This link is missing required information or has expired.
          </p>
          <Link to="/forgot-password" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
            color: 'white', padding: '10px 20px', borderRadius: 10,
            fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none',
          }}>
            Request a new link <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="tisl-outer" style={{ width: '100%', maxWidth: 860, display: 'flex', flexDirection: 'column' }}>

        {/* Mobile top bar */}
        <div className="tisl-mobile-bar" style={{
          display: 'none',
          background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
          padding: '20px 24px', alignItems: 'center', justifyContent: 'space-between',
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
              <div style={{ color: 'white', fontWeight: 800, fontSize: '0.95rem' }}>TISL</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.65rem', fontWeight: 500 }}>Industrial Solutions</div>
            </div>
          </div>
        </div>

        <div className="tisl-card" style={{
          display: 'grid', gridTemplateColumns: '1fr 1.4fr',
          width: '100%', minHeight: 500,
          borderRadius: 24, overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.14)',
        }}>

          {/* Left panel */}
          <div className="tisl-sidebar" style={{
            position: 'relative', overflow: 'hidden',
            background: 'linear-gradient(145deg, #c084fc 0%, #a855f7 40%, #7c3aed 100%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '40px 32px', gap: 24,
          }}>
            <div style={{ position: 'absolute', top: -60, left: -60, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ position: 'absolute', bottom: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ position: 'absolute', top: '40%', left: -30, width: 120, height: 120, borderRadius: 24, background: 'rgba(255,255,255,0.07)', transform: 'rotate(20deg)' }} />

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
              <h2 style={{ color: 'white', fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>TISL</h2>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', margin: '6px 0 0', fontWeight: 500 }}>
                Industrial Solutions
              </p>
            </div>

            <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>
              <div style={{
                background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.2)',
                borderRadius: 12, padding: '16px 20px',
              }}>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.72rem', fontWeight: 600, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Resetting for
                </p>
                <p style={{ color: 'white', fontSize: '0.88rem', fontWeight: 700, margin: 0, wordBreak: 'break-all' }}>
                  {email}
                </p>
              </div>
              <Link to="/login" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                marginTop: 12, color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem',
                fontWeight: 600, textDecoration: 'none',
              }}
                onMouseEnter={e => e.currentTarget.style.color = 'white'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
              >
                <ArrowLeft size={14} /> Back to login
              </Link>
            </div>
          </div>

          {/* Right panel */}
          <div className="bg-white dark:bg-gray-800" style={{
            padding: '44px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center',
          }}>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.02em' }} className="text-gray-900 dark:text-white">
                Set new password
              </h1>
              <p style={{ fontSize: '0.85rem', margin: 0 }} className="text-gray-500 dark:text-gray-400">
                Must be at least 8 characters.
              </p>
            </div>

            {error && (
              <div style={{
                marginBottom: 16, padding: '10px 14px', borderRadius: 10,
                background: '#fef2f2', border: '1px solid #fecaca',
                fontSize: '0.82rem', color: '#dc2626', fontWeight: 500,
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* New password */}
              <div>
                <label style={{
                  display: 'block', fontSize: '0.75rem', fontWeight: 700,
                  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em',
                }} className="text-gray-500 dark:text-gray-400">
                  New password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} style={{
                    position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                    color: focused === 'password' ? '#a855f7' : '#9ca3af', transition: 'color 150ms',
                  }} />
                  <input
                    name="password" type={show.password ? 'text' : 'password'}
                    value={form.password} onChange={handleChange}
                    onFocus={() => setFocused('password')} onBlur={() => setFocused('')}
                    placeholder="At least 8 characters"
                    style={{
                      width: '100%', padding: '11px 44px 11px 40px', borderRadius: 10,
                      border: `1.5px solid ${errors.password ? '#ef4444' : focused === 'password' ? '#a855f7' : '#e5e7eb'}`,
                      fontSize: '0.88rem', outline: 'none', transition: 'border-color 150ms', boxSizing: 'border-box',
                    }}
                    className="bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                  />
                  <button type="button" onClick={() => setShow(s => ({ ...s, password: !s.password }))}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2 }}>
                    {show.password ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: 4 }}>{errors.password[0]}</p>}
              </div>

              {/* Confirm password */}
              <div>
                <label style={{
                  display: 'block', fontSize: '0.75rem', fontWeight: 700,
                  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em',
                }} className="text-gray-500 dark:text-gray-400">
                  Confirm password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} style={{
                    position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                    color: focused === 'confirm' ? '#a855f7' : '#9ca3af', transition: 'color 150ms',
                  }} />
                  <input
                    name="password_confirmation" type={show.confirm ? 'text' : 'password'}
                    value={form.password_confirmation} onChange={handleChange}
                    onFocus={() => setFocused('confirm')} onBlur={() => setFocused('')}
                    placeholder="Repeat your new password"
                    style={{
                      width: '100%', padding: '11px 44px 11px 40px', borderRadius: 10,
                      border: `1.5px solid ${errors.password_confirmation ? '#ef4444' : focused === 'confirm' ? '#a855f7' : '#e5e7eb'}`,
                      fontSize: '0.88rem', outline: 'none', transition: 'border-color 150ms', boxSizing: 'border-box',
                    }}
                    className="bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                  />
                  <button type="button" onClick={() => setShow(s => ({ ...s, confirm: !s.confirm }))}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2 }}>
                    {show.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password_confirmation && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: 4 }}>{errors.password_confirmation[0]}</p>}
              </div>

              <button
                type="submit" disabled={loading}
                style={{
                  height: 46, borderRadius: 12, border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  background: loading ? '#e5e7eb' : 'linear-gradient(135deg, #a855f7, #7c3aed)',
                  color: loading ? '#9ca3af' : 'white',
                  fontSize: '0.88rem', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: loading ? 'none' : '0 4px 14px rgba(168,85,247,0.35)',
                  transition: 'all 200ms', letterSpacing: '0.04em', marginTop: 4,
                }}
              >
                {loading ? 'Resetting…' : <><span>Reset password</span><ArrowRight size={16} /></>}
              </button>
            </form>
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
          }
          @media (min-width: 641px) {
            .tisl-mobile-bar { display: none !important; }
          }
        `}</style>
      </div>
    </div>
  );
}