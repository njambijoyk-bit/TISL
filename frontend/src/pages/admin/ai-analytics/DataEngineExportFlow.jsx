import { useState, useCallback } from 'react';
import { FileDown, ChevronLeft, Check, Loader2 } from 'lucide-react';
import { F, financialCard, FinancialDivider, ErrorBanner, SourceBadge, SOURCE_META } from './dataEngineShared';
import { dataEngineAPI } from '../../../api'; 

const SOURCES = Object.keys(SOURCE_META);
const STEP = { CONFIG: 'config', COLUMNS: 'columns' };

export default function DataEngineExportFlow({ audio, onBack }) {
    const [step,         setStep]        = useState(STEP.CONFIG);

    const [source,       setSource]      = useState('');
    const [periodStart,  setPeriodStart] = useState('');
    const [periodEnd,    setPeriodEnd]   = useState('');
    const [format,       setFormat]      = useState('csv');

    const [columns,      setColumns]     = useState([]);
    const [identifier,   setIdentifier]  = useState('');
    const [selected,     setSelected]    = useState([]);

    const [loadingCols,  setLoadingCols] = useState(false);
    const [downloading,  setDownloading] = useState(false);
    const [error,        setError]       = useState('');

    // ── Safe audio helpers (guards against missing methods) ───────────────
    const safePlay = (fn) => { try { fn?.(); } catch (_) {} };

    // ── Fetch columns ─────────────────────────────────────────────────────
    const fetchColumns = useCallback(async (src) => {
        setLoadingCols(true);
        setError('');
        setColumns([]);
        setSelected([]);
        try {
            const res = await dataEngineAPI.getExportColumns(src);
            const cols = res.data.columns || [];
            const id   = res.data.identifier || '';
            setColumns(cols);
            setIdentifier(id);
            setSelected([...cols]); // select all by default
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load columns.');
            safePlay(audio.playError);
            // Stay on COLUMNS step so the error is visible — don't bounce back
        } finally {
            setLoadingCols(false);
        }
    }, [audio]);

    const handleNextToColumns = async () => {
        if (!source || !periodStart || !periodEnd) {
            setError('Please fill in all fields.');
            safePlay(audio.playError);
            return;
        }
        setError('');
        safePlay(audio.playUpload);
        setStep(STEP.COLUMNS);     // show the step immediately (loading state handles UX)
        await fetchColumns(source); // await so errors surface in the right step
    };

    // ── Column toggles ────────────────────────────────────────────────────
    const toggleCol = (col) => {
        if (col === identifier) return;
        safePlay(audio.playTick);
        setSelected(prev =>
            prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
        );
    };

    const selectAll  = () => { safePlay(audio.playTick); setSelected([...columns]); };
    const selectNone = () => { safePlay(audio.playTick); setSelected(identifier ? [identifier] : []); };

    // ── Download ──────────────────────────────────────────────────────────
    const handleDownload = async () => {
        if (selected.length === 0) return;
        setDownloading(true);
        setError('');
        safePlay(audio.playUpload);

        try {
            const res = await dataEngineAPI.exportData({
                source,
                period_start: periodStart,
                period_end:   periodEnd,
                format,
                columns: selected,
            });

            const filename = `${source}_${periodStart}_${periodEnd}`;

            if (format === 'csv') {
                triggerDownload(new Blob([res.data]), `${filename}.csv`);
            } else {
                triggerDownload(
                    new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' }),
                    `${filename}.json`
                );
            }

            safePlay(audio.playMatch);
        } catch (e) {
            const msg = e.response?.data?.message
                ?? (e.response?.data instanceof Blob ? await blobToText(e.response.data) : null)
                ?? 'Export failed.';
            setError(msg);
            safePlay(audio.playError);
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div style={{ animation: 'fadeSlideIn 0.3s ease' }}>
            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <button
                    onClick={() => {
                        safePlay(audio.playDelete);
                        step === STEP.COLUMNS ? setStep(STEP.CONFIG) : onBack();
                    }}
                    onMouseEnter={() => safePlay(audio.playHover)}
                    style={backBtnStyle}
                >
                    <ChevronLeft size={13} /> BACK
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FileDown size={20} style={{ color: F.green }} />
                    <div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: F.green, fontFamily: F.mono, letterSpacing: '0.06em' }}>
                            SMART EXPORT
                        </div>
                        <div style={{ fontSize: '0.62rem', color: F.textDim, fontFamily: F.mono }}>
                            {step === STEP.CONFIG ? 'CONFIGURE SOURCE' : 'SELECT COLUMNS'}
                        </div>
                    </div>
                </div>

                {/* Step dots */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    {[STEP.CONFIG, STEP.COLUMNS].map((s, i) => (
                        <div key={s} style={{
                            width: 28, height: 4, borderRadius: 2,
                            background: step === s
                                ? F.green
                                : i < [STEP.CONFIG, STEP.COLUMNS].indexOf(step)
                                    ? F.greenDim
                                    : F.border,
                            transition: 'background 200ms',
                        }} />
                    ))}
                </div>
            </div>

            <FinancialDivider />
            <div style={{ marginBottom: 24 }} />

            <ErrorBanner message={error} onDismiss={() => setError('')} />

            {/* ── Step 1: Config ── */}
            {step === STEP.CONFIG && (
                <div style={{ ...financialCard, padding: '28px' }}>
                    <SectionLabel>SOURCE TABLE</SectionLabel>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 28 }}>
                        {SOURCES.map(src => {
                            const meta   = SOURCE_META[src];
                            const active = source === src;
                            return (
                                <button
                                    key={src}
                                    onClick={() => { safePlay(audio.playTick); setSource(src); }}
                                    onMouseEnter={() => safePlay(audio.playHover)}
                                    style={{
                                        padding: '12px 14px', borderRadius: 8,
                                        border: `1px solid ${active ? meta.color + '55' : F.border}`,
                                        background: active ? `${meta.color}12` : 'rgba(0,0,0,0.25)',
                                        cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        boxShadow: active ? `0 0 14px ${meta.color}22` : 'none',
                                        transition: 'all 150ms',
                                    }}
                                >
                                    <span style={{ fontSize: '1rem' }}>{meta.emoji}</span>
                                    <span style={{
                                        fontSize: '0.65rem', fontWeight: 700,
                                        color: active ? meta.color : F.textMid,
                                        fontFamily: F.mono, letterSpacing: '0.06em',
                                    }}>
                                        {meta.label.toUpperCase()}
                                    </span>
                                    {active && <Check size={11} style={{ color: meta.color, marginLeft: 'auto' }} />}
                                </button>
                            );
                        })}
                    </div>

                    <SectionLabel>DATE RANGE</SectionLabel>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 28 }}>
                        <DateInput label="FROM" value={periodStart} onChange={v => { safePlay(audio.playTick); setPeriodStart(v); }} />
                        <DateInput label="TO"   value={periodEnd}   onChange={v => { safePlay(audio.playTick); setPeriodEnd(v); }} />
                    </div>

                    <SectionLabel>FORMAT</SectionLabel>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 32 }}>
                        {['csv', 'json'].map(fmt => (
                            <button
                                key={fmt}
                                onClick={() => { safePlay(audio.playTick); setFormat(fmt); }}
                                onMouseEnter={() => safePlay(audio.playHover)}
                                style={{
                                    padding: '8px 20px', borderRadius: 6,
                                    border: `1px solid ${format === fmt ? F.green + '55' : F.border}`,
                                    background: format === fmt ? `${F.green}12` : 'rgba(0,0,0,0.2)',
                                    color: format === fmt ? F.green : F.textMid,
                                    fontSize: '0.7rem', fontWeight: 700,
                                    fontFamily: F.mono, cursor: 'pointer',
                                    transition: 'all 150ms',
                                }}
                            >
                                .{fmt.toUpperCase()}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={handleNextToColumns}
                        onMouseEnter={() => safePlay(audio.playHover)}
                        disabled={!source || !periodStart || !periodEnd}
                        style={{
                            width: '100%', padding: '13px',
                            borderRadius: 8,
                            border: `1px solid ${(!source || !periodStart || !periodEnd) ? F.border : F.green + '55'}`,
                            background: (!source || !periodStart || !periodEnd) ? 'rgba(0,0,0,0.2)' : `${F.green}18`,
                            color: (!source || !periodStart || !periodEnd) ? F.textDim : F.green,
                            fontSize: '0.75rem', fontWeight: 800,
                            fontFamily: F.mono, letterSpacing: '0.1em',
                            cursor: (!source || !periodStart || !periodEnd) ? 'not-allowed' : 'pointer',
                            transition: 'all 150ms',
                        }}
                    >
                        SELECT COLUMNS →
                    </button>
                </div>
            )}

            {/* ── Step 2: Columns ── */}
            {step === STEP.COLUMNS && (
                <div style={{ ...financialCard, padding: '28px' }}>
                    {/* Context strip */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <SourceBadge source={source} />
                            <span style={{ fontSize: '0.65rem', color: F.textDim, fontFamily: F.mono }}>
                                {periodStart} → {periodEnd}
                            </span>
                        </div>
                        {!loadingCols && columns.length > 0 && (
                            <div style={{ display: 'flex', gap: 8 }}>
                                <SmallBtn onClick={selectAll}  onHover={() => safePlay(audio.playHover)} label="SELECT ALL" />
                                <SmallBtn onClick={selectNone} onHover={() => safePlay(audio.playHover)} label="CLEAR" />
                            </div>
                        )}
                    </div>

                    {loadingCols ? (
                        <div style={{
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            padding: '52px 0', gap: 14,
                        }}>
                            <div style={{
                                width: 44, height: 44, borderRadius: 10,
                                background: `${F.green}12`, border: `1px solid ${F.green}28`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Loader2 size={22} style={{ color: F.green, animation: 'spin 1s linear infinite' }} />
                            </div>
                            <span style={{ color: F.textDim, fontFamily: F.mono, fontSize: '0.72rem' }}>
                                LOADING COLUMNS...
                            </span>
                        </div>
                    ) : columns.length === 0 ? (
                        <div style={{
                            padding: '40px 20px', textAlign: 'center',
                            color: F.textDim, fontFamily: F.mono, fontSize: '0.72rem',
                        }}>
                            No columns returned for this source.
                        </div>
                    ) : (
                        <>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                                gap: 6, marginBottom: 24,
                            }}>
                                {columns.map(col => {
                                    const isId     = col === identifier;
                                    const isActive = selected.includes(col);
                                    return (
                                        <button
                                            key={col}
                                            onClick={() => toggleCol(col)}
                                            onMouseEnter={() => safePlay(audio.playHover)}
                                            title={isId ? 'Identifier column — always included' : col}
                                            style={{
                                                padding: '8px 10px', borderRadius: 6, textAlign: 'left',
                                                border: `1px solid ${isActive
                                                    ? (isId ? F.amber + '50' : F.green + '40')
                                                    : F.border}`,
                                                background: isActive
                                                    ? (isId ? `${F.amber}12` : `${F.green}0e`)
                                                    : 'rgba(0,0,0,0.2)',
                                                cursor: isId ? 'default' : 'pointer',
                                                display: 'flex', alignItems: 'center', gap: 6,
                                                transition: 'all 120ms',
                                            }}
                                        >
                                            <div style={{
                                                width: 12, height: 12, borderRadius: 3, flexShrink: 0,
                                                border: `1.5px solid ${isActive ? (isId ? F.amber : F.green) : F.border}`,
                                                background: isActive ? (isId ? F.amber : F.green) : 'transparent',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                {isActive && <Check size={8} style={{ color: '#000' }} />}
                                            </div>
                                            <span style={{
                                                fontSize: '0.62rem', fontFamily: F.mono,
                                                color: isId ? F.amber : isActive ? F.text : F.textDim,
                                                letterSpacing: '0.03em',
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                flex: 1,
                                            }}>
                                                {col}
                                            </span>
                                            {isId && (
                                                <span style={{
                                                    fontSize: '0.5rem', color: F.amber, fontFamily: F.mono,
                                                    border: `1px solid ${F.amber}30`,
                                                    padding: '1px 4px', borderRadius: 3, flexShrink: 0,
                                                }}>
                                                    ID
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Footer row */}
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '12px 0', borderTop: `1px solid ${F.border}`, marginBottom: 20,
                            }}>
                                <span style={{ fontSize: '0.65rem', color: F.textDim, fontFamily: F.mono }}>
                                    <span style={{ color: F.green }}>{selected.length}</span> / {columns.length} columns selected
                                </span>
                                <span style={{ fontSize: '0.65rem', color: F.textDim, fontFamily: F.mono }}>
                                    FORMAT: <span style={{ color: F.green }}>.{format.toUpperCase()}</span>
                                </span>
                            </div>

                            <button
                                onClick={handleDownload}
                                onMouseEnter={() => safePlay(audio.playHover)}
                                disabled={downloading || selected.length === 0}
                                style={{
                                    width: '100%', padding: '13px', borderRadius: 8,
                                    border: `1px solid ${(downloading || selected.length === 0) ? F.border : F.green + '55'}`,
                                    background: (downloading || selected.length === 0) ? 'rgba(0,0,0,0.2)' : `${F.green}18`,
                                    color: (downloading || selected.length === 0) ? F.textDim : F.green,
                                    fontSize: '0.75rem', fontWeight: 800,
                                    fontFamily: F.mono, letterSpacing: '0.1em',
                                    cursor: (downloading || selected.length === 0) ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    transition: 'all 150ms',
                                }}
                            >
                                {downloading ? (
                                    <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> EXPORTING...</>
                                ) : (
                                    <><FileDown size={14} /> DOWNLOAD {format.toUpperCase()}</>
                                )}
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function triggerDownload(blob, filename) {
    const url  = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href  = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}

async function blobToText(blob) {
    try {
        const text = await blob.text();
        return JSON.parse(text)?.message ?? text;
    } catch {
        return null;
    }
}

// ── Atoms ─────────────────────────────────────────────────────────────────────
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

function DateInput({ label, value, onChange }) {
    return (
        <div>
            <div style={{ fontSize: '0.58rem', color: F.textDim, fontFamily: F.mono, marginBottom: 6, letterSpacing: '0.08em' }}>
                {label}
            </div>
            <input
                type="date"
                value={value}
                onChange={e => onChange(e.target.value)}
                style={{
                    width: '100%', padding: '10px 12px',
                    borderRadius: 7, border: `1px solid ${value ? F.green + '40' : F.border}`,
                    background: 'rgba(0,0,0,0.3)',
                    color: F.text, fontFamily: F.mono, fontSize: '0.78rem',
                    outline: 'none', boxSizing: 'border-box', colorScheme: 'dark',
                    transition: 'border-color 150ms',
                }}
            />
        </div>
    );
}

function SmallBtn({ onClick, onHover, label }) {
    return (
        <button
            onClick={onClick}
            onMouseEnter={onHover}
            style={{
                padding: '4px 10px', borderRadius: 5,
                border: `1px solid ${F.border}`,
                background: 'rgba(0,0,0,0.3)',
                color: F.textDim, fontSize: '0.58rem',
                fontFamily: F.mono, cursor: 'pointer',
                letterSpacing: '0.06em',
            }}
        >
            {label}
        </button>
    );
}

const backBtnStyle = {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'none', border: `1px solid ${F.border}`,
    color: F.textMid, cursor: 'pointer', padding: '6px 12px',
    borderRadius: 6, fontSize: '0.68rem', fontFamily: F.mono,
};