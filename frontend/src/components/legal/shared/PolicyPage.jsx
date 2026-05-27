import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Header from '../../layout/Header';
import Footer from '../../layout/Footer';
import policyAPI from '../../../api/policy';
import { useAuthStore } from '../../../store';
import { ChevronLeft, AlertTriangle, CheckCircle, XCircle, Loader2, Shield } from 'lucide-react';
import logo from '../../../assets/images/logo.png';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// ── Disagree modal ────────────────────────────────────────────────────────────

function DisagreeModal({ policy, onClose, onConfirm, loading }) {
  const [reason, setReason] = useState('');
  const isCritical = policy.sensitivity === 'critical';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, background: 'rgba(15,10,30,0.75)', backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        background: 'white', borderRadius: 16, width: '100%', maxWidth: 480,
        padding: 28, boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
        border: `2px solid ${isCritical ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
      }}>
        {/* Icon + title */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: isCritical ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AlertTriangle size={20} style={{ color: isCritical ? '#dc2626' : '#f59e0b' }} />
          </div>
          <div>
            <p style={{ fontSize: '1rem', fontWeight: 800, color: '#111827', margin: '0 0 4px' }}>
              Disagree with {policy.title}?
            </p>
            <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: 0, lineHeight: 1.6 }}>
              {policy.disagree_consequence_text || 'Please note the consequences of disagreeing with this policy.'}
            </p>
          </div>
        </div>

        {/* Critical warning */}
        {isCritical && (
          <div style={{
            padding: '10px 14px', borderRadius: 10, marginBottom: 16,
            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
            fontSize: '0.78rem', color: '#dc2626', lineHeight: 1.6,
          }}>
            ⚠️ This is a <strong>critical policy</strong>. Disagreeing will flag your account and you will not be able to proceed until you accept.
          </div>
        )}

        {/* Reason textarea */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
            Reason for disagreeing <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Tell us why you disagree with this policy…"
            rows={3}
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: '0.82rem',
              border: '1.5px solid #e5e7eb', outline: 'none', resize: 'vertical',
              fontFamily: 'inherit', color: '#111827', boxSizing: 'border-box',
              transition: 'border-color 150ms',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; }}
            onBlur={e  => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px', borderRadius: 10, fontSize: '0.85rem', fontWeight: 700,
              border: '1.5px solid #e5e7eb', background: 'white', color: '#374151',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Go back
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={loading}
            style={{
              flex: 1, padding: '10px', borderRadius: 10, fontSize: '0.85rem', fontWeight: 700,
              border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              background: isCritical ? '#dc2626' : '#f59e0b',
              color: 'white', opacity: loading ? 0.6 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {loading ? <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> : <XCircle size={15} />}
            {loading ? 'Saving…' : 'I Disagree'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main PolicyPage component ─────────────────────────────────────────────────

export default function PolicyPage({ policyKey, actionContext = 'website_policy' }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, customer } = useAuthStore();

  const [policy,       setPolicy]       = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [showDisagree, setShowDisagree] = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [responded,    setResponded]    = useState(null); // 'accepted' | 'disagreed'

  // Where to go back to
  const backTo = location.state?.from || -1;

  useEffect(() => {
    policyAPI.getByKey(policyKey)
      .then(setPolicy)
      .catch(() => toast.error('Failed to load policy'))
      .finally(() => setLoading(false));
  }, [policyKey]);

  const handleAccept = async () => {
    if (!user || !customer) {
      toast('Please log in to accept this policy');
      navigate('/login');
      return;
    }
    setSubmitting(true);
    try {
      await policyAPI.logAcceptance({
        policy_key:     policyKey,
        action_context: actionContext,
        response:       'accepted',
      });
      setResponded('accepted');
      toast.success('Policy accepted');
    } catch {
      toast.error('Failed to record acceptance');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisagreeConfirm = async (reason) => {
    if (!user || !customer) {
      setShowDisagree(false);
      return;
    }
    setSubmitting(true);
    try {
      await policyAPI.logAcceptance({
        policy_key:      policyKey,
        action_context:  actionContext,
        response:        'disagreed',
        disagree_reason: reason || null,
      });
      setResponded('disagreed');
      setShowDisagree(false);
      toast('Your disagreement has been recorded.');
    } catch {
      toast.error('Failed to record disagreement');
    } finally {
      setSubmitting(false);
    }
  };

  const SENSITIVITY_LABEL = {
    critical: { label: 'Critical Policy',  bg: 'rgba(239,68,68,0.08)',  color: '#dc2626',  border: 'rgba(239,68,68,0.2)'  },
    standard: { label: 'Standard Policy',  bg: 'rgba(168,85,247,0.06)', color: '#7c3aed',  border: 'rgba(168,85,247,0.2)' },
    soft:     { label: 'Informational',    bg: 'rgba(107,114,128,0.06)',color: '#6b7280',  border: 'rgba(107,114,128,0.2)'},
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
      <Header />

      <main style={{ flex: 1, maxWidth: 860, margin: '0 auto', width: '100%', padding: '40px 24px 64px' }}>

        {/* Back button */}
        <button
          onClick={() => navigate(backTo)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: '0.78rem', fontWeight: 600, color: '#6b7280',
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 0, marginBottom: 32, fontFamily: 'inherit',
            transition: 'color 150ms',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
          onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}
        >
          <ChevronLeft size={15} /> Back
        </button>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
            <div style={{ width: 36, height: 36, border: '3px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : !policy ? (
          <div style={{ textAlign: 'center', padding: '80px 24px' }}>
            <Shield size={40} style={{ color: '#d1d5db', marginBottom: 16 }} />
            <p style={{ color: '#6b7280' }}>Policy not found.</p>
          </div>
        ) : (
          <div style={{
            background: 'white', borderRadius: 16,
            border: '1px solid #e5e7eb',
            boxShadow: '0 2px 20px rgba(0,0,0,0.06)',
            overflow: 'hidden', position: 'relative',
          }}>

            {/* Watermark */}
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none', zIndex: 0,
            }}>
              <img
                src={logo}
                alt=""
                style={{
                  width: 320, height: 320, objectFit: 'contain',
                  opacity: 0.04, filter: 'blur(2px) grayscale(100%)',
                  userSelect: 'none',
                }}
              />
            </div>

            {/* Content */}
            <div style={{ position: 'relative', zIndex: 1 }}>

              {/* Header band */}
              <div style={{
                padding: '32px 40px 28px',
                borderBottom: '1px solid #f3f4f6',
                background: 'linear-gradient(135deg, rgba(168,85,247,0.03), rgba(124,58,237,0.02))',
              }}>
                {/* Sensitivity badge */}
                {policy.sensitivity && (() => {
                  const s = SENSITIVITY_LABEL[policy.sensitivity];
                  return (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '3px 10px', borderRadius: 99, marginBottom: 14,
                      background: s.bg, color: s.color,
                      border: `1px solid ${s.border}`,
                      fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                    }}>
                      <Shield size={10} /> {s.label}
                    </div>
                  );
                })()}

                <h1 style={{
                  fontSize: '1.75rem', fontWeight: 900, color: '#111827',
                  letterSpacing: '-0.02em', margin: '0 0 10px', lineHeight: 1.2,
                }}>
                  {policy.title}
                </h1>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                    Version <strong style={{ color: '#7c3aed' }}>v{policy.major_version}.{policy.minor_version}</strong>
                  </span>
                  {policy.updated_at && (
                    <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                      Last updated: {format(new Date(policy.updated_at), 'dd MMMM yyyy')}
                    </span>
                  )}
                </div>
              </div>

              {/* Policy body */}
              <div style={{ padding: '36px 40px' }}>
                <div style={{
                  fontSize: '0.92rem', lineHeight: 1.9, color: '#374151',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'Georgia, "Times New Roman", serif',
                }}>
                  {policy.content}
                </div>
              </div>

              {/* Response section — only for logged-in customers */}
              {user?.role === 'customer' && (
                <div style={{
                  padding: '24px 40px 32px',
                  borderTop: '1px solid #f3f4f6',
                  background: 'rgba(249,250,251,0.8)',
                }}>
                  {responded === 'accepted' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                      <CheckCircle size={18} style={{ color: '#16a34a', flexShrink: 0 }} />
                      <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#16a34a' }}>
                        You have accepted this policy. Your acceptance has been recorded.
                      </p>
                    </div>
                  ) : responded === 'disagreed' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                      <XCircle size={18} style={{ color: '#dc2626', flexShrink: 0 }} />
                      <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#dc2626' }}>
                        Your disagreement has been recorded.
                      </p>
                    </div>
                  ) : (
                    <>
                      <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: '0 0 16px' }}>
                        Do you agree with this policy?
                      </p>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <button
                          onClick={handleAccept}
                          disabled={submitting}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 7,
                            padding: '10px 24px', borderRadius: 10, fontSize: '0.88rem', fontWeight: 700,
                            border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                            background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
                            boxShadow: '0 4px 14px rgba(168,85,247,0.35)', opacity: submitting ? 0.7 : 1,
                            transition: 'box-shadow 150ms',
                          }}
                          onMouseEnter={e => { if (!submitting) e.currentTarget.style.boxShadow = '0 6px 20px rgba(168,85,247,0.5)'; }}
                          onMouseLeave={e => { if (!submitting) e.currentTarget.style.boxShadow = '0 4px 14px rgba(168,85,247,0.35)'; }}
                        >
                          {submitting
                            ? <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} />
                            : <CheckCircle size={15} />}
                          I Agree
                        </button>
                        <button
                          onClick={() => setShowDisagree(true)}
                          disabled={submitting}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 7,
                            padding: '10px 24px', borderRadius: 10, fontSize: '0.88rem', fontWeight: 700,
                            border: '1.5px solid rgba(239,68,68,0.3)', cursor: 'pointer', fontFamily: 'inherit',
                            background: 'white', color: '#dc2626', opacity: submitting ? 0.5 : 1,
                            transition: 'border-color 150ms, background 150ms',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.04)'; e.currentTarget.style.borderColor = '#dc2626'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; }}
                        >
                          <XCircle size={15} /> I Disagree
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Footer note */}
              <div style={{
                padding: '14px 40px', borderTop: '1px solid #f3f4f6',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: 8,
              }}>
                <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: 0 }}>
                  This document is legally binding. All acceptances and disagreements are logged with timestamp and IP address.
                </p>
                <img src={logo} alt="TISL" style={{ height: 20, opacity: 0.4, objectFit: 'contain' }} />
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />

      {showDisagree && policy && (
        <DisagreeModal
          policy={policy}
          onClose={() => setShowDisagree(false)}
          onConfirm={handleDisagreeConfirm}
          loading={submitting}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}