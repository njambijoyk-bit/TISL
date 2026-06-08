import { useEffect, useRef, useState } from 'react';
import {
  BrainCircuit, X, Minus, ChevronRight,
  Sparkles, AlignLeft, LayoutList,
  Loader2, AlertCircle, CheckCircle,
  Trash2, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react';
import useAiPanelStore from '../../store/useAiPanelStore';
import useAuthStore    from '../../store/authStore'; // adjust if your store path differs
import aiAnalyticsAPI  from '../../api/aiAnalytics';

// ── Design tokens ─────────────────────────────────────────────────────────────
const P   = '#a855f7';
const PL  = 'rgba(168,85,247,0.08)';
const PB  = 'rgba(168,85,247,0.2)';
const PD  = '#7c3aed';

const ADMIN_ROLES = ['admin', 'super_admin', 'manager', 'finance', 'logistics', 'sales_rep'];

// ── Structured output types ───────────────────────────────────────────────────
const OUTPUT_TYPES = [
  { value: 'summary',        label: 'Summary',        desc: 'High-level overview' },
  { value: 'insight',        label: 'Insight',         desc: 'Patterns & findings' },
  { value: 'risk',           label: 'Risk',            desc: 'Issues & red flags'  },
  { value: 'recommendation', label: 'Recommend',       desc: 'Next best actions'   },
];

// ── Output card ───────────────────────────────────────────────────────────────
function OutputCard({ output, onDismiss }) {
  const [expanded, setExpanded] = useState(true);
  const typeColors = {
    summary:        '#3b82f6',
    insight:        '#10b981',
    risk:           '#ef4444',
    recommendation: '#f59e0b',
  };
  const color = typeColors[output.output_type] ?? '#9ca3af';

  return (
    <div style={{
      borderRadius: 10,
      border: `1px solid ${color}25`,
      background: `${color}06`,
      marginBottom: 10,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer', background: `${color}0a` }}
      >
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: '0.72rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {output.output_type}
        </span>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary, #9ca3af)' }}>
          {new Date(output.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(output.id); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary, #9ca3af)', padding: 2, display: 'flex', marginLeft: 4 }}
        >
          <Trash2 size={11} />
        </button>
        {expanded ? <ChevronUp size={12} style={{ color: 'var(--text-secondary, #9ca3af)' }} /> : <ChevronDown size={12} style={{ color: 'var(--text-secondary, #9ca3af)' }} />}
      </div>

      {/* Content */}
      {expanded && (
        <div style={{ padding: '10px 12px 12px', fontSize: '0.8rem', color: 'var(--text-primary, #374151)', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {output.content}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function AiPanel() {
  const { user } = useAuthStore();
  const isAdmin  = ADMIN_ROLES.includes(user?.role);

  const {
    open, minimised,
    toggleOpen, toggleMinimise, close,
    context,
    mode, outputType, freePrompt,
    setMode, setOutputType, setFreePrompt,
    loading, error, setLoading, setError,
    outputs, setOutputs, addOutput, dismissOutput,
    outputsLoading, setOutputsLoading,
  } = useAiPanelStore();

  const textareaRef = useRef(null);

  // ── Load persisted outputs when context changes ───────────────
  useEffect(() => {
    if (!context?.moduleKey || !open) return;

    setOutputsLoading(true);
    aiAnalyticsAPI.getModuleOutputs(context.moduleKey, {
      entity_type: context.entityType ?? undefined,
      entity_id:   context.entityId   ?? undefined,
    })
      .then(res => setOutputs(res.data ?? res))
      .catch(() => {})
      .finally(() => setOutputsLoading(false));
  }, [context?.moduleKey, context?.entityId, open]);

  // ── Run analysis ──────────────────────────────────────────────
  const handleAnalyse = async () => {
    if (!context) return;
    if (mode === 'freeform' && !freePrompt.trim()) return;

    setLoading(true);
    setError(null);

    try {
        const res = await aiAnalyticsAPI.analyse({
        module_key:    context.moduleKey,
        entity_type:   context.entityType ?? undefined,
        entity_id:     context.entityId   ?? undefined,
        output_type:   mode === 'freeform' ? 'summary' : outputType,
        custom_prompt: mode === 'freeform' ? freePrompt.trim() : undefined,
        });

        if (res.success && res.output) {
        addOutput(res.output);
        }
    } catch (e) {
        setError(e?.response?.data?.message ?? 'Analysis failed. Check your active key.');
    } finally {
        setLoading(false);
    }
    };

  // ── Dismiss output ────────────────────────────────────────────
  const handleDismiss = async (id) => {
    dismissOutput(id);
    try { await aiAnalyticsAPI.dismissOutput(id); } catch {}
  };

  // ── Don't render for non-admin ────────────────────────────────
  if (!isAdmin) return null;

  // ── Tab (collapsed trigger) ───────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={toggleOpen}
        title="AI Panel"
        style={{
          position: 'fixed',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          padding: '14px 8px',
          background: `linear-gradient(180deg, ${PD}, ${P})`,
          border: 'none',
          borderRadius: '10px 0 0 10px',
          cursor: 'pointer',
          boxShadow: '-2px 0 16px rgba(168,85,247,0.25)',
          color: '#fff',
          writingMode: 'vertical-rl',
          fontFamily: 'inherit',
        }}
      >
        <BrainCircuit size={16} color="#fff" />
        <span style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', transform: 'rotate(180deg)' }}>
          AI
        </span>
      </button>
    );
  }

  // ── Full panel ────────────────────────────────────────────────
  const panelW = 340;

  return (
    <div style={{
      position: 'fixed',
      right: 0,
      top: 0,
      bottom: 0,
      width: minimised ? 52 : panelW,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-secondary, #ffffff)',
      borderLeft: `1px solid var(--border, #e5e7eb)`,
      boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
      transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)',
      overflow: 'hidden',
      fontFamily: 'inherit',
    }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 12px',
        height: 52,
        borderBottom: '1px solid var(--border, #e5e7eb)',
        background: PL,
        flexShrink: 0,
      }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg,${PD},${P})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <BrainCircuit size={15} color="#fff" />
        </div>

        {!minimised && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary, #111827)' }}>AI Assistant</p>
              {context && (
                <p style={{ margin: 0, fontSize: '0.65rem', color: P, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {context.label}
                </p>
              )}
            </div>
            <button onClick={toggleMinimise} style={iconBtn} title="Minimise">
              <Minus size={13} />
            </button>
            <button onClick={close} style={iconBtn} title="Close">
              <X size={13} />
            </button>
          </>
        )}

        {minimised && (
          <button onClick={toggleMinimise} style={{ ...iconBtn, transform: 'rotate(180deg)' }} title="Expand">
            <ChevronRight size={13} />
          </button>
        )}
      </div>

      {/* ── Body (hidden when minimised) ── */}
      {!minimised && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── No context state ── */}
          {!context && (
            <div style={{ textAlign: 'center', padding: '40px 16px' }}>
              <BrainCircuit size={36} style={{ color: '#d1d5db', margin: '0 auto 12px', display: 'block' }} />
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary, #9ca3af)', margin: '0 0 4px' }}>No context detected</p>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #c4b5fd)', margin: 0, lineHeight: 1.5 }}>
                Navigate to a project, booking, order, or customer page to enable AI scanning
              </p>
            </div>
          )}

          {context && (
            <>
              {/* ── Context chip ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: PL, border: `1px solid ${PB}` }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: P, flexShrink: 0, boxShadow: `0 0 5px ${P}` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: P }}>{context.label}</p>
                  <p style={{ margin: 0, fontSize: '0.62rem', color: 'var(--text-secondary, #9ca3af)', fontFamily: 'monospace' }}>
                    module: {context.moduleKey}{context.entityType ? ` · ${context.entityType}` : ''}
                  </p>
                </div>
              </div>

              {/* ── Mode toggle ── */}
              <div>
                <p style={sectionLabel}>Analysis Mode</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {[
                    { value: 'structured', label: 'Structured', icon: LayoutList,  desc: 'Choose output type' },
                    { value: 'freeform',   label: 'Free Form',   icon: AlignLeft,   desc: 'Write your prompt' },
                  ].map(({ value, label, icon: Icon, desc }) => (
                    <button
                      key={value}
                      onClick={() => setMode(value)}
                      style={{
                        padding: '10px 10px',
                        borderRadius: 8,
                        border: `1px solid ${mode === value ? P : 'var(--border, #e5e7eb)'}`,
                        background: mode === value ? PL : 'transparent',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        textAlign: 'left',
                        transition: 'all 150ms',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <Icon size={13} style={{ color: mode === value ? P : 'var(--text-secondary, #9ca3af)' }} />
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: mode === value ? P : 'var(--text-primary, #374151)' }}>{label}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--text-secondary, #9ca3af)' }}>{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Structured: output type picker ── */}
              {mode === 'structured' && (
                <div>
                  <p style={sectionLabel}>Output Type</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {OUTPUT_TYPES.map(({ value, label, desc }) => (
                      <button
                        key={value}
                        onClick={() => setOutputType(value)}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 8,
                          border: `1px solid ${outputType === value ? P : 'var(--border, #e5e7eb)'}`,
                          background: outputType === value ? PL : 'transparent',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          textAlign: 'left',
                          transition: 'all 150ms',
                        }}
                      >
                        <p style={{ margin: '0 0 2px', fontSize: '0.75rem', fontWeight: 700, color: outputType === value ? P : 'var(--text-primary, #374151)' }}>{label}</p>
                        <p style={{ margin: 0, fontSize: '0.62rem', color: 'var(--text-secondary, #9ca3af)' }}>{desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Free-form: textarea ── */}
              {mode === 'freeform' && (
                <div>
                  <p style={sectionLabel}>Your Prompt</p>
                  <textarea
                    ref={textareaRef}
                    value={freePrompt}
                    onChange={e => setFreePrompt(e.target.value)}
                    placeholder={`Ask anything about this ${context.entityType ?? context.moduleKey}…`}
                    rows={4}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border, #e5e7eb)',
                      background: 'var(--bg-primary, #f9fafb)',
                      color: 'var(--text-primary, #111827)',
                      fontFamily: 'inherit',
                      fontSize: '0.82rem',
                      resize: 'vertical',
                      outline: 'none',
                      lineHeight: 1.6,
                      boxSizing: 'border-box',
                      transition: 'border-color 150ms',
                    }}
                    onFocus={e => e.target.style.borderColor = P}
                    onBlur={e => e.target.style.borderColor = 'var(--border, #e5e7eb)'}
                  />
                </div>
              )}

              {/* ── Error ── */}
              {error && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertCircle size={13} style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: '0.75rem', color: '#991b1b', lineHeight: 1.5 }}>{error}</span>
                </div>
              )}

              {/* ── Run button ── */}
              <button
                onClick={handleAnalyse}
                disabled={loading || (mode === 'freeform' && !freePrompt.trim())}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '11px 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: loading ? 'var(--border, #e5e7eb)' : `linear-gradient(135deg,${PD},${P})`,
                  color: loading ? 'var(--text-secondary, #9ca3af)' : '#fff',
                  cursor: loading || (mode === 'freeform' && !freePrompt.trim()) ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  transition: 'all 150ms',
                  boxShadow: loading ? 'none' : `0 4px 14px rgba(168,85,247,0.3)`,
                }}
              >
                {loading
                  ? <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Analysing…</>
                  : <><Sparkles size={14} /> Run Analysis</>
                }
              </button>

              {/* ── Divider ── */}
              <div style={{ borderTop: '1px solid var(--border, #f3f4f6)', margin: '0 -16px' }} />

              {/* ── Past outputs ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <p style={{ ...sectionLabel, margin: 0 }}>Past Results</p>
                  {outputsLoading && <Loader2 size={12} style={{ color: P, animation: 'spin 0.8s linear infinite' }} />}
                  {!outputsLoading && outputs.length > 0 && (
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary, #9ca3af)' }}>{outputs.length} saved</span>
                  )}
                </div>

                {!outputsLoading && outputs.length === 0 && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #9ca3af)', textAlign: 'center', padding: '20px 0' }}>
                    No saved results yet. Run an analysis above.
                  </p>
                )}

                {outputs.map(output => (
                  <OutputCard key={output.id} output={output} onDismiss={handleDismiss} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Shared micro-styles ───────────────────────────────────────────────────────
const iconBtn = {
  width: 28,
  height: 28,
  borderRadius: 7,
  border: '1px solid var(--border, #e5e7eb)',
  background: 'transparent',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: 'var(--text-secondary, #6b7280)',
  flexShrink: 0,
};

const sectionLabel = {
  margin: '0 0 8px',
  fontSize: '0.65rem',
  fontWeight: 700,
  color: 'var(--text-secondary, #9ca3af)',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
};