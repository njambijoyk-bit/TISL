import { useState } from 'react';
import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { F, financialCard, FinancialDivider, ErrorBanner, SourceBadge } from './dataEngineShared';

export default function DataEngineConfigureStep({
  audio,
  source,
  periodStart,
  periodEnd,
  fileHeaders,
  detection,
  identifierCol,
  setIdentifierCol,
  onNext,
  onBack,
}) {
  const [error, setError] = useState('');
  const [manualOverride, setManualOverride] = useState(false);

  // Derive selected col — when no manual override, prefer auto-detected column
  const selectedCol = manualOverride
    ? identifierCol
    : (detection?.column || identifierCol || '');

  const handleSelectColumn = (col) => {
    audio.playTick();
    setIdentifierCol(col);
    setManualOverride(true);
  };

  const handleResetToAuto = () => {
    if (detection?.column) {
      audio.playTick();
      setIdentifierCol(detection.column);
      setManualOverride(false);
    }
  };

  const handleNext = () => {
    const col = selectedCol || identifierCol;
    if (!col) {
      setError('Please select or confirm an identifier column to continue.');
      audio.playError();
      return;
    }
    // Ensure parent always has the confirmed col
    if (col !== identifierCol) setIdentifierCol(col);
    audio.playUpload();
    setError('');
    onNext();
  };

  const confidenceMap = {
    high: { color: F.green, label: 'HIGH CONFIDENCE' },
    medium: { color: F.amber, label: 'MEDIUM CONFIDENCE' },
    low: { color: '#ef4444', label: 'LOW CONFIDENCE' },
  };

  const confMeta = confidenceMap[detection?.confidence] || confidenceMap.low;

  return (
    <div style={{ animation: 'fadeSlideIn 0.3s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => {
            audio.playDelete();
            onBack();
          }}
          onMouseEnter={audio.playHover}
          style={backBtnStyle}
        >
          <ChevronLeft size={13} /> BACK
        </button>
        <div>
          <div
            style={{
              fontSize: '1rem',
              fontWeight: 800,
              color: F.amber,
              fontFamily: F.mono,
              letterSpacing: '0.06em',
            }}
          >
            STEP 3 — CONFIGURE
          </div>
          <div style={{ fontSize: '0.62rem', color: F.textDim, fontFamily: F.mono }}>
            Confirm the identifier column for matching
          </div>
        </div>

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
        {/* Auto-detection summary */}
        {detection && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              borderRadius: 8,
              marginBottom: 24,
              background: `${confMeta.color}08`,
              border: `1px solid ${confMeta.color}28`,
              animation: 'fadeSlideIn 0.2s ease',
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: confMeta.color,
                flexShrink: 0,
                boxShadow: `0 0 6px ${confMeta.color}`,
              }}
            />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '0.72rem', fontFamily: F.mono, color: F.textMid }}>
                Auto-detected:
                {' '}
                <span style={{ color: confMeta.color, fontWeight: 700 }}>
                  {detection.column || '(no match)'}
                </span>
                {' '}
                <span
                  style={{
                    display: 'inline-block',
                    padding: '1px 7px',
                    borderRadius: 4,
                    background: `${confMeta.color}12`,
                    border: `1px solid ${confMeta.color}28`,
                    fontSize: '0.56rem',
                    fontWeight: 800,
                    color: confMeta.color,
                    fontFamily: F.mono,
                    letterSpacing: '0.08em',
                    marginLeft: 4,
                  }}
                >
                  {confMeta.label}
                </span>
              </span>
            </div>
            {manualOverride && (
              <button
                onClick={handleResetToAuto}
                onMouseEnter={audio.playHover}
                style={{
                  background: 'none',
                  border: `1px solid ${F.border}`,
                  color: F.textDim,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 5,
                  fontSize: '0.6rem',
                  fontFamily: F.mono,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                }}
              >
                RESET
              </button>
            )}
          </div>
        )}

        {/* Column picker */}
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: '0.6rem',
              fontWeight: 700,
              color: F.textDim,
              fontFamily: F.mono,
              letterSpacing: '0.1em',
              marginBottom: 12,
              textTransform: 'uppercase',
            }}
          >
            SELECT IDENTIFIER COLUMN
          </div>

          {fileHeaders && fileHeaders.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {fileHeaders.map(col => {
                const isSelected = selectedCol === col;
                return (
                  <button
                    key={col}
                    onClick={() => handleSelectColumn(col)}
                    onMouseEnter={audio.playHover}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 7,
                      border: `1px solid ${isSelected ? F.amber + '55' : F.border}`,
                      background: isSelected ? `${F.amber}14` : 'rgba(0,0,0,0.25)',
                      color: isSelected ? F.amber : F.textMid,
                      cursor: 'pointer',
                      fontSize: '0.72rem',
                      fontFamily: F.mono,
                      fontWeight: isSelected ? 700 : 500,
                      letterSpacing: '0.06em',
                      transition: 'all 150ms',
                      boxShadow: isSelected ? `0 0 12px ${F.amberGlow}` : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 3,
                        flexShrink: 0,
                        border: `1.5px solid ${isSelected ? F.amber : F.border}`,
                        background: isSelected ? F.amber : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {isSelected && <div style={{ width: 6, height: 6, background: '#000', borderRadius: 1 }} />}
                    </div>
                    {col}
                  </button>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '16px 14px',
                borderRadius: 8,
                background: 'rgba(0,0,0,0.2)',
                border: `1px dashed ${F.border}`,
              }}
            >
              <AlertCircle size={16} style={{ color: F.textDim, flexShrink: 0 }} />
              <span style={{ fontSize: '0.72rem', color: F.textDim, fontFamily: F.mono }}>
                No file headers available. Please go back and re-upload.
              </span>
            </div>
          )}
        </div>

        {/* Info box */}
        {selectedCol && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              borderRadius: 7,
              marginBottom: 24,
              background: `${F.green}08`,
              border: `1px solid ${F.green}28`,
              animation: 'fadeIn 0.2s ease',
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: F.green,
                flexShrink: 0,
                boxShadow: `0 0 4px ${F.green}`,
              }}
            />
            <span style={{ fontSize: '0.68rem', color: F.textMid, fontFamily: F.mono }}>
              Using <span style={{ color: F.green, fontWeight: 700 }}>{selectedCol}</span> as identifier. Records will be matched on this column.
            </span>
          </div>
        )}

        {/* Continue */}
        <button
          onClick={handleNext}
          onMouseEnter={audio.playHover}
          disabled={!(selectedCol || identifierCol)}
          style={{
            width: '100%',
            padding: '13px',
            borderRadius: 8,
            border: `1px solid ${!(selectedCol || identifierCol) ? F.border : F.amber + '55'}`,
            background: !(selectedCol || identifierCol) ? 'rgba(0,0,0,0.2)' : `${F.amber}18`,
            color: !(selectedCol || identifierCol) ? F.textDim : F.amber,
            fontSize: '0.75rem',
            fontWeight: 800,
            fontFamily: F.mono,
            letterSpacing: '0.1em',
            cursor: !(selectedCol || identifierCol) ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'all 150ms',
          }}
        >
          RUN DIFF <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

const backBtnStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  background: 'none',
  border: `1px solid ${F.border}`,
  color: F.textMid,
  cursor: 'pointer',
  padding: '6px 12px',
  borderRadius: 6,
  fontSize: '0.68rem',
  fontFamily: F.mono,
  flexShrink: 0,
};