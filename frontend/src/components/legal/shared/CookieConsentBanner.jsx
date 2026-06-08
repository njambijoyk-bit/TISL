import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, XCircle, Cookie, Loader2 } from 'lucide-react';
import policyAPI from '../../../api/policy';
import { useAuthStore } from '../../../store';
import useCookieConsentStore from '../../../store/useCookieConsentStore';

export default function CookieConsentBanner() {
    const { consent, setConsent } = useCookieConsentStore();
    const { user, customer }      = useAuthStore();
    const [submitting, setSubmitting] = useState(null); // 'accepted' | 'declined'

    // Already decided — don't render
    if (consent) return null;

    const handleRespond = async (response) => {
        setSubmitting(response);
        try {
            // Only log to backend if the user is a logged-in customer
            if (user && customer) {
                await policyAPI.logAcceptance({
                    policy_key:     'cookie_policy',
                    action_context: 'cookie_consent',
                    response,
                    ...(response === 'disagreed' && { disagree_reason: 'Declined via cookie banner' }),
                });
            }
        } catch {
            // Non-blocking — still persist locally even if API fails
        } finally {
            setConsent(response);
            setSubmitting(null);
        }
    };

    const busy = submitting !== null;

    return (
        <>
            <style>{`
                @keyframes slideUp {
                    from { transform: translateY(100%); opacity: 0; }
                    to   { transform: translateY(0);    opacity: 1; }
                }
                .ccb-root {
                    animation: slideUp 0.35s cubic-bezier(0.16,1,0.3,1) forwards;
                }
                .ccb-accept:hover  { box-shadow: 0 6px 20px rgba(168,85,247,0.5) !important; }
                .ccb-decline:hover { background: rgba(255,255,255,0.06) !important; border-color: #555 !important; }
            `}</style>

            <div
                className="ccb-root"
                style={{
                    position:   'fixed',
                    bottom:     0,
                    left:       0,
                    right:      0,
                    zIndex:     9999,
                    background: '#0f0f0f',
                    borderTop:  '1px solid #1e1e1e',
                    fontFamily: "'DM Sans', sans-serif",
                }}
            >
                {/* Purple dashed top accent */}
                <div style={{
                    position:   'absolute',
                    top:        0,
                    left:       0,
                    right:      0,
                    height:     2,
                    background: 'repeating-linear-gradient(90deg, #a855f7 0px, #a855f7 6px, transparent 6px, transparent 12px)',
                    opacity:    0.5,
                }} />

                <div style={{
                    maxWidth:       1100,
                    margin:         '0 auto',
                    padding:        '20px 32px',
                    display:        'flex',
                    alignItems:     'center',
                    gap:            24,
                    flexWrap:       'wrap',
                }}>
                    {/* Icon */}
                    <div style={{
                        width:          44,
                        height:         44,
                        borderRadius:   12,
                        background:     '#2d1b4e',
                        border:         '1px solid #3d1b6e',
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        flexShrink:     0,
                    }}>
                        <Cookie size={20} style={{ color: '#c084fc' }} />
                    </div>

                    {/* Text */}
                    <div style={{ flex: 1, minWidth: 240 }}>
                        <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 700, color: '#f0f0f0' }}>
                            we use cookies
                        </p>
                        <p style={{ margin: 0, fontSize: 12, color: '#888', lineHeight: 1.6 }}>
                            strictly necessary cookies keep things running. analytics &amp; personalisation cookies are optional —
                            {' '}<Link
                                to="/cookies"
                                style={{ color: '#a855f7', textDecoration: 'none' }}
                                onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
                                onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
                            >
                                read our cookie policy
                            </Link>
                            {' '}for the full story.
                        </p>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                        {/* Decline */}
                        <button
                            className="ccb-decline"
                            onClick={() => handleRespond('disagreed')}
                            disabled={busy}
                            style={{
                                display:        'flex',
                                alignItems:     'center',
                                gap:            6,
                                padding:        '9px 18px',
                                borderRadius:   9,
                                fontSize:       13,
                                fontWeight:     600,
                                border:         '1px solid #2a2a2a',
                                background:     'transparent',
                                color:          '#888',
                                cursor:         busy ? 'not-allowed' : 'pointer',
                                fontFamily:     'inherit',
                                transition:     'background 150ms, border-color 150ms',
                                opacity:        busy && submitting !== 'disagreed' ? 0.4 : 1,
                            }}
                        >
                            {submitting === 'disagreed'
                                ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                                : <XCircle size={14} />}
                            decline
                        </button>

                        {/* Accept */}
                        <button
                            className="ccb-accept"
                            onClick={() => handleRespond('accepted')}
                            disabled={busy}
                            style={{
                                display:        'flex',
                                alignItems:     'center',
                                gap:            6,
                                padding:        '9px 20px',
                                borderRadius:   9,
                                fontSize:       13,
                                fontWeight:     700,
                                border:         '1px solid #a855f7',
                                background:     'linear-gradient(135deg, #a855f7, #7c3aed)',
                                color:          '#fff',
                                cursor:         busy ? 'not-allowed' : 'pointer',
                                fontFamily:     'inherit',
                                boxShadow:      '0 4px 14px rgba(168,85,247,0.35)',
                                transition:     'box-shadow 150ms',
                                opacity:        busy && submitting !== 'accepted' ? 0.4 : 1,
                            }}
                        >
                            {submitting === 'accepted'
                                ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                                : <CheckCircle size={14} />}
                            accept all
                        </button>
                    </div>
                </div>
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
    );
}