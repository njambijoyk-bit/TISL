import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store';
import AdminLayout from '../../components/layout/AdminLayout';
import customerTiersAPI from '../../api/customerTiers';
import {
  Clock, RefreshCw, TrendingUp, Star, MessageSquare, Wrench, 
  Share2, BrainCircuit,BarChart2, SlidersHorizontal, GitBranch,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// ── Signal definitions ─────────────────────────────────────────────────────────
const SIGNALS = [
  { key: 'recency',    label: 'Recency',    icon: Clock,         color: '#f97316', desc: 'Days since last order' },
  { key: 'frequency',  label: 'Frequency',  icon: RefreshCw,     color: '#3b82f6', desc: 'Order count (log scale)' },
  { key: 'monetary',   label: 'Monetary',   icon: TrendingUp,    color: '#10b981', desc: 'Spend percentile vs all customers' },
  { key: 'loyalty',    label: 'Loyalty',    icon: Star,          color: '#f59e0b', desc: 'Loyalty points balance' },
  { key: 'engagement', label: 'Engagement', icon: MessageSquare, color: '#8b5cf6', desc: 'Reviews + bids + quote requests' },
  { key: 'service',    label: 'Service',    icon: Wrench,        color: '#06b6d4', desc: 'Bookings + service order items' },
  { key: 'referral',   label: 'Referral',   icon: Share2,        color: '#ec4899', desc: 'Completed referrals made' },
];

// Drop TIER_COLORS entirely. Add these two instead:

const TIER_STYLES_FALLBACK = {
  bronze:   { bg: 'rgba(249,115,22,0.1)',  color: '#c2410c', ring: 'rgba(249,115,22,0.25)'  },
  silver:   { bg: 'rgba(107,114,128,0.1)', color: '#4b5563', ring: 'rgba(107,114,128,0.2)'  },
  gold:     { bg: 'rgba(234,179,8,0.1)',   color: '#b45309', ring: 'rgba(234,179,8,0.25)'   },
  platinum: { bg: 'rgba(168,85,247,0.1)',  color: '#7c3aed', ring: 'rgba(168,85,247,0.25)'  },
  diamond:  { bg: 'rgba(6,182,212,0.1)',   color: '#0e7490', ring: 'rgba(6,182,212,0.25)'   },
};

const CUSTOMER_FIELDS = [
  'tier', 'customer_type', 'total_orders', 'total_spent',
  'loyalty_points', 'status', 'has_credit_account',
];

const scoreColor = (s) => {
  if (s >= 75) return '#10b981';
  if (s >= 50) return '#f59e0b';
  if (s >= 25) return '#f97316';
  return '#ef4444';
};

function tierStyle(slug, tierOptions = []) {
  const opt = tierOptions.find(t => t.slug === slug);
  if (opt?.color) {
    return { bg: `${opt.color}18`, color: opt.color, ring: `${opt.color}40` };
  }
  return TIER_STYLES_FALLBACK[slug] ?? TIER_STYLES_FALLBACK.silver;
}

// ── Tiny reusable pieces ───────────────────────────────────────────────────────
function ScoreBar({ value, color, height = 6 }) {
  return (
    <div style={{ background: 'rgba(168,85,247,0.12)', borderRadius: 4, height, overflow: 'hidden' }}>
      <div style={{
        height, width: `${Math.min(100, Math.max(0, value))}%`,
        background: color || scoreColor(value),
        borderRadius: 4, transition: 'width 0.45s ease',
      }} />
    </div>
  );
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <div
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 42, height: 24, borderRadius: 12,
        background: checked ? '#a855f7' : 'rgba(168,85,247,0.15)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative', transition: 'background 0.2s',
        flexShrink: 0, opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{
        position: 'absolute', top: 4,
        left: checked ? 22 : 4,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
      }} />
    </div>
  );
}

function TierBadge({ tier, tierOptions = [] }) {
  const { bg, color, ring } = tierStyle(tier, tierOptions);
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px',
      borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.05em',
      background: bg, color,
      boxShadow: `0 0 0 1px ${ring}`,
    }}>
      {tier || '—'}
    </span>
  );
}

function Spinner({ size = 18 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `2px solid rgba(168,85,247,0.2)`,
      borderTopColor: '#a855f7',
      animation: 'algoSpin 600ms linear infinite',
      display: 'inline-block', flexShrink: 0,
    }} />
  );
}

// ── Rule modal ─────────────────────────────────────────────────────────────────
function RuleModal({ rule, onClose, onSave }) {
  const blank = {
    name: '', boost_signal: 'recency', boost_percent: 10,
    action_label: '', is_active: true,
    condition: { field: 'tier', operator: '=', value: '' },
  };
  const [form, setForm] = useState(rule ?? blank);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setCond = (k, v) => setForm(f => ({ ...f, condition: { ...f.condition, [k]: v } }));

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Name is required.');
    if (!form.condition.value) return toast.error('Condition value is required.');
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1px solid rgba(168,85,247,0.25)',
    background: 'var(--bg-secondary, #f9fafb)',
    color: 'var(--text-primary, #111827)',
    fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #6b7280)', marginBottom: 4, display: 'block' };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: 'var(--bg-primary, #fff)', borderRadius: 16,
        width: '100%', maxWidth: 520,
        boxShadow: '0 24px 60px rgba(0,0,0,0.2)',
        border: '1px solid rgba(168,85,247,0.15)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid rgba(168,85,247,0.1)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'linear-gradient(135deg, rgba(168,85,247,0.08), rgba(124,58,237,0.04))',
        }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary, #111827)' }}>
            {rule ? 'Edit Segment Rule' : 'New Segment Rule'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-secondary, #6b7280)', lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Rule Name</label>
            <input style={inputStyle} placeholder="e.g. Gold tier loyalty boost" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>

          {/* Condition row */}
          <div>
            <label style={labelStyle}>Condition — when customer's…</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 1fr', gap: 8 }}>
              <select style={inputStyle} value={form.condition.field} onChange={e => setCond('field', e.target.value)}>
                {CUSTOMER_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <select style={inputStyle} value={form.condition.operator} onChange={e => setCond('operator', e.target.value)}>
                {['=', '!=', '>', '>=', '<', '<='].map(op => <option key={op} value={op}>{op}</option>)}
              </select>
              <input style={inputStyle} placeholder="value" value={form.condition.value} onChange={e => setCond('value', e.target.value)} />
            </div>
          </div>

          {/* Boost */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Boost Signal</label>
              <select style={inputStyle} value={form.boost_signal} onChange={e => set('boost_signal', e.target.value)}>
                {SIGNALS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Boost % (negative = penalise)</label>
              <input style={inputStyle} type="number" min={-100} max={500} value={form.boost_percent} onChange={e => set('boost_percent', parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Action Label (shown in panel, optional)</label>
            <input style={inputStyle} placeholder="e.g. VIP service boost" value={form.action_label} onChange={e => set('action_label', e.target.value)} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Toggle checked={form.is_active} onChange={v => set('is_active', v)} />
            <span style={{ fontSize: 13, color: 'var(--text-secondary, #6b7280)' }}>Active</span>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px', borderTop: '1px solid rgba(168,85,247,0.1)',
          display: 'flex', justifyContent: 'flex-end', gap: 10,
        }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid rgba(168,85,247,0.25)', background: 'transparent', color: 'var(--text-secondary, #6b7280)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: saving ? 'rgba(168,85,247,0.5)' : 'linear-gradient(135deg, #a855f7, #7c3aed)',
            color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {saving && <Spinner size={14} />}
            {saving ? 'Saving…' : 'Save Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export default function CustomerAlgorithmPanel() {
  const { user, token } = useAuthStore();
  const isSuperAdmin = user?.role === 'super_admin';

  const [activeTab, setActiveTab] = useState('leaderboard');
  const [scores, setScores] = useState([]);
  const [scoresMeta, setScoresMeta] = useState(null);
  const [scoresPage, setScoresPage] = useState(1);
  const [loadingScores, setLoadingScores] = useState(false);

  const [config, setConfig] = useState({ weights: null, signal_toggles: null });
  const [segmentRules, setSegmentRules] = useState([]);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);

  const [ruleModal, setRuleModal] = useState(null); // null | 'new' | ruleObj
  const [deletingRule, setDeletingRule] = useState(null);
  const [tierOptions, setTierOptions] = useState([]);

  const headers = { Authorization: `Bearer ${token}` };

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadScores = useCallback(async (page = 1) => {
    setLoadingScores(true);
    try {
      const { data } = await axios.get(`${API}/admin/algorithm/scores`, {
        headers, params: { page, per_page: 30 },
      });
      setScores(data.data ?? []);
      setScoresMeta(data);
      setScoresPage(page);
    } catch {
      toast.error('Failed to load scores.');
    } finally {
      setLoadingScores(false);
    }
  }, [token]);

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const { data } = await axios.get(`${API}/admin/algorithm/config`, { headers });
      setConfig({
        weights:        data.weights        ?? defaultWeights(),
        signal_toggles: data.signal_toggles ?? defaultToggles(),
      });
      setSegmentRules(data.segment_rules ?? []);
    } catch {
      toast.error('Failed to load algorithm config.');
    } finally {
      setLoadingConfig(false);
    }
  }, [token]);

  useEffect(() => {
    loadScores(1);
    loadConfig();
  }, []);
  useEffect(() => {
    customerTiersAPI.getTiers().then(res => {
        setTierOptions(res?.data ?? res ?? []);
    }).catch(() => {});
    }, []);

  // ── Run scoring ────────────────────────────────────────────────────────────
  const runScoring = async () => {
    if (!isSuperAdmin) return;
    setRunning(true);
    setRunResult(null);
    try {
      const { data } = await axios.post(`${API}/admin/algorithm/run`, {}, { headers });
      setRunResult(data);
      toast.success(`Scored ${data.scored} customers in ${data.duration_s}s`);
      await loadScores(1);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Scoring run failed.');
    } finally {
      setRunning(false);
    }
  };

  // ── Config save ────────────────────────────────────────────────────────────
  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      await axios.put(`${API}/admin/algorithm/config`, {
        weights:        config.weights,
        signal_toggles: config.signal_toggles,
      }, { headers });
      toast.success('Algorithm config saved.');
    } catch {
      toast.error('Failed to save config.');
    } finally {
      setSavingConfig(false);
    }
  };

  const setWeight = (key, val) =>
    setConfig(c => ({ ...c, weights: { ...c.weights, [key]: val } }));

  const setToggle = (key, val) =>
    setConfig(c => ({ ...c, signal_toggles: { ...c.signal_toggles, [key]: val } }));

  const totalWeight = config.weights
    ? Object.values(config.weights).reduce((a, b) => a + Number(b), 0)
    : 0;

  // ── Segment rules ──────────────────────────────────────────────────────────
  const saveRule = async (form) => {
    try {
      if (form.id) {
        await axios.put(`${API}/admin/algorithm/segment-rules/${form.id}`, form, { headers });
        toast.success('Rule updated.');
      } else {
        await axios.post(`${API}/admin/algorithm/segment-rules`, form, { headers });
        toast.success('Rule created.');
      }
      setRuleModal(null);
      await loadConfig();
    } catch {
      toast.error('Failed to save rule.');
    }
  };

  const deleteRule = async (id) => {
    setDeletingRule(id);
    try {
      await axios.delete(`${API}/admin/algorithm/segment-rules/${id}`, { headers });
      toast.success('Rule deleted.');
      await loadConfig();
    } catch {
      toast.error('Failed to delete rule.');
    } finally {
      setDeletingRule(null);
    }
  };

  // ── Styles ─────────────────────────────────────────────────────────────────
  const s = {
    page: {
      minHeight: '100vh',
      background: 'var(--bg-primary, #f9fafb)',
      padding: '24px',
      fontFamily: 'var(--font-body, system-ui, sans-serif)',
    },
    card: {
      background: 'var(--bg-secondary, #fff)',
      borderRadius: 16,
      border: '1px solid rgba(168,85,247,0.12)',
      boxShadow: '0 2px 12px rgba(168,85,247,0.06)',
      overflow: 'hidden',
    },
    btn: (variant = 'primary') => ({
      padding: '9px 20px', borderRadius: 10, border: 'none',
      fontSize: 13, fontWeight: 600, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 7,
      transition: 'opacity 0.15s',
      ...(variant === 'primary' ? {
        background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
        color: '#fff',
      } : variant === 'danger' ? {
        background: 'rgba(239,68,68,0.1)', color: '#ef4444',
        border: '1px solid rgba(239,68,68,0.2)',
      } : {
        background: 'rgba(168,85,247,0.08)', color: '#a855f7',
        border: '1px solid rgba(168,85,247,0.2)',
      }),
    }),
    tab: (active) => ({
      padding: '10px 20px', borderRadius: 10, cursor: 'pointer',
      fontSize: 13, fontWeight: 600, border: 'none',
      background: active ? 'linear-gradient(135deg, #a855f7, #7c3aed)' : 'transparent',
      color: active ? '#fff' : 'var(--text-secondary, #6b7280)',
      transition: 'all 0.2s',
    }),
    th: {
      padding: '10px 14px', fontSize: 11, fontWeight: 700,
      color: 'var(--text-secondary, #6b7280)', textTransform: 'uppercase',
      letterSpacing: '0.06em', textAlign: 'left',
      borderBottom: '1px solid rgba(168,85,247,0.1)',
      background: 'rgba(168,85,247,0.04)',
    },
    td: {
      padding: '12px 14px', fontSize: 13,
      color: 'var(--text-primary, #111827)',
      borderBottom: '1px solid rgba(168,85,247,0.07)',
      verticalAlign: 'middle',
    },
  };

  return (
    <AdminLayout>
    <div style={s.page}>
      <style>{`
        @keyframes algoSpin { to { transform: rotate(360deg) } }
        .algo-row:hover td { background: rgba(168,85,247,0.03) !important; }
        .algo-btn:hover { opacity: 0.85 !important; }
      `}</style>

      {/* ── Page header ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--text-primary, #111827)' }}>
            Customer Scoring Algorithm
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text-secondary, #6b7280)' }}>
            RFM + Loyalty + Engagement weighted scoring across {scores.length ? scoresMeta?.total?.toLocaleString() ?? '—' : '—'} customers
          </p>
        </div>

        {isSuperAdmin && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <button
              className="algo-btn"
              onClick={runScoring}
              disabled={running}
              style={{ ...s.btn('primary'), opacity: running ? 0.7 : 1, cursor: running ? 'not-allowed' : 'pointer' }}
            >
              {running ? <Spinner size={15} /> : <span>▶</span>}
              {running ? 'Scoring all customers…' : 'Run Scoring Now'}
            </button>
            {runResult && !running && (
              <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>
                ✓ {runResult.scored?.toLocaleString()} scored · {runResult.failed} failed · {runResult.duration_s}s
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Stat strip ────────────────────────────────────────────────── */}
      {scores.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Avg Score', value: (scores.reduce((a, b) => a + parseFloat(b.total_score), 0) / scores.length).toFixed(1) },
            { label: 'High Scorers (≥75)', value: scores.filter(s => parseFloat(s.total_score) >= 75).length },
            { label: 'At Risk (<25)',       value: scores.filter(s => parseFloat(s.total_score) < 25).length },
            { label: 'Signals Active',     value: config.signal_toggles ? Object.values(config.signal_toggles).filter(Boolean).length + '/7' : '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ ...s.card, padding: '14px 18px' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#a855f7' }}>{value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary, #6b7280)', fontWeight: 600, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab bar ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, padding: '6px', background: 'rgba(168,85,247,0.06)', borderRadius: 14, width: 'fit-content' }}>
        {[
            { key: 'leaderboard', label: 'Leaderboard',    Icon: BarChart2          },
            { key: 'config',      label: 'Config',          Icon: SlidersHorizontal  },
            { key: 'rules',       label: 'Segment Rules',   Icon: GitBranch          },
            ].map(({ key, label, Icon }) => (
            <button key={key} style={{ ...s.tab(activeTab === key), display: 'inline-flex', alignItems: 'center', gap: 7 }} onClick={() => setActiveTab(key)}>
                <Icon size={14} />
                {label}
            </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB: LEADERBOARD                                               */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'leaderboard' && (
        <div style={s.card}>
          {loadingScores ? (
            <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
              <Spinner size={32} />
            </div>
          ) : scores.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No scores yet</div>
              <div style={{ fontSize: 13 }}>
                {isSuperAdmin
                  ? 'Click "Run Scoring Now" to generate scores for all customers.'
                  : 'Scores will appear after the next scheduled run.'}
              </div>
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['#', 'Customer', 'Tier', 'Score', 'Recency', 'Frequency', 'Monetary', 'Loyalty', 'Engagement', 'Scored'].map(h => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scores.map((row, i) => {
                      const rank = (scoresPage - 1) * 30 + i + 1;
                      const sc   = parseFloat(row.total_score);
                      return (
                        <tr key={row.customer_id} className="algo-row">
                          {/* Rank */}
                          <td style={{ ...s.td, width: 44, fontWeight: 700, color: rank <= 3 ? '#a855f7' : 'var(--text-secondary, #6b7280)' }}>
                            {rank <= 3 ? ['🥇','🥈','🥉'][rank - 1] : rank}
                          </td>
                          {/* Customer */}
                          <td style={s.td}>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{row.full_name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary, #6b7280)', marginTop: 2 }}>{row.email}</div>
                          </td>
                          {/* Tier */}
                          <td style={s.td}><TierBadge tier={row.tier} tierOptions={tierOptions} /></td>
                          {/* Total score */}
                          <td style={{ ...s.td, minWidth: 100 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontWeight: 800, fontSize: 15, color: scoreColor(sc), minWidth: 36 }}>{sc}</span>
                              <div style={{ flex: 1, minWidth: 60 }}><ScoreBar value={sc} /></div>
                            </div>
                          </td>
                          {/* Signal raws */}
                          {['recency_raw','frequency_raw','monetary_raw','loyalty_raw','engagement_raw'].map(sig => (
                            <td key={sig} style={{ ...s.td, minWidth: 70 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #6b7280)', marginBottom: 3 }}>{row[sig]}</div>
                              <ScoreBar value={row[sig]} height={4} color="rgba(168,85,247,0.5)" />
                            </td>
                          ))}
                          {/* Scored at */}
                          <td style={{ ...s.td, fontSize: 11, color: 'var(--text-secondary, #6b7280)', whiteSpace: 'nowrap' }}>
                            {row.scored_at ? new Date(row.scored_at).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {scoresMeta && scoresMeta.last_page > 1 && (
                <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(168,85,247,0.08)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)' }}>
                    Showing {scoresMeta.from}–{scoresMeta.to} of {scoresMeta.total?.toLocaleString()} customers
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="algo-btn" style={{ ...s.btn('ghost'), padding: '6px 14px' }} disabled={scoresPage <= 1} onClick={() => loadScores(scoresPage - 1)}>← Prev</button>
                    <button className="algo-btn" style={{ ...s.btn('ghost'), padding: '6px 14px' }} disabled={scoresPage >= scoresMeta.last_page} onClick={() => loadScores(scoresPage + 1)}>Next →</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB: CONFIG                                                    */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'config' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,340px)', gap: 20, alignItems: 'start' }}>

          {/* Weight sliders */}
          <div style={s.card}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(168,85,247,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary, #111827)' }}>Signal Weights</h2>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-secondary, #6b7280)' }}>Adjust how much each signal contributes to the final score.</p>
              </div>
              <div style={{
                fontSize: 13, fontWeight: 700, padding: '4px 14px', borderRadius: 20,
                background: Math.abs(totalWeight - 100) <= 1 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                color: Math.abs(totalWeight - 100) <= 1 ? '#10b981' : '#ef4444',
              }}>
                Total: {totalWeight}
              </div>
            </div>

            {loadingConfig ? (
              <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner size={28} /></div>
            ) : (
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                {SIGNALS.map(sig => {
                  const w  = config.weights?.[sig.key] ?? 0;
                  const on = config.signal_toggles?.[sig.key] ?? true;
                  return (
                    <div key={sig.key} style={{ opacity: on ? 1 : 0.45, transition: 'opacity 0.2s' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <sig.icon size={18} style={{ color: sig.color, flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary, #111827)' }}>{sig.label}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary, #6b7280)' }}>{sig.desc}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 16, fontWeight: 800, color: '#a855f7', minWidth: 28, textAlign: 'right' }}>{w}</span>
                          <Toggle checked={on} onChange={v => setToggle(sig.key, v)} />
                        </div>
                      </div>
                      <input
                        type="range" min={0} max={50} step={1} value={w}
                        onChange={e => setWeight(sig.key, parseInt(e.target.value))}
                        disabled={!on}
                        style={{ width: '100%', accentColor: '#a855f7', cursor: on ? 'pointer' : 'not-allowed' }}
                      />
                    </div>
                  );
                })}

                <div style={{ paddingTop: 8, borderTop: '1px solid rgba(168,85,247,0.1)', display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="algo-btn" onClick={saveConfig} disabled={savingConfig} style={{ ...s.btn('primary'), opacity: savingConfig ? 0.7 : 1 }}>
                    {savingConfig && <Spinner size={14} />}
                    {savingConfig ? 'Saving…' : 'Save Config'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Scoring formula reference card */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={s.card}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(168,85,247,0.1)' }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary, #111827)' }}>Scoring Formula</h3>
              </div>
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontFamily: 'monospace', fontSize: 12, background: 'rgba(168,85,247,0.06)', borderRadius: 8, padding: '10px 14px', color: 'var(--text-primary, #111827)', lineHeight: 1.7 }}>
                  score = Σ(raw_signal<br />
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;× weight / 100)<br /><br />
                  then × segment boosts
                </div>
                {SIGNALS.map(sig => (
                  <div key={sig.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-secondary, #6b7280)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <sig.icon size={12} style={{ color: sig.color }} /> {sig.label}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 60 }}><ScoreBar value={(config.weights?.[sig.key] ?? 0) / 50 * 100} height={5} /></div>
                      <span style={{ fontWeight: 700, color: '#a855f7', minWidth: 24, textAlign: 'right' }}>
                        {config.weights?.[sig.key] ?? 0}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ ...s.card, padding: '16px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary, #6b7280)', marginBottom: 8 }}>SCORE BANDS</div>
              {[['75 – 100', '#10b981', 'High value'],['50 – 74', '#f59e0b', 'Growing'],['25 – 49', '#f97316', 'At risk'],['0 – 24', '#ef4444', 'Dormant']].map(([range, color, label]) => (
                <div key={range} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary, #111827)', minWidth: 60 }}>{range}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary, #6b7280)' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB: SEGMENT RULES                                             */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'rules' && (
        <div style={s.card}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(168,85,247,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary, #111827)' }}>Segment Rules</h2>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-secondary, #6b7280)' }}>Conditional multipliers applied on top of base weights during scoring.</p>
            </div>
            <button className="algo-btn" style={s.btn('primary')} onClick={() => setRuleModal('new')}>+ Add Rule</button>
          </div>

          {loadingConfig ? (
            <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner size={28} /></div>
          ) : segmentRules.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📐</div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>No segment rules yet</div>
              <div style={{ fontSize: 13 }}>Rules let you boost or penalise specific signals for matching customers. For example: boost the loyalty signal by 20% for gold-tier customers.</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Rule Name', 'Condition', 'Boosts Signal', 'Boost %', 'Label', 'Active', ''].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {segmentRules.map(rule => (
                    <tr key={rule.id} className="algo-row">
                      <td style={{ ...s.td, fontWeight: 600 }}>{rule.name}</td>
                      <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12 }}>
                        <span style={{ background: 'rgba(168,85,247,0.08)', borderRadius: 6, padding: '3px 8px' }}>
                          {rule.condition?.field} {rule.condition?.operator} "{rule.condition?.value}"
                        </span>
                      </td>
                      <td style={s.td}>
                        {(() => {
                            const sig = SIGNALS.find(s => s.key === rule.boost_signal);
                            const Icon = sig?.icon;
                            return (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {Icon && <Icon size={13} style={{ color: sig.color, flexShrink: 0 }} />}
                                {sig?.label ?? rule.boost_signal}
                            </span>
                            );
                        })()}
                      </td>
                      <td style={{ ...s.td }}>
                        <span style={{ fontWeight: 700, color: rule.boost_percent >= 0 ? '#10b981' : '#ef4444' }}>
                          {rule.boost_percent >= 0 ? '+' : ''}{rule.boost_percent}%
                        </span>
                      </td>
                      <td style={{ ...s.td, fontSize: 12, color: 'var(--text-secondary, #6b7280)' }}>{rule.action_label || '—'}</td>
                      <td style={s.td}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: rule.is_active ? '#10b981' : '#9ca3af' }} />
                      </td>
                      <td style={{ ...s.td, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button className="algo-btn" style={{ ...s.btn('ghost'), padding: '5px 12px', fontSize: 12 }} onClick={() => setRuleModal(rule)}>Edit</button>
                          <button className="algo-btn" style={{ ...s.btn('danger'), padding: '5px 12px', fontSize: 12 }} disabled={deletingRule === rule.id} onClick={() => deleteRule(rule.id)}>
                            {deletingRule === rule.id ? <Spinner size={12} /> : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Rule modal */}
      {ruleModal && (
        <RuleModal
          rule={ruleModal === 'new' ? null : ruleModal}
          onClose={() => setRuleModal(null)}
          onSave={saveRule}
        />
      )}
    </div>
    </AdminLayout>
  );
}

// ── Defaults (mirror AlgorithmService PHP defaults) ────────────────────────────
function defaultWeights() {
  return { recency: 25, frequency: 20, monetary: 20, loyalty: 15, engagement: 10, service: 5, referral: 5 };
}
function defaultToggles() {
  return { recency: true, frequency: true, monetary: true, loyalty: true, engagement: true, service: true, referral: true };
}