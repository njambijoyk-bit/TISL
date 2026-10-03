import { Volume2, VolumeX, ChevronRight } from 'lucide-react';

// ── Shared design tokens — theme-aware ────────────────────────────────────────
export const C = {
    bg:       'var(--bg-primary)',
    bgCard:   'var(--surface-card, #fff)',
    bgInput:  'var(--surface-input)',
    blue:     'var(--color-primary-500)',
    cyan:     'var(--color-primary-500)',
    purple:   'var(--color-primary-500)',
    green:    '#10b981',
    red:      '#ef4444',
    amber:    '#f59e0b',
    border:   'color-mix(in srgb, var(--color-primary-500) 18%, transparent)',
    borderHi: 'color-mix(in srgb, var(--color-primary-500) 45%, transparent)',
    text:     'var(--color-text-primary)',
    textMid:  'var(--color-text-secondary)',
    textDim:  'var(--color-text-tertiary)',
    glow:     'none',
    glowCyan: 'none',
};

// The animated neural background and scanlines are gone: these pages now look like the rest of the admin.
export function NeuralCanvas() { return null; }
export function Scanlines() { return null; }

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
                background: C.bgCard,
                color: C.textMid, cursor: 'pointer',
                fontSize: '0.72rem', fontFamily: 'inherit',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', marginBottom: 28, fontFamily: 'inherit' }}>
            {items.map((item, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {item.onClick ? (
                        <button
                            onClick={item.onClick}
                            onMouseEnter={onHover}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.cyan, fontWeight: 700, fontSize: '0.72rem', fontFamily: 'inherit', padding: 0 }}
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
                color: C.text,
                position: 'relative',
            }}
        >
            <NeuralCanvas />
            <Scanlines />
            <div style={{ position: 'relative', maxWidth: 960, margin: '0 auto', padding: '8px 0 32px' }}>
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
                    0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-primary-500) 40%, transparent); }
                    50%  { box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-primary-500) 15%, transparent); }
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