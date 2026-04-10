import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, Eye, EyeOff, ArrowRight, ShieldAlert } from 'lucide-react';
import authAPI from '../../api/auth';
import { useAuthStore } from '../../store';
import toast from 'react-hot-toast';

export default function ForceChangePassword() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { login } = useAuthStore();

  // email is passed via navigate state from Login.jsx
  const email = location.state?.email ?? '';

  const [form, setForm]     = useState({ current_password: '', new_password: '', new_password_confirmation: '' });
  const [show, setShow]     = useState({ current: false, next: false, confirm: false });
  const [focused, setFocused] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors]   = useState({});
  const [error, setError]     = useState('');

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
      const response = await authAPI.forceChangePassword({
        email,
        current_password: form.current_password,
        new_password: form.new_password,
        new_password_confirmation: form.new_password_confirmation,
      });
      // Backend logs the user in and returns a token
      login(response.user, response.customer, response.token);
      toast.success('Password updated. Welcome!');
      navigate('/');
    } catch (err) {
      if (err.response?.status === 422) {
        setErrors(err.response.data.errors || {});
      } else {
        setError(err.response?.data?.message || 'Something went wrong.');
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleShow = (field) => setShow(s => ({ ...s, [field]: !s[field] }));

  const fields = [
    { key: 'current_password',          label: 'Current password',  showKey: 'current', placeholder: 'Your temporary password'   },
    { key: 'new_password',              label: 'New password',       showKey: 'next',    placeholder: 'At least 8 characters'     },
    { key: 'new_password_confirmation', label: 'Confirm password',   showKey: 'confirm', placeholder: 'Repeat your new password'  },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="tisl-outer" style={{ width: '100%', maxWidth: 860, display: 'flex', flexDirection: 'column' }}>

        {/* Mobile bar */}
        <div className="tisl-mobile-bar" style={{
          display: 'none', background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
          padding: '20px 24px', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.2)', border: '1.5px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '1rem', fontWeight: 900, color: 'white' }}>T</span>
            </div>
            <div>
              <div style={{ color: 'white', fontWeight: 800, fontSize: '0.95rem' }}>BlueArc</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.65rem', fontWeight: 500 }}>Industrial Solutions</div>
            </div>
          </div>
        </div>

        <div className="tisl-card" style={{
          display: 'grid', gridTemplateColumns: '1fr 1.4fr',
          width: '100%', minHeight: 520,
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
            <div style={{ position: 'absolute', top: -60,  left: -60,  width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ position: 'absolute', bottom: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ position: 'absolute', top: '40%', left: -30, width: 120, height: 120, borderRadius: 24, background: 'rgba(255,255,255,0.07)', transform: 'rotate(20deg)' }} />

            {/* Logo */}
            <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
              <div style={{
                width: 72, height: 72, borderRadius: 20, background: 'rgba(255,255,255,0.18)',
                backdropFilter: 'blur(8px)', border: '1.5px solid rgba(255,255,255,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
              }}>
                <span style={{ fontSize: '1.6rem', fontWeight: 900, color: 'white', letterSpacing: '-0.04em' }}>T</span>
              </div>
              <h2 style={{ color: 'white', fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>BlueArc</h2>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', margin: '6px 0 0', fontWeight: 500 }}>Industrial Solutions</p>
            </div>

            {/* Info card */}
            <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>
              <div style={{
                background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.2)',
                borderRadius: 12, padding: '16px 20px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <ShieldAlert size={15} color="rgba(255,255,255,0.9)" />
                  <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.8rem', fontWeight: 700 }}>
                    Password change required
                  </span>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.78rem', margin: 0, lineHeight: 1.5 }}>
                  Your account requires a new password before you can continue. Choose something secure that you haven't used before.
                </p>
              </div>

              {email && (
                <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.68rem', fontWeight: 600, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Account</p>
                  <p style={{ color: 'white', fontSize: '0.85rem', fontWeight: 700, margin: 0, wordBreak: 'break-all' }}>{email}</p>
                </div>
              )}
            </div>
          </div>

          {/* Right panel */}
          <div className="bg-white dark:bg-gray-800" style={{ padding: '44px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>

            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.02em' }} className="text-gray-900 dark:text-white">
                Set a new password
              </h1>
              <p style={{ fontSize: '0.85rem', margin: 0 }} className="text-gray-500 dark:text-gray-400">
                You must update your password before continuing.
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
              {fields.map(({ key, label, showKey, placeholder }) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }} className="text-gray-500 dark:text-gray-400">
                    {label}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={15} style={{
                      position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                      color: focused === key ? '#a855f7' : '#9ca3af', transition: 'color 150ms',
                    }} />
                    <input
                      name={key}
                      type={show[showKey] ? 'text' : 'password'}
                      value={form[key]}
                      onChange={handleChange}
                      onFocus={() => setFocused(key)}
                      onBlur={() => setFocused('')}
                      placeholder={placeholder}
                      style={{
                        width: '100%', padding: '11px 44px 11px 40px', borderRadius: 10,
                        border: `1.5px solid ${errors[key] ? '#ef4444' : focused === key ? '#a855f7' : '#e5e7eb'}`,
                        fontSize: '0.88rem', outline: 'none', transition: 'border-color 150ms', boxSizing: 'border-box',
                      }}
                      className="bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                    />
                    <button type="button" onClick={() => toggleShow(showKey)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2 }}>
                      {show[showKey] ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {errors[key] && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: 4 }}>{errors[key][0]}</p>}
                </div>
              ))}

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
                {loading ? 'Updating…' : <><span>Update password</span><ArrowRight size={16} /></>}
              </button>
            </form>
          </div>
        </div>

        <style>{`
          @media (max-width: 640px) {
            .tisl-mobile-bar { display: flex !important; }
            .tisl-card { grid-template-columns: 1fr !important; border-radius: 0 0 24px 24px !important; min-height: unset !important; }
            .tisl-sidebar { display: none !important; }
            .tisl-outer { padding: 0 !important; }
          }
          @media (min-width: 641px) { .tisl-mobile-bar { display: none !important; } }
        `}</style>
      </div>
    </div>
  );
}