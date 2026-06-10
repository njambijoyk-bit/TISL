import { useState } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { F, financialCard, FinancialDivider, ErrorBanner, SOURCE_META } from './dataEngineShared';

export default function DataEngineSourceStep({
    audio,
    source, setSource,
    periodStart, setPeriodStart,
    periodEnd, setPeriodEnd,
    onNext, onBack,
}) {
    const [error, setError] = useState('');

    const handleNext = () => {
        if (!source) {
            setError('Select a source table to continue.');
            audio.playError();
            return;
        }
        if (!periodStart || !periodEnd) {
            setError('Both start and end dates are required.');
            audio.playError();
            return;
        }
        if (periodEnd < periodStart) {
            setError('End date must be on or after start date.');
            audio.playError();
            return;
        }
        audio.playUpload();
        setError('');
        onNext();
    };

    return (
        <div style={{ animation: 'fadeSlideIn 0.3s ease' }}>
            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <button
                    onClick={() => { audio.playDelete(); onBack(); }}
                    onMouseEnter={audio.playHover}
                    style={backBtnStyle}
                >
                    <ChevronLeft size={13} /> BACK
                </button>
                <div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: F.amber, fontFamily: F.mono, letterSpacing: '0.06em' }}>
                        STEP 1 — SOURCE
                    </div>
                    <div style={{ fontSize: '0.62rem', color: F.textDim, fontFamily: F.mono }}>
                        Choose the data table and reconciliation period
                    </div>
                </div>
            </div>

            <FinancialDivider />
            <div style={{ marginBottom: 24 }} />

            <ErrorBanner message={error} onDismiss={() => setError('')} />

            <div style={{ ...financialCard, padding: '28px' }}>
                {/* Source table */}
                <SectionLabel>SOURCE TABLE</SectionLabel>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap: 10,
                    marginBottom: 32,
                }}>
                    {Object.entries(SOURCE_META).map(([key, meta]) => {
                        const active = source === key;
                        return (
                            <button
                                key={key}
                                onClick={() => { audio.playTick(); setSource(key); setError(''); }}
                                onMouseEnter={audio.playHover}
                                style={{
                                    padding: '14px 16px',
                                    borderRadius: 9,
                                    border: `1px solid ${active ? meta.color + '60' : F.border}`,
                                    background: active ? `${meta.color}14` : 'rgba(0,0,0,0.25)',
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    boxShadow: active ? `0 0 18px ${meta.color}20` : 'none',
                                    transition: 'all 160ms',
                                    textAlign: 'left',
                                    position: 'relative',
                                    overflow: 'hidden',
                                }}
                            >
                                {/* top accent line */}
                                <div style={{
                                    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                                    background: meta.color,
                                    opacity: active ? 0.7 : 0,
                                    transition: 'opacity 160ms',
                                }} />
                                <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{meta.emoji}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontSize: '0.65rem', fontWeight: 700,
                                        color: active ? meta.color : F.textMid,
                                        fontFamily: F.mono, letterSpacing: '0.06em',
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {meta.label.toUpperCase()}
                                    </div>
                                    <div style={{
                                        fontSize: '0.55rem', color: F.textDim,
                                        fontFamily: F.mono, marginTop: 2,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {key}
                                    </div>
                                </div>
                                {active && (
                                    <div style={{
                                        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                                        background: meta.color,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <Check size={10} style={{ color: '#000' }} />
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Date range */}
                <SectionLabel>RECONCILIATION PERIOD</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
                    <DateInput
                        label="FROM"
                        value={periodStart}
                        max={periodEnd || undefined}
                        onChange={v => { audio.playTick(); setPeriodStart(v); }}
                    />
                    <DateInput
                        label="TO"
                        value={periodEnd}
                        min={periodStart || undefined}
                        onChange={v => { audio.playTick(); setPeriodEnd(v); }}
                    />
                </div>

                {/* Period summary */}
                {periodStart && periodEnd && (
                    <div style={{
                        padding: '10px 14px', borderRadius: 7, marginBottom: 28,
                        background: 'rgba(245,158,11,0.05)',
                        border: `1px solid ${F.border}`,
                        display: 'flex', alignItems: 'center', gap: 10,
                        animation: 'fadeIn 0.2s ease',
                    }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: F.amber, flexShrink: 0 }} />
                        <span style={{ fontSize: '0.68rem', color: F.textMid, fontFamily: F.mono }}>
                            Period: <span style={{ color: F.amber }}>{periodStart}</span>
                            {' '}→{' '}
                            <span style={{ color: F.amber }}>{periodEnd}</span>
                            {' · '}
                            <span style={{ color: F.textDim }}>
                                {daysBetween(periodStart, periodEnd)} day{daysBetween(periodStart, periodEnd) !== 1 ? 's' : ''}
                            </span>
                        </span>
                    </div>
                )}

                {/* Continue */}
                <button
                    onClick={handleNext}
                    onMouseEnter={audio.playHover}
                    disabled={!source || !periodStart || !periodEnd}
                    style={{
                        width: '100%', padding: '13px',
                        borderRadius: 8,
                        border: `1px solid ${(!source || !periodStart || !periodEnd) ? F.border : F.amber + '55'}`,
                        background: (!source || !periodStart || !periodEnd) ? 'rgba(0,0,0,0.2)' : `${F.amber}18`,
                        color: (!source || !periodStart || !periodEnd) ? F.textDim : F.amber,
                        fontSize: '0.75rem', fontWeight: 800,
                        fontFamily: F.mono, letterSpacing: '0.1em',
                        cursor: (!source || !periodStart || !periodEnd) ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        transition: 'all 150ms',
                    }}
                >
                    UPLOAD FILE <ChevronRight size={14} />
                </button>
            </div>
        </div>
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysBetween(a, b) {
    const diff = new Date(b) - new Date(a);
    return Math.max(0, Math.round(diff / 86400000) + 1);
}

function SectionLabel({ children }) {
    return (
        <div style={{
            fontSize: '0.6rem', fontWeight: 700, color: F.textDim,
            fontFamily: F.mono, letterSpacing: '0.1em',
            marginBottom: 10, textTransform: 'uppercase',
        }}>
            {children}
        </div>
    );
}

function DateInput({ label, value, onChange, min, max }) {
    return (
        <div>
            <div style={{ fontSize: '0.58rem', color: F.textDim, fontFamily: F.mono, marginBottom: 6, letterSpacing: '0.08em' }}>
                {label}
            </div>
            <input
                type="date"
                value={value}
                min={min}
                max={max}
                onChange={e => onChange(e.target.value)}
                style={{
                    width: '100%', padding: '10px 12px',
                    borderRadius: 7, border: `1px solid ${value ? F.amber + '40' : F.border}`,
                    background: 'rgba(0,0,0,0.3)',
                    color: F.text, fontFamily: F.mono, fontSize: '0.78rem',
                    outline: 'none', boxSizing: 'border-box',
                    colorScheme: 'dark',
                    transition: 'border-color 150ms',
                }}
            />
        </div>
    );
}

const backBtnStyle = {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'none', border: `1px solid ${F.border}`,
    color: F.textMid, cursor: 'pointer', padding: '6px 12px',
    borderRadius: 6, fontSize: '0.68rem', fontFamily: F.mono,
    flexShrink: 0,
};
