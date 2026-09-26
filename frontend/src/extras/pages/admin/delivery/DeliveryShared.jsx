import { useRef, useEffect } from 'react';
import { Volume2, VolumeX, ChevronRight } from 'lucide-react';

// ── Design tokens — theme-aware, transparent bg ───────────────────────────────
export const D = {
    // accent
    purple:     '#a855f7',
    purpleDim:  'rgba(168,85,247,0.15)',
    purpleBorder:'rgba(168,85,247,0.25)',
    purpleGlow: '0 0 18px rgba(168,85,247,0.2)',
    teal:       '#14b8a6',
    tealDim:    'rgba(20,184,166,0.15)',

    // status colors (semantic, not from CSS vars so badges are consistent in both themes)
    statusColors: {
        // manifest
        draft:           { bg: 'rgba(100,116,139,0.15)', text: '#94a3b8',  border: 'rgba(100,116,139,0.3)'  },
        dispatched:      { bg: 'rgba(168,85,247,0.12)',  text: '#a855f7',  border: 'rgba(168,85,247,0.3)'   },
        in_progress:     { bg: 'rgba(245,158,11,0.12)',  text: '#f59e0b',  border: 'rgba(245,158,11,0.3)'   },
        completed:       { bg: 'rgba(20,184,166,0.12)',  text: '#14b8a6',  border: 'rgba(20,184,166,0.3)'   },
        cancelled:       { bg: 'rgba(239,68,68,0.12)',   text: '#ef4444',  border: 'rgba(239,68,68,0.3)'    },
        // delivery item
        pending:         { bg: 'rgba(100,116,139,0.15)', text: '#94a3b8',  border: 'rgba(100,116,139,0.3)'  },
        out_for_delivery:{ bg: 'rgba(168,85,247,0.12)',  text: '#a855f7',  border: 'rgba(168,85,247,0.3)'   },
        delivered:       { bg: 'rgba(20,184,166,0.12)',  text: '#14b8a6',  border: 'rgba(20,184,166,0.3)'   },
        failed:          { bg: 'rgba(239,68,68,0.12)',   text: '#ef4444',  border: 'rgba(239,68,68,0.3)'    },
        returned:        { bg: 'rgba(245,158,11,0.12)',  text: '#f59e0b',  border: 'rgba(245,158,11,0.3)'   },
        // shipment
        in_transit:      { bg: 'rgba(59,130,246,0.12)',  text: '#3b82f6',  border: 'rgba(59,130,246,0.3)'   },
        // incident
        open:            { bg: 'rgba(239,68,68,0.12)',   text: '#ef4444',  border: 'rgba(239,68,68,0.3)'    },
        under_review:    { bg: 'rgba(245,158,11,0.12)',  text: '#f59e0b',  border: 'rgba(245,158,11,0.3)'   },
        resolved:        { bg: 'rgba(20,184,166,0.12)',  text: '#14b8a6',  border: 'rgba(20,184,166,0.3)'   },
        dismissed:       { bg: 'rgba(100,116,139,0.15)', text: '#94a3b8',  border: 'rgba(100,116,139,0.3)'  },
    },

    // severity
    severityColors: {
        low:      { bg: 'rgba(20,184,166,0.12)',  text: '#14b8a6',  border: 'rgba(20,184,166,0.3)'  },
        medium:   { bg: 'rgba(245,158,11,0.12)',  text: '#f59e0b',  border: 'rgba(245,158,11,0.3)'  },
        high:     { bg: 'rgba(249,115,22,0.12)',  text: '#f97316',  border: 'rgba(249,115,22,0.3)'  },
        critical: { bg: 'rgba(239,68,68,0.12)',   text: '#ef4444',  border: 'rgba(239,68,68,0.3)'   },
    },

    // theme-aware
    text:     'var(--color-text-primary)',
    textMid:  'var(--color-text-secondary)',
    textDim:  'var(--color-text-tertiary)',
    card:     'var(--color-background-secondary)',
    border:   'var(--color-border-tertiary)',
    borderMd: 'var(--color-border-secondary)',

    // spacing / radius
    radius:   10,
    radiusSm: 6,
    radiusLg: 14,
};

// ── Logistics network canvas (option C) ───────────────────────────────────────
// Nodes = delivery stops / intersections
// Edges = roads (faint grid-ish lines)
// Traveling packets = packages in transit
export function LogisticsCanvas() {
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

        // Fewer nodes on small screens
        const nodeCount = canvas.width < 480 ? 14 : 22;

        const nodes = Array.from({ length: nodeCount }, () => ({
            x:     Math.random() * canvas.width,
            y:     Math.random() * canvas.height,
            vx:    (Math.random() - 0.5) * 0.25,
            vy:    (Math.random() - 0.5) * 0.25,
            r:     Math.random() * 2 + 1.5,
            pulse: Math.random() * Math.PI * 2,
            // some nodes are "major hubs" (slightly larger)
            hub:   Math.random() < 0.2,
        }));

        const packets = [];
        let frame;

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Move nodes
            nodes.forEach(n => {
                n.x += n.vx; n.y += n.vy;
                if (n.x < 0 || n.x > canvas.width)  n.vx *= -1;
                if (n.y < 0 || n.y > canvas.height)  n.vy *= -1;
                n.pulse += 0.018;
            });

            // Draw edges (roads)
            const MAX_DIST = canvas.width < 480 ? 130 : 160;
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const dx   = nodes[j].x - nodes[i].x;
                    const dy   = nodes[j].y - nodes[i].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > MAX_DIST) continue;

                    const alpha = (1 - dist / MAX_DIST) * 0.18;
                    ctx.beginPath();
                    ctx.moveTo(nodes[i].x, nodes[i].y);
                    ctx.lineTo(nodes[j].x, nodes[j].y);
                    ctx.strokeStyle = `rgba(168,85,247,${alpha})`;
                    ctx.lineWidth = 0.7;
                    ctx.stroke();

                    // Spawn a traveling packet (package)
                    if (Math.random() < 0.0006) {
                        packets.push({
                            from:     i,
                            to:       j,
                            progress: 0,
                            speed:    Math.random() * 0.007 + 0.003,
                            // alternate purple and teal to suggest different delivery types
                            color:    Math.random() > 0.4 ? '#a855f7' : '#14b8a6',
                        });
                    }
                }
            }

            // Draw packets (traveling deliveries)
            for (let i = packets.length - 1; i >= 0; i--) {
                const p = packets[i];
                p.progress += p.speed;
                if (p.progress >= 1) { packets.splice(i, 1); continue; }

                const from = nodes[p.from];
                const to   = nodes[p.to];
                const px   = from.x + (to.x - from.x) * p.progress;
                const py   = from.y + (to.y - from.y) * p.progress;

                // Draw a small square (package) instead of circle
                const size = 2.5;
                ctx.save();
                ctx.translate(px, py);
                // rotate in direction of travel
                ctx.rotate(Math.atan2(to.y - from.y, to.x - from.x));
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur  = 7;
                ctx.fillRect(-size / 2, -size / 2, size, size);
                ctx.shadowBlur = 0;
                ctx.restore();
            }

            // Draw nodes (stops / intersections)
            nodes.forEach(n => {
                const pulse = Math.sin(n.pulse) * 0.5 + 0.5;
                const r     = (n.hub ? n.r * 1.6 : n.r) + pulse * 0.8;

                ctx.beginPath();
                ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
                ctx.fillStyle = n.hub
                    ? `rgba(168,85,247,${0.5 + pulse * 0.4})`
                    : `rgba(168,85,247,${0.3 + pulse * 0.3})`;
                ctx.shadowColor = '#a855f7';
                ctx.shadowBlur  = n.hub ? 10 + pulse * 8 : 5 + pulse * 4;
                ctx.fill();
                ctx.shadowBlur = 0;
            });

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
            style={{
                position:      'absolute',
                inset:         0,
                width:         '100%',
                height:        '100%',
                opacity:       0.35,
                pointerEvents: 'none',
            }}
        />
    );
}

// ── Mute button ───────────────────────────────────────────────────────────────
export function MuteButton({ muted, onToggle, onHover }) {
    return (
        <button
            onClick={e => { e.stopPropagation(); onToggle(); }}
            onMouseEnter={onHover}
            style={{
                display:        'flex',
                alignItems:     'center',
                gap:            6,
                padding:        '5px 10px',
                borderRadius:   D.radiusSm,
                border:         `1px solid ${D.purpleBorder}`,
                background:     'var(--color-background-secondary)',
                color:          D.textMid,
                cursor:         'pointer',
                fontSize:       '0.72rem',
            }}
        >
            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            <span>{muted ? 'Sound off' : 'Sound on'}</span>
        </button>
    );
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────
export function DeliveryBreadcrumb({ items, onHover }) {
    return (
        <div style={{
            display:     'flex',
            alignItems:  'center',
            flexWrap:    'wrap',
            gap:         4,
            fontSize:    '0.78rem',
            marginBottom: 20,
            color:       D.textMid,
        }}>
            {items.map((item, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {item.onClick ? (
                        <button
                            onClick={item.onClick}
                            onMouseEnter={onHover}
                            style={{
                                background: 'none',
                                border:     'none',
                                cursor:     'pointer',
                                color:      D.purple,
                                fontWeight: 600,
                                fontSize:   '0.78rem',
                                padding:    0,
                            }}
                        >
                            {item.label}
                        </button>
                    ) : (
                        <span style={{ color: D.text, fontWeight: 500 }}>{item.label}</span>
                    )}
                    {i < items.length - 1 && (
                        <ChevronRight size={12} style={{ color: D.textDim }} />
                    )}
                </span>
            ))}
        </div>
    );
}

// ── Page shell ────────────────────────────────────────────────────────────────
// transparent bg — site theme shows through
// canvas sits behind everything
export function DeliveryPageShell({ audio, children }) {
    return (
        <div style={{
            minHeight:  '100vh',
            position:   'relative',
            overflow:   'hidden',
            color:      D.text,
        }}>
            <LogisticsCanvas />

            <div style={{
                position:  'relative',
                zIndex:    2,
                maxWidth:  1000,
                margin:    '0 auto',
                padding:   'clamp(16px, 4vw, 32px) clamp(12px, 3vw, 24px)',
            }}>
                {/* Mute button top-right */}
                {audio && (
                    <div style={{ position: 'absolute', top: 0, right: 'clamp(12px, 3vw, 24px)' }}>
                        <MuteButton
                            muted={audio.muted}
                            onToggle={audio.toggleMute}
                            onHover={audio.playHover}
                        />
                    </div>
                )}
                {children}
            </div>
        </div>
    );
}

// ── Delivery card ─────────────────────────────────────────────────────────────
export function DeliveryCard({ children, style = {}, onClick, hoverable = false }) {
    const base = {
        background:   D.card,
        borderRadius: D.radiusLg,
        border:       `1px solid ${D.purpleBorder}`,
        padding:      'clamp(14px, 3vw, 20px)',
        transition:   'box-shadow 0.2s, border-color 0.2s',
    };
    const hover = hoverable ? {
        cursor:      'pointer',
        boxShadow:   D.purpleGlow,
        borderColor: D.purple,
    } : {};

    return (
        <div
            onClick={onClick}
            style={{ ...base, ...style }}
            onMouseEnter={e => { if (hoverable) Object.assign(e.currentTarget.style, hover); }}
            onMouseLeave={e => { if (hoverable) { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.borderColor = D.purpleBorder; } }}
        >
            {children}
        </div>
    );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
export function StatCard({ label, value, sub, icon: Icon, accent = D.purple, style = {} }) {
    return (
        <div style={{
            background:   D.card,
            borderRadius: D.radiusLg,
            border:       `1px solid ${D.purpleBorder}`,
            padding:      'clamp(14px, 3vw, 20px)',
            display:      'flex',
            flexDirection:'column',
            gap:          6,
            ...style,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', color: D.textMid, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {label}
                </span>
                {Icon && (
                    <div style={{
                        width: 32, height: 32, borderRadius: D.radiusSm,
                        background: `rgba(${accent === D.purple ? '168,85,247' : '20,184,166'},0.12)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Icon size={16} color={accent} />
                    </div>
                )}
            </div>
            <div style={{ fontSize: 'clamp(1.4rem, 4vw, 1.9rem)', fontWeight: 700, color: D.text, lineHeight: 1.1 }}>
                {value}
            </div>
            {sub && (
                <div style={{ fontSize: '0.75rem', color: D.textDim }}>{sub}</div>
            )}
        </div>
    );
}

// ── Status badge ──────────────────────────────────────────────────────────────
export function StatusBadge({ status, style = {} }) {
    const colors = D.statusColors[status] ?? {
        bg: 'rgba(100,116,139,0.15)', text: '#94a3b8', border: 'rgba(100,116,139,0.3)',
    };
    const label = status?.replace(/_/g, ' ') ?? '—';

    return (
        <span style={{
            display:      'inline-flex',
            alignItems:   'center',
            padding:      '2px 9px',
            borderRadius: 20,
            fontSize:     '0.7rem',
            fontWeight:   600,
            letterSpacing:'0.04em',
            textTransform:'uppercase',
            background:   colors.bg,
            color:        colors.text,
            border:       `1px solid ${colors.border}`,
            whiteSpace:   'nowrap',
            ...style,
        }}>
            {label}
        </span>
    );
}

// ── Severity badge ────────────────────────────────────────────────────────────
export function SeverityBadge({ severity, style = {} }) {
    const colors = D.severityColors[severity] ?? {
        bg: 'rgba(100,116,139,0.15)', text: '#94a3b8', border: 'rgba(100,116,139,0.3)',
    };

    return (
        <span style={{
            display:      'inline-flex',
            alignItems:   'center',
            padding:      '2px 9px',
            borderRadius: 20,
            fontSize:     '0.7rem',
            fontWeight:   600,
            letterSpacing:'0.04em',
            textTransform:'uppercase',
            background:   colors.bg,
            color:        colors.text,
            border:       `1px solid ${colors.border}`,
            whiteSpace:   'nowrap',
            ...style,
        }}>
            {severity ?? '—'}
        </span>
    );
}

// ── Stop progress bar ─────────────────────────────────────────────────────────
// shows delivered / failed / pending as a segmented bar
export function StopProgressBar({ total = 0, delivered = 0, failed = 0, style = {} }) {
    if (total === 0) return null;
    const pending  = total - delivered - failed;
    const pct      = n => `${Math.round((n / total) * 100)}%`;

    return (
        <div style={{ ...style }}>
            <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', height: 6, background: 'var(--color-border-tertiary)' }}>
                {delivered > 0 && (
                    <div style={{ width: pct(delivered), background: D.teal, transition: 'width 0.4s' }} title={`${delivered} delivered`} />
                )}
                {failed > 0 && (
                    <div style={{ width: pct(failed), background: '#ef4444', transition: 'width 0.4s' }} title={`${failed} failed`} />
                )}
                {pending > 0 && (
                    <div style={{ width: pct(pending), background: 'var(--color-border-secondary)', transition: 'width 0.4s' }} title={`${pending} pending`} />
                )}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 5, fontSize: '0.68rem', color: D.textDim }}>
                <span style={{ color: D.teal }}>{delivered} delivered</span>
                {failed > 0 && <span style={{ color: '#ef4444' }}>{failed} failed</span>}
                <span>{pending} pending</span>
            </div>
        </div>
    );
}

// ── Driver avatar ─────────────────────────────────────────────────────────────
export function DriverAvatar({ name, photo, size = 34 }) {
    const initial = name ? name.charAt(0).toUpperCase() : '?';

    if (photo) {
        return (
            <img
                src={photo}
                alt={name}
                style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${D.purpleBorder}`, flexShrink: 0 }}
            />
        );
    }

    return (
        <div style={{
            width:           size,
            height:          size,
            borderRadius:    '50%',
            background:      D.purpleDim,
            border:          `2px solid ${D.purpleBorder}`,
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            fontSize:        size * 0.38,
            fontWeight:      700,
            color:           D.purple,
            flexShrink:      0,
        }}>
            {initial}
        </div>
    );
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function DeliveryEmptyState({ icon: Icon, title, sub, action }) {
    return (
        <div style={{
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            padding:        'clamp(32px, 8vw, 64px) 24px',
            gap:            12,
            textAlign:      'center',
        }}>
            {Icon && (
                <div style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: D.purpleDim,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 4,
                }}>
                    <Icon size={24} color={D.purple} />
                </div>
            )}
            <div style={{ fontSize: '1rem', fontWeight: 600, color: D.text }}>{title}</div>
            {sub && <div style={{ fontSize: '0.82rem', color: D.textDim, maxWidth: 280 }}>{sub}</div>}
            {action && <div style={{ marginTop: 8 }}>{action}</div>}
        </div>
    );
}

// ── Section divider with label ────────────────────────────────────────────────
export function DeliveryDivider({ label }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '24px 0 16px' }}>
            {label && (
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: D.purple, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                    {label}
                </span>
            )}
            <div style={{ flex: 1, height: 1, background: D.purpleBorder }} />
        </div>
    );
}

// ── Star rating display ───────────────────────────────────────────────────────
export function StarRating({ value = 0, max = 5, size = 14 }) {
    return (
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            {Array.from({ length: max }, (_, i) => (
                <span
                    key={i}
                    style={{
                        fontSize: size,
                        color:    i < Math.round(value) ? '#f59e0b' : 'var(--color-border-secondary)',
                        lineHeight: 1,
                    }}
                >
                    ★
                </span>
            ))}
            <span style={{ fontSize: size * 0.85, color: D.textDim, marginLeft: 4 }}>{Number(value).toFixed(1)}</span>
        </div>
    );
}

// ── Responsive stats grid helper ──────────────────────────────────────────────
// Use as a wrapper for StatCard rows
export function StatsGrid({ children, cols = 4 }) {
    return (
        <div style={{
            display:             'grid',
            gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.floor(900 / cols)}px), 1fr))`,
            gap:                 'clamp(10px, 2vw, 16px)',
            marginBottom:        'clamp(16px, 3vw, 24px)',
        }}>
            {children}
        </div>
    );
}

// ── Page header ───────────────────────────────────────────────────────────────
export function DeliveryPageHeader({ title, sub, actions }) {
    return (
        <div style={{
            display:        'flex',
            alignItems:     'flex-start',
            justifyContent: 'space-between',
            flexWrap:       'wrap',
            gap:            12,
            marginBottom:   'clamp(16px, 3vw, 28px)',
        }}>
            <div>
                <h1 style={{ fontSize: 'clamp(1.2rem, 4vw, 1.6rem)', fontWeight: 700, color: D.text, margin: 0, lineHeight: 1.2 }}>
                    {title}
                </h1>
                {sub && (
                    <p style={{ fontSize: '0.82rem', color: D.textMid, margin: '4px 0 0' }}>{sub}</p>
                )}
            </div>
            {actions && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {actions}
                </div>
            )}
        </div>
    );
}

// ── Primary action button ─────────────────────────────────────────────────────
export function DeliveryBtn({ children, onClick, onHover, variant = 'primary', disabled = false, size = 'md', style = {} }) {
    const sizes = {
        sm: { padding: '5px 12px', fontSize: '0.78rem' },
        md: { padding: '8px 16px', fontSize: '0.85rem' },
        lg: { padding: '10px 22px', fontSize: '0.92rem' },
    };
    const variants = {
        primary: {
            background: D.purple,
            color:      '#fff',
            border:     `1px solid ${D.purple}`,
        },
        secondary: {
            background: D.purpleDim,
            color:      D.purple,
            border:     `1px solid ${D.purpleBorder}`,
        },
        ghost: {
            background: 'transparent',
            color:      D.textMid,
            border:     `1px solid ${D.purpleBorder}`,
        },
        danger: {
            background: 'rgba(239,68,68,0.12)',
            color:      '#ef4444',
            border:     '1px solid rgba(239,68,68,0.3)',
        },
    };

    return (
        <button
            onClick={onClick}
            onMouseEnter={onHover}
            disabled={disabled}
            style={{
                ...sizes[size],
                ...variants[variant],
                borderRadius: D.radiusSm,
                fontWeight:   600,
                cursor:       disabled ? 'not-allowed' : 'pointer',
                opacity:      disabled ? 0.5 : 1,
                transition:   'opacity 0.15s, box-shadow 0.15s',
                display:      'inline-flex',
                alignItems:   'center',
                gap:          6,
                whiteSpace:   'nowrap',
                ...style,
            }}
        >
            {children}
        </button>
    );
}
