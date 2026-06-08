import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../api/axios';
import { useAuthStore } from '../../../store';
import ThemeSwitcher from '../../../components/common/ThemeSwitcher';
import toast from 'react-hot-toast';

const FINANCE_ROLES = ['super_admin', 'finance', 'admin'];

const LEDGER_META = {
  payments:       { label: 'Payments',       color: '#10b981', icon: '💳' },
  store_credit:   { label: 'Store Credit',   color: '#3b82f6', icon: '🎟' },
  loyalty_points: { label: 'Loyalty Points', color: '#a855f7', icon: '⭐' },
  credit_account: { label: 'Credit Account', color: '#f59e0b', icon: '🏦' },
  vat:            { label: 'VAT',            color: '#ef4444', icon: '🧾' },
};

const STATUS_COLORS = {
  open:   { bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.3)',  text: '#10b981' },
  closed: { bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.3)', text: '#64748b' },
};

const S = {
  page:      { minHeight: '100vh', background: 'var(--bg-primary, #0f0f1a)', padding: '32px', fontFamily: 'monospace' },
  back:      { display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#a855f7', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer', marginBottom: '20px', opacity: 0.75, userSelect: 'none' },
  header:    { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' },
  title:     { color: '#e2e8f0', fontSize: '22px', fontWeight: 800, letterSpacing: '0.04em', marginBottom: '4px' },
  subtitle:  { color: '#475569', fontSize: '12px', letterSpacing: '0.06em' },
  newBtn:    { padding: '10px 20px', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '12px', fontWeight: 700, fontFamily: 'monospace', cursor: 'pointer', letterSpacing: '0.05em' },
  ledgerGrid:{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '28px' },
  ledgerCard:(color, active) => ({ background: 'linear-gradient(160deg, #0f0f1a, #1a1a2e)', border: `1px solid ${active ? color : color + '40'}`, borderRadius: '12px', padding: '16px', cursor: 'pointer', boxShadow: active ? `0 0 12px ${color}30` : 'none', transition: 'all 0.2s' }),
  ledgerIcon:{ fontSize: '22px', marginBottom: '8px' },
  ledgerLabel:(color) => ({ color, fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }),
  ledgerCount:{ color: '#475569', fontSize: '11px' },
  filters:   { display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' },
  filterSelect: { background: '#0f0f1a', border: '1px solid rgba(168,85,247,0.2)', borderRadius: '8px', color: '#e2e8f0', fontSize: '12px', padding: '8px 12px', fontFamily: 'monospace', outline: 'none', cursor: 'pointer' },
  tableWrap: { background: 'linear-gradient(160deg, #0f0f1a 0%, #1a1a2e 100%)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: '14px', overflow: 'hidden' },
  table:     { width: '100%', borderCollapse: 'collapse' },
  th:        { padding: '12px 16px', textAlign: 'left', color: '#475569', fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid rgba(168,85,247,0.15)', background: 'rgba(168,85,247,0.04)', fontFamily: 'monospace' },
  td:        { padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', verticalAlign: 'middle' },
  tr:        (hover) => ({ background: hover ? 'rgba(168,85,247,0.04)' : 'transparent', cursor: 'pointer', transition: 'background 0.15s' }),
  pill:      (c) => ({ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', background: c.bg, border: `1px solid ${c.border}`, color: c.text, fontFamily: 'monospace', textTransform: 'uppercase' }),
  sessionNum:{ color: '#a855f7', fontSize: '12px', fontWeight: 700 },
  meta:      { color: '#475569', fontSize: '10px', lineHeight: 1.6, fontFamily: 'monospace' },
  statChip:  (color) => ({ display: 'inline-block', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, color, background: `${color}18`, marginRight: '4px', fontFamily: 'monospace' }),
  progressWrap: { height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', marginTop: '6px', overflow: 'hidden' },
  progressFill: (pct, color) => ({ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px', transition: 'width 0.4s ease' }),
  empty:     { padding: '60px 20px', textAlign: 'center', color: '#475569', fontSize: '13px' },
  overlay:   { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modalBox:  { background: 'linear-gradient(160deg, #0f0f1a, #1a1a2e)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: '16px', padding: '28px', width: '460px', fontFamily: 'monospace', boxShadow: '0 0 60px rgba(168,85,247,0.15)' },
  modalTitle:{ color: '#e2e8f0', fontSize: '16px', fontWeight: 800, marginBottom: '20px', letterSpacing: '0.04em' },
  modalField:{ marginBottom: '14px' },
  modalLabel:{ color: '#94a3b8', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px', display: 'block' },
  modalInput:{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: '8px', color: '#e2e8f0', fontSize: '12px', padding: '9px 12px', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' },
  modalSelect:{ width: '100%', background: '#0f0f1a', border: '1px solid rgba(168,85,247,0.25)', borderRadius: '8px', color: '#e2e8f0', fontSize: '12px', padding: '9px 12px', fontFamily: 'monospace', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' },
  modalFooter:{ display: 'flex', gap: '10px', marginTop: '24px' },
  btnCancel: { flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(168,85,247,0.25)', borderRadius: '8px', color: '#94a3b8', fontSize: '12px', fontWeight: 700, fontFamily: 'monospace', cursor: 'pointer' },
  btnCreate: (disabled) => ({ flex: 2, padding: '10px', background: disabled ? 'rgba(168,85,247,0.15)' : 'linear-gradient(135deg, #a855f7, #7c3aed)', border: 'none', borderRadius: '8px', color: disabled ? '#475569' : '#fff', fontSize: '12px', fontWeight: 700, fontFamily: 'monospace', cursor: disabled ? 'not-allowed' : 'pointer' }),
};

function CreateSessionModal({ onClose, onCreate }) {
  const [form, setForm]     = useState({ ledger: 'payments', period_start: '', period_end: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const valid = form.ledger && form.period_start && form.period_end;

  const handleSubmit = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const res = await api.post('/admin/reconciliation/sessions', form);
      toast.success(`Session ${res.data.session_number} created`);
      onCreate();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to create session');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modalBox} onClick={e => e.stopPropagation()}>
        <div style={S.modalTitle}>NEW RECONCILIATION SESSION</div>

        <div style={S.modalField}>
          <label style={S.modalLabel}>Ledger</label>
          <select style={S.modalSelect} value={form.ledger} onChange={e => setForm(f => ({ ...f, ledger: e.target.value }))}>
            {Object.entries(LEDGER_META).map(([k, v]) => (
              <option key={k} value={k}>{v.icon} {v.label}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ ...S.modalField, flex: 1 }}>
            <label style={S.modalLabel}>Period Start</label>
            <input style={S.modalInput} type="date" value={form.period_start}
              onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))} />
          </div>
          <div style={{ ...S.modalField, flex: 1 }}>
            <label style={S.modalLabel}>Period End</label>
            <input style={S.modalInput} type="date" value={form.period_end}
              onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))} />
          </div>
        </div>

        <div style={S.modalField}>
          <label style={S.modalLabel}>Notes (optional)</label>
          <input style={S.modalInput} type="text" placeholder="e.g. May 2026 payments sweep"
            value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>

        <div style={S.modalFooter}>
          <button style={S.btnCancel} onClick={onClose}>CANCEL</button>
          <button style={S.btnCreate(!valid || saving)} disabled={!valid || saving} onClick={handleSubmit}>
            {saving ? 'CREATING...' : 'CREATE SESSION'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReconciliationPage() {
  const navigate      = useNavigate();
  const { user }      = useAuthStore();
  const isFinance     = FINANCE_ROLES.includes(user?.role);

  const [sessions, setSessions]     = useState([]);
  const [meta, setMeta]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [hoveredRow, setHovered]    = useState(null);
  const [page, setPage]             = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [filterLedger, setFilterLedger] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, per_page: 20 };
      if (filterLedger) params.ledger = filterLedger;
      if (filterStatus) params.status = filterStatus;
      const res = await api.get('/admin/reconciliation/sessions', { params });
      setSessions(res.data.data ?? []);
      setMeta(res.data);
    } catch {
      toast.error('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [page, filterLedger, filterStatus]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const ledgerCounts = Object.keys(LEDGER_META).reduce((acc, key) => {
    acc[key] = sessions.filter(s => s.ledger === key).length;
    return acc;
  }, {});

  const progressPct = (s) => {
    const total = s.lines_count || 0;
    if (!total) return 0;
    return Math.round(((s.confirmed_count || 0) + (s.written_off_count || 0)) / total * 100);
  };

  return (
    <div style={S.page}>
      <div style={S.back} onClick={() => navigate('/admin/settings')}>
        ← Settings
      </div>

      <div style={S.header}>
        <div>
            <div style={S.title}>⚖ RECONCILIATION</div>
            <div style={S.subtitle}>PERIOD-BASED LEDGER REVIEW — PAYMENTS · CREDIT · LOYALTY · STORE CREDIT · VAT</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isFinance && (
            <button style={S.newBtn} onClick={() => setShowCreate(true)}>+ NEW SESSION</button>
            )}
            <button
                style={{ ...S.newBtn, background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', color: '#a855f7' }}
                onClick={() => navigate('/admin/financial-notes')}
            >
                📓 NOTES
            </button>
            <ThemeSwitcher />
        </div>
        </div>

      {/* Ledger cards */}
      <div style={S.ledgerGrid}>
        {Object.entries(LEDGER_META).map(([key, m]) => (
          <div key={key} style={S.ledgerCard(m.color, filterLedger === key)}
            onClick={() => { setFilterLedger(filterLedger === key ? '' : key); setPage(1); }}>
            <div style={S.ledgerIcon}>{m.icon}</div>
            <div style={S.ledgerLabel(m.color)}>{m.label}</div>
            <div style={S.ledgerCount}>
              {ledgerCounts[key]} session{ledgerCounts[key] !== 1 ? 's' : ''}
              {filterLedger === key ? ' · filtered' : ''}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={S.filters}>
        <select style={S.filterSelect} value={filterLedger} onChange={e => { setFilterLedger(e.target.value); setPage(1); }}>
          <option value="">All Ledgers</option>
          {Object.entries(LEDGER_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select style={S.filterSelect} value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {/* Table */}
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Session</th>
              <th style={S.th}>Ledger</th>
              <th style={S.th}>Period</th>
              <th style={S.th}>Status</th>
              <th style={S.th}>Progress</th>
              <th style={S.th}>Opened By</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={S.empty}>Loading...</td></tr>
            ) : sessions.length === 0 ? (
              <tr><td colSpan={6} style={S.empty}>No sessions found.</td></tr>
            ) : sessions.map(session => {
              const ledger = LEDGER_META[session.ledger];
              const pct    = progressPct(session);
              return (
                <tr
                  key={session.id}
                  style={S.tr(hoveredRow === session.id)}
                  onMouseEnter={() => setHovered(session.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => navigate(`/admin/reconciliation/${session.id}`)}
                >
                  <td style={S.td}>
                    <div style={S.sessionNum}>{session.session_number}</div>
                    <div style={S.meta}>{session.notes || '—'}</div>
                  </td>
                  <td style={S.td}>
                    <span style={{ color: ledger?.color, fontSize: '13px' }}>
                      {ledger?.icon} {ledger?.label}
                    </span>
                  </td>
                  <td style={S.td}>
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>
                      {new Date(session.period_start).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                    <div style={{ color: '#475569', fontSize: '11px' }}>
                      → {new Date(session.period_end).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  </td>
                  <td style={S.td}>
                    <span style={S.pill(STATUS_COLORS[session.status] || STATUS_COLORS.open)}>
                      {session.status}
                    </span>
                  </td>
                  <td style={S.td}>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <span style={S.statChip('#10b981')}>{session.confirmed_count ?? 0} OK</span>
                      <span style={S.statChip('#ef4444')}>{session.disputed_count ?? 0} DIS</span>
                      <span style={S.statChip('#f59e0b')}>{session.pending_count ?? 0} PEN</span>
                    </div>
                    <div style={S.progressWrap}>
                      <div style={S.progressFill(pct, ledger?.color)} />
                    </div>
                    <div style={{ ...S.meta, marginTop: '3px' }}>{pct}% complete</div>
                  </td>
                  <td style={S.td}>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>
                      {session.opened_by?.name ?? `User #${session.opened_by}`}
                    </div>
                    <div style={S.meta}>
                      {new Date(session.opened_at).toLocaleDateString('en-KE', { day: '2-digit', month: 'short' })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {meta && meta.last_page > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid rgba(168,85,247,0.1)' }}>
            <span style={S.meta}>{meta.from}–{meta.to} of {meta.total}</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                style={{ padding: '6px 12px', background: 'transparent', border: '1px solid rgba(168,85,247,0.2)', borderRadius: '6px', color: page === 1 ? '#334155' : '#a855f7', fontSize: '11px', fontFamily: 'monospace', cursor: page === 1 ? 'not-allowed' : 'pointer' }}
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >← PREV</button>
              <button
                style={{ padding: '6px 12px', background: 'transparent', border: '1px solid rgba(168,85,247,0.2)', borderRadius: '6px', color: page === meta.last_page ? '#334155' : '#a855f7', fontSize: '11px', fontFamily: 'monospace', cursor: page === meta.last_page ? 'not-allowed' : 'pointer' }}
                disabled={page === meta.last_page}
                onClick={() => setPage(p => p + 1)}
              >NEXT →</button>
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateSessionModal onClose={() => setShowCreate(false)} onCreate={fetchSessions} />
      )}
    </div>
  );
}