import { DollarSign, TrendingUp, RefreshCw, Clock, CheckCircle, XCircle, AlertCircle, BarChart3 } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

const fmt = (amount, currency) => {
  if (amount == null || isNaN(Number(amount))) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: currency || 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Number(amount));
};

const fmtKes = (amount) => fmt(amount, 'KES');

const sum = (arr, key) => arr.reduce((acc, item) => acc + Number(item[key] ?? 0), 0);

const groupBy = (arr, key) =>
  arr.reduce((acc, item) => {
    const k = item[key] || 'Unknown';
    acc[k] = acc[k] || [];
    acc[k].push(item);
    return acc;
  }, {});

const MILESTONE_STATUSES = [
  { key: 'pending',          label: 'Pending',   color: '#9ca3af', bg: 'rgba(156,163,175,0.1)',  border: 'rgba(156,163,175,0.3)',  icon: Clock },
  { key: 'ready_for_review', label: 'In Review', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.3)',   icon: AlertCircle },
  { key: 'approved',         label: 'Approved',  color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',   border: 'rgba(59,130,246,0.3)',   icon: CheckCircle },
  { key: 'completed',        label: 'Completed', color: '#10b981', bg: 'rgba(16,185,129,0.1)',   border: 'rgba(16,185,129,0.3)',   icon: CheckCircle },
  { key: 'rejected',         label: 'Rejected',  color: '#ef4444', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.3)',    icon: XCircle },
];

const msCfg = (status) => MILESTONE_STATUSES.find((s) => s.key === status)
  ?? { label: status, color: '#9ca3af', bg: 'rgba(156,163,175,0.1)', border: 'rgba(156,163,175,0.3)', icon: Clock };

const formatDate = (d) => {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

// Summary card with coloured accent bar + icon
const StatCard = ({ icon: Icon, label, primary, secondary, color, iconBg }) => (
  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
    <div style={{ height: 3, background: color, opacity: 0.7 }} />
    <div className="bg-white dark:bg-gray-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color }}>
          {label}
        </span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: iconBg }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <p className="text-xl font-bold text-gray-900 dark:text-white">{primary}</p>
      {secondary && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{secondary}</p>}
    </div>
  </div>
);

// Section card with purple accent header
const Card = ({ title, subtitle, accent = '#a855f7', children }) => (
  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
    <div style={{ padding: '10px 16px', background: 'rgba(168,85,247,0.06)', borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
      <p style={{ fontSize: '0.75rem', fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
        {title}
      </p>
      {subtitle && <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 2 }}>{subtitle}</p>}
    </div>
    <div className="bg-white dark:bg-gray-800 p-5">
      {children}
    </div>
  </div>
);

// Table header with purple label
const THead = ({ cols }) => (
  <thead>
    <tr style={{ borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
      {cols.map(({ label, align = 'left' }) => (
        <th key={label}
          className={`text-${align} pb-2.5 pr-4 last:pr-0`}
          style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#c084fc' }}>
          {label}
        </th>
      ))}
    </tr>
  </thead>
);

// Currency badge
const CurrencyPill = ({ currency, color }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className="w-6 h-6 rounded text-xs font-bold flex items-center justify-center"
      style={{ background: `${color}18`, color }}>
      {currency.slice(0, 2)}
    </span>
    <span className="font-medium text-gray-900 dark:text-white ml-1">{currency}</span>
  </span>
);

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────

const ProjectFinanceTab = ({ project, items = [], milestones = [] }) => {
  const baseCurrency = project?.base_currency || 'USD';

  // Items
  const itemsByCurrency  = groupBy(items, 'currency');
  const itemCurrencies   = Object.keys(itemsByCurrency);
  const kesForItem       = (item) => item.currency === 'KES' ? Number(item.line_total ?? 0) : Number(item.line_total_kes ?? 0);
  const totalItemsKes    = items.reduce((acc, i) => acc + kesForItem(i), 0);
  const itemCurrencyRows = itemCurrencies.map((currency) => ({
    currency,
    count:    itemsByCurrency[currency].length,
    total:    sum(itemsByCurrency[currency], 'line_total'),
    totalKes: itemsByCurrency[currency].reduce((acc, i) => acc + kesForItem(i), 0),
  }));

  // Milestones
  const milestonesByCurrency  = groupBy(milestones, 'currency');
  const milestoneCurrencies   = Object.keys(milestonesByCurrency);
  const kesForMilestone       = (m) => m.currency === 'KES' ? Number(m.amount ?? 0) : Number(m.amount_kes ?? 0);
  const totalMilestonesKes    = milestones.reduce((acc, m) => acc + kesForMilestone(m), 0);
  const milestoneCurrencyRows = milestoneCurrencies.map((currency) => ({
    currency,
    count:    milestonesByCurrency[currency].length,
    total:    sum(milestonesByCurrency[currency], 'amount'),
    totalKes: milestonesByCurrency[currency].reduce((acc, m) => acc + kesForMilestone(m), 0),
  }));
  const milestonesByStatus = groupBy(milestones, 'status');
  const statusesWithData   = MILESTONE_STATUSES.filter((s) => milestonesByStatus[s.key]?.length > 0);

  const grandTotalKes = totalItemsKes + totalMilestonesKes;
  const hasItems      = items.length > 0;
  const hasMilestones = milestones.length > 0;

  if (!hasItems && !hasMilestones) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center rounded-xl"
        style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
          style={{ background: 'rgba(168,85,247,0.08)' }}>
          <BarChart3 className="w-6 h-6" style={{ color: '#c084fc' }} />
        </div>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No financial data yet</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Add items or milestones to see the finance summary here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Summary cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Items total */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
          <div style={{ height: 3, background: '#3b82f6', opacity: 0.7 }} />
          <div className="bg-white dark:bg-gray-800 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: '#3b82f6' }}>Items Total</span>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.1)' }}>
                <DollarSign className="w-4 h-4" style={{ color: '#3b82f6' }} />
              </div>
            </div>
            {!hasItems ? (
              <p className="text-sm text-gray-400 italic">No items yet</p>
            ) : (
              <div className="space-y-1.5">
                {itemCurrencyRows.map(({ currency, total }) => (
                  <div key={currency} className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{currency}</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{fmt(total, currency)}</span>
                  </div>
                ))}
                {totalItemsKes > 0 && (
                  <div className="flex items-center justify-between pt-1.5 mt-1.5"
                    style={{ borderTop: '1px solid rgba(59,130,246,0.15)' }}>
                    <span className="text-xs" style={{ color: '#3b82f6' }}>≈ KES</span>
                    <span className="text-xs font-semibold" style={{ color: '#3b82f6' }}>{fmtKes(totalItemsKes)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Milestones total */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
          <div style={{ height: 3, background: '#a855f7', opacity: 0.7 }} />
          <div className="bg-white dark:bg-gray-800 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: '#a855f7' }}>Milestones Total</span>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.1)' }}>
                <TrendingUp className="w-4 h-4" style={{ color: '#a855f7' }} />
              </div>
            </div>
            {!hasMilestones ? (
              <p className="text-sm text-gray-400 italic">No milestones yet</p>
            ) : (
              <div className="space-y-1.5">
                {milestoneCurrencyRows.map(({ currency, total }) => (
                  <div key={currency} className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{currency}</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{fmt(total, currency)}</span>
                  </div>
                ))}
                {totalMilestonesKes > 0 && (
                  <div className="flex items-center justify-between pt-1.5 mt-1.5"
                    style={{ borderTop: '1px solid rgba(168,85,247,0.15)' }}>
                    <span className="text-xs" style={{ color: '#a855f7' }}>≈ KES</span>
                    <span className="text-xs font-semibold" style={{ color: '#a855f7' }}>{fmtKes(totalMilestonesKes)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* KES Grand Total */}
        <StatCard
          icon={RefreshCw}
          label="KES Grand Total"
          primary={grandTotalKes > 0 ? fmtKes(grandTotalKes) : '—'}
          secondary={
            project?.exchange_rate_to_kes
              ? `Rate: 1 ${baseCurrency} = ${Number(project.exchange_rate_to_kes).toFixed(2)} KES`
              : 'No exchange rate set'
          }
          color="#10b981"
          iconBg="rgba(16,185,129,0.1)"
        />
      </div>

      {/* ── Items breakdown ──────────────────────────────────────── */}
      {hasItems && (
        <Card
          title="Items Breakdown"
          subtitle={`${items.length} line item${items.length !== 1 ? 's' : ''} · ${itemCurrencies.length} currenc${itemCurrencies.length !== 1 ? 'ies' : 'y'}`}
          accent="#3b82f6"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <THead cols={[
                { label: 'Currency' },
                { label: 'Items', align: 'right' },
                { label: 'Total', align: 'right' },
                { label: 'KES Equiv.', align: 'right' },
              ]} />
              <tbody>
                {itemCurrencyRows.map(({ currency, count, total, totalKes }, i, arr) => (
                  <tr key={currency}
                    style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(168,85,247,0.08)' : 'none' }}>
                    <td className="py-3 pr-4"><CurrencyPill currency={currency} color="#3b82f6" /></td>
                    <td className="py-3 pr-4 text-right text-gray-500 dark:text-gray-400">{count}</td>
                    <td className="py-3 pr-4 text-right font-bold text-gray-900 dark:text-white">{fmt(total, currency)}</td>
                    <td className="py-3 text-right" style={{ color: '#3b82f6', fontWeight: 600 }}>
                      {totalKes > 0 ? fmtKes(totalKes) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              {itemCurrencies.length > 1 && totalItemsKes > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid rgba(59,130,246,0.2)' }}>
                    <td colSpan={3} className="pt-3 text-xs" style={{ color: '#9ca3af' }}>Total KES equivalent</td>
                    <td className="pt-3 text-right font-extrabold" style={{ color: '#3b82f6' }}>{fmtKes(totalItemsKes)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}

      {/* ── Milestones breakdown ─────────────────────────────────── */}
      {hasMilestones && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* By currency */}
          <Card title="Milestone Amounts"
            subtitle={`${milestones.length} milestone${milestones.length !== 1 ? 's' : ''}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <THead cols={[
                  { label: 'Currency' },
                  { label: 'Count', align: 'right' },
                  { label: 'Total', align: 'right' },
                  { label: 'KES', align: 'right' },
                ]} />
                <tbody>
                  {milestoneCurrencyRows.map(({ currency, count, total, totalKes }, i, arr) => (
                    <tr key={currency}
                      style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(168,85,247,0.08)' : 'none' }}>
                      <td className="py-3 pr-4"><CurrencyPill currency={currency} color="#a855f7" /></td>
                      <td className="py-3 pr-4 text-right text-gray-500 dark:text-gray-400">{count}</td>
                      <td className="py-3 pr-4 text-right font-bold text-gray-900 dark:text-white">{fmt(total, currency)}</td>
                      <td className="py-3 text-right font-semibold" style={{ color: '#a855f7' }}>
                        {totalKes > 0 ? fmtKes(totalKes) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {milestoneCurrencies.length > 1 && totalMilestonesKes > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid rgba(168,85,247,0.2)' }}>
                      <td colSpan={3} className="pt-3 text-xs" style={{ color: '#9ca3af' }}>Total KES equivalent</td>
                      <td className="pt-3 text-right font-extrabold" style={{ color: '#a855f7' }}>{fmtKes(totalMilestonesKes)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>

          {/* By status */}
          <Card title="Milestone Status">
            <div className="space-y-2.5">
              {statusesWithData.map(({ key, label, color, bg, border, icon: Icon }) => {
                const group    = milestonesByStatus[key] ?? [];
                const total    = sum(group, 'amount');
                const currency = group[0]?.currency || baseCurrency;
                const pct      = Math.round((group.length / milestones.length) * 100);

                return (
                  <div key={key} className="px-3 py-2.5 rounded-lg"
                    style={{ background: bg, border: `1px solid ${border}` }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5" style={{ color }} />
                        <span className="text-xs font-bold" style={{ color }}>{label}</span>
                        <span className="text-xs" style={{ color, opacity: 0.6 }}>({group.length})</span>
                      </div>
                      <span className="text-xs font-bold" style={{ color }}>
                        {total > 0 ? fmt(total, currency) : '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden"
                        style={{ background: `${color}20` }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <span className="text-xs w-8 text-right" style={{ color, opacity: 0.7 }}>{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ── Per-milestone detail table ───────────────────────────── */}
      {hasMilestones && (
        <Card title="Milestone Detail" subtitle="All milestones with amounts and current status">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <THead cols={[
                { label: 'Milestone' },
                { label: 'Status' },
                { label: 'Amount', align: 'right' },
                { label: 'KES', align: 'right' },
              ]} />
              <tbody>
                {milestones.map((m, i, arr) => {
                  const cfg = msCfg(m.status);
                  const due = formatDate(m.due_date);
                  return (
                    <tr key={m.id}
                      style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(168,85,247,0.08)' : 'none' }}>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-gray-900 dark:text-white leading-tight">{m.title}</p>
                        {due && <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>Due {due}</p>}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full"
                          style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right font-bold text-gray-900 dark:text-white">
                        {Number(m.amount) > 0 ? fmt(m.amount, m.currency) : '—'}
                      </td>
                      <td className="py-3 text-right font-semibold" style={{ color: '#10b981' }}>
                        {kesForMilestone(m) > 0 ? fmtKes(kesForMilestone(m)) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {totalMilestonesKes > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid rgba(168,85,247,0.2)' }}>
                    <td colSpan={3} className="pt-3 text-xs" style={{ color: '#9ca3af' }}>Total KES equivalent</td>
                    <td className="pt-3 text-right font-extrabold" style={{ color: '#10b981' }}>{fmtKes(totalMilestonesKes)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ProjectFinanceTab;