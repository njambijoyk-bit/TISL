import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft, User, Activity, Calendar, RefreshCw, AlertTriangle
} from 'lucide-react';
import SettingsLayout from '../../../../components/layout/SettingsLayout';
import api from '../../../../api/axios';
import AdminCustomerAnalytics from './AdminCustomerAnalytics';
import AdminSessionDetail from './AdminSessionDetail';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// CustomerIds are numeric; sessionIds are UUID strings — use this to auto-detect
const isNumeric = (val) => /^\d+$/.test(String(val));

// ── Date presets ──────────────────────────────────────────────────────────────
const PRESETS = [
  { label: 'Today', days: 0  },
  { label: '7d',    days: 7  },
  { label: '30d',   days: 30 },
  { label: '90d',   days: 90 },
];

function getPresetDates(days) {
  const to   = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return {
    from: from.toISOString().slice(0, 10),
    to:   to.toISOString().slice(0, 10),
  };
}

// ── Main page ─────────────────────────────────────────────────────────────────
// Route: /admin/settings/analytics/:id
//   numeric id  → customerId  → open Customer tab
//   string  id  → sessionId   → open Session tab
//   ?customer=X → extra context when a session is opened from a customer page
export default function AdminAnalyticsDetail() {
  const navigate        = useNavigate();
  const { id }          = useParams();
  const [searchParams]  = useSearchParams();

  // Resolve what kind of id we got
  const isCustomer  = isNumeric(id);
  const customerId  = isCustomer ? id : (searchParams.get('customer') || null);
  const sessionId   = !isCustomer ? id : null;

  // Active session (can be set later by clicking a row in the customer tab)
  const [activeSessionId, setActiveSessionId] = useState(sessionId);

  // Default tab based on route
  const [tab, setTab] = useState(isCustomer ? 'customer' : 'session');

  // Resolved customerId — if we only have a sessionId, peek the session to find the customer
  const [resolvedCustomerId,   setResolvedCustomerId]   = useState(customerId);
  const [sessionCustomerName,  setSessionCustomerName]  = useState(null);
  const [resolving,            setResolving]            = useState(false);

  useEffect(() => {
    // Already have a customerId — nothing to resolve
    if (customerId) { setResolvedCustomerId(customerId); return; }
    // No sessionId to look up either
    if (!activeSessionId) return;

    setResolving(true);
    api.get(`/admin/analytics/sessions/${activeSessionId}`)
      .then(r => {
        const cid  = r.data?.session?.customer_id;
        const name = r.data?.session?.customer_name;
        if (cid)  setResolvedCustomerId(cid);
        if (name) setSessionCustomerName(name);
      })
      .catch(() => {})
      .finally(() => setResolving(false));
  }, [customerId, activeSessionId]);

  // When a session row is clicked inside AdminCustomerAnalytics
  const handleSessionClick = useCallback((sid) => {
    setActiveSessionId(sid);
    setTab('session');
  }, []);

  // Date range (only used by the customer tab)
  const [preset, setPreset] = useState(1);
  const [from,   setFrom]   = useState(getPresetDates(7).from);
  const [to,     setTo]     = useState(getPresetDates(7).to);

  const applyPreset = (idx) => {
    setPreset(idx);
    const { from: f, to: t } = getPresetDates(PRESETS[idx].days);
    setFrom(f); setTo(t);
  };

  const hasCustomer = !!resolvedCustomerId;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <SettingsLayout>

      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '24px 16px' }}>

        {/* ── Breadcrumb ────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <button
            type="button"
            onClick={() => navigate('/admin/settings/analytics')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.8rem', padding: 0 }}>
            <ChevronLeft size={14} />
            Search Analytics
          </button>
          <span style={{ color: '#e5e7eb' }}>/</span>
          <span style={{ fontSize: '0.8rem', color: '#374151', fontWeight: 600 }} className="dark:text-gray-300">
            {tab === 'session' && activeSessionId
              ? `Session ${String(activeSessionId).slice(0, 14)}…`
              : resolvedCustomerId ? `Customer #${resolvedCustomerId}` : 'Detail'}
          </span>
        </div>

        {/* ── Page header ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827', margin: 0 }} className="dark:text-white">
              {tab === 'session' && activeSessionId
                ? 'Session Journey'
                : sessionCustomerName || (resolvedCustomerId ? 'Customer Detail' : 'Analytics Detail')}
            </h1>
            <p style={{ color: '#6b7280', fontSize: '0.82rem', marginTop: 4 }}>
              {from && to ? `${fmtDate(from)} — ${fmtDate(to)}` : ''}
            </p>
          </div>

          {/* Date controls — only shown on customer tab */}
          {tab === 'customer' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {PRESETS.map((p, i) => (
                <button key={i} type="button" onClick={() => applyPreset(i)}
                  style={{
                    padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    fontSize: '0.75rem', fontWeight: 600,
                    background: preset === i ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : '#f3f4f6',
                    color: preset === i ? 'white' : '#6b7280',
                  }}>
                  {p.label}
                </button>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 8 }} className="dark:bg-gray-800 dark:border-gray-600">
                <Calendar size={12} style={{ color: '#9ca3af' }} />
                <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreset(-1); }}
                  style={{ border: 'none', outline: 'none', fontSize: '0.75rem', background: 'transparent', color: '#374151', cursor: 'pointer' }}
                  className="dark:text-gray-200" />
                <span style={{ color: '#d1d5db' }}>—</span>
                <input type="date" value={to} onChange={e => { setTo(e.target.value); setPreset(-1); }}
                  style={{ border: 'none', outline: 'none', fontSize: '0.75rem', background: 'transparent', color: '#374151', cursor: 'pointer' }}
                  className="dark:text-gray-200" />
              </div>
            </div>
          )}
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 20, background: '#f3f4f6', borderRadius: 10, padding: 3, width: 'fit-content' }} className="dark:bg-gray-800">

          <button
            type="button"
            disabled={!hasCustomer && !resolving}
            onClick={() => setTab('customer')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 18px', borderRadius: 8, border: 'none',
              cursor: hasCustomer || resolving ? 'pointer' : 'not-allowed',
              fontSize: '0.8rem', fontWeight: 600, transition: 'all 150ms',
              background: tab === 'customer' ? 'white' : 'transparent',
              color:      tab === 'customer' ? '#a855f7' : (!hasCustomer ? '#d1d5db' : '#9ca3af'),
              boxShadow:  tab === 'customer' ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
              opacity:    !hasCustomer && !resolving ? 0.5 : 1,
            }}>
            <User size={13} />
            Customer
            {resolving && <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} />}
            {!hasCustomer && !resolving && (
              <span style={{ fontSize: '0.62rem', color: '#d1d5db' }}>— Guest</span>
            )}
          </button>

          <button
            type="button"
            disabled={!activeSessionId}
            onClick={() => setTab('session')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 18px', borderRadius: 8, border: 'none',
              cursor: activeSessionId ? 'pointer' : 'not-allowed',
              fontSize: '0.8rem', fontWeight: 600, transition: 'all 150ms',
              background: tab === 'session' ? 'white' : 'transparent',
              color:      tab === 'session' ? '#a855f7' : (!activeSessionId ? '#d1d5db' : '#9ca3af'),
              boxShadow:  tab === 'session' ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
              opacity:    !activeSessionId ? 0.5 : 1,
            }}>
            <Activity size={13} />
            Session
            {!activeSessionId && (
              <span style={{ fontSize: '0.62rem', color: '#d1d5db' }}>— select one</span>
            )}
          </button>
        </div>

        {/* ── Tab content ──────────────────────────────────────────────── */}
        {tab === 'customer' && (
          hasCustomer
            ? <AdminCustomerAnalytics
                customerId={resolvedCustomerId}
                from={from}
                to={to}
                onSessionClick={handleSessionClick}
              />
            : <div style={{ padding: '48px 24px', textAlign: 'center', background: 'white', borderRadius: 16, border: '1px solid #f3f4f6' }} className="dark:bg-gray-800 dark:border-gray-700">
                <AlertTriangle size={28} style={{ color: '#d1d5db', marginBottom: 12 }} />
                <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>Guest session — no customer profile available.</p>
                <p style={{ fontSize: '0.78rem', color: '#d1d5db', marginTop: 6 }}>Switch to the Session tab to view the journey.</p>
              </div>
        )}

        {tab === 'session' && (
          activeSessionId
            ? <AdminSessionDetail sessionId={activeSessionId} />
            : <div style={{ padding: '48px 24px', textAlign: 'center', background: 'white', borderRadius: 16, border: '1px solid #f3f4f6' }} className="dark:bg-gray-800 dark:border-gray-700">
                <Activity size={28} style={{ color: '#d1d5db', marginBottom: 12 }} />
                <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>No session selected. Click a session row from the Customer tab.</p>
              </div>
        )}
      </div>

      </SettingsLayout>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}