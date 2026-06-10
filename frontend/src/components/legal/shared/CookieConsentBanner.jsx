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

    if (!user) return null;
    if (consent === 'accepted') return null;

    const handleRespond = async (response) => {
        setSubmitting(response);
        try {
            if (user && customer) {
                await policyAPI.logAcceptance({
                    policy_key:     'cookie_policy',
                    action_context: 'cookie_consent',
                    response,
                    ...(response === 'disagreed' && { disagree_reason: 'Declined via cookie banner' }),
                });
            }
        } catch {
            // Non-blocking
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
                @keyframes spin { to { transform: rotate(360deg); } }

                .ccb-root {
                    animation: slideUp 0.35s cubic-bezier(0.16,1,0.3,1) forwards;
                }

                .ccb-decline:hover {
                    background: rgba(239,68,68,0.25) !important;
                    border-color: rgba(239,68,68,0.55) !important;
                    color: #fca5a5 !important;
                }
                .ccb-accept:hover {
                    background: rgba(168,85,247,0.32) !important;
                    border-color: rgba(192,132,252,0.7) !important;
                    color: #f3e8ff !important;
                }
            `}</style>

            <div
                className="ccb-root"
                style={{
                    position:   'fixed',
                    bottom:     0,
                    left:       0,
                    right:      0,
                    zIndex:     9999,
                    background: 'rgba(15, 10, 30, 0.92)',
                    borderTop:  '0.5px solid rgba(168,85,247,0.3)',
                    fontFamily: "'DM Sans', sans-serif",
                    overflow:   'hidden',
                }}
            >
                {/* Shimmer top line */}
                <div style={{
                    position:   'absolute',
                    top:        0, left: 0, right: 0,
                    height:     1.5,
                    background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.9) 30%, rgba(192,132,252,1) 50%, rgba(168,85,247,0.9) 70%, transparent)',
                }} />

                {/* Scanline texture */}
                <div style={{
                    position:   'absolute',
                    inset:      0,
                    background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 3px)',
                    pointerEvents: 'none',
                }} />

                {/* Radial purple glow */}
                <div style={{
                    position:   'absolute',
                    top:        -60, left: '50%',
                    transform:  'translateX(-50%)',
                    width:      600, height: 130,
                    background: 'radial-gradient(ellipse, rgba(139,92,246,0.18) 0%, transparent 70%)',
                    pointerEvents: 'none',
                }} />

                {/* Content */}
                <div style={{
                    position:   'relative',
                    zIndex:     1,
                    maxWidth:   1100,
                    margin:     '0 auto',
                    padding:    '18px 32px',
                    display:    'flex',
                    alignItems: 'center',
                    gap:        24,
                    flexWrap:   'wrap',
                }}>

                    {/* Icon */}
                    <div style={{
                        width:          42,
                        height:         42,
                        borderRadius:   10,
                        background:     'rgba(168,85,247,0.15)',
                        border:         '0.5px solid rgba(168,85,247,0.4)',
                        display:        'flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        flexShrink:     0,
                    }}>
                        <Cookie size={20} style={{ color: '#c084fc' }} />
                    </div>

                    {/* Text */}
                    <div style={{ flex: 1, minWidth: 240 }}>
                        <p style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.95)' }}>
                            We Use Cookies
                        </p>
                        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                            This site uses essential cookies solely to support core functionality. No third-party, analytics, or personalisation cookies are deployed -{' '}
                            <Link
                                to="/cookies"
                                style={{ color: '#c084fc', textDecoration: 'none' }}
                                onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                                onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                            >
                                view our cookie policy
                            </Link>
                            {' '}for full details.
                        </p>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>

                        {/* Decline — frosted red */}
                        <button
                            className="ccb-decline"
                            onClick={() => handleRespond('disagreed')}
                            disabled={busy}
                            style={{
                                display:            'flex',
                                alignItems:         'center',
                                gap:                6,
                                padding:            '8px 16px',
                                borderRadius:       8,
                                fontSize:           12,
                                fontWeight:         500,
                                background:         'rgba(239,68,68,0.15)',
                                border:             '0.5px solid rgba(239,68,68,0.35)',
                                color:              'rgba(252,165,165,0.9)',
                                backdropFilter:     'blur(8px)',
                                WebkitBackdropFilter: 'blur(8px)',
                                cursor:             busy ? 'not-allowed' : 'pointer',
                                fontFamily:         'inherit',
                                transition:         'all 150ms',
                                opacity:            busy && submitting !== 'disagreed' ? 0.4 : 1,
                            }}
                        >
                            {submitting === 'disagreed'
                                ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
                                : <XCircle size={13} />}
                            decline
                        </button>

                        {/* Divider */}
                        <div style={{ width: 0.5, height: 28, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />

                        {/* Accept — frosted purple */}
                        <button
                            className="ccb-accept"
                            onClick={() => handleRespond('accepted')}
                            disabled={busy}
                            style={{
                                display:            'flex',
                                alignItems:         'center',
                                gap:                6,
                                padding:            '8px 20px',
                                borderRadius:       8,
                                fontSize:           12,
                                fontWeight:         500,
                                background:         'rgba(168,85,247,0.2)',
                                border:             '0.5px solid rgba(192,132,252,0.45)',
                                color:              'rgba(216,180,254,0.95)',
                                backdropFilter:     'blur(8px)',
                                WebkitBackdropFilter: 'blur(8px)',
                                cursor:             busy ? 'not-allowed' : 'pointer',
                                fontFamily:         'inherit',
                                transition:         'all 150ms',
                                opacity:            busy && submitting !== 'accepted' ? 0.4 : 1,
                            }}
                        >
                            {submitting === 'accepted'
                                ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
                                : <CheckCircle size={13} />}
                            accept all
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}