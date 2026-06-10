import { useState } from 'react';
import { ChevronLeft, Zap, Loader2 } from 'lucide-react';
import { F, financialCard, FinancialDivider, ErrorBanner } from './dataEngineShared';
import { dataEngineAPI } from '../../../api';

export default function DataEngineDiffStep({
  audio,
  source,
  periodStart,
  periodEnd,
  uploadedFile,
  fileHeaders,
  identifierCol,
  diffResult,
  setDiffResult,
  sessionResult,
  setSessionResult,
  onNext,
  onBack,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRunDiff = async () => {
    if (!uploadedFile || !identifierCol) {
      setError('Missing file or identifier column.');
      audio.playError();
      return;
    }

    setLoading(true);
    setError('');
    audio.playDiffStart?.() || audio.playUpload();

    try {
      const res = await dataEngineAPI.runDiff({
        file: uploadedFile,
        source,
        identifier_col: identifierCol,
        period_start: periodStart,
        period_end: periodEnd,
        persist: true,
      });

      setDiffResult(res.data.diff || null);
      setSessionResult(res.data.session || null);

      audio.playSuccess?.() || audio.playMatch();
      onNext();
    } catch (e) {
      const msg = e.response?.data?.message || 'Diff failed. Please try again.';
      setError(msg);
      audio.playError();
    } finally {
      setLoading(false);
    }
  };

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
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'none',
            border: `1px solid ${F.border}`,
            color: loading ? F.textDim : F.textMid,
            cursor: loading ? 'not-allowed' : 'pointer',
            padding: '6px 12px',
            borderRadius: 6,
            fontSize: '0.68rem',
            fontFamily: F.mono,
            flexShrink: 0,
            opacity: loading ? 0.5 : 1,
          }}
        >
          <ChevronLeft size={13} /> BACK
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Zap size={20} style={{ color: F.amber }} />
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
              STEP 4 — DIFF
            </div>
            <div style={{ fontSize: '0.62rem', color: F.textDim, fontFamily: F.mono }}>
              Running field-level comparison
            </div>
          </div>
        </div>
      </div>

      <FinancialDivider />
      <div style={{ marginBottom: 24 }} />

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      <div style={{ ...financialCard, padding: '28px' }}>
        {/* Summary card */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginBottom: 28,
            padding: '16px',
            borderRadius: 10,
            background: 'rgba(0,0,0,0.2)',
            border: `1px solid ${F.border}`,
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.58rem',
                color: F.textDim,
                fontFamily: F.mono,
                letterSpacing: '0.1em',
                marginBottom: 4,
              }}
            >
              SOURCE TABLE
            </div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: F.text, fontFamily: F.mono }}>
              {source}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: '0.58rem',
                color: F.textDim,
                fontFamily: F.mono,
                letterSpacing: '0.1em',
                marginBottom: 4,
              }}
            >
              PERIOD
            </div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: F.text, fontFamily: F.mono }}>
              {periodStart} → {periodEnd}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: '0.58rem',
                color: F.textDim,
                fontFamily: F.mono,
                letterSpacing: '0.1em',
                marginBottom: 4,
              }}
            >
              FILE
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: F.textMid,
                fontFamily: F.mono,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {uploadedFile?.name || 'unknown'}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: '0.58rem',
                color: F.textDim,
                fontFamily: F.mono,
                letterSpacing: '0.1em',
                marginBottom: 4,
              }}
            >
              IDENTIFIER
            </div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: F.amber, fontFamily: F.mono }}>
              {identifierCol}
            </div>
          </div>
        </div>

        {/* Loading or ready state */}
        {loading ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 40px',
              gap: 16,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                background: `${F.amber}12`,
                border: `1px solid ${F.amber}28`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Loader2 size={28} style={{ color: F.amber, animation: 'spin 1s linear infinite' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: F.text, fontFamily: F.mono, marginBottom: 6 }}>
                RUNNING DIFF ENGINE
              </div>
              <div style={{ fontSize: '0.72rem', color: F.textDim, fontFamily: F.mono }}>
                Comparing records and detecting variances...
              </div>
            </div>
            <div
              style={{
                width: 140,
                height: 3,
                borderRadius: 2,
                background: F.border,
                overflow: 'hidden',
                marginTop: 8,
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: '100%',
                  background: `linear-gradient(90deg, ${F.amber}, ${F.green})`,
                  animation: 'scanLine 2s linear infinite',
                  borderRadius: 2,
                }}
              />
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 20px',
                gap: 12,
                borderRadius: 10,
                background: `${F.amber}06`,
                border: `1px dashed ${F.amber}30`,
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: F.amber,
                  boxShadow: `0 0 8px ${F.amber}`,
                }}
              />
              <span style={{ fontSize: '0.72rem', color: F.textMid, fontFamily: F.mono }}>
                Ready to compare {fileHeaders?.length || 0} columns across all records
              </span>
            </div>

            <button
              onClick={handleRunDiff}
              onMouseEnter={audio.playHover}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: 8,
                border: `1px solid ${F.amber}55`,
                background: `${F.amber}18`,
                color: F.amber,
                fontSize: '0.75rem',
                fontWeight: 800,
                fontFamily: F.mono,
                letterSpacing: '0.1em',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                transition: 'all 150ms',
              }}
            >
              <Zap size={16} />
              RUN DIFF ENGINE
            </button>
          </>
        )}
      </div>
    </div>
  );
}