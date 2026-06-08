import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Key, Plus, Trash2, Zap, ChevronRight, Eye, EyeOff,
  Wifi, WifiOff, BrainCircuit, Activity, Shield, Volume2, VolumeX,
  CheckCircle, AlertCircle, Loader2,
} from 'lucide-react';
import GeneralLayout from '../../../components/layout/GeneralLayout';
import aiAnalyticsAPI from '../../../api/aiAnalytics';

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:       '#0a0a0f',
  bgCard:   '#0d0d1a',
  bgInput:  '#080810',
  blue:     '#3b82f6',
  cyan:     '#06b6d4',
  purple:   '#a855f7',
  green:    '#10b981',
  red:      '#ef4444',
  border:   'rgba(59,130,246,0.2)',
  borderHi: 'rgba(59,130,246,0.5)',
  text:     '#e2e8f0',
  textMid:  '#94a3b8',
  textDim:  '#475569',
  glow:     '0 0 20px rgba(59,130,246,0.3)',
  glowCyan: '0 0 20px rgba(6,182,212,0.3)',
};

const PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic',  color: '#a855f7', desc: 'Claude models' },
  { value: 'gemini',    label: 'Gemini',     color: '#3b82f6', desc: 'Google AI'     },
  { value: 'openai',    label: 'OpenAI',     color: '#10b981', desc: 'GPT models'    },
  { value: 'mistral',   label: 'Mistral',    color: '#f59e0b', desc: 'Mistral AI'    },
  { value: 'cohere',    label: 'Cohere',     color: '#06b6d4', desc: 'Command models'},
];

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

// ── Neural net background canvas ──────────────────────────────────────────────
function NeuralCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Generate nodes
    const NODE_COUNT = 28;
    const nodes = Array.from({ length: NODE_COUNT }, () => ({
      x:   Math.random() * canvas.width,
      y:   Math.random() * canvas.height,
      vx:  (Math.random() - 0.5) * 0.3,
      vy:  (Math.random() - 0.5) * 0.3,
      r:   Math.random() * 2.5 + 1,
      pulse: Math.random() * Math.PI * 2,
    }));

    // Animated data packets along edges
    const packets = [];

    let frame;
    let t = 0;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      t += 0.008;

      // Move nodes
      nodes.forEach(n => {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > canvas.width)  n.vx *= -1;
        if (n.y < 0 || n.y > canvas.height)  n.vy *= -1;
        n.pulse += 0.02;
      });

      // Draw edges
      const MAX_DIST = 180;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx   = nodes[j].x - nodes[i].x;
          const dy   = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > MAX_DIST) continue;

          const alpha = (1 - dist / MAX_DIST) * 0.25;
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.strokeStyle = `rgba(59,130,246,${alpha})`;
          ctx.lineWidth   = 0.8;
          ctx.stroke();

          // Occasionally spawn a packet
          if (Math.random() < 0.0008) {
            packets.push({ from: i, to: j, progress: 0, speed: Math.random() * 0.008 + 0.004, color: Math.random() > 0.5 ? C.cyan : C.blue });
          }
        }
      }

      // Draw packets
      for (let i = packets.length - 1; i >= 0; i--) {
        const p  = packets[i];
        p.progress += p.speed;
        if (p.progress >= 1) { packets.splice(i, 1); continue; }
        const from = nodes[p.from];
        const to   = nodes[p.to];
        const px   = from.x + (to.x - from.x) * p.progress;
        const py   = from.y + (to.y - from.y) * p.progress;
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur  = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Draw nodes
      nodes.forEach(n => {
        const pulse = Math.sin(n.pulse) * 0.5 + 0.5;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + pulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(59,130,246,${0.4 + pulse * 0.4})`;
        ctx.shadowColor = C.blue;
        ctx.shadowBlur  = 6 + pulse * 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      frame = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        opacity: 0.4, pointerEvents: 'none',
      }}
    />
  );
}

// ── Scanline overlay ──────────────────────────────────────────────────────────
function Scanlines() {
  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
      backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
    }} />
  );
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────
function Breadcrumb({ items, onHover }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', marginBottom: 28, fontFamily: 'monospace' }}>
      {items.map((item, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {item.onClick ? (
            <button
              onClick={item.onClick}
              onMouseEnter={onHover}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.cyan, fontWeight: 700, fontSize: '0.72rem', fontFamily: 'monospace', padding: 0, textShadow: `0 0 8px ${C.cyan}` }}
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

  const [form, setForm] = useState({ provider: 'anthropic', label: '', api_key: '' });

  // ── Load keys ─────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const data = await aiAnalyticsAPI.getKeys();
      setKeys(data);
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

  // ── Add key ───────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!form.label.trim() || !form.api_key.trim()) {
      audio.playError();
      return;
    }
    setSaving(true);
    try {
      await aiAnalyticsAPI.addKey(form);
      audio.playSuccess();
      setForm({ provider: 'anthropic', label: '', api_key: '' });
      setShowForm(false);
      await load();
    } catch {
      audio.playError();
    } finally {
      setSaving(false);
    }
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

  const providerMeta = (p) => PROVIDERS.find(pr => pr.value === p) ?? PROVIDERS[0];

  return (
    <GeneralLayout>
      <div
        onClick={handleFirstInteraction}
        style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'DM Sans', sans-serif", position: 'relative', overflow: 'hidden' }}>

        {/* ── Neural background ── */}
        <NeuralCanvas />
        <Scanlines />

        {/* ── Content ── */}
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>

          {/* ── Mute toggle ── */}
          <div style={{ position: 'absolute', top: 32, right: 24, zIndex: 10 }}>
            <button
              onClick={(e) => { e.stopPropagation(); audio.toggleMute(); }}
              onMouseEnter={audio.playHover}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.4)', color: C.textMid, cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'monospace', backdropFilter: 'blur(8px)' }}
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
                <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em', fontFamily: 'monospace', background: `linear-gradient(135deg, ${C.blue}, ${C.cyan})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  API KEY MANAGEMENT
                </h1>
                <p style={{ margin: 0, fontSize: '0.75rem', color: C.textMid, fontFamily: 'monospace', letterSpacing: '0.1em' }}>
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
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, border: `1px solid ${C.blue}`, background: `rgba(59,130,246,0.1)`, color: C.blue, cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.06em', boxShadow: C.glow, transition: 'all 150ms' }}
            >
              <Plus size={15} /> + NEW KEY
            </button>
          </div>

          {/* ── Add key form ── */}
          {showForm && (
            <div style={{ marginBottom: 24, padding: 24, borderRadius: 14, border: `1px solid ${C.borderHi}`, background: 'rgba(59,130,246,0.04)', backdropFilter: 'blur(12px)', animation: 'fadeIn 0.2s ease', boxShadow: C.glow }}>
              <p style={{ margin: '0 0 20px', fontSize: '0.72rem', fontFamily: 'monospace', color: C.cyan, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                ▸ REGISTER NEW PROVIDER KEY
              </p>

              {/* Provider selector */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 16 }}>
                {PROVIDERS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => { setForm(f => ({ ...f, provider: p.value })); audio.playHover(); }}
                    onMouseEnter={audio.playHover}
                    style={{ padding: '10px 8px', borderRadius: 8, border: `1px solid ${form.provider === p.value ? p.color : C.border}`, background: form.provider === p.value ? `${p.color}18` : 'transparent', color: form.provider === p.value ? p.color : C.textMid, cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 700, transition: 'all 150ms', boxShadow: form.provider === p.value ? `0 0 12px ${p.color}40` : 'none', textAlign: 'center' }}
                  >
                    <div style={{ fontSize: '0.78rem', fontWeight: 800 }}>{p.label}</div>
                    <div style={{ fontSize: '0.62rem', opacity: 0.7, marginTop: 2 }}>{p.desc}</div>
                  </button>
                ))}
              </div>

              {/* Label */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMid, letterSpacing: '0.12em', marginBottom: 6, textTransform: 'uppercase' }}>KEY LABEL</label>
                <input
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. Primary Anthropic Key"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bgInput, color: C.text, fontFamily: 'monospace', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box', transition: 'border-color 150ms' }}
                  onFocus={e => e.target.style.borderColor = C.cyan}
                  onBlur={e => e.target.style.borderColor = C.border}
                />
              </div>

              {/* API key */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.65rem', fontFamily: 'monospace', color: C.textMid, letterSpacing: '0.12em', marginBottom: 6, textTransform: 'uppercase' }}>API KEY</label>
                <input
                  type="password"
                  value={form.api_key}
                  onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
                  placeholder="sk-••••••••••••••••"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bgInput, color: C.text, fontFamily: 'monospace', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box', transition: 'border-color 150ms' }}
                  onFocus={e => e.target.style.borderColor = C.cyan}
                  onBlur={e => e.target.style.borderColor = C.border}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setShowForm(false); audio.playHover(); }}
                  onMouseEnter={audio.playHover}
                  style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.textMid, cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.78rem' }}
                >
                  CANCEL
                </button>
                <button
                  onClick={handleAdd}
                  onMouseEnter={audio.playHover}
                  disabled={saving}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 8, border: `1px solid ${C.cyan}`, background: `rgba(6,182,212,0.12)`, color: C.cyan, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 700, boxShadow: C.glowCyan, opacity: saving ? 0.7 : 1 }}
                >
                  {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Shield size={13} />}
                  {saving ? 'REGISTERING…' : 'REGISTER KEY'}
                </button>
              </div>
            </div>
          )}

          {/* ── Keys list ── */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 12 }}>
              <Loader2 size={22} style={{ color: C.blue, animation: 'spin 1s linear infinite' }} />
              <span style={{ fontFamily: 'monospace', color: C.textMid, fontSize: '0.8rem', letterSpacing: '0.1em' }}>INITIALISING…</span>
            </div>
          ) : keys.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <BrainCircuit size={48} style={{ color: C.textDim, display: 'block', margin: '0 auto 16px', filter: `drop-shadow(0 0 8px ${C.blue}40)` }} />
              <p style={{ fontFamily: 'monospace', color: C.textMid, fontSize: '0.82rem', letterSpacing: '0.08em' }}>NO KEYS REGISTERED</p>
              <p style={{ fontFamily: 'monospace', color: C.textDim, fontSize: '0.72rem', marginTop: 4 }}>Register a provider key to activate AI analytics</p>
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
                      <div style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${meta.color}40`, background: `${meta.color}12`, fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 800, color: meta.color, letterSpacing: '0.1em', textShadow: `0 0 8px ${meta.color}`, flexShrink: 0 }}>
                        {meta.label.toUpperCase()}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: C.text, fontFamily: 'monospace' }}>{key.label}</p>
                        <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: C.textDim, fontFamily: 'monospace' }}>
                          Added by {key.created_by} · {key.last_used_at ? `Last used ${new Date(key.last_used_at).toLocaleDateString()}` : 'Never used'}
                        </p>
                      </div>

                      {/* Status */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {key.is_active ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: `${meta.color}15`, border: `1px solid ${meta.color}40` }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, boxShadow: `0 0 6px ${meta.color}`, animation: 'pulse 2s ease-in-out infinite' }} />
                            <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: meta.color, fontWeight: 700, letterSpacing: '0.08em' }}>ACTIVE</span>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: 'rgba(71,85,105,0.15)', border: `1px solid ${C.border}` }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.textDim }} />
                            <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: C.textDim, fontWeight: 700, letterSpacing: '0.08em' }}>STANDBY</span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        {!key.is_active && (
                          <button
                            onClick={() => handleActivate(key.id)}
                            onMouseEnter={audio.playHover}
                            disabled={!!activating}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 8, border: `1px solid ${meta.color}50`, background: `${meta.color}10`, color: meta.color, cursor: activating ? 'not-allowed' : 'pointer', fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', transition: 'all 150ms' }}
                          >
                            {activating === key.id
                              ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                              : <Zap size={11} />}
                            ACTIVATE
                          </button>
                        )}

                        {!key.is_active && (
                          <button
                            onClick={() => handleDelete(key.id)}
                            onMouseEnter={audio.playHover}
                            disabled={!!deleting}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: `1px solid rgba(239,68,68,0.3)`, background: 'rgba(239,68,68,0.06)', color: C.red, cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'monospace', fontSize: '0.72rem', transition: 'all 150ms' }}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'monospace', fontSize: '0.65rem', color: C.textDim }}>
              <Activity size={11} style={{ color: C.blue }} />
              {keys.length} KEY{keys.length !== 1 ? 'S' : ''} REGISTERED · {keys.filter(k => k.is_active).length} ACTIVE
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'monospace', fontSize: '0.65rem', color: C.textDim }}>
              {audio.muted ? <WifiOff size={11} /> : <Wifi size={11} style={{ color: C.green, animation: 'pulse 2s infinite' }} />}
              {audio.muted ? 'AUDIO DISABLED' : 'AUDIO ACTIVE'}
            </div>
          </div>

        </div>
      </div>
    </GeneralLayout>
  );
}