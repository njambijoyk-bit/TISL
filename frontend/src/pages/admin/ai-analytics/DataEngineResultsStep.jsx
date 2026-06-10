import { useState, useMemo } from 'react';
import { ChevronLeft, RotateCcw, FileDown, Filter, X, Brain, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { dataEngineAPI } from '../../../api';
import { F, financialCard, FinancialDivider, ErrorBanner, SourceBadge, StatCard, StatusPill } from './dataEngineShared';

const FILTER_OPTIONS = ['clean', 'mismatch', 'only_in_tisl', 'only_in_file'];

export default function DataEngineResultsStep({
  audio,
  source,
  periodStart,
  periodEnd,
  diffResult,
  sessionResult,
  onBack,
  onNewDiff,
}) {
  const [selectedFilter, setSelectedFilter] = useState(null);
  const [sortBy, setSortBy] = useState('variance_desc');
  const [aiLoading,    setAiLoading]    = useState(false);
  const [aiResult,     setAiResult]     = useState(null);
  const [aiError,      setAiError]      = useState('');
  const [aiOutputType, setAiOutputType] = useState('summary');
  const [aiExpanded,   setAiExpanded]   = useState(false);

  if (!diffResult) {
    return (
      <div style={{ ...financialCard, padding: '28px', textAlign: 'center' }}>
        <div style={{ fontSize: '0.9rem', color: F.textDim, fontFamily: F.mono }}>
          No diff result available.
        </div>
      </div>
    );
  }

  const summary = diffResult.summary || {};

  const buildTableRows = () => {
    const rows = [];

    // Mismatches
    (diffResult.mismatches || []).forEach(row => {
      rows.push({
        type: 'mismatch',
        identifier: row.identifier,
        status: 'mismatch',
        variance: row.amount_variance || 0,
        fieldDiffs: row.field_diffs || [],
        details: row,
      });
    });

    // Only in TISL
    (diffResult.only_in_tisl || []).forEach(row => {
      rows.push({
        type: 'only_in_tisl',
        identifier: row.identifier,
        status: 'only_in_tisl',
        variance: 0,
        fieldDiffs: [],
        details: row,
      });
    });

    // Only in file
    (diffResult.only_in_file || []).forEach(row => {
      rows.push({
        type: 'only_in_file',
        identifier: row.identifier,
        status: 'only_in_file',
        variance: 0,
        fieldDiffs: [],
        details: row,
      });
    });

    return rows;
  };

  const allRows = useMemo(() => buildTableRows(), [diffResult]);

  const filteredRows = useMemo(() => {
    let result = [...allRows];

    if (selectedFilter) {
      result = result.filter(r => r.status === selectedFilter);
    }

    if (sortBy === 'variance_desc') {
      result.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
    } else if (sortBy === 'variance_asc') {
      result.sort((a, b) => Math.abs(a.variance) - Math.abs(b.variance));
    } else if (sortBy === 'identifier') {
      result.sort((a, b) => String(a.identifier).localeCompare(String(b.identifier)));
    }

    return result;
  }, [allRows, selectedFilter, sortBy]);

  const formatAiContent = (text) => {
    return text
        .replace(/\*\*(.*?)\*\*/g, '$1')   // bold
        .replace(/\*(.*?)\*/g, '$1')         // italic
        .replace(/#{1,6}\s/g, '')            // headings
        .replace(/`(.*?)`/g, '$1')           // inline code
        .trim();
  };

  const handleAnalyse = async () => {
    setAiLoading(true);
    setAiError('');
    setAiResult(null);
    audio.playAnalyse?.();
    try {
        const res = await dataEngineAPI.analyse({
            ...(sessionResult?.id ? { session_id: sessionResult.id } : { diff_result: diffResult }),
            output_type: aiOutputType,
        });
        setAiResult(res.data);
        console.log('AI result:', res.data); 
        setAiExpanded(true);
        audio.playSuccess?.();
    } catch (e) {
        setAiError(e.response?.data?.message || 'AI analysis failed.');
        audio.playError?.();
    } finally {
        setAiLoading(false);
    }
  };

  const handleFilterToggle = (filter) => {
    audio.playTick();
    setSelectedFilter(selectedFilter === filter ? null : filter);
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
          style={{
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
          }}
        >
          <ChevronLeft size={13} /> BACK
        </button>

        <div>
          <div
            style={{
              fontSize: '1rem',
              fontWeight: 800,
              color: F.green,
              fontFamily: F.mono,
              letterSpacing: '0.06em',
            }}
          >
            STEP 5 — RESULTS
          </div>
          <div style={{ fontSize: '0.62rem', color: F.textDim, fontFamily: F.mono }}>
            Diff complete — review and act on findings
          </div>
        </div>

        {sessionResult && (
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div
              style={{
                fontSize: '0.6rem',
                color: F.textDim,
                fontFamily: F.mono,
                letterSpacing: '0.08em',
                marginBottom: 2,
              }}
            >
              SESSION
            </div>
            <div
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                color: F.green,
                fontFamily: F.mono,
              }}
            >
              #{sessionResult.session_number}
            </div>
          </div>
        )}
      </div>

      <FinancialDivider />
      <div style={{ marginBottom: 24 }} />

      {/* Stat cards grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 12,
          marginBottom: 28,
        }}
      >
        <StatCard label="TOTAL RECORDS" value={summary.total_tisl || 0} color={F.amber} unit="TISL" />
        <StatCard label="MATCHED CLEAN" value={summary.matched_clean || 0} color={F.green} unit="rows" />
        <StatCard label="MISMATCHES" value={summary.matched_mismatch || 0} color={F.amber} unit="rows" />
        <StatCard label="ONLY IN TISL" value={summary.only_in_tisl || 0} color={F.teal} unit="rows" />
        <StatCard label="ONLY IN FILE" value={summary.only_in_file || 0} color="#a855f7" unit="rows" />
      </div>

      {/* Variance summary */}
      {summary.total_variance_kes !== undefined && (
        <div
          style={{
            ...financialCard,
            padding: '16px 20px',
            marginBottom: 28,
            border:
              summary.total_variance_kes > 0
                ? `1px solid ${F.amber}30`
                : `1px solid ${F.green}30`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                color: F.textDim,
                fontFamily: F.mono,
                letterSpacing: '0.08em',
              }}
            >
              TOTAL VARIANCE
            </span>
            <span
              style={{
                fontSize: '1.2rem',
                fontWeight: 800,
                fontFamily: F.mono,
                color: summary.total_variance_kes > 0 ? F.amber : F.green,
              }}
            >
              KES {Math.abs(summary.total_variance_kes).toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}

      {/* Filter + sort controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {FILTER_OPTIONS.map(opt => {
            const counts = {
              clean: summary.matched_clean || 0,
              mismatch: summary.matched_mismatch || 0,
              only_in_tisl: summary.only_in_tisl || 0,
              only_in_file: summary.only_in_file || 0,
            };
            const label = {
              clean: 'CLEAN',
              mismatch: 'MISMATCHES',
              only_in_tisl: 'TISL ONLY',
              only_in_file: 'FILE ONLY',
            }[opt];
            const color = {
              clean: F.green,
              mismatch: F.amber,
              only_in_tisl: F.teal,
              only_in_file: '#a855f7',
            }[opt];

            const isActive = selectedFilter === opt;

            return (
              <button
                key={opt}
                onClick={() => handleFilterToggle(opt)}
                onMouseEnter={audio.playHover}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: `1px solid ${isActive ? color + '55' : F.border}`,
                  background: isActive ? `${color}12` : 'rgba(0,0,0,0.2)',
                  color: isActive ? color : F.textDim,
                  fontSize: '0.65rem',
                  fontWeight: isActive ? 700 : 500,
                  fontFamily: F.mono,
                  cursor: 'pointer',
                  transition: 'all 120ms',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Filter size={10} />
                {label}
                {counts[opt] > 0 && (
                  <span
                    style={{
                      display: 'inline-block',
                      minWidth: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.55rem',
                      fontWeight: 800,
                      color: '#000',
                    }}
                  >
                    {counts[opt]}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <select
          value={sortBy}
          onChange={(e) => {
            audio.playTick();
            setSortBy(e.target.value);
          }}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: `1px solid ${F.border}`,
            background: 'rgba(0,0,0,0.25)',
            color: F.textMid,
            fontFamily: F.mono,
            fontSize: '0.65rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <option value="variance_desc">Variance (High to Low)</option>
          <option value="variance_asc">Variance (Low to High)</option>
          <option value="identifier">Identifier (A to Z)</option>
        </select>
      </div>

      {/* Results table */}
      <div
        style={{
          ...financialCard,
          padding: 0,
          marginBottom: 28,
          maxHeight: 'calc(100vh - 400px)',
          overflowY: 'auto',
        }}
      >
        {filteredRows.length > 0 ? (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.72rem',
              fontFamily: F.mono,
            }}
          >
            <thead
              style={{
                background: 'rgba(0,0,0,0.3)',
                borderBottom: `1px solid ${F.border}`,
                position: 'sticky',
                top: 0,
              }}
            >
              <tr>
                <th
                  style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontWeight: 700,
                    color: F.textDim,
                    letterSpacing: '0.06em',
                  }}
                >
                  IDENTIFIER
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontWeight: 700,
                    color: F.textDim,
                    letterSpacing: '0.06em',
                  }}
                >
                  STATUS
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    fontWeight: 700,
                    color: F.textDim,
                    letterSpacing: '0.06em',
                  }}
                >
                  VARIANCE
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontWeight: 700,
                    color: F.textDim,
                    letterSpacing: '0.06em',
                  }}
                >
                  FIELDS CHANGED
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, idx) => (
                <tr
                  key={idx}
                  style={{
                    borderBottom: `1px solid ${F.border}`,
                    background: idx % 2 === 0 ? 'rgba(0,0,0,0.05)' : 'transparent',
                    animation: 'diffRow 0.3s ease',
                    animationDelay: `${idx * 20}ms`,
                  }}
                >
                  <td
                    style={{
                      padding: '12px 16px',
                      color: F.text,
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.identifier}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <StatusPill status={row.status} />
                  </td>
                  <td
                    style={{
                      padding: '12px 16px',
                      textAlign: 'right',
                      fontWeight: 600,
                      color:
                        row.variance > 0
                          ? F.amber
                          : row.variance < 0
                          ? F.green
                          : F.textMid,
                    }}
                  >
                    {row.variance !== 0 ? (row.variance > 0 ? '+' : '') + row.variance.toFixed(2) : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', color: F.textDim }}>
                    {row.fieldDiffs.length > 0
                      ? `${row.fieldDiffs.length} field${row.fieldDiffs.length !== 1 ? 's' : ''}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: F.textDim,
              fontFamily: F.mono,
              fontSize: '0.72rem',
            }}
          >
            No records match the selected filter.
          </div>
        )}
      </div>

      {/* ── AI Analysis Panel ── */}
      <div style={{ ...financialCard, padding: '20px', marginBottom: 20, border: `1px solid #a855f730` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Brain size={18} style={{ color: '#a855f7' }} />
                  <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#a855f7', fontFamily: F.mono, letterSpacing: '0.06em' }}>
                          AI ANALYSIS
                      </div>
                      <div style={{ fontSize: '0.6rem', color: F.textDim, fontFamily: F.mono }}>
                          {sessionResult ? `Session #${sessionResult.session_number}` : 'Raw diff result'}
                      </div>
                  </div>
              </div>

              {/* Output type selector */}
              <select
                  value={aiOutputType}
                  onChange={e => { audio.playTick?.(); setAiOutputType(e.target.value); }}
                  style={{
                      padding: '6px 10px', borderRadius: 6,
                      border: `1px solid #a855f730`,
                      background: 'rgba(0,0,0,0.3)',
                      color: '#a855f7', fontFamily: F.mono,
                      fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer',
                  }}
              >
                  <option value="summary">Summary</option>
                  <option value="insight">Insights</option>
                  <option value="risk">Risk Flags</option>
                  <option value="recommendation">Recommendations</option>
              </select>
          </div>

          <ErrorBanner message={aiError} onDismiss={() => setAiError('')} />

          {aiResult && (
              <div style={{ marginBottom: 16 }}>
                  <button
                      onClick={() => { audio.playTick?.(); setAiExpanded(prev => !prev); }}
                      style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          background: 'none', border: 'none',
                          color: F.textDim, fontFamily: F.mono,
                          fontSize: '0.65rem', cursor: 'pointer', marginBottom: 10,
                      }}
                  >
                      {aiExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {aiExpanded ? 'COLLAPSE' : 'SHOW RESULT'}
                  </button>
                  {aiExpanded && (
                      <div style={{
                          padding: '16px', borderRadius: 8,
                          background: 'rgba(168,85,247,0.05)',
                          border: `1px solid #a855f720`,
                          fontSize: '0.78rem', color: F.text,
                          fontFamily: 'system-ui, sans-serif',
                          lineHeight: 1.7, whiteSpace: 'pre-wrap',
                      }}>
                          {formatAiContent(aiResult.output.content)}
                      </div>
                  )}
              </div>
          )}

          <button
              onClick={handleAnalyse}
              onMouseEnter={() => audio.playHover?.()}
              disabled={aiLoading}
              style={{
                  width: '100%', padding: '12px', borderRadius: 8,
                  border: `1px solid ${aiLoading ? F.border : '#a855f755'}`,
                  background: aiLoading ? 'rgba(0,0,0,0.2)' : 'rgba(168,85,247,0.12)',
                  color: aiLoading ? F.textDim : '#a855f7',
                  fontSize: '0.72rem', fontWeight: 800,
                  fontFamily: F.mono, letterSpacing: '0.1em',
                  cursor: aiLoading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 150ms',
              }}
          >
              {aiLoading
                  ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> ANALYSING...</>
                  : <><Brain size={14} /> {aiResult ? 'RE-ANALYSE' : 'ANALYSE WITH AI'}</>
              }
          </button>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={() => {
            audio.playDelete();
            onNewDiff();
          }}
          onMouseEnter={audio.playHover}
          style={{
            flex: 1,
            padding: '13px',
            borderRadius: 8,
            border: `1px solid ${F.border}`,
            background: 'rgba(0,0,0,0.2)',
            color: F.textMid,
            fontSize: '0.75rem',
            fontWeight: 800,
            fontFamily: F.mono,
            letterSpacing: '0.1em',
            cursor: 'pointer',
            transition: 'all 150ms',
          }}
        >
          <RotateCcw size={12} style={{ marginRight: 6, display: 'inline' }} />
          NEW DIFF
        </button>
        {sessionResult && (
          <button
            disabled
            style={{
              flex: 1,
              padding: '13px',
              borderRadius: 8,
              border: `1px solid ${F.green}55`,
              background: `${F.green}12`,
              color: F.green,
              fontSize: '0.75rem',
              fontWeight: 800,
              fontFamily: F.mono,
              letterSpacing: '0.1em',
              cursor: 'default',
              opacity: 0.7,
            }}
          >
            <FileDown size={12} style={{ marginRight: 6, display: 'inline' }} />
            SESSION #{sessionResult.session_number} PERSISTED
          </button>
        )}
      </div>
    </div>
  );
}