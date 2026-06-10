import { useRef, useEffect } from 'react';
import { Volume2, VolumeX, ChevronRight, CheckCircle2 } from 'lucide-react';
import ThemeSwitcher from '../../../components/common/ThemeSwitcher';

// ── Design tokens — amber/green financial cyberpunk ───────────────────────────
export const F = {
    // Backgrounds
    bg:         'var(--color-background-tertiary)',
    bgCard:     'var(--color-background-secondary)',
    bgInput:    'var(--color-background-secondary)',

    // Core accent palette
    amber:      '#f59e0b',
    amberDim:   '#92400e',
    amberGlow:  'rgba(245,158,11,0.25)',
    green:      '#10b981',
    greenDim:   '#065f46',
    greenGlow:  'rgba(16,185,129,0.25)',
    teal:       '#14b8a6',
    tealGlow:   'rgba(20,184,166,0.2)',

    // Signal colours
    red:        '#ef4444',
    redGlow:    'rgba(239,68,68,0.2)',
    gold:       '#fbbf24',
    lime:       '#84cc16',

    // Borders
    border:     'rgba(245,158,11,0.18)',
    borderHi:   'rgba(245,158,11,0.45)',
    borderGreen:'rgba(16,185,129,0.25)',

    // Typography
    text:       'var(--color-text-primary)',
    textMid:    'var(--color-text-secondary)',
    textDim:    'var(--color-text-tertiary)',

    // Glows
    glow:       '0 0 20px rgba(245,158,11,0.25)',
    glowGreen:  '0 0 20px rgba(16,185,129,0.25)',
    glowTeal:   '0 0 20px rgba(20,184,166,0.2)',

    // Fonts
    mono:       "'JetBrains Mono', 'Fira Code', monospace",
    sans:       "'DM Sans', sans-serif",
};

// ── Wizard step definitions ───────────────────────────────────────────────────
// Used by the wizard nav and page routing — export for use across pages
export const WIZARD_STEPS = [
    { key: 'source',     label: 'SOURCE',     description: 'Select table & period'   },
    { key: 'upload',     label: 'UPLOAD',     description: 'Drop your external file' },
    { key: 'configure',  label: 'CONFIGURE',  description: 'Confirm identifier col'  },
    { key: 'diff',       label: 'DIFF',       description: 'Running comparison'      },
    { key: 'results',    label: 'RESULTS',    description: 'Review & act'            },
];

// ── Financial grid canvas — ticker tape + candlestick waterfall ───────────────
export function FinancialCanvas() {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const resize = () => {
            canvas.width  = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        // ── Ticker tape columns (falling characters like a terminal) ──
        const COLS   = Math.floor(canvas.width / 18);
        const drops  = Array.from({ length: COLS }, () => Math.random() * -canvas.height);
        const speeds = Array.from({ length: COLS }, () => 0.4 + Math.random() * 0.8);
        const CHARS  = '0123456789ABCDEFKLMNRSTVXZ+−×÷=≠><↑↓▲▼$%KES';

        // ── Floating candlestick bars ─────────────────────────────────
        const CANDLES = 14;
        const candles = Array.from({ length: CANDLES }, (_, i) => ({
            x:     (canvas.width / CANDLES) * i + 20,
            open:  0.3 + Math.random() * 0.4,
            close: 0.3 + Math.random() * 0.4,
            high:  0.1 + Math.random() * 0.2,
            low:   0.1 + Math.random() * 0.2,
            t:     Math.random() * Math.PI * 2,
            speed: 0.003 + Math.random() * 0.004,
            bullish: Math.random() > 0.45,
        }));

        // ── Horizontal grid lines ─────────────────────────────────────
        const GRID_LINES = 6;

        let frame;

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Grid lines
            for (let i = 0; i <= GRID_LINES; i++) {
                const y = (canvas.height / GRID_LINES) * i;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(canvas.width, y);
                ctx.strokeStyle = 'rgba(245,158,11,0.04)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            // Vertical grid lines
            const VCOLS = 10;
            for (let i = 0; i <= VCOLS; i++) {
                const x = (canvas.width / VCOLS) * i;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
                ctx.strokeStyle = 'rgba(245,158,11,0.03)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            // Falling ticker characters
            ctx.font = '11px monospace';
            for (let i = 0; i < COLS; i++) {
                const char  = CHARS[Math.floor(Math.random() * CHARS.length)];
                const alpha = 0.06 + Math.random() * 0.06;
                // Lead character is brighter
                ctx.fillStyle = `rgba(245,158,11,${alpha * 2.5})`;
                ctx.fillText(char, i * 18, drops[i]);

                // Trail
                for (let t = 1; t <= 4; t++) {
                    const trailAlpha = alpha * (1 - t / 5);
                    ctx.fillStyle = `rgba(245,158,11,${trailAlpha})`;
                    ctx.fillText(CHARS[Math.floor(Math.random() * CHARS.length)], i * 18, drops[i] - t * 14);
                }

                drops[i] += speeds[i] * 1.4;
                if (drops[i] > canvas.height + 20) drops[i] = -20 - Math.random() * 100;
            }

            // Animated candlestick bars
            const CANDLE_H = canvas.height * 0.35;
            const CANDLE_BASE = canvas.height * 0.75;
            const CANDLE_W = (canvas.width / CANDLES) * 0.45;

            candles.forEach(c => {
                c.t += c.speed;
                const sway = Math.sin(c.t) * 0.04;

                const openY  = CANDLE_BASE - (c.open  + sway) * CANDLE_H;
                const closeY = CANDLE_BASE - (c.close - sway) * CANDLE_H;
                const highY  = Math.min(openY, closeY) - c.high * CANDLE_H * 0.5;
                const lowY   = Math.max(openY, closeY) + c.low  * CANDLE_H * 0.5;

                const color = c.bullish ? 'rgba(16,185,129,0.18)' : 'rgba(245,158,11,0.14)';
                const wickColor = c.bullish ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.1)';

                // Wick
                ctx.beginPath();
                ctx.moveTo(c.x, highY);
                ctx.lineTo(c.x, lowY);
                ctx.strokeStyle = wickColor;
                ctx.lineWidth = 1;
                ctx.stroke();

                // Body
                const bodyTop    = Math.min(openY, closeY);
                const bodyHeight = Math.abs(closeY - openY) || 2;
                ctx.fillStyle = color;
                ctx.fillRect(c.x - CANDLE_W / 2, bodyTop, CANDLE_W, bodyHeight);
            });

            // Subtle scanning line
            const scanY = ((Date.now() / 30) % canvas.height);
            const gradient = ctx.createLinearGradient(0, scanY - 40, 0, scanY + 10);
            gradient.addColorStop(0, 'rgba(245,158,11,0)');
            gradient.addColorStop(1, 'rgba(245,158,11,0.04)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, scanY - 40, canvas.width, 50);

            frame = requestAnimationFrame(draw);
        };

        draw();
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', resize);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.55, pointerEvents: 'none' }}
        />
    );
}

// ── CRT scanline overlay ──────────────────────────────────────────────────────
export function Scanlines() {
    return (
        <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.025) 2px, rgba(0,0,0,0.025) 4px)',
        }} />
    );
}

// ── Mute button ───────────────────────────────────────────────────────────────
export function MuteButton({ muted, onToggle, onHover }) {
    return (
        <button
            onClick={e => { e.stopPropagation(); onToggle(); }}
            onMouseEnter={onHover}
            style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 6,
                border: `1px solid ${F.border}`,
                background: 'rgba(0,0,0,0.45)',
                color: F.textMid, cursor: 'pointer',
                fontSize: '0.68rem', fontFamily: F.mono,
                backdropFilter: 'blur(8px)',
                letterSpacing: '0.06em',
                transition: 'border-color 150ms',
            }}
        >
            {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
            {muted ? 'MUTED' : 'LIVE'}
        </button>
    );
}

// ── Financial breadcrumb ──────────────────────────────────────────────────────
export function FinancialBreadcrumb({ items, onHover }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', marginBottom: 28, fontFamily: F.mono }}>
            {items.map((item, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {item.onClick ? (
                        <button
                            onClick={item.onClick}
                            onMouseEnter={onHover}
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: F.amber, fontWeight: 700,
                                fontSize: '0.68rem', fontFamily: F.mono, padding: 0,
                                textShadow: `0 0 8px ${F.amber}`,
                                letterSpacing: '0.08em',
                            }}
                        >
                            {item.label}
                        </button>
                    ) : (
                        <span style={{ color: F.text, fontWeight: 600, letterSpacing: '0.08em' }}>{item.label}</span>
                    )}
                    {i < items.length - 1 && <ChevronRight size={10} style={{ color: F.textDim }} />}
                </span>
            ))}
        </div>
    );
}

// ── Wizard step navigation ────────────────────────────────────────────────────
export function WizardNav({ steps, currentStep, onHover }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 0,
            marginBottom: 36,
            background: 'rgba(0,0,0,0.3)',
            border: `1px solid ${F.border}`,
            borderRadius: 10,
            padding: '10px 16px',
            backdropFilter: 'blur(8px)',
            overflowX: 'auto',
        }}>
            {steps.map((step, i) => {
                const isActive   = step.key === currentStep;
                const isDone     = steps.findIndex(s => s.key === currentStep) > i;
                const isLast     = i === steps.length - 1;

                return (
                    <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
                        <div
                            onMouseEnter={onHover}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', borderRadius: 6 }}
                        >
                            {/* Step indicator */}
                            <div style={{
                                width: 22, height: 22, borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: isDone
                                    ? F.green
                                    : isActive
                                        ? F.amber
                                        : 'rgba(255,255,255,0.06)',
                                border: `1px solid ${isDone ? F.green : isActive ? F.amber : F.border}`,
                                boxShadow: isActive ? `0 0 10px ${F.amberGlow}` : isDone ? `0 0 8px ${F.greenGlow}` : 'none',
                                flexShrink: 0,
                                transition: 'all 250ms ease',
                            }}>
                                {isDone ? (
                                    <CheckCircle2 size={12} style={{ color: '#000' }} />
                                ) : (
                                    <span style={{
                                        fontSize: '0.6rem', fontWeight: 800,
                                        color: isActive ? '#000' : F.textDim,
                                        fontFamily: F.mono,
                                    }}>
                                        {i + 1}
                                    </span>
                                )}
                            </div>

                            {/* Step label */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <span style={{
                                    fontSize: '0.65rem', fontWeight: 800, fontFamily: F.mono,
                                    color: isDone ? F.green : isActive ? F.amber : F.textDim,
                                    letterSpacing: '0.1em',
                                    textShadow: isActive ? `0 0 6px ${F.amber}` : 'none',
                                    transition: 'color 250ms',
                                }}>
                                    {step.label}
                                </span>
                                <span style={{
                                    fontSize: '0.57rem', color: isActive ? F.textMid : F.textDim,
                                    fontFamily: F.mono, letterSpacing: '0.04em',
                                    whiteSpace: 'nowrap',
                                }}>
                                    {step.description}
                                </span>
                            </div>
                        </div>

                        {/* Connector */}
                        {!isLast && (
                            <div style={{ position: 'relative', width: 28, height: 1, margin: '0 2px' }}>
                                <div style={{ position: 'absolute', inset: 0, background: isDone ? F.green : F.border, opacity: 0.5 }} />
                                {isDone && (
                                    <div style={{
                                        position: 'absolute', top: 0, left: 0, height: '100%', width: '100%',
                                        background: `linear-gradient(90deg, ${F.green}, ${F.teal})`,
                                        boxShadow: `0 0 4px ${F.green}`,
                                    }} />
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ── Page shell (bg + canvas + scanlines + mute) ───────────────────────────────
export function FinancialPageShell({ audio, ambientOn, setAmbientOn, children }) {
    const handleFirstInteraction = () => {
        if (!ambientOn && !audio.muted) {
            audio.startAmbient();
            setAmbientOn(true);
        }
    };

    return (
        <div
            onClick={handleFirstInteraction}
            style={{
                minHeight: '100vh',
                background: F.bg,
                color: F.text,
                fontFamily: F.sans,
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            <FinancialCanvas />
            <Scanlines />

            <div style={{ position: 'relative', zIndex: 2, maxWidth: 1040, margin: '0 auto', padding: '32px 24px' }}>
                {/* Mute button — top right */}
                <div style={{ position: 'absolute', top: 0, right: 0 }}>
                    <MuteButton muted={audio.muted} onToggle={audio.toggleMute} onHover={audio.playHover} />
                    <ThemeSwitcher />
                </div>

                {children}
            </div>

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700;800&family=DM+Sans:wght@400;500;600;700;800&display=swap');

                @keyframes tickerScroll {
                    0%   { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
                @keyframes scanLine {
                    0%   { left: -30%; }
                    100% { left: 130%; }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50%       { opacity: 0.35; }
                }
                @keyframes fadeSlideIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes flashAmber {
                    0%   { box-shadow: 0 0 0 0 rgba(245,158,11,0.4); }
                    50%  { box-shadow: 0 0 0 4px rgba(245,158,11,0.12); }
                    100% { box-shadow: none; }
                }
                @keyframes flashGreen {
                    0%   { box-shadow: 0 0 0 0 rgba(16,185,129,0.4); }
                    50%  { box-shadow: 0 0 0 4px rgba(16,185,129,0.12); }
                    100% { box-shadow: none; }
                }
                @keyframes diffRow {
                    from { opacity: 0; transform: translateX(-6px); }
                    to   { opacity: 1; transform: translateX(0); }
                }
            `}</style>
        </div>
    );
}

// ── Financial card style ──────────────────────────────────────────────────────
export const financialCard = {
    background:     F.bgCard,
    borderRadius:   12,
    border:         `1px solid ${F.border}`,
    backdropFilter: 'blur(12px)',
};

// ── Animated header divider — amber scan line ─────────────────────────────────
export function FinancialDivider() {
    return (
        <div style={{ position: 'relative', height: 1, background: F.border, marginTop: 16, overflow: 'hidden' }}>
            <div style={{
                position: 'absolute', top: 0, left: 0,
                height: '100%', width: '30%',
                background: `linear-gradient(90deg, transparent, ${F.amber}, ${F.green}, transparent)`,
                animation: 'scanLine 2.8s linear infinite',
            }} />
        </div>
    );
}

// ── Live ticker tape strip ────────────────────────────────────────────────────
// Shows live-ish market-style data — purely decorative
const TICKER_ITEMS = [
    'ORDERS +2.4%', 'PAYMENTS ▲ 847', 'VARIANCE KES 0.00', 'RECONCILED ✓',
    'SESSION OPEN', 'TISL LIVE', 'DIFF ENGINE v2', 'AUDIT TRAIL ON',
    'EXPORT READY', 'MISMATCHES: 0', 'CLEAN MATCH 100%', 'DATA ENGINE',
];

export function TickerTape() {
    const items = [...TICKER_ITEMS, ...TICKER_ITEMS]; // duplicate for seamless loop

    return (
        <div style={{
            overflow: 'hidden',
            borderTop:    `1px solid ${F.border}`,
            borderBottom: `1px solid ${F.border}`,
            padding: '5px 0',
            marginBottom: 28,
            background: 'rgba(0,0,0,0.2)',
            position: 'relative',
        }}>
            {/* Fade edges */}
            <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0, width: 48,
                background: 'linear-gradient(90deg, var(--color-background-tertiary), transparent)',
                zIndex: 1, pointerEvents: 'none',
            }} />
            <div style={{
                position: 'absolute', right: 0, top: 0, bottom: 0, width: 48,
                background: 'linear-gradient(-90deg, var(--color-background-tertiary), transparent)',
                zIndex: 1, pointerEvents: 'none',
            }} />

            <div style={{
                display: 'flex', gap: 40,
                animation: 'tickerScroll 30s linear infinite',
                width: 'max-content',
            }}>
                {items.map((item, i) => (
                    <span key={i} style={{
                        fontSize: '0.62rem', fontFamily: F.mono,
                        fontWeight: 700, letterSpacing: '0.1em',
                        color: item.includes('▲') || item.includes('+') || item.includes('✓') || item.includes('100%')
                            ? F.green
                            : item.includes('MISMATCH') || item.includes('VARIANCE')
                                ? F.amber
                                : F.textDim,
                        whiteSpace: 'nowrap',
                        textShadow: item.includes('▲') ? `0 0 6px ${F.green}` : 'none',
                    }}>
                        {item}
                    </span>
                ))}
            </div>
        </div>
    );
}

// ── Stat strip card ───────────────────────────────────────────────────────────
export function StatCard({ label, value, color, unit, sub }) {
    return (
        <div style={{
            ...financialCard,
            padding: '14px 18px',
            border: `1px solid ${color}22`,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{
                    fontSize: '0.6rem', fontWeight: 700, color: F.textDim,
                    textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: F.mono,
                }}>{label}</span>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color, lineHeight: 1, fontFamily: F.mono }}>
                    {value}
                </div>
                {unit && <span style={{ fontSize: '0.65rem', color: F.textDim, fontFamily: F.mono }}>{unit}</span>}
            </div>
            {sub && <div style={{ fontSize: '0.6rem', color: F.textDim, marginTop: 4, fontFamily: F.mono }}>{sub}</div>}
        </div>
    );
}

// ── Error banner ──────────────────────────────────────────────────────────────
export function ErrorBanner({ message, onDismiss }) {
    if (!message) return null;
    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, padding: '12px 16px', borderRadius: 8, marginBottom: 20,
            background: 'rgba(239,68,68,0.06)',
            border: `1px solid rgba(239,68,68,0.25)`,
            boxShadow: '0 0 14px rgba(239,68,68,0.08)',
            animation: 'fadeSlideIn 0.2s ease',
        }}>
            <span style={{ fontSize: '0.8rem', color: F.red, fontFamily: F.mono }}>⚠ {message}</span>
            {onDismiss && (
                <button onClick={onDismiss} style={{
                    background: 'none', border: 'none', color: F.red, cursor: 'pointer',
                    fontSize: '0.75rem', fontFamily: F.mono,
                }}>✕</button>
            )}
        </div>
    );
}

// ── Source table badge map ────────────────────────────────────────────────────
export const SOURCE_META = {
    orders:                       { label: 'Orders',              color: F.amber,  emoji: '🛒' },
    payments:                     { label: 'Payments',            color: F.green,  emoji: '💳' },
    auction_orders:               { label: 'Auction Orders',      color: F.teal,   emoji: '🔨' },
    hamper_orders:                { label: 'Hamper Orders',       color: '#a855f7',emoji: '🎁' },
    customer_credit_transactions: { label: 'Credit Transactions', color: F.gold,   emoji: '💰' },
};

export function SourceBadge({ source }) {
    const meta = SOURCE_META[source] || { label: source, color: F.amber, emoji: '📋' };
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 10px', borderRadius: 5,
            background: `${meta.color}12`,
            border: `1px solid ${meta.color}30`,
            fontSize: '0.65rem', fontWeight: 700,
            color: meta.color, fontFamily: F.mono,
            letterSpacing: '0.06em',
        }}>
            {meta.emoji} {meta.label.toUpperCase()}
        </span>
    );
}

// ── Status pill ───────────────────────────────────────────────────────────────
export function StatusPill({ status }) {
    const map = {
        clean:        { color: F.green,  label: 'CLEAN'        },
        mismatch:     { color: F.amber,  label: 'MISMATCH'     },
        only_in_tisl: { color: F.teal,   label: 'TISL ONLY'    },
        only_in_file: { color: '#a855f7',label: 'FILE ONLY'    },
        pending:      { color: F.amber,  label: 'PENDING'      },
        resolved:     { color: F.green,  label: 'RESOLVED'     },
    };
    const m = map[status] || { color: F.textDim, label: status?.toUpperCase() || 'UNKNOWN' };

    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 10px', borderRadius: 20,
            background: `${m.color}12`, border: `1px solid ${m.color}28`,
            fontSize: '0.6rem', fontWeight: 700, color: m.color,
            fontFamily: F.mono, letterSpacing: '0.08em',
        }}>
            <span style={{
                width: 5, height: 5, borderRadius: '50%', background: m.color,
                boxShadow: `0 0 4px ${m.color}`,
                animation: status === 'pending' ? 'pulse 2s ease-in-out infinite' : 'none',
                display: 'inline-block',
            }} />
            {m.label}
        </span>
    );
}
