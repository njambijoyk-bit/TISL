import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart2, ShoppingCart, Users, FileText, FolderOpen, Ticket,
  Star, Zap, Clock, DollarSign, Layers, Package, Award, Wrench,
  ChevronRight, Bell, CheckCircle, ArrowUpRight, ArrowDownRight, Minus,
  RefreshCw, TrendingUp, AlertTriangle, Gift, Calendar,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import reportsAPI from '../../api/reports';
import referralsAPI from '../../api/referrals';
import { customerTiersAPI } from '../../api';
import toast from 'react-hot-toast';

// ── Design tokens ──────────────────────────────────────────────────────────
const T = {
  purple:   '#a855f7',
  purpleDk: '#7c3aed',
  purpleLt: 'rgba(168,85,247,0.07)',
  purpleBd: 'rgba(168,85,247,0.18)',
  green:    '#059669',
  greenLt:  'rgba(5,150,105,0.07)',
  red:      '#ef4444',
  redLt:    'rgba(239,68,68,0.07)',
  orange:   '#f59e0b',
  orangeLt: 'rgba(245,158,11,0.07)',
  blue:     '#3b82f6',
  blueLt:   'rgba(59,130,246,0.07)',
  cyan:     '#06b6d4',
  cyanLt:   'rgba(6,182,212,0.07)',
  pink:     '#ec4899',
  pinkLt:   'rgba(236,72,153,0.07)',
  amber:    '#f97316',
  amberLt:  'rgba(249,115,22,0.07)',
  yellow:   '#eab308',
};

const TYPE_PALETTE = [
  '#3b82f6','#a855f7','#059669','#f59e0b',
  '#ef4444','#06b6d4','#f97316','#8b5cf6','#ec4899','#14b8a6',
];

// ── Helpers ────────────────────────────────────────────────────────────────
const fmtKES = (n) => `KES ${Number(n||0).toLocaleString('en-KE',{minimumFractionDigits:0,maximumFractionDigits:0})}`;
const fmtNum = (n) => Number(n||0).toLocaleString();
const fmtPct = (n) => `${Number(n||0).toFixed(1)}%`;
const fmtHrs = (h) => h >= 24 ? `${(h/24).toFixed(1)}d` : `${Math.round(h)}h`;

// ── Trend Badge ────────────────────────────────────────────────────────────
function TrendBadge({ value }) {
  if (value == null) return null;
  const up = value > 0, flat = value === 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const s = flat ? { background:'#f3f4f6', color:'#6b7280' }
    : up   ? { background:'#d1fae5', color:'#059669' }
    :        { background:'#fee2e2', color:'#dc2626' };
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'3px 9px', borderRadius:20, fontSize:11, fontWeight:700, ...s }}>
      <Icon size={11} />{Math.abs(value).toFixed(1)}%
    </span>
  );
}

// ── Sparkline ──────────────────────────────────────────────────────────────
function Sparkline({ data = [], color = T.purple, height = 44 }) {
  if (!data || data.length < 2) return <div style={{ height, background:'#f9fafb', borderRadius:8 }} />;
  const vals = data.map(d => typeof d === 'object' ? (d.value||d.count||d.revenue||0) : d);
  const max = Math.max(...vals,1), min = Math.min(...vals), range = max - min || 1;
  const w = 200;
  const pts = vals.map((v,i) => {
    const x = (i/(vals.length-1))*w;
    const y = height - ((v-min)/range)*(height-10) - 5;
    return `${x},${y}`;
  }).join(' ');
  const id = `sg${color.replace('#','')}`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width:'100%', height, display:'block' }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts} ${w},${height}`} fill={`url(#${id})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Donut ──────────────────────────────────────────────────────────────────
function Donut({ segments = [], size = 80, strokeWidth = 9 }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s,x) => s + (x.value||0), 0) || 1;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={strokeWidth} />
      {segments.map((seg,i) => {
        const dash = (seg.value/total)*circ;
        const el = <circle key={i} cx={size/2} cy={size/2} r={r} fill="none"
          stroke={seg.color} strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${circ-dash}`}
          strokeDashoffset={-offset}
          transform={`rotate(-90 ${size/2} ${size/2})`} />;
        offset += dash;
        return el;
      })}
    </svg>
  );
}

// ── Mini Bar ───────────────────────────────────────────────────────────────
function MiniBar({ label, value, max, color, sub }) {
  const pct = max > 0 ? Math.min((value/max)*100, 100) : 0;
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, alignItems:'center' }}>
        <span style={{ fontSize:12, color:'#6b7280' }}>{label}</span>
        <span style={{ fontSize:12, fontWeight:700, color:'#111827' }}>{sub || fmtNum(value)}</span>
      </div>
      <div style={{ height:5, background:'#f3f4f6', borderRadius:3, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:3, transition:'width 0.6s ease' }} />
      </div>
    </div>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────
function Panel({ children, color, style = {}, accent = false }) {
  const c = color || T.purple;
  return (
    <div style={{
      background:'white', borderRadius:16,
      border:`1px solid ${c}${accent ? '44' : '28'}`,
      boxShadow:`0 0 0 1px ${c}${accent ? '18' : '0d'}, 0 4px 24px ${c}${accent ? '16' : '0a'}, 0 1px 4px rgba(0,0,0,0.03)`,
      padding:22, transition:'box-shadow 0.2s', ...style,
    }}>{children}</div>
  );
}

// ── KPI Card ───────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, Icon, color = T.purple, trend, spark }) {
  return (
    <Panel color={color} accent style={{ display:'flex', flexDirection:'column', gap:12 }}
      onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow=`0 0 0 1px ${color}28, 0 8px 32px ${color}22, 0 2px 8px rgba(0,0,0,0.06)`; }}
      onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=`0 0 0 1px ${color}18, 0 4px 24px ${color}16, 0 1px 4px rgba(0,0,0,0.03)`; }}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div style={{ width:40, height:40, borderRadius:12, background:`${color}12`, border:`1px solid ${color}28`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 14px 3px ${color}20` }}>
          <Icon size={19} color={color} />
        </div>
        {trend != null && <TrendBadge value={trend} />}
      </div>
      <div>
        <div style={{ fontSize:22, fontWeight:800, color:'#0f172a', lineHeight:1.1, letterSpacing:'-0.02em' }}>{value}</div>
        <div style={{ fontSize:12, color:'#64748b', marginTop:3, fontWeight:500 }}>{label}</div>
        {sub && <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>{sub}</div>}
      </div>
      {spark && spark.length > 1 && <div style={{ marginTop:2 }}><Sparkline data={spark} color={color} height={38} /></div>}
    </Panel>
  );
}

// ── Section Card ───────────────────────────────────────────────────────────
function SectionCard({ title, Icon, color, children, action, alert, style = {} }) {
  const c = alert ? T.red : color;
  return (
    <Panel color={c} accent={alert} style={style}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:`${c}12`, border:`1px solid ${c}28`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 12px 3px ${c}22` }}>
            <Icon size={17} color={c} />
          </div>
          <span style={{ fontSize:14, fontWeight:700, color:'#0f172a', letterSpacing:'-0.01em' }}>{title}</span>
          {alert && <span style={{ width:8, height:8, borderRadius:'50%', background:T.red, boxShadow:`0 0 8px 3px ${T.red}80`, animation:'pulse 2s infinite' }} />}
        </div>
        {action}
      </div>
      {children}
    </Panel>
  );
}

// ── Stat Trio ──────────────────────────────────────────────────────────────
function StatTrio({ items }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:18 }}>
      {items.map(({ label, value, color }) => (
        <div key={label} style={{ textAlign:'center', padding:'14px 8px', borderRadius:12, background:`${color}08`, border:`1px solid ${color}20` }}>
          <div style={{ fontSize:22, fontWeight:800, color, lineHeight:1.1 }}>{value}</div>
          <div style={{ fontSize:11, color:`${color}90`, marginTop:3, fontWeight:600 }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────
const Skel = ({ h = 100 }) => (
  <div style={{ height:h, borderRadius:14, background:'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.4s infinite' }} />
);

// ── Responsive grid helpers ────────────────────────────────────────────────
// We use a CSS class approach via a <style> tag for breakpoints
const GRID_STYLES = `
  @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
  @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
  @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  .dash-fade { animation: fadeUp 0.35s ease both; }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(140px, 1fr));
    gap: 14px;
    margin-bottom: 28px;
  }
  .main-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
  }
  .funnel-inner {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0;
    overflow-x: auto;
    padding-bottom: 8px;
  }
  .funnel-inner::-webkit-scrollbar { height: 4px; }
  .funnel-inner::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 2px; }
  .funnel-inner::-webkit-scrollbar-thumb { background: ${T.pink}60; border-radius: 2px; }

  /* Tablet: 2 columns */
  @media (max-width: 1100px) {
    .kpi-grid { grid-template-columns: repeat(4, 1fr); }
    .main-grid { grid-template-columns: repeat(2, 1fr); }
    .full-width  { grid-column: 1 / -1 !important; }
    .span-2      { grid-column: span 1 !important; }
  }

  /* Mobile: 1 column */
  @media (max-width: 640px) {
    .kpi-grid  { grid-template-columns: repeat(2, 1fr); }
    .main-grid { grid-template-columns: 1fr; }
    .full-width  { grid-column: 1 / -1 !important; }
    .span-2      { grid-column: span 1 !important; }
  }
`;

// ══════════════════════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const [period,    setPeriod]    = useState('30d');
  const [loading,   setLoading]   = useState(true);
  const [data,      setData]      = useState({});
  const [allTiers,  setAllTiers]  = useState([]);
  const [allTypes,  setAllTypes]  = useState([]);

  // Fetch tiers & types once on mount (same as Reports page)
  useEffect(() => {
    customerTiersAPI.getTiers().then(res => setAllTiers(res.data || res)).catch(() => {});
    customerTiersAPI.getTypes().then(res => setAllTypes(res.data || res)).catch(() => {});
  }, []);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const params = { period };
      const results = await Promise.allSettled([
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
        reportsAPI.getSystem(params),
        reportsAPI.getExtras(params),
        referralsAPI.getStatistics(),
      ]);
      const keys = ['revenue','orders','products','brands','services','funnel','projects','customers','tickets','promos','system','extras','referrals'];
      const next = {};
      results.forEach((r,i) => { next[keys[i]] = r.status === 'fulfilled' ? r.value : null; });
      setData(next);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchDashboard(); }, [period]);

  const { revenue, orders, products, brands, services, funnel, projects, customers, tickets, promos, system, extras } = data;

  // Tier color map from system.tiers (same pattern as Reports)
  const tierColorMap = useMemo(() => {
    if (!system?.tiers?.length) return {};
    return Object.fromEntries(system.tiers.map(t => [t.slug ?? t.name?.toLowerCase(), t.color]));
  }, [system]);
  const getTierColor = (slug) => tierColorMap[slug] ?? tierColorMap[slug?.toLowerCase()] ?? '#9ca3af';

  const totalRevenue      = revenue?.total_revenue_kes || 0;
  const periodRevenue     = revenue?.period_revenue_kes || 0;
  const totalOrders       = orders?.total_orders || 0;
  const totalCustomers    = customers?.total_customers || 0;
  const openTickets       = tickets?.open || 0;
  const activeProjects    = projects?.active || 0;
  const pendingOrders     = orders?.pending || 0;
  const unassignedTickets = tickets?.unassigned || 0;
  const periodLabel       = { '7d':'7 days','30d':'30 days','90d':'90 days','12m':'12 months' }[period] || period;

  const alerts = [
    { show: unassignedTickets > 0, Icon: Ticket,        color: T.red,    title: `${unassignedTickets} unassigned tickets`, sub: 'Need immediate attention' },
    { show: projects?.overdue > 0,  Icon: Clock,         color: T.orange, title: `${projects?.overdue} overdue projects`,   sub: 'Past deadline' },
    { show: products?.low_stock > 0, Icon: Package,      color: T.amber,  title: `${products?.low_stock} low stock items`,  sub: 'Consider restocking' },
    { show: pendingOrders > 0,        Icon: ShoppingCart, color: T.blue,   title: `${pendingOrders} pending orders`,          sub: 'Awaiting confirmation' },
  ].filter(a => a.show);

  return (
    <AdminLayout>
      <style>{GRID_STYLES}</style>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28, flexWrap:'wrap', gap:16, overflowX: 'hidden', minWidth: 0  }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:46, height:46, borderRadius:13, background:`linear-gradient(135deg,${T.purple},${T.purpleDk})`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 4px 16px ${T.purple}50` }}>
            <BarChart2 size={22} color="white" />
          </div>
          <div>
            <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:'#0f172a', letterSpacing:'-0.02em' }}>Dashboard</h1>
            <p style={{ margin:0, fontSize:12, color:'#64748b', marginTop:2 }}>Business overview · {periodLabel}</p>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <div style={{ display:'flex', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:12, padding:3, gap:2 }}>
            {[['7d','7D'],['30d','30D'],['90d','90D'],['12m','12M']].map(([id, lbl]) => (
              <button key={id} onClick={() => setPeriod(id)} style={{
                padding:'6px 14px', borderRadius:9, border:'none', cursor:'pointer',
                fontSize:12, fontWeight:700, transition:'all 0.15s',
                background: period === id ? `linear-gradient(135deg,${T.purple},${T.purpleDk})` : 'transparent',
                color: period === id ? 'white' : '#64748b',
                boxShadow: period === id ? `0 2px 8px ${T.purple}40` : 'none',
              }}>{lbl}</button>
            ))}
          </div>
          <button onClick={fetchDashboard} disabled={loading} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:10, border:'1px solid #e2e8f0', background:'white', fontSize:12, fontWeight:600, color:'#374151', cursor:'pointer' }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── KPI Strip ─────────────────────────────────────────────────────── */}
      <div className="kpi-grid">
        {loading ? Array(7).fill(0).map((_,i) => <Skel key={i} h={130} />) : (<>
          <KPICard label="Total Revenue (All-Time)" value={fmtKES(totalRevenue)}   sub={`${fmtNum(revenue?.paid_orders)} paid orders`}    Icon={DollarSign}   color={T.green}  spark={revenue?.trend} />
          <KPICard label={`Revenue — ${periodLabel}`} value={fmtKES(periodRevenue)} sub={`All-time: ${fmtKES(totalRevenue)}`}             Icon={TrendingUp}   color={T.purple} spark={revenue?.trend} />
          <KPICard label="Total Orders"              value={fmtNum(totalOrders)}   sub={`${fmtNum(orders?.delivered)} delivered`}          Icon={ShoppingCart} color={T.blue}   />
          <KPICard label="Customers"                 value={fmtNum(totalCustomers)} sub={`+${fmtNum(customers?.new_customers)} this period`} Icon={Users}       color={T.cyan}   />
          <KPICard label="Open Tickets"              value={fmtNum(openTickets)}   sub={unassignedTickets > 0 ? `${unassignedTickets} unassigned` : 'All assigned'} Icon={Ticket} color={openTickets > 5 ? T.red : T.green} />
          <KPICard label="Active Projects"           value={fmtNum(activeProjects)} sub={`${fmtNum(projects?.overdue)} overdue`}           Icon={FolderOpen}  color={T.orange} />
          <KPICard label="Pending Orders"            value={fmtNum(pendingOrders)} sub={`${fmtKES(orders?.today_revenue)} today`}           Icon={Package}     color={T.amber}  />
        </>)}
      </div>

      {/* ── Main Grid ─────────────────────────────────────────────────────── */}
      <div className="main-grid dash-fade">

        {/* Revenue */}
        <SectionCard title="Revenue" Icon={DollarSign} color={T.green}>
          {loading ? <Skel h={160} /> : (<>
            <div style={{ display:'flex', alignItems:'flex-end', gap:10, marginBottom:18 }}>
              <span style={{ fontSize:30, fontWeight:900, color:T.green, letterSpacing:'-0.03em', lineHeight:1 }}>{fmtKES(periodRevenue)}</span>
              <TrendBadge value={revenue?.growth_rate} />
            </div>
            <MiniBar label="Paid Orders"    value={revenue?.paid_orders} max={totalOrders}   color={T.green} sub={`${fmtNum(revenue?.paid_orders)} of ${fmtNum(totalOrders)}`} />
            <MiniBar label="Unpaid Balance" value={revenue?.unpaid_kes}  max={totalRevenue}  color={T.red}   sub={fmtKES(revenue?.unpaid_kes)} />
            {revenue?.trend?.length > 1 && (
              <div style={{ marginTop:16, paddingTop:14, borderTop:`1px solid ${T.green}18` }}>
                <Sparkline data={revenue.trend} color={T.green} height={56} />
              </div>
            )}
          </>)}
        </SectionCard>

        {/* Orders */}
        <SectionCard title="Orders" Icon={ShoppingCart} color={T.purple}>
          {loading ? <Skel h={160} /> : (<>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:18 }}>
              {[
                { label:'Today',     value:orders?.today,     color:T.purple },
                { label:'Delivered', value:orders?.delivered, color:T.green  },
                { label:'Pending',   value:orders?.pending,   color:T.orange },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ textAlign:'center', padding:'12px 6px', borderRadius:10, background:`${color}08`, border:`1px solid ${color}20` }}>
                  <div style={{ fontSize:20, fontWeight:800, color, lineHeight:1 }}>{fmtNum(value)}</div>
                  <div style={{ fontSize:10, color:`${color}80`, marginTop:3, fontWeight:600 }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:16 }}>
              <Donut size={72} segments={[
                { value:orders?.delivered||0,  color:T.green  },
                { value:orders?.shipped||0,    color:T.cyan   },
                { value:orders?.processing||0, color:T.purple },
                { value:orders?.pending||0,    color:T.orange },
                { value:orders?.cancelled||0,  color:T.red    },
              ]} />
              <div style={{ display:'flex', flexDirection:'column', gap:5, flex:1 }}>
                {[['Delivered',T.green],['Shipped',T.cyan],['Processing',T.purple],['Pending',T.orange]].map(([l,c]) => (
                  <div key={l} style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ width:8, height:8, borderRadius:2, background:c, flexShrink:0 }} />
                    <span style={{ fontSize:11, color:'#64748b', flex:1 }}>{l}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:'#111827' }}>{fmtNum(orders?.[l.toLowerCase()])}</span>
                  </div>
                ))}
              </div>
            </div>
          </>)}
        </SectionCard>

        {/* Alerts */}
        <SectionCard title="Alerts" Icon={Bell} color={T.red} alert={alerts.length > 0}>
          {loading ? <Skel h={160} /> : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {alerts.length === 0 ? (
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderRadius:10, background:T.greenLt, border:`1px solid ${T.green}28` }}>
                  <CheckCircle size={16} color={T.green} />
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:T.green }}>All caught up!</div>
                    <div style={{ fontSize:11, color:`${T.green}80` }}>No urgent alerts</div>
                  </div>
                </div>
              ) : alerts.map(({ Icon: AIcon, color, title, sub }) => (
                <div key={title} style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 13px', borderRadius:10, background:`${color}08`, border:`1px solid ${color}28` }}>
                  <AIcon size={15} color={color} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:600, color }}>{title}</div>
                    <div style={{ fontSize:11, color:`${color}70`, marginTop:1 }}>{sub}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Quote Funnel — full width, inner content scrolls horizontally */}
        <SectionCard title="Quote Funnel" Icon={Layers} color={T.pink} style={{ gridColumn:'1 / -1' }} className="full-width">
          {loading ? <Skel h={90} /> : (
            <div className="funnel-inner">
              {[
                { label:'Requests', value:funnel?.total_requests,      color:T.orange, rate:'100%' },
                { label:'Quoted',   value:funnel?.converted_to_quotes, color:T.purple, rate:fmtPct(funnel?.req_to_quote_rate) },
                { label:'Orders',   value:funnel?.converted_to_orders, color:T.green,  rate:fmtPct(funnel?.quote_to_order_rate) },
              ].map((stage, i, arr) => (
                <div key={stage.label} style={{ display:'flex', alignItems:'center', flexShrink:0 }}>
                  <div style={{ textAlign:'center', padding:'18px 32px', borderRadius:14, minWidth:148, background:`${stage.color}08`, border:`1.5px solid ${stage.color}30`, boxShadow:`0 0 20px ${stage.color}14` }}>
                    <div style={{ fontSize:32, fontWeight:900, color:stage.color, lineHeight:1, letterSpacing:'-0.03em' }}>{fmtNum(stage.value)}</div>
                    <div style={{ fontSize:12, fontWeight:700, color:'#374151', marginTop:5 }}>{stage.label}</div>
                    <div style={{ fontSize:11, color:`${stage.color}80`, marginTop:2 }}>{stage.rate}</div>
                  </div>
                  {i < arr.length - 1 && <div style={{ padding:'0 10px', flexShrink:0 }}><ChevronRight size={20} color={`${T.pink}50`} /></div>}
                </div>
              ))}
              <div style={{ marginLeft:28, display:'flex', gap:14, flexShrink:0 }}>
                {[
                  { label:'Avg Response', value:fmtHrs(funnel?.avg_response_hours||0), color:T.orange },
                  { label:'End-to-End',   value:fmtPct(funnel?.end_to_end_rate),       color:T.green  },
                  { label:'Unassigned',   value:fmtNum(funnel?.unassigned),             color:T.red    },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ textAlign:'center', padding:'14px 18px', borderRadius:12, background:`${color}06`, border:`1px solid ${color}20`, flexShrink:0 }}>
                    <div style={{ fontSize:18, fontWeight:800, color, lineHeight:1 }}>{value}</div>
                    <div style={{ fontSize:11, color:`${color}80`, marginTop:4 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        {/* Products */}
        <SectionCard title="Products" Icon={Package} color={T.amber}>
          {loading ? <Skel h={160} /> : (<>
            <StatTrio items={[
              { label:'Total',    value:fmtNum(products?.total_products), color:T.amber },
              { label:'In Stock', value:fmtNum(products?.in_stock),       color:T.green },
              { label:'Out',      value:fmtNum(products?.out_of_stock),   color:T.red   },
            ]} />
            <div style={{ display:'flex', gap:8, marginBottom:14 }}>
              <div style={{ flex:1, padding:'10px 12px', borderRadius:10, background:T.greenLt, border:`1px solid ${T.green}25` }}>
                <div style={{ fontSize:16, fontWeight:800, color:T.green }}>
                  {products?.total_products > 0 ? fmtPct((products.in_stock/products.total_products)*100) : '—'}
                </div>
                <div style={{ fontSize:10, color:`${T.green}80`, marginTop:2, fontWeight:600 }}>In-Stock Rate</div>
              </div>
              <div style={{ flex:1, padding:'10px 12px', borderRadius:10, background:T.orangeLt, border:`1px solid ${T.orange}25` }}>
                <div style={{ fontSize:16, fontWeight:800, color:T.orange }}>{fmtNum(products?.low_stock)}</div>
                <div style={{ fontSize:10, color:`${T.orange}80`, marginTop:2, fontWeight:600 }}>Low Stock</div>
              </div>
            </div>
            {products?.top_by_revenue?.[0] && (
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 13px', borderRadius:10, background:T.amberLt, border:`1px solid ${T.amber}28` }}>
                <Star size={15} color={T.amber} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:T.amber, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{products.top_by_revenue[0].name}</div>
                  <div style={{ fontSize:10, color:`${T.amber}70` }}>Top by revenue</div>
                </div>
                <span style={{ fontSize:13, fontWeight:800, color:T.green, flexShrink:0 }}>{fmtKES(products.top_by_revenue[0].revenue)}</span>
              </div>
            )}
          </>)}
        </SectionCard>

        {/* Brands */}
        <SectionCard title="Brands" Icon={Award} color={T.pink}>
          {loading ? <Skel h={160} /> : (<>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:18 }}>
              <div>
                <div style={{ fontSize:30, fontWeight:900, color:T.pink, letterSpacing:'-0.03em', lineHeight:1 }}>{fmtNum(brands?.active_brands)}</div>
                <div style={{ fontSize:11, color:`${T.pink}80`, marginTop:3, fontWeight:600 }}>Active brands</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:18, fontWeight:700, color:'#94a3b8' }}>{fmtNum(brands?.total_brands)}</div>
                <div style={{ fontSize:11, color:'#94a3b8', marginTop:3, fontWeight:500 }}>Total</div>
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {brands?.top_by_revenue?.slice(0,3).map((b,i) => (
                <div key={b.brand} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', borderRadius:10, background:`${T.pink}06`, border:`1px solid ${T.pink}18` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ width:22, height:22, borderRadius:7, background:`${T.pink}18`, color:T.pink, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800 }}>{i+1}</span>
                    <span style={{ fontSize:12, fontWeight:600, color:`${T.pink}cc` }}>{b.brand}</span>
                  </div>
                  <span style={{ fontSize:12, fontWeight:800, color:T.green }}>{fmtKES(b.revenue)}</span>
                </div>
              ))}
            </div>
          </>)}
        </SectionCard>

        {/* Tickets */}
        <SectionCard title="Support Tickets" Icon={Ticket} color={T.red} alert={openTickets > 5}>
          {loading ? <Skel h={160} /> : (<>
            <StatTrio items={[
              { label:'Open',        value:fmtNum(openTickets),          color:T.red    },
              { label:'In Progress', value:fmtNum(tickets?.in_progress), color:T.orange },
              { label:'Resolved',    value:fmtNum(tickets?.resolved),    color:T.green  },
            ]} />
            <div style={{ padding:'12px 14px', borderRadius:10, background:'#f0fdf4', border:`1px solid ${T.green}28`, marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <span style={{ fontSize:11, fontWeight:700, color:T.green }}>Resolution Rate</span>
                <span style={{ fontSize:18, fontWeight:900, color:T.green }}>{fmtPct(tickets?.resolution_rate)}</span>
              </div>
              <div style={{ height:6, borderRadius:3, background:`${T.green}18`, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${tickets?.resolution_rate||0}%`, background:T.green, borderRadius:3, transition:'width 0.6s' }} />
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#94a3b8' }}>
              <span>Avg Response: <strong style={{ color:T.orange }}>{fmtHrs(tickets?.avg_first_response_hours||0)}</strong></span>
              <span>Avg Resolve: <strong style={{ color:T.green }}>{fmtHrs(tickets?.avg_resolution_hours||0)}</strong></span>
            </div>
          </>)}
        </SectionCard>

        {/* Projects */}
        <SectionCard title="Projects" Icon={FolderOpen} color={T.blue}>
          {loading ? <Skel h={160} /> : (<>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:18 }}>
              <div>
                <div style={{ fontSize:30, fontWeight:900, color:T.blue, letterSpacing:'-0.03em', lineHeight:1 }}>{fmtNum(projects?.total)}</div>
                <div style={{ fontSize:11, color:`${T.blue}80`, marginTop:3, fontWeight:600 }}>Total projects</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:22, fontWeight:900, color:T.green }}>{fmtPct(projects?.completion_rate)}</div>
                <div style={{ fontSize:11, color:`${T.green}80`, marginTop:3, fontWeight:600 }}>Completion</div>
              </div>
            </div>
            <MiniBar label="Active"    value={projects?.active}    max={projects?.total} color={T.blue}   />
            <MiniBar label="Completed" value={projects?.completed} max={projects?.total} color={T.green}  />
            <MiniBar label="On Hold"   value={projects?.on_hold}   max={projects?.total} color={T.orange} />
            {projects?.overdue > 0 && (
              <div style={{ display:'flex', alignItems:'center', gap:7, marginTop:12, padding:'8px 11px', borderRadius:8, background:T.redLt, border:`1px solid ${T.red}28` }}>
                <AlertTriangle size={13} color={T.red} />
                <span style={{ fontSize:11, fontWeight:600, color:T.red }}>{projects.overdue} overdue · {fmtNum(projects?.unassigned)} unassigned</span>
              </div>
            )}
          </>)}
        </SectionCard>

        {/* Customers — with dynamic tiers + types */}
        <SectionCard title="Customers" Icon={Users} color={T.cyan}>
          {loading ? <Skel h={160} /> : (<>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:14 }}>
              <div>
                <div style={{ fontSize:30, fontWeight:900, color:T.cyan, letterSpacing:'-0.03em', lineHeight:1 }}>{fmtNum(totalCustomers)}</div>
                <div style={{ fontSize:11, color:`${T.cyan}80`, marginTop:3, fontWeight:600 }}>Total customers</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:18, fontWeight:900, color:T.purple }}>{fmtKES(customers?.avg_lifetime_value)}</div>
                <div style={{ fontSize:11, color:`${T.purple}80`, marginTop:3, fontWeight:600 }}>Avg LTV</div>
              </div>
            </div>

            {/* Tiers — color from system.tiers via tierColorMap */}
            {customers?.by_tier && Object.keys(customers.by_tier).length > 0 && (
              <>
                <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6 }}>By Tier</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
                  {allTiers.length > 0
                    ? allTiers.map(t => {
                        const count = customers.by_tier[t.slug] ?? 0;
                        if (!count) return null;
                        const tc = t.color || getTierColor(t.slug) || '#9ca3af';
                        return (
                          <span key={t.slug} style={{ padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:`${tc}14`, color:tc, border:`1px solid ${tc}30` }}>
                            {fmtNum(count)} {t.name}
                          </span>
                        );
                      })
                    : Object.entries(customers.by_tier).filter(([,c]) => c > 0).map(([slug, count]) => {
                        const tc = getTierColor(slug);
                        return (
                          <span key={slug} style={{ padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:`${tc}14`, color:tc, border:`1px solid ${tc}30` }}>
                            {fmtNum(count)} {slug.charAt(0).toUpperCase()+slug.slice(1)}
                          </span>
                        );
                      })
                  }
                </div>
              </>
            )}

            {/* Types — dynamic from customerTiersAPI.getTypes() */}
            {customers?.by_type && Object.keys(customers.by_type).length > 0 && (
              <>
                <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6 }}>By Type</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
                  {allTypes.length > 0
                    ? allTypes.map((t, idx) => {
                        const slug = t.slug ?? t.type;
                        const count = customers.by_type[slug] ?? 0;
                        if (!count) return null;
                        const tc = TYPE_PALETTE[idx % TYPE_PALETTE.length];
                        return (
                          <span key={slug} style={{ padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:`${tc}14`, color:tc, border:`1px solid ${tc}30` }}>
                            {fmtNum(count)} {t.name ?? slug}
                          </span>
                        );
                      })
                    : Object.entries(customers.by_type).filter(([,c]) => c > 0).map(([slug, count], idx) => {
                        const tc = TYPE_PALETTE[idx % TYPE_PALETTE.length];
                        return (
                          <span key={slug} style={{ padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:`${tc}14`, color:tc, border:`1px solid ${tc}30` }}>
                            {fmtNum(count)} {slug.charAt(0).toUpperCase()+slug.slice(1)}
                          </span>
                        );
                      })
                  }
                </div>
              </>
            )}

            {customers?.top_by_spend?.[0] && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:10, borderTop:`1px solid ${T.cyan}18` }}>
                <div>
                  <div style={{ fontSize:10, color:`${T.cyan}70`, marginBottom:2 }}>Top Customer</div>
                  <div style={{ fontSize:13, fontWeight:700, color:T.cyan }}>{customers.top_by_spend[0].name}</div>
                </div>
                <span style={{ fontSize:13, fontWeight:800, color:T.green }}>{fmtKES(customers.top_by_spend[0].total_spent)}</span>
              </div>
            )}
          </>)}
        </SectionCard>

        {/* Services — span 2 cols on desktop */}
        <SectionCard title="Services" Icon={Wrench} color={T.amber} style={{ gridColumn:'span 2' }}>
          {loading ? <Skel h={100} /> : (
            <div style={{ display:'flex', alignItems:'center', gap:28, flexWrap:'wrap' }}>
              <div style={{ display:'flex', gap:18 }}>
                {[
                  { label:'Total',  value:services?.total_services,  color:T.amber },
                  { label:'Active', value:services?.active_services, color:T.green },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ textAlign:'center', padding:'14px 20px', borderRadius:12, background:`${color}08`, border:`1px solid ${color}20` }}>
                    <div style={{ fontSize:28, fontWeight:900, color, lineHeight:1, letterSpacing:'-0.03em' }}>{fmtNum(value)}</div>
                    <div style={{ fontSize:11, color:`${color}80`, marginTop:4, fontWeight:600 }}>{label}</div>
                  </div>
                ))}
              </div>
              {services?.revenue_split && (() => {
                const tot = (services.revenue_split.service_revenue||0) + (services.revenue_split.product_revenue||0) || 1;
                const svcPct = ((services.revenue_split.service_revenue||0)/tot)*100;
                return (
                  <div style={{ flex:1, minWidth:220 }}>
                    <div style={{ fontSize:11, color:`${T.amber}90`, fontWeight:600, marginBottom:8 }}>Revenue Split — {periodLabel}</div>
                    <div style={{ height:10, borderRadius:5, overflow:'hidden', display:'flex', background:`${T.amber}10` }}>
                      <div style={{ width:`${svcPct}%`, background:T.purple, transition:'width 0.6s' }} />
                      <div style={{ flex:1, background:T.green }} />
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, fontSize:12 }}>
                      <span style={{ fontWeight:700, color:T.purple }}>Services {fmtKES(services.revenue_split.service_revenue)}</span>
                      <span style={{ fontWeight:700, color:T.green }}>Products {fmtKES(services.revenue_split.product_revenue)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </SectionCard>

        {/* Extras — Hampers & Bookings — full width */}
        <SectionCard title="Hampers & Bookings" Icon={Gift} color={T.blue} style={{ gridColumn:'1 / -1' }}>
          {loading ? <Skel h={100} /> : !extras ? (
            <div style={{ textAlign:'center', padding:'20px 0', color:'#94a3b8', fontSize:13 }}>No extras data available</div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:18 }}>

              {/* Hampers */}
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:T.purple, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
                  <Gift size={13} color={T.purple} /> Hampers
                </div>
                <div style={{ display:'flex', gap:10, marginBottom:14 }}>
                  <div style={{ flex:1, padding:'12px 14px', borderRadius:10, background:T.purpleLt, border:`1px solid ${T.purple}28` }}>
                    <div style={{ fontSize:20, fontWeight:800, color:T.purple }}>{fmtNum(extras.hampers?.period_orders)}</div>
                    <div style={{ fontSize:10, color:`${T.purple}70`, marginTop:2, fontWeight:600 }}>Orders</div>
                  </div>
                  <div style={{ flex:1, padding:'12px 14px', borderRadius:10, background:T.greenLt, border:`1px solid ${T.green}28` }}>
                    <div style={{ fontSize:20, fontWeight:800, color:T.green }}>{fmtKES(extras.hampers?.period_revenue)}</div>
                    <div style={{ fontSize:10, color:`${T.green}70`, marginTop:2, fontWeight:600 }}>Revenue</div>
                  </div>
                </div>
                {extras.hampers?.top_hampers?.length > 0 && (
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {extras.hampers.top_hampers.slice(0,3).map((h,i) => (
                      <div key={h.name} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 11px', borderRadius:9, background:`${T.purple}06`, border:`1px solid ${T.purple}18` }}>
                        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                          <span style={{ width:20, height:20, borderRadius:6, background:`${T.purple}18`, color:T.purple, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800 }}>{i+1}</span>
                          <span style={{ fontSize:12, fontWeight:600, color:`${T.purple}cc` }}>{h.name}</span>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:12, fontWeight:800, color:T.green }}>{fmtKES(h.revenue)}</div>
                          <div style={{ fontSize:10, color:'#94a3b8' }}>{fmtNum(h.count)} orders</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {(!extras.hampers?.top_hampers || extras.hampers.top_hampers.length === 0) && (
                  <div style={{ fontSize:12, color:'#94a3b8', padding:'8px 0' }}>No hamper orders this period</div>
                )}
              </div>

              {/* Bookings */}
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:T.blue, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
                  <Calendar size={13} color={T.blue} /> Bookings
                </div>
                <div style={{ display:'flex', gap:10, marginBottom:14 }}>
                  <div style={{ flex:1, padding:'12px 14px', borderRadius:10, background:T.blueLt, border:`1px solid ${T.blue}28` }}>
                    <div style={{ fontSize:20, fontWeight:800, color:T.blue }}>{fmtNum(extras.bookings?.period_placed)}</div>
                    <div style={{ fontSize:10, color:`${T.blue}70`, marginTop:2, fontWeight:600 }}>Placed</div>
                  </div>
                  <div style={{ flex:1, padding:'12px 14px', borderRadius:10, background:T.greenLt, border:`1px solid ${T.green}28` }}>
                    <div style={{ fontSize:20, fontWeight:800, color:T.green }}>{fmtKES(extras.bookings?.service_revenue)}</div>
                    <div style={{ fontSize:10, color:`${T.green}70`, marginTop:2, fontWeight:600 }}>Revenue</div>
                  </div>
                </div>
                {extras.bookings?.status_dist && Object.keys(extras.bookings.status_dist).length > 0 ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    {Object.entries(extras.bookings.status_dist).map(([status, count], idx) => {
                      const tc = TYPE_PALETTE[idx % TYPE_PALETTE.length];
                      const tot = Object.values(extras.bookings.status_dist).reduce((a,v) => a+v, 0) || 1;
                      const pct = (count/tot)*100;
                      return (
                        <div key={status}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                            <span style={{ fontSize:11, color:'#6b7280' }}>{status.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</span>
                            <span style={{ fontSize:11, fontWeight:700, color:tc }}>{fmtNum(count)}</span>
                          </div>
                          <div style={{ height:4, borderRadius:2, background:'#f3f4f6', overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${pct}%`, background:tc, borderRadius:2 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize:12, color:'#94a3b8', padding:'8px 0' }}>No booking data this period</div>
                )}
              </div>

            </div>
          )}
        </SectionCard>

        {/* Quick Actions */}
        <Panel color={T.yellow} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <Zap size={16} color={T.yellow} />
            <span style={{ fontSize:14, fontWeight:700, color:'#0f172a', letterSpacing:'-0.01em' }}>Quick Actions</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {[
              { label:'New Order',    Icon:ShoppingCart, color:T.green  },
              { label:'New Quote',    Icon:FileText,     color:T.purple },
              { label:'New Project',  Icon:FolderOpen,   color:T.blue   },
              { label:'View Reports', Icon:BarChart2,    color:T.orange },
            ].map(({ label, Icon: QIcon, color }) => (
              <button key={label} style={{
                display:'flex', alignItems:'center', gap:8, padding:'11px 12px', borderRadius:10, cursor:'pointer',
                border:`1px solid ${color}25`, background:`${color}06`, fontSize:12, fontWeight:600, color:'#374151',
                transition:'all 0.15s', textAlign:'left',
              }}
              onMouseEnter={e => { e.currentTarget.style.background=`${color}12`; e.currentTarget.style.borderColor=`${color}45`; }}
              onMouseLeave={e => { e.currentTarget.style.background=`${color}06`; e.currentTarget.style.borderColor=`${color}25`; }}
              >
                <QIcon size={15} color={color} />
                {label}
              </button>
            ))}
          </div>
        </Panel>

      </div>
    </AdminLayout>
  );
}