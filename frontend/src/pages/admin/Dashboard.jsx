import { useState, useEffect, useCallback } from 'react';
import {
  BarChart2, ShoppingCart, Users, FileText, FolderOpen, Ticket,
  Star, Zap, Clock, DollarSign, Layers, Package, Award, Wrench,
  ChevronRight, Bell, CheckCircle, ArrowUpRight, ArrowDownRight, Minus,
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

const COLORS = {
  green: '#059669',
  red: '#ef4444',
  orange: '#f59e0b',
  blue: '#3b82f6',
  cyan: '#06b6d4',
  pink: '#ec4899',
  amber: '#f97316',
  yellow: '#eab308',
};

// ── Helpers ────────────────────────────────────────────────────────────────
const fmtKES  = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtNum  = (n) => Number(n || 0).toLocaleString();
const fmtPct  = (n) => `${Number(n || 0).toFixed(1)}%`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) : '—';
const fmtHrs  = (h) => h >= 24 ? `${(h / 24).toFixed(1)}d` : `${Math.round(h)}h`;

// ── Atoms ──────────────────────────────────────────────────────────────────
const Panel = ({ children, style = {}, accent = false, className = '' }) => (
  <div
    className={`bg-white rounded-2xl border p-6 ${className}`}
    style={{
      borderColor: accent ? '#a855f7' : 'rgba(168,85,247,0.35)',
      boxShadow: accent
        ? '0 0 20px 4px rgba(168,85,247,0.35), 0 0 6px 2px rgba(168,85,247,0.2)'
        : '0 0 12px 2px rgba(168,85,247,0.15)',
      ...style,
    }}
  >
    {children}
  </div>
);

const Pill = ({ children, color = purple, bg, className = '' }) => (
  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${className}`}
    style={{ background: bg || `${color}18`, color }}>
    {children}
  </span>
);

const TrendBadge = ({ value, className = '' }) => {
  if (value == null) return null;
  const up = value > 0;
  const flat = value === 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const colorClass = flat ? 'text-gray-500 bg-gray-100' : up ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50';
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${colorClass} ${className}`}>
      <Icon size={12} />{Math.abs(value).toFixed(1)}%
    </span>
  );
};

// ── Mini sparkline ─────────────────────────────────────────────────────────
function Sparkline({ data = [], color = purple, height = 40 }) {
  if (!data || data.length < 2) return <div style={{ height }} className="bg-gray-50 rounded-lg" />;
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
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" preserveAspectRatio="none">
      <polygon points={`0,${height} ${pts} ${w},${height}`} fill={`${color}15`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Donut chart ────────────────────────────────────────────────────────────
function Donut({ segments = [], size = 80, strokeWidth = 10 }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + (x.value || 0), 0) || 1;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={strokeWidth} />
      {segments.map((seg, i) => {
        const dash = (seg.value / total) * circ;
        const gap = circ - dash;
        const el = (
          <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={seg.color} strokeWidth={strokeWidth}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

// ── KPI Card ───────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, Icon, color = purple, trend, spark, onClick }) {
  return (
    <Panel
      className={`transition-all duration-300 hover:scale-[1.02] ${onClick ? 'cursor-pointer' : ''}`}
      style={{
        borderColor: `${color}60`,
        boxShadow: `0 0 16px 3px ${color}25, 0 0 6px 2px ${color}15`,
      }}
      onClick={onClick}
    >
      <div className="flex justify-between items-start mb-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{
            background: `${color}15`,
            boxShadow: `0 0 12px 3px ${color}30`,
          }}
        >
          <Icon size={22} style={{ color }} />
        </div>
        {trend != null && <TrendBadge value={trend} />}
      </div>
      <div>
        <div className="text-2xl font-bold" style={{ color }}>{value}</div>
        <div className="text-sm mt-1" style={{ color: `${color}90` }}>{label}</div>
        {sub && <div className="text-xs mt-1" style={{ color: `${color}60` }}>{sub}</div>}
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-4"><Sparkline data={spark} color={color} height={36} /></div>
      )}
    </Panel>
  );
}

// ── Section Card ───────────────────────────────────────────────────────────
function SectionCard({ title, Icon, color, children, action, alert, className = '' }) {
  return (
    <Panel
      className={className}
      style={{
        borderColor: alert ? `${COLORS.red}80` : `${color}60`,
        boxShadow: alert
          ? `0 0 24px 5px ${COLORS.red}30, 0 0 8px 3px ${COLORS.red}20`
          : `0 0 24px 5px ${color}25, 0 0 8px 3px ${color}15`,
      }}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{
              background: `${color}20`,
              boxShadow: `0 0 14px 4px ${color}35`,
            }}
          >
            <Icon size={18} style={{ color, filter: `drop-shadow(0 0 4px ${color})` }} />
          </div>
          <h3
            className="font-bold text-lg"
            style={{
              color,
              textShadow: `0 0 14px ${color}60`,
            }}
          >
            {title}
          </h3>
          {alert && (
            <span
              className="w-2.5 h-2.5 rounded-full animate-pulse"
              style={{
                background: COLORS.red,
                boxShadow: `0 0 8px 3px ${COLORS.red}80`,
              }}
            />
          )}
        </div>
        {action}
      </div>
      {children}
    </Panel>
  );
}

// ── Mini Bar ───────────────────────────────────────────────────────────────
function MiniBar({ value, max, color = purple, label, sub }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1.5">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold text-gray-900">{sub || fmtNum(value)}</span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ── Status Dot ─────────────────────────────────────────────────────────────
const StatusDot = ({ color }) => (
  <span className="w-3 h-3 rounded-full inline-block" style={{ background: color }} />
);

// ══════════════════════════════════════════════════════════════════════════════
// Main Dashboard Component
// ══════════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const [period, setPeriod] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({});

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    console.log("Fetching data for period:", period);
    try {
      const params = { period };
      const [
        revRes, ordRes, prodRes, brandRes, svcRes,
        funnelRes, projRes, custRes, tickRes, promoRes, refRes
      ] = await Promise.allSettled([
        reportsAPI.getRevenue(params),
        reportsAPI.getOrders(params),
        reportsAPI.getProducts(params),
        reportsAPI.getBrands(params),
        reportsAPI.getServices(params),
        reportsAPI.getQuoteFunnel(params),
        reportsAPI.getProjects(params),
        reportsAPI.getCustomers(params),
        reportsAPI.getTickets(params),
        reportsAPI.getPromos(params),
        referralsAPI.getStatistics(),
      ]);

      const getVal = (res) => res.status === 'fulfilled' ? res.value : null;

      setData({
        revenue: getVal(revRes),
        orders: getVal(ordRes),
        products: getVal(prodRes),
        brands: getVal(brandRes),
        services: getVal(svcRes),
        funnel: getVal(funnelRes),
        projects: getVal(projRes),
        customers: getVal(custRes),
        tickets: getVal(tickRes),
        promos: getVal(promoRes),
        referrals: getVal(refRes),
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchDashboard(); }, [period]);

  const { revenue, orders, products, brands, services, funnel, projects, customers, tickets, promos, referrals } = data;

  // Calculate key metrics
  const totalRevenue = revenue?.total_revenue_kes || 0;
  const periodRevenue = revenue?.period_revenue_kes || 0;
  const totalOrders = orders?.total_orders || 0;
  const totalCustomers = customers?.total_customers || 0;
  const openTickets = tickets?.open || 0;
  const activeProjects = projects?.active || 0;
  const pendingOrders = orders?.pending || 0;
  const unassignedTickets = tickets?.unassigned || 0;

  // Quick period selector
  const periods = [
    { id: '7d', label: '7D' },
    { id: '30d', label: '30D' },
    { id: '90d', label: '90D' },
    { id: '12m', label: '12M' },
  ];

  return (
    <AdminLayout>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-200">
              <BarChart2 size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">Business overview & key metrics</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Period selector */}
          <div className="flex bg-gray-100 rounded-xl p-1.5">
            {periods.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  period === p.id 
                    ? 'bg-white text-purple-600 shadow-md' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          
          <button 
            onClick={fetchDashboard}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-purple-300 transition-all duration-200"
          >
            <Clock size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Primary KPIs ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 mb-8">
        {loading ? (
          Array(6).fill(0).map((_, i) => (
            <div key={i} className="h-36 bg-gray-100 rounded-2xl animate-pulse" />
          ))
        ) : (
          <>
            <KPICard 
              label="Total Revenue" 
              value={fmtKES(totalRevenue)} 
              sub={`${fmtNum(revenue?.paid_orders)} paid orders`}
              Icon={DollarSign} 
              color={COLORS.green}
              spark={revenue?.trend}
            />
            <KPICard
              label={`Revenue (${period.toUpperCase()})`}      // ← was "Total Revenue" (static)
              value={fmtKES(periodRevenue)}                    // ← was fmtKES(totalRevenue)
              sub={`All-time: ${fmtKES(totalRevenue)}`}        // ← new: show all-time as subtitle
              Icon={DollarSign}
              color={COLORS.green}
              spark={revenue?.trend}
            />
            <KPICard 
              label="Total Orders" 
              value={fmtNum(totalOrders)} 
              sub={`${fmtNum(orders?.delivered)} delivered`}
              Icon={ShoppingCart} 
              color={purple}
            />
            <KPICard 
              label="Customers" 
              value={fmtNum(totalCustomers)} 
              sub={`${fmtNum(customers?.new_customers)} new this period`}
              Icon={Users} 
              color={COLORS.blue}
            />
            <KPICard 
              label="Open Tickets" 
              value={fmtNum(openTickets)} 
              sub={unassignedTickets > 0 ? `${unassignedTickets} unassigned` : 'All assigned'}
              Icon={Ticket} 
              color={openTickets > 0 ? COLORS.red : COLORS.green}
              alert={openTickets > 5}
            />
            <KPICard 
              label="Active Projects" 
              value={fmtNum(activeProjects)} 
              sub={`${fmtNum(projects?.overdue)} overdue`}
              Icon={FolderOpen} 
              color={COLORS.orange}
            />
            <KPICard 
              label="Pending Orders" 
              value={fmtNum(pendingOrders)} 
              sub={`${fmtKES(orders?.today_revenue)} today`}
              Icon={Package} 
              color={COLORS.cyan}
            />
          </>
        )}
      </div>

      {/* ── Main Content Grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ── Left Column (8/12) ──────────────────────────────────────────── */}
        <div className="lg:col-span-8 space-y-6">

          {/* Revenue & Orders Overview - Side by Side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Revenue Card */}
            <SectionCard title="Revenue" Icon={DollarSign} color={COLORS.green}>
              {loading ? (
                <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
              ) : (
                <div className="flex flex-col gap-5">
                  <div className="flex items-end gap-4">
                    <span
                      className="text-4xl font-bold"
                      style={{ color: COLORS.green, textShadow: `0 0 20px ${COLORS.green}60` }}
                    >
                      {fmtKES(periodRevenue)}
                    </span>
                    <TrendBadge value={revenue?.growth_rate} />
                  </div>
                  <div className="space-y-3">
                    <MiniBar
                      label="Paid Orders"
                      value={revenue?.paid_orders}
                      max={orders?.total_orders}
                      color={COLORS.green}
                      sub={`${fmtNum(revenue?.paid_orders)} of ${fmtNum(orders?.total_orders)}`}
                    />
                    <MiniBar
                      label="Unpaid Balance"
                      value={revenue?.unpaid_kes}
                      max={totalRevenue}
                      color={COLORS.red}
                      sub={fmtKES(revenue?.unpaid_kes)}
                    />
                  </div>
                  {revenue?.trend && revenue.trend.length > 1 && (
                    <div className="pt-4 border-t" style={{ borderColor: `${COLORS.green}20` }}>
                      <Sparkline data={revenue.trend} color={COLORS.green} height={60} />
                    </div>
                  )}
                </div>
              )}
            </SectionCard>

            {/* Orders Card */}
            <SectionCard title="Orders" Icon={ShoppingCart} color={purple}>
              {loading ? (
                <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
              ) : (
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-around">
                    {[
                      { label: 'Today', value: orders?.today, color: purple },
                      { label: 'Delivered', value: orders?.delivered, color: COLORS.green },
                      { label: 'Pending', value: orders?.pending, color: COLORS.orange },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="text-center px-4">
                        <div
                          className="text-3xl font-bold"
                          style={{ color, textShadow: `0 0 14px ${color}50` }}
                        >
                          {fmtNum(value)}
                        </div>
                        <div className="text-sm mt-1" style={{ color: `${color}90` }}>{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-6 pt-2">
                    <Donut size={80} segments={[
                      { value: orders?.delivered || 0, color: COLORS.green },
                      { value: orders?.shipped || 0, color: COLORS.cyan },
                      { value: orders?.processing || 0, color: purple },
                      { value: orders?.pending || 0, color: COLORS.orange },
                      { value: orders?.cancelled || 0, color: COLORS.red },
                    ]} />
                    <div className="flex-1 space-y-2 text-sm">
                      {[
                        { label: 'Delivered', color: COLORS.green },
                        { label: 'Shipped', color: COLORS.cyan },
                        { label: 'Processing', color: purple },
                        { label: 'Pending', color: COLORS.orange },
                      ].map(({ label, color }) => (
                        <div key={label} className="flex items-center gap-2.5">
                          <StatusDot color={color} />
                          <span style={{ color: `${color}cc` }}>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>
          </div>

          {/* Quote Funnel */}
          <SectionCard title="Quote Funnel" Icon={Layers} color={COLORS.pink}>
            {loading ? (
              <div className="h-28 bg-gray-100 rounded-xl animate-pulse" />
            ) : (
              <div className="flex items-center gap-4 overflow-x-auto pb-3">
                {[
                  { label: 'Requests', value: funnel?.total_requests, color: COLORS.orange, rate: '100%' },
                  { label: 'Quoted', value: funnel?.converted_to_quotes, color: purple, rate: fmtPct(funnel?.req_to_quote_rate) },
                  { label: 'Orders', value: funnel?.converted_to_orders, color: COLORS.green, rate: fmtPct(funnel?.quote_to_order_rate) },
                ].map((stage, i, arr) => (
                  <div key={stage.label} className="flex items-center flex-shrink-0">
                    <div
                      className="text-center px-6 py-5 rounded-xl min-w-[130px]"
                      style={{
                        background: `${stage.color}12`,
                        border: `2px solid ${stage.color}40`,
                        boxShadow: `0 0 16px 3px ${stage.color}20`,
                      }}
                    >
                      <div
                        className="text-3xl font-bold"
                        style={{ color: stage.color, textShadow: `0 0 12px ${stage.color}60` }}
                      >
                        {fmtNum(stage.value)}
                      </div>
                      <div className="text-sm font-semibold mt-1.5" style={{ color: `${stage.color}cc` }}>{stage.label}</div>
                      <div className="text-xs mt-1" style={{ color: `${stage.color}80` }}>{stage.rate}</div>
                    </div>
                    {i < arr.length - 1 && (
                      <ChevronRight size={24} className="mx-3 flex-shrink-0" style={{ color: `${COLORS.pink}50` }} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Products & Brands - Side by Side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            <SectionCard title="Products" Icon={Package} color={COLORS.amber}>
              {loading ? (
                <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
              ) : (
                <div className="flex flex-col gap-5">
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Total', value: products?.total_products, color: COLORS.amber },
                      { label: 'In Stock', value: products?.in_stock, color: COLORS.green },
                      { label: 'Out', value: products?.out_of_stock, color: COLORS.red },
                    ].map(({ label, value, color }) => (
                      <div
                        key={label}
                        className="text-center p-4 rounded-xl"
                        style={{ background: `${color}10`, border: `1px solid ${color}25` }}
                      >
                        <div
                          className="text-xl font-bold"
                          style={{ color, textShadow: `0 0 10px ${color}50` }}
                        >
                          {fmtNum(value)}
                        </div>
                        <div className="text-sm mt-1" style={{ color: `${color}90` }}>{label}</div>
                      </div>
                    ))}
                  </div>
                  {products?.top_by_revenue?.[0] && (
                    <div
                      className="flex items-center gap-4 p-4 rounded-xl"
                      style={{
                        background: `${COLORS.amber}10`,
                        border: `1px solid ${COLORS.amber}30`,
                        boxShadow: `0 0 12px 2px ${COLORS.amber}15`,
                      }}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${COLORS.amber}20`, boxShadow: `0 0 10px 3px ${COLORS.amber}30` }}
                      >
                        <Star size={18} style={{ color: COLORS.amber, filter: `drop-shadow(0 0 4px ${COLORS.amber})` }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: COLORS.amber }}>{products.top_by_revenue[0].name}</div>
                        <div className="text-xs" style={{ color: `${COLORS.amber}70` }}>Top product by revenue</div>
                      </div>
                      <div
                        className="text-lg font-bold flex-shrink-0"
                        style={{ color: COLORS.green, textShadow: `0 0 10px ${COLORS.green}50` }}
                      >
                        {fmtKES(products.top_by_revenue[0].revenue)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Brands" Icon={Award} color={COLORS.pink}>
              {loading ? (
                <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
              ) : (
                <div className="flex flex-col gap-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div
                        className="text-3xl font-bold"
                        style={{ color: COLORS.pink, textShadow: `0 0 14px ${COLORS.pink}50` }}
                      >
                        {fmtNum(brands?.active_brands)}
                      </div>
                      <div className="text-sm mt-1" style={{ color: `${COLORS.pink}80` }}>Active brands</div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-gray-400">{fmtNum(brands?.total_brands)}</div>
                      <div className="text-sm mt-1 text-gray-400">Total</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {brands?.top_by_revenue?.slice(0, 3).map((b, i) => (
                      <div
                        key={b.brand}
                        className="flex items-center justify-between py-3 px-4 rounded-xl"
                        style={{ background: `${COLORS.pink}08`, borderBottom: `1px solid ${COLORS.pink}15` }}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="w-6 h-6 rounded-lg flex items-center justify-center text-sm font-bold"
                            style={{ background: `${COLORS.pink}20`, color: COLORS.pink }}
                          >
                            {i + 1}
                          </span>
                          <span className="text-sm font-medium" style={{ color: `${COLORS.pink}cc` }}>{b.brand}</span>
                        </div>
                        <span
                          className="text-sm font-bold"
                          style={{ color: COLORS.green, textShadow: `0 0 8px ${COLORS.green}40` }}
                        >
                          {fmtKES(b.revenue)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </SectionCard>
          </div>
        </div>

        {/* ── Right Column (4/12) ─────────────────────────────────────────── */}
        <div className="lg:col-span-4 space-y-6">

          {/* Alerts Panel */}
          <SectionCard
            title="Alerts"
            Icon={Bell}
            color={COLORS.red}
            alert={unassignedTickets > 0 || projects?.overdue > 0 || products?.low_stock > 0}
          >
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {[
                  { show: unassignedTickets > 0, Icon: Ticket, color: COLORS.red, title: `${unassignedTickets} unassigned tickets`, sub: 'Need immediate attention' },
                  { show: projects?.overdue > 0, Icon: Clock, color: COLORS.orange, title: `${projects?.overdue} overdue projects`, sub: 'Past deadline' },
                  { show: products?.low_stock > 0, Icon: Package, color: COLORS.amber, title: `${products?.low_stock} low stock items`, sub: 'Consider restocking' },
                  { show: pendingOrders > 0, Icon: ShoppingCart, color: COLORS.blue, title: `${pendingOrders} pending orders`, sub: 'Awaiting confirmation' },
                ].filter(a => a.show).map(({ Icon: AIcon, color, title, sub }) => (
                  <div
                    key={title}
                    className="flex items-center gap-4 p-4 rounded-xl"
                    style={{
                      background: `${color}10`,
                      border: `1px solid ${color}30`,
                      boxShadow: `0 0 12px 2px ${color}15`,
                    }}
                  >
                    <AIcon size={18} style={{ color, filter: `drop-shadow(0 0 4px ${color})` }} />
                    <div className="flex-1">
                      <div className="text-sm font-medium" style={{ color }}>{title}</div>
                      <div className="text-xs mt-0.5" style={{ color: `${color}70` }}>{sub}</div>
                    </div>
                  </div>
                ))}
                {unassignedTickets === 0 && projects?.overdue === 0 && products?.low_stock === 0 && pendingOrders === 0 && (
                  <div
                    className="flex items-center gap-4 p-4 rounded-xl"
                    style={{
                      background: `${COLORS.green}10`,
                      border: `1px solid ${COLORS.green}30`,
                      boxShadow: `0 0 12px 2px ${COLORS.green}20`,
                    }}
                  >
                    <CheckCircle size={18} style={{ color: COLORS.green, filter: `drop-shadow(0 0 4px ${COLORS.green})` }} />
                    <div className="flex-1">
                      <div className="text-sm font-medium" style={{ color: COLORS.green }}>All caught up!</div>
                      <div className="text-xs mt-0.5" style={{ color: `${COLORS.green}70` }}>No urgent alerts</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          {/* Tickets Summary */}
          <SectionCard title="Support Tickets" Icon={Ticket} color={COLORS.red} alert={openTickets > 5}>
            {loading ? (
              <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
            ) : (
              <div className="flex flex-col gap-5">
                <div className="flex items-center gap-6">
                  {[
                    { label: 'Open', value: openTickets, color: COLORS.red },
                    { label: 'In Progress', value: tickets?.in_progress, color: COLORS.orange },
                    { label: 'Resolved', value: tickets?.resolved, color: COLORS.green },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="text-center flex-1">
                      <div
                        className="text-3xl font-bold"
                        style={{ color, textShadow: `0 0 14px ${color}50` }}
                      >
                        {fmtNum(value)}
                      </div>
                      <div className="text-sm mt-1" style={{ color: `${color}80` }}>{label}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span style={{ color: `${COLORS.red}90` }}>Resolution Rate</span>
                    <span className="font-bold" style={{ color: COLORS.green, textShadow: `0 0 8px ${COLORS.green}50` }}>
                      {fmtPct(tickets?.resolution_rate)}
                    </span>
                  </div>
                  <div className="h-3 rounded-full overflow-hidden" style={{ background: `${COLORS.red}15` }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${tickets?.resolution_rate || 0}%`,
                        background: COLORS.green,
                        boxShadow: `0 0 10px 3px ${COLORS.green}50`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs mt-2">
                    <span style={{ color: `${COLORS.red}70` }}>Avg Response: {fmtHrs(tickets?.avg_first_response_hours || 0)}</span>
                    <span style={{ color: `${COLORS.orange}90` }}>Avg Resolution: {fmtHrs(tickets?.avg_resolution_hours || 0)}</span>
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Projects Summary */}
          <SectionCard title="Projects" Icon={FolderOpen} color={COLORS.blue}>
            {loading ? (
              <div className="h-36 bg-gray-100 rounded-xl animate-pulse" />
            ) : (
              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div
                      className="text-3xl font-bold"
                      style={{ color: COLORS.blue, textShadow: `0 0 14px ${COLORS.blue}50` }}
                    >
                      {fmtNum(projects?.total)}
                    </div>
                    <div className="text-sm mt-1" style={{ color: `${COLORS.blue}80` }}>Total projects</div>
                  </div>
                  <div className="text-right">
                    <div
                      className="text-3xl font-bold"
                      style={{ color: COLORS.green, textShadow: `0 0 14px ${COLORS.green}50` }}
                    >
                      {fmtPct(projects?.completion_rate)}
                    </div>
                    <div className="text-sm mt-1" style={{ color: `${COLORS.green}80` }}>Completion</div>
                  </div>
                </div>
                <div className="space-y-3">
                  <MiniBar label="Active" value={projects?.active} max={projects?.total} color={COLORS.blue} />
                  <MiniBar label="Completed" value={projects?.completed} max={projects?.total} color={COLORS.green} />
                  <MiniBar label="On Hold" value={projects?.on_hold} max={projects?.total} color={COLORS.orange} />
                </div>
              </div>
            )}
          </SectionCard>

          {/* Customers Summary */}
          <SectionCard title="Customers" Icon={Users} color={COLORS.cyan}>
            {loading ? (
              <div className="h-36 bg-gray-100 rounded-xl animate-pulse" />
            ) : (
              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div
                      className="text-3xl font-bold"
                      style={{ color: COLORS.cyan, textShadow: `0 0 14px ${COLORS.cyan}50` }}
                    >
                      {fmtNum(totalCustomers)}
                    </div>
                    <div className="text-sm mt-1" style={{ color: `${COLORS.cyan}80` }}>Total customers</div>
                  </div>
                  <div className="text-right">
                    <div
                      className="text-3xl font-bold"
                      style={{ color: purple, textShadow: `0 0 14px ${purple}50` }}
                    >
                      {fmtKES(customers?.avg_lifetime_value)}
                    </div>
                    <div className="text-sm mt-1" style={{ color: `${purple}80` }}>Avg LTV</div>
                  </div>
                </div>
                <div className="flex gap-3 flex-wrap">
                  {customers?.by_tier?.platinum > 0 && (
                    <Pill color="#8b5cf6">{fmtNum(customers.by_tier.platinum)} Platinum</Pill>
                  )}
                  {customers?.by_tier?.gold > 0 && (
                    <Pill color="#f59e0b">{fmtNum(customers.by_tier.gold)} Gold</Pill>
                  )}
                  {customers?.by_tier?.silver > 0 && (
                    <Pill color="#9ca3af">{fmtNum(customers.by_tier.silver)} Silver</Pill>
                  )}
                </div>
                {customers?.top_by_spend?.[0] && (
                  <div
                    className="pt-4 border-t flex items-center justify-between"
                    style={{ borderColor: `${COLORS.cyan}20` }}
                  >
                    <div>
                      <div className="text-xs mb-1" style={{ color: `${COLORS.cyan}70` }}>Top Customer</div>
                      <div className="text-sm font-medium" style={{ color: COLORS.cyan }}>{customers.top_by_spend[0].name}</div>
                    </div>
                    <span
                      className="text-sm font-bold"
                      style={{ color: COLORS.green, textShadow: `0 0 8px ${COLORS.green}50` }}
                    >
                      {fmtKES(customers.top_by_spend[0].total_spent)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* ── Bottom Row: Services & Quick Links ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">

        {/* Services */}
        <SectionCard title="Services" Icon={Wrench} color={COLORS.amber} className="lg:col-span-8">
          {loading ? (
            <div className="h-28 bg-gray-100 rounded-xl animate-pulse" />
          ) : (
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="flex items-center gap-12">
                {[
                  { label: 'Total Services', value: services?.total_services, color: COLORS.amber },
                  { label: 'Active', value: services?.active_services, color: COLORS.green },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center px-4">
                    <div
                      className="text-4xl font-bold"
                      style={{ color, textShadow: `0 0 16px ${color}50` }}
                    >
                      {fmtNum(value)}
                    </div>
                    <div className="text-sm mt-1" style={{ color: `${color}80` }}>{label}</div>
                  </div>
                ))}
              </div>
              {services?.revenue_split && (
                <div className="flex-1 min-w-[240px]">
                  <div className="text-sm mb-3" style={{ color: `${COLORS.amber}80` }}>Revenue Split</div>
                  <div className="h-4 rounded-full overflow-hidden flex" style={{ background: `${COLORS.amber}15` }}>
                    {(() => {
                      const total = (services.revenue_split.service_revenue || 0) + (services.revenue_split.product_revenue || 0) || 1;
                      const svcPct = ((services.revenue_split.service_revenue || 0) / total) * 100;
                      return (
                        <>
                          <div
                            className="h-full"
                            style={{
                              width: `${svcPct}%`,
                              background: purple,
                              boxShadow: `0 0 10px 3px ${purple}50`,
                            }}
                          />
                          <div
                            className="h-full"
                            style={{
                              width: `${100 - svcPct}%`,
                              background: COLORS.green,
                              boxShadow: `0 0 10px 3px ${COLORS.green}50`,
                            }}
                          />
                        </>
                      );
                    })()}
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span style={{ color: purple, textShadow: `0 0 6px ${purple}40` }}>
                      Services {fmtKES(services.revenue_split.service_revenue)}
                    </span>
                    <span style={{ color: COLORS.green, textShadow: `0 0 6px ${COLORS.green}40` }}>
                      Products {fmtKES(services.revenue_split.product_revenue)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </SectionCard>
     
        {/* Quick Links */}
        <Panel className="lg:col-span-4">
          <h3 className="font-bold text-gray-900 mb-5 flex items-center gap-2 text-lg" style={{ color: COLORS.yellow }} >
            <Zap size={18} className="text-purple-500" style={{ color: COLORS.yellow }} />
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'New Order', icon: ShoppingCart, color: COLORS.green },
              { label: 'New Quote', icon: FileText, color: purple },
              { label: 'New Project', icon: FolderOpen, color: COLORS.blue },
              { label: 'View Reports', icon: BarChart2, color: COLORS.orange },
            ].map((action) => (
              <button
                key={action.label}
                className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-all duration-200 text-left"
              >
                <action.icon size={18} style={{ color: action.color }} />
                <span className="text-sm font-medium text-gray-700">{action.label}</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </AdminLayout>
  );
}