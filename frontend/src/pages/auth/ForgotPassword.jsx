import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { authAPI } from '../../api';
import toast from 'react-hot-toast';

export default function ForgotPassword() {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) { setError('Email is required'); return; }
    setError('');
    setLoading(true);
    try {
      await authAPI.forgotPassword(email);
      setSent(true);
    } catch (err) {
      // Don't reveal whether the email exists — show generic message
      // but still transition to "sent" state to prevent enumeration
      const status = err.response?.status;
      if (status === 422) {
        setError(err.response.data?.errors?.email?.[0] ?? 'Invalid email address');
      } else {
        setSent(true); // treat all other errors as "sent" — security best practice
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
      padding: '24px 16px',
    }}>
      <div style={{
        width: '100%', maxWidth: 420, background: 'white', borderRadius: 16,
        boxShadow: '0 8px 40px rgba(99,102,241,0.12)', padding: '36px 32px',
      }}>

        {!sent ? (
          <>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14, background: '#f5f3ff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 14px',
              }}>
                <Mail size={22} style={{ color: '#6366f1' }} />
              </div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
                Forgot your password?
              </h1>
              <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0, lineHeight: 1.6 }}>
                Enter your email and we'll send you a link to reset your password.
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>
                  Email address
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={14} style={{
                    position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                    color: '#9ca3af', pointerEvents: 'none',
                  }} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    placeholder="you@example.com"
                    autoFocus
                    style={{
                      width: '100%', padding: '10px 12px 10px 32px', borderRadius: 9,
                      border: `1.5px solid ${error ? '#ef4444' : '#e5e7eb'}`,
                      fontSize: '0.875rem', color: '#111827', outline: 'none',
                      fontFamily: 'inherit', boxSizing: 'border-box',
                      transition: 'border-color 150ms, box-shadow 150ms',
                    }}
                    onFocus={(e) => { e.target.style.borderColor = '#6366f1'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'; }}
                    onBlur={(e)  => { if (!error) { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}}
                  />
                </div>
                {error && <p style={{ fontSize: '0.7rem', color: '#ef4444', margin: '4px 0 0' }}>{error}</p>}
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '11px', borderRadius: 9, fontSize: '0.875rem', fontWeight: 700,
                  border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', background: '#6366f1', color: 'white',
                  boxShadow: '0 3px 12px rgba(99,102,241,0.35)',
                  opacity: loading ? 0.7 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'opacity 150ms',
                }}
              >
                {loading && <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />}
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>
        ) : (
          /* ── Sent confirmation state ── */
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16, background: '#f0fdf4',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <CheckCircle2 size={26} style={{ color: '#22c55e' }} />
            </div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#111827', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
              Check your email
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: '0 0 6px', lineHeight: 1.6 }}>
              If <strong style={{ color: '#374151' }}>{email}</strong> is registered, a password reset link is on its way.
            </p>
            <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '0 0 24px', lineHeight: 1.5 }}>
              Didn't get it? Check your spam folder or wait a minute before trying again.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(''); }}
              style={{
                padding: '9px 20px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
                border: '1.5px solid #e5e7eb', background: 'white', color: '#374151',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color 150ms',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#6366f1'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#e5e7eb'}
            >
              Try a different email
            </button>
          </div>
        )}

        {/* Back to login */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Link
            to="/login"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: '0.78rem', fontWeight: 600, color: '#6b7280',
              textDecoration: 'none', transition: 'color 150ms',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#6366f1'}
            onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}
          >
            <ArrowLeft size={13} /> Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}