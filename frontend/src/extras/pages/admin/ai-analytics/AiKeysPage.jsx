import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Key, Plus, Trash2, Zap, ChevronRight, Eye, EyeOff,
  Wifi, WifiOff, BrainCircuit, Activity, Shield, Volume2, VolumeX,
  CheckCircle, AlertCircle, Loader2,
} from 'lucide-react';
import GeneralLayout from '../../../../_shared/components/layout/GeneralLayout';
import aiAnalyticsAPI from '../../../../_shared/api/aiAnalytics';

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:       'var(--bg-primary)',
  bgCard:   'var(--surface-card, #fff)',
  bgInput:  'var(--surface-input)',
  blue:     'var(--color-primary-500)',
  cyan:     'var(--color-primary-500)',
  purple:   'var(--color-primary-500)',
  green:    '#10b981',
  red:      '#ef4444',
  border:   'color-mix(in srgb, var(--color-primary-500) 18%, transparent)',
  borderHi: 'color-mix(in srgb, var(--color-primary-500) 45%, transparent)',
  text:     'var(--color-text-primary)',
  textMid:  'var(--color-text-secondary)',
  textDim:  'var(--color-text-tertiary)',
  glow:     'none',
  glowCyan: 'none',
};

const COLORS = { anthropic: 'var(--color-primary-500)', gemini: '#3b82f6', openai: '#10b981', qwen: '#f59e0b' };
const USED_FOR = [['all', 'Everything'], ['analytics', 'AI analytics'], ['mimi', 'Mimi chat'], ['screening', 'Careers screening']];
const usedLabel = (u) => USED_FOR.find(([k]) => k === u)?.[1] ?? u;

// ── Audio engine ──────────────────────────────────────────────────────────────
function useAudioEngine() {
  const ctx        = useRef(null);
  const gainNode   = useRef(null);
  const ambientRef = useRef(null);
  const [muted, setMuted] = useState(false);

  const getCtx = useCallback(() => {
    if (!ctx.current) {
      ctx.current  = new (window.AudioContext || window.webkitAudioContext)();
      gainNode.current = ctx.current.createGain();
      gainNode.current.gain.value = muted ? 0 : 0.15;
      gainNode.current.connect(ctx.current.destination);
    }
    if (ctx.current.state === 'suspended') ctx.current.resume();
    return ctx.current;
  }, [muted]);

  // ── Ambient hum ────────────────────────────────────────────────────
  const startAmbient = useCallback(() => {
    if (ambientRef.current) return;
    const ac = getCtx();

    // Low drone
    const osc1 = ac.createOscillator();
    const osc2 = ac.createOscillator();
    const lfo  = ac.createOscillator();
    const lfoGain = ac.createGain();
    const ambGain = ac.createGain();

    osc1.type      = 'sine';
    osc1.frequency.value = 60;
    osc2.type      = 'sine';
    osc2.frequency.value = 63.5; // slight detune = beating effect
    lfo.type       = 'sine';
    lfo.frequency.value  = 0.08; // very slow wobble
    lfoGain.gain.value   = 4;
    ambGain.gain.value   = muted ? 0 : 0.04;

    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    osc1.connect(ambGain);
    osc2.connect(ambGain);
    ambGain.connect(gainNode.current);

    osc1.start(); osc2.start(); lfo.start();
    ambientRef.current = { osc1, osc2, lfo, ambGain };
  }, [getCtx, muted]);

  const stopAmbient = useCallback(() => {
    if (!ambientRef.current) return;
    const { osc1, osc2, lfo } = ambientRef.current;
    try { osc1.stop(); osc2.stop(); lfo.stop(); } catch {}
    ambientRef.current = null;
  }, []);

  // ── Hover blip ─────────────────────────────────────────────────────
  const playHover = useCallback(() => {
    if (muted) return;
    const ac = getCtx();
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ac.currentTime + 0.06);
    gain.gain.setValueAtTime(0.05, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(gainNode.current);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.1);
  }, [getCtx, muted]);

  // ── Activate chord ─────────────────────────────────────────────────
  const playActivate = useCallback(() => {
    if (muted) return;
    const ac = getCtx();
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ac.currentTime + i * 0.06);
      gain.gain.linearRampToValueAtTime(0.08, ac.currentTime + i * 0.06 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + i * 0.06 + 0.4);
      osc.connect(gain);
      gain.connect(gainNode.current);
      osc.start(ac.currentTime + i * 0.06);
      osc.stop(ac.currentTime + i * 0.06 + 0.5);
    });
  }, [getCtx, muted]);

  // ── Delete tone ────────────────────────────────────────────────────
  const playDelete = useCallback(() => {
    if (muted) return;
    const ac = getCtx();
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ac.currentTime + 0.3);
    gain.gain.setValueAtTime(0.08, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(gainNode.current);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.4);
  }, [getCtx, muted]);

  // ── Error buzz ─────────────────────────────────────────────────────
  const playError = useCallback(() => {
    if (muted) return;
    const ac = getCtx();
    [0, 0.1, 0.2].forEach(delay => {
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'square';
      osc.frequency.value = 160;
      gain.gain.setValueAtTime(0.06, ac.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + delay + 0.08);
      osc.connect(gain);
      gain.connect(gainNode.current);
      osc.start(ac.currentTime + delay);
      osc.stop(ac.currentTime + delay + 0.1);
    });
  }, [getCtx, muted]);

  // ── Success ping ───────────────────────────────────────────────────
  const playSuccess = useCallback(() => {
    if (muted) return;
    const ac = getCtx();
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1400, ac.currentTime + 0.15);
    gain.gain.setValueAtTime(0.08, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(gainNode.current);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.35);
  }, [getCtx, muted]);

  const toggleMute = useCallback(() => {
    setMuted(m => {
      const next = !m;
      if (gainNode.current) gainNode.current.gain.value = next ? 0 : 0.15;
      if (ambientRef.current) ambientRef.current.ambGain.gain.value = next ? 0 : 0.04;
      return next;
    });
  }, []);

  // cleanup
  useEffect(() => () => stopAmbient(), [stopAmbient]);

  return { startAmbient, stopAmbient, playHover, playActivate, playDelete, playError, playSuccess, toggleMute, muted };
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────
function Breadcrumb({ items, onHover }) {
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AiKeysPage() {
  const navigate = useNavigate();
  const audio    = useAudioEngine();

  const [keys,    setKeys]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showKey,  setShowKey]  = useState({});
  const [activating, setActivating] = useState(null);
  const [deleting,   setDeleting]   = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [ambientOn,  setAmbientOn]  = useState(false);

  const BLANK = { provider: 'anthropic', label: '', api_key: '', model: '', base_url: '', used_for: 'all' };
  const [form, setForm] = useState(BLANK);
  const [meta, setMeta] = useState({ providers: [], first_choice: {}, columns_ready: true });
  const [editing, setEditing] = useState(null);     // id of the key being edited
  const [testing, setTesting] = useState(null);
  const [tests, setTests] = useState({});           // id → test result
  const [formError, setFormError] = useState(null);
  const PROVIDERS = (meta.providers ?? []).map(p => ({ ...p, color: COLORS[p.value] ?? 'var(--text-secondary)' }));

  // ── Load keys ─────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const data = await aiAnalyticsAPI.getKeys();
      setKeys(data.keys ?? []);
      setMeta({ providers: data.providers ?? [], first_choice: data.first_choice ?? {}, columns_ready: data.columns_ready, purposes: data.purposes });
    } catch {
      setError('Failed to load keys.');
      audio.playError();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── Start ambient on first interaction ───────────────────────────
  const handleFirstInteraction = () => {
    if (!ambientOn && !audio.muted) {
      audio.startAmbient();
      setAmbientOn(true);
    }
  };

  // ── Add or change a key ───────────────────────────────────────────
  const handleAdd = async () => {
    if (!form.label.trim() || (!editing && !form.api_key.trim())) {
      setFormError(editing ? 'Give the key a label.' : 'Give the key a label and paste the key.');
      audio.playError();
      return;
    }
    setSaving(true); setFormError(null);
    try {
      const payload = { ...form, model: form.model || null, base_url: form.base_url || null };
      if (editing) await aiAnalyticsAPI.updateKey(editing, payload); else await aiAnalyticsAPI.addKey(payload);
      audio.playSuccess();
      setForm(BLANK); setEditing(null);
      setShowForm(false);
      await load();
    } catch (e) {
      setFormError(e?.response?.data?.message ?? Object.values(e?.response?.data?.errors ?? {})[0]?.[0] ?? 'Could not save the key.');
      audio.playError();
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (k) => {
    setEditing(k.id); setShowForm(true); setFormError(null);
    setForm({ provider: k.provider, label: k.label, api_key: '', model: k.model ?? '', base_url: k.base_url ?? '', used_for: k.used_for ?? 'all' });
  };

  const handleTest = async (id) => {
    setTesting(id);
    try {
      const r = await aiAnalyticsAPI.testKey(id);
      setTests(t => ({ ...t, [id]: r }));
      r.ok ? audio.playSuccess() : audio.playError();
      await load();
    } catch {
      setTests(t => ({ ...t, [id]: { ok: false, message: 'The test could not be run.' } }));
      audio.playError();
    } finally {
      setTesting(null);
    }
  };

  const handleFirst = async (id) => {
    try { await aiAnalyticsAPI.firstChoice(id); audio.playActivate(); await load(); } catch (e) { setError(e?.response?.data?.message ?? 'Could not change the order.'); audio.playError(); }
  };

  // ── Activate ──────────────────────────────────────────────────────
  const handleActivate = async (id) => {
    setActivating(id);
    try {
      await aiAnalyticsAPI.activateKey(id);
      audio.playActivate();
      await load();
    } catch {
      audio.playError();
    } finally {
      setActivating(null);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!confirm('Remove this key? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await aiAnalyticsAPI.deleteKey(id);
      audio.playDelete();
      await load();
    } catch {
      audio.playError();
    } finally {
      setDeleting(null);
    }
  };

  const providerMeta = (p) => PROVIDERS.find(pr => pr.value === p) ?? { value: p, label: p, color: 'var(--text-secondary)', desc: '', models: [] };

  return (
    <GeneralLayout>
      <div
        onClick={handleFirstInteraction}
        style={{ color: C.text, position: 'relative' }}>

        {/* ── Neural background ── */}

        {/* ── Content ── */}
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>

          {/* ── Mute toggle ── */}
          <div style={{ position: 'absolute', top: 32, right: 24, zIndex: 10 }}>
            <button
              onClick={(e) => { e.stopPropagation(); audio.toggleMute(); }}
              onMouseEnter={audio.playHover}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bgCard, color: C.textMid, cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit' }}
            >
              {audio.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
              {audio.muted ? 'SOUND OFF' : 'SOUND ON'}
            </button>
          </div>

          <Breadcrumb
            onHover={audio.playHover}
            items={[
              { label: '⚙ SETTINGS', onClick: () => navigate('/admin/settings/general') },
              { label: 'AI ANALYTICS', onClick: () => navigate('/admin/ai-analytics') },
              { label: 'API KEYS' },
            ]}
          />

          {/* ── Page header ── */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
              <BrainCircuit size={32} style={{ color: C.blue, filter: `drop-shadow(0 0 8px ${C.blue})` }} />
              <div>
                <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em', fontFamily: 'inherit', background: `linear-gradient(135deg, ${C.blue}, ${C.cyan})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  API KEY MANAGEMENT
                </h1>
                <p style={{ margin: 0, fontSize: '0.75rem', color: C.textMid, fontFamily: 'inherit', letterSpacing: '0.1em' }}>
                  NEURAL NETWORK PROVIDER AUTHENTICATION
                </p>
              </div>
            </div>

            {/* Animated divider */}
            <div style={{ position: 'relative', height: 1, background: C.border, marginTop: 16, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: '30%', background: `linear-gradient(90deg, transparent, ${C.blue}, ${C.cyan}, transparent)`, animation: 'scanLine 3s linear infinite' }} />
            </div>
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
          `}</style>

          {/* ── Add key button ── */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
            <button
              onClick={() => { setShowForm(f => !f); audio.playHover(); }}
              onMouseEnter={audio.playHover}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, border: `1px solid ${C.blue}`, background: `color-mix(in srgb, var(--color-primary-500) 10%, transparent)`, color: C.blue, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.06em', boxShadow: C.glow, transition: 'all 150ms' }}
            >
              <Plus size={15} /> + NEW KEY
            </button>
          </div>

          {/* ── Add key form ── */}
          {showForm && (
            <div style={{ marginBottom: 24, padding: 24, borderRadius: 14, border: `1px solid ${C.borderHi}`, background: 'color-mix(in srgb, var(--color-primary-500) 4%, transparent)', backdropFilter: 'blur(12px)', animation: 'fadeIn 0.2s ease', boxShadow: C.glow }}>
              <p style={{ margin: '0 0 20px', fontSize: '0.72rem', fontFamily: 'inherit', color: C.cyan, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                ▸ {editing ? 'CHANGE KEY' : 'REGISTER NEW PROVIDER KEY'}
              </p>

              {/* Provider selector */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 16 }}>
                {PROVIDERS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => { setForm(f => ({ ...f, provider: p.value })); audio.playHover(); }}
                    onMouseEnter={audio.playHover}
                    style={{ padding: '10px 8px', borderRadius: 8, border: `1px solid ${form.provider === p.value ? p.color : C.border}`, background: form.provider === p.value ? `${p.color}18` : 'transparent', color: form.provider === p.value ? p.color : C.textMid, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700, transition: 'all 150ms', boxShadow: form.provider === p.value ? `0 0 12px ${p.color}40` : 'none', textAlign: 'center' }}
                  >
                    <div style={{ fontSize: '0.78rem', fontWeight: 800 }}>{p.label}</div>
                    <div style={{ fontSize: '0.62rem', opacity: 0.7, marginTop: 2 }}>{p.desc}</div>
                  </button>
                ))}
              </div>

              {/* Model + what it is used for */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.65rem', fontFamily: 'inherit', color: C.textMid, letterSpacing: '0.12em', marginBottom: 6, textTransform: 'uppercase' }}>MODEL (EMPTY = {providerMeta(form.provider).model ?? 'THE DEFAULT'})</label>
                  <input list="ai-models" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} placeholder={providerMeta(form.provider).model}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bgInput, color: C.text, fontFamily: 'inherit', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }} />
                  <datalist id="ai-models">{(providerMeta(form.provider).models ?? []).map(m => <option key={m} value={m} />)}</datalist>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.65rem', fontFamily: 'inherit', color: C.textMid, letterSpacing: '0.12em', marginBottom: 6, textTransform: 'uppercase' }}>USED FOR</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {USED_FOR.map(([k, l]) => (
                      <button key={k} type="button" onClick={() => setForm(f => ({ ...f, used_for: k }))}
                        style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${form.used_for === k ? C.cyan : C.border}`, background: form.used_for === k ? 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)' : 'transparent', color: form.used_for === k ? C.cyan : C.textMid, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 700 }}>{l}</button>
                    ))}
                  </div>
                </div>
              </div>
              {['openai', 'qwen'].includes(form.provider) && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: '0.65rem', fontFamily: 'inherit', color: C.textMid, letterSpacing: '0.12em', marginBottom: 6, textTransform: 'uppercase' }}>ENDPOINT (OPTIONAL — {form.provider === 'qwen' ? 'E.G. https://dashscope.aliyuncs.com/compatible-mode/v1 FOR CHINA' : 'FOR AN OPENAI-COMPATIBLE SERVICE'})</label>
                  <input value={form.base_url} onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))} placeholder={providerMeta(form.provider).base}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bgInput, color: C.text, fontFamily: 'inherit', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              )}

              {/* Label */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.65rem', fontFamily: 'inherit', color: C.textMid, letterSpacing: '0.12em', marginBottom: 6, textTransform: 'uppercase' }}>KEY LABEL</label>
                <input
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. Primary Anthropic Key"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bgInput, color: C.text, fontFamily: 'inherit', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box', transition: 'border-color 150ms' }}
                  onFocus={e => e.target.style.borderColor = C.cyan}
                  onBlur={e => e.target.style.borderColor = C.border}
                />
              </div>

              {/* API key */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.65rem', fontFamily: 'inherit', color: C.textMid, letterSpacing: '0.12em', marginBottom: 6, textTransform: 'uppercase' }}>API KEY{editing ? ' (LEAVE EMPTY TO KEEP THE CURRENT ONE)' : ''}</label>
                <input
                  type="password"
                  value={form.api_key}
                  onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
                  placeholder="sk-••••••••••••••••"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bgInput, color: C.text, fontFamily: 'inherit', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box', transition: 'border-color 150ms' }}
                  onFocus={e => e.target.style.borderColor = C.cyan}
                  onBlur={e => e.target.style.borderColor = C.border}
                />
              </div>

              {formError && <p role="alert" style={{ margin: '0 0 12px', fontFamily: 'inherit', fontSize: '0.74rem', color: C.red }}>{formError}</p>}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setShowForm(false); setEditing(null); setForm(BLANK); setFormError(null); audio.playHover(); }}
                  onMouseEnter={audio.playHover}
                  style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.textMid, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem' }}
                >
                  CANCEL
                </button>
                <button
                  onClick={handleAdd}
                  onMouseEnter={audio.playHover}
                  disabled={saving}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 8, border: `1px solid ${C.cyan}`, background: `color-mix(in srgb, var(--color-primary-500) 12%, transparent)`, color: C.cyan, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700, boxShadow: C.glowCyan, opacity: saving ? 0.7 : 1 }}
                >
                  {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Shield size={13} />}
                  {saving ? 'SAVING…' : (editing ? 'SAVE CHANGES' : 'REGISTER KEY')}
                </button>
              </div>
            </div>
          )}

          {/* ── Keys list ── */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 12 }}>
              <Loader2 size={22} style={{ color: C.blue, animation: 'spin 1s linear infinite' }} />
              <span style={{ fontFamily: 'inherit', color: C.textMid, fontSize: '0.8rem', letterSpacing: '0.1em' }}>INITIALISING…</span>
            </div>
          ) : keys.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <BrainCircuit size={48} style={{ color: C.textDim, display: 'block', margin: '0 auto 16px', filter: `drop-shadow(0 0 8px color-mix(in srgb, var(--color-primary-500) 25%, transparent))` }} />
              <p style={{ fontFamily: 'inherit', color: C.textMid, fontSize: '0.82rem', letterSpacing: '0.08em' }}>NO KEYS REGISTERED</p>
              <p style={{ fontFamily: 'inherit', color: C.textDim, fontSize: '0.72rem', marginTop: 4 }}>Register a provider key to activate AI analytics</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {keys.map(key => {
                const meta = providerMeta(key.provider);
                return (
                  <div
                    key={key.id}
                    onMouseEnter={audio.playHover}
                    style={{ padding: 20, borderRadius: 14, border: `1px solid ${key.is_active ? meta.color : C.border}`, background: key.is_active ? `${meta.color}08` : 'rgba(13,13,26,0.8)', backdropFilter: 'blur(12px)', boxShadow: key.is_active ? `0 0 24px ${meta.color}30, inset 0 0 24px ${meta.color}08` : 'none', transition: 'all 200ms', animation: 'fadeIn 0.3s ease', position: 'relative', overflow: 'hidden' }}
                  >
                    {/* Active glow line */}
                    {key.is_active && (
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${meta.color}, ${C.cyan}, transparent)`, animation: 'scanLine 2s linear infinite' }} />
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>

                      {/* Provider badge */}
                      <div style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${meta.color}40`, background: `${meta.color}12`, fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 800, color: meta.color, letterSpacing: '0.1em', flexShrink: 0 }}>
                        {meta.label.toUpperCase()}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: C.text, fontFamily: 'inherit' }}>{key.label}</p>
                        <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: C.textDim, fontFamily: 'inherit' }}>
                          {key.effective_model} · {key.key_hint} · added by {key.created_by} · {key.last_used_at ? `last used ${new Date(key.last_used_at).toLocaleDateString()}` : 'never used'}
                        </p>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                          <span style={{ fontSize: '0.62rem', fontFamily: 'inherit', padding: '2px 8px', borderRadius: 10, border: `1px solid ${C.border}`, color: C.textMid }}>{usedLabel(key.used_for).toUpperCase()}</span>
                          {Object.entries(meta.first_choice ?? {}).filter(([, id]) => id === key.id).map(([purpose]) => (
                            <span key={purpose} style={{ fontSize: '0.62rem', fontFamily: 'inherit', padding: '2px 8px', borderRadius: 10, border: `1px solid ${C.green}60`, color: C.green }}>FIRST CHOICE · {usedLabel(purpose).toUpperCase()}</span>
                          ))}
                        </div>
                        {key.last_error && <p style={{ margin: '6px 0 0', fontSize: '0.68rem', color: C.red, fontFamily: 'inherit', wordBreak: 'break-word' }}>⚠ {key.last_error}</p>}
                        {tests[key.id] && <p style={{ margin: '6px 0 0', fontSize: '0.68rem', color: tests[key.id].ok ? C.green : C.red, fontFamily: 'inherit', wordBreak: 'break-word' }}>{tests[key.id].ok ? `✓ Works — ${tests[key.id].model} answered in ${tests[key.id].ms} ms` : `✗ ${tests[key.id].message}`}</p>}
                      </div>

                      {/* Status */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {key.is_active ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: `${meta.color}15`, border: `1px solid ${meta.color}40` }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, boxShadow: `0 0 6px ${meta.color}`, animation: 'pulse 2s ease-in-out infinite' }} />
                            <span style={{ fontSize: '0.65rem', fontFamily: 'inherit', color: meta.color, fontWeight: 700, letterSpacing: '0.08em' }}>ACTIVE</span>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: 'rgba(71,85,105,0.15)', border: `1px solid ${C.border}` }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.textDim }} />
                            <span style={{ fontSize: '0.65rem', fontFamily: 'inherit', color: C.textDim, fontWeight: 700, letterSpacing: '0.08em' }}>OFF</span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button onClick={() => handleTest(key.id)} disabled={testing === key.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.textMid, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700 }}>
                          {testing === key.id ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={11} />} TEST
                        </button>
                        <button onClick={() => startEdit(key)}
                          style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.textMid, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700 }}>EDIT</button>
                        {meta.columns_ready && key.is_active && Object.values(meta.first_choice ?? {}).some(id => id !== key.id) && (
                          <button onClick={() => handleFirst(key.id)}
                            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.green}50`, background: 'transparent', color: C.green, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700 }}>FIRST</button>
                        )}
                        {key.is_active && (
                          <button onClick={() => handleActivate(key.id)} disabled={!!activating}
                            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.textDim, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700 }}>SWITCH OFF</button>
                        )}
                        {!key.is_active && (
                          <button
                            onClick={() => handleActivate(key.id)}
                            onMouseEnter={audio.playHover}
                            disabled={!!activating}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 8, border: `1px solid ${meta.color}50`, background: `${meta.color}10`, color: meta.color, cursor: activating ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', transition: 'all 150ms' }}
                          >
                            {activating === key.id
                              ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                              : <Zap size={11} />}
                            SWITCH ON
                          </button>
                        )}

                        {!key.is_active && (
                          <button
                            onClick={() => handleDelete(key.id)}
                            onMouseEnter={audio.playHover}
                            disabled={!!deleting}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: `1px solid rgba(239,68,68,0.3)`, background: 'rgba(239,68,68,0.06)', color: C.red, cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', transition: 'all 150ms' }}
                          >
                            {deleting === key.id
                              ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                              : <Trash2 size={11} />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Footer status bar ── */}
          <div style={{ marginTop: 40, paddingTop: 16, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontSize: '0.65rem', color: C.textDim }}>
              <Activity size={11} style={{ color: C.blue }} />
              {keys.length} KEY{keys.length !== 1 ? 'S' : ''} REGISTERED · {keys.filter(k => k.is_active).length} ACTIVE
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontSize: '0.65rem', color: C.textDim }}>
              {audio.muted ? <WifiOff size={11} /> : <Wifi size={11} style={{ color: C.green, animation: 'pulse 2s infinite' }} />}
              {audio.muted ? 'AUDIO DISABLED' : 'AUDIO ACTIVE'}
            </div>
          </div>

        </div>
      </div>
    </GeneralLayout>
  );
}