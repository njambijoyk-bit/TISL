import { useState, useEffect, useCallback } from 'react';
import {
  BarChart2, TrendingUp, ShoppingCart, Users, FileText,
  FolderOpen, Download, RefreshCw, Calendar, ArrowUpRight,
  ArrowDownRight, Minus, ChevronRight, Clock, Target,
  DollarSign, Activity, AlertCircle, CheckCircle, XCircle,
  Layers, ArrowRight, Package, Award, Wrench, Tag,
  Ticket, Star, BarChart, PieChart, Hash, Zap, Settings,
  TrendingDown, UserPlus, ShieldCheck, Gift, Info,
  SlidersHorizontal, Layout
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import reportsAPI from '../../api/reports';
import referralsAPI from '../../api/referrals';
import customerTiersAPI from '../../api/customerTiers';
import { ordersAPI, customersAPI, projectsAPI } from '../../api';
import toast from 'react-hot-toast';

// ── Design tokens ──────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

// ── Atoms ──────────────────────────────────────────────────────────────────
const SectionLabel = ({ children, Icon }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
    {Icon && <Icon size={14} color={purple} />}
    <span style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.14em', color: purple,
    }}>{children}</span>
  </div>
);

const Panel = ({ children, style = {}, accent = false }) => (
  <div style={{
    background: 'white',
    borderRadius: 14,
    border: `1px solid ${accent ? purpleBd : 'rgba(0,0,0,0.06)'}`,
    boxShadow: accent
      ? `0 2px 16px rgba(168,85,247,0.1)`
      : '0 1px 6px rgba(0,0,0,0.04)',
    padding: 22,
    ...style,
  }}>{children}</div>
);

const Btn = ({ children, onClick, variant = 'primary', icon: Icon, disabled, small }) => {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 600, border: 'none', transition: 'all 0.15s',
    opacity: disabled ? 0.5 : 1,
    fontSize: small ? 12 : 13,
    padding: small ? '6px 12px' : '9px 16px',
  };
  const variants = {
    primary: { background: `linear-gradient(135deg,${purple},${purpleDk})`, color: 'white', boxShadow: '0 3px 10px rgba(168,85,247,0.3)' },
    ghost:   { background: purpleLt, color: purple, border: `1.5px solid ${purpleBd}` },
    outline: { background: 'white', color: '#374151', border: '1.5px solid #e5e7eb' },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant] }}>
      {Icon && <Icon size={small ? 13 : 15} />}
      {children}
    </button>
  );
};

const Pill = ({ children, color = purple, bg }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
    background: bg || `${color}18`, color,
  }}>{children}</span>
);

// ── Helpers ────────────────────────────────────────────────────────────────
const fmtKES  = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtNum  = (n) => Number(n || 0).toLocaleString();
const fmtPct  = (n) => `${Number(n || 0).toFixed(1)}%`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtHrs  = (h) => h >= 24 ? `${(h / 24).toFixed(1)}d` : `${h}h`;

const PERIOD_LABEL = {
  '7d': 'Last 7 Days', '30d': 'Last 30 Days',
  '90d': 'Last 90 Days', '12m': 'Last 12 Months', 'custom': 'Custom Range',
};

const PROMO_TYPE_LABELS = {
  general:           'General',
  customer_referral: 'Customer Referral',
  first_time:        'First-Time',
  bulk_order:        'Bulk Order',
  vip:               'VIP',
  birthday:          'Birthday',
  event:             'Event / Campaign',
};

// ── Mini sparkline (pure SVG) ──────────────────────────────────────────────
function Sparkline({ data = [], color = purple, height = 48, fill = true }) {
  if (!data || data.length < 2) return null;
  const vals = data.map(d => (typeof d === 'object' ? (d.value || d.count || d.revenue || 0) : d));
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals);
  const range = max - min || 1;
  const w = 200;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y = height - ((v - min) / range) * (height - 8) - 4;
    return `${x},${y}`;
  }).join(' ');
  const fillPts = `0,${height} ${pts} ${w},${height}`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width: '100%', height }} preserveAspectRatio="none">
      {fill && <polygon points={fillPts} fill={`${color}18`} />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Donut chart ────────────────────────────────────────────────────────────
function Donut({ segments = [], size = 100, strokeWidth = 14 }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + (x.value || 0), 0) || 1;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={strokeWidth} />
      {segments.map((seg, i) => {
        const dash = (seg.value / total) * circ;
        const gap  = circ - dash;
        const el = (
          <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={seg.color} strokeWidth={strokeWidth}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

// ── Horizontal bar chart ───────────────────────────────────────────────────
function HBar({ data = [], valueKey = 'value', labelKey = 'label', color = purple, fmtValue }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  const fmt = fmtValue || fmtNum;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.map((d, i) => {
        const pct = (d[valueKey] || 0) / max * 100;
        const c = Array.isArray(color) ? color[i % color.length] : color;
        return (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#374151', fontWeight: 500, maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d[labelKey]}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{fmt(d[valueKey])}</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: '#f3f4f6', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: `linear-gradient(90deg,${c},${c}cc)`, transition: 'width 0.6s ease' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Funnel bar ─────────────────────────────────────────────────────────────
function FunnelBar({ label, value, total, color, sub }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{fmtNum(value)}</span>
      </div>
      <div style={{ height: 10, borderRadius: 6, background: '#f3f4f6', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: 6,
          background: `linear-gradient(90deg,${color},${color}cc)`,
          transition: 'width 0.6s ease',
        }} />
      </div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ── Trend badge ────────────────────────────────────────────────────────────
function TrendBadge({ value }) {
  if (value == null) return null;
  const up = value > 0; const flat = value === 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const color = flat ? '#9ca3af' : up ? '#059669' : '#dc2626';
  const bg    = flat ? '#f3f4f6' : up ? '#d1fae5' : '#fee2e2';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '2px 7px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: bg, color }}>
      <Icon size={11} />{Math.abs(value).toFixed(1)}%
    </span>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, Icon, accent = purple, trend, spark }) {
  return (
    <Panel style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: `${accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={18} color={accent} />
        </div>
        {trend != null && <TrendBadge value={trend} />}
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#111827', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{sub}</div>}
      </div>
      {spark && spark.length > 1 && (
        <div style={{ marginTop: 4 }}><Sparkline data={spark} color={accent} height={36} /></div>
      )}
    </Panel>
  );
}

// ── Ranked table ───────────────────────────────────────────────────────────
function RankedTable({ rows = [], columns = [], emptyMsg = 'No data available' }) {
  if (!rows.length) return (
    <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13 }}>
      <AlertCircle size={28} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.4 }} />
      {emptyMsg}
    </div>
  );
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i} style={{
                padding: '8px 10px', textAlign: col.right ? 'right' : 'left',
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.1em', color: '#9ca3af',
                borderBottom: '1px solid #f3f4f6',
              }}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ borderBottom: '1px solid #f9fafb' }}>
              {columns.map((col, ci) => {
                const val = col.render ? col.render(row) : row[col.key];
                return (
                  <td key={ci} style={{
                    padding: '10px 10px',
                    textAlign: col.right ? 'right' : 'left',
                    color: col.color ? col.color(row) : '#374151',
                    fontWeight: col.bold ? 700 : 400,
                  }}>
                    {ci === 0 && row.rank != null ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          width: 22, height: 22, borderRadius: 6,
                          background: row.rank <= 3 ? `${['#f59e0b','#9ca3af','#f97316'][row.rank - 1]}20` : '#f9fafb',
                          color: row.rank <= 3 ? ['#f59e0b','#9ca3af','#f97316'][row.rank - 1] : '#9ca3af',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 800, flexShrink: 0,
                        }}>{row.rank}</span>
                        <span style={{ fontWeight: 500 }}>{val}</span>
                      </div>
                    ) : val}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Status row helper ──────────────────────────────────────────────────────
const StatusRow = ({ label, value, color, total }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ fontSize: 13, color: '#374151' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: color || '#111827' }}>{fmtNum(value)}</span>
    </div>
    <div style={{ height: 6, borderRadius: 4, background: '#f3f4f6', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${total > 0 ? (value / total * 100) : 0}%`, background: color || purple, borderRadius: 4, transition: 'width 0.6s' }} />
    </div>
  </div>
);

// ── Metric row ─────────────────────────────────────────────────────────────
function MetricRow({ label, value, Icon, color, sub }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f9fafb' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={13} color={color} />
        </div>
        <div>
          <span style={{ fontSize: 13, color: '#374151' }}>{label}</span>
          {sub && <div style={{ fontSize: 11, color: '#9ca3af' }}>{sub}</div>}
        </div>
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

// ── Period selector ────────────────────────────────────────────────────────
const PERIODS = [
  { id: '7d',     label: '7 days'    },
  { id: '30d',    label: '30 days'   },
  { id: '90d',    label: '90 days'   },
  { id: '12m',    label: '12 months' },
  { id: 'custom', label: 'Custom'    },
];

function PeriodBar({ period, setPeriod, startDate, setStartDate, endDate, setEndDate, onRefresh, loading }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: 3, gap: 2 }}>
        {PERIODS.map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)} style={{
            padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
            background: period === p.id ? `linear-gradient(135deg,${purple},${purpleDk})` : 'transparent',
            color: period === p.id ? 'white' : '#6b7280',
            boxShadow: period === p.id ? '0 2px 8px rgba(168,85,247,0.3)' : 'none',
          }}>{p.label}</button>
        ))}
      </div>
      {period === 'custom' && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            style={{ border: '1.5px solid #e5e7eb', borderRadius: 7, padding: '6px 10px', fontSize: 12, color: '#374151' }} />
          <span style={{ color: '#9ca3af', fontSize: 12 }}>to</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            style={{ border: '1.5px solid #e5e7eb', borderRadius: 7, padding: '6px 10px', fontSize: 12, color: '#374151' }} />
          <span style={{ fontSize: 11, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Info size={11} /> Set dates then click Refresh
          </span>
        </div>
      )}
      <button onClick={onRefresh} disabled={loading} style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px',
        borderRadius: 8, border: '1.5px solid #e5e7eb', background: 'white',
        cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#374151',
      }}>
        <RefreshCw size={13} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
        Refresh
      </button>
    </div>
  );
}

// ── Login Hour Heatmap ─────────────────────────────────────────────────────
function LoginHeatmap({ data = [] }) {
  // Expect 24 entries (hours 0–23). Guard against missing/empty data.
  if (!data || data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13 }}>
        <Clock size={28} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.4 }} />
        No login activity recorded yet
      </div>
    );
  }

  const max = Math.max(...data.map(d => d.count), 1);
  const totalLogins = data.reduce((s, d) => s + d.count, 0);

  const morning   = data.slice(6, 12);
  const afternoon = data.slice(12, 18);
  const evening   = data.slice(18, 24);
  const night     = data.slice(0, 6);
  const sessions  = [
    { label: 'Early AM (0–5)',    items: night,     color: '#8b5cf6' },
    { label: 'Morning (6–11)',    items: morning,   color: '#f59e0b' },
    { label: 'Afternoon (12–17)', items: afternoon, color: '#059669' },
    { label: 'Evening (18–23)',   items: evening,   color: '#3b82f6' },
  ];

  if (totalLogins === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13 }}>
        <Clock size={28} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.4 }} />
        No customer logins recorded yet
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
        Distribution based on <strong>{fmtNum(totalLogins)}</strong> recorded customer logins (last login per customer)
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24,1fr)', gap: 3, marginBottom: 8 }}>
        {data.map((d, i) => {
          const intensity = d.count / max;
          return (
            <div key={i} title={`${d.label}: ${d.count} logins`} style={{
              height: 36, borderRadius: 4,
              background: `rgba(168,85,247,${0.08 + intensity * 0.82})`,
              cursor: 'default',
            }} />
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        {[0, 6, 12, 18, 23].map(h => (
          <span key={h} style={{ fontSize: 10, color: '#9ca3af' }}>{String(h).padStart(2, '0')}:00</span>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
        {sessions.map(s => {
          const total = s.items.reduce((a, d) => a + d.count, 0);
          const peak  = s.items.reduce((best, d) => d.count > best.count ? d : best, { count: 0, label: '—' });
          return (
            <div key={s.label} style={{ padding: '10px 12px', borderRadius: 8, background: `${s.color}10`, border: `1px solid ${s.color}25` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: s.color, marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>{fmtNum(total)}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>Peak: {peak.count > 0 ? peak.label : '—'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── PDF helpers ────────────────────────────────────────────────────────────
async function initPDF(title, period) {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pw = 210; const ph = 297;
  const purpleRgb   = [168, 85, 247];
  const purpleDkRgb = [124, 58, 237];

  doc.setFillColor(...purpleRgb);
  doc.rect(0, 0, pw, 28, 'F');
  doc.setFillColor(...purpleDkRgb);
  doc.rect(pw - 50, 0, 50, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text(`TISL — ${title}`, 14, 11);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Period: ${period.toUpperCase()}  |  Generated: ${fmtDate(new Date())}`, 14, 20);

  return { doc, pw, ph, y: 38,
    purpleRgb, grey: [107,114,128], dark: [17,24,39],
    light: [249,250,251], green: [5,150,105], red: [220,38,38],
    amber: [245,158,11] };
}

function pdfSection(ctx, title) {
  const { doc, pw, ph, purpleRgb, light } = ctx;
  if (ctx.y > ph - 40) { doc.addPage(); ctx.y = 18; }
  doc.setFillColor(...light);
  doc.roundedRect(12, ctx.y - 5, pw - 24, 12, 2, 2, 'F');
  doc.setTextColor(...purpleRgb);
  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text(title.toUpperCase(), 16, ctx.y + 3);
  ctx.y += 14;
}

function pdfRow(ctx, label, value, color) {
  const { doc, pw, ph, grey, dark } = ctx;
  if (ctx.y > ph - 20) { doc.addPage(); ctx.y = 18; }
  doc.setTextColor(...grey);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(label, 18, ctx.y);
  doc.setTextColor(...(color || dark));
  doc.setFont('helvetica', 'bold');
  doc.text(String(value ?? '—'), pw - 18, ctx.y, { align: 'right' });
  doc.setDrawColor(229, 231, 235);
  doc.line(18, ctx.y + 2, pw - 18, ctx.y + 2);
  ctx.y += 8;
}

function pdfSubheading(ctx, text) {
  const { doc, grey } = ctx;
  doc.setTextColor(...grey); doc.setFontSize(8); doc.setFont('helvetica', 'italic');
  doc.text(text, 18, ctx.y); ctx.y += 6;
}

function pdfFinalize(ctx, filename) {
  const { doc, pw, ph, purpleRgb } = ctx;
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFillColor(...purpleRgb);
    doc.rect(0, ph - 10, pw, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text('TISL — Target Industrial Suppliers Limited — Confidential', 14, ph - 3.5);
    doc.text(`Page ${p} of ${pages}`, pw - 14, ph - 3.5, { align: 'right' });
  }
  doc.save(filename);
}

function pdfBarRow(ctx, label, value, pct, color) {
  const { doc, pw, ph } = ctx;
  if (ctx.y > ph - 16) { doc.addPage(); ctx.y = 18; }
  const barX = 85, barMaxW = pw - 108, barH = 3;
  const barW = Math.max(0, (pct / 100) * barMaxW);
  doc.setTextColor(55, 65, 81); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(label, 18, ctx.y);
  doc.setTextColor(107, 114, 128); doc.setFontSize(8);
  doc.text(`${pct.toFixed(1)}%`, 72, ctx.y);
  doc.setFillColor(229, 231, 235);
  doc.roundedRect(barX, ctx.y - 3, barMaxW, barH, 1, 1, 'F');
  if (barW > 0.5) { doc.setFillColor(...color); doc.roundedRect(barX, ctx.y - 3, barW, barH, 1, 1, 'F'); }
  doc.setTextColor(17, 24, 39); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text(value, pw - 18, ctx.y, { align: 'right' });
  ctx.y += 9;
}

function pdfSparkBars(ctx, trend) {
  const { doc, pw, ph } = ctx;
  if (ctx.y > ph - 55) { doc.addPage(); ctx.y = 18; }
  const chartH = 32, chartX = 18, chartW = pw - 36, n = trend.length;
  const slotW = chartW / n;
  const barW = Math.min(slotW - 3, 14);
  const vals = trend.map(d => Number(d.value ?? d.count ?? 0));
  const maxVal = Math.max(...vals, 1);
  doc.setDrawColor(229, 231, 235);
  doc.line(chartX, ctx.y + chartH, chartX + chartW, ctx.y + chartH);
  trend.forEach((d, i) => {
    const val = vals[i];
    const bH = Math.max(val > 0 ? 2 : 0, (val / maxVal) * (chartH - 6));
    const bX = chartX + i * slotW + (slotW - barW) / 2;
    const bY = ctx.y + chartH - bH;
    doc.setFillColor(59, 130, 246);
    if (bH > 0) doc.roundedRect(bX, bY, barW, bH, 1, 1, 'F');
    doc.setTextColor(156, 163, 175); doc.setFontSize(6.5);
    doc.text((d.label || '').slice(0, 3), bX + barW / 2, ctx.y + chartH + 5, { align: 'center' });
    if (val > 0) {
      doc.setTextColor(59, 130, 246); doc.setFontSize(6.5);
      doc.text(String(val), bX + barW / 2, bY - 1.5, { align: 'center' });
    }
  });
  ctx.y += chartH + 12;
}

// opts: { rightAlign: number[], highlightCols: { [colIndex]: rgbArray } }
function pdfTable(ctx, headers, rows, colWidths, opts = {}) {
  const { doc, pw, ph, purpleRgb } = ctx;
  const tableW = pw - 36, tableX = 18;
  if (ctx.y > ph - 18) { doc.addPage(); ctx.y = 18; }
  doc.setFillColor(...purpleRgb);
  doc.rect(tableX, ctx.y - 4, tableW, 8, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
  let xc = tableX + 2;
  headers.forEach((h, i) => {
    const cw = tableW * colWidths[i];
    const right = opts.rightAlign?.includes(i);
    doc.text(h.toUpperCase(), right ? xc + cw - 2 : xc, ctx.y, { align: right ? 'right' : 'left' });
    xc += cw;
  });
  ctx.y += 7;
  rows.forEach((row, ri) => {
    if (ctx.y > ph - 12) { doc.addPage(); ctx.y = 18; }
    if (ri % 2 === 0) { doc.setFillColor(249, 250, 251); doc.rect(tableX, ctx.y - 4, tableW, 7, 'F'); }
    xc = tableX + 2;
    row.forEach((cell, i) => {
      const cw = tableW * colWidths[i];
      const right = opts.rightAlign?.includes(i);
      const hCol = opts.highlightCols?.[i];
      if (hCol)      { doc.setTextColor(...hCol);    doc.setFont('helvetica', 'bold'); }
      else if (i===0){ doc.setTextColor(17,24,39);   doc.setFont('helvetica', 'bold'); }
      else           { doc.setTextColor(107,114,128); doc.setFont('helvetica', 'normal'); }
      doc.setFontSize(8);
      let txt = String(cell ?? '-');
      const maxChars = Math.floor(cw / 2.2);
      if (txt.length > maxChars) txt = txt.slice(0, maxChars - 1) + '.';
      doc.text(txt, right ? xc + cw - 2 : xc, ctx.y, { align: right ? 'right' : 'left' });
      xc += cw;
    });
    doc.setDrawColor(229, 231, 235); doc.line(tableX, ctx.y + 2, tableX + tableW, ctx.y + 2);
    ctx.y += 7;
  });
}

function pdfLoginHeatmap(ctx, hourDist) {
  const { doc, pw, ph } = ctx;
  if (ctx.y > ph - 40) { doc.addPage(); ctx.y = 18; }
  const hours = Array.from({ length: 24 }, (_, h) => {
    const e = hourDist.find(d => Number(d.hour ?? d.h) === h);
    return e ? Number(e.count ?? e.value ?? 0) : 0;
  });
  const maxVal = Math.max(...hours, 1);
  const tableW = pw - 36, cellW = tableW / 24, cellH = 11;
  hours.forEach((val, h) => {
    const t = val / maxVal; // 0..1 intensity
    // lavender (230,220,255) -> deep purple (109,40,217)
    const r = Math.round(230 - (230 - 109) * t);
    const g = Math.round(220 - (220 -  40) * t);
    const b = Math.round(255 - (255 - 217) * t);
    doc.setFillColor(r, g, b);
    doc.rect(18 + h * cellW, ctx.y, cellW - 0.3, cellH, 'F');
    if (val > 0) {
      doc.setTextColor(t > 0.45 ? 255 : 80, t > 0.45 ? 255 : 60, t > 0.45 ? 255 : 200);
      doc.setFontSize(5.5); doc.setFont('helvetica', 'bold');
      doc.text(String(val), 18 + h * cellW + cellW / 2, ctx.y + 7.5, { align: 'center' });
    }
    // tick every 3 hours
    if (h % 3 === 0) {
      doc.setTextColor(100, 100, 120); doc.setFontSize(6); doc.setFont('helvetica', 'normal');
      doc.text(`${h}h`, 18 + h * cellW + cellW / 2, ctx.y + cellH + 4, { align: 'center' });
    }
  });
  ctx.y += cellH + 8;
  const peaks = hours.map((v, h) => ({ h, v })).sort((a, b) => b.v - a.v).slice(0, 3).filter(x => x.v > 0);
  if (peaks.length) {
    doc.setTextColor(107, 114, 128); doc.setFontSize(8); doc.setFont('helvetica', 'italic');
    doc.text(
      'Peak hours: ' + peaks.map(p => `${String(p.h).padStart(2,'0')}:00 (${p.v} logins)`).join(' / '),
      18, ctx.y
    );
    ctx.y += 7;
  }
}

// ── Per-section PDF downloaders ────────────────────────────────────────────
async function downloadSectionPDF(sectionId, data, period) {
  const date = new Date().toISOString().slice(0, 10);
  const slug = `TISL-${sectionId}-${period}-${date}.pdf`;

  const ctx = await initPDF(SECTION_TITLES[sectionId] || sectionId, period);
  const { green, red, amber } = ctx;

  switch (sectionId) {
    case 'revenue': {
      const d = data;
      const { doc, pw, ph } = ctx;

      // ── 1. BIG STAT CARDS ROW ────────────────────────────────────────────
      pdfSection(ctx, 'Revenue Overview');
      if (ctx.y > ph - 52) { doc.addPage(); ctx.y = 18; }

      const cards = [
        { label: 'Total Revenue (All-Time)', value: fmtKES(d?.total_revenue_kes), sub: 'across all paid orders',          rgb: [168,85,247],  accent: true  },
        { label: 'Avg Order Value',          value: fmtKES(d?.avg_order_value_kes), sub: `per paid order - ${period}`,   rgb: [107,114,128], accent: false },
        { label: `Revenue - ${period.toUpperCase()}`, value: fmtKES(d?.period_revenue_kes), sub: `${fmtNum(d?.paid_orders)} paid orders`, rgb: [168,85,247], accent: true },
        { label: 'Unpaid Balance',           value: fmtKES(d?.unpaid_kes),          sub: `outstanding - ${period}`,      rgb: [220,38,38],   accent: false },
      ];

      const cardW = (pw - 36 - 9) / 4, cardH = 26, cardGap = 3;
      let cx = 18;
      cards.forEach(card => {
        const [r, g, b] = card.rgb;
        // background
        const tint = card.accent ? 0.92 : 0.96;
        doc.setFillColor(
          Math.round(r + (255 - r) * tint),
          Math.round(g + (255 - g) * tint),
          Math.round(b + (255 - b) * tint)
        );
        doc.roundedRect(cx, ctx.y, cardW, cardH, 2, 2, 'F');
        doc.setDrawColor(r, g, b);
        doc.setLineWidth(card.accent ? 0.6 : 0.3);
        doc.roundedRect(cx, ctx.y, cardW, cardH, 2, 2, 'S');
        doc.setLineWidth(0.2);
        // label
        doc.setTextColor(r, g, b);
        doc.setFontSize(6); doc.setFont('helvetica', 'bold');
        doc.text(card.label.toUpperCase(), cx + 3, ctx.y + 6);
        // value
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(10); doc.setFont('helvetica', 'bold');
        doc.text(card.value, cx + 3, ctx.y + 14);
        // sub
        doc.setTextColor(156, 163, 175);
        doc.setFontSize(6); doc.setFont('helvetica', 'normal');
        doc.text(card.sub, cx + 3, ctx.y + 21);
        cx += cardW + cardGap;
      });
      ctx.y += cardH + 10;

      // ── 2. KEY METRICS ROW ──────────────────────────────────────────────
      pdfSection(ctx, 'Period Metrics');
      pdfRow(ctx, 'Paid Orders',           fmtNum(d?.paid_orders),           ctx.green);
      pdfRow(ctx, 'Period Revenue',        fmtKES(d?.period_revenue_kes),    ctx.purpleRgb);
      pdfRow(ctx, 'Avg Order Value',       fmtKES(d?.avg_order_value_kes),   [59,130,246]);
      pdfRow(ctx, 'Unpaid Balance',        fmtKES(d?.unpaid_kes),            ctx.red);
      pdfRow(ctx, 'All-Time Total',        fmtKES(d?.total_revenue_kes),     ctx.purpleRgb);
      ctx.y += 4;

      // ── 3. REVENUE TREND SPARKLINE ───────────────────────────────────────
      if (d?.trend?.length > 1) {
        pdfSection(ctx, 'Revenue Trend (12 Months)');
        pdfSparkBars(ctx, d.trend.map(t => ({ ...t, value: t.value ?? t.total_kes ?? 0 })));
      }

      // ── 4. CURRENCY BREAKDOWN ────────────────────────────────────────────
      if (d?.by_currency?.length) {
        ctx.y += 4;
        pdfSection(ctx, 'Revenue by Currency (KES Equivalent)');

        // mini cards — 2 per row
        const ccardW = (pw - 36 - 6) / 2, ccardH = 24;
        d.by_currency.forEach((c, i) => {
          if (ctx.y > ph - ccardH - 6) { doc.addPage(); ctx.y = 18; }
          if (i % 2 === 0) { /* start new row */ }
          const ccx = i % 2 === 0 ? 18 : 18 + ccardW + 6;
          const isFirst = i === 0;

          doc.setFillColor(isFirst ? 245 : 249, isFirst ? 243 : 250, isFirst ? 255 : 251);
          doc.roundedRect(ccx, ctx.y, ccardW, ccardH, 2, 2, 'F');
          doc.setDrawColor(isFirst ? 168 : 229, isFirst ? 85 : 231, isFirst ? 247 : 235);
          doc.setLineWidth(isFirst ? 0.5 : 0.2);
          doc.roundedRect(ccx, ctx.y, ccardW, ccardH, 2, 2, 'S');
          doc.setLineWidth(0.2);

          // currency code
          doc.setTextColor(isFirst ? 168 : 17, isFirst ? 85 : 24, isFirst ? 247 : 39);
          doc.setFontSize(9); doc.setFont('helvetica', 'bold');
          doc.text(c.currency, ccx + 4, ctx.y + 8);

          // KES total
          doc.setTextColor(17, 24, 39);
          doc.setFontSize(10); doc.setFont('helvetica', 'bold');
          doc.text(fmtKES(c.total_kes), ccx + 4, ctx.y + 16);

          // native amount + order count
          doc.setTextColor(156, 163, 175);
          doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
          const nativeTxt = `${fmtNum(c.order_count)} orders · ${c.native_symbol || ''}${Number(c.total_native || 0).toLocaleString()}`;
          doc.text(nativeTxt, ccx + ccardW - 3, ctx.y + 16, { align: 'right' });

          // advance y only after right card or last card
          if (i % 2 === 1 || i === d.by_currency.length - 1) ctx.y += ccardH + 4;
        });
        ctx.y += 4;
      }

      // ── 5. SUMMARY CALLOUT ───────────────────────────────────────────────
      if (ctx.y > ph - 28) { doc.addPage(); ctx.y = 18; }
      doc.setFillColor(240, 253, 244); // light green
      doc.roundedRect(18, ctx.y, pw - 36, 20, 3, 3, 'F');
      doc.setDrawColor(...ctx.green); doc.setLineWidth(0.4);
      doc.roundedRect(18, ctx.y, pw - 36, 20, 3, 3, 'S');
      doc.setLineWidth(0.2);
      doc.setTextColor(...ctx.green); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.text('REVENUE SUMMARY', 24, ctx.y + 7);
      doc.setTextColor(55, 65, 81); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      const revSummary = `Period: ${fmtKES(d?.period_revenue_kes)} from ${fmtNum(d?.paid_orders)} paid orders (avg ${fmtKES(d?.avg_order_value_kes)} each). Unpaid balance: ${fmtKES(d?.unpaid_kes)}. All-time total: ${fmtKES(d?.total_revenue_kes)}.`;
      doc.text(revSummary, 24, ctx.y + 14, { maxWidth: pw - 48 });
      ctx.y += 28;

      break;
    }

    case 'orders': {
      const d = data;
      const orderTotal = d?.period_orders ?? d?.total_orders ?? 1;

      // ── Section 1: Order Status Distribution (bar chart) ──────────────────
      pdfSection(ctx, `Orders Breakdown — ${d?.period_label || 'Selected Period'}`);
      const statusItems = [
        { label: 'Pending',    value: d?.pending,    color: ctx.amber },
        { label: 'Confirmed',  value: d?.confirmed,  color: [59, 130, 246] },
        { label: 'Processing', value: d?.processing, color: [139, 92, 246] },
        { label: 'Shipped',    value: d?.shipped,    color: [6, 182, 212] },
        { label: 'Delivered',  value: d?.delivered,  color: ctx.green },
        { label: 'Cancelled',  value: d?.cancelled,  color: ctx.red },
      ];
      statusItems.forEach(s => {
        const pct = (Number(s.value || 0) / orderTotal) * 100;
        pdfBarRow(ctx, s.label, fmtNum(s.value), pct, s.color);
      });

      // ── Section 2: Key Metrics ─────────────────────────────────────────────
      ctx.y += 4;
      pdfSection(ctx, 'Key Metrics');
      pdfRow(ctx, `Orders (${d?.period_label || 'Period'})`, fmtNum(d?.period_orders ?? d?.total_orders), [139, 92, 246]);
      pdfRow(ctx, 'Total Orders (All-Time)',  fmtNum(d?.total_orders),          ctx.grey);
      pdfRow(ctx, "Today's Orders",          fmtNum(d?.today),                  [59, 130, 246]);
      pdfRow(ctx, "Today's Revenue",         fmtKES(d?.today_revenue),          ctx.green);
      pdfRow(ctx, 'Avg Order Value',         fmtKES(d?.average_order_value),    [139, 92, 246]);
      pdfRow(ctx, 'Orders w/ Backorder',     fmtNum(d?.orders_with_backorder),  ctx.amber);

      // ── Section 3: Status Summary legend (mirrors the donut legend) ────────
      ctx.y += 4;
      pdfSection(ctx, 'Status Summary');
      pdfSubheading(ctx, 'Count and share of all orders by fulfillment status.');
      statusItems.forEach(s => {
        const pct = orderTotal > 0
          ? ((Number(s.value || 0) / orderTotal) * 100).toFixed(1)
          : '0.0';
        pdfRow(ctx,
          `${s.label}  (${pct}%)`,
          fmtNum(s.value),
          s.color,
        );
      });

      // ── Section 4: Monthly Trend sparkline ────────────────────────────────
      if (d?.trend?.length > 1) {
        ctx.y += 4;
        pdfSection(ctx, 'Order Volume Trend (12 Months)');
        pdfSparkBars(ctx, d.trend);
      }

      break;
    }
    case 'products': {
      const d = data;
      const { doc, pw, ph } = ctx;

      // ── 1. BIG STAT CARDS ROW ────────────────────────────────────────────
      pdfSection(ctx, 'Inventory Overview');
      if (ctx.y > ph - 52) { doc.addPage(); ctx.y = 18; }

      const cards = [
        { label: 'Total Products', value: fmtNum(d?.total_products), sub: 'in catalog', rgb: [168,85,247], accent: true },
        { label: 'Active', value: fmtNum(d?.active_products), sub: 'published & visible', rgb: [5,150,105], accent: true },
        { label: 'In Stock', value: fmtNum(d?.in_stock), sub: 'ready to ship', rgb: [5,150,105], accent: false },
        { label: 'Low Stock', value: fmtNum(d?.low_stock), sub: 'reorder soon', rgb: [245,158,11], accent: true },
      ];
      const cardW = (pw - 36 - 9) / 4, cardH = 26, cardGap = 3;
      let cx = 18;
      cards.forEach(card => {
        const [r,g,b] = card.rgb;
        const tint = card.accent ? 0.92 : 0.96;
        doc.setFillColor(Math.round(r + (255-r)*tint), Math.round(g + (255-g)*tint), Math.round(b + (255-b)*tint));
        doc.roundedRect(cx, ctx.y, cardW, cardH, 2, 2, 'F');
        doc.setDrawColor(r,g,b); doc.setLineWidth(card.accent ? 0.6 : 0.3);
        doc.roundedRect(cx, ctx.y, cardW, cardH, 2, 2, 'S'); doc.setLineWidth(0.2);
        doc.setTextColor(r,g,b); doc.setFontSize(6); doc.setFont('helvetica','bold');
        doc.text(card.label.toUpperCase(), cx+3, ctx.y+6);
        doc.setTextColor(17,24,39); doc.setFontSize(10); doc.setFont('helvetica','bold');
        doc.text(card.value, cx+3, ctx.y+14);
        doc.setTextColor(156,163,175); doc.setFontSize(6); doc.setFont('helvetica','normal');
        doc.text(card.sub, cx+3, ctx.y+21);
        cx += cardW + cardGap;
      });
      ctx.y += cardH + 10;

      // ── 2. SECONDARY STATS ROW ───────────────────────────────────────────
      if (ctx.y > ph - 30) { doc.addPage(); ctx.y = 18; }
      const secCards = [
        { label: 'Out of Stock', value: fmtNum(d?.out_of_stock), sub: 'unavailable', rgb: [220,38,38], accent: true },
        { label: 'Featured', value: fmtNum(d?.featured), sub: 'homepage highlights', rgb: [245,158,11], accent: false },
        { label: 'On Sale', value: fmtNum(d?.on_sale), sub: 'discounted items', rgb: [59,130,246], accent: false },
        { label: 'In-Stock Rate', value: fmtPct((d?.in_stock||0)/(d?.total_products||1)*100), sub: 'of total catalog', rgb: [5,150,105], accent: true },
      ];
      let sx = 18;
      secCards.forEach(card => {
        const [r,g,b] = card.rgb;
        const tint = card.accent ? 0.92 : 0.96;
        doc.setFillColor(Math.round(r + (255-r)*tint), Math.round(g + (255-g)*tint), Math.round(b + (255-b)*tint));
        doc.roundedRect(sx, ctx.y, cardW, cardH, 2, 2, 'F');
        doc.setDrawColor(r,g,b); doc.setLineWidth(card.accent ? 0.6 : 0.3);
        doc.roundedRect(sx, ctx.y, cardW, cardH, 2, 2, 'S'); doc.setLineWidth(0.2);
        doc.setTextColor(r,g,b); doc.setFontSize(6); doc.setFont('helvetica','bold');
        doc.text(card.label.toUpperCase(), sx+3, ctx.y+6);
        doc.setTextColor(17,24,39); doc.setFontSize(10); doc.setFont('helvetica','bold');
        doc.text(card.value, sx+3, ctx.y+14);
        doc.setTextColor(156,163,175); doc.setFontSize(6); doc.setFont('helvetica','normal');
        doc.text(card.sub, sx+3, ctx.y+21);
        sx += cardW + cardGap;
      });
      ctx.y += cardH + 12;

      // ── 3. CATEGORY BREAKDOWN (mini cards, 2-per-row) ────────────────────
      if (d?.by_category?.length) {
        pdfSection(ctx, 'Products by Category');
        const ccardW = (pw - 36 - 6) / 2, ccardH = 24;
        d.by_category.slice(0,6).forEach((c, i) => {
          if (ctx.y > ph - ccardH - 6) { doc.addPage(); ctx.y = 18; }
          const ccx = i % 2 === 0 ? 18 : 18 + ccardW + 6;
          const isFirst = i === 0;
          doc.setFillColor(isFirst ? 245 : 249, isFirst ? 243 : 250, isFirst ? 255 : 251);
          doc.roundedRect(ccx, ctx.y, ccardW, ccardH, 2, 2, 'F');
          doc.setDrawColor(isFirst ? 168 : 229, isFirst ? 85 : 231, isFirst ? 247 : 235);
          doc.setLineWidth(isFirst ? 0.5 : 0.2);
          doc.roundedRect(ccx, ctx.y, ccardW, ccardH, 2, 2, 'S'); doc.setLineWidth(0.2);
          doc.setTextColor(isFirst ? 168 : 17, isFirst ? 85 : 24, isFirst ? 247 : 39);
          doc.setFontSize(9); doc.setFont('helvetica','bold');
          doc.text(c.category, ccx+4, ctx.y+8);
          doc.setTextColor(17,24,39); doc.setFontSize(10); doc.setFont('helvetica','bold');
          doc.text(fmtNum(c.product_count), ccx+4, ctx.y+16);
          doc.setTextColor(156,163,175); doc.setFontSize(6.5); doc.setFont('helvetica','normal');
          doc.text(`${fmtPct(c.product_count/(d.total_products||1)*100)} of catalog`, ccx+ccardW-3, ctx.y+16, {align:'right'});
          if (i % 2 === 1 || i === Math.min(d.by_category.length,6)-1) ctx.y += ccardH + 4;
        });
        ctx.y += 4;
      }

      // ── 4. TOP PRODUCTS BY REVENUE ───────────────────────────────────────
      if (d?.top_by_revenue?.length) {
        ctx.y += 4; pdfSection(ctx, 'Top Products by Revenue');
        pdfSubheading(ctx, 'From paid order items in selected period');
        d.top_by_revenue.slice(0,8).forEach((p,i) => {
          const isTop = i < 3;
          doc.setFillColor(isTop ? 245 : 249, isTop ? 243 : 250, isTop ? 255 : 251);
          doc.roundedRect(18, ctx.y, pw-36, 16, 2, 2, 'F');
          doc.setDrawColor(isTop ? 168 : 209, isTop ? 85 : 213, isTop ? 247 : 220);
          doc.setLineWidth(isTop ? 0.4 : 0.2);
          doc.roundedRect(18, ctx.y, pw-36, 16, 2, 2, 'S'); doc.setLineWidth(0.2);
          doc.setTextColor(156,163,175); doc.setFontSize(7); doc.setFont('helvetica','bold');
          doc.text(`#${i+1}`, 22, ctx.y+10);
          doc.setTextColor(17,24,39); doc.setFontSize(9); doc.setFont('helvetica','bold');
          doc.text(`${p.name} ${p.sku ? `(${p.sku})` : ''}`, 32, ctx.y+10);
          doc.setTextColor(isTop ? 168 : 5, isTop ? 85 : 150, isTop ? 247 : 105);
          doc.setFontSize(9); doc.setFont('helvetica','bold');
          doc.text(fmtKES(p.revenue), pw-20, ctx.y+10, {align:'right'});
          doc.setTextColor(156,163,175); doc.setFontSize(6.5); doc.setFont('helvetica','normal');
          doc.text(`${fmtNum(p.qty_sold)} units · ${fmtNum(p.order_count)} orders`, pw-22, ctx.y+5, {align:'right'});
          ctx.y += 18;
          if (ctx.y > ph - 30) { doc.addPage(); ctx.y = 18; }
        });
      }

      // ── 5. SUMMARY CALLOUT ───────────────────────────────────────────────
      if (ctx.y > ph - 28) { doc.addPage(); ctx.y = 18; }
      doc.setFillColor(240,253,244);
      doc.roundedRect(18, ctx.y, pw-36, 20, 3, 3, 'F');
      doc.setDrawColor(5,150,105); doc.setLineWidth(0.4);
      doc.roundedRect(18, ctx.y, pw-36, 20, 3, 3, 'S'); doc.setLineWidth(0.2);
      doc.setTextColor(5,150,105); doc.setFontSize(8); doc.setFont('helvetica','bold');
      doc.text('INVENTORY SUMMARY', 24, ctx.y+7);
      doc.setTextColor(55,65,81); doc.setFont('helvetica','normal'); doc.setFontSize(8);
      const stockRate = fmtPct((d?.in_stock||0)/(d?.total_products||1)*100);
      const summary = `${fmtNum(d?.in_stock)} of ${fmtNum(d?.total_products)} products in stock (${stockRate}). ${fmtNum(d?.low_stock)} need reordering. Top performer: ${d?.top_by_revenue?.[0]?.name || 'N/A'} (${fmtKES(d?.top_by_revenue?.[0]?.revenue)}).`;
      doc.text(summary, 24, ctx.y+14, {maxWidth: pw-48});
      ctx.y += 28;

      break;
    }

    case 'brands': {
      const d = data;
      const { doc, pw, ph } = ctx;

      // ── 1. BIG STAT CARDS ROW ────────────────────────────────────────────
      pdfSection(ctx, 'Brand Catalog');
      if (ctx.y > ph - 52) { doc.addPage(); ctx.y = 18; }

      const cards = [
        { label: 'Total Brands', value: fmtNum(d?.total_brands), sub: 'in system', rgb: [168,85,247], accent: true },
        { label: 'Active', value: fmtNum(d?.active_brands), sub: 'currently selling', rgb: [5,150,105], accent: true },
        { label: 'Featured', value: fmtNum(d?.featured_brands), sub: 'homepage highlights', rgb: [245,158,11], accent: false },
        { label: 'Avg Products', value: fmtNum(Math.round((d?.total_products||0)/(d?.total_brands||1))), sub: 'per brand', rgb: [59,130,246], accent: false },
      ];
      const cardW = (pw - 36 - 9) / 4, cardH = 26, cardGap = 3;
      let cx = 18;
      cards.forEach(card => {
        const [r,g,b] = card.rgb;
        const tint = card.accent ? 0.92 : 0.96;
        doc.setFillColor(Math.round(r + (255-r)*tint), Math.round(g + (255-g)*tint), Math.round(b + (255-b)*tint));
        doc.roundedRect(cx, ctx.y, cardW, cardH, 2, 2, 'F');
        doc.setDrawColor(r,g,b); doc.setLineWidth(card.accent ? 0.6 : 0.3);
        doc.roundedRect(cx, ctx.y, cardW, cardH, 2, 2, 'S'); doc.setLineWidth(0.2);
        doc.setTextColor(r,g,b); doc.setFontSize(6); doc.setFont('helvetica','bold');
        doc.text(card.label.toUpperCase(), cx+3, ctx.y+6);
        doc.setTextColor(17,24,39); doc.setFontSize(10); doc.setFont('helvetica','bold');
        doc.text(card.value, cx+3, ctx.y+14);
        doc.setTextColor(156,163,175); doc.setFontSize(6); doc.setFont('helvetica','normal');
        doc.text(card.sub, cx+3, ctx.y+21);
        cx += cardW + cardGap;
      });
      ctx.y += cardH + 10;

      // ── 2. TOP BRANDS BY REVENUE (mini cards) ────────────────────────────
      if (d?.top_by_revenue?.length) {
        pdfSection(ctx, 'Top Brands by Revenue');
        pdfSubheading(ctx, 'From paid order items in selected period');
        const ccardW = (pw - 36 - 6) / 2, ccardH = 28;
        d.top_by_revenue.slice(0,6).forEach((b, i) => {
          if (ctx.y > ph - ccardH - 6) { doc.addPage(); ctx.y = 18; }
          const ccx = i % 2 === 0 ? 18 : 18 + ccardW + 6;
          const isTop = i < 2;
          doc.setFillColor(isTop ? 245 : 249, isTop ? 243 : 250, isTop ? 255 : 251);
          doc.roundedRect(ccx, ctx.y, ccardW, ccardH, 2, 2, 'F');
          doc.setDrawColor(isTop ? 168 : 209, isTop ? 85 : 213, isTop ? 247 : 220);
          doc.setLineWidth(isTop ? 0.5 : 0.2);
          doc.roundedRect(ccx, ctx.y, ccardW, ccardH, 2, 2, 'S'); doc.setLineWidth(0.2);
          doc.setTextColor(isTop ? 168 : 156, isTop ? 85 : 163, isTop ? 247 : 175);
          doc.setFontSize(7); doc.setFont('helvetica','bold');
          doc.text(`#${i+1} ${b.brand}`, ccx+4, ctx.y+7);
          doc.setTextColor(17,24,39); doc.setFontSize(11); doc.setFont('helvetica','bold');
          doc.text(fmtKES(b.revenue), ccx+4, ctx.y+17);
          doc.setTextColor(156,163,175); doc.setFontSize(6.5); doc.setFont('helvetica','normal');
          doc.text(`${fmtNum(b.qty_sold)} units · ${fmtNum(b.order_count)} orders`, ccx+ccardW-3, ctx.y+17, {align:'right'});
          if (i % 2 === 1 || i === Math.min(d.top_by_revenue.length,6)-1) ctx.y += ccardH + 4;
        });
        ctx.y += 4;
      }

      // ── 3. PRODUCTS PER BRAND (horizontal list) ──────────────────────────
      if (d?.by_product_count?.length) {
        ctx.y += 4; pdfSection(ctx, 'Products per Brand');
        d.by_product_count.slice(0,8).forEach((b,i) => {
          const pct = Math.min(100, Math.round((b.product_count/(d?.total_products||1))*100));
          doc.setFillColor(249,250,251); doc.roundedRect(18, ctx.y, pw-36, 14, 2, 2, 'F');
          doc.setDrawColor(229,231,235); doc.setLineWidth(0.2);
          doc.roundedRect(18, ctx.y, pw-36, 14, 2, 2, 'S');
          doc.setTextColor(17,24,39); doc.setFontSize(8); doc.setFont('helvetica','bold');
          doc.text(`${i+1}. ${b.brand}`, 22, ctx.y+9);
          doc.setFillColor(245, 243, 255); doc.roundedRect(pw-60, ctx.y+2, Math.max(2, pct*0.4), 10, 1, 1, 'F');
          doc.setTextColor(168,85,247); doc.setFontSize(7); doc.setFont('helvetica','bold');
          doc.text(fmtNum(b.product_count), pw-22, ctx.y+9, {align:'right'});
          ctx.y += 16;
          if (ctx.y > ph - 30) { doc.addPage(); ctx.y = 18; }
        });
      }

      // ── 4. SUMMARY CALLOUT ───────────────────────────────────────────────
      if (ctx.y > ph - 28) { doc.addPage(); ctx.y = 18; }
      doc.setFillColor(245,243,255);
      doc.roundedRect(18, ctx.y, pw-36, 20, 3, 3, 'F');
      doc.setDrawColor(168,85,247); doc.setLineWidth(0.4);
      doc.roundedRect(18, ctx.y, pw-36, 20, 3, 3, 'S'); doc.setLineWidth(0.2);
      doc.setTextColor(168,85,247); doc.setFontSize(8); doc.setFont('helvetica','bold');
      doc.text('BRAND SUMMARY', 24, ctx.y+7);
      doc.setTextColor(55,65,81); doc.setFont('helvetica','normal'); doc.setFontSize(8);
      const topBrand = d?.top_by_revenue?.[0]?.brand || 'N/A';
      const summary = `${fmtNum(d?.active_brands)} active brands driving ${fmtKES(d?.top_by_revenue?.reduce((a,b)=>a+b.revenue,0)||0)} in period revenue. Top performer: ${topBrand}.`;
      doc.text(summary, 24, ctx.y+14, {maxWidth: pw-48});
      ctx.y += 28;

      break;
    }
    case 'services': {
      const d = data;
      const { doc, pw, ph } = ctx;

      // ── 1. BIG STAT CARDS ROW ────────────────────────────────────────────
      pdfSection(ctx, 'Service Catalog');
      if (ctx.y > ph - 52) { doc.addPage(); ctx.y = 18; }

      const cards = [
        { label: 'Total Services', value: fmtNum(d?.total_services), sub: 'in catalog', rgb: [168,85,247], accent: true },
        { label: 'Active', value: fmtNum(d?.active_services), sub: 'bookable now', rgb: [5,150,105], accent: true },
        { label: 'Featured', value: fmtNum(d?.featured_services), sub: 'promoted listings', rgb: [245,158,11], accent: false },
        { label: 'Service Revenue', value: fmtKES(d?.revenue_split?.service_revenue), sub: `period · ${period}`, rgb: [168,85,247], accent: true },
      ];
      const cardW = (pw - 36 - 9) / 4, cardH = 26, cardGap = 3;
      let cx = 18;
      cards.forEach(card => {
        const [r,g,b] = card.rgb;
        const tint = card.accent ? 0.92 : 0.96;
        doc.setFillColor(Math.round(r + (255-r)*tint), Math.round(g + (255-g)*tint), Math.round(b + (255-b)*tint));
        doc.roundedRect(cx, ctx.y, cardW, cardH, 2, 2, 'F');
        doc.setDrawColor(r,g,b); doc.setLineWidth(card.accent ? 0.6 : 0.3);
        doc.roundedRect(cx, ctx.y, cardW, cardH, 2, 2, 'S'); doc.setLineWidth(0.2);
        doc.setTextColor(r,g,b); doc.setFontSize(6); doc.setFont('helvetica','bold');
        doc.text(card.label.toUpperCase(), cx+3, ctx.y+6);
        doc.setTextColor(17,24,39); doc.setFontSize(10); doc.setFont('helvetica','bold');
        doc.text(card.value, cx+3, ctx.y+14);
        doc.setTextColor(156,163,175); doc.setFontSize(6); doc.setFont('helvetica','normal');
        doc.text(card.sub, cx+3, ctx.y+21);
        cx += cardW + cardGap;
      });
      ctx.y += cardH + 10;

      // ── 2. REVENUE SPLIT VISUAL ──────────────────────────────────────────
      ctx.y += 4; pdfSection(ctx, 'Revenue Split (Period)');
      const svcRev = d?.revenue_split?.service_revenue || 0;
      const prodRev = d?.revenue_split?.product_revenue || 0;
      const total = svcRev + prodRev || 1;
      const svcPct = Math.round((svcRev/total)*100);
      
      // Progress bar background
      doc.setFillColor(243,244,246); doc.roundedRect(18, ctx.y, pw-36, 12, 2, 2, 'F');
      // Service portion
      doc.setFillColor(168,85,247); doc.roundedRect(18, ctx.y, Math.max(2, (pw-36)*svcPct/100), 12, 2, 2, 'F');
      // Border
      doc.setDrawColor(168,85,247); doc.setLineWidth(0.3);
      doc.roundedRect(18, ctx.y, pw-36, 12, 2, 2, 'S'); doc.setLineWidth(0.2);
      
      // Labels
      doc.setTextColor(168,85,247); doc.setFontSize(8); doc.setFont('helvetica','bold');
      doc.text(`Services ${fmtPct(svcPct)}`, 22, ctx.y+8);
      doc.setTextColor(5,150,105);
      doc.text(`Products ${fmtPct(100-svcPct)}`, pw-20, ctx.y+8, {align:'right'});
      ctx.y += 18;

      // ── 3. SERVICES BY CATEGORY (mini cards, 2-per-row) ──────────────────
      if (d?.by_category?.length) {
        pdfSection(ctx, 'Services by Category');
        const ccardW = (pw - 36 - 6) / 2, ccardH = 24;
        d.by_category.slice(0,6).forEach((c, i) => {
          if (ctx.y > ph - ccardH - 6) { doc.addPage(); ctx.y = 18; }
          const ccx = i % 2 === 0 ? 18 : 18 + ccardW + 6;
          const isFirst = i === 0;
          doc.setFillColor(isFirst ? 245 : 249, isFirst ? 243 : 250, isFirst ? 255 : 251);
          doc.roundedRect(ccx, ctx.y, ccardW, ccardH, 2, 2, 'F');
          doc.setDrawColor(isFirst ? 168 : 229, isFirst ? 85 : 231, isFirst ? 247 : 235);
          doc.setLineWidth(isFirst ? 0.5 : 0.2);
          doc.roundedRect(ccx, ctx.y, ccardW, ccardH, 2, 2, 'S'); doc.setLineWidth(0.2);
          doc.setTextColor(isFirst ? 168 : 17, isFirst ? 85 : 24, isFirst ? 247 : 39);
          doc.setFontSize(9); doc.setFont('helvetica','bold');
          doc.text(c.category, ccx+4, ctx.y+8);
          doc.setTextColor(17,24,39); doc.setFontSize(10); doc.setFont('helvetica','bold');
          doc.text(fmtNum(c.order_count), ccx+4, ctx.y+16);
          doc.setTextColor(156,163,175); doc.setFontSize(6.5); doc.setFont('helvetica','normal');
          doc.text(`${fmtKES(c.revenue)}`, ccx+ccardW-3, ctx.y+16, {align:'right'});
          if (i % 2 === 1 || i === Math.min(d.by_category.length,6)-1) ctx.y += ccardH + 4;
        });
        ctx.y += 4;
      }

      // ── 4. TOP SERVICES BY REVENUE ───────────────────────────────────────
      if (d?.top_by_revenue?.length) {
        ctx.y += 4; pdfSection(ctx, 'Top Services by Revenue');
        d.top_by_revenue.slice(0,8).forEach((s,i) => {
          const isTop = i < 3;
          doc.setFillColor(isTop ? 245 : 249, isTop ? 243 : 250, isTop ? 255 : 251);
          doc.roundedRect(18, ctx.y, pw-36, 16, 2, 2, 'F');
          doc.setDrawColor(isTop ? 168 : 209, isTop ? 85 : 213, isTop ? 247 : 220);
          doc.setLineWidth(isTop ? 0.4 : 0.2);
          doc.roundedRect(18, ctx.y, pw-36, 16, 2, 2, 'S'); doc.setLineWidth(0.2);
          doc.setTextColor(156,163,175); doc.setFontSize(7); doc.setFont('helvetica','bold');
          doc.text(`#${i+1}`, 22, ctx.y+10);
          doc.setTextColor(17,24,39); doc.setFontSize(9); doc.setFont('helvetica','bold');
          doc.text(`${s.name} ${s.category ? `· ${s.category}` : ''}`, 32, ctx.y+10);
          doc.setTextColor(isTop ? 168 : 5, isTop ? 85 : 150, isTop ? 247 : 105);
          doc.setFontSize(9); doc.setFont('helvetica','bold');
          doc.text(fmtKES(s.revenue), pw-20, ctx.y+10, {align:'right'});
          doc.setTextColor(156,163,175); doc.setFontSize(6.5); doc.setFont('helvetica','normal');
          doc.text(`${fmtNum(s.qty_sold)} orders`, pw-22, ctx.y+5, {align:'right'});
          ctx.y += 18;
          if (ctx.y > ph - 30) { doc.addPage(); ctx.y = 18; }
        });
      }

      // ── 5. SUMMARY CALLOUT ───────────────────────────────────────────────
      if (ctx.y > ph - 28) { doc.addPage(); ctx.y = 18; }
      doc.setFillColor(245,243,255);
      doc.roundedRect(18, ctx.y, pw-36, 20, 3, 3, 'F');
      doc.setDrawColor(168,85,247); doc.setLineWidth(0.4);
      doc.roundedRect(18, ctx.y, pw-36, 20, 3, 3, 'S'); doc.setLineWidth(0.2);
      doc.setTextColor(168,85,247); doc.setFontSize(8); doc.setFont('helvetica','bold');
      doc.text('SERVICES SUMMARY', 24, ctx.y+7);
      doc.setTextColor(55,65,81); doc.setFont('helvetica','normal'); doc.setFontSize(8);
      const topSvc = d?.top_by_revenue?.[0]?.name || 'N/A';
      const summary = `${fmtNum(d?.active_services)} active services generated ${fmtKES(svcRev)} (${fmtPct(svcPct)} of mixed revenue). Top service: ${topSvc}.`;
      doc.text(summary, 24, ctx.y+14, {maxWidth: pw-48});
      ctx.y += 28;

      break;
    }
    case 'funnel': {
      const d = data;

      // ── 1. STAGE BUBBLES ROW ─────────────────────────────────────────────
      pdfSection(ctx, 'Quote Request -> Quote -> Order Funnel');

      const stages = [
        { label: 'Quote Requests', value: fmtNum(d?.total_requests),      sub: '100%',                           hex: [245,158,11]  },
        { label: 'Quoted',         value: fmtNum(d?.converted_to_quotes),  sub: fmtPct(d?.req_to_quote_rate),    hex: [168,85,247]  },
        { label: 'Orders',         value: fmtNum(d?.converted_to_orders),  sub: fmtPct(d?.quote_to_order_rate),  hex: [5,150,105]   },
      ];

      const { doc, pw, ph } = ctx;
      if (ctx.y > ph - 52) { doc.addPage(); ctx.y = 18; }

      const boxW = 48, boxH = 28, gap = 14;
      const totalRowW = stages.length * boxW + (stages.length - 1) * gap;
      let bx = (pw - totalRowW) / 2;

      stages.forEach((s, i) => {
        const [r, g, b] = s.hex;
        // background fill (10% tint)
        doc.setFillColor(r + Math.round((255 - r) * 0.88), g + Math.round((255 - g) * 0.88), b + Math.round((255 - b) * 0.88));
        doc.roundedRect(bx, ctx.y, boxW, boxH, 3, 3, 'F');
        // border
        doc.setDrawColor(r, g, b);
        doc.setLineWidth(0.5);
        doc.roundedRect(bx, ctx.y, boxW, boxH, 3, 3, 'S');
        doc.setLineWidth(0.2);
        // big number
        doc.setTextColor(r, g, b);
        doc.setFontSize(15); doc.setFont('helvetica', 'bold');
        doc.text(s.value, bx + boxW / 2, ctx.y + 10, { align: 'center' });
        // label
        doc.setTextColor(55, 65, 81);
        doc.setFontSize(7); doc.setFont('helvetica', 'bold');
        doc.text(s.label, bx + boxW / 2, ctx.y + 17, { align: 'center' });
        // sub pct
        doc.setTextColor(156, 163, 175);
        doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.text(s.sub, bx + boxW / 2, ctx.y + 23, { align: 'center' });

        // arrow between boxes
        if (i < stages.length - 1) {
          const ax = bx + boxW + 2, ay = ctx.y + boxH / 2;
          doc.setDrawColor(209, 213, 219); doc.setLineWidth(0.5);
          doc.line(ax, ay, ax + gap - 4, ay);
          // arrowhead
          doc.setFillColor(209, 213, 219);
          doc.triangle(ax + gap - 4, ay - 2, ax + gap - 4, ay + 2, ax + gap, ay, 'F');
        }
        bx += boxW + gap;
      });
      ctx.y += boxH + 12;

      // ── 2. FUNNEL BARS ───────────────────────────────────────────────────
      pdfSection(ctx, 'Pipeline Funnel');
      const total = d?.total_requests || 1;
      pdfBarRow(ctx, 'Quote Requests',       fmtNum(d?.total_requests),      100,                                              [245,158,11]);
      pdfBarRow(ctx, 'Converted to Quotes',  fmtNum(d?.converted_to_quotes), ((d?.converted_to_quotes || 0)/total)*100,       [168,85,247]);
      pdfBarRow(ctx, 'Converted to Orders',  fmtNum(d?.converted_to_orders), ((d?.converted_to_orders || 0)/total)*100,       [5,150,105]);
      ctx.y += 4;

      // ── 3. TWO-COLUMN SPLIT: Status | Metrics ───────────────────────────
      if (ctx.y > ph - 80) { doc.addPage(); ctx.y = 18; }
      const colL = 18, colR = pw / 2 + 4, colW = pw / 2 - 22, rowH = 9;

      // column headers
      const headerY = ctx.y;
      doc.setFillColor(249, 250, 251);
      doc.roundedRect(colL - 2, headerY - 5, colW + 4, 11, 2, 2, 'F');
      doc.roundedRect(colR - 2, headerY - 5, colW + 4, 11, 2, 2, 'F');
      doc.setTextColor(...ctx.purpleRgb);
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text('REQUEST STATUS', colL + 2, headerY + 2);
      doc.text('CONVERSION METRICS', colR + 2, headerY + 2);
      ctx.y += 10;

      // status rows
      const statuses = [
        { label: 'Pending',       value: d?.pending,                 rgb: [245,158,11]  },
        { label: 'Reviewing',     value: d?.reviewing,               rgb: [59,130,246]  },
        { label: 'Quoted',        value: d?.quoted,                  rgb: [168,85,247]  },
        { label: 'Needs Clarity', value: d?.requires_clarification,  rgb: [249,115,22]  },
        { label: 'Rejected',      value: d?.rejected,                rgb: [220,38,38]   },
        { label: 'Expired',       value: d?.expired,                 rgb: [156,163,175] },
      ];

      const metrics = [
        { label: 'Req -> Quote Rate',    value: fmtPct(d?.req_to_quote_rate),               rgb: [168,85,247]  },
        { label: 'Quote -> Order Rate',  value: fmtPct(d?.quote_to_order_rate),             rgb: [5,150,105]   },
        { label: 'End-to-End Rate',     value: fmtPct(d?.end_to_end_rate),                 rgb: [59,130,246]  },
        { label: 'Avg Response Time',   value: `${(d?.avg_response_hours||0).toFixed(1)} hrs`, rgb: [245,158,11] },
        { label: 'Unassigned',          value: fmtNum(d?.unassigned),                      rgb: [220,38,38]   },
      ];

      const maxRows = Math.max(statuses.length, metrics.length);
      for (let ri = 0; ri < maxRows; ri++) {
        if (ctx.y > ph - 14) { doc.addPage(); ctx.y = 18; }
        const rowY = ctx.y;

        // alternating stripe across both columns
        if (ri % 2 === 0) {
          doc.setFillColor(249, 250, 251);
          doc.rect(colL - 2, rowY - 5, (colR + colW + 4) - (colL - 2), rowH, 'F');
        }

        // left: status
        if (ri < statuses.length) {
          const s = statuses[ri];
          const pct = ((s.value || 0) / total) * 100;
          doc.setFillColor(...s.rgb);
          doc.circle(colL + 2, rowY - 0.5, 2, 'F');
          doc.setTextColor(55, 65, 81); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
          doc.text(s.label, colL + 7, rowY + 0.5);
          doc.setTextColor(107, 114, 128); doc.setFontSize(7.5);
          doc.text(`${pct.toFixed(1)}%`, colL + colW - 26, rowY + 0.5);
          doc.setTextColor(...s.rgb); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
          doc.text(fmtNum(s.value), colL + colW, rowY + 0.5, { align: 'right' });
        }

        // right: metric
        if (ri < metrics.length) {
          const m = metrics[ri];
          doc.setTextColor(55, 65, 81); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
          doc.text(m.label, colR + 5, rowY + 0.5);
          doc.setTextColor(...m.rgb); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
          doc.text(m.value, colR + colW, rowY + 0.5, { align: 'right' });
        }

        // divider line spanning both columns
        doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.2);
        doc.line(colL - 2, rowY + 3, colR + colW + 2, rowY + 3);
        ctx.y += rowH;
      }

      ctx.y += 6;

      // ── 4. SUMMARY CALLOUT BOX ───────────────────────────────────────────
      if (ctx.y > ph - 28) { doc.addPage(); ctx.y = 18; }
      doc.setFillColor(245, 243, 255); // very light purple
      doc.roundedRect(18, ctx.y, pw - 36, 20, 3, 3, 'F');
      doc.setDrawColor(...ctx.purpleRgb); doc.setLineWidth(0.4);
      doc.roundedRect(18, ctx.y, pw - 36, 20, 3, 3, 'S');
      doc.setLineWidth(0.2);
      doc.setTextColor(...ctx.purpleRgb); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.text('FUNNEL SUMMARY', 24, ctx.y + 7);
      doc.setTextColor(55, 65, 81); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      const summaryLine = `Of ${fmtNum(d?.total_requests)} requests, ${fmtNum(d?.converted_to_quotes)} were quoted (${fmtPct(d?.req_to_quote_rate)}) and ${fmtNum(d?.converted_to_orders)} converted to orders — an end-to-end rate of ${fmtPct(d?.end_to_end_rate)}.`;
      doc.text(summaryLine, 24, ctx.y + 14, { maxWidth: pw - 48 });
      ctx.y += 28;

      break;
    }
    case 'projects': {
      const d = data;
      const projectTotal = d?.total || 1;

      // ── Section 1: Status Breakdown (bar chart) ────────────────────────────
      pdfSection(ctx, `Projects Overview — ${d?.period_label || 'Selected Period'}`);
      const statusItems = [
        { label: 'Planning',  value: d?.planning,  color: ctx.grey },
        { label: 'Active',    value: d?.active,    color: [59, 130, 246] },
        { label: 'On Hold',   value: d?.on_hold,   color: ctx.amber },
        { label: 'Completed', value: d?.completed, color: ctx.green },
        { label: 'Cancelled', value: d?.cancelled, color: ctx.red },
      ];
      statusItems.forEach(s => {
        const pct = (Number(s.value || 0) / projectTotal) * 100;
        pdfBarRow(ctx, s.label, fmtNum(s.value), pct, s.color);
      });

      // ── Section 2: Health Metrics ──────────────────────────────────────────
      ctx.y += 4;
      pdfSection(ctx, 'Health Metrics');
      pdfRow(ctx, 'Total Projects',     fmtNum(d?.total),             [59, 130, 246]);
      pdfRow(ctx, 'Completion Rate',    fmtPct(d?.completion_rate),   ctx.green);
      pdfRow(ctx, 'Overdue',            fmtNum(d?.overdue),           ctx.red);
      pdfRow(ctx, 'Unassigned',         fmtNum(d?.unassigned),        ctx.amber);
      pdfRow(ctx, 'Overdue Milestones', fmtNum(d?.overdue_milestones), [249, 115, 22]);

      // Completion rate progress bar
      ctx.y += 2;
      pdfBarRow(ctx,
        'Completion Rate',
        fmtPct(d?.completion_rate),
        Math.min(d?.completion_rate || 0, 100),
        [5, 150, 105], // green
      );

      // ── Section 3: By Priority (bar chart) ────────────────────────────────
      if (d?.by_priority) {
        ctx.y += 4;
        pdfSection(ctx, 'By Priority');
        const priorityItems = [
          { label: 'Urgent', value: d.by_priority?.urgent, color: ctx.red },
          { label: 'High',   value: d.by_priority?.high,   color: [249, 115, 22] },
          { label: 'Medium', value: d.by_priority?.medium, color: ctx.amber },
          { label: 'Low',    value: d.by_priority?.low,    color: ctx.grey },
        ];
        const maxPriority = Math.max(...priorityItems.map(p => Number(p.value || 0)), 1);
        priorityItems.forEach(p => {
          const pct = (Number(p.value || 0) / maxPriority) * 100;
          pdfBarRow(ctx, p.label, fmtNum(p.value), pct, p.color);
        });
      }

      // ── Section 4: Monthly Creation Trend sparkline ────────────────────────
      if (d?.created_per_month?.length > 1) {
        ctx.y += 4;
        pdfSection(ctx, 'Projects Created per Month');
        pdfSparkBars(ctx, d.created_per_month);
      }

      break;
    }
    case 'customers': {
      const d = data;
      const total = d?.total_customers || 1;

      pdfSection(ctx, 'Customer Overview');
      pdfRow(ctx, 'Total Customers',    fmtNum(d?.total_customers));
      pdfRow(ctx, 'Active Customers',   fmtNum(d?.active_customers),    green);
      pdfRow(ctx, 'New This Period',    fmtNum(d?.new_customers),        [59,130,246]);
      pdfRow(ctx, 'VIP (Gold+)',        fmtNum(d?.vip_customers),        amber);
      pdfRow(ctx, 'Credit Accounts',    fmtNum(d?.with_credit),          [139,92,246]);
      pdfRow(ctx, 'Avg Lifetime Value', fmtKES(d?.avg_lifetime_value),   green);

      ctx.y += 4; pdfSection(ctx, 'Customers by Tier');
      [
        ...(d?.by_tier ? Object.keys(d.by_tier).map(slug => {
          const colorMap = { platinum: [139,92,246], gold: [245,158,11], silver: [156,163,175], bronze: [249,115,22] };
          return { key: slug, label: slug.charAt(0).toUpperCase() + slug.slice(1), color: colorMap[slug] || [156,163,175] };
        }) : []),
      ].forEach(({ key, label, color }) => {
        const count = d?.by_tier?.[key] || 0;
        pdfBarRow(ctx, label, fmtNum(count), total > 0 ? (count / total) * 100 : 0, color);
      });

      ctx.y += 4; pdfSection(ctx, 'Customers by Type');
      [
        ...(d?.by_type ? Object.keys(d.by_type).map(slug => {
          const colorMap = { individual: [59,130,246], business: [168,85,247], wholesale: [5,150,105], contractor: [245,158,11] };
          return { key: slug, label: slug.charAt(0).toUpperCase() + slug.slice(1), color: colorMap[slug] || [156,163,175] };
        }) : []),
      ].forEach(({ key, label, color }) => {
        const count = d?.by_type?.[key] || 0;
        pdfBarRow(ctx, label, fmtNum(count), total > 0 ? (count / total) * 100 : 0, color);
      });

      if (d?.trend?.length > 1) {
        ctx.y += 4; pdfSection(ctx, 'New Customers - Monthly Trend');
        pdfSparkBars(ctx, d.trend);
      }

      if (d?.top_by_spend?.length) {
        ctx.y += 4; pdfSection(ctx, 'Top Customers by Period Spend');
        pdfTable(ctx,
          ['#', 'Name', 'Type', 'Tier', 'Orders', 'Last Order', 'Total Spent'],
          d.top_by_spend.slice(0, 15).map((c, i) => [
            i + 1, c.name, c.type || '-', c.tier || '-',
            fmtNum(c.total_orders),
            c.last_order ? fmtDate(c.last_order) : '-',
            fmtKES(c.total_spent),
          ]),
          [0.05, 0.24, 0.11, 0.11, 0.10, 0.15, 0.24],
          { rightAlign: [0, 4, 5, 6], highlightCols: { 6: green } }
        );
      }

      if (d?.top_by_orders?.length) {
        ctx.y += 6; pdfSection(ctx, 'Top Customers by Order Count');
        pdfTable(ctx,
          ['#', 'Name', 'Type', 'Tier', 'Total Orders', 'Total Spent'],
          d.top_by_orders.slice(0, 15).map((c, i) => [
            i + 1, c.name, c.type || '-', c.tier || '-',
            fmtNum(c.total_orders), fmtKES(c.total_spent),
          ]),
          [0.05, 0.30, 0.12, 0.12, 0.18, 0.23],
          { rightAlign: [0, 4, 5], highlightCols: { 4: [168,85,247], 5: green } }
        );
      }

      if (d?.login_hour_dist?.length) {
        ctx.y += 6; pdfSection(ctx, 'Login Time Distribution (Hour of Day)');
        pdfLoginHeatmap(ctx, d.login_hour_dist);
      }

      break;
    }
    case 'tickets': {
      const d = data;

      // ── Section 1: Status Overview ─────────────────────────────────────────
      pdfSection(ctx, `Support Tickets — Status Overview`);
      pdfSubheading(ctx, `Period: ${d?.period_label || 'selected period'}`);

      const statusItems = [
        { label: 'Open',        value: fmtNum(d?.open),             color: ctx.red },
        { label: 'In Progress', value: fmtNum(d?.in_progress),      color: ctx.amber },
        { label: 'Resolved',    value: fmtNum(d?.resolved),         color: ctx.green },
        { label: 'Closed',      value: fmtNum(d?.closed),           color: ctx.grey },
        { label: 'On Hold',     value: fmtNum(d?.on_hold),          color: [59, 130, 246] },
        { label: 'Waiting',     value: fmtNum(d?.waiting_customer), color: [139, 92, 246] },
      ];
      statusItems.forEach(m => pdfRow(ctx, m.label, m.value, m.color));

      // Resolution rate progress bar (mirrors the green bar on the page)
      ctx.y += 2;
      pdfBarRow(ctx,
        'Resolution Rate',
        fmtPct(d?.resolution_rate),
        Math.min(d?.resolution_rate || 0, 100),
        [5, 150, 105], // green
      );

      // ── Section 2: SLA & Performance ──────────────────────────────────────
      ctx.y += 4;
      pdfSection(ctx, 'SLA & Performance');
      pdfRow(ctx, 'Total Tickets (All-Time)', fmtNum(d?.total));
      pdfRow(ctx, 'Unassigned',              fmtNum(d?.unassigned),    ctx.red);
      pdfRow(ctx, 'Created This Period',     fmtNum(d?.period_total),  [59, 130, 246]);
      pdfRow(ctx, 'Resolved This Period',    fmtNum(d?.period_resolved), ctx.green);
      pdfRow(ctx, 'Avg First Response',      fmtHrs(d?.avg_first_response_hours || 0), ctx.amber);
      pdfRow(ctx, 'Avg Resolution Time',     fmtHrs(d?.avg_resolution_hours    || 0), ctx.green);

      // ── Section 3: Status Distribution (bar chart) ────────────────────────
      ctx.y += 4;
      pdfSection(ctx, 'Status Distribution');
      const total = d?.total || 1;
      statusItems.forEach(s => {
        const rawVal = d?.[s.label.toLowerCase().replace(' ', '_')] ?? 0;
        const pct = (rawVal / total) * 100;
        pdfBarRow(ctx, s.label, fmtNum(rawVal), pct, s.color);
      });

      // ── Section 4: By Priority ────────────────────────────────────────────
      ctx.y += 4;
      pdfSection(ctx, 'By Priority');
      const priorityItems = [
        { label: 'Urgent', value: d?.by_priority?.urgent, color: ctx.red },
        { label: 'High',   value: d?.by_priority?.high,   color: [249, 115, 22] },
        { label: 'Medium', value: d?.by_priority?.medium, color: ctx.amber },
        { label: 'Low',    value: d?.by_priority?.low,    color: ctx.grey },
      ];
      const maxPriority = Math.max(...priorityItems.map(p => Number(p.value || 0)), 1);
      priorityItems.forEach(p => {
        const pct = (Number(p.value || 0) / maxPriority) * 100;
        pdfBarRow(ctx, p.label, fmtNum(p.value), pct, p.color);
      });

      // ── Section 5: By Category (bar chart) ───────────────────────────────
      if (d?.by_category?.length > 0) {
        ctx.y += 4;
        pdfSection(ctx, 'By Category');
        const catColors = [
          [245, 158, 11],
          [59, 130, 246],
          [139, 92, 246],
          [5, 150, 105],
          [239, 68, 68],
        ];
        const maxCat = Math.max(...d.by_category.map(c => Number(c.count || 0)), 1);
        d.by_category.forEach((c, i) => {
          const pct = (Number(c.count || 0) / maxCat) * 100;
          pdfBarRow(ctx,
            c.category || 'Uncategorised',
            fmtNum(c.count),
            pct,
            catColors[i % catColors.length],
          );
        });
      }

      // ── Section 6: Monthly Trend sparkline ────────────────────────────────
      if (d?.trend?.length > 1) {
        ctx.y += 4;
        pdfSection(ctx, 'Tickets Created per Month (12-Month Trend)');
        pdfSparkBars(ctx, d.trend);
      }

      break;
    }
    case 'promos': {
      const d = data;

      // ── Section 1: Code Inventory ──────────────────────────────────────────
      pdfSection(ctx, 'Promotional Codes — Code Inventory (All-Time)');
      pdfSubheading(ctx, 'Discount codes distributed to customers — coupons, first-time offers, bulk, VIP, birthday, event campaigns.');

      // 2-column mini-grid rendered as paired rows
      const inventory = [
        { label: 'Total Codes',      value: fmtNum(d?.total_codes),    color: null },
        { label: 'Active',           value: fmtNum(d?.active_codes),   color: ctx.green },
        { label: 'Expiring (7d)',    value: fmtNum(d?.expiring_soon),  color: ctx.amber },
        { label: 'Expired',          value: fmtNum(d?.expired_codes),  color: ctx.red },
        { label: 'Depleted',         value: fmtNum(d?.depleted_codes), color: ctx.grey },
        { label: 'Paused',           value: fmtNum(d?.paused_codes),   color: [249, 115, 22] },
      ];
      inventory.forEach(m => pdfRow(ctx, m.label, m.value, m.color));

      // ── Section 2: Financial Impact ────────────────────────────────────────
      ctx.y += 4;
      pdfSection(ctx, `Financial Impact — ${d?.period_label || 'Selected Period'}`);
      pdfSubheading(ctx, 'Usage recorded within the selected period only.');
      pdfRow(ctx, 'Revenue from Promo Orders', fmtKES(d?.period_revenue_from_promos ?? d?.total_revenue_from_promos), ctx.green);
      pdfRow(ctx, 'Discount Given',            fmtKES(d?.period_discount_given     ?? d?.total_discount_given),       ctx.red);
      pdfRow(ctx, 'Code Uses',                 fmtNum(d?.period_uses               ?? d?.total_uses));

      // ── Section 3: Revenue by Code Type (bar chart) ────────────────────────
      const byType = (d?.by_type || []).filter(t => t.type !== 'customer_referral');
      if (byType.length > 0) {
        ctx.y += 4;
        pdfSection(ctx, 'Revenue by Code Type (All-Time)');
        const maxRevenue = Math.max(...byType.map(t => Number(t.revenue || 0)), 1);
        byType.forEach(t => {
          const pct = (Number(t.revenue || 0) / maxRevenue) * 100;
          pdfBarRow(ctx,
            PROMO_TYPE_LABELS[t.type] || t.type,
            fmtKES(t.revenue),
            pct,
            [139, 92, 246],   // purple
          );
        });
      }

      // ── Section 4: Usage Trend sparkline ──────────────────────────────────
      if (d?.trend?.length > 1) {
        ctx.y += 4;
        pdfSection(ctx, 'Promo Code Usage Trend (12 Months)');
        pdfSparkBars(ctx, d.trend);
      }

      // ── Section 5: Top Promo Codes table ──────────────────────────────────
      const topPromos = (d?.top_by_revenue || []).filter(r => r.type !== 'customer_referral');
      if (topPromos.length > 0) {
        ctx.y += 4;
        pdfSection(ctx, 'Top Promotional Codes by All-Time Revenue');
        pdfSubheading(ctx, 'Ranked by total revenue generated since each code was created.');
        pdfTable(
          ctx,
          ['#', 'Code', 'Name', 'Type', 'Uses', 'Discount', 'Revenue'],
          topPromos.slice(0, 10).map((r, i) => [
            `${i + 1}`,
            r.code,
            r.name || '—',
            PROMO_TYPE_LABELS[r.type] || r.type,
            fmtNum(r.uses),
            fmtKES(r.discount_given),
            fmtKES(r.revenue),
          ]),
          [0.05, 0.12, 0.22, 0.18, 0.10, 0.16, 0.17],
          { rightAlign: [4, 5, 6], highlightCols: { 5: ctx.red, 6: ctx.green } },
        );
      }

      // ── Section 6: Customer Referral Programme ─────────────────────────────
      ctx.y += 6;
      pdfSection(ctx, 'Customer Referral Programme — Overview (All-Time)');
      pdfSubheading(ctx, 'Each customer can share a personal referral link. Both referrer and new customer may earn a reward.');
      pdfRow(ctx, 'Customers with Referral Codes', fmtNum(d?.referrals?.total_referral_codes));
      pdfRow(ctx, 'Total Referrals',               fmtNum(d?.referrals?.total_referrals));
      pdfRow(ctx, 'Completed Referrals',           fmtNum(d?.referrals?.completed_referrals), ctx.green);
      pdfRow(ctx, 'Pending Referrals',             fmtNum(d?.referrals?.pending_referrals),   ctx.amber);

      ctx.y += 4;
      pdfSection(ctx, 'Conversion & Rewards');
      pdfRow(ctx, 'Conversion Rate',         fmtPct(d?.referrals?.conversion_rate));
      pdfRow(ctx, 'Rewards Paid to Referrers', fmtKES(d?.referrals?.total_referrer_rewards));

      // Conversion progress bar (mirrors the visual bar on the page)
      const convPct = Math.min(d?.referrals?.conversion_rate || 0, 100);
      pdfBarRow(ctx,
        'Referral Conversion',
        fmtPct(d?.referrals?.conversion_rate),
        convPct,
        [124, 58, 237],  // purpleDk
      );

      // ── Section 7: Top Referrers table ────────────────────────────────────
      const topReferrers = (d?.top_by_revenue || []).filter(r => r.type === 'customer_referral');
      if (topReferrers.length > 0) {
        ctx.y += 4;
        pdfSection(ctx, 'Top Referrers by Revenue Generated');
        pdfSubheading(ctx, 'Customers whose referral codes drove the most order revenue.');
        pdfTable(
          ctx,
          ['#', 'Code', 'Customer', 'Referrals', 'Discount Given', 'Revenue'],
          topReferrers.slice(0, 10).map((r, i) => [
            `${i + 1}`,
            r.code,
            r.name || '—',
            fmtNum(r.uses),
            fmtKES(r.discount_given),
            fmtKES(r.revenue),
          ]),
          [0.05, 0.13, 0.32, 0.14, 0.18, 0.18],
          { rightAlign: [3, 4, 5], highlightCols: { 4: ctx.red, 5: ctx.green } },
        );
      }

      break;
    }
    default: break;
  }

  pdfFinalize(ctx, slug);
}

// ── Full report PDF (all sections) ────────────────────────────────────────
async function downloadFullPDF(allData, period) {
  const { revenue, orders, products, brands, services, funnel, projects, customers, tickets, promos } = allData;
  await downloadSectionPDF('revenue', revenue, period);
  const sections = [
    ['orders', orders], ['products', products], ['brands', brands],
    ['services', services], ['funnel', funnel], ['projects', projects],
    ['customers', customers], ['tickets', tickets], ['promos', promos],
  ];
  for (const [id, data] of sections) {
    await new Promise(r => setTimeout(r, 300));
    await downloadSectionPDF(id, data, period);
  }
}

const SECTION_TITLES = {
  revenue:   'Revenue Report',
  orders:    'Orders Report',
  products:  'Products & Inventory',
  brands:    'Brands Performance',
  services:  'Services Report',
  funnel:    'Quote Funnel',
  projects:  'Projects Report',
  customers: 'Customers Report',
  tickets:   'Support Tickets',
  promos:    'Promos & Referrals',
  system:    'System Configuration',
  extras:    'Extras & Add-ons',
};

// ── Blank 24-hour login dist (used as fallback) ────────────────────────────
const BLANK_LOGIN_DIST = Array.from({ length: 24 }, (_, h) => ({
  hour: h,
  label: `${String(h).padStart(2, '0')}:00`,
  count: 0,
}));

// ══════════════════════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════════════════════
export default function Reports() {
  const [period,    setPeriod]    = useState('30d');
  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');
  const [loading,   setLoading]   = useState(true);
  const [exporting, setExporting] = useState(null);
  const [activeTab, setActiveTab] = useState('revenue');

  const [revenue,      setRevenue]      = useState(null);
  const [orders,       setOrders]       = useState(null);
  const [products,     setProducts]     = useState(null);
  const [brands,       setBrands]       = useState(null);
  const [services,     setServices]     = useState(null);
  const [funnel,       setFunnel]       = useState(null);
  const [projects,     setProjects]     = useState(null);
  const [customers,    setCustomers]    = useState(null);
  const [tickets,      setTickets]      = useState(null);
  const [promos,       setPromos]       = useState(null);
  const [system,        setSystem]       = useState(null);
  const [extras,        setExtras]       = useState(null);

  const buildParams = useCallback(() => {
    const p = { period };
    if (period === 'custom') { p.start = startDate; p.end = endDate; }
    return p;
  }, [period, startDate, endDate]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const p = buildParams();
      const [
        revRes, ordRes, prodRes, brandRes, svcRes,
        funnelRes, projRes, custRes, tickRes, promoRes,
        sysRes, extRes
      ] = await Promise.allSettled([
        reportsAPI.getRevenue(p),
        reportsAPI.getOrders(p),
        reportsAPI.getProducts(p),
        reportsAPI.getBrands(p),
        reportsAPI.getServices(p),
        reportsAPI.getQuoteFunnel(p),
        reportsAPI.getProjects(p),
        reportsAPI.getCustomers(p),
        reportsAPI.getTickets(p),
        reportsAPI.getPromos(p),
        reportsAPI.getSystem(p),
        reportsAPI.getExtras(p),
      ]);

      const getVal = (res) => res.status === 'fulfilled' ? res.value : null;

      let rev  = getVal(revRes);
      let ord  = getVal(ordRes);
      let prod = getVal(prodRes);
      let brd  = getVal(brandRes);
      let svc  = getVal(svcRes);
      let fun  = getVal(funnelRes);
      let proj = getVal(projRes);
      let cust = getVal(custRes);
      let tick = getVal(tickRes);
      let prmo = getVal(promoRes);
      let sys  = getVal(sysRes);
      let ext  = getVal(extRes);

      // Fallbacks if new report endpoints aren't deployed yet
      if (!rev || !ord) {
        const [oStats, projStats, custStats] = await Promise.allSettled([
          ordersAPI.getOrderStatistics(),
          projectsAPI.adminGetProjectStatistics().then(r => r.data?.data || r.data),
          customersAPI.getCustomerStatistics(),
        ]);
        if (!ord && oStats.status === 'fulfilled') {
          const s = oStats.value;
          ord = {
            total_orders: s.total_orders,
            period_orders: s.total_orders, // fallback: all-time as period
            pending: s.pending, confirmed: s.confirmed,
            processing: s.processing, shipped: s.shipped,
            delivered: s.delivered, cancelled: s.cancelled,
            today: s.today, today_revenue: s.today_revenue,
            average_order_value: s.average_order_value,
          };
          rev = {
            total_revenue_kes: s.total_revenue,
            period_revenue_kes: s.total_revenue,
            avg_order_value_kes: s.average_order_value,
            paid_orders: s.delivered,
            unpaid_kes: s.unpaid_amount,
            by_currency: [], trend: [],
          };
        }
        if (!proj && projStats.status === 'fulfilled') {
          const s = projStats.value?.totals || projStats.value || {};
          proj = {
            total: s.all, active: s.active, completed: s.completed,
            on_hold: 0, cancelled: 0, overdue: s.overdue,
            completion_rate: s.all > 0 ? ((s.completed / s.all) * 100) : 0,
            trend: [],
          };
        }
        if (!cust && custStats.status === 'fulfilled') {
          const s = custStats.value;
          cust = {
            total_customers: s.total_customers,
            active_customers: s.active_customers,
            vip_customers: s.vip_customers,
            new_customers: 0,
            avg_lifetime_value: s.total_revenue / (s.total_customers || 1),
            by_tier: s.by_tier, by_type: s.by_type,
            trend: [], top_by_spend: [], top_by_orders: [],
            login_hour_dist: BLANK_LOGIN_DIST, // proper fallback
          };
        }
      }

      // Ensure login_hour_dist always has 24 entries so the heatmap renders
      if (cust && (!cust.login_hour_dist || cust.login_hour_dist.length === 0)) {
        cust = { ...cust, login_hour_dist: BLANK_LOGIN_DIST };
      }

      setRevenue(rev); setOrders(ord); setProducts(prod); setBrands(brd);
      setServices(svc); setFunnel(fun); setProjects(proj); setCustomers(cust);
      setTickets(tick); setPromos(prmo); setSystem(sys); setExtras(ext);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load some report data');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  // Re-fetch whenever period changes (preset periods).
  // For custom range, user sets dates then clicks Refresh.
  useEffect(() => {
    if (period !== 'custom') {
      fetchAll();
    }
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  // Allow Refresh button to always call current fetchAll
  const handleRefresh = useCallback(() => {
    fetchAll();
  }, [fetchAll]);

  const handleTabExport = async () => {
    setExporting(activeTab);
    try {
      const sectionData = {
        revenue, orders, products, brands, services, funnel,
        projects, customers, tickets, promos, system, extras
      }[activeTab];
      await downloadSectionPDF(activeTab, sectionData, period);
    } catch (e) {
      console.error(e);
      toast.error('PDF export failed');
    } finally {
      setExporting(null);
    }
  };

  const handleExportAll = async () => {
    setExporting('all');
    try {
      await downloadFullPDF({ revenue, orders, products, brands, services, funnel, projects, customers, tickets, promos, system, extras }, period);
    } catch (e) {
      toast.error('PDF export failed');
    } finally {
      setExporting(null);
    }
  };

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const TABS = [
    { id: 'revenue',   label: 'Revenue',    Icon: DollarSign   },
    { id: 'orders',    label: 'Orders',     Icon: ShoppingCart },
    { id: 'products',  label: 'Products',   Icon: Package      },
    { id: 'brands',    label: 'Brands',     Icon: Award        },
    { id: 'services',  label: 'Services',   Icon: Wrench       },
    { id: 'funnel',    label: 'Funnel',     Icon: Layers       },
    { id: 'projects',  label: 'Projects',   Icon: FolderOpen   },
    { id: 'customers', label: 'Customers',  Icon: Users        },
    { id: 'tickets',   label: 'Tickets',    Icon: Ticket       },
    { id: 'promos',    label: 'Promos',     Icon: Tag          },
    { id: 'system',    label: 'System',     Icon: Settings     },
    { id: 'extras',    label: 'Extras',     Icon: Layout       },
  ];

  const Skeleton = ({ h = 180 }) => (
    <div style={{ height: h, borderRadius: 12, background: 'linear-gradient(90deg,#f3f4f6 25%,#e5e7eb 50%,#f3f4f6 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
  );

  const periodLabel = PERIOD_LABEL[period] || period;

  return (
    <AdminLayout>
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .report-section { animation: fadeUp 0.3s ease; }
      `}</style>

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: `linear-gradient(135deg,${purple},${purpleDk})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(168,85,247,0.3)' }}>
              <BarChart2 size={20} color="white" />
            </div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#a855f7' }}>Reports & Analytics</h1>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>Full business intelligence — revenue, orders, products, brands, services, customers, tickets & promos.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Btn icon={exporting === activeTab ? RefreshCw : Download} onClick={handleTabExport} disabled={loading || !!exporting} small>
            {exporting === activeTab ? 'Generating…' : `Download ${SECTION_TITLES[activeTab] || 'Tab'}`}
          </Btn>
          <Btn icon={exporting === 'all' ? RefreshCw : Download} onClick={handleExportAll} disabled={loading || !!exporting} variant="ghost" small>
            {exporting === 'all' ? 'Generating…' : 'Download All'}
          </Btn>
        </div>
      </div>

      {/* ── Period bar ────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <PeriodBar period={period} setPeriod={setPeriod}
          startDate={startDate} setStartDate={setStartDate}
          endDate={endDate} setEndDate={setEndDate}
          onRefresh={handleRefresh} loading={loading} />
      </div>

      {/* ── Summary KPI strip ─────────────────────────────────────────────── */}
      {/* All values here are scoped to the selected period */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 28 }}>
        {loading ? [1,2,3,4,5,6].map(k => <Skeleton key={k} h={110} />) : <>
          <StatCard
            label={`Revenue — ${periodLabel}`}
            value={fmtKES(revenue?.period_revenue_kes)}
            sub={`${fmtNum(revenue?.paid_orders)} paid orders`}
            Icon={DollarSign} accent="#059669"
            spark={revenue?.trend}
          />
          <StatCard
            label={`Orders — ${periodLabel}`}
            value={fmtNum(orders?.period_orders ?? orders?.total_orders)}
            Icon={ShoppingCart} accent={purple}
          />
          <StatCard
            label="Total Products"
            value={fmtNum(products?.total_products)}
            sub="catalog (all-time)"
            Icon={Package} accent="#f59e0b"
          />
          <StatCard
            label="Active Brands"
            value={fmtNum(brands?.active_brands)}
            sub="catalog (all-time)"
            Icon={Award} accent="#ec4899"
          />
          <StatCard
            label={`New Customers — ${periodLabel}`}
            value={fmtNum(customers?.new_customers)}
            Icon={Users} accent="#3b82f6"
          />
          <StatCard
            label={`Open Tickets — ${periodLabel}`}
            value={fmtNum(tickets?.open)}
            Icon={Ticket} accent="#ef4444"
          />
        </>}
      </div>

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1.5px solid #f3f4f6', paddingBottom: 0, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
            padding: '9px 15px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, borderRadius: '8px 8px 0 0',
            color: activeTab === t.id ? purple : '#6b7280',
            borderBottom: activeTab === t.id ? `2.5px solid ${purple}` : '2.5px solid transparent',
            transition: 'all 0.15s',
          }}>
            <t.Icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════ REVENUE TAB ═════════════════════════════════════════ */}
      {activeTab === 'revenue' && (
        <div className="report-section">
          <SectionLabel Icon={DollarSign}>Revenue Overview</SectionLabel>
          {loading ? <Skeleton h={300} /> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
              <Panel accent>
                <div style={{ fontSize: 11, color: purple, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Total Revenue (All-Time)</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#111827' }}>{fmtKES(revenue?.total_revenue_kes)}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>across all paid orders</div>
              </Panel>
              <Panel>
                <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Avg Order Value</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#111827' }}>{fmtKES(revenue?.avg_order_value_kes)}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>per paid order · {periodLabel}</div>
              </Panel>
              <Panel accent>
                <div style={{ fontSize: 11, color: purple, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                  Revenue — {periodLabel}
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#111827' }}>
                  {fmtKES(revenue?.period_revenue_kes)}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                  {fmtNum(revenue?.paid_orders)} paid orders this period
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6, paddingTop: 6, borderTop: '1px solid #f3f4f6' }}>
                  All-time total: {fmtKES(revenue?.total_revenue_kes)}
                </div>
              </Panel>
              <Panel style={{ border: '1px solid rgba(220,38,38,0.2)', boxShadow: '0 1px 6px rgba(220,38,38,0.06)' }}>
                <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Unpaid Balance</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#dc2626' }}>{fmtKES(revenue?.unpaid_kes)}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>outstanding · {periodLabel}</div>
              </Panel>
            </div>
          )}

          {!loading && revenue?.trend?.length > 1 && (
            <Panel style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Revenue Trend (12 months)</span>
                <Pill color="#059669">KES</Pill>
              </div>
              <Sparkline data={revenue.trend} color="#059669" height={80} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                {revenue.trend.slice(0, 1).map((d, i) => <span key={i} style={{ fontSize: 10, color: '#9ca3af' }}>{d.label || ''}</span>)}
                {revenue.trend.slice(-1).map((d, i) => <span key={i} style={{ fontSize: 10, color: '#9ca3af' }}>{d.label || ''}</span>)}
              </div>
            </Panel>
          )}

          {!loading && (
            <Panel>
              <SectionLabel Icon={Activity}>Revenue by Currency (KES Equivalent) — {periodLabel}</SectionLabel>
              {revenue?.by_currency?.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
                  {revenue.by_currency.map((c, i) => (
                    <div key={i} style={{ padding: '14px 16px', borderRadius: 10, background: i === 0 ? purpleLt : '#f9fafb', border: `1px solid ${i === 0 ? purpleBd : '#f3f4f6'}` }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: i === 0 ? purple : '#111827' }}>{c.currency}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', marginTop: 2 }}>{fmtKES(c.total_kes)}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{fmtNum(c.order_count)} orders · {c.native_symbol}{Number(c.total_native || 0).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 13 }}>
                  <AlertCircle size={28} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.4 }} />
                  No paid orders in the selected period, or currency breakdown not yet available.
                </div>
              )}
            </Panel>
          )}
        </div>
      )}

      {/* ══════════════ ORDERS TAB ══════════════════════════════════════════ */}
      {activeTab === 'orders' && (
        <div className="report-section">
          <SectionLabel Icon={ShoppingCart}>Orders Breakdown — {periodLabel}</SectionLabel>
          {loading ? <Skeleton h={320} /> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Panel>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Order Status Distribution</div>
                {[
                  { label: 'Pending',    value: orders?.pending,    color: '#f59e0b' },
                  { label: 'Confirmed',  value: orders?.confirmed,  color: '#3b82f6' },
                  { label: 'Processing', value: orders?.processing, color: purple    },
                  { label: 'Shipped',    value: orders?.shipped,    color: '#06b6d4' },
                  { label: 'Delivered',  value: orders?.delivered,  color: '#059669' },
                  { label: 'Cancelled',  value: orders?.cancelled,  color: '#ef4444' },
                ].map(s => <StatusRow key={s.label} {...s} total={orders?.period_orders ?? orders?.total_orders} />)}
              </Panel>

              <Panel>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Key Metrics</div>
                <MetricRow label={`Orders (${periodLabel})`} value={fmtNum(orders?.period_orders ?? orders?.total_orders)} Icon={ShoppingCart} color={purple} />
                <MetricRow label="Total Orders (All-Time)"   value={fmtNum(orders?.total_orders)}         Icon={Hash}         color="#9ca3af"  />
                <MetricRow label="Today's Orders"            value={fmtNum(orders?.today)}                Icon={Calendar}     color="#3b82f6"  />
                <MetricRow label="Today's Revenue"           value={fmtKES(orders?.today_revenue)}        Icon={DollarSign}   color="#059669"  />
                <MetricRow label="Avg Order Value"           value={fmtKES(orders?.average_order_value)}  Icon={TrendingUp}   color={purple}   />
                <MetricRow label="Orders w/ Backorder"       value={fmtNum(orders?.orders_with_backorder)} Icon={AlertCircle} color="#f59e0b"  />
              </Panel>

              <Panel style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
                <div style={{ flexShrink: 0 }}>
                  <Donut size={120} strokeWidth={16} segments={[
                    { value: orders?.delivered  || 0, color: '#059669' },
                    { value: orders?.shipped    || 0, color: '#06b6d4' },
                    { value: orders?.processing || 0, color: purple    },
                    { value: orders?.confirmed  || 0, color: '#3b82f6' },
                    { value: orders?.pending    || 0, color: '#f59e0b' },
                    { value: orders?.cancelled  || 0, color: '#ef4444' },
                  ]} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '6px 24px' }}>
                  {[['Delivered','#059669'],['Shipped','#06b6d4'],['Processing',purple],['Confirmed','#3b82f6'],['Pending','#f59e0b'],['Cancelled','#ef4444']].map(([l, c]) => {
                    const key = l.toLowerCase();
                    return (
                      <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 3, background: c, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: '#6b7280' }}>{l}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{fmtNum(orders?.[key])}</span>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              {orders?.trend?.length > 1 && (
                <Panel style={{ gridColumn: '1/-1' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 12 }}>Order Volume Trend (12 months)</div>
                  <Sparkline data={orders.trend} color={purple} height={70} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    {orders.trend.map((d, i) => <span key={i} style={{ fontSize: 9, color: '#9ca3af' }}>{d.label?.slice(0, 3) || ''}</span>)}
                  </div>
                </Panel>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ PRODUCTS TAB ════════════════════════════════════════ */}
      {activeTab === 'products' && (
        <div className="report-section">
          <SectionLabel Icon={Package}>Products & Inventory</SectionLabel>
          {loading ? <Skeleton h={400} /> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              <Panel accent>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Inventory Overview</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {[
                    { label: 'Total',       value: products?.total_products,  color: purple    },
                    { label: 'Active',      value: products?.active_products, color: '#059669' },
                    { label: 'In Stock',    value: products?.in_stock,        color: '#059669' },
                    { label: 'Out of Stock',value: products?.out_of_stock,    color: '#ef4444' },
                    { label: 'Low Stock',   value: products?.low_stock,       color: '#f59e0b' },
                    { label: 'Featured',    value: products?.featured,        color: '#f97316' },
                  ].map(m => (
                    <div key={m.label} style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 8, background: `${m.color}08`, border: `1px solid ${m.color}20` }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: m.color }}>{fmtNum(m.value)}</div>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, fontWeight: 600 }}>{m.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: 11, color: '#059669', fontWeight: 700, marginBottom: 2 }}>In Stock Rate</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#059669' }}>
                      {products?.total_products > 0 ? fmtPct((products.in_stock / products.total_products) * 100) : '—'}
                    </div>
                  </div>
                  <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: '#fefce8', border: '1px solid #fef08a' }}>
                    <div style={{ fontSize: 11, color: '#ca8a04', fontWeight: 700, marginBottom: 2 }}>On Sale</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#ca8a04' }}>{fmtNum(products?.on_sale)}</div>
                  </div>
                </div>
              </Panel>

              <Panel>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>By Category</div>
                <HBar
                  data={products?.by_category || []}
                  labelKey="category"
                  valueKey="product_count"
                  color={['#a855f7','#8b5cf6','#7c3aed','#6d28d9','#5b21b6','#4c1d95','#3b0764','#2e1065']}
                  fmtValue={fmtNum}
                />
              </Panel>

              <Panel style={{ gridColumn: '1/-1' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>🏆 Top Products by Revenue — {periodLabel}</div>
                <RankedTable
                  rows={products?.top_by_revenue || []}
                  emptyMsg="No product revenue data for this period"
                  columns={[
                    { label: '#  Name', key: 'name', render: r => r.name },
                    { label: 'Brand', key: 'brand' },
                    { label: 'SKU', key: 'sku' },
                    { label: 'Orders', key: 'order_count', right: true, render: r => fmtNum(r.order_count) },
                    { label: 'Qty Sold', key: 'qty_sold', right: true, render: r => fmtNum(r.qty_sold) },
                    { label: 'Revenue', key: 'revenue', right: true, bold: true, render: r => fmtKES(r.revenue), color: () => '#059669' },
                  ]}
                />
              </Panel>

              <Panel style={{ gridColumn: '1/-1' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>📦 Top Products by Quantity Sold — {periodLabel}</div>
                <RankedTable
                  rows={products?.top_by_quantity || []}
                  emptyMsg="No quantity data for this period"
                  columns={[
                    { label: '#  Name', key: 'name', render: r => r.name },
                    { label: 'Brand', key: 'brand' },
                    { label: 'SKU', key: 'sku' },
                    { label: 'Qty Sold', key: 'qty_sold', right: true, bold: true, render: r => fmtNum(r.qty_sold), color: () => purple },
                    { label: 'Revenue', key: 'revenue', right: true, render: r => fmtKES(r.revenue) },
                  ]}
                />
              </Panel>

              {products?.brand_revenue?.length > 0 && (
                <Panel style={{ gridColumn: '1/-1' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>🏷️ Revenue by Brand — {periodLabel}</div>
                  <RankedTable
                    rows={products.brand_revenue}
                    columns={[
                      { label: '#  Brand', key: 'brand', render: r => r.brand },
                      { label: 'Orders', key: 'order_count', right: true, render: r => fmtNum(r.order_count) },
                      { label: 'Qty Sold', key: 'qty_sold', right: true, render: r => fmtNum(r.qty_sold) },
                      { label: 'Revenue', key: 'revenue', right: true, bold: true, render: r => fmtKES(r.revenue), color: () => '#059669' },
                    ]}
                  />
                </Panel>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ BRANDS TAB ══════════════════════════════════════════ */}
      {activeTab === 'brands' && (
        <div className="report-section">
          <SectionLabel Icon={Award}>Brands Performance</SectionLabel>
          {loading ? <Skeleton h={380} /> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              <Panel accent>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Brand Catalog</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {[
                    { label: 'Total Brands',    value: brands?.total_brands,    color: purple    },
                    { label: 'Active',          value: brands?.active_brands,   color: '#059669' },
                    { label: 'Featured',        value: brands?.featured_brands, color: '#f59e0b' },
                  ].map(m => (
                    <div key={m.label} style={{ textAlign: 'center', padding: '16px 8px', borderRadius: 10, background: `${m.color}08`, border: `1px solid ${m.color}20` }}>
                      <div style={{ fontSize: 26, fontWeight: 900, color: m.color }}>{fmtNum(m.value)}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3, fontWeight: 600 }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Products per Brand</div>
                <HBar
                  data={(brands?.by_product_count || []).map(b => ({ label: b.brand, value: b.product_count }))}
                  labelKey="label"
                  valueKey="value"
                  color={['#ec4899','#db2777','#be185d','#9d174d','#831843']}
                  fmtValue={fmtNum}
                />
              </Panel>

              <Panel style={{ gridColumn: '1/-1' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>🏆 Top Brands by Revenue — {periodLabel}</div>
                {brands?.top_by_revenue?.length > 0 ? (
                  <RankedTable
                    rows={brands.top_by_revenue}
                    columns={[
                      { label: '#  Brand', key: 'brand', render: r => r.brand },
                      { label: 'Orders', key: 'order_count', right: true, render: r => fmtNum(r.order_count) },
                      { label: 'Qty Sold', key: 'qty_sold', right: true, render: r => fmtNum(r.qty_sold) },
                      { label: 'Revenue', key: 'revenue', right: true, bold: true, render: r => fmtKES(r.revenue), color: () => '#059669' },
                    ]}
                  />
                ) : (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13 }}>
                    <AlertCircle size={28} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.4 }} />
                    No brand revenue data for this period
                  </div>
                )}
              </Panel>

              <Panel style={{ gridColumn: '1/-1' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Brand Catalog Detail</div>
                <RankedTable
                  rows={(brands?.by_product_count || []).map((b, i) => ({ ...b, rank: i + 1 }))}
                  columns={[
                    { label: '#  Brand', key: 'brand', render: r => r.brand },
                    { label: 'Status', key: 'is_active', render: r => (
                      <Pill color={r.is_active ? '#059669' : '#9ca3af'}>{r.is_active ? 'Active' : 'Inactive'}</Pill>
                    )},
                    { label: 'Featured', key: 'is_featured', render: r => r.is_featured ? <Pill color="#f59e0b">Yes</Pill> : <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span> },
                    { label: 'Products', key: 'product_count', right: true, bold: true, render: r => fmtNum(r.product_count), color: () => purple },
                    { label: 'In Stock', key: 'in_stock', right: true, render: r => fmtNum(r.in_stock), color: () => '#059669' },
                  ]}
                />
              </Panel>
            </div>
          )}
        </div>
      )}

      {/* ══════════════ SERVICES TAB ════════════════════════════════════════ */}
      {activeTab === 'services' && (
        <div className="report-section">
          <SectionLabel Icon={Wrench}>Services Overview</SectionLabel>
          {loading ? <Skeleton h={380} /> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              <Panel accent>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Service Catalog</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
                  {[
                    { label: 'Total',    value: services?.total_services,    color: purple    },
                    { label: 'Active',   value: services?.active_services,   color: '#059669' },
                    { label: 'Featured', value: services?.featured_services, color: '#f59e0b' },
                  ].map(m => (
                    <div key={m.label} style={{ textAlign: 'center', padding: '16px 8px', borderRadius: 10, background: `${m.color}08`, border: `1px solid ${m.color}20` }}>
                      <div style={{ fontSize: 26, fontWeight: 900, color: m.color }}>{fmtNum(m.value)}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3, fontWeight: 600 }}>{m.label}</div>
                    </div>
                  ))}
                </div>

                {services?.revenue_split && (() => {
                  const total = (services.revenue_split.service_revenue || 0) + (services.revenue_split.product_revenue || 0) || 1;
                  const svcPct = ((services.revenue_split.service_revenue || 0) / total) * 100;
                  return (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Revenue Split — {periodLabel}</div>
                      <div style={{ height: 12, borderRadius: 6, background: '#f3f4f6', overflow: 'hidden', marginBottom: 8 }}>
                        <div style={{ height: '100%', width: `${svcPct}%`, background: 'linear-gradient(90deg,#a855f7,#7c3aed)', borderRadius: 6, transition: 'width 0.6s' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <div><span style={{ color: purple, fontWeight: 700 }}>Services</span> {fmtKES(services.revenue_split.service_revenue)} ({fmtPct(svcPct)})</div>
                        <div><span style={{ color: '#059669', fontWeight: 700 }}>Products</span> {fmtKES(services.revenue_split.product_revenue)}</div>
                      </div>
                    </>
                  );
                })()}
              </Panel>

              <Panel>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Services by Category — {periodLabel}</div>
                {services?.by_category?.length > 0 ? (
                  <HBar
                    data={(services.by_category || []).map(c => ({ label: c.category || 'Uncategorised', value: c.order_count || c.service_count }))}
                    labelKey="label" valueKey="value"
                    color={['#8b5cf6','#7c3aed','#6d28d9','#5b21b6','#4c1d95']}
                    fmtValue={fmtNum}
                  />
                ) : (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13 }}>No service orders recorded for this period</div>
                )}
              </Panel>

              <Panel style={{ gridColumn: '1/-1' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>🏆 Top Services by Revenue — {periodLabel}</div>
                {services?.top_by_revenue?.length > 0 ? (
                  <RankedTable
                    rows={services.top_by_revenue}
                    columns={[
                      { label: '#  Service', key: 'name', render: r => r.name },
                      { label: 'Category', key: 'category' },
                      { label: 'Orders', key: 'order_count', right: true, render: r => fmtNum(r.order_count) },
                      { label: 'Qty', key: 'qty_sold', right: true, render: r => fmtNum(r.qty_sold) },
                      { label: 'Revenue', key: 'revenue', right: true, bold: true, render: r => fmtKES(r.revenue), color: () => '#059669' },
                    ]}
                  />
                ) : (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13 }}>
                    <Wrench size={28} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.3 }} />
                    No service orders recorded for this period
                  </div>
                )}
              </Panel>
            </div>
          )}
        </div>
      )}

      {/* ══════════════ FUNNEL TAB ══════════════════════════════════════════ */}
      {activeTab === 'funnel' && (
        <div className="report-section">
          <SectionLabel Icon={Layers}>Quote Request → Quote → Order Funnel</SectionLabel>
          {loading ? <Skeleton h={380} /> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Panel accent style={{ gridColumn: '1/-1' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, flexWrap: 'wrap', marginBottom: 28 }}>
                  {[
                    { label: 'Quote Requests', value: funnel?.total_requests, color: '#f59e0b', sub: '100%' },
                    { label: 'Quoted', value: funnel?.converted_to_quotes, color: purple, sub: fmtPct(funnel?.req_to_quote_rate) },
                    { label: 'Orders', value: funnel?.converted_to_orders, color: '#059669', sub: fmtPct(funnel?.quote_to_order_rate) },
                  ].map((stage, i, arr) => (
                    <div key={stage.label} style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ textAlign: 'center', padding: '20px 28px', borderRadius: 14, background: `${stage.color}12`, border: `2px solid ${stage.color}30`, minWidth: 140 }}>
                        <div style={{ fontSize: 30, fontWeight: 900, color: stage.color }}>{fmtNum(stage.value)}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginTop: 3 }}>{stage.label}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{stage.sub}</div>
                      </div>
                      {i < arr.length - 1 && <div style={{ padding: '0 10px' }}><ArrowRight size={20} color="#d1d5db" /></div>}
                    </div>
                  ))}
                </div>
                <FunnelBar label="Quote Requests" value={funnel?.total_requests} total={funnel?.total_requests} color="#f59e0b" sub="Starting pipeline" />
                <FunnelBar label="Converted to Quotes" value={funnel?.converted_to_quotes} total={funnel?.total_requests} color={purple} sub={`${fmtPct(funnel?.req_to_quote_rate)} of requests`} />
                <FunnelBar label="Converted to Orders" value={funnel?.converted_to_orders} total={funnel?.total_requests} color="#059669" sub={`${fmtPct(funnel?.end_to_end_rate)} end-to-end rate`} />
              </Panel>

              <Panel>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Quote Request Status</div>
                {[
                  { label: 'Pending',       value: funnel?.pending,                color: '#f59e0b' },
                  { label: 'Reviewing',     value: funnel?.reviewing,              color: '#3b82f6' },
                  { label: 'Quoted',        value: funnel?.quoted,                 color: purple    },
                  { label: 'Needs Clarity', value: funnel?.requires_clarification, color: '#f97316' },
                  { label: 'Rejected',      value: funnel?.rejected,               color: '#ef4444' },
                  { label: 'Expired',       value: funnel?.expired,                color: '#9ca3af' },
                ].map(s => <StatusRow key={s.label} {...s} total={funnel?.total_requests} />)}
              </Panel>

              <Panel>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Conversion Metrics</div>
                <MetricRow label="Req → Quote Rate"   value={fmtPct(funnel?.req_to_quote_rate)}   Icon={Target}     color={purple}    />
                <MetricRow label="Quote → Order Rate"  value={fmtPct(funnel?.quote_to_order_rate)} Icon={TrendingUp}  color="#059669"  />
                <MetricRow label="End-to-End Rate"     value={fmtPct(funnel?.end_to_end_rate)}     Icon={CheckCircle} color="#3b82f6"  />
                <MetricRow label="Avg Response Time"   value={`${(funnel?.avg_response_hours || 0).toFixed(1)}h`} Icon={Clock} color="#f59e0b" />
                <MetricRow label="Unassigned Requests" value={fmtNum(funnel?.unassigned)}          Icon={AlertCircle} color="#ef4444"  />
              </Panel>
            </div>
          )}
        </div>
      )}

      {/* ══════════════ PROJECTS TAB ════════════════════════════════════════ */}
      {activeTab === 'projects' && (
        <div className="report-section">
          <SectionLabel Icon={FolderOpen}>Projects Overview — {periodLabel}</SectionLabel>
          {loading ? <Skeleton h={320} /> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Panel>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Status Breakdown</div>
                {[
                  { label: 'Planning',  value: projects?.planning,  color: '#9ca3af' },
                  { label: 'Active',    value: projects?.active,    color: '#3b82f6' },
                  { label: 'On Hold',   value: projects?.on_hold,   color: '#f59e0b' },
                  { label: 'Completed', value: projects?.completed, color: '#059669' },
                  { label: 'Cancelled', value: projects?.cancelled, color: '#ef4444' },
                ].map(s => <StatusRow key={s.label} {...s} total={projects?.total} />)}
              </Panel>

              <Panel>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Health Metrics</div>
                <MetricRow label="Total Projects"     value={fmtNum(projects?.total)}             Icon={FolderOpen}  color="#3b82f6"  />
                <MetricRow label="Completion Rate"    value={fmtPct(projects?.completion_rate)}   Icon={CheckCircle} color="#059669"  />
                <MetricRow label="Overdue"            value={fmtNum(projects?.overdue)}            Icon={AlertCircle} color="#ef4444"  />
                <MetricRow label="Unassigned"         value={fmtNum(projects?.unassigned)}         Icon={XCircle}     color="#f59e0b"  />
                <MetricRow label="Overdue Milestones" value={fmtNum(projects?.overdue_milestones)} Icon={Clock}       color="#f97316"  />
              </Panel>

              {projects?.created_per_month?.length > 1 && (
                <Panel style={{ gridColumn: '1/-1' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 12 }}>Projects Created per Month</div>
                  <Sparkline data={projects.created_per_month} color="#3b82f6" height={70} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    {projects.created_per_month.map((d, i) => <span key={i} style={{ fontSize: 9, color: '#9ca3af' }}>{d.month?.slice(5) || ''}</span>)}
                  </div>
                </Panel>
              )}

              {projects?.by_priority && (
                <Panel style={{ gridColumn: '1/-1' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>By Priority</div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Urgent', color: '#ef4444' },
                      { label: 'High',   color: '#f97316' },
                      { label: 'Medium', color: '#f59e0b' },
                      { label: 'Low',    color: '#9ca3af' },
                    ].map(p => (
                      <div key={p.label} style={{ flex: '1 1 120px', padding: '14px', borderRadius: 10, background: `${p.color}10`, border: `1px solid ${p.color}25`, textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: p.color }}>{fmtNum(projects.by_priority?.[p.label.toLowerCase()])}</div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{p.label}</div>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ CUSTOMERS TAB ═══════════════════════════════════════ */}
      {activeTab === 'customers' && (
        <div className="report-section">
          <SectionLabel Icon={Users}>Customers Overview</SectionLabel>
          {loading ? <Skeleton h={400} /> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              <Panel accent>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Key Stats</div>
                <MetricRow label="Total Customers"    value={fmtNum(customers?.total_customers)}  Icon={Users}      color={purple}    />
                <MetricRow label="Active"             value={fmtNum(customers?.active_customers)} Icon={CheckCircle} color="#059669"  />
                <MetricRow
                  label={`New — ${periodLabel}`}
                  value={fmtNum(customers?.new_customers)}
                  Icon={UserPlus} color="#3b82f6"
                />
                <MetricRow label="VIP (Gold+)"        value={fmtNum(customers?.vip_customers)}    Icon={Star}        color="#f59e0b"  />
                <MetricRow label="Credit Accounts"    value={fmtNum(customers?.with_credit)}      Icon={ShieldCheck} color="#8b5cf6"  />
                <MetricRow label="Avg Lifetime Value" value={fmtKES(customers?.avg_lifetime_value)} Icon={Target}   color="#059669"  />
              </Panel>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Panel>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 14 }}>By Tier</div>
                  {customers?.by_tier && Object.entries(customers.by_tier).map(([slug, count]) => {
                    const colors = { platinum: '#8b5cf6', gold: '#f59e0b', silver: '#9ca3af', bronze: '#f97316' };
                    return <StatusRow key={slug} label={slug.charAt(0).toUpperCase() + slug.slice(1)} value={count} color={colors[slug] || '#9ca3af'} total={customers?.total_customers} />;
                  })}                 
                </Panel>

                <Panel>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 14 }}>By Type</div>
                  {customers?.by_type && Object.entries(customers.by_type).map(([slug, count]) => {
                    const colors = { individual: '#3b82f6', business: purple, wholesale: '#059669', contractor: '#f59e0b' };
                    return <StatusRow key={slug} label={slug.charAt(0).toUpperCase() + slug.slice(1)} value={count} color={colors[slug] || '#9ca3af'} total={customers?.total_customers} />;
                  })}
                </Panel>
              </div>

              {customers?.trend?.length > 1 && (
                <Panel style={{ gridColumn: '1/-1' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 12 }}>New Customers per Month</div>
                  <Sparkline data={customers.trend} color="#3b82f6" height={70} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    {customers.trend.map((d, i) => <span key={i} style={{ fontSize: 9, color: '#9ca3af' }}>{d.label?.slice(0, 3) || ''}</span>)}
                  </div>
                </Panel>
              )}

              <Panel style={{ gridColumn: '1/-1' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>💰 Top Customers by Spend — {periodLabel}</div>
                <RankedTable
                  rows={customers?.top_by_spend || []}
                  emptyMsg="No customer spend data for this period"
                  columns={[
                    { label: '#  Name', key: 'name', render: r => r.name },
                    { label: 'Type', key: 'type', render: r => <Pill color={purple}>{r.type || '—'}</Pill> },
                    { label: 'Tier', key: 'tier', render: r => {
                      const c = { platinum: '#8b5cf6', gold: '#f59e0b', silver: '#9ca3af', bronze: '#f97316' }[r.tier] || '#9ca3af';
                      return <Pill color={c}>{r.tier || '—'}</Pill>;
                    }},
                    { label: 'Orders', key: 'total_orders', right: true, render: r => fmtNum(r.total_orders) },
                    { label: 'Last Order', key: 'last_order', right: true, render: r => r.last_order ? fmtDate(r.last_order) : '—' },
                    { label: 'Total Spent', key: 'total_spent', right: true, bold: true, render: r => fmtKES(r.total_spent), color: () => '#059669' },
                  ]}
                />
              </Panel>

              <Panel style={{ gridColumn: '1/-1' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>🛒 Top Customers by Order Count — {periodLabel}</div>
                <RankedTable
                  rows={customers?.top_by_orders || []}
                  emptyMsg="No customer order data for this period"
                  columns={[
                    { label: '#  Name', key: 'name', render: r => r.name },
                    { label: 'Type', key: 'type', render: r => <Pill color={purple}>{r.type || '—'}</Pill> },
                    { label: 'Tier', key: 'tier', render: r => {
                      const c = { platinum: '#8b5cf6', gold: '#f59e0b', silver: '#9ca3af', bronze: '#f97316' }[r.tier] || '#9ca3af';
                      return <Pill color={c}>{r.tier || '—'}</Pill>;
                    }},
                    { label: 'Total Orders', key: 'total_orders', right: true, bold: true, render: r => fmtNum(r.total_orders), color: () => purple },
                    { label: 'Total Spent', key: 'total_spent', right: true, render: r => fmtKES(r.total_spent) },
                  ]}
                />
              </Panel>

              {/* Login heatmap — always renders (shows empty state if no data) */}
              <Panel style={{ gridColumn: '1/-1' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>🕐 Login Time Distribution (Hour of Day)</div>
                <LoginHeatmap data={customers?.login_hour_dist || []} />
              </Panel>
            </div>
          )}
        </div>
      )}

      {/* ══════════════ TICKETS TAB ═════════════════════════════════════════ */}
      {activeTab === 'tickets' && (
        <div className="report-section">
          <SectionLabel Icon={Ticket}>Support Tickets — {periodLabel}</SectionLabel>
          {loading ? <Skeleton h={360} /> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              <Panel accent>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Status Overview</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {[
                    { label: 'Open',        value: tickets?.open,        color: '#ef4444' },
                    { label: 'In Progress', value: tickets?.in_progress, color: '#f59e0b' },
                    { label: 'Resolved',    value: tickets?.resolved,    color: '#059669' },
                    { label: 'Closed',      value: tickets?.closed,      color: '#9ca3af' },
                    { label: 'On Hold',     value: tickets?.on_hold,     color: '#3b82f6' },
                    { label: 'Waiting',     value: tickets?.waiting_customer, color: '#8b5cf6' },
                  ].map(m => (
                    <div key={m.label} style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 8, background: `${m.color}08`, border: `1px solid ${m.color}20` }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: m.color }}>{fmtNum(m.value)}</div>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, fontWeight: 600 }}>{m.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ padding: '12px 14px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>Resolution Rate</span>
                    <span style={{ fontSize: 20, fontWeight: 900, color: '#059669' }}>{fmtPct(tickets?.resolution_rate)}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: '#dcfce7', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${tickets?.resolution_rate || 0}%`, background: '#059669', borderRadius: 4, transition: 'width 0.6s' }} />
                  </div>
                </div>
              </Panel>

              <Panel>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>SLA & Performance</div>
                <MetricRow label="Total Tickets"       value={fmtNum(tickets?.total)}                           Icon={Ticket}      color={purple}   />
                <MetricRow label="Unassigned"          value={fmtNum(tickets?.unassigned)}                      Icon={AlertCircle} color="#ef4444"  />
                <MetricRow label="This Period"         value={fmtNum(tickets?.period_total)}                    Icon={Calendar}    color="#3b82f6"  />
                <MetricRow label="Avg First Response"  value={fmtHrs(tickets?.avg_first_response_hours || 0)}   Icon={Zap}         color="#f59e0b"  />
                <MetricRow label="Avg Resolution Time" value={fmtHrs(tickets?.avg_resolution_hours || 0)}       Icon={Clock}       color="#059669"  />
                <MetricRow label="Resolved This Period" value={fmtNum(tickets?.period_resolved)}                Icon={CheckCircle} color="#059669"  />

                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>By Priority</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { label: 'Urgent', color: '#ef4444', key: 'urgent' },
                      { label: 'High',   color: '#f97316', key: 'high'   },
                      { label: 'Medium', color: '#f59e0b', key: 'medium' },
                      { label: 'Low',    color: '#9ca3af', key: 'low'    },
                    ].map(p => (
                      <div key={p.label} style={{ flex: 1, textAlign: 'center', padding: '10px 6px', borderRadius: 8, background: `${p.color}10`, border: `1px solid ${p.color}25` }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: p.color }}>{fmtNum(tickets?.by_priority?.[p.key])}</div>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1, fontWeight: 600 }}>{p.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>

              <Panel>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Status Distribution</div>
                {[
                  { label: 'Open',        value: tickets?.open,        color: '#ef4444' },
                  { label: 'In Progress', value: tickets?.in_progress, color: '#f59e0b' },
                  { label: 'Resolved',    value: tickets?.resolved,    color: '#059669' },
                  { label: 'Closed',      value: tickets?.closed,      color: '#9ca3af' },
                  { label: 'On Hold',     value: tickets?.on_hold,     color: '#3b82f6' },
                  { label: 'Waiting',     value: tickets?.waiting_customer, color: '#8b5cf6' },
                ].map(s => <StatusRow key={s.label} {...s} total={tickets?.total} />)}
              </Panel>

              <Panel>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>By Category</div>
                {tickets?.by_category?.length > 0 ? (
                  <HBar
                    data={(tickets.by_category || []).map(c => ({ label: c.category || 'Uncategorised', value: c.count }))}
                    labelKey="label" valueKey="value"
                    color={['#f59e0b','#3b82f6','#8b5cf6','#059669','#ef4444']}
                    fmtValue={fmtNum}
                  />
                ) : (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 13 }}>No category data available</div>
                )}
              </Panel>

              {tickets?.trend?.length > 1 && (
                <Panel style={{ gridColumn: '1/-1' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 12 }}>Tickets Created per Month</div>
                  <Sparkline data={tickets.trend} color="#f59e0b" height={70} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    {tickets.trend.map((d, i) => <span key={i} style={{ fontSize: 9, color: '#9ca3af' }}>{d.label?.slice(0, 3) || ''}</span>)}
                  </div>
                </Panel>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ PROMOS TAB ══════════════════════════════════════════ */}
      {activeTab === 'promos' && (
        <div className="report-section">

          {/* ── Section 1: Promotional Codes ───────────────────────────────── */}
          <SectionLabel Icon={Tag}>Promotional Codes</SectionLabel>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
            Discount codes distributed to customers — including general coupons, first-time offers, bulk order discounts, VIP rewards, birthday codes and event campaigns.
          </div>

          {loading || !promos ? <Skeleton h={400} /> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>

              {/* Promo code inventory */}
              <Panel accent>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Code Inventory (All-Time)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {[
                    { label: 'Total Codes',   value: promos.total_codes,   color: purple },
                    { label: 'Active',        value: promos.active_codes,  color: '#059669' },
                    { label: 'Expiring (7d)', value: promos.expiring_soon, color: '#f59e0b' },
                    { label: 'Expired',       value: promos.expired_codes, color: '#ef4444' },
                    { label: 'Depleted',      value: promos.depleted_codes, color: '#9ca3af' },
                    { label: 'Paused',        value: promos.paused_codes,  color: '#f97316' },
                  ].map(m => (
                    <div key={m.label} style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 8, background: `${m.color}08`, border: `1px solid ${m.color}20` }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: m.color }}>{fmtNum(m.value)}</div>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, fontWeight: 600 }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              </Panel>

              {/* Period-scoped financial impact */}
              <Panel>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 6 }}>Financial Impact — {periodLabel}</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 14 }}>
                  Usage recorded within the selected period only
                </div>
                <MetricRow
                  label="Total Revenue from Promo Orders"
                  value={fmtKES(promos.period_revenue_from_promos ?? promos.total_revenue_from_promos)}
                  sub="Order value where a code was applied"
                  Icon={DollarSign} color="#059669"
                />
                <MetricRow
                  label="Discount Given from Promos"
                  value={fmtKES(promos.period_discount_given ?? promos.total_discount_given)}
                  sub="Sum of all discounts applied"
                  Icon={TrendingDown} color="#ef4444"
                />
                <MetricRow
                  label="Code Uses"
                  value={fmtNum(promos.period_uses ?? promos.total_uses)}
                  sub="Times a promo code was redeemed"
                  Icon={Activity} color={purple}
                />
              </Panel>

              {/* Performance by type */}
              {promos.by_type?.length > 0 && (
                <Panel>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Revenue by Code Type (All-Time)</div>
                  <HBar
                    data={(promos.by_type || [])
                      .filter(t => t.type !== 'customer_referral') // referrals shown separately
                      .map(t => ({
                        label: PROMO_TYPE_LABELS[t.type] || t.type,
                        value: t.revenue,
                      }))}
                    labelKey="label" valueKey="value"
                    color={['#8b5cf6','#7c3aed','#6d28d9','#5b21b6','#4c1d95']}
                    fmtValue={fmtKES}
                  />
                </Panel>
              )}

              {/* Trend */}
              {promos.trend?.length > 1 && (
                <Panel>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 12 }}>Promo Code Usage Trend (12 Months)</div>
                  <Sparkline data={promos.trend} color={purple} height={70} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    {promos.trend.map((d, i) => <span key={i} style={{ fontSize: 9, color: '#9ca3af' }}>{d.label?.slice(0, 3) || ''}</span>)}
                  </div>
                </Panel>
              )}

              {/* Top promo codes by revenue */}
              <Panel style={{ gridColumn: '1/-1' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 4 }}>🏆 Top Promotional Codes by All-Time Revenue</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 16 }}>Ranked by total revenue generated since each code was created</div>
                <RankedTable
                  rows={(promos.top_by_revenue || []).filter(r => r.type !== 'customer_referral')}
                  emptyMsg="No promotional codes with revenue data"
                  columns={[
                    { label: '#  Code', key: 'code', render: r => <Pill color={purple}>{r.code}</Pill> },
                    { label: 'Name', key: 'name', render: r => r.name || '—' },
                    { label: 'Type', key: 'type', render: r => (
                      <span style={{ fontSize: 11, color: '#6b7280' }}>{PROMO_TYPE_LABELS[r.type] || r.type}</span>
                    )},
                    { label: 'Uses', key: 'uses', right: true, render: r => fmtNum(r.uses) },
                    { label: 'Discount', key: 'discount_given', right: true, render: r => fmtKES(r.discount_given), color: () => '#ef4444' },
                    { label: 'Revenue', key: 'revenue', right: true, bold: true, render: r => fmtKES(r.revenue), color: () => '#059669' },
                  ]}
                />
              </Panel>
            </div>
          )}

          {/* ── Section 2: Customer Referral Programme ─────────────────────── */}
          <div style={{ borderTop: '2px solid #f3f4f6', paddingTop: 28, marginTop: 4 }}>
            <SectionLabel Icon={Gift}>Customer Referral Programme</SectionLabel>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
              Each registered customer can share a personal referral link. When a new customer signs up and completes a purchase via that link, both the referrer and the new customer may earn a reward.
              <br />
              <strong style={{ color: '#374151' }}>Referral code</strong> = unique link per customer. <strong style={{ color: '#374151' }}>Referral</strong> = one person who used that link. <strong style={{ color: '#374151' }}>Completed</strong> = the referred person made a qualifying purchase.
            </div>

            {loading || !promos ? <Skeleton h={220} /> : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

                <Panel accent>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Programme Overview (All-Time)</div>
                  <MetricRow
                    label="Customers with Referral Codes"
                    value={fmtNum(promos.referrals?.total_referral_codes)}
                    sub="Customers who have an active personal referral code"
                    Icon={Tag} color={purple}
                  />
                  <MetricRow
                    label="Total Referrals"
                    value={fmtNum(promos.referrals?.total_referrals)}
                    sub="People who signed up via a referral link"
                    Icon={UserPlus} color="#3b82f6"
                  />
                  <MetricRow
                    label="Completed Referrals"
                    value={fmtNum(promos.referrals?.completed_referrals)}
                    sub="Referred customers who made a qualifying purchase"
                    Icon={CheckCircle} color="#059669"
                  />
                  <MetricRow
                    label="Pending Referrals"
                    value={fmtNum(promos.referrals?.pending_referrals)}
                    sub="Signed up but have not yet made a purchase"
                    Icon={Clock} color="#f59e0b"
                  />
                </Panel>

                <Panel>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Conversion & Rewards</div>
                  <MetricRow
                    label="Conversion Rate"
                    value={fmtPct(promos.referrals?.conversion_rate)}
                    sub="% of referrals that completed a purchase"
                    Icon={Target} color="#f59e0b"
                  />
                  <MetricRow
                    label="Rewards Paid to Referrers"
                    value={fmtKES(promos.referrals?.total_referrer_rewards)}
                    sub="Total paid to customers for successful referrals"
                    Icon={Gift} color={purple}
                  />

                  {/* Conversion progress bar */}
                  <div style={{ marginTop: 20, padding: '14px 16px', borderRadius: 10, background: purpleLt, border: `1px solid ${purpleBd}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: purple }}>Referral Conversion Rate</span>
                      <span style={{ fontSize: 18, fontWeight: 900, color: purple }}>{fmtPct(promos.referrals?.conversion_rate)}</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: purpleBd, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(promos.referrals?.conversion_rate || 0, 100)}%`, background: `linear-gradient(90deg,${purple},${purpleDk})`, borderRadius: 4, transition: 'width 0.6s' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: '#9ca3af' }}>
                      <span>{fmtNum(promos.referrals?.completed_referrals)} completed</span>
                      <span>{fmtNum(promos.referrals?.total_referrals)} total referred</span>
                    </div>
                  </div>
                </Panel>

      {/* ══════════════ SYSTEM TAB ══════════════════════════════════════════ */}
      {activeTab === 'system' && (
        <div className="report-section">
          <SectionLabel Icon={Settings}>System Configuration & Ledgers</SectionLabel>
          {loading || !system ? <Skeleton h={400} /> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Panel accent>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Loyalty Ledger Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                  <div style={{ padding: 14, borderRadius: 10, background: purpleLt }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: purple }}>{fmtNum(system.ledger.active_points)}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Current Active Points</div>
                  </div>
                  <div style={{ padding: 14, borderRadius: 10, background: '#f0fdf4' }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: '#059669' }}>{fmtNum(system.ledger.points_earned)}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Earned in Period</div>
                  </div>
                </div>
                <MetricRow label="Redemption Events" value={system.ledger.redemption_count} Icon={Gift} color={purple} />
                <MetricRow label="Points Redeemed" value={fmtNum(system.ledger.points_redeemed)} Icon={TrendingDown} color="#ef4444" />
                <MetricRow label="Expired Points" value={fmtNum(system.ledger.expiry_count)} Icon={Clock} color="#9ca3af" />
              </Panel>

              <Panel>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Shipping Methods Usage</div>
                {(system.shipping_options || []).map(opt => (
                  <StatusRow key={opt.slug} label={opt.name} value={opt.is_active ? 1 : 0} color={purple} total={1} />
                ))}
                <div style={{ marginTop: 20, fontSize: 12, color: '#9ca3af' }}>
                  Reports on defined tiers and shipping logic configurations.
                </div>
              </Panel>

              <Panel style={{ gridColumn: '1/-1' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Customer Tier Distribution</div>
                <RankedTable
                  rows={system.tiers}
                  columns={[
                    { label: 'Tier Name', key: 'name', render: r => <Pill color={r.color}>{r.name}</Pill> },
                    { label: 'Discount', key: 'discount_percentage', render: r => fmtPct(r.discount_percentage) },
                    { label: 'Min Spent', key: 'min_spent', render: r => fmtKES(r.min_spent) },
                    { label: 'Multiplier', key: 'loyalty_points_multiplier', render: r => `${r.loyalty_points_multiplier}x` },
                    { label: 'Customers', key: 'customers_count', right: true, bold: true, render: r => fmtNum(r.customers_count) }
                  ]}
                />
              </Panel>
            </div>
          )}
        </div>
      )}

      {/* ══════════════ EXTRAS TAB ══════════════════════════════════════════ */}
      {activeTab === 'extras' && (
        <div className="report-section">
          <SectionLabel Icon={Layout}>Extras: Hampers & Bookings</SectionLabel>
          {loading || !extras ? <Skeleton h={400} /> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Panel accent>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Hamper Insights — {periodLabel}</div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                   <StatCard label="Orders" value={extras.hampers.period_orders} Icon={Package} accent={purple} />
                   <StatCard label="Revenue" value={fmtKES(extras.hampers.period_revenue)} Icon={DollarSign} accent="#059669" />
                </div>
                <SectionLabel Icon={TrendingUp}>Top Hampers</SectionLabel>
                {(extras.hampers.top_hampers || []).map((h, i) => (
                  <MetricRow key={i} label={h.name} value={fmtKES(h.revenue)} sub={`${h.count} orders`} Icon={Package} color={purple} />
                ))}
              </Panel>

              <Panel>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Booking Volume — {periodLabel}</div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                   <StatCard label="Service Revenue" value={fmtKES(extras.bookings.service_revenue)} Icon={Wrench} accent="#3b82f6" />
                   <StatCard label="Placed" value={extras.bookings.period_placed} Icon={Calendar} accent={purple} />
                </div>
                <SectionLabel Icon={Activity}>Status Breakdown</SectionLabel>
                {Object.entries(extras.bookings.status_dist || {}).map(([status, count]) => (
                  <StatusRow key={status} label={status.replace('_', ' ')} value={count} total={extras.bookings.period_placed} />
                ))}
                <div style={{ marginTop: 20, padding: 12, borderRadius: 10, background: '#f9fafb', fontSize: 12, color: '#6b7280' }}>
                  Tracks upcoming service appointments and hamper subscription performance.
                </div>
              </Panel>
            </div>
          )}
        </div>
      )}

                {/* Top referral codes */}
                {promos.top_by_revenue?.filter(r => r.type === 'customer_referral').length > 0 && (
                  <Panel style={{ gridColumn: '1/-1' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 4 }}>🏆 Top Referrers by Revenue Generated</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 16 }}>Customers whose referral codes drove the most order revenue</div>
                    <RankedTable
                      rows={promos.top_by_revenue.filter(r => r.type === 'customer_referral')}
                      columns={[
                        { label: '#  Code', key: 'code', render: r => <Pill color="#3b82f6">{r.code}</Pill> },
                        { label: 'Customer / Name', key: 'name', render: r => r.name || '—' },
                        { label: 'Referrals', key: 'uses', right: true, render: r => fmtNum(r.uses) },
                        { label: 'Discount Given', key: 'discount_given', right: true, render: r => fmtKES(r.discount_given), color: () => '#ef4444' },
                        { label: 'Revenue', key: 'revenue', right: true, bold: true, render: r => fmtKES(r.revenue), color: () => '#059669' },
                      ]}
                    />
                  </Panel>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}