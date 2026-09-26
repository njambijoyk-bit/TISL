import { useRef, useEffect } from 'react';
import { Volume2, VolumeX, ChevronRight } from 'lucide-react';

// ── Shared design tokens — theme-aware ────────────────────────────────────────
export const C = {
    bg:       'var(--color-background-tertiary)',
    bgCard:   'var(--color-background-secondary)',
    bgInput:  'var(--color-background-secondary)',
    blue:     '#3b82f6',
    cyan:     '#06b6d4',
    purple:   '#a855f7',
    green:    '#10b981',
    red:      '#ef4444',
    amber:    '#f59e0b',
    border:   'rgba(59,130,246,0.2)',
    borderHi: 'rgba(59,130,246,0.5)',
    text:     'var(--color-text-primary)',
    textMid:  'var(--color-text-secondary)',
    textDim:  'var(--color-text-tertiary)',
    glow:     '0 0 20px rgba(59,130,246,0.3)',
    glowCyan: '0 0 20px rgba(6,182,212,0.3)',
};

// ── Neural net animated canvas ────────────────────────────────────────────────
export function NeuralCanvas() {
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

        const NODE_COUNT = 28;
        const nodes = Array.from({ length: NODE_COUNT }, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            r:  Math.random() * 2.5 + 1,
            pulse: Math.random() * Math.PI * 2,
        }));
        const packets = [];
        let frame;

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            nodes.forEach(n => {
                n.x += n.vx; n.y += n.vy;
                if (n.x < 0 || n.x > canvas.width)  n.vx *= -1;
                if (n.y < 0 || n.y > canvas.height)  n.vy *= -1;
                n.pulse += 0.02;
            });

            const MAX_DIST = 180;
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const dx   = nodes[j].x - nodes[i].x;
                    const dy   = nodes[j].y - nodes[i].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > MAX_DIST) continue;
                    const alpha = (1 - dist / MAX_DIST) * 0.25;
                    ctx.beginPath();
                    ctx.moveTo(nodes[i].x, nodes[i].y);
                    ctx.lineTo(nodes[j].x, nodes[j].y);
                    ctx.strokeStyle = `rgba(59,130,246,${alpha})`;
                    ctx.lineWidth = 0.8;
                    ctx.stroke();
                    if (Math.random() < 0.0008) {
                        packets.push({ from: i, to: j, progress: 0, speed: Math.random() * 0.008 + 0.004, color: Math.random() > 0.5 ? '#06b6d4' : '#3b82f6' });
                    }
                }
            }

            for (let i = packets.length - 1; i >= 0; i--) {
                const p = packets[i];
                p.progress += p.speed;
                if (p.progress >= 1) { packets.splice(i, 1); continue; }
                const from = nodes[p.from]; const to = nodes[p.to];
                const px = from.x + (to.x - from.x) * p.progress;
                const py = from.y + (to.y - from.y) * p.progress;
                ctx.beginPath();
                ctx.arc(px, py, 2.5, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 8;
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            nodes.forEach(n => {
                const pulse = Math.sin(n.pulse) * 0.5 + 0.5;
                ctx.beginPath();
                ctx.arc(n.x, n.y, n.r + pulse, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(59,130,246,${0.4 + pulse * 0.4})`;
                ctx.shadowColor = '#3b82f6';
                ctx.shadowBlur  = 6 + pulse * 6;
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
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.4, pointerEvents: 'none' }}
        />
    );
}

// ── Scanline overlay ──────────────────────────────────────────────────────────
export function Scanlines() {
    return (
        <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
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
                padding: '6px 12px', borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: 'rgba(0,0,0,0.4)',
                color: C.textMid, cursor: 'pointer',
                fontSize: '0.72rem', fontFamily: 'monospace',
                backdropFilter: 'blur(8px)',
            }}
        >
            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            {muted ? 'SOUND OFF' : 'SOUND ON'}
        </button>
    );
}

// ── Neural breadcrumb ─────────────────────────────────────────────────────────
export function NeuralBreadcrumb({ items, onHover }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', marginBottom: 28, fontFamily: 'monospace' }}>
            {items.map((item, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {item.onClick ? (
                        <button
                            onClick={item.onClick}
                            onMouseEnter={onHover}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.cyan, fontWeight: 700, fontSize: '0.72rem', fontFamily: 'monospace', padding: 0, textShadow: `0 0 8px ${C.cyan}` }}
                        >
                            {item.label}
                        </button>
                    ) : (
                        <span style={{ color: C.text, fontWeight: 600 }}>{item.label}</span>
                    )}
                    {i < items.length - 1 && <ChevronRight size={11} style={{ color: C.textDim }} />}
                </span>
            ))}
        </div>
    );
}

// ── Shared page wrapper (neural bg + scanlines + mute btn) ────────────────────
export function NeuralPageShell({ audio, ambientOn, setAmbientOn, children }) {
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
                background: C.bg,
                color: C.text,
                fontFamily: "'DM Sans', sans-serif",
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            <NeuralCanvas />
            <Scanlines />
            <div style={{ position: 'relative', zIndex: 2, maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
                <div style={{ position: 'absolute', top: 0, right: 0 }}>
                    <MuteButton muted={audio.muted} onToggle={audio.toggleMute} onHover={audio.playHover} />
                </div>
                {children}
            </div>

            <style>{`
                @keyframes scanLine {
                    0%   { left: -30%; }
                    100% { left: 130%; }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50%       { opacity: 0.4; }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes fadeSlideIn {
                    from { opacity: 0; transform: translateY(6px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes flashBorder {
                    0%   { box-shadow: 0 0 0 0 rgba(168,85,247,0.4); }
                    50%  { box-shadow: 0 0 0 4px rgba(168,85,247,0.15); }
                    100% { box-shadow: none; }
                }
            `}</style>
        </div>
    );
}

// ── Neural card style ─────────────────────────────────────────────────────────
export const neuralCard = {
    background:   C.bgCard,
    borderRadius: 14,
    border:       `1px solid ${C.border}`,
    backdropFilter: 'blur(12px)',
};

// ── Animated header divider ───────────────────────────────────────────────────
export function NeuralDivider() {
    return (
        <div style={{ position: 'relative', height: 1, background: C.border, marginTop: 16, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: '30%', background: `linear-gradient(90deg, transparent, ${C.blue}, ${C.cyan}, transparent)`, animation: 'scanLine 3s linear infinite' }} />
        </div>
    );
}