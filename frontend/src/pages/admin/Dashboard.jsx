import { useState, useEffect, useCallback } from 'react';
import {
  BarChart2, TrendingUp, TrendingDown, ShoppingCart, Users, FileText,
  FolderOpen, Download, RefreshCw, Calendar, ArrowUpRight,
  ArrowDownRight, Minus, DollarSign, Activity, AlertCircle, 
  CheckCircle, XCircle, Layers, Package, Award, Wrench, 
  Ticket, Star, Zap, Clock, Target, Hash, Gift,
  ChevronRight, Briefcase, MessageSquare, Bell,
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
};

// ── Helpers ────────────────────────────────────────────────────────────────
const fmtKES  = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtNum  = (n) => Number(n || 0).toLocaleString();
const fmtPct  = (n) => `${Number(n || 0).toFixed(1)}%`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) : '—';
const fmtHrs  = (h) => h >= 24 ? `${(h / 24).toFixed(1)}d` : `${Math.round(h)}h`;

// ── Atoms ──────────────────────────────────────────────────────────────────
const Panel = ({ children, style = {}, accent = false, className = '' }) => (
  <div className={`bg-white rounded-2xl border ${accent ? 'border-purple-200 shadow-lg shadow-purple-100' : 'border-gray-100 shadow-sm'} p-5 ${className}`} style={style}>
    {children}
  </div>
);

const Pill = ({ children, color = purple, bg, className = '' }) => (
  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${className}`}
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
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${colorClass} ${className}`}>
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
    <Panel className={`transition-all hover:shadow-md ${onClick ? 'cursor-pointer' : ''}`} onClick={onClick}>
      <div className="flex justify-between items-start mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}15` }}>
          <Icon size={20} style={{ color }} />
        </div>
        {trend != null && <TrendBadge value={trend} />}
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-3"><Sparkline data={spark} color={color} height={32} /></div>
      )}
    </Panel>
  );
}

// ── Section Card ───────────────────────────────────────────────────────────
function SectionCard({ title, Icon, color, children, action, alert }) {
  return (
    <Panel accent={alert}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
            <Icon size={16} style={{ color }} />
          </div>
          <h3 className="font-bold text-gray-900">{title}</h3>
          {alert && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
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
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold text-gray-900">{sub || fmtNum(value)}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ── Status Dot ─────────────────────────────────────────────────────────────
const StatusDot = ({ color }) => (
  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: color }} />
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
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-200">
              <BarChart2 size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-sm text-gray-500">Business overview & key metrics</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Period selector */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            {periods.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  period === p.id 
                    ? 'bg-white text-purple-600 shadow-sm' 
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
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Primary KPIs ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-6">
        {loading ? (
          Array(6).fill(0).map((_, i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* ── Left Column (2/3) ──────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">
          
          {/* Revenue & Orders Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Revenue Card */}
            <SectionCard title="Revenue" Icon={DollarSign} color={COLORS.green}>
              {loading ? (
                <div className="h-32 bg-gray-100 rounded-lg animate-pulse" />
              ) : (
                <>
                  <div className="flex items-end gap-3 mb-4">
                    <span className="text-3xl font-bold text-gray-900">{fmtKES(periodRevenue)}</span>
                    <TrendBadge value={revenue?.growth_rate} />
                  </div>
                  <div className="space-y-2">
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
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <Sparkline data={revenue.trend} color={COLORS.green} height={50} />
                    </div>
                  )}
                </>
              )}
            </SectionCard>

            {/* Orders Card */}
            <SectionCard title="Orders" Icon={ShoppingCart} color={purple}>
              {loading ? (
                <div className="h-32 bg-gray-100 rounded-lg animate-pulse" />
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900">{fmtNum(orders?.today)}</div>
                      <div className="text-xs text-gray-500">Today</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900">{fmtNum(orders?.delivered)}</div>
                      <div className="text-xs text-gray-500">Delivered</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900">{fmtNum(orders?.pending)}</div>
                      <div className="text-xs text-gray-500">Pending</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Donut size={70} segments={[
                      { value: orders?.delivered || 0, color: COLORS.green },
                      { value: orders?.shipped || 0, color: COLORS.cyan },
                      { value: orders?.processing || 0, color: purple },
                      { value: orders?.pending || 0, color: COLORS.orange },
                      { value: orders?.cancelled || 0, color: COLORS.red },
                    ]} />
                    <div className="flex-1 space-y-1 text-xs">
                      <div className="flex items-center gap-2"><StatusDot color={COLORS.green} /> Delivered</div>
                      <div className="flex items-center gap-2"><StatusDot color={COLORS.cyan} /> Shipped</div>
                      <div className="flex items-center gap-2"><StatusDot color={purple} /> Processing</div>
                      <div className="flex items-center gap-2"><StatusDot color={COLORS.orange} /> Pending</div>
                    </div>
                  </div>
                </>
              )}
            </SectionCard>
          </div>

          {/* Quote Funnel */}
          <SectionCard title="Quote Funnel" Icon={Layers} color={COLORS.pink}>
            {loading ? (
              <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
            ) : (
              <div className="flex items-center gap-2 md:gap-4 overflow-x-auto pb-2">
                {[
                  { label: 'Requests', value: funnel?.total_requests, color: COLORS.orange, rate: '100%' },
                  { label: 'Quoted', value: funnel?.converted_to_quotes, color: purple, rate: fmtPct(funnel?.req_to_quote_rate) },
                  { label: 'Orders', value: funnel?.converted_to_orders, color: COLORS.green, rate: fmtPct(funnel?.quote_to_order_rate) },
                ].map((stage, i, arr) => (
                  <div key={stage.label} className="flex items-center flex-shrink-0">
                    <div className="text-center px-4 py-3 rounded-xl min-w-[100px]" 
                      style={{ background: `${stage.color}12`, border: `2px solid ${stage.color}30` }}>
                      <div className="text-xl font-bold" style={{ color: stage.color }}>{fmtNum(stage.value)}</div>
                      <div className="text-xs font-medium text-gray-600">{stage.label}</div>
                      <div className="text-xs text-gray-400">{stage.rate}</div>
                    </div>
                    {i < arr.length - 1 && <ChevronRight size={20} className="text-gray-300 mx-1" />}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Products & Brands */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <SectionCard title="Products" Icon={Package} color={COLORS.amber}>
              {loading ? (
                <div className="h-32 bg-gray-100 rounded-lg animate-pulse" />
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="text-center p-3 rounded-lg bg-gray-50">
                      <div className="text-lg font-bold text-gray-900">{fmtNum(products?.total_products)}</div>
                      <div className="text-xs text-gray-500">Total</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-emerald-50">
                      <div className="text-lg font-bold text-emerald-600">{fmtNum(products?.in_stock)}</div>
                      <div className="text-xs text-gray-500">In Stock</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-red-50">
                      <div className="text-lg font-bold text-red-600">{fmtNum(products?.out_of_stock)}</div>
                      <div className="text-xs text-gray-500">Out</div>
                    </div>
                  </div>
                  {products?.top_by_revenue?.[0] && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-50 border border-purple-100">
                      <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                        <Star size={14} className="text-purple-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{products.top_by_revenue[0].name}</div>
                        <div className="text-xs text-gray-500">Top product by revenue</div>
                      </div>
                      <div className="text-sm font-bold text-emerald-600">{fmtKES(products.top_by_revenue[0].revenue)}</div>
                    </div>
                  )}
                </>
              )}
            </SectionCard>

            <SectionCard title="Brands" Icon={Award} color={COLORS.pink}>
              {loading ? (
                <div className="h-32 bg-gray-100 rounded-lg animate-pulse" />
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{fmtNum(brands?.active_brands)}</div>
                      <div className="text-xs text-gray-500">Active brands</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900">{fmtNum(brands?.total_brands)}</div>
                      <div className="text-xs text-gray-500">Total</div>
                    </div>
                  </div>
                  {brands?.top_by_revenue?.slice(0, 3).map((b, i) => (
                    <div key={b.brand} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">{i + 1}</span>
                        <span className="text-sm text-gray-700">{b.brand}</span>
                      </div>
                      <span className="text-sm font-semibold text-emerald-600">{fmtKES(b.revenue)}</span>
                    </div>
                  ))}
                </>
              )}
            </SectionCard>
          </div>
        </div>

        {/* ── Right Column (1/3) ─────────────────────────────────────────── */}
        <div className="space-y-5">
          
          {/* Alerts Panel */}
          <SectionCard 
            title="Alerts" 
            Icon={Bell} 
            color={COLORS.red}
            alert={unassignedTickets > 0 || projects?.overdue > 0 || products?.low_stock > 0}
          >
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {unassignedTickets > 0 && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-100">
                    <Ticket size={16} className="text-red-500" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{unassignedTickets} unassigned tickets</div>
                      <div className="text-xs text-gray-500">Need immediate attention</div>
                    </div>
                  </div>
                )}
                {projects?.overdue > 0 && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-50 border border-orange-100">
                    <Clock size={16} className="text-orange-500" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{projects.overdue} overdue projects</div>
                      <div className="text-xs text-gray-500">Past deadline</div>
                    </div>
                  </div>
                )}
                {products?.low_stock > 0 && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-50 border border-yellow-100">
                    <Package size={16} className="text-yellow-600" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{products.low_stock} low stock items</div>
                      <div className="text-xs text-gray-500">Consider restocking</div>
                    </div>
                  </div>
                )}
                {pendingOrders > 0 && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 border border-blue-100">
                    <ShoppingCart size={16} className="text-blue-500" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{pendingOrders} pending orders</div>
                      <div className="text-xs text-gray-500">Awaiting confirmation</div>
                    </div>
                  </div>
                )}
                {unassignedTickets === 0 && projects?.overdue === 0 && products?.low_stock === 0 && pendingOrders === 0 && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                    <CheckCircle size={16} className="text-emerald-500" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">All caught up!</div>
                      <div className="text-xs text-gray-500">No urgent alerts</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          {/* Tickets Summary */}
          <SectionCard title="Support Tickets" Icon={Ticket} color={COLORS.red} alert={openTickets > 5}>
            {loading ? (
              <div className="h-32 bg-gray-100 rounded-lg animate-pulse" />
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">{fmtNum(openTickets)}</div>
                      <div className="text-xs text-gray-500">Open</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-500">{fmtNum(tickets?.in_progress)}</div>
                      <div className="text-xs text-gray-500">In Progress</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-emerald-600">{fmtNum(tickets?.resolved)}</div>
                      <div className="text-xs text-gray-500">Resolved</div>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Resolution Rate</span>
                    <span className="font-semibold text-emerald-600">{fmtPct(tickets?.resolution_rate)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                      style={{ width: `${tickets?.resolution_rate || 0}%` }} 
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-2">
                    <span>Avg Response: {fmtHrs(tickets?.avg_first_response_hours || 0)}</span>
                    <span>Avg Resolution: {fmtHrs(tickets?.avg_resolution_hours || 0)}</span>
                  </div>
                </div>
              </>
            )}
          </SectionCard>

          {/* Projects Summary */}
          <SectionCard title="Projects" Icon={FolderOpen} color={COLORS.blue}>
            {loading ? (
              <div className="h-28 bg-gray-100 rounded-lg animate-pulse" />
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{fmtNum(projects?.total)}</div>
                    <div className="text-xs text-gray-500">Total projects</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-emerald-600">{fmtPct(projects?.completion_rate)}</div>
                    <div className="text-xs text-gray-500">Completion</div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <MiniBar label="Active" value={projects?.active} max={projects?.total} color={COLORS.blue} />
                  <MiniBar label="Completed" value={projects?.completed} max={projects?.total} color={COLORS.green} />
                  <MiniBar label="On Hold" value={projects?.on_hold} max={projects?.total} color={COLORS.orange} />
                </div>
              </>
            )}
          </SectionCard>

          {/* Customers Summary */}
          <SectionCard title="Customers" Icon={Users} color={COLORS.cyan}>
            {loading ? (
              <div className="h-28 bg-gray-100 rounded-lg animate-pulse" />
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{fmtNum(totalCustomers)}</div>
                    <div className="text-xs text-gray-500">Total customers</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-purple-600">{fmtKES(customers?.avg_lifetime_value)}</div>
                    <div className="text-xs text-gray-500">Avg LTV</div>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {customers?.by_tier?.platinum > 0 && (
                    <Pill color="#8b5cf6" className="text-xs">{fmtNum(customers.by_tier.platinum)} Platinum</Pill>
                  )}
                  {customers?.by_tier?.gold > 0 && (
                    <Pill color="#f59e0b" className="text-xs">{fmtNum(customers.by_tier.gold)} Gold</Pill>
                  )}
                  {customers?.by_tier?.silver > 0 && (
                    <Pill color="#9ca3af" className="text-xs">{fmtNum(customers.by_tier.silver)} Silver</Pill>
                  )}
                </div>
                {customers?.top_by_spend?.[0] && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="text-xs text-gray-500 mb-1">Top Customer</div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">{customers.top_by_spend[0].name}</span>
                      <span className="text-sm font-bold text-emerald-600">{fmtKES(customers.top_by_spend[0].total_spent)}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </SectionCard>

          

        </div>
      </div>

      {/* ── Bottom Row: Services & Quick Links ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
        
        {/* Services */}
        <SectionCard title="Services" Icon={Wrench} color={COLORS.amber} className="lg:col-span-2">
          {loading ? (
            <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
          ) : (
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-gray-900">{fmtNum(services?.total_services)}</div>
                  <div className="text-xs text-gray-500">Total Services</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-emerald-600">{fmtNum(services?.active_services)}</div>
                  <div className="text-xs text-gray-500">Active</div>
                </div>
              </div>
              {services?.revenue_split && (
                <div className="flex-1 min-w-[200px]">
                  <div className="text-xs text-gray-500 mb-2">Revenue Split</div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
                    {(() => {
                      const total = (services.revenue_split.service_revenue || 0) + (services.revenue_split.product_revenue || 0) || 1;
                      const svcPct = ((services.revenue_split.service_revenue || 0) / total) * 100;
                      return (
                        <>
                          <div className="h-full bg-purple-500" style={{ width: `${svcPct}%` }} />
                          <div className="h-full bg-emerald-500" style={{ width: `${100 - svcPct}%` }} />
                        </>
                      );
                    })()}
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-purple-600 font-medium">Services {fmtKES(services.revenue_split.service_revenue)}</span>
                    <span className="text-emerald-600 font-medium">Products {fmtKES(services.revenue_split.product_revenue)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </SectionCard>

        {/* Quick Links */}
        <Panel>
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Zap size={16} className="text-purple-500" />
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'New Order', icon: ShoppingCart, color: COLORS.green },
              { label: 'New Quote', icon: FileText, color: purple },
              { label: 'New Project', icon: FolderOpen, color: COLORS.blue },
              { label: 'View Reports', icon: BarChart2, color: COLORS.orange },
            ].map((action) => (
              <button
                key={action.label}
                className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-all text-left"
              >
                <action.icon size={16} style={{ color: action.color }} />
                <span className="text-sm font-medium text-gray-700">{action.label}</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </AdminLayout>
  );
}