import { useState, useEffect, useCallback } from 'react';
import {
  Users, CheckCircle, XCircle, AlertTriangle,
  ChevronLeft, ChevronRight, Filter, X, Shield,
} from 'lucide-react';
import { format } from 'date-fns';
import policyAPI from '../../../../../_shared/api/policy';

// ── Shared primitives (mirrored from PolicySettings) ─────────────────────────

const card = {
  background: 'var(--surface-card, #fff)',
  borderRadius: 12,
  border: '1px solid var(--line)',
  boxShadow: '0 2px 12px color-mix(in srgb, var(--color-primary-500) 6%, transparent)',
};

const inputStyle = {
  padding: '6px 10px', borderRadius: 8, fontSize: '0.78rem',
  background: 'var(--surface-card, #fff)',
  border: '1.5px solid var(--line)',
  color: 'var(--text-primary)', outline: 'none',
  transition: 'border-color 150ms',
  fontFamily: 'inherit', boxSizing: 'border-box',
};

const inputFocus = (e) => { e.currentTarget.style.borderColor = 'var(--color-primary-500)'; };
const inputBlur  = (e) => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 18%, transparent)'; };

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
      <div style={{
        width: 28, height: 28,
        border: '3px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)',
        borderTopColor: 'var(--color-primary-500)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  );
}

// ── Response badge ────────────────────────────────────────────────────────────

function ResponseBadge({ response }) {
  const accepted = response === 'accepted';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 99, fontSize: '0.65rem', fontWeight: 700,
      background: accepted ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
      color: accepted ? '#059669' : '#dc2626',
    }}>
      {accepted
        ? <CheckCircle size={10} />
        : <XCircle size={10} />}
      {accepted ? 'Accepted' : 'Disagreed'}
    </span>
  );
}

// ── Context badge ─────────────────────────────────────────────────────────────

const CONTEXT_COLORS = {
  login:               { bg: 'rgba(59,130,246,0.08)',  color: '#1d4ed8' },
  register:            { bg: 'rgba(16,185,129,0.08)',  color: '#059669' },
  cookie_consent:      { bg: 'color-mix(in srgb, var(--color-primary-500) 8%, transparent)',  color: 'var(--color-primary-600)' },
  website_policy:      { bg: 'rgba(107,114,128,0.08)', color: 'var(--text-secondary)' },
  standard_checkout:   { bg: 'rgba(245,158,11,0.08)',  color: '#b45309' },
  hamper_checkout:     { bg: 'rgba(245,158,11,0.08)',  color: '#b45309' },
  booking_checkout:    { bg: 'rgba(245,158,11,0.08)',  color: '#b45309' },
};

function ContextBadge({ context }) {
  const s = CONTEXT_COLORS[context] ?? { bg: 'rgba(107,114,128,0.08)', color: 'var(--text-secondary)' };
  const label = context?.replace(/_/g, ' ') ?? '—';
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px', borderRadius: 99, fontSize: '0.62rem', fontWeight: 700,
      textTransform: 'capitalize', background: s.bg, color: s.color,
    }}>
      {label}
    </span>
  );
}

// ── Snapshot modal ────────────────────────────────────────────────────────────

function SnapshotModal({ acceptance, onClose }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(15,10,30,0.65)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        ...card,
        width: '100%', maxWidth: 640,
        padding: 24, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>
              Policy snapshot
            </p>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', margin: 0 }}>
              Exact text the customer agreed to · v{acceptance.policy_version}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        {/* Meta row */}
        <div style={{
          display: 'flex', gap: 16, flexWrap: 'wrap',
          padding: '10px 14px', borderRadius: 8, marginBottom: 16,
          background: 'var(--surface-card, #fff)', border: '1px solid var(--line)',
          fontSize: '0.75rem',
        }}>
          {[
            ['Customer',  acceptance.customer?.first_name
              ? `${acceptance.customer.first_name} ${acceptance.customer.last_name} (${acceptance.customer.customer_number})`
              : acceptance.customer_number ?? '—'],
            ['Response',  acceptance.response],
            ['Version',   `v${acceptance.policy_version}`],
            ['Context',   acceptance.action_context?.replace(/_/g, ' ')],
            ['Date',      acceptance.accepted_at ? format(new Date(acceptance.accepted_at), 'dd MMM yyyy, HH:mm') : '—'],
            ['IP',        acceptance.ip_address ?? '—'],
          ].map(([lbl, val]) => (
            <div key={lbl}>
              <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{lbl}</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{val}</span>
            </div>
          ))}
        </div>

        {/* Snapshot content */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '14px 16px', borderRadius: 8,
          background: 'var(--surface-input)', border: '1px solid var(--line)',
          fontSize: '0.8rem', lineHeight: 1.75, color: 'var(--text-primary)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          fontFamily: 'Georgia, serif',
        }}>
          {acceptance.policy_snapshot || <span style={{ color: 'var(--text-tertiary)' }}>No snapshot stored.</span>}
        </div>

        {/* Disagree reason */}
        {acceptance.disagree_reason && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 8,
            background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)',
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <AlertTriangle size={13} style={{ color: '#dc2626', flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#dc2626', margin: '0 0 3px' }}>
                Disagree reason
              </p>
              <p style={{ fontSize: '0.78rem', color: '#b91c1c', margin: 0, lineHeight: 1.5 }}>
                {acceptance.disagree_reason}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const ACTION_CONTEXTS = [
  'login', 'register', 'hamper_checkout', 'standard_checkout',
  'booking_checkout', 'cookie_consent', 'website_policy',
];

export default function PolicyAcceptances({ policies = [] }) {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [page,        setPage]        = useState(1);
  const [policyId,    setPolicyId]    = useState('');   // '' = first policy
  const [filterResp,  setFilterResp]  = useState('');   // '' | 'accepted' | 'disagreed'
  const [filterCtx,   setFilterCtx]   = useState('');
  const [filterFlag,  setFilterFlag]  = useState('');   // '' | '1' | '0'
  const [snapshot,    setSnapshot]    = useState(null); // acceptance to preview

  // Default to first policy
  const activePolicyId = policyId || policies[0]?.id;

  const load = useCallback(async () => {
    if (!activePolicyId) return;
    setLoading(true);
    try {
      const params = { page, per_page: 25 };
      if (filterResp) params.response       = filterResp;
      if (filterCtx)  params.action_context = filterCtx;
      if (filterFlag) params.flagged        = filterFlag;
      const res = await policyAPI.getAcceptances(activePolicyId, params);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [activePolicyId, page, filterResp, filterCtx, filterFlag]);

  useEffect(() => { load(); }, [load]);

  // Reset page when filters or policy change
  useEffect(() => { setPage(1); }, [activePolicyId, filterResp, filterCtx, filterFlag]);

  const rows = data?.data ?? [];
  const meta = {
    current_page: data?.current_page ?? 1,
    last_page:    data?.last_page    ?? 1,
    total:        data?.total        ?? 0,
    from:         data?.from         ?? 0,
    to:           data?.to           ?? 0,
  };

  const accepted    = rows.filter(r => r.response === 'accepted').length;
  const disagreed   = rows.filter(r => r.response === 'disagreed').length;
  const flaggedRows = rows.filter(r => r.flagged).length;

  const hasFilters = filterResp || filterCtx || filterFlag;

  const clearFilters = () => {
    setFilterResp('');
    setFilterCtx('');
    setFilterFlag('');
    setPage(1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Policy selector tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {policies.map(p => (
          <button
            key={p.id}
            onClick={() => { setPolicyId(p.id); setPage(1); }}
            style={{
              padding: '5px 14px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700,
              border: `1.5px solid ${activePolicyId === p.id ? 'var(--color-primary-500)' : 'color-mix(in srgb, var(--color-primary-500) 18%, transparent)'}`,
              background: activePolicyId === p.id ? 'color-mix(in srgb, var(--color-primary-500) 8%, transparent)' : 'var(--surface-card, #fff)',
              color: activePolicyId === p.id ? 'var(--color-primary-600)' : 'var(--text-tertiary)',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {p.title}
          </button>
        ))}
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Total records',  value: meta.total,     color: 'var(--color-primary-600)', icon: <Users size={14} /> },
          { label: 'Accepted',       value: accepted,       color: '#059669', icon: <CheckCircle size={14} /> },
          { label: 'Disagreed',      value: disagreed,      color: '#dc2626', icon: <XCircle size={14} /> },
          { label: 'Flagged',        value: flaggedRows,    color: '#b45309', icon: <AlertTriangle size={14} /> },
        ].map(({ label, value, color, icon }) => (
          <div key={label} style={{ ...card, padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ color }}>{icon}</span>
              <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', margin: 0 }}>
                {label}
              </p>
            </div>
            <p style={{ fontSize: '1.4rem', fontWeight: 900, color, margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />

        <select
          value={filterResp}
          onChange={e => setFilterResp(e.target.value)}
          style={{ ...inputStyle, minWidth: 130 }}
          onFocus={inputFocus} onBlur={inputBlur}
        >
          <option value="">All responses</option>
          <option value="accepted">Accepted</option>
          <option value="disagreed">Disagreed</option>
        </select>

        <select
          value={filterCtx}
          onChange={e => setFilterCtx(e.target.value)}
          style={{ ...inputStyle, minWidth: 160 }}
          onFocus={inputFocus} onBlur={inputBlur}
        >
          <option value="">All contexts</option>
          {ACTION_CONTEXTS.map(c => (
            <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
          ))}
        </select>

        <select
          value={filterFlag}
          onChange={e => setFilterFlag(e.target.value)}
          style={{ ...inputStyle, minWidth: 120 }}
          onFocus={inputFocus} onBlur={inputBlur}
        >
          <option value="">All records</option>
          <option value="1">Flagged only</option>
          <option value="0">Not flagged</option>
        </select>

        {hasFilters && (
          <button
            onClick={clearFilters}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: '0.72rem', color: 'var(--text-tertiary)',
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <X size={12} /> Clear
          </button>
        )}

        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
          {meta.from}–{meta.to} of {meta.total}
        </span>
      </div>

      {/* Table */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'var(--surface-card, #fff)', borderBottom: '1px solid var(--line)' }}>
                {[
                  'Customer', 'Customer #', 'Response', 'Context',
                  'Version', 'Flagged', 'IP Address', 'Date', 'Snapshot',
                ].map((h, i) => (
                  <th key={h} style={{
                    padding: '10px 14px', textAlign: 'left',
                    fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.08em', color: 'var(--text-tertiary)', whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid color-mix(in srgb, var(--color-primary-500) 5%, transparent)' }}>
                      {[120, 80, 72, 110, 55, 50, 100, 110, 60].map((w, j) => (
                        <td key={j} style={{ padding: '12px 14px' }}>
                          <div style={{ height: 11, width: w, borderRadius: 6, background: 'var(--surface-card, #fff)' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : rows.length === 0
                  ? (
                    <tr>
                      <td colSpan={9} style={{ padding: '52px 24px', textAlign: 'center' }}>
                        <Users size={30} style={{ color: 'var(--text-tertiary)', marginBottom: 10, display: 'block', margin: '0 auto 10px' }} />
                        <p style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                          No acceptances found
                        </p>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', margin: 0 }}>
                          {hasFilters ? 'Try adjusting your filters.' : 'No records yet for this policy.'}
                        </p>
                      </td>
                    </tr>
                  )
                  : rows.map((row, i) => {
                      const name = row.customer
                        ? `${row.customer.first_name} ${row.customer.last_name}`
                        : '—';
                      const email = row.customer?.email ?? '';

                      return (
                        <tr
                          key={row.id}
                          style={{
                            borderBottom: i === rows.length - 1 ? 'none' : '1px solid color-mix(in srgb, var(--color-primary-500) 5%, transparent)',
                            transition: 'background 120ms',
                            background: row.flagged ? 'rgba(245,158,11,0.03)' : 'transparent',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = row.flagged ? 'rgba(245,158,11,0.06)' : 'color-mix(in srgb, var(--color-primary-500) 2%, transparent)'}
                          onMouseLeave={e => e.currentTarget.style.background = row.flagged ? 'rgba(245,158,11,0.03)' : 'transparent'}
                        >
                          {/* Customer name + email */}
                          <td style={{ padding: '11px 14px', minWidth: 160 }}>
                            <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.8rem' }}>{name}</p>
                            {email && <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>{email}</p>}
                          </td>

                          {/* Customer number */}
                          <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                            <code style={{
                              fontSize: '0.72rem', background: 'var(--surface-card, #fff)',
                              color: 'var(--color-primary-600)', padding: '2px 6px', borderRadius: 4,
                            }}>
                              {row.customer_number ?? '—'}
                            </code>
                          </td>

                          {/* Response */}
                          <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                            <ResponseBadge response={row.response} />
                          </td>

                          {/* Context */}
                          <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                            <ContextBadge context={row.action_context} />
                          </td>

                          {/* Version */}
                          <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                            <span style={{
                              fontSize: '0.72rem', fontWeight: 700,
                              padding: '2px 7px', borderRadius: 99,
                              background: 'var(--surface-card, #fff)', color: 'var(--color-primary-600)',
                            }}>
                              v{row.policy_version}
                            </span>
                          </td>

                          {/* Flagged */}
                          <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                            {row.flagged
                              ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', fontWeight: 700, color: '#b45309', background: 'rgba(245,158,11,0.12)', padding: '2px 8px', borderRadius: 99 }}>
                                  <Shield size={10} /> Flagged
                                </span>
                              )
                              : <span style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>—</span>
                            }
                          </td>

                          {/* IP */}
                          <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                              {row.ip_address ?? '—'}
                            </span>
                          </td>

                          {/* Date */}
                          <td style={{ padding: '11px 14px', whiteSpace: 'nowrap', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                            {row.accepted_at
                              ? format(new Date(row.accepted_at), 'dd MMM yyyy, HH:mm')
                              : '—'}
                          </td>

                          {/* Snapshot */}
                          <td style={{ padding: '11px 14px' }}>
                            {row.policy_snapshot
                              ? (
                                <button
                                  onClick={() => setSnapshot(row)}
                                  style={{
                                    fontSize: '0.7rem', fontWeight: 700,
                                    padding: '3px 10px', borderRadius: 6,
                                    border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)',
                                    background: 'var(--surface-card, #fff)',
                                    color: 'var(--color-primary-600)', cursor: 'pointer', fontFamily: 'inherit',
                                    whiteSpace: 'nowrap',
                                    transition: 'background 120ms',
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 5%, transparent)'}
                                >
                                  View
                                </button>
                              )
                              : <span style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>—</span>
                            }
                          </td>
                        </tr>
                      );
                    })
              }
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && rows.length > 0 && meta.last_page > 1 && (
          <div style={{
            padding: '10px 14px', borderTop: '1px solid var(--line)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--surface-card, #fff)',
          }}>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', margin: 0 }}>
              Page {meta.current_page} of {meta.last_page} · {meta.total} records
            </p>
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { icon: <ChevronLeft size={13} />,  p: meta.current_page - 1, disabled: meta.current_page <= 1 },
                { icon: <ChevronRight size={13} />, p: meta.current_page + 1, disabled: meta.current_page >= meta.last_page },
              ].map(({ icon, p, disabled }, i) => (
                <button
                  key={i}
                  onClick={() => !disabled && setPage(p)}
                  disabled={disabled}
                  style={{
                    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 7, border: '1.5px solid var(--line)', background: 'none',
                    color: 'var(--color-primary-500)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.3 : 1,
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Snapshot modal */}
      {snapshot && <SnapshotModal acceptance={snapshot} onClose={() => setSnapshot(null)} />}
    </div>
  );
}