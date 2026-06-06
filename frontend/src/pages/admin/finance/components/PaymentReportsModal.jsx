import { useState, useEffect } from 'react';
import { X, BarChart2, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react';
import paymentsAPI from '../../../../api/payments';
import { purple, purpleLt, purpleBd } from '../../../../lib/finance-ui';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(amount) {
  return `KES ${Number(amount ?? 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
}

function pct(num, den) {
  if (!den) return '0%';
  return `${((num / den) * 100).toFixed(1)}%`;
}

const PERIODS = [
  { label: 'Today',      value: 'today' },
  { label: 'This Week',  value: 'week'  },
  { label: 'This Month', value: 'month' },
  { label: 'All Time',   value: 'all'   },
];

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = '#374151', bg = 'rgba(255,255,255,0.03)', border = 'rgba(255,255,255,0.08)' }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 10,
      background: bg, border: `1px solid ${border}`,
    }}>
      <p style={{ margin: 0, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af' }}>
        {label}
      </p>
      <p style={{ margin: '5px 0 0', fontSize: '1.1rem', fontWeight: 900, color }}>
        {value}
      </p>
      {sub && (
        <p style={{ margin: '3px 0 0', fontSize: '0.7rem', color: '#9ca3af' }}>{sub}</p>
      )}
    </div>
  );
}

// ── Section label ──────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{
        margin: '0 0 10px', fontSize: '0.67rem', fontWeight: 800,
        textTransform: 'uppercase', letterSpacing: '0.08em', color: purple,
      }}>
        {title}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function PaymentReportsModal({ onClose }) {
  const [period, setPeriod]   = useState('month');
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      // Fetch summary (always) + filtered payments for period-specific calcs
      const [summary, periodData] = await Promise.all([
        paymentsAPI.getSummary(),
        fetchPeriodStats(period),
      ]);
      setData({ summary, ...periodData });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Build date params per period and compute stats from the payments list
  const fetchPeriodStats = async (p) => {
    const now   = new Date();
    const pad   = n => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;

    let from_date = today;
    if (p === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      from_date = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    } else if (p === 'month') {
      from_date = `${now.getFullYear()}-${pad(now.getMonth()+1)}-01`;
    } else if (p === 'all') {
      from_date = '2020-01-01';
    }

    // Pull all payments for the period (large per_page to get totals)
    const res = await paymentsAPI.listPayments({ from_date, to_date: today, per_page: 1000 });
    const payments = res.data ?? [];

    const credits     = payments.filter(p => p.method === 'credit');
    const refunds     = payments.filter(p => p.method === 'refund');
    const creditTotal = credits.reduce((s, p) => s + Number(p.mpesa_amount_confirmed ?? 0), 0);
    const refundTotal = refunds.reduce((s, p) => s + Number(p.mpesa_amount_confirmed ?? 0), 0);

    const total       = payments.length;
    const confirmed   = payments.filter(p => p.status === 'confirmed');
    const failed      = payments.filter(p => p.status === 'failed');
    const cancelled   = payments.filter(p => p.status === 'cancelled');
    const pending     = payments.filter(p => p.status === 'pending');
    const retries     = payments.filter(p => p.is_retry);
    const overridden  = payments.filter(p => p.phone_overridden);
    const disputed    = payments.filter(p => p.dispute_status !== 'none');
    const openDisputes= payments.filter(p => ['raised','investigating'].includes(p.dispute_status));
    const partials    = payments.filter(p => p.is_partial);

    const collected   = confirmed.reduce((s, p) => s + Number(p.mpesa_amount_confirmed ?? 0), 0);
    const expected    = confirmed.reduce((s, p) => s + Number(p.amount_expected ?? 0), 0);
    const shortfall   = expected - collected;

    return {
      total, collected, expected, shortfall,
      confirmedCount:  confirmed.length,
      failedCount:     failed.length,
      cancelledCount:  cancelled.length,
      pendingCount:    pending.length,
      retryCount:      retries.length,
      overriddenCount: overridden.length,
      disputedCount:   disputed.length,
      openDisputeCount:openDisputes.length,
      partialCount:    partials.length,
      creditCount: credits.length,
      creditTotal,
      refundCount: refunds.length,
      refundTotal,
    };
  };

  useEffect(() => { load(); }, [period]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 700,
          maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--color-bg-elevated, #fff)',
          borderRadius: 14, padding: 24,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: purpleLt, border: `1px solid ${purpleBd}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <BarChart2 size={18} color={purple} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: purple }}>Payment Reports</p>
              <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>Live calculated from payment records</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#9ca3af', padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Period selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              style={{
                padding: '7px 14px', borderRadius: 8,
                border: period === p.value ? `1px solid ${purpleBd}` : '1px solid rgba(255,255,255,0.1)',
                background: period === p.value ? purpleLt : 'transparent',
                color: period === p.value ? purple : '#9ca3af',
                fontSize: '0.78rem', fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 150ms',
              }}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={load}
            disabled={loading}
            style={{
              marginLeft: 'auto', padding: '7px 10px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent', cursor: 'pointer', color: '#9ca3af',
            }}
            title="Refresh"
          >
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: '0.85rem' }}>
            Calculating…
          </div>
        ) : data ? (
          <>
            {/* ── Money ────────────────────────────────────────────────── */}
            <Section title="Collections">
              <StatCard
                label="Total Collected"
                value={fmt(data.collected)}
                color="#10b981"
                bg="rgba(16,185,129,0.07)"
                border="rgba(16,185,129,0.2)"
              />
              <StatCard
                label="Total Expected"
                value={fmt(data.expected)}
                color={purple}
                bg={purpleLt}
                border={purpleBd}
              />
              <StatCard
                label="Shortfall"
                value={fmt(data.shortfall)}
                sub="Expected minus confirmed"
                color={data.shortfall > 0 ? '#ef4444' : '#10b981'}
                bg={data.shortfall > 0 ? 'rgba(239,68,68,0.07)' : 'rgba(16,185,129,0.07)'}
                border={data.shortfall > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}
              />
              <StatCard
                label="This Month Total"
                value={fmt(data.summary.month_collected)}
                color="#3b82f6"
                bg="rgba(59,130,246,0.07)"
                border="rgba(59,130,246,0.2)"
              />
            </Section>

            {/* ── Volume ───────────────────────────────────────────────── */}
            <Section title="Volume">
              <StatCard label="Total Requests"   value={data.total} />
              <StatCard
                label="Confirmed"
                value={data.confirmedCount}
                sub={pct(data.confirmedCount, data.total) + ' success rate'}
                color="#10b981"
                bg="rgba(16,185,129,0.07)"
                border="rgba(16,185,129,0.2)"
              />
              <StatCard
                label="Failed"
                value={data.failedCount}
                sub={pct(data.failedCount, data.total) + ' failure rate'}
                color="#ef4444"
                bg="rgba(239,68,68,0.07)"
                border="rgba(239,68,68,0.2)"
              />
              <StatCard
                label="Cancelled"
                value={data.cancelledCount}
                sub={pct(data.cancelledCount, data.total)}
                color="#9ca3af"
              />
              <StatCard
                label="Still Pending"
                value={data.pendingCount}
                color="#f59e0b"
                bg="rgba(245,158,11,0.07)"
                border="rgba(245,158,11,0.2)"
              />
              <StatCard
                label="Partial Payments"
                value={data.partialCount}
                sub={pct(data.partialCount, data.confirmedCount) + ' of confirmed'}
              />
            </Section>

            <Section title="Credit & Refunds">
              <StatCard
                label="Credit Payments"
                value={data.creditCount}
                sub={fmt(data.creditTotal) + ' charged to accounts'}
                color="#7c3aed"
                bg="rgba(124,58,237,0.07)"
                border="rgba(124,58,237,0.2)"
              />
              <StatCard
                label="Refunds Issued"
                value={data.refundCount}
                sub={fmt(data.refundTotal) + ' returned to customers'}
                color="#3b82f6"
                bg="rgba(59,130,246,0.07)"
                border="rgba(59,130,246,0.2)"
              />
              <StatCard
                label="Net Collected"
                value={fmt(data.collected - data.refundTotal)}
                sub="After refunds"
                color={data.collected - data.refundTotal > 0 ? '#10b981' : '#ef4444'}
                bg={data.collected - data.refundTotal > 0 ? 'rgba(16,185,129,0.07)' : 'rgba(239,68,68,0.07)'}
                border={data.collected - data.refundTotal > 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}
              />
            </Section>

            {/* ── Operational ──────────────────────────────────────────── */}
            <Section title="Operational">
              <StatCard
                label="Retries"
                value={data.retryCount}
                sub={pct(data.retryCount, data.total) + ' needed retry'}
                color={data.retryCount > 0 ? '#f59e0b' : '#9ca3af'}
              />
              <StatCard
                label="Phone Overrides"
                value={data.overriddenCount}
                sub="Customer phone bypassed"
                color={data.overriddenCount > 0 ? '#f59e0b' : '#9ca3af'}
              />
            </Section>

            {/* ── Disputes ─────────────────────────────────────────────── */}
            <Section title="Disputes">
              <StatCard
                label="Total Disputed"
                value={data.disputedCount}
                sub={pct(data.disputedCount, data.total) + ' of all payments'}
                color={data.disputedCount > 0 ? '#f97316' : '#9ca3af'}
                bg={data.disputedCount > 0 ? 'rgba(249,115,22,0.07)' : undefined}
                border={data.disputedCount > 0 ? 'rgba(249,115,22,0.2)' : undefined}
              />
              <StatCard
                label="Open Disputes"
                value={data.openDisputeCount}
                sub="Raised or investigating"
                color={data.openDisputeCount > 0 ? '#ef4444' : '#10b981'}
                bg={data.openDisputeCount > 0 ? 'rgba(239,68,68,0.07)' : 'rgba(16,185,129,0.07)'}
                border={data.openDisputeCount > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}
              />
            </Section>
          </>
        ) : null}

        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  );
}