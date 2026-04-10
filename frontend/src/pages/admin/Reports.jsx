import { useState, useEffect, useCallback } from 'react';
import {
  BarChart2, TrendingUp, ShoppingCart, Users, FileText,
  FolderOpen, Download, RefreshCw, Calendar, ArrowUpRight,
  ArrowDownRight, Minus, ChevronRight, Clock, Target,
  DollarSign, Activity, AlertCircle, CheckCircle, XCircle,
  Layers, ArrowRight, Package, Award, Wrench, Tag,
  Ticket, Star, BarChart, PieChart, Hash, Zap,
  TrendingDown, UserPlus, ShieldCheck, Gift,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import reportsAPI from '../../api/reports';
import referralsAPI from '../../api/referrals';
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
function MetricRow({ label, value, Icon, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f9fafb' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={13} color={color} />
        </div>
        <span style={{ fontSize: 13, color: '#374151' }}>{label}</span>
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
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            style={{ border: '1.5px solid #e5e7eb', borderRadius: 7, padding: '6px 10px', fontSize: 12, color: '#374151' }} />
          <span style={{ color: '#9ca3af', fontSize: 12 }}>to</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            style={{ border: '1.5px solid #e5e7eb', borderRadius: 7, padding: '6px 10px', fontSize: 12, color: '#374151' }} />
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
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d.count), 1);
  const morning   = data.slice(6, 12);
  const afternoon = data.slice(12, 18);
  const evening   = data.slice(18, 24);
  const night     = data.slice(0, 6);
  const sessions  = [
    { label: 'Early AM (0–5)', items: night,     color: '#8b5cf6' },
    { label: 'Morning (6–11)', items: morning,   color: '#f59e0b' },
    { label: 'Afternoon (12–17)', items: afternoon, color: '#059669' },
    { label: 'Evening (18–23)', items: evening,  color: '#3b82f6' },
  ];
  return (
    <div>
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
              <div style={{ fontSize: 11, color: '#9ca3af' }}>Peak: {peak.label}</div>
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
  doc.text(`BlueArc — ${title}`, 14, 11);
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
    doc.text('BlueArc Industrial Solutions — Confidential', 14, ph - 3.5);
    doc.text(`Page ${p} of ${pages}`, pw - 14, ph - 3.5, { align: 'right' });
  }
  doc.save(filename);
}

// ── Per-section PDF downloaders ────────────────────────────────────────────
async function downloadSectionPDF(sectionId, data, period) {
  const date = new Date().toISOString().slice(0, 10);
  const slug = `BlueArc-${sectionId}-${period}-${date}.pdf`;

  const ctx = await initPDF(SECTION_TITLES[sectionId] || sectionId, period);
  const { green, red, amber } = ctx;

  switch (sectionId) {
    case 'revenue': {
      const d = data;
      pdfSection(ctx, 'Revenue Overview');
      pdfRow(ctx, 'Total Revenue (KES)',  fmtKES(d?.total_revenue_kes));
      pdfRow(ctx, 'Revenue This Period',  fmtKES(d?.period_revenue_kes));
      pdfRow(ctx, 'Average Order Value',  fmtKES(d?.avg_order_value_kes));
      pdfRow(ctx, 'Paid Orders',          fmtNum(d?.paid_orders));
      pdfRow(ctx, 'Unpaid Balance',       fmtKES(d?.unpaid_kes), red);
      if (d?.by_currency?.length) {
        ctx.y += 4; pdfSection(ctx, 'Revenue by Currency');
        d.by_currency.forEach(c => pdfRow(ctx, `${c.currency}`, fmtKES(c.total_kes)));
      }
      break;
    }
    case 'orders': {
      const d = data;
      pdfSection(ctx, 'Order Status');
      pdfRow(ctx, 'Total Orders',    fmtNum(d?.total_orders));
      pdfRow(ctx, 'Pending',         fmtNum(d?.pending), amber);
      pdfRow(ctx, 'Confirmed',       fmtNum(d?.confirmed));
      pdfRow(ctx, 'Processing',      fmtNum(d?.processing));
      pdfRow(ctx, 'Shipped',         fmtNum(d?.shipped));
      pdfRow(ctx, 'Delivered',       fmtNum(d?.delivered), green);
      pdfRow(ctx, 'Cancelled',       fmtNum(d?.cancelled), red);
      ctx.y += 4; pdfSection(ctx, 'Key Metrics');
      pdfRow(ctx, "Today's Orders",       fmtNum(d?.today));
      pdfRow(ctx, "Today's Revenue",      fmtKES(d?.today_revenue));
      pdfRow(ctx, 'Avg Order Value',      fmtKES(d?.average_order_value));
      pdfRow(ctx, 'Orders w/ Backorder',  fmtNum(d?.orders_with_backorder));
      break;
    }
    case 'products': {
      const d = data;
      pdfSection(ctx, 'Inventory Overview');
      pdfRow(ctx, 'Total Products',  fmtNum(d?.total_products));
      pdfRow(ctx, 'Active',          fmtNum(d?.active_products), green);
      pdfRow(ctx, 'In Stock',        fmtNum(d?.in_stock), green);
      pdfRow(ctx, 'Out of Stock',    fmtNum(d?.out_of_stock), red);
      pdfRow(ctx, 'Low Stock',       fmtNum(d?.low_stock), amber);
      pdfRow(ctx, 'Featured',        fmtNum(d?.featured));
      pdfRow(ctx, 'On Sale',         fmtNum(d?.on_sale));
      if (d?.top_by_revenue?.length) {
        ctx.y += 4; pdfSection(ctx, 'Top Products by Revenue');
        pdfSubheading(ctx, 'From paid order items in selected period');
        d.top_by_revenue.slice(0, 10).forEach((p, i) =>
          pdfRow(ctx, `${i+1}. ${p.name} (${p.sku || '—'})`, `${fmtKES(p.revenue)} · ${fmtNum(p.qty_sold)} units`));
      }
      if (d?.top_by_quantity?.length) {
        ctx.y += 4; pdfSection(ctx, 'Top Products by Quantity Sold');
        d.top_by_quantity.slice(0, 10).forEach((p, i) =>
          pdfRow(ctx, `${i+1}. ${p.name}`, `${fmtNum(p.qty_sold)} units · ${fmtKES(p.revenue)}`));
      }
      break;
    }
    case 'brands': {
      const d = data;
      pdfSection(ctx, 'Brand Catalog');
      pdfRow(ctx, 'Total Brands',   fmtNum(d?.total_brands));
      pdfRow(ctx, 'Active',         fmtNum(d?.active_brands), green);
      pdfRow(ctx, 'Featured',       fmtNum(d?.featured_brands));
      if (d?.top_by_revenue?.length) {
        ctx.y += 4; pdfSection(ctx, 'Top Brands by Revenue');
        pdfSubheading(ctx, 'From paid order items in selected period');
        d.top_by_revenue.slice(0, 10).forEach((b, i) =>
          pdfRow(ctx, `${i+1}. ${b.brand}`, `${fmtKES(b.revenue)} · ${fmtNum(b.qty_sold)} units`));
      }
      if (d?.by_product_count?.length) {
        ctx.y += 4; pdfSection(ctx, 'Products per Brand');
        d.by_product_count.slice(0, 10).forEach((b, i) =>
          pdfRow(ctx, `${i+1}. ${b.brand}`, `${fmtNum(b.product_count)} products`));
      }
      break;
    }
    case 'services': {
      const d = data;
      pdfSection(ctx, 'Service Catalog');
      pdfRow(ctx, 'Total Services',  fmtNum(d?.total_services));
      pdfRow(ctx, 'Active',          fmtNum(d?.active_services), green);
      pdfRow(ctx, 'Featured',        fmtNum(d?.featured_services));
      ctx.y += 4; pdfSection(ctx, 'Revenue Split (Period)');
      pdfRow(ctx, 'Service Revenue', fmtKES(d?.revenue_split?.service_revenue), green);
      pdfRow(ctx, 'Product Revenue', fmtKES(d?.revenue_split?.product_revenue));
      if (d?.by_category?.length) {
        ctx.y += 4; pdfSection(ctx, 'Services by Category (from Orders)');
        d.by_category.forEach(c =>
          pdfRow(ctx, c.category, `${fmtNum(c.order_count)} orders · ${fmtKES(c.revenue)}`));
      }
      if (d?.top_by_revenue?.length) {
        ctx.y += 4; pdfSection(ctx, 'Top Services by Revenue');
        d.top_by_revenue.slice(0, 10).forEach((s, i) =>
          pdfRow(ctx, `${i+1}. ${s.name}`, `${fmtKES(s.revenue)} · ${fmtNum(s.qty_sold)} orders`));
      }
      break;
    }
    case 'funnel': {
      const d = data;
      pdfSection(ctx, 'Quote → Order Funnel');
      pdfRow(ctx, 'Total Quote Requests',    fmtNum(d?.total_requests));
      pdfRow(ctx, 'Converted to Quotes',     fmtNum(d?.converted_to_quotes));
      pdfRow(ctx, 'Req → Quote Rate',        fmtPct(d?.req_to_quote_rate));
      pdfRow(ctx, 'Quotes → Orders',         fmtNum(d?.converted_to_orders));
      pdfRow(ctx, 'Quote → Order Rate',      fmtPct(d?.quote_to_order_rate));
      pdfRow(ctx, 'End-to-End Rate',         fmtPct(d?.end_to_end_rate));
      pdfRow(ctx, 'Avg Response Time',       `${(d?.avg_response_hours || 0).toFixed(1)} hrs`);
      pdfRow(ctx, 'Unassigned Requests',     fmtNum(d?.unassigned), red);
      ctx.y += 4; pdfSection(ctx, 'Request Status');
      pdfRow(ctx, 'Pending',            fmtNum(d?.pending), amber);
      pdfRow(ctx, 'Reviewing',          fmtNum(d?.reviewing));
      pdfRow(ctx, 'Quoted',             fmtNum(d?.quoted), green);
      pdfRow(ctx, 'Needs Clarity',      fmtNum(d?.requires_clarification));
      pdfRow(ctx, 'Rejected',           fmtNum(d?.rejected), red);
      pdfRow(ctx, 'Expired',            fmtNum(d?.expired));
      break;
    }
    case 'projects': {
      const d = data;
      pdfSection(ctx, 'Project Status');
      pdfRow(ctx, 'Total',      fmtNum(d?.total));
      pdfRow(ctx, 'Planning',   fmtNum(d?.planning));
      pdfRow(ctx, 'Active',     fmtNum(d?.active), green);
      pdfRow(ctx, 'On Hold',    fmtNum(d?.on_hold), amber);
      pdfRow(ctx, 'Completed',  fmtNum(d?.completed), green);
      pdfRow(ctx, 'Cancelled',  fmtNum(d?.cancelled), red);
      ctx.y += 4; pdfSection(ctx, 'Health Metrics');
      pdfRow(ctx, 'Completion Rate',    fmtPct(d?.completion_rate));
      pdfRow(ctx, 'Overdue',            fmtNum(d?.overdue), red);
      pdfRow(ctx, 'Unassigned',         fmtNum(d?.unassigned), amber);
      pdfRow(ctx, 'Overdue Milestones', fmtNum(d?.overdue_milestones), red);
      ctx.y += 4; pdfSection(ctx, 'By Priority');
      pdfRow(ctx, 'Urgent', fmtNum(d?.by_priority?.urgent), red);
      pdfRow(ctx, 'High',   fmtNum(d?.by_priority?.high), [249,115,22]);
      pdfRow(ctx, 'Medium', fmtNum(d?.by_priority?.medium), amber);
      pdfRow(ctx, 'Low',    fmtNum(d?.by_priority?.low));
      break;
    }
    case 'customers': {
      const d = data;
      pdfSection(ctx, 'Customer Overview');
      pdfRow(ctx, 'Total Customers',    fmtNum(d?.total_customers));
      pdfRow(ctx, 'Active',             fmtNum(d?.active_customers), green);
      pdfRow(ctx, 'New This Period',    fmtNum(d?.new_customers));
      pdfRow(ctx, 'VIP (Gold+)',        fmtNum(d?.vip_customers), amber);
      pdfRow(ctx, 'Credit Accounts',    fmtNum(d?.with_credit));
      pdfRow(ctx, 'Avg Lifetime Value', fmtKES(d?.avg_lifetime_value));
      ctx.y += 4; pdfSection(ctx, 'By Tier');
      pdfRow(ctx, 'Platinum', fmtNum(d?.by_tier?.platinum), [139,92,246]);
      pdfRow(ctx, 'Gold',     fmtNum(d?.by_tier?.gold), amber);
      pdfRow(ctx, 'Silver',   fmtNum(d?.by_tier?.silver));
      pdfRow(ctx, 'Bronze',   fmtNum(d?.by_tier?.bronze), [249,115,22]);
      ctx.y += 4; pdfSection(ctx, 'By Type');
      ['individual','business','wholesale','contractor'].forEach(t =>
        pdfRow(ctx, t.charAt(0).toUpperCase() + t.slice(1), fmtNum(d?.by_type?.[t])));
      if (d?.top_by_spend?.length) {
        ctx.y += 4; pdfSection(ctx, 'Top Customers by Lifetime Spend');
        d.top_by_spend.slice(0, 10).forEach((c, i) =>
          pdfRow(ctx, `${i+1}. ${c.name}`, `${fmtKES(c.total_spent)} · ${fmtNum(c.total_orders)} orders`));
      }
      break;
    }
    case 'tickets': {
      const d = data;
      pdfSection(ctx, 'Ticket Status');
      pdfRow(ctx, 'Total',       fmtNum(d?.total));
      pdfRow(ctx, 'Open',        fmtNum(d?.open), red);
      pdfRow(ctx, 'In Progress', fmtNum(d?.in_progress), amber);
      pdfRow(ctx, 'Resolved',    fmtNum(d?.resolved), green);
      pdfRow(ctx, 'Closed',      fmtNum(d?.closed));
      pdfRow(ctx, 'On Hold',     fmtNum(d?.on_hold));
      pdfRow(ctx, 'Unassigned',  fmtNum(d?.unassigned), red);
      ctx.y += 4; pdfSection(ctx, 'SLA Metrics');
      pdfRow(ctx, 'Resolution Rate',       fmtPct(d?.resolution_rate), green);
      pdfRow(ctx, 'Avg First Response',    fmtHrs(d?.avg_first_response_hours || 0));
      pdfRow(ctx, 'Avg Resolution Time',   fmtHrs(d?.avg_resolution_hours || 0));
      pdfRow(ctx, 'Period Total',          fmtNum(d?.period_total));
      pdfRow(ctx, 'Period Resolved',       fmtNum(d?.period_resolved), green);
      ctx.y += 4; pdfSection(ctx, 'By Priority');
      pdfRow(ctx, 'Urgent', fmtNum(d?.by_priority?.urgent), red);
      pdfRow(ctx, 'High',   fmtNum(d?.by_priority?.high), [249,115,22]);
      pdfRow(ctx, 'Medium', fmtNum(d?.by_priority?.medium), amber);
      pdfRow(ctx, 'Low',    fmtNum(d?.by_priority?.low));
      if (d?.by_category?.length) {
        ctx.y += 4; pdfSection(ctx, 'By Category');
        d.by_category.forEach(c => pdfRow(ctx, c.category, fmtNum(c.count)));
      }
      break;
    }
    case 'promos': {
      const { promos: d, referrals: ref } = data;
      pdfSection(ctx, 'Promo Code Status');
      pdfRow(ctx, 'Total Codes',          fmtNum(d?.total_codes));
      pdfRow(ctx, 'Active',               fmtNum(d?.active_codes), green);
      pdfRow(ctx, 'Expired',              fmtNum(d?.expired_codes), red);
      pdfRow(ctx, 'Depleted',             fmtNum(d?.depleted_codes));
      pdfRow(ctx, 'Paused',               fmtNum(d?.paused_codes), amber);
      pdfRow(ctx, 'Expiring Soon (7d)',   fmtNum(d?.expiring_soon), amber);
      ctx.y += 4; pdfSection(ctx, 'Financial Impact');
      pdfRow(ctx, 'Total Discount Given',   fmtKES(d?.total_discount_given), red);
      pdfRow(ctx, 'Revenue via Promos',     fmtKES(d?.total_revenue_from_promos), green);
      pdfRow(ctx, 'Total Uses',             fmtNum(d?.total_uses));
      ctx.y += 4; pdfSection(ctx, 'Referral Programme');
      pdfRow(ctx, 'Referral Codes',         fmtNum(ref?.total_referral_codes || d?.referrals?.total_referral_codes));
      pdfRow(ctx, 'Total Referrals',        fmtNum(ref?.total_referrals || d?.referrals?.total_referrals));
      pdfRow(ctx, 'Completed',              fmtNum(ref?.completed_referrals || d?.referrals?.completed_referrals), green);
      pdfRow(ctx, 'Pending',                fmtNum(ref?.pending_referrals || d?.referrals?.pending_referrals), amber);
      pdfRow(ctx, 'Conversion Rate',        fmtPct(ref?.conversion_rate || 0));
      pdfRow(ctx, 'Total Rewards Paid',     fmtKES(ref?.total_referrer_rewards || d?.referrals?.total_referrer_rewards));
      if (d?.top_by_revenue?.length) {
        ctx.y += 4; pdfSection(ctx, 'Top Promo Codes by Revenue');
        d.top_by_revenue.slice(0, 10).forEach((c, i) =>
          pdfRow(ctx, `${i+1}. ${c.code} — ${c.name || ''}`, `${fmtKES(c.revenue)} · ${fmtNum(c.uses)} uses`));
      }
      break;
    }
    default: break;
  }

  pdfFinalize(ctx, slug);
}

// ── Full report PDF (all sections) ────────────────────────────────────────
async function downloadFullPDF(allData, period) {
  const { revenue, orders, products, brands, services, funnel, projects, customers, tickets, promos, referrals } = allData;
  await downloadSectionPDF('revenue',   revenue,   period);
  // For full report, cascade downloads — stagger slightly to avoid popup blockers
  const sections = [
    ['orders', orders], ['products', products], ['brands', brands],
    ['services', services], ['funnel', funnel], ['projects', projects],
    ['customers', customers], ['tickets', tickets],
    ['promos', { promos, referrals }],
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
 // promos:    'Promos & Referrals',
};

// ══════════════════════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════════════════════
export default function Reports() {
  const [period,    setPeriod]    = useState('30d');
  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');
  const [loading,   setLoading]   = useState(true);
  const [exporting, setExporting] = useState(null); // null | 'all' | tabId
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
  const [referralStats, setReferralStats] = useState(null);

  const params = useCallback(() => {
    const p = { period };
    if (period === 'custom') { p.start = startDate; p.end = endDate; }
    return p;
  }, [period, startDate, endDate]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [
        revRes, ordRes, prodRes, brandRes, svcRes,
        funnelRes, projRes, custRes, tickRes, promoRes, refRes
      ] = await Promise.allSettled([
        reportsAPI.getRevenue(params()),
        reportsAPI.getOrders(params()),
        reportsAPI.getProducts(params()),
        reportsAPI.getBrands(params()),
        reportsAPI.getServices(params()),
        reportsAPI.getQuoteFunnel(params()),
        reportsAPI.getProjects(params()),
        reportsAPI.getCustomers(params()),
        reportsAPI.getTickets(params()),
        reportsAPI.getPromos(params()),
        referralsAPI.getStatistics(),
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
      let refStats = getVal(refRes);

      // Fallbacks for revenue/orders if new endpoints aren't live
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
            pending: s.pending, confirmed: s.confirmed,
            processing: s.processing, shipped: s.shipped,
            delivered: s.delivered, cancelled: s.cancelled,
            today: s.today, today_revenue: s.today_revenue,
          };
          rev = {
            total_revenue_kes: s.total_revenue,
            period_revenue_kes: s.today_revenue,
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
            trend: [], top_by_spend: [], top_by_orders: [], login_hour_dist: [],
          };
        }
      }

      setRevenue(rev); setOrders(ord); setProducts(prod); setBrands(brd);
      setServices(svc); setFunnel(fun); setProjects(proj); setCustomers(cust);
      setTickets(tick); setPromos(prmo); setReferralStats(refStats);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load some report data');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => { fetchAll(); }, [period]);

  const handleTabExport = async () => {
    setExporting(activeTab);
    try {
      const sectionData = {
        revenue:   revenue,
        orders:    orders,
        products:  products,
        brands:    brands,
        services:  services,
        funnel:    funnel,
        projects:  projects,
        customers: customers,
        tickets:   tickets,
        //promos:    { promos, referrals: referralStats },
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
      await downloadFullPDF({ revenue, orders, products, brands, services, funnel, projects, customers, tickets, promos, referrals: referralStats }, period);
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
    // id: 'promos',    label: 'Promos',     Icon: Tag          ,
  ];

  const Skeleton = ({ h = 180 }) => (
    <div style={{ height: h, borderRadius: 12, background: 'linear-gradient(90deg,#f3f4f6 25%,#e5e7eb 50%,#f3f4f6 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
  );

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
          onRefresh={fetchAll} loading={loading} />
      </div>

      {/* ── Summary KPI strip ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 28 }}>
        {loading ? [1,2,3,4,5,6,7].map(k => <Skeleton key={k} h={110} />) : <>
          <StatCard label="Total Revenue"    value={fmtKES(revenue?.total_revenue_kes)}       Icon={DollarSign}  accent="#059669" spark={revenue?.trend} />
          <StatCard label="Total Orders"     value={fmtNum(orders?.total_orders)}              Icon={ShoppingCart} accent={purple} />
          <StatCard label="Total Products"   value={fmtNum(products?.total_products)}          Icon={Package}     accent="#f59e0b" />
          <StatCard label="Active Brands"    value={fmtNum(brands?.active_brands)}             Icon={Award}       accent="#ec4899" />
          <StatCard label="Total Customers"  value={fmtNum(customers?.total_customers)}        Icon={Users}       accent="#3b82f6" />
          <StatCard label="Open Tickets"     value={fmtNum(tickets?.open)}                     Icon={Ticket}      accent="#ef4444" />
          
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
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{fmtNum(revenue?.paid_orders)} paid orders</div>
              </Panel>
              <Panel>
                <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Avg Order Value</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#111827' }}>{fmtKES(revenue?.avg_order_value_kes)}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>per completed order</div>
              </Panel>
              <Panel style={{ border: '1px solid rgba(220,38,38,0.2)', boxShadow: '0 1px 6px rgba(220,38,38,0.06)' }}>
                <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Unpaid Balance</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#dc2626' }}>{fmtKES(revenue?.unpaid_kes)}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>outstanding receivables</div>
              </Panel>
            </div>
          )}

          {!loading && revenue?.trend?.length > 1 && (
            <Panel style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Revenue Trend</span>
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
              <SectionLabel Icon={Activity}>Revenue by Currency (KES Equivalent)</SectionLabel>
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
                  Currency breakdown available once the Reports API is deployed.
                </div>
              )}
            </Panel>
          )}
        </div>
      )}

      {/* ══════════════ ORDERS TAB ══════════════════════════════════════════ */}
      {activeTab === 'orders' && (
        <div className="report-section">
          <SectionLabel Icon={ShoppingCart}>Orders Breakdown</SectionLabel>
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
                ].map(s => <StatusRow key={s.label} {...s} total={orders?.total_orders} />)}
              </Panel>

              <Panel>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Key Metrics</div>
                <MetricRow label="Total Orders"         value={fmtNum(orders?.total_orders)}            Icon={ShoppingCart} color={purple}    />
                <MetricRow label="Today's Orders"       value={fmtNum(orders?.today)}                   Icon={Calendar}     color="#3b82f6"  />
                <MetricRow label="Today's Revenue"      value={fmtKES(orders?.today_revenue)}            Icon={DollarSign}   color="#059669"  />
                <MetricRow label="Avg Order Value"      value={fmtKES(orders?.average_order_value)}      Icon={TrendingUp}   color={purple}   />
                <MetricRow label="Orders w/ Backorder"  value={fmtNum(orders?.orders_with_backorder)}    Icon={AlertCircle}  color="#f59e0b"  />
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

              {/* Inventory overview */}
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

              {/* Products by category */}
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

              {/* Top products by revenue */}
              <Panel style={{ gridColumn: '1/-1' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>🏆 Top Products by Revenue (Period)</div>
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

              {/* Top products by quantity */}
              <Panel style={{ gridColumn: '1/-1' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>📦 Top Products by Quantity Sold (Period)</div>
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

              {/* Revenue by brand */}
              {products?.brand_revenue?.length > 0 && (
                <Panel style={{ gridColumn: '1/-1' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>🏷️ Revenue by Brand (Period)</div>
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

              {/* Overview stats */}
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

              {/* Product count per brand */}
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

              {/* Top brands by revenue */}
              <Panel style={{ gridColumn: '1/-1' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>🏆 Top Brands by Revenue (Period)</div>
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

              {/* Brand catalog table */}
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

              {/* Overview */}
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

                {/* Revenue split */}
                {services?.revenue_split && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Revenue Split (Period)</div>
                    {(() => {
                      const total = (services.revenue_split.service_revenue || 0) + (services.revenue_split.product_revenue || 0) || 1;
                      const svcPct = ((services.revenue_split.service_revenue || 0) / total) * 100;
                      return (
                        <>
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
                  </>
                )}
              </Panel>

              {/* By category */}
              <Panel>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Services by Category (from Orders)</div>
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

              {/* Top services by revenue */}
              <Panel style={{ gridColumn: '1/-1' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>🏆 Top Services by Revenue (Period)</div>
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
          <SectionLabel Icon={FolderOpen}>Projects Overview</SectionLabel>
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

              {/* Key stats */}
              <Panel accent>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Key Stats</div>
                <MetricRow label="Total Customers"    value={fmtNum(customers?.total_customers)}  Icon={Users}      color={purple}    />
                <MetricRow label="Active"             value={fmtNum(customers?.active_customers)} Icon={CheckCircle} color="#059669"  />
                <MetricRow label="New This Period"    value={fmtNum(customers?.new_customers)}    Icon={UserPlus}    color="#3b82f6"  />
                <MetricRow label="VIP (Gold+)"        value={fmtNum(customers?.vip_customers)}    Icon={Star}        color="#f59e0b"  />
                <MetricRow label="Credit Accounts"    value={fmtNum(customers?.with_credit)}      Icon={ShieldCheck} color="#8b5cf6"  />
                <MetricRow label="Avg Lifetime Value" value={fmtKES(customers?.avg_lifetime_value)} Icon={Target}   color="#059669"  />
              </Panel>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Panel>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 14 }}>By Tier</div>
                  {[
                    { label: 'Platinum', color: '#8b5cf6' },
                    { label: 'Gold',     color: '#f59e0b' },
                    { label: 'Silver',   color: '#9ca3af' },
                    { label: 'Bronze',   color: '#f97316' },
                  ].map(t => <StatusRow key={t.label} label={t.label} value={customers?.by_tier?.[t.label.toLowerCase()]} color={t.color} total={customers?.total_customers} />)}
                </Panel>

                <Panel>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 14 }}>By Type</div>
                  {[
                    { label: 'Individual', color: '#3b82f6' },
                    { label: 'Business',   color: purple    },
                    { label: 'Wholesale',  color: '#059669' },
                    { label: 'Contractor', color: '#f59e0b' },
                  ].map(t => <StatusRow key={t.label} label={t.label} value={customers?.by_type?.[t.label.toLowerCase()]} color={t.color} total={customers?.total_customers} />)}
                </Panel>
              </div>

              {/* New customers trend */}
              {customers?.trend?.length > 1 && (
                <Panel style={{ gridColumn: '1/-1' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 12 }}>New Customers per Month</div>
                  <Sparkline data={customers.trend} color="#3b82f6" height={70} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    {customers.trend.map((d, i) => <span key={i} style={{ fontSize: 9, color: '#9ca3af' }}>{d.label?.slice(0, 3) || ''}</span>)}
                  </div>
                </Panel>
              )}

              {/* Top customers by spend */}
              <Panel style={{ gridColumn: '1/-1' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>💰 Top Customers by Lifetime Spend</div>
                <RankedTable
                  rows={customers?.top_by_spend || []}
                  emptyMsg="No customer spend data available"
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

              {/* Top customers by order count */}
              <Panel style={{ gridColumn: '1/-1' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>🛒 Top Customers by Order Count</div>
                <RankedTable
                  rows={customers?.top_by_orders || []}
                  emptyMsg="No customer order data available"
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

              {/* Login hour heatmap */}
              {customers?.login_hour_dist?.length > 0 && (
                <Panel style={{ gridColumn: '1/-1' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>🕐 Login Time Distribution (by Hour of Day)</div>
                  <LoginHeatmap data={customers.login_hour_dist} />
                </Panel>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ TICKETS TAB ═════════════════════════════════════════ */}
      {activeTab === 'tickets' && (
        <div className="report-section">
          <SectionLabel Icon={Ticket}>Support Tickets</SectionLabel>
          {loading ? <Skeleton h={360} /> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              {/* Status overview */}
              <Panel accent>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Status Overview</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {[
                    { label: 'Total',       value: tickets?.total,       color: purple    },
                    { label: 'Open',        value: tickets?.open,        color: '#ef4444' },
                    { label: 'In Progress', value: tickets?.in_progress, color: '#f59e0b' },
                    { label: 'Resolved',    value: tickets?.resolved,    color: '#059669' },
                    { label: 'Closed',      value: tickets?.closed,      color: '#9ca3af' },
                    { label: 'On Hold',     value: tickets?.on_hold,     color: '#3b82f6' },
                  ].map(m => (
                    <div key={m.label} style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 8, background: `${m.color}08`, border: `1px solid ${m.color}20` }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: m.color }}>{fmtNum(m.value)}</div>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, fontWeight: 600 }}>{m.label}</div>
                    </div>
                  ))}
                </div>

                {/* Resolution rate */}
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

              {/* SLA Metrics */}
              <Panel>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>SLA & Performance</div>
                <MetricRow label="Total Tickets"       value={fmtNum(tickets?.total)}                           Icon={Ticket}      color={purple}   />
                <MetricRow label="Unassigned"          value={fmtNum(tickets?.unassigned)}                      Icon={AlertCircle} color="#ef4444"  />
                <MetricRow label="This Period"         value={fmtNum(tickets?.period_total)}                    Icon={Calendar}    color="#3b82f6"  />
                <MetricRow label="Avg First Response"  value={fmtHrs(tickets?.avg_first_response_hours || 0)}   Icon={Zap}         color="#f59e0b"  />
                <MetricRow label="Avg Resolution Time" value={fmtHrs(tickets?.avg_resolution_hours || 0)}       Icon={Clock}       color="#059669"  />
                <MetricRow label="Resolved This Period" value={fmtNum(tickets?.period_resolved)}                Icon={CheckCircle} color="#059669"  />

                {/* Priority breakdown */}
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

              {/* Status distribution bar */}
              <Panel>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 16 }}>Status Distribution</div>
                {[
                  { label: 'Open',        value: tickets?.open,        color: '#ef4444' },
                  { label: 'In Progress', value: tickets?.in_progress, color: '#f59e0b' },
                  { label: 'Resolved',    value: tickets?.resolved,    color: '#059669' },
                  { label: 'Closed',      value: tickets?.closed,      color: '#9ca3af' },
                  { label: 'On Hold',     value: tickets?.on_hold,     color: '#3b82f6' },
                ].map(s => <StatusRow key={s.label} {...s} total={tickets?.total} />)}
              </Panel>

              {/* By category */}
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

              {/* Trend */}
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

    </AdminLayout>
  );
}