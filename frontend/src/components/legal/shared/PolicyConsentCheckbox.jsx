import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, CheckCircle, XCircle, Loader2, Shield, X,
} from 'lucide-react';
import policyAPI from '../../../api/policy';
import toast from 'react-hot-toast';

// ─────────────────────────────────────────────────────────────────────────────
// DisagreeModal  (same design as PolicyPage, self-contained here so no import)
// ─────────────────────────────────────────────────────────────────────────────
function DisagreeModal({ policy, onClose, onConfirm, loading }) {
  const [reason, setReason] = useState('');
  const isCritical = policy.sensitivity === 'critical';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, background: 'rgba(15,10,30,0.80)', backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        background: 'white', borderRadius: 16, width: '100%', maxWidth: 480,
        padding: 28, boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
        border: `2px solid ${isCritical ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
      }}>
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

        {isCritical && (
          <div style={{
            padding: '10px 14px', borderRadius: 10, marginBottom: 16,
            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
            fontSize: '0.78rem', color: '#dc2626', lineHeight: 1.6,
          }}>
            ⚠️ This is a <strong>critical policy</strong>. Disagreeing will flag your account and restrict access until you accept.
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
            Reason <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Tell us why you disagree…"
            rows={3}
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: '0.82rem',
              border: '1.5px solid #e5e7eb', outline: 'none', resize: 'vertical',
              fontFamily: 'inherit', color: '#111827', boxSizing: 'border-box',
            }}
            onFocus={e  => { e.currentTarget.style.borderColor = '#a855f7'; }}
            onBlur={e   => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '10px', borderRadius: 10, fontSize: '0.85rem', fontWeight: 700,
            border: '1.5px solid #e5e7eb', background: 'white', color: '#374151',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Go back
          </button>
          <button onClick={() => onConfirm(reason)} disabled={loading} style={{
            flex: 1, padding: '10px', borderRadius: 10, fontSize: '0.85rem', fontWeight: 700,
            border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            background: isCritical ? '#dc2626' : '#f59e0b', color: 'white', opacity: loading ? 0.6 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {loading ? <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> : <XCircle size={15} />}
            {loading ? 'Saving…' : 'I Disagree'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PolicyModal  — inline modal showing policy content + accept / disagree
// Only shown when user clicks a policy link (not from the checkbox itself)
// actionContext + onDisagree are passed down from the parent
// ─────────────────────────────────────────────────────────────────────────────
function PolicyModal({ policy, actionContext, onClose, onDisagree }) {
  const [showDisagree, setShowDisagree] = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [responded,    setResponded]    = useState(null); // 'accepted' | 'disagreed'

  const SENSITIVITY_LABEL = {
    critical: { label: 'Critical', color: '#dc2626', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)' },
    standard: { label: 'Standard', color: '#d97706', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
    soft:     { label: 'Informational', color: '#2563eb', bg: 'rgba(37,99,235,0.06)', border: 'rgba(37,99,235,0.15)' },
  };

  const handleAccept = async () => {
    setSubmitting(true);
    try {
      await policyAPI.logAcceptance({
        policy_key:     policy.key,
        action_context: actionContext,
        response:       'accepted',
      });
      setResponded('accepted');
      toast.success(`${policy.title} accepted`);
    } catch {
      toast.error('Failed to record acceptance');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisagreeConfirm = async (reason) => {
    setSubmitting(true);
    try {
      await policyAPI.logAcceptance({
        policy_key:      policy.key,
        action_context:  actionContext,
        response:        'disagreed',
        disagree_reason: reason || null,
      });
      setResponded('disagreed');
      setShowDisagree(false);
      toast('Your disagreement has been recorded.');
      onDisagree?.(policy.key);
    } catch {
      toast.error('Failed to record disagreement');
    } finally {
      setSubmitting(false);
    }
  };

  const s = SENSITIVITY_LABEL[policy.sensitivity] ?? SENSITIVITY_LABEL.soft;

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 150,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, background: 'rgba(15,10,30,0.75)', backdropFilter: 'blur(8px)',
      }}>
        <div style={{
          background: 'white', borderRadius: 20, width: '100%', maxWidth: 640,
          maxHeight: '85vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 32px 80px rgba(0,0,0,0.22)',
          border: '1px solid #e5e7eb', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '24px 28px 20px',
            borderBottom: '1px solid #f3f4f6',
            background: 'linear-gradient(135deg,rgba(168,85,247,0.03),rgba(124,58,237,0.02))',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                {/* Sensitivity badge */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '2px 9px', borderRadius: 99, marginBottom: 10,
                  background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                  fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>
                  <Shield size={9} /> {s.label}
                </div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>
                  {policy.title}
                </h2>
                <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '6px 0 0' }}>
                  Version <strong style={{ color: '#7c3aed' }}>v{policy.major_version}.{policy.minor_version}</strong>
                </p>
              </div>
              <button onClick={onClose} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#9ca3af', padding: 4, flexShrink: 0,
                borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#374151'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#9ca3af'; }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div style={{ overflowY: 'auto', padding: '24px 28px', flex: 1 }}>
            <div style={{
              fontSize: '0.875rem', lineHeight: 1.85, color: '#374151',
              whiteSpace: 'pre-wrap', fontFamily: 'Georgia, "Times New Roman", serif',
            }}>
              {policy.content}
            </div>
          </div>

          {/* Footer actions */}
          <div style={{
            padding: '18px 28px', borderTop: '1px solid #f3f4f6',
            background: 'rgba(249,250,251,0.9)', flexShrink: 0,
          }}>
            {responded === 'accepted' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <CheckCircle size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
                <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#16a34a' }}>
                  Accepted — you can close this window.
                </p>
                <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontSize: '0.78rem', fontWeight: 700 }}>
                  Close
                </button>
              </div>
            ) : responded === 'disagreed' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <XCircle size={16} style={{ color: '#dc2626', flexShrink: 0 }} />
                <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#dc2626' }}>
                  Disagreement recorded.
                </p>
                <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.78rem', fontWeight: 700 }}>
                  Close
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0, flex: 1 }}>
                  Do you agree with this policy?
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showDisagree && (
        <DisagreeModal
          policy={policy}
          onClose={() => setShowDisagree(false)}
          onConfirm={handleDisagreeConfirm}
          loading={submitting}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PolicyConsentCheckbox  — the exported component
//
// Props:
//   policyKeys    string[]   e.g. ['terms_of_use', 'privacy_policy']
//   actionContext string     e.g. 'login' | 'register' | 'booking_checkout' …
//   onChange      fn         called with (checked, acceptances[]) on every state change
//                            acceptances = [{ key, response:'accepted' }] when checked
//                            acceptances = [] when unchecked
//   disabled      bool       optional — greys out the whole thing
// ─────────────────────────────────────────────────────────────────────────────
export default function PolicyConsentCheckbox({ policyKeys, actionContext, onChange, disabled = false }) {
  const [policies,      setPolicies]      = useState([]);       // fetched policy objects
  const [loadingKeys,   setLoadingKeys]   = useState(true);
  const [checked,       setChecked]       = useState(false);
  const [openPolicy,    setOpenPolicy]    = useState(null);     // policy obj shown in modal
  const [disagreed,     setDisagreed]     = useState(new Set()); // keys the user has disagreed with

  // Fetch all required policies once
  useEffect(() => {
    if (!policyKeys?.length) { setLoadingKeys(false); return; }
    Promise.all(policyKeys.map(k => policyAPI.getByKey(k)))
      .then(setPolicies)
      .catch(() => toast.error('Failed to load policies'))
      .finally(() => setLoadingKeys(false));
  }, [policyKeys?.join(',')]);

  // Notify parent whenever checked state changes
  const notify = useCallback((isChecked) => {
    const acceptances = isChecked
      ? policies.map(p => ({ key: p.key, response: 'accepted' }))
      : [];
    onChange?.(isChecked, acceptances);
  }, [policies, onChange]);

  const handleCheck = (e) => {
    const val = e.target.checked;
    setChecked(val);
    notify(val);
  };

  const handleLinkClick = (e, policy) => {
    e.preventDefault();
    setOpenPolicy(policy);
  };

  // When user disagrees inside the modal — uncheck the box
  const handleDisagree = (policyKey) => {
    setDisagreed(prev => new Set([...prev, policyKey]));
    setChecked(false);
    notify(false);
    setOpenPolicy(null);
  };

  // Render policy links: "Terms of Service and Privacy Policy"
  const renderLinks = () => {
    if (loadingKeys || !policies.length) {
      return <span style={{ color: '#a855f7' }}>Terms of Service and Privacy Policy</span>;
    }
    return policies.map((p, i) => (
      <span key={p.key}>
        {i > 0 && (i === policies.length - 1 ? ' and ' : ', ')}
        <a
          href="#"
          onClick={e => handleLinkClick(e, p)}
          style={{ color: '#a855f7', textDecoration: 'none', fontWeight: 600 }}
          onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
          onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
        >
          {p.title}
        </a>
      </span>
    ));
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, opacity: disabled ? 0.5 : 1 }}>
        <input
          id="policy-consent-checkbox"
          type="checkbox"
          checked={checked}
          onChange={handleCheck}
          disabled={disabled || loadingKeys}
          style={{ marginTop: 3, accentColor: '#a855f7', cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0 }}
        />
        <label
          htmlFor="policy-consent-checkbox"
          style={{ fontSize: '0.78rem', lineHeight: 1.6, cursor: disabled ? 'not-allowed' : 'pointer', color: '#6b7280' }}
        >
          I agree to the {renderLinks()}
        </label>
      </div>

      {/* Inline policy modal — opens when user clicks a policy link */}
      {openPolicy && (
        <PolicyModal
          policy={openPolicy}
          actionContext={actionContext}
          onClose={() => setOpenPolicy(null)}
          onDisagree={handleDisagree}
        />
      )}
    </>
  );
}