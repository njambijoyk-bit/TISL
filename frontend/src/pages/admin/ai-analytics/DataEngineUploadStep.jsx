import { useState, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Upload, FileText, X, AlertCircle } from 'lucide-react';
import { F, financialCard, FinancialDivider, ErrorBanner, SourceBadge } from './dataEngineShared';
import { dataEngineAPI } from '../../../api'; 

const ACCEPTED = ['.csv', '.txt', '.xlsx', '.xls'];
const MAX_MB   = 10;

export default function DataEngineUploadStep({
    audio,
    source, periodStart, periodEnd,
    uploadedFile,  setUploadedFile,
    fileHeaders,   setFileHeaders,
    detection,     setDetection,
    onNext, onBack,
}) {
    const [dragging,  setDragging]  = useState(false);
    const [loading,   setLoading]   = useState(false);
    const [error,     setError]     = useState('');
    const inputRef = useRef(null);

    // ── File validation ───────────────────────────────────────────────────────
    const validateFile = (file) => {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!ACCEPTED.includes(ext)) {
            return `Unsupported file type. Accepted: ${ACCEPTED.join(', ')}`;
        }
        if (file.size > MAX_MB * 1024 * 1024) {
            return `File too large. Maximum size is ${MAX_MB}MB.`;
        }
        return null;
    };

    // ── Process file — send to detect-identifier ─────────────────────────────
    const processFile = useCallback(async (file) => {
        const err = validateFile(file);
        if (err) {
            setError(err);
            audio.playError();
            return;
        }

        setLoading(true);
        setError('');
        audio.playUpload();

        try {
            const res = await dataEngineAPI.detectIdentifier(file, source);

            setUploadedFile(file);
            setFileHeaders(res.data.headers || []);
            setDetection(res.data.detection || null);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to process file.');
            audio.playError();
        } finally {
            setLoading(false);
        }
    }, [source, audio, setUploadedFile, setFileHeaders, setDetection]);

    // ── Drop handling ─────────────────────────────────────────────────────────
    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processFile(file);
    }, [processFile]);

    const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
    const handleDragLeave = () => setDragging(false);
    const handleInputChange = (e) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    };

    const clearFile = () => {
        audio.playDelete();
        setUploadedFile(null);
        setFileHeaders([]);
        setDetection(null);
        setError('');
        if (inputRef.current) inputRef.current.value = '';
    };

    const handleNext = () => {
        if (!uploadedFile || !fileHeaders.length) {
            setError('Upload a file to continue.');
            audio.playError();
            return;
        }
        audio.playTick();
        onNext();
    };

    const fileReady = uploadedFile && fileHeaders.length > 0 && !loading;

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
                        STEP 2 — UPLOAD
                    </div>
                    <div style={{ fontSize: '0.62rem', color: F.textDim, fontFamily: F.mono }}>
                        Drop your external reconciliation file
                    </div>
                </div>

                {/* Period + source context strip */}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <SourceBadge source={source} />
                    <span style={{ fontSize: '0.62rem', color: F.textDim, fontFamily: F.mono }}>
                        {periodStart} → {periodEnd}
                    </span>
                </div>
            </div>

            <FinancialDivider />
            <div style={{ marginBottom: 24 }} />

            <ErrorBanner message={error} onDismiss={() => setError('')} />

            <div style={{ ...financialCard, padding: '28px' }}>

                {/* ── Drop zone ── */}
                {!uploadedFile && (
                    <div
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onClick={() => !loading && inputRef.current?.click()}
                        style={{
                            border: `2px dashed ${dragging ? F.amber + '80' : F.border}`,
                            borderRadius: 12,
                            padding: '52px 32px',
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', gap: 14,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            background: dragging ? `${F.amber}06` : 'rgba(0,0,0,0.15)',
                            transition: 'all 180ms',
                            boxShadow: dragging ? `0 0 28px ${F.amberGlow}` : 'none',
                            marginBottom: 24,
                        }}
                    >
                        <div style={{
                            width: 56, height: 56, borderRadius: 14,
                            background: dragging ? `${F.amber}18` : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${dragging ? F.amber + '50' : F.border}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 180ms',
                            boxShadow: dragging ? `0 0 20px ${F.amberGlow}` : 'none',
                        }}>
                            <Upload size={24} style={{ color: dragging ? F.amber : F.textDim }} />
                        </div>

                        {loading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                <div style={{
                                    width: 120, height: 3, borderRadius: 2,
                                    background: F.border, overflow: 'hidden',
                                }}>
                                    <div style={{
                                        height: '100%', width: '40%',
                                        background: `linear-gradient(90deg, ${F.amber}, ${F.green})`,
                                        animation: 'scanLine 1.2s linear infinite',
                                        borderRadius: 2,
                                    }} />
                                </div>
                                <span style={{ fontSize: '0.72rem', color: F.textDim, fontFamily: F.mono }}>
                                    PROCESSING FILE...
                                </span>
                            </div>
                        ) : (
                            <>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: F.text, fontFamily: F.mono, marginBottom: 4 }}>
                                        {dragging ? 'DROP IT' : 'DRAG & DROP OR CLICK TO BROWSE'}
                                    </div>
                                    <div style={{ fontSize: '0.62rem', color: F.textDim, fontFamily: F.mono }}>
                                        CSV · TXT · XLSX · XLS · max {MAX_MB}MB
                                    </div>
                                </div>
                            </>
                        )}

                        <input
                            ref={inputRef}
                            type="file"
                            accept={ACCEPTED.join(',')}
                            onChange={handleInputChange}
                            style={{ display: 'none' }}
                        />
                    </div>
                )}

                {/* ── File loaded state ── */}
                {fileReady && (
                    <div style={{ animation: 'fadeSlideIn 0.25s ease' }}>
                        {/* File card */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 14,
                            padding: '14px 18px', borderRadius: 10, marginBottom: 20,
                            background: `${F.green}08`,
                            border: `1px solid ${F.green}30`,
                            boxShadow: `0 0 16px ${F.greenGlow}`,
                        }}>
                            <div style={{
                                width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                                background: `${F.green}15`,
                                border: `1px solid ${F.green}30`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <FileText size={18} style={{ color: F.green }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontSize: '0.78rem', fontWeight: 700, color: F.text,
                                    fontFamily: F.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                    {uploadedFile.name}
                                </div>
                                <div style={{ fontSize: '0.6rem', color: F.textDim, fontFamily: F.mono, marginTop: 2 }}>
                                    {(uploadedFile.size / 1024).toFixed(1)} KB · {fileHeaders.length} columns detected
                                </div>
                            </div>
                            <button
                                onClick={clearFile}
                                onMouseEnter={audio.playHover}
                                style={{
                                    background: 'none', border: `1px solid ${F.border}`,
                                    color: F.textDim, cursor: 'pointer',
                                    padding: '4px 8px', borderRadius: 5,
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    fontSize: '0.6rem', fontFamily: F.mono,
                                }}
                            >
                                <X size={10} /> CLEAR
                            </button>
                        </div>

                        {/* Headers preview */}
                        <div style={{ marginBottom: 24 }}>
                            <div style={{
                                fontSize: '0.6rem', fontWeight: 700, color: F.textDim,
                                fontFamily: F.mono, letterSpacing: '0.1em', marginBottom: 10,
                            }}>
                                DETECTED COLUMNS ({fileHeaders.length})
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {fileHeaders.map(h => (
                                    <span key={h} style={{
                                        padding: '3px 10px', borderRadius: 5,
                                        background: `${F.amber}0a`,
                                        border: `1px solid ${F.amber}22`,
                                        fontSize: '0.62rem', color: F.textMid,
                                        fontFamily: F.mono, letterSpacing: '0.04em',
                                    }}>
                                        {h}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Detection preview hint */}
                        {detection && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 14px', borderRadius: 7, marginBottom: 24,
                                background: 'rgba(16,185,129,0.05)',
                                border: `1px solid ${F.green}22`,
                                animation: 'fadeIn 0.2s ease',
                            }}>
                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: F.green, flexShrink: 0 }} />
                                <span style={{ fontSize: '0.68rem', color: F.textMid, fontFamily: F.mono }}>
                                    {detection.column
                                        ? <>Identifier auto-detected: <span style={{ color: F.green }}>{detection.column}</span> <ConfidenceBadge confidence={detection.confidence} /> — confirm on next step</>
                                        : <>No identifier auto-detected — you'll pick one on the next step</>
                                    }
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Continue ── */}
                <button
                    onClick={handleNext}
                    onMouseEnter={audio.playHover}
                    disabled={!fileReady}
                    style={{
                        width: '100%', padding: '13px',
                        borderRadius: 8,
                        border: `1px solid ${!fileReady ? F.border : F.amber + '55'}`,
                        background: !fileReady ? 'rgba(0,0,0,0.2)' : `${F.amber}18`,
                        color: !fileReady ? F.textDim : F.amber,
                        fontSize: '0.75rem', fontWeight: 800,
                        fontFamily: F.mono, letterSpacing: '0.1em',
                        cursor: !fileReady ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        transition: 'all 150ms',
                    }}
                >
                    CONFIGURE IDENTIFIER <ChevronRight size={14} />
                </button>
            </div>
        </div>
    );
}

// ── Confidence badge ──────────────────────────────────────────────────────────
function ConfidenceBadge({ confidence }) {
    const map = {
        high:   { color: F.green,  label: 'HIGH CONFIDENCE'   },
        medium: { color: F.amber,  label: 'MEDIUM CONFIDENCE' },
        low:    { color: '#ef4444',label: 'LOW CONFIDENCE'    },
    };
    const m = map[confidence] || map.low;
    return (
        <span style={{
            padding: '1px 7px', borderRadius: 4,
            background: `${m.color}12`, border: `1px solid ${m.color}28`,
            fontSize: '0.56rem', fontWeight: 800,
            color: m.color, fontFamily: F.mono, letterSpacing: '0.08em',
        }}>
            {m.label}
        </span>
    );
}

const backBtnStyle = {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'none', border: `1px solid ${F.border}`,
    color: F.textMid, cursor: 'pointer', padding: '6px 12px',
    borderRadius: 6, fontSize: '0.68rem', fontFamily: F.mono,
    flexShrink: 0,
};
