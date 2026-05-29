import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store';
import AdminLayout from '../../components/layout/AdminLayout';
import customerTiersAPI from '../../api/customerTiers';
import {
  Clock, RefreshCw, TrendingUp, Star, MessageSquare, Wrench, Tag, Users,
  Share2, BrainCircuit, BarChart2, SlidersHorizontal, GitBranch, Package, Info,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const purple   = '#a855f7';
const purpleLt = 'rgba(168,85,247,0.08)';

// ── Signal definitions ──────────────────────────────────────────────────────────
const SIGNALS = [
  { key: 'recency',    label: 'Recency',    icon: Clock,         color: '#f97316', desc: 'Days since last order' },
  { key: 'frequency',  label: 'Frequency',  icon: RefreshCw,     color: '#3b82f6', desc: 'Order count (log scale)' },
  { key: 'monetary',   label: 'Monetary',   icon: TrendingUp,    color: '#10b981', desc: 'Spend percentile vs all customers' },
  { key: 'loyalty',    label: 'Loyalty',    icon: Star,          color: '#f59e0b', desc: 'Loyalty points balance' },
  { key: 'engagement', label: 'Engagement', icon: MessageSquare, color: '#8b5cf6', desc: 'Reviews + bids + quote requests' },
  { key: 'service',    label: 'Service',    icon: Wrench,        color: '#06b6d4', desc: 'Bookings + service order items' },
  { key: 'referral',   label: 'Referral',   icon: Share2,        color: '#ec4899', desc: 'Completed referrals made' },
];

const BOOST_BADGES = [
  { key: 'promo',        label: 'Promo',        color: '#a855f7' },
  { key: 'social_proof', label: 'Social Proof', color: '#3b82f6' },
  { key: 'bundle',       label: 'Bundle',       color: '#10b981' },
  { key: 'urgency',      label: 'Urgency',      color: '#ef4444' },
  { key: 'tip',          label: 'Tip',          color: '#6b7280' },
];

const SEGMENT_META = {
  champion: { bg: 'rgba(234,179,8,0.12)',   color: '#b45309', label: 'Champion' },
  loyal:    { bg: 'rgba(16,185,129,0.12)',  color: '#047857', label: 'Loyal'    },
  at_risk:  { bg: 'rgba(249,115,22,0.12)', color: '#c2410c', label: 'At Risk'  },
  dormant:  { bg: 'rgba(239,68,68,0.12)',   color: '#b91c1c', label: 'Dormant'  },
  new:      { bg: 'rgba(59,130,246,0.12)',  color: '#1d4ed8', label: 'New'      },
  default:  { bg: 'rgba(107,114,128,0.12)', color: '#4b5563', label: 'Default'  },
};

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
  if (opt?.color) return { bg: `${opt.color}18`, color: opt.color, ring: `${opt.color}40` };
  return TIER_STYLES_FALLBACK[slug] ?? TIER_STYLES_FALLBACK.silver;
}

// ── Reusable primitives ─────────────────────────────────────────────────────────
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
    <div onClick={() => !disabled && onChange(!checked)} style={{
      width: 42, height: 24, borderRadius: 12,
      background: checked ? '#a855f7' : 'rgba(168,85,247,0.15)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      position: 'relative', transition: 'background 0.2s',
      flexShrink: 0, opacity: disabled ? 0.5 : 1,
    }}>
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
      background: bg, color, boxShadow: `0 0 0 1px ${ring}`,
    }}>
      {tier || '—'}
    </span>
  );
}

function SegmentBadge({ segment }) {
  const m = SEGMENT_META[segment] ?? SEGMENT_META.default;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px',
      borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.06em',
      background: m.bg, color: m.color,
    }}>
      {m.label}
    </span>
  );
}

function Pill({ children, color = purple }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: `${color}18`, color,
    }}>{children}</span>
  );
}

function Spinner({ size = 18 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: '2px solid rgba(168,85,247,0.2)',
      borderTopColor: '#a855f7',
      animation: 'algoSpin 600ms linear infinite',
      display: 'inline-block', flexShrink: 0,
    }} />
  );
}

// ── Rule modal ──────────────────────────────────────────────────────────────────
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

  const inp = {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1px solid rgba(168,85,247,0.25)',
    background: 'var(--bg-secondary,#f9fafb)',
    color: 'var(--text-primary,#111827)',
    fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };
  const lbl = { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary,#6b7280)', marginBottom: 4, display: 'block' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-primary,#fff)', borderRadius: 16, width: '100%', maxWidth: 520, boxShadow: '0 24px 60px rgba(0,0,0,0.2)', border: '1px solid rgba(168,85,247,0.15)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(168,85,247,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg,rgba(168,85,247,0.08),rgba(124,58,237,0.04))' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary,#111827)' }}>{rule ? 'Edit Segment Rule' : 'New Segment Rule'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={lbl}>Rule Name</label>
            <input style={inp} placeholder="e.g. Gold tier loyalty boost" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Condition — when customer's…</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 1fr', gap: 8 }}>
              <select style={inp} value={form.condition.field} onChange={e => setCond('field', e.target.value)}>
                {CUSTOMER_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <select style={inp} value={form.condition.operator} onChange={e => setCond('operator', e.target.value)}>
                {['=','!=','>','>=','<','<='].map(op => <option key={op} value={op}>{op}</option>)}
              </select>
              <input style={inp} placeholder="value" value={form.condition.value} onChange={e => setCond('value', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Boost Signal</label>
              <select style={inp} value={form.boost_signal} onChange={e => set('boost_signal', e.target.value)}>
                {SIGNALS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Boost % (negative = penalise)</label>
              <input style={inp} type="number" min={-100} max={500} value={form.boost_percent} onChange={e => set('boost_percent', parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div>
            <label style={lbl}>Action Label (optional)</label>
            <input style={inp} placeholder="e.g. VIP service boost" value={form.action_label} onChange={e => set('action_label', e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Toggle checked={form.is_active} onChange={v => set('is_active', v)} />
            <span style={{ fontSize: 13, color: '#6b7280' }}>Active</span>
          </div>
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(168,85,247,0.1)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid rgba(168,85,247,0.25)', background: 'transparent', color: '#6b7280', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: saving ? 'rgba(168,85,247,0.5)' : 'linear-gradient(135deg,#a855f7,#7c3aed)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            {saving && <Spinner size={14} />}
            {saving ? 'Saving…' : 'Save Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ALGORITHM DEV NOTES ──────────────────────────────────────────────────────
const ALGO_DEV_NOTES = {
  pitfalls: [
    {
      title: "Segment threshold logic duplicated in two places",
      severity: "critical",
      detail: "The score → segment mapping (≥68 champion, ≥48 loyal, recency<20 at_risk, <25 dormant) is copy-pasted verbatim in both CatalogueRankingService::resolveSegmentAndCustomer() and AlgorithmController::getCustomerRankedProducts(). They are independent — changing thresholds in one does not update the other.",
      outcome: "Silent segment mismatch between what the catalogue sorts by and what the admin panel previews. Extract to a static helper: CustomerSegmentResolver::fromScore(float $score, int $recency): string.",
    },
    {
      title: "Default catalogue weights duplicated in the controller",
      severity: "critical",
      detail: "AlgorithmController::getCustomerRankedProducts() hardcodes a full defaults array that mirrors CatalogueRankingService::defaultCatalogueWeights(). Two sources of truth for the same config.",
      outcome: "A future default weight change in the service won't be reflected in the admin preview endpoint. The controller defaults should call the service or read from the same source.",
    },
    {
      title: "persistScore() in the controller uses insert() not updateOrInsert()",
      severity: "critical",
      detail: "AlgorithmService::saveScore() correctly uses updateOrInsert(), but AlgorithmController::persistScore() calls insert() directly. Every time Run Scoring Now is clicked, a new row is inserted — the table grows unbounded.",
      outcome: "Leaderboard query masks this via MAX(scored_at), so scores look correct. But the table balloons silently. Fix: use updateOrInsert(['customer_id' => ...], [...]) in the controller helper, or just call $this->algorithm->runFullScoring() directly.",
    },
    {
      title: "monetaryPercentRank fires 2 DB queries per customer inside the chunk loop",
      severity: "warning",
      detail: "For every customer scored, computeRawSignals() calls monetaryPercentRank() which runs COUNT(*) and COUNT(WHERE total_spent < X). In a batch of 500 customers that is 1,000 extra queries on top of the chunk.",
      outcome: "Batch scoring becomes very slow at scale. Fix: precompute a ranked list of all customer total_spent values once before the chunk loop using a window function or a sorted array, then do a binary search per customer.",
    },
    {
      title: "engagementScore and serviceScore each fire 2–3 queries per customer",
      severity: "warning",
      detail: "Inside the chunk loop, engagementScore() runs 3 queries (reviews, bids, quotes) and serviceScore() runs 2 (bookings, service order items). 500 customers = ~2,500 extra queries per run.",
      outcome: "Same as above — scoring gets prohibitively slow as the customer base grows. Fix: eager-load these aggregates in bulk before chunking using a single GROUP BY query per signal table.",
    },
    {
      title: "flushConfigCache() does not flush catalogue weights",
      severity: "warning",
      detail: "AlgorithmService::flushConfigCache() forgets 'algorithm_config' and 'algorithm_segment_rules'. But CatalogueRankingService uses a separate 'catalogue_weights' cache key that only its own flushCatalogueCache() clears. The two services are unaware of each other.",
      outcome: "An admin saves new catalogue weights via the config panel — the change takes up to 5 minutes to propagate to live catalogue sorting. No visible indication this is happening. Add a single unified flush endpoint that clears all algorithm-related keys, or call both flush methods from saveConfig().",
    },
    {
      title: "set_time_limit(0) on a synchronous HTTP request",
      severity: "warning",
      detail: "runScoring() removes the PHP timeout entirely. On Railway, the reverse proxy has its own timeout (typically 60–120s). For large customer bases the PHP process will finish correctly but the HTTP connection will have already been dropped — the admin sees a network error while the scoring actually completed.",
      outcome: "Confusing admin experience — 'did it run or not?' The correct fix is to dispatch a queued job and poll for status, or at minimum stream progress via SSE (which you already have patterns for in the auction system).",
    },
    {
      title: "Stat strip metrics are page-scoped, not global",
      severity: "low",
      detail: "Avg Score, High Scorers (≥75), and At Risk (<25) on the panel are computed from scores[] — the current page of 30 rows — not the full customer dataset.",
      outcome: "Stats look like global KPIs but change as the user pages through the leaderboard. Fix: add a dedicated /admin/algorithm/stats endpoint that computes these server-side across all scored customers.",
    },
    {
      title: "Segment rule matchesCondition only reads direct Customer model fields",
      severity: "low",
      detail: "The condition engine evaluates $customer->$field dynamically. Fields like total_score, recency_raw, or any computed value that isn't a column on the customers table will silently return null → condition always false.",
      outcome: "Admins can create rules that appear to save correctly but never fire. No validation or feedback in the UI. Consider constraining the field dropdown to known-valid fields.",
    },
  ],
  strengths: [
    {
      title: "7-signal RFM+ scoring with clean normalisation",
      detail: "Every signal is independently normalised to 0–100 (log scale for frequency, percent rank for monetary, hard caps elsewhere). Signals are additive after weighting, making the final score intuitive and auditable. The raw vs weighted breakdown returned by scoreCustomer() makes debugging straightforward.",
    },
    {
      title: "Segment-aware catalogue ranking",
      detail: "Rather than a single global sort order, the catalogue ORDER BY SQL expression is generated per customer segment. At-risk customers see sale items first, dormant customers see new arrivals, champions see premium/rated content. This is a meaningful personalisation layer with no frontend changes required.",
    },
    {
      title: "Fully config-driven — no deploys needed to tune the algorithm",
      detail: "Weights, signal toggles, segment rules, and catalogue weights all live in the DB and are editable via the admin panel. A business decision about scoring can be implemented in minutes without touching code.",
    },
    {
      title: "Bonus content system is cleanly decoupled",
      detail: "algorithm_bonus_content is a separate table with entity_type polymorphism. Badge types (promo, social_proof, bundle, urgency, tip) let admins attach contextual messaging to ranked results without touching product or service records. The +bonus weight in the score expression means boosted items naturally rise in rank.",
    },
    {
      title: "CatalogueRankingService degrades gracefully at every step",
      detail: "No auth token → default segment. No customer record → default. No score yet → new or default. Admin/staff role → default (no personalisation). The system never throws and always produces a valid ORDER BY expression. Guests and new customers get a sensible global ranking by default.",
    },
    {
      title: "Toggleable signals enable safe experimentation",
      detail: "Any of the 7 signals can be switched off without code changes. Combined with the configurable weights, this is a lightweight A/B testing mechanism — you can zero out referral weight to measure its catalogue impact without removing the logic.",
    },
  ],
  future: [
    {
      title: "Score history & trend lines per customer",
      detail: "Because the controller currently inserts rather than upserts, every scoring run produces a historical record. A score history endpoint and a sparkline on the customer profile would turn this data liability into a genuine feature — showing whether a customer is trending up or churning.",
      horizon: "near",
    },
    {
      title: "Scheduled auto-scoring",
      detail: "Scoring is currently triggered manually. A Laravel scheduled command running nightly would keep segments fresh automatically. Critical before the platform scales — manual runs are easy to forget and stale scores mean the catalogue personalisation degrades silently.",
      horizon: "near",
    },
    {
      title: "Configurable segment thresholds",
      detail: "The champion/loyal/at_risk/dormant cutoffs (68, 48, 25, recency<20) are hardcoded. Moving these to algorithm_config would let the business tune segment definitions as score distributions shift over time.",
      horizon: "medium",
    },
    {
      title: "Batch signal pre-computation",
      detail: "Before chunked scoring can handle tens of thousands of customers efficiently, the per-customer DB queries (monetary rank, engagement counts, service counts) need to be precomputed in bulk. A staging table refreshed once before each run would drop batch query count by ~80%.",
      horizon: "medium",
    },
    {
      title: "Async scoring with progress stream",
      detail: "Replace the synchronous set_time_limit(0) run with a queued job + SSE progress stream (same pattern as the auction system). The admin gets real-time feedback and the PHP worker is freed immediately.",
      horizon: "medium",
    },
    {
      title: "Segment cohort conversion analytics",
      detail: "Once scoring is automated and order data is linked, you can measure conversion rate per segment and validate whether the at_risk sale-heavy catalogue ranking actually recovers churned customers. Closes the feedback loop the algorithm currently lacks.",
      horizon: "long",
    },
  ],
};

const SEV_COLOR = { critical: "#ff4d4d", warning: "#f59e0b", low: "#a855f7" };
const HOR_COLOR = { near: "#06b6d4", medium: "#f59e0b", long: "#a855f7" };

function AlgoDevNotesModal({ onClose }) {
  const [tab, setTab] = useState("pitfalls");

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 24,
    }} onClick={onClose}>
      <div style={{
        background: "var(--bg-primary, #fff)", borderRadius: 12, width: "100%", maxWidth: 800,
        maxHeight: "90vh", display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "20px 24px 0", borderBottom: "1px solid var(--border,#e5e7eb)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#a855f7" }}>
              // dev notes — algorithm system
            </span>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#9ca3af" }}>✕</button>
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: "#9ca3af", marginBottom: 14 }}>
            internal analysis · not visible to customers
          </div>
          <div style={{ display: "flex", gap: 0 }}>
            {["pitfalls", "strengths", "future"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "9px 18px", background: "none", border: "none",
                borderBottom: tab === t ? "2px solid #a855f7" : "2px solid transparent",
                color: tab === t ? "#a855f7" : "var(--text-secondary,#6b7280)",
                fontFamily: "monospace", fontSize: 12, cursor: "pointer",
                opacity: tab === t ? 1 : 0.6, marginBottom: -1,
              }}>{t}</button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {tab === "pitfalls" && ALGO_DEV_NOTES.pitfalls.map((n, i) => (
            <div key={i} style={{
              padding: "14px 16px", borderRadius: 8,
              border: `1px solid ${SEV_COLOR[n.severity]}33`,
              background: `${SEV_COLOR[n.severity]}08`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, fontFamily: "monospace",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                  color: SEV_COLOR[n.severity],
                  background: `${SEV_COLOR[n.severity]}18`,
                  padding: "2px 7px", borderRadius: 3,
                }}>{n.severity}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary,#111)" }}>{n.title}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary,#6b7280)", lineHeight: 1.65, marginBottom: 6 }}>{n.detail}</div>
              <div style={{ fontSize: 11, fontFamily: "monospace", color: "#9ca3af" }}>
                <span style={{ color: "#6b7280" }}>→ outcome: </span>{n.outcome}
              </div>
            </div>
          ))}

          {tab === "strengths" && ALGO_DEV_NOTES.strengths.map((n, i) => (
            <div key={i} style={{
              padding: "14px 16px", borderRadius: 8,
              border: "1px solid #a855f722", background: "#a855f706",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#a855f7", marginBottom: 6 }}>✓ {n.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary,#6b7280)", lineHeight: 1.65 }}>{n.detail}</div>
            </div>
          ))}

          {tab === "future" && ALGO_DEV_NOTES.future.map((n, i) => (
            <div key={i} style={{
              padding: "14px 16px", borderRadius: 8,
              border: "1px solid var(--border,#e5e7eb)",
              background: "var(--bg-secondary,#f9fafb)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, fontFamily: "monospace",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                  color: HOR_COLOR[n.horizon],
                  background: `${HOR_COLOR[n.horizon]}18`,
                  padding: "2px 7px", borderRadius: 3,
                }}>{n.horizon}-term</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary,#111)" }}>{n.title}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary,#6b7280)", lineHeight: 1.65 }}>{n.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main panel ──────────────────────────────────────────────────────────────────
export default function CustomerAlgorithmPanel() {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const isSuperAdmin = user?.role === 'super_admin';
  const headers = { Authorization: `Bearer ${token}` };

  // ── Tab ─────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('leaderboard');

  // ── Leaderboard ──────────────────────────────────────────────────────────────
  const [scores, setScores]         = useState([]);
  const [scoresMeta, setScoresMeta] = useState(null);
  const [scoresPage, setScoresPage] = useState(1);
  const [loadingScores, setLoadingScores] = useState(false);

  // ── Config ───────────────────────────────────────────────────────────────────
  const [config, setConfig]               = useState({ weights: null, signal_toggles: null });
  const [segmentRules, setSegmentRules]   = useState([]);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig]   = useState(false);

  // ── Scoring run ──────────────────────────────────────────────────────────────
  const [running, setRunning]       = useState(false);
  const [runResult, setRunResult]   = useState(null);

  // ── Segment rule modal ───────────────────────────────────────────────────────
  const [ruleModal, setRuleModal]       = useState(null);
  const [deletingRule, setDeletingRule] = useState(null);
  const [tierOptions, setTierOptions]   = useState([]);

  // ── Customer Pins ─────────────────────────────────────────────────────────────
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearch, setCustomerSearch]     = useState('');
  const [rankedProducts, setRankedProducts]     = useState([]);
  const [rankedMeta, setRankedMeta]             = useState(null);
  const [rankedPage, setRankedPage]             = useState(1);
  const [loadingRanked, setLoadingRanked]       = useState(false);
  const [productEntityType, setProductEntityType] = useState('product');
  const [productSearch, setProductSearch]       = useState('');
  const [pinning, setPinning]                   = useState(new Set());
  const [rescoringCustomer, setRescoringCustomer] = useState(false);
  const [devNotesOpen, setDevNotesOpen] = useState(false);

  const productSearchTimer = useRef(null);

  // ── Loaders ───────────────────────────────────────────────────────────────────
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

  const loadRankedProducts = useCallback(async (customerId, page = 1, overrides = {}) => {
    setLoadingRanked(true);
    try {
      const { data } = await axios.get(
        `${API}/admin/algorithm/customers/${customerId}/ranked-products`,
        {
          headers,
          params: {
            entity_type: overrides.entity_type  !== undefined ? overrides.entity_type  : productEntityType,
            search:      overrides.search       !== undefined ? overrides.search       : productSearch,
            page,
            per_page: 20,
          },
        }
      );
      setRankedProducts(data.data ?? []);
      setRankedMeta(data);
      setRankedPage(page);
    } catch {
      toast.error('Failed to load ranked products.');
    } finally {
      setLoadingRanked(false);
    }
  }, [token, productEntityType, productSearch]);

  useEffect(() => {
    loadScores(1);
    loadConfig();
  }, [loadScores, loadConfig]);

  useEffect(() => {
    customerTiersAPI.getTiers()
      .then(res => setTierOptions(res?.data ?? res ?? []))
      .catch(() => {});
  }, []);

  // ── Full scoring run ──────────────────────────────────────────────────────────
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

  // ── Single customer re-score ──────────────────────────────────────────────────
  const rescoreCustomer = async (customerId) => {
    setRescoringCustomer(true);
    try {
      await axios.post(`${API}/admin/algorithm/run`, { customer_id: customerId }, { headers });
      toast.success('Customer re-scored.');
      await loadScores(scoresPage);
      await loadRankedProducts(customerId, rankedPage);
    } catch {
      toast.error('Re-scoring failed.');
    } finally {
      setRescoringCustomer(false);
    }
  };

  // ── Config save ───────────────────────────────────────────────────────────────
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
    ? Object.values(config.weights).reduce((a, b) => a + Number(b), 0) : 0;

  // ── Segment rules ─────────────────────────────────────────────────────────────
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

  // ── Customer selection ────────────────────────────────────────────────────────
  const selectCustomer = (row) => {
    setSelectedCustomer(row);
    setProductSearch('');
    setProductEntityType('product');
    loadRankedProducts(row.customer_id, 1, { entity_type: 'product', search: '' });
  };

  const switchEntityType = (type) => {
    setProductEntityType(type);
    if (selectedCustomer) {
      loadRankedProducts(selectedCustomer.customer_id, 1, { entity_type: type, search: productSearch });
    }
  };

  const handleProductSearch = (val) => {
    setProductSearch(val);
    clearTimeout(productSearchTimer.current);
    productSearchTimer.current = setTimeout(() => {
      if (selectedCustomer) {
        loadRankedProducts(selectedCustomer.customer_id, 1, { search: val });
      }
    }, 300);
  };

  // ── Pin / Unpin ───────────────────────────────────────────────────────────────
  const handlePin = async (entityType, entityId) => {
    if (!selectedCustomer) return;
    const key = `${entityType}:${entityId}`;
    setPinning(s => new Set(s).add(key));
    try {
      await axios.post(
        `${API}/admin/algorithm/customers/${selectedCustomer.customer_id}/pins`,
        { entity_type: entityType, entity_id: entityId },
        { headers }
      );
      setRankedProducts(prev => prev.map(p =>
        p.id === entityId && p.entity_type === entityType ? { ...p, is_pinned: true } : p
      ));
      toast.success('Pinned for this customer.');
    } catch {
      toast.error('Failed to pin.');
    } finally {
      setPinning(s => { const n = new Set(s); n.delete(key); return n; });
    }
  };

  const handleUnpin = async (entityType, entityId) => {
    if (!selectedCustomer) return;
    const key = `${entityType}:${entityId}`;
    setPinning(s => new Set(s).add(key));
    try {
      await axios.delete(
        `${API}/admin/algorithm/customers/${selectedCustomer.customer_id}/pins/${entityType}/${entityId}`,
        { headers }
      );
      setRankedProducts(prev => prev.map(p =>
        p.id === entityId && p.entity_type === entityType ? { ...p, is_pinned: false, pin_id: null } : p
      ));
      toast.success('Pin removed.');
    } catch {
      toast.error('Failed to remove pin.');
    } finally {
      setPinning(s => { const n = new Set(s); n.delete(key); return n; });
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────────
  const filteredScores = customerSearch
    ? scores.filter(r =>
        r.full_name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
        r.email?.toLowerCase().includes(customerSearch.toLowerCase())
      )
    : scores;

  // ── Styles ────────────────────────────────────────────────────────────────────
  const s = {
    page: {
      minHeight: '100vh', background: 'var(--bg-primary,#f9fafb)',
      padding: '24px', fontFamily: 'var(--font-body,system-ui,sans-serif)',
    },
    card: {
      background: 'var(--bg-secondary,#fff)', borderRadius: 16,
      border: '1px solid rgba(168,85,247,0.12)',
      boxShadow: '0 2px 12px rgba(168,85,247,0.06)', overflow: 'hidden',
    },
    btn: (variant = 'primary') => ({
      padding: '9px 20px', borderRadius: 10, border: 'none',
      fontSize: 13, fontWeight: 600, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 7,
      transition: 'opacity 0.15s',
      ...(variant === 'primary' ? {
        background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: '#fff',
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
      background: active ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'transparent',
      color: active ? '#fff' : 'var(--text-secondary,#6b7280)',
      transition: 'all 0.2s',
    }),
    th: {
      padding: '10px 14px', fontSize: 11, fontWeight: 700,
      color: 'var(--text-secondary,#6b7280)', textTransform: 'uppercase',
      letterSpacing: '0.06em', textAlign: 'left',
      borderBottom: '1px solid rgba(168,85,247,0.1)',
      background: 'rgba(168,85,247,0.04)',
    },
    td: {
      padding: '12px 14px', fontSize: 13,
      color: 'var(--text-primary,#111827)',
      borderBottom: '1px solid rgba(168,85,247,0.07)',
      verticalAlign: 'middle',
    },
    miniInput: {
      padding: '7px 10px', borderRadius: 8, fontSize: 12,
      border: '1px solid rgba(168,85,247,0.2)',
      background: 'var(--bg-secondary,#f9fafb)',
      color: 'var(--text-primary,#111)', outline: 'none',
      boxSizing: 'border-box', width: '100%',
    },
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      <div style={s.page}>
        <style>{`
          @keyframes algoSpin { to { transform: rotate(360deg) } }
          .algo-row:hover td { background: rgba(168,85,247,0.03) !important; }
          .algo-btn:hover { opacity: 0.85 !important; }
          .cust-row:hover { background: rgba(168,85,247,0.05) !important; }
        `}</style>

        {/* ── Page header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--text-primary,#111827)' }}>
              Customer Scoring Algorithm
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text-secondary,#6b7280)' }}>
              RFM + Loyalty + Engagement weighted scoring across {scoresMeta?.total?.toLocaleString() ?? '—'} customers
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="algo-btn"
              onClick={() => navigate('/admin/algorithm/catalogue-boosts')}
              style={s.btn('ghost')}
            >
              <Tag size={15} />
              Catalogue Boosts
            </button>
            <button className="algo-btn" onClick={runScoring} disabled={running}
              style={{ ...s.btn('primary'), opacity: running ? 0.7 : 1, cursor: running ? 'not-allowed' : 'pointer' }}>
              {running ? <Spinner size={15} /> : <span>▶</span>}
              {running ? 'Scoring all customers…' : 'Run Scoring Now'}
            </button>
            <button className="algo-btn" onClick={() => setDevNotesOpen(true)} style={s.btn('ghost')}>
              // dev
            </button>
          </div>
            {runResult && !running && (
              <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>
                ✓ {runResult.scored?.toLocaleString()} scored · {runResult.failed} failed · {runResult.duration_s}s
              </span>
            )}
          </div>
        </div>

        {/* ── Stat strip ── */}
        {scores.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Avg Score',        value: (scores.reduce((a, b) => a + parseFloat(b.total_score), 0) / scores.length).toFixed(1) },
              { label: 'High Scorers (≥75)', value: scores.filter(r => parseFloat(r.total_score) >= 75).length },
              { label: 'At Risk (<25)',     value: scores.filter(r => parseFloat(r.total_score) < 25).length },
              { label: 'Pinned Products',  value: rankedProducts.filter(p => p.is_pinned).length || '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ ...s.card, padding: '14px 18px' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#a855f7' }}>{value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary,#6b7280)', fontWeight: 600, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tab bar ── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, padding: '6px', background: 'rgba(168,85,247,0.06)', borderRadius: 14, width: 'fit-content' }}>
          {[
            { key: 'leaderboard', label: 'Leaderboard',    Icon: BarChart2         },
            { key: 'config',      label: 'Config',          Icon: SlidersHorizontal },
            { key: 'rules',       label: 'Segment Rules',   Icon: GitBranch         },
            { key: 'pins',        label: 'Customer Pins',   Icon: BrainCircuit      },
          ].map(({ key, label, Icon }) => (
            <button key={key}
              style={{ ...s.tab(activeTab === key), display: 'inline-flex', alignItems: 'center', gap: 7 }}
              onClick={() => setActiveTab(key)}>
              <Icon size={14} />{label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB: LEADERBOARD                                              */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'leaderboard' && (
          <div style={s.card}>
            {loadingScores ? (
              <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><Spinner size={32} /></div>
            ) : scores.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', color: '#6b7280' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No scores yet</div>
                <div style={{ fontSize: 13 }}>
                  {isSuperAdmin ? 'Click "Run Scoring Now" to generate scores.' : 'Scores will appear after the next scheduled run.'}
                </div>
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['#','Customer','Tier','Score','Recency','Frequency','Monetary','Loyalty','Engagement','Scored'].map(h => (
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
                            <td style={{ ...s.td, width: 44, fontWeight: 700, color: rank <= 3 ? '#a855f7' : '#6b7280' }}>
                              {rank <= 3 ? ['🥇','🥈','🥉'][rank - 1] : rank}
                            </td>
                            <td style={s.td}>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{row.full_name}</div>
                              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{row.email}</div>
                            </td>
                            <td style={s.td}><TierBadge tier={row.tier} tierOptions={tierOptions} /></td>
                            <td style={{ ...s.td, minWidth: 100 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontWeight: 800, fontSize: 15, color: scoreColor(sc), minWidth: 36 }}>{sc}</span>
                                <div style={{ flex: 1, minWidth: 60 }}><ScoreBar value={sc} /></div>
                              </div>
                            </td>
                            {['recency_raw','frequency_raw','monetary_raw','loyalty_raw','engagement_raw'].map(sig => (
                              <td key={sig} style={{ ...s.td, minWidth: 70 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 3 }}>{row[sig]}</div>
                                <ScoreBar value={row[sig]} height={4} color="rgba(168,85,247,0.5)" />
                              </td>
                            ))}
                            <td style={{ ...s.td, fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>
                              {row.scored_at ? new Date(row.scored_at).toLocaleDateString() : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {scoresMeta && scoresMeta.last_page > 1 && (
                  <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(168,85,247,0.08)' }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>
                      Showing {scoresMeta.from}–{scoresMeta.to} of {scoresMeta.total?.toLocaleString()}
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

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB: CONFIG                                                   */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'config' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,340px)', gap: 20, alignItems: 'start' }}>
            <div style={s.card}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(168,85,247,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary,#111827)' }}>Signal Weights</h2>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: '#6b7280' }}>Adjust how much each signal contributes to the final score.</p>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, padding: '4px 14px', borderRadius: 20, background: Math.abs(totalWeight - 100) <= 1 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: Math.abs(totalWeight - 100) <= 1 ? '#10b981' : '#ef4444' }}>
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
                              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary,#111827)' }}>{sig.label}</div>
                              <div style={{ fontSize: 11, color: '#6b7280' }}>{sig.desc}</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ fontSize: 16, fontWeight: 800, color: '#a855f7', minWidth: 28, textAlign: 'right' }}>{w}</span>
                            <Toggle checked={on} onChange={v => setToggle(sig.key, v)} />
                          </div>
                        </div>
                        <input type="range" min={0} max={50} step={1} value={w}
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={s.card}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(168,85,247,0.1)' }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary,#111827)' }}>Scoring Formula</h3>
                </div>
                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, background: 'rgba(168,85,247,0.06)', borderRadius: 8, padding: '10px 14px', lineHeight: 1.7 }}>
                    score = Σ(raw_signal<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;× weight / 100)<br /><br />
                    then × segment boosts
                  </div>
                  {SIGNALS.map(sig => (
                    <div key={sig.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                      <span style={{ color: '#6b7280', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <sig.icon size={12} style={{ color: sig.color }} /> {sig.label}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60 }}><ScoreBar value={(config.weights?.[sig.key] ?? 0) / 50 * 100} height={5} /></div>
                        <span style={{ fontWeight: 700, color: '#a855f7', minWidth: 24, textAlign: 'right' }}>{config.weights?.[sig.key] ?? 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ ...s.card, padding: '16px 20px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 8 }}>SCORE BANDS</div>
                {[['75–100','#10b981','High value'],['50–74','#f59e0b','Growing'],['25–49','#f97316','At risk'],['0–24','#ef4444','Dormant']].map(([range, color, label]) => (
                  <div key={range} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary,#111827)', minWidth: 60 }}>{range}</span>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB: SEGMENT RULES                                            */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'rules' && (
          <div style={s.card}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(168,85,247,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary,#111827)' }}>Segment Rules</h2>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#6b7280' }}>Conditional multipliers applied on top of base weights during scoring.</p>
              </div>
              <button className="algo-btn" style={s.btn('primary')} onClick={() => setRuleModal('new')}>+ Add Rule</button>
            </div>
            {loadingConfig ? (
              <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner size={28} /></div>
            ) : segmentRules.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', color: '#6b7280' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📐</div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>No segment rules yet</div>
                <div style={{ fontSize: 13 }}>Rules let you boost or penalise specific signals for matching customers.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Rule Name','Condition','Boosts Signal','Boost %','Label','Active',''].map(h => (
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
                            const sig = SIGNALS.find(sg => sg.key === rule.boost_signal);
                            const Icon = sig?.icon;
                            return (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {Icon && <Icon size={13} style={{ color: sig.color, flexShrink: 0 }} />}
                                {sig?.label ?? rule.boost_signal}
                              </span>
                            );
                          })()}
                        </td>
                        <td style={s.td}>
                          <span style={{ fontWeight: 700, color: rule.boost_percent >= 0 ? '#10b981' : '#ef4444' }}>
                            {rule.boost_percent >= 0 ? '+' : ''}{rule.boost_percent}%
                          </span>
                        </td>
                        <td style={{ ...s.td, fontSize: 12, color: '#6b7280' }}>{rule.action_label || '—'}</td>
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

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB: CUSTOMER PINS                                            */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'pins' && (
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>

            {/* ── Left: Customer list ── */}
            <div style={{ ...s.card, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 260px)' }}>
              {/* Search */}
              <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(168,85,247,0.1)', flexShrink: 0 }}>
                <input
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  placeholder="Search customers…"
                  style={s.miniInput}
                />
              </div>

              {/* List */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {loadingScores ? (
                  <div style={{ padding: 30, display: 'flex', justifyContent: 'center' }}><Spinner size={24} /></div>
                ) : filteredScores.length === 0 ? (
                  <div style={{ padding: 30, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>No customers found</div>
                ) : (
                  filteredScores.map(row => {
                    const sc = parseFloat(row.total_score);
                    const isSelected = selectedCustomer?.customer_id === row.customer_id;
                    return (
                      <div
                        key={row.customer_id}
                        className="cust-row"
                        onClick={() => selectCustomer(row)}
                        style={{
                          padding: '11px 14px', cursor: 'pointer',
                          borderBottom: '1px solid rgba(168,85,247,0.06)',
                          borderLeft: `3px solid ${isSelected ? '#a855f7' : 'transparent'}`,
                          background: isSelected ? 'rgba(168,85,247,0.07)' : 'transparent',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary,#111)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.full_name}</div>
                            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.email}</div>
                          </div>
                          <span style={{ fontWeight: 800, fontSize: 13, color: scoreColor(sc), flexShrink: 0, marginLeft: 8 }}>{sc}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <TierBadge tier={row.tier} tierOptions={tierOptions} />
                          <div style={{ flex: 1 }}><ScoreBar value={sc} height={3} /></div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Pagination */}
              {scoresMeta && scoresMeta.last_page > 1 && (
                <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(168,85,247,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                  <button
                    disabled={scoresPage <= 1}
                    onClick={() => loadScores(scoresPage - 1)}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(168,85,247,0.2)', background: 'transparent', color: '#a855f7', fontSize: 12, cursor: 'pointer', opacity: scoresPage <= 1 ? 0.4 : 1 }}>←</button>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{scoresPage} / {scoresMeta.last_page}</span>
                  <button
                    disabled={scoresPage >= scoresMeta.last_page}
                    onClick={() => loadScores(scoresPage + 1)}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(168,85,247,0.2)', background: 'transparent', color: '#a855f7', fontSize: 12, cursor: 'pointer', opacity: scoresPage >= scoresMeta.last_page ? 0.4 : 1 }}>→</button>
                </div>
              )}
            </div>

            {/* ── Right: Customer detail + ranked products ── */}
            {!selectedCustomer ? (
              <div style={{ ...s.card, padding: 60, textAlign: 'center', color: '#6b7280' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>👈</div>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Select a customer</div>
                <div style={{ fontSize: 13 }}>Click any customer on the left to see their personalised product ranking and manage pins.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Customer header */}
                <div style={{ ...s.card, padding: '18px 24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary,#111827)' }}>{selectedCustomer.full_name}</h2>
                        <TierBadge tier={selectedCustomer.tier} tierOptions={tierOptions} />
                        {rankedMeta?.segment && <SegmentBadge segment={rankedMeta.segment} />}
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>{selectedCustomer.email}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 28, fontWeight: 900, color: scoreColor(parseFloat(selectedCustomer.total_score)), lineHeight: 1 }}>
                          {selectedCustomer.total_score}
                        </div>
                        <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, marginTop: 2 }}>TOTAL SCORE</div>
                      </div>
                      {isSuperAdmin && (
                        <button className="algo-btn"
                          onClick={() => rescoreCustomer(selectedCustomer.customer_id)}
                          disabled={rescoringCustomer}
                          style={{ ...s.btn('ghost'), padding: '7px 14px', fontSize: 12 }}>
                          {rescoringCustomer ? <Spinner size={13} /> : '↻'} Re-score
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Signal bars */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(90px,1fr))', gap: 10 }}>
                    {SIGNALS.map(sig => {
                      const raw = selectedCustomer[`${sig.key}_raw`] ?? 0;
                      return (
                        <div key={sig.key}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: sig.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{sig.label}</span>
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af' }}>{raw}</span>
                          </div>
                          <ScoreBar value={raw} color={sig.color} height={5} />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Ranked products */}
                <div style={s.card}>
                  {/* Sub-header */}
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(168,85,247,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    {/* Entity type tabs */}
                    <div style={{ display: 'flex', gap: 5, padding: 4, background: 'rgba(168,85,247,0.06)', borderRadius: 10 }}>
                      {[
                        { key: 'product', label: '📦 Products' },
                        { key: 'service', label: '🔧 Services' },
                      ].map(({ key, label }) => (
                        <button key={key} onClick={() => switchEntityType(key)} style={{
                          padding: '5px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                          fontSize: 12, fontWeight: 600, transition: 'all 0.2s',
                          background: productEntityType === key ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'transparent',
                          color: productEntityType === key ? '#fff' : '#6b7280',
                        }}>{label}</button>
                      ))}
                    </div>

                    {/* Search */}
                    <input
                      value={productSearch}
                      onChange={e => handleProductSearch(e.target.value)}
                      placeholder={`Search ${productEntityType === 'product' ? 'products' : 'services'}…`}
                      style={{ ...s.miniInput, width: 200 }}
                    />
                  </div>

                  {/* Product table */}
                  {loadingRanked ? (
                    <div style={{ padding: 50, display: 'flex', justifyContent: 'center' }}><Spinner size={28} /></div>
                  ) : rankedProducts.length === 0 ? (
                    <div style={{ padding: 50, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                      No {productEntityType}s found.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            {['', 'Name', 'Catalogue Score', 'Boost', 'Pin'].map(h => (
                              <th key={h} style={s.th}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rankedProducts.map(product => {
                            const key = `${product.entity_type}:${product.id}`;
                            const isPinning = pinning.has(key);
                            const score = parseFloat(product.catalogue_score ?? 0);
                            const badgeMeta = BOOST_BADGES.find(b => b.key === product.badge_type);
                            return (
                              <tr key={key} className="algo-row">
                                {/* Thumbnail */}
                                <td style={{ ...s.td, width: 52 }}>
                                  {product.main_image ? (
                                    <img src={product.main_image} alt="" style={{ width: 38, height: 38, borderRadius: 7, objectFit: 'cover', border: '1px solid rgba(168,85,247,0.15)', display: 'block' }} />
                                  ) : (
                                    <div style={{ width: 38, height: 38, borderRadius: 7, background: 'rgba(168,85,247,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <Package size={14} color="#a855f7" />
                                    </div>
                                  )}
                                </td>

                                {/* Name */}
                                <td style={s.td}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {product.is_pinned && (
                                      <span title="Pinned for this customer" style={{ fontSize: 13, flexShrink: 0 }}>📌</span>
                                    )}
                                    <div>
                                      <div style={{ fontWeight: 600, fontSize: 13 }}>{product.name}</div>
                                      {product.category_name && (
                                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{product.category_name}</div>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                {/* Catalogue score */}
                                <td style={{ ...s.td, minWidth: 110 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontWeight: 800, fontSize: 14, color: '#a855f7', minWidth: 32 }}>
                                      {score.toFixed(1)}
                                    </span>
                                    <div style={{ flex: 1, minWidth: 50 }}>
                                      <ScoreBar value={score} color="#a855f7" height={5} />
                                    </div>
                                  </div>
                                </td>

                                {/* Boost badge */}
                                <td style={s.td}>
                                  {product.boost_message ? (
                                    <Pill color={badgeMeta?.color ?? '#6b7280'}>{product.badge_type}</Pill>
                                  ) : (
                                    <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>
                                  )}
                                </td>

                                {/* Pin / Unpin */}
                                <td style={{ ...s.td, textAlign: 'right' }}>
                                  {product.is_pinned ? (
                                    <button
                                      onClick={() => handleUnpin(product.entity_type, product.id)}
                                      disabled={isPinning}
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.07)', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: isPinning ? 'not-allowed' : 'pointer' }}>
                                      {isPinning ? <Spinner size={11} /> : '📌'} Unpin
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handlePin(product.entity_type, product.id)}
                                      disabled={isPinning}
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(168,85,247,0.25)', background: purpleLt, color: purple, fontSize: 12, fontWeight: 600, cursor: isPinning ? 'not-allowed' : 'pointer' }}>
                                      {isPinning ? <Spinner size={11} /> : '📍'} Pin
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Pagination */}
                  {rankedMeta && rankedMeta.last_page > 1 && (
                    <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(168,85,247,0.08)' }}>
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>
                        {rankedMeta.from}–{rankedMeta.to} of {rankedMeta.total?.toLocaleString()}
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="algo-btn" style={{ ...s.btn('ghost'), padding: '5px 12px', fontSize: 12 }} disabled={rankedPage <= 1} onClick={() => loadRankedProducts(selectedCustomer.customer_id, rankedPage - 1)}>← Prev</button>
                        <button className="algo-btn" style={{ ...s.btn('ghost'), padding: '5px 12px', fontSize: 12 }} disabled={rankedPage >= rankedMeta.last_page} onClick={() => loadRankedProducts(selectedCustomer.customer_id, rankedPage + 1)}>Next →</button>
                      </div>
                    </div>
                  )}
                </div>
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
        {devNotesOpen && <AlgoDevNotesModal onClose={() => setDevNotesOpen(false)} />}
      </div>
    </AdminLayout>
  );
}

// ── Defaults ──────────────────────────────────────────────────────────────────
function defaultWeights() {
  return { recency: 25, frequency: 20, monetary: 20, loyalty: 15, engagement: 10, service: 5, referral: 5 };
}
function defaultToggles() {
  return Object.fromEntries(
    ['recency','frequency','monetary','loyalty','engagement','service','referral'].map(k => [k, true])
  );
}