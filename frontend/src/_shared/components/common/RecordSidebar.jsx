import { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import customersAPI from '../../api/customers';
import employeesAPI from '../../api/employees';
import usersAPI from '../../api/users';
import loyaltyAPI from '../../api/loyalty';
import promoCodesAPI from '../../api/promoCodes';
import referralsAPI from '../../api/referrals';

const KINDS = {
  customers: {
    path: '/admin/customers',
    load: (search) => customersAPI.getAllCustomers({ per_page: 40, sort_by: 'first_name', sort_order: 'asc', ...(search && { search }) }).then((d) => d.data ?? []),
    map: (c) => ({ id: c.id, name: c.full_name, sub: c.customer_number || c.email, status: c.status }),
  },
  users: {
    path: '/admin/users',
    load: (search) => usersAPI.getUsers({ tab: 'all', per_page: 40, sort_by: 'name', sort_order: 'asc', ...(search && { search }) }).then((d) => d.data ?? []),
    map: (u) => ({ id: u.id, name: u.name, sub: u.role_name || u.role, status: u.status }),
  },
  employees: {
    path: '/admin/employees',
    load: (search) => employeesAPI.getEmployees({ per_page: 40, ...(search && { search }) }).then((d) => d.data ?? []),
    map: (e) => ({ id: e.id, name: e.full_name, sub: e.job_title || e.employee_number, status: e.status }),
  },
  loyalty: {
    path: '/admin/loyalty',
    load: (search) => loyaltyAPI.index({ per_page: 40, sort: 'loyalty_points', dir: 'desc', ...(search && { search }) }).then((d) => d.data ?? []),
    map: (c) => ({ id: c.id, name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(), sub: `${Number(c.loyalty_points ?? 0).toLocaleString()} pts` }),
  },
  promos: {
    path: '/admin/promo-codes',
    load: (search) => promoCodesAPI.getAll({ per_page: 40, ...(search && { search }) }).then((d) => d.data ?? []),
    map: (c) => ({ id: c.id, name: c.name, sub: c.code, status: c.status }),
  },
  referrals: {
    path: '/admin/referrals',
    load: (search) => referralsAPI.getAll({ per_page: 40, ...(search && { search }) }).then((d) => d.data ?? []),
    map: (c) => ({ id: c.id, name: c.name, sub: c.code, status: c.status }),
  },
};

// the same colours as the status badges on each page
const DOTS = {
  employees: { active: '#10b981', on_leave: '#f59e0b', probation: '#6366f1', suspended: '#ef4444', terminated: '#9ca3af' },
  customers: { active: '#10b981', inactive: '#9ca3af', suspended: '#f59e0b', blacklisted: '#ef4444' },
  promos: { draft: '#9ca3af', active: '#10b981', paused: '#f59e0b', expired: '#ef4444', depleted: 'var(--color-primary-500)', archived: '#d1d5db' },
  referrals: { draft: '#9ca3af', active: '#10b981', paused: '#f59e0b', expired: '#ef4444', depleted: 'var(--color-primary-500)', archived: '#d1d5db' },
  users: { active: '#10b981', inactive: '#9ca3af', suspended: '#ef4444', pending_verification: '#f59e0b' },
};

/**
 * Wraps a detail page with a short list of the other customers (or employees) beside it, so staff move between records without going back.
 * The list is hidden on a narrow screen, where the page's own back button does the job. Clicking a record keeps the tab you were on.
 */
export default function RecordSidebar({ kind, param = 'id', children }) {
  const cfg = KINDS[kind];
  const id = useParams()[param];
  const navigate = useNavigate();
  const { search: qs } = useLocation();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1180px)').matches);

  useEffect(() => {
    const m = window.matchMedia('(min-width: 1180px)');
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);

  const [stamp, setStamp] = useState(0);   // bumps when a detail page says a record changed
  useEffect(() => {
    const on = () => setStamp((n) => n + 1);
    window.addEventListener('records:changed', on);
    return () => window.removeEventListener('records:changed', on);
  }, []);

  useEffect(() => {
    if (!wide) return undefined;
    const t = setTimeout(() => cfg.load(q).then((r) => setRows(r.map(cfg.map))).catch(() => setRows([])), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [cfg, q, wide, stamp]);

  if (!wide) return children;
  const tab = new URLSearchParams(qs).get('tab');

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <aside aria-label={`Other ${kind}`} style={{ width: 260, flex: 'none', position: 'sticky', top: 0, alignSelf: 'flex-start', height: '100vh', boxSizing: 'border-box', padding: '28px 0 16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${kind}`} aria-label={`Search ${kind}`}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)', fontSize: '0.8rem', fontFamily: 'inherit', background: 'transparent', color: 'var(--text-primary)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {rows.map((r) => {
            const on = String(r.id) === String(id);
            return (
              <button key={r.id} type="button" aria-current={on ? 'true' : undefined} onClick={() => navigate(`${cfg.path}/${r.id}${tab ? `?tab=${tab}` : ''}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', width: '100%', padding: '9px 11px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-primary)',
                  background: on ? 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)' : 'transparent', border: `1px solid ${on ? 'color-mix(in srgb, var(--color-primary-500) 30%, transparent)' : 'transparent'}` }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: DOTS[kind]?.[r.status] ?? '#9ca3af' }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || 'Unnamed'}</span>
                  <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
