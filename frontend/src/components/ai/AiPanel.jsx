import { useEffect, useRef, useState } from 'react';
import {
  BrainCircuit, X, Minus, ChevronRight, Maximize2, Minimize2,
  Sparkles, AlignLeft, LayoutList,
  Loader2, AlertCircle, CheckCircle,
  Trash2, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react';
import useAiPanelStore from '../../store/useAiPanelStore';
import useAuthStore    from '../../store/authStore';
import aiAnalyticsAPI  from '../../api/aiAnalytics';
import { useAiPageAudio } from '../../pages/admin/ai-analytics/useAiPageAudio';
import { C, MuteButton }  from '../../pages/admin/ai-analytics/AiPageShared';

// ── Constants ─────────────────────────────────────────────────────────────────
const PD = '#7c3aed';
const P  = C.purple;
const PL = 'rgba(168,85,247,0.08)';
const PB = 'rgba(168,85,247,0.2)';

const ADMIN_ROLES = ['admin', 'super_admin', 'manager', 'finance', 'logistics', 'sales_rep'];

const OUTPUT_TYPES = [
  { value: 'summary',        label: 'Summary',   desc: 'High-level overview' },
  { value: 'insight',        label: 'Insight',   desc: 'Patterns & findings' },
  { value: 'risk',           label: 'Risk',      desc: 'Issues & red flags'  },
  { value: 'recommendation', label: 'Recommend', desc: 'Next best actions'   },
];

const TYPE_COLORS = {
  summary:        C.blue,
  insight:        C.green,
  risk:           C.red,
  recommendation: C.amber,
};


// ── Markdown → clean JSX renderer ────────────────────────────────────────────
function renderContent(text) {
  if (!text) return null;
  return text.split('\n').map((line, i) => {
    // ### heading
    const h3 = line.match(/^###\s+(.+)/);
    if (h3) return (
      <p key={i} style={{ margin: '10px 0 4px', fontSize: '0.8rem', fontWeight: 700, color: C.text, letterSpacing: '0.02em' }}>
        {h3[1]}
      </p>
    );
    // ## heading
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) return (
      <p key={i} style={{ margin: '12px 0 4px', fontSize: '0.85rem', fontWeight: 800, color: C.text }}>
        {h2[1]}
      </p>
    );
    // - bullet or * bullet
    const bullet = line.match(/^[-*]\s+(.+)/);
    if (bullet) return (
      <div key={i} style={{ display: 'flex', gap: 8, margin: '3px 0' }}>
        <span style={{ color: C.purple, flexShrink: 0, marginTop: 1 }}>·</span>
        <span style={{ fontSize: '0.79rem', color: C.text, lineHeight: 1.6 }}>{inlineFormat(bullet[1])}</span>
      </div>
    );
    // blank line
    if (line.trim() === '') return <div key={i} style={{ height: 6 }} />;
    // normal paragraph
    return (
      <p key={i} style={{ margin: '2px 0', fontSize: '0.79rem', color: C.text, lineHeight: 1.65 }}>
        {inlineFormat(line)}
      </p>
    );
  });
}

// inline **bold** and *italic* → spans
function inlineFormat(text) {
  const parts = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] !== undefined) parts.push(<strong key={m.index} style={{ fontWeight: 700, color: C.text }}>{m[1]}</strong>);
    else parts.push(<em key={m.index} style={{ fontStyle: 'italic', color: C.textMid }}>{m[2]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

// ── Output card ───────────────────────────────────────────────────────────────
function OutputCard({ output, onDismiss, audio }) {
  const [expanded, setExpanded] = useState(true);
  const color = TYPE_COLORS[output.output_type] ?? '#9ca3af';

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
        onClick={() => { setExpanded(e => !e); audio.playHover(); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px', cursor: 'pointer',
          background: `${color}0a`,
        }}
      >
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{
          flex: 1, fontSize: '0.72rem', fontWeight: 700, color,
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          {output.output_type}
        </span>
        <span style={{ fontSize: '0.65rem', color: C.textMid }}>
          {new Date(output.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
        <button
          onClick={e => { e.stopPropagation(); audio.playDelete(); onDismiss(output.id); }}
          onMouseEnter={audio.playHover}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMid, padding: 2, display: 'flex', marginLeft: 4 }}
        >
          <Trash2 size={11} />
        </button>
        {expanded
          ? <ChevronUp   size={12} style={{ color: C.textMid }} />
          : <ChevronDown size={12} style={{ color: C.textMid }} />
        }
      </div>

      {/* Content */}
      {expanded && (
        <div style={{
          padding: '10px 12px 12px',
          fontSize: '0.8rem', color: C.text,
          lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {renderContent(output.content)}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function AiPanel() {
  const { user } = useAuthStore();
  const isAdmin  = ADMIN_ROLES.includes(user?.role);
  const audio    = useAiPageAudio();
  const [maximised, setMaximised] = useState(false);

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
        audio.playSuccess();
      }
    } catch (e) {
      setError(e?.response?.data?.message ?? 'Analysis failed. Check your active key.');
      audio.playError();
    } finally {
      setLoading(false);
    }
  };

  // ── Dismiss output ────────────────────────────────────────────
  const handleDismiss = async (id) => {
    dismissOutput(id);
    try { await aiAnalyticsAPI.dismissOutput(id); } catch {}
  };

  // ── Toggle open with audio ────────────────────────────────────
  const handleToggleOpen = () => {
    audio.playActivate();
    toggleOpen();
  };

  const handleClose = () => {
    audio.playDelete();
    close();
  };

  const handleToggleMinimise = () => {
    audio.playHover();
    if (maximised) { setMaximised(false); return; }
    toggleMinimise();
  };

  const handleMaximise = () => {
    audio.playHover();
    if (minimised) toggleMinimise();
    setMaximised(m => !m);
  };

  // ── Don't render for non-admin ────────────────────────────────
  if (!isAdmin) return null;

  // ── Tab (collapsed trigger) ───────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={handleToggleOpen}
        onMouseEnter={audio.playHover}
        title="AI Panel"
        style={{
          position: 'fixed', right: 0, top: '50%',
          transform: 'translateY(-50%)', zIndex: 9999,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 6,
          padding: '14px 8px',
          background: `linear-gradient(180deg, ${PD}, ${P})`,
          border: 'none', borderRadius: '10px 0 0 10px',
          cursor: 'pointer',
          boxShadow: '-2px 0 16px rgba(168,85,247,0.25)',
          color: '#fff', writingMode: 'vertical-rl',
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

  // ── Minimised strip ──────────────────────────────────────────────────────
  if (minimised) {
    return (
      <button
        onClick={handleToggleMinimise}
        onMouseEnter={audio.playHover}
        title="Expand AI Panel"
        style={{
          position: 'fixed', right: 0, top: 0, bottom: 0,
          width: 52, zIndex: 9999,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12,
          background: `linear-gradient(180deg, ${PD}cc, ${P}cc)`,
          backdropFilter: 'blur(8px)',
          border: 'none', borderLeft: `1px solid ${P}40`,
          cursor: 'pointer',
          boxShadow: '-2px 0 20px rgba(168,85,247,0.2)',
          color: '#fff', fontFamily: 'inherit',
        }}
      >
        <BrainCircuit size={18} color="#fff" style={{ filter: `drop-shadow(0 0 6px ${P})` }} />
        <span style={{
          fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.14em',
          textTransform: 'uppercase', writingMode: 'vertical-rl',
          transform: 'rotate(180deg)', color: 'rgba(255,255,255,0.8)',
        }}>
          AI PANEL
        </span>
        <ChevronRight size={14} color="rgba(255,255,255,0.6)" style={{ transform: 'rotate(180deg)' }} />
      </button>
    );
  }

  // ── Full panel ────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0,
      width: maximised ? '60vw' : 340,
      zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg-secondary, #ffffff)',
      borderLeft: `1px solid ${C.border}`,
      boxShadow: `-4px 0 24px rgba(168,85,247,0.12)`,
      transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)',
      overflow: 'hidden',
      fontFamily: 'inherit',
    }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 12px', height: 52,
        borderBottom: `1px solid ${C.border}`,
        background: PL, flexShrink: 0,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: `linear-gradient(135deg,${PD},${P})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          boxShadow: `0 0 10px ${P}40`,
        }}>
          <BrainCircuit size={15} color="#fff" />
        </div>

        {!minimised && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 800, color: C.text }}>AI Assistant</p>
              {context && (
                <p style={{ margin: 0, fontSize: '0.65rem', color: P, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {context.label}
                </p>
              )}
            </div>

            {/* Mute button */}
            <MuteButton muted={audio.muted} onToggle={audio.toggleMute} onHover={audio.playHover} />

            <button onClick={handleMaximise} onMouseEnter={audio.playHover} style={iconBtn} title={maximised ? 'Restore' : 'Maximise'}>
              {maximised ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
            <button onClick={handleToggleMinimise} onMouseEnter={audio.playHover} style={iconBtn} title="Minimise">
              <Minus size={13} />
            </button>
            <button onClick={handleClose} onMouseEnter={audio.playHover} style={iconBtn} title="Close">
              <X size={13} />
            </button>
          </>
        )}

      </div>

      {/* ── Body ── */}
      {!minimised && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── No context ── */}
          {!context && (
            <div style={{ textAlign: 'center', padding: '40px 16px' }}>
              <BrainCircuit size={36} style={{ color: C.textDim, margin: '0 auto 12px', display: 'block' }} />
              <p style={{ fontSize: '0.82rem', color: C.textMid, margin: '0 0 4px' }}>No context detected</p>
              <p style={{ fontSize: '0.72rem', color: C.textMid, margin: 0, lineHeight: 1.5 }}>
                Navigate to a project, booking, order, or customer page to enable AI scanning
              </p>
            </div>
          )}

          {context && (
            <>
              {/* ── Context chip ── */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 8,
                background: PL, border: `1px solid ${PB}`,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: P, flexShrink: 0, boxShadow: `0 0 5px ${P}` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: P }}>{context.label}</p>
                  <p style={{ margin: 0, fontSize: '0.62rem', color: C.textMid, fontFamily: 'monospace' }}>
                    module: {context.moduleKey}{context.entityType ? ` · ${context.entityType}` : ''}
                  </p>
                </div>
              </div>

              {/* ── Mode toggle ── */}
              <div>
                <p style={sectionLabel}>Analysis Mode</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {[
                    { value: 'structured', label: 'Structured', icon: LayoutList, desc: 'Choose output type' },
                    { value: 'freeform',   label: 'Free Form',  icon: AlignLeft,  desc: 'Write your prompt' },
                  ].map(({ value, label, icon: Icon, desc }) => (
                    <button
                      key={value}
                      onClick={() => { setMode(value); audio.playHover(); }}
                      onMouseEnter={audio.playHover}
                      style={{
                        padding: '10px', borderRadius: 8,
                        border: `1px solid ${mode === value ? P : C.border}`,
                        background: mode === value ? PL : 'transparent',
                        cursor: 'pointer', fontFamily: 'inherit',
                        textAlign: 'left', transition: 'all 150ms',
                        boxShadow: mode === value ? `0 0 8px ${P}20` : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <Icon size={13} style={{ color: mode === value ? P : C.textMid }} />
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: mode === value ? P : C.text }}>{label}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.65rem', color: C.textMid }}>{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Structured: output type picker ── */}
              {mode === 'structured' && (
                <div>
                  <p style={sectionLabel}>Output Type</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {OUTPUT_TYPES.map(({ value, label, desc }) => {
                      const color = TYPE_COLORS[value];
                      const active = outputType === value;
                      return (
                        <button
                          key={value}
                          onClick={() => { setOutputType(value); audio.playHover(); }}
                          onMouseEnter={audio.playHover}
                          style={{
                            padding: '8px 10px', borderRadius: 8,
                            border: `1px solid ${active ? color : C.border}`,
                            background: active ? `${color}10` : 'transparent',
                            cursor: 'pointer', fontFamily: 'inherit',
                            textAlign: 'left', transition: 'all 150ms',
                            boxShadow: active ? `0 0 8px ${color}20` : 'none',
                          }}
                        >
                          <p style={{ margin: '0 0 2px', fontSize: '0.75rem', fontWeight: 700, color: active ? color : C.text }}>{label}</p>
                          <p style={{ margin: 0, fontSize: '0.62rem', color: C.textMid }}>{desc}</p>
                        </button>
                      );
                    })}
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
                      width: '100%', padding: '10px 12px',
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      background: 'var(--bg-primary, #f9fafb)',
                      color: C.text,
                      fontFamily: 'inherit', fontSize: '0.82rem',
                      resize: 'vertical', outline: 'none',
                      lineHeight: 1.6, boxSizing: 'border-box',
                      transition: 'border-color 150ms',
                    }}
                    onFocus={e => e.target.style.borderColor = P}
                    onBlur={e => e.target.style.borderColor = C.border}
                  />
                </div>
              )}

              {/* ── Error ── */}
              {error && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  padding: '10px 12px', borderRadius: 8,
                  background: `${C.red}0a`,
                  border: `1px solid ${C.red}30`,
                  boxShadow: `0 0 12px ${C.red}10`,
                }}>
                  <AlertCircle size={13} style={{ color: C.red, flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: '0.75rem', color: C.red, lineHeight: 1.5 }}>{error}</span>
                </div>
              )}

              {/* ── Run button ── */}
              <button
                onClick={handleAnalyse}
                onMouseEnter={audio.playHover}
                disabled={loading || (mode === 'freeform' && !freePrompt.trim())}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '11px 16px', borderRadius: 10, border: 'none',
                  background: loading
                    ? C.border
                    : `linear-gradient(135deg,${PD},${P})`,
                  color: loading ? C.textMid : '#fff',
                  cursor: loading || (mode === 'freeform' && !freePrompt.trim()) ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700,
                  transition: 'all 150ms',
                  boxShadow: loading ? 'none' : `0 4px 14px ${P}40`,
                }}
              >
                {loading
                  ? <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Analysing…</>
                  : <><Sparkles size={14} /> Run Analysis</>
                }
              </button>

              {/* ── Divider ── */}
              <div style={{ borderTop: `1px solid ${C.border}`, margin: '0 -16px' }} />

              {/* ── Past outputs ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <p style={{ ...sectionLabel, margin: 0 }}>Past Results</p>
                  {outputsLoading && <Loader2 size={12} style={{ color: P, animation: 'spin 0.8s linear infinite' }} />}
                  {!outputsLoading && outputs.length > 0 && (
                    <span style={{ fontSize: '0.62rem', color: C.textMid }}>{outputs.length} saved</span>
                  )}
                </div>

                {!outputsLoading && outputs.length === 0 && (
                  <p style={{ fontSize: '0.75rem', color: C.textMid, textAlign: 'center', padding: '20px 0' }}>
                    No saved results yet. Run an analysis above.
                  </p>
                )}

                {outputs.map(output => (
                  <OutputCard key={output.id} output={output} onDismiss={handleDismiss} audio={audio} />
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
  width: 28, height: 28, borderRadius: 7,
  border: `1px solid ${C.border}`,
  background: 'transparent',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', color: C.textMid,
  flexShrink: 0,
};

const sectionLabel = {
  margin: '0 0 8px',
  fontSize: '0.65rem', fontWeight: 700,
  color: C.textDim,
  textTransform: 'uppercase', letterSpacing: '0.1em',
};