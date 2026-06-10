import { useState } from 'react';
import { Database, Upload, Zap, ArrowRight, BarChart3, FileDown } from 'lucide-react';
import { F, financialCard, FinancialDivider, SOURCE_META } from './dataEngineShared';

export default function DataEngineIndex({ audio, onSelectExport, onSelectDiff }) {
    const [hoveredCard, setHoveredCard] = useState(null);

    const handleHover = (card) => {
        audio.playTick();
        setHoveredCard(card);
    };

    const handleSelect = (fn) => {
        audio.playMatch();
        fn();
    };

    return (
        <div style={{ animation: 'fadeSlideIn 0.3s ease' }}>
            {/* ── Header ── */}
            <div style={{ marginBottom: 36 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: `linear-gradient(135deg, ${F.amberGlow}, ${F.greenGlow})`,
                        border: `1px solid ${F.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Database size={20} style={{ color: F.amber }} />
                    </div>
                    <div>
                        <h1 style={{
                            margin: 0, fontSize: '1.45rem', fontWeight: 800,
                            fontFamily: F.mono, letterSpacing: '0.06em',
                            background: `linear-gradient(90deg, ${F.amber}, ${F.green})`,
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        }}>
                            DATA ENGINE
                        </h1>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: F.textDim, fontFamily: F.mono, letterSpacing: '0.04em' }}>
                            FINANCIAL RECONCILIATION SUITE v2
                        </p>
                    </div>
                </div>
                <FinancialDivider />
            </div>

            {/* ── Mode cards ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 40 }}>

                {/* Export mode */}
                <ModeCard
                    id="export"
                    hovered={hoveredCard === 'export'}
                    onHover={() => handleHover('export')}
                    onLeave={() => setHoveredCard(null)}
                    onClick={() => handleSelect(onSelectExport)}
                    icon={<FileDown size={28} style={{ color: F.green }} />}
                    accent={F.green}
                    accentGlow={F.greenGlow}
                    title="SMART EXPORT"
                    subtitle="Extract & download"
                    description="Pull clean, curated data from any TISL table for a date range. Pick your columns, export as CSV or JSON."
                    tags={['CSV', 'JSON', 'COLUMN PICKER']}
                    steps={['Select source & date range', 'Pick columns', 'Download']}
                    cta="OPEN EXPORT"
                />

                {/* Import + Diff mode */}
                <ModeCard
                    id="diff"
                    hovered={hoveredCard === 'diff'}
                    onHover={() => handleHover('diff')}
                    onLeave={() => setHoveredCard(null)}
                    onClick={() => handleSelect(onSelectDiff)}
                    icon={<Zap size={28} style={{ color: F.amber }} />}
                    accent={F.amber}
                    accentGlow={F.amberGlow}
                    title="IMPORT + DIFF"
                    subtitle="Compare & reconcile"
                    description="Upload an external file and run a field-level diff against live TISL data. Detect mismatches, missing records, and amount variances."
                    tags={['DIFF ENGINE', 'VARIANCE DETECT', 'PERSIST']}
                    steps={['Source & period', 'Upload file', 'Confirm identifier', 'Run diff', 'Review results']}
                    cta="START DIFF WIZARD"
                    badge="5-STEP WIZARD"
                />
            </div>

            {/* ── Supported sources strip ── */}
            <div style={{
                ...financialCard,
                padding: '16px 20px',
            }}>
                <div style={{
                    fontSize: '0.6rem', fontWeight: 700, color: F.textDim,
                    fontFamily: F.mono, letterSpacing: '0.1em', marginBottom: 12,
                }}>
                    SUPPORTED DATA SOURCES
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {Object.entries(SOURCE_META).map(([key, meta]) => (
                        <div
                            key={key}
                            onMouseEnter={audio.playHover}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '5px 12px', borderRadius: 6,
                                background: `${meta.color}0a`,
                                border: `1px solid ${meta.color}20`,
                                fontSize: '0.65rem', fontWeight: 600,
                                color: meta.color, fontFamily: F.mono,
                                letterSpacing: '0.06em',
                            }}
                        >
                            <span>{meta.emoji}</span>
                            <span>{meta.label.toUpperCase()}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── Mode card ─────────────────────────────────────────────────────────────────
function ModeCard({ id, hovered, onHover, onLeave, onClick, icon, accent, accentGlow, title, subtitle, description, tags, steps, cta, badge }) {
    return (
        <div
            onMouseEnter={onHover}
            onMouseLeave={onLeave}
            onClick={onClick}
            style={{
                ...financialCard,
                padding: '24px',
                border: `1px solid ${hovered ? accent + '55' : accent + '20'}`,
                boxShadow: hovered ? `0 0 28px ${accentGlow}` : 'none',
                cursor: 'pointer',
                transition: 'border-color 180ms, box-shadow 180ms',
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            {/* Top glow strip */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
                opacity: hovered ? 1 : 0.3,
                transition: 'opacity 180ms',
            }} />

            {/* Badge */}
            {badge && (
                <div style={{
                    position: 'absolute', top: 14, right: 14,
                    padding: '2px 8px', borderRadius: 4,
                    background: `${accent}18`, border: `1px solid ${accent}30`,
                    fontSize: '0.55rem', fontWeight: 800,
                    color: accent, fontFamily: F.mono, letterSpacing: '0.1em',
                }}>
                    {badge}
                </div>
            )}

            {/* Icon + title */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
                <div style={{
                    width: 48, height: 48, borderRadius: 10, flexShrink: 0,
                    background: `${accent}12`, border: `1px solid ${accent}28`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: hovered ? `0 0 16px ${accentGlow}` : 'none',
                    transition: 'box-shadow 180ms',
                }}>
                    {icon}
                </div>
                <div>
                    <div style={{
                        fontSize: '1rem', fontWeight: 800,
                        fontFamily: F.mono, letterSpacing: '0.08em',
                        color: accent, marginBottom: 2,
                        textShadow: hovered ? `0 0 12px ${accent}` : 'none',
                        transition: 'text-shadow 180ms',
                    }}>
                        {title}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: F.textMid, fontFamily: F.mono }}>
                        {subtitle}
                    </div>
                </div>
            </div>

            {/* Description */}
            <p style={{
                margin: '0 0 16px 0',
                fontSize: '0.78rem', color: F.textMid,
                lineHeight: 1.55, fontFamily: F.sans,
            }}>
                {description}
            </p>

            {/* Tags */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {tags.map(tag => (
                    <span key={tag} style={{
                        padding: '2px 8px', borderRadius: 4,
                        background: `${accent}0f`, border: `1px solid ${accent}22`,
                        fontSize: '0.58rem', fontWeight: 700,
                        color: accent + 'cc', fontFamily: F.mono, letterSpacing: '0.08em',
                    }}>
                        {tag}
                    </span>
                ))}
            </div>

            {/* Steps */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: 20 }}>
                {steps.map((step, i) => (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{
                            fontSize: '0.6rem', color: F.textDim,
                            fontFamily: F.mono, letterSpacing: '0.04em',
                        }}>
                            {step}
                        </span>
                        {i < steps.length - 1 && (
                            <span style={{ color: accent + '60', fontSize: '0.6rem' }}>›</span>
                        )}
                    </span>
                ))}
            </div>

            {/* CTA */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                paddingTop: 14,
                borderTop: `1px solid ${accent}18`,
            }}>
                <span style={{
                    fontSize: '0.7rem', fontWeight: 800,
                    color: accent, fontFamily: F.mono, letterSpacing: '0.1em',
                    textShadow: hovered ? `0 0 8px ${accent}` : 'none',
                    transition: 'text-shadow 180ms',
                }}>
                    {cta}
                </span>
                <ArrowRight
                    size={16}
                    style={{
                        color: accent,
                        transform: hovered ? 'translateX(4px)' : 'translateX(0)',
                        transition: 'transform 180ms',
                    }}
                />
            </div>
        </div>
    );
}
