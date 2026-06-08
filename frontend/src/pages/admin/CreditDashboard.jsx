import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  CreditCard, Search, ChevronLeft, Eye, AlertTriangle, Loader2
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import { adminCreditAPI } from '../../api/customerCredit'; // Adjust import to your API file placement

const cardStyle = {
  background: 'white',
  borderRadius: 12,
  border: '1px solid rgba(168,85,247,0.1)',
  boxShadow: '0 2px 12px rgba(168,85,247,0.06)',
};

const selectStyle = {
  padding: '7px 11px',
  borderRadius: 8,
  fontSize: '0.8rem',
  background: 'rgba(168,85,247,0.04)',
  border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#374151',
  outline: 'none',
  fontFamily: 'inherit',
  cursor: 'pointer',
};

const fmt = (n) => 
  Number(n ?? 0).toLocaleString('en-KE', { 
    style: 'currency', 
    currency: 'KES', 
    minimumFractionDigits: 0 
  });

export default function CreditDashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  
  // State variables for robust filtering
  const [search, setSearch] = useState('');
  const [hasCreditAccount, setHasCreditAccount] = useState('true'); // Default to active credit lines
  const [isOverdue, setIsOverdue] = useState('');
  const [sortBy, setSortBy] = useState('credit_used');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch unified top aggregations
      const summaryData = await adminCreditAPI.getGlobalSummary();
      setSummary(summaryData);

      // 2. Fetch customers breakdown matrix
      const params = {
        page,
        search,
        has_credit_account: hasCreditAccount,
        is_overdue: isOverdue,
        sort_by: sortBy,
        sort_dir: sortDir
      };
      const customerGrid = await adminCreditAPI.getGlobalCustomers(params);
      setCustomers(customerGrid.data ?? []);
      setMeta({ 
        current_page: customerGrid.current_page, 
        last_page: customerGrid.last_page, 
        total: customerGrid.total 
      });
    } catch (err) {
      console.error("Failed fetching unified credit reports", err);
    } finally {
      setLoading(false);
    }
  }, [page, search, hasCreditAccount, isOverdue, sortBy, sortDir]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
    setPage(1);
  };

  return (
    <AdminLayout>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        
        {/* ── Breadcrumbs ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
          <Link to="/admin/customers" style={{ color: '#9ca3af', textDecoration: 'none', transition: 'color 120ms' }} onMouseEnter={e => e.currentTarget.style.color = '#7c3aed'} onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}>Customers</Link>
          <span style={{ color: '#d1d5db' }}>/</span>
          <span style={{ color: '#a855f7', fontWeight: 600 }}>Credit Ledger Overview</span>
        </div>

        {/* ── Header ── */}
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.02em', margin: 0 }}>
            Unified Credit Registry
          </h1>
          <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: '2px 0 0' }}>
            Monitor financial risk metrics, exposure limits, and account aging records globally.
          </p>
        </div>

        {/* ── Global Summary Aggregation Cards ── */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            <div style={{ ...cardStyle, padding: '20px' }}>
              <p style={{ fontSize: '0.68rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', margin: '0 0 4px' }}>Total Issued Allocation</p>
              <p style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827', margin: 0 }}>{fmt(summary.total_issued_credit)}</p>
            </div>
            <div style={{ ...cardStyle, padding: '20px' }}>
              <p style={{ fontSize: '0.68rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', margin: '0 0 4px' }}>Outstanding Book Exposure</p>
              <p style={{ fontSize: '1.4rem', fontWeight: 800, color: '#7c3aed', margin: 0 }}>{fmt(summary.total_used_credit)}</p>
              <div style={{ width: '100%', background: 'rgba(168,85,247,0.1)', height: 5, borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
                <div style={{ width: `${summary.utilization_pct}%`, background: '#7c3aed', height: '100%' }} />
              </div>
            </div>
            <div style={{ ...cardStyle, padding: '20px' }}>
              <p style={{ fontSize: '0.68rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', margin: '0 0 4px' }}>Net Capital Buffer Available</p>
              <p style={{ fontSize: '1.4rem', fontWeight: 800, color: '#059669', margin: 0 }}>{fmt(summary.total_available_credit)}</p>
            </div>
            <div style={{ ...cardStyle, padding: '20px', borderLeft: summary.overdue_accounts_count > 0 ? '3px solid #ef4444' : '1px solid rgba(168,85,247,0.1)' }}>
              <p style={{ fontSize: '0.68rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', margin: '0 0 4px' }}>Accounts In Arrears</p>
              <p style={{ fontSize: '1.4rem', fontWeight: 800, color: summary.overdue_accounts_count > 0 ? '#ef4444' : '#111827', margin: 0 }}>
                {summary.overdue_accounts_count} <span style={{ fontSize: '0.8rem', fontWeight: 400, color: '#9ca3af' }}>accounts</span>
              </p>
            </div>
          </div>
        )}

        {/* ── Filters Toolbar ── */}
        <div style={{ ...cardStyle, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#c4b5fd' }} />
            <input
              type="text" 
              placeholder="Search accounts by name, number or email..." 
              value={search} 
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              style={{ width: '100%', padding: '7px 12px 7px 32px', borderRadius: 8, fontSize: '0.82rem', background: 'rgba(168,85,247,0.04)', border: '1.5px solid rgba(168,85,247,0.18)', color: '#111827', outline: 'none' }}
            />
          </div>
          <select value={hasCreditAccount} onChange={e => { setHasCreditAccount(e.target.value); setPage(1); }} style={selectStyle}>
            <option value="true">Active Credit Facilities</option>
            <option value="false">No Credit Account Attached</option>
            <option value="">All Customers</option>
          </select>
          <select value={isOverdue} onChange={e => { setIsOverdue(e.target.value); setPage(1); }} style={selectStyle}>
            <option value="">All Payment Conditions</option>
            <option value="true">Delinquent / Overdue Only</option>
          </select>
        </div>

        {/* ── Accounts Table Grid ── */}
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(168,85,247,0.1)', background: 'rgba(168,85,247,0.02)' }}>
                <th style={{ padding: '12px 20px', color: '#9ca3af', fontWeight: 700 }}>CUSTOMER</th>
                <th style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: 700 }}>STATUS</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>
                  <button onClick={() => handleSort('credit_limit')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit', fontWeight: 700, color: sortBy === 'credit_limit' ? '#7c3aed' : '#9ca3af' }}>LIMIT {sortBy === 'credit_limit' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</button>
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>
                  <button onClick={() => handleSort('credit_used')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit', fontWeight: 700, color: sortBy === 'credit_used' ? '#7c3aed' : '#9ca3af' }}>USED BALANCE {sortBy === 'credit_used' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</button>
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'right', color: '#9ca3af', fontWeight: 700 }}>AVAILABLE HEADROOM</th>
                <th style={{ padding: '12px 16px', width: 50 }} />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Re-indexing credit records...</td></tr>
              ) : customers.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>No matching accounts found.</td></tr>
              ) : customers.map(c => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/admin/credit/customers/${c.id}`)}
                  style={{ borderBottom: '1px solid rgba(168,85,247,0.05)', cursor: 'pointer', transition: 'background 150ms' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{c.name || c.full_name}</div>
                    <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{c.customer_number || `#${c.id}`} · {c.email}</div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    {!c.has_credit_account ? (
                      <span style={{ padding: '3px 8px', borderRadius: 12, fontSize: '0.68rem', fontWeight: 600, background: '#f3f4f6', color: '#6b7280' }}>No Facility</span>
                    ) : c.is_overdue ? (
                      <span style={{ padding: '3px 8px', borderRadius: 12, fontSize: '0.68rem', fontWeight: 600, background: 'rgba(239,68,68,0.1)', color: '#b91c1c', display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={11}/> Overdue</span>
                    ) : (
                      <span style={{ padding: '3px 8px', borderRadius: 12, fontSize: '0.68rem', fontWeight: 600, background: 'rgba(16,185,129,0.1)', color: '#047857' }}>Good Standing</span>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700 }}>{c.has_credit_account ? fmt(c.credit_limit) : '—'}</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, color: Number(c.credit_used) > 0 ? '#7c3aed' : '#111827' }}>{c.has_credit_account ? fmt(c.credit_used) : '—'}</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>{c.has_credit_account ? fmt(c.credit_available) : '—'}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <button style={{ background: 'none', border: 'none', color: '#c4b5fd' }}><Eye size={14}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {meta.last_page > 1 && (
            <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(168,85,247,0.08)', background: 'rgba(168,85,247,0.01)' }}>
              <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Showing Page {meta.current_page} of {meta.last_page}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(168,85,247,0.2)', cursor: page === 1 ? 'not-allowed' : 'pointer' }}><ChevronLeft size={14}/></button>
                <button disabled={page === meta.last_page} onClick={() => setPage(p => p + 1)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(168,85,247,0.2)', cursor: page === meta.last_page ? 'not-allowed' : 'pointer' }}>Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}