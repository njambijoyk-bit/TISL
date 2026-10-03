import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Search, Filter, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  UserPlus, Building2, Phone, Mail, MoreHorizontal, Gift, History,
  Calendar, Users, TrendingUp, Award, AlertCircle, Clock,
  Trash2, Edit3, Eye, RotateCcw, X, ShieldAlert, CheckCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import employeesApi from '../../../../_shared/api/employees';
import useAuthStore from '../../../../_shared/store/authStore';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_META = {
  active:     { bg: 'rgba(16,185,129,0.1)',  color: '#065f46', dot: '#10b981', ring: 'rgba(16,185,129,0.25)',  label: 'Active'     },
  on_leave:   { bg: 'rgba(245,158,11,0.1)',  color: '#b45309', dot: '#f59e0b', ring: 'rgba(245,158,11,0.25)',  label: 'On Leave'   },
  probation:  { bg: 'rgba(99,102,241,0.1)',  color: '#3730a3', dot: '#6366f1', ring: 'rgba(99,102,241,0.25)',  label: 'Probation'  },
  suspended:  { bg: 'rgba(239,68,68,0.1)',   color: '#b91c1c', dot: '#ef4444', ring: 'rgba(239,68,68,0.25)',   label: 'Suspended'  },
  terminated: { bg: 'rgba(107,114,128,0.1)', color: 'var(--text-secondary)', dot: '#9ca3af', ring: 'rgba(107,114,128,0.2)',  label: 'Terminated' },
};

const STAT_META = [
  { key: 'total_employees', label: 'Total',      icon: Users,        accent: '#2563eb', bg: 'rgba(37,99,235,0.08)'   },
  { key: 'active',          label: 'Active',     icon: TrendingUp,   accent: '#059669', bg: 'rgba(5,150,105,0.08)'   },
  { key: 'on_leave',        label: 'On Leave',   icon: Calendar,     accent: '#d97706', bg: 'rgba(217,119,6,0.08)'   },
  { key: 'probation',       label: 'Probation',  icon: Award,        accent: 'var(--color-primary-600)', bg: 'color-mix(in srgb, var(--color-primary-600) 8%, transparent)'  },
  { key: 'terminated',      label: 'Terminated', icon: AlertCircle,  accent: '#6b7280', bg: 'rgba(107,114,128,0.08)' },
];

const EMPLOYMENT_TYPE_LABELS = {
  full_time: 'Full Time', part_time: 'Part Time', contract: 'Contract', intern: 'Intern',
};

// ── Shared styles ──────────────────────────────────────────────────────────────

const card = {
  background: 'var(--surface-card, #fff)',
  borderRadius: 12,
  border: '1px solid var(--line)',
  boxShadow: '0 2px 12px color-mix(in srgb, var(--color-primary-500) 6%, transparent)',
};

const selectStyle = {
  padding: '7px 11px', borderRadius: 8, fontSize: '0.8rem',
  background: 'var(--surface-card, #fff)',
  border: '1.5px solid var(--line)',
  color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit',
  cursor: 'pointer', transition: 'border-color 150ms, box-shadow 150ms',
};
const sFocus = e => { e.currentTarget.style.borderColor = 'var(--color-primary-500)'; e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--color-primary-500) 10%, transparent)'; };
const sBlur  = e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.boxShadow = 'none'; };

const TH = ({ children, sortable, onClick }) => (
  <th
    onClick={onClick}
    style={{
      padding: '10px 16px', textAlign: 'left',
      cursor: sortable ? 'pointer' : 'default',
      userSelect: 'none',
    }}
  >
    <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)' }}>
      {children}
    </span>
  </th>
);

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, accent, bg }) {
  return (
    <div style={{ ...card, padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg, color: accent }}>
        <Icon size={18} />
      </div>
      <div>
        <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>{label}</p>
        <p style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-primary-500)', lineHeight: 1.1, margin: 0, letterSpacing: '-0.02em' }}>{value ?? 0}</p>
      </div>
    </div>
  );
}

function Badge({ status }) {
  const s = STATUS_META[status] || STATUS_META.active;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700,
      background: s.bg, color: s.color, boxShadow: `0 0 0 1px ${s.ring}`, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr style={{ borderBottom: '1px solid color-mix(in srgb, var(--color-primary-500) 5%, transparent)' }}>
      {[220, 160, 120, 80, 100, 60].map((w, i) => (
        <td key={i} style={{ padding: '14px 16px' }}>
          <div style={{ width: w, height: 10, borderRadius: 6, background: 'var(--surface-input)' }} />
        </td>
      ))}
    </tr>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function EmployeeList() {
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const isAdminOrSuper = ['admin', 'super_admin'].includes(user?.role);
  const [employees, setEmployees]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [filters, setFilters]       = useState({ search: '', status: '', department: '', employment_type: '' });
  const [departments, setDepartments] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy]         = useState('created_at');
  const [sortOrder, setSortOrder]   = useState('desc');

  // Leave logs modal
  const [showLeaveLogsModal, setShowLeaveLogsModal]   = useState(false);
  const [leaveLogs, setLeaveLogs]                     = useState([]);
  const [leaveLogsLoading, setLeaveLogsLoading]       = useState(false);
  const [leaveLogsFilter, setLeaveLogsFilter]         = useState('');
  const [leaveLogsPagination, setLeaveLogsPagination] = useState({ current_page: 1, last_page: 1, total: 0 });

  // Birthdays modal
  const [showBirthdaysModal, setShowBirthdaysModal]   = useState(false);
  const [birthdayDays, setBirthdayDays]               = useState(30);
  const [birthdays, setBirthdays]                     = useState([]);
  const [birthdaysLoading, setBirthdaysLoading]       = useState(false);

  // Trash modal
  const [showTrashModal, setShowTrashModal]     = useState(false);
  const [trashedEmployees, setTrashedEmployees] = useState([]);
  const [trashLoading, setTrashLoading]         = useState(false);
  const [trashActionId, setTrashActionId]       = useState(null);
  const [confirmModal, setConfirmModal]         = useState(null);

  // ── Fetchers ────────────────────────────────────────────────────────────────

  const fetchEmployees = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v != null));
      const data = await employeesApi.getEmployees({ page, per_page: 20, sort_by: sortBy, sort_order: sortOrder, ...clean });
      setEmployees(data.data || []);
      setPagination({ current_page: data.current_page || 1, last_page: data.last_page || 1, total: data.total || 0 });
    } catch { toast.error('Failed to load employees'); setEmployees([]); }
    finally { setLoading(false); }
  }, [filters, sortBy, sortOrder]);

  const fetchDepartments = useCallback(async () => {
    try { const data = await employeesApi.getDepartments(); setDepartments(data.data || []); } catch { setDepartments([]); }
  }, []);

  const fetchStatistics = useCallback(async () => {
    try { const data = await employeesApi.getStatistics(); setStatistics(data); } catch { setStatistics(null); }
  }, []);

  const fetchTrashed = async () => {
    setTrashLoading(true);
    try { const data = await employeesApi.getEmployees({ trashed: 'only', per_page: 100 }); setTrashedEmployees(data.data || []); }
    catch { toast.error('Failed to load deleted employees'); setTrashedEmployees([]); }
    finally { setTrashLoading(false); }
  };

  const fetchLeaveLogs = async (page = 1) => {
    setLeaveLogsLoading(true);
    try {
      const data = await employeesApi.getAllLeaveLogs({ per_page: 15, page });
      setLeaveLogs(data.data || []);
      setLeaveLogsPagination({
        current_page: data.current_page || 1,
        last_page: data.last_page || 1,
        total: data.total || 0,
      });
    } catch { toast.error('Failed to load leave logs'); setLeaveLogs([]); }
    finally { setLeaveLogsLoading(false); }
  };

  const fetchBirthdays = async (days = 30) => {
    setBirthdaysLoading(true);
    try {
      const data = await employeesApi.getUpcomingBirthdays(days);
      setBirthdays(data.data || []);
    } catch { toast.error('Failed to load upcoming birthdays'); setBirthdays([]); }
    finally { setBirthdaysLoading(false); }
  };

  useEffect(() => { fetchEmployees(); fetchDepartments(); fetchStatistics(); }, [fetchEmployees, fetchDepartments, fetchStatistics]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleSort = (col) => {
    if (sortBy === col) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortOrder('asc'); }
  };

  const handleSoftDelete = async (id) => {
    if (!confirm('Move this employee to trash?')) return;
    try { await employeesApi.deleteEmployee(id); toast.success('Moved to trash'); fetchEmployees(); fetchStatistics(); }
    catch { toast.error('Failed to delete employee'); }
  };

  const handleRestore = async (employee) => {
    setTrashActionId(employee.id);
    try {
      await employeesApi.restoreEmployee(employee.id);
      toast.success(`${employee.full_name} restored`);
      setTrashedEmployees(p => p.filter(e => e.id !== employee.id));
      fetchEmployees(); fetchStatistics();
    } catch { toast.error('Failed to restore'); }
    finally { setTrashActionId(null); setConfirmModal(null); }
  };

  const handleForceDelete = async (employee) => {
    setTrashActionId(employee.id);
    try {
      await employeesApi.forceDeleteEmployee(employee.id);
      toast.success(`${employee.full_name} permanently deleted`);
      setTrashedEmployees(p => p.filter(e => e.id !== employee.id));
      fetchStatistics();
    } catch { toast.error('Failed to permanently delete'); }
    finally { setTrashActionId(null); setConfirmModal(null); }
  };

  const hasFilters = filters.search || filters.status || filters.department || filters.employment_type;
  const SortArrow = ({ col }) => (
    <span style={{ marginLeft: 3, color: sortBy === col ? 'var(--color-primary-500)' : 'var(--text-tertiary)' }}>
      {sortBy === col && sortOrder === 'asc' ? <ChevronUp size={12} style={{ display: 'inline' }} /> : <ChevronDown size={12} style={{ display: 'inline' }} />}
    </span>
  );

  return (
    <AdminLayout>
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-primary-500)', letterSpacing: '-0.02em', margin: '0 0 2px' }}>Employees</h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', margin: 0 }}>
            {statistics?.total_employees?.toLocaleString() ?? 0} total employees
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setShowFilters(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 14px', borderRadius: 9, fontSize: '0.8rem', fontWeight: 600,
              fontFamily: 'inherit', cursor: 'pointer',
              background: showFilters || hasFilters ? 'color-mix(in srgb, var(--color-primary-500) 8%, transparent)' : 'transparent',
              border: `1.5px solid ${showFilters || hasFilters ? 'color-mix(in srgb, var(--color-primary-500) 35%, transparent)' : 'color-mix(in srgb, var(--color-primary-500) 20%, transparent)'}`,
              color: showFilters || hasFilters ? 'var(--color-primary-600)' : 'var(--text-tertiary)',
              transition: 'all 150ms',
            }}
          >
            <Filter size={14} /> Filters
          </button>

          {/* ── Admin-only buttons ── */}
          {isAdminOrSuper && (
            <>
              <button
                onClick={() => { setShowLeaveLogsModal(true); fetchLeaveLogs(1); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 14px', borderRadius: 9, fontSize: '0.8rem', fontWeight: 600,
                  fontFamily: 'inherit', cursor: 'pointer',
                  background: 'rgba(37,99,235,0.06)', border: '1.5px solid rgba(37,99,235,0.2)', color: '#1d4ed8',
                  transition: 'all 150ms',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(37,99,235,0.11)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(37,99,235,0.06)'}
              >
                <History size={14} /> Leave Logs
              </button>
              <button
                onClick={() => { setShowBirthdaysModal(true); fetchBirthdays(30); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 14px', borderRadius: 9, fontSize: '0.8rem', fontWeight: 600,
                  fontFamily: 'inherit', cursor: 'pointer',
                  background: 'rgba(217,119,6,0.06)', border: '1.5px solid rgba(217,119,6,0.2)', color: '#b45309',
                  transition: 'all 150ms',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(217,119,6,0.11)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(217,119,6,0.06)'}
              >
                <Gift size={14} /> Birthdays
              </button>
            </>
          )}

          <button
            onClick={() => { setShowTrashModal(true); fetchTrashed(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 14px', borderRadius: 9, fontSize: '0.8rem', fontWeight: 600,
              fontFamily: 'inherit', cursor: 'pointer',
              background: 'rgba(239,68,68,0.06)', border: '1.5px solid rgba(239,68,68,0.2)', color: '#b91c1c',
              transition: 'all 150ms',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.06)'}
          >
            <Trash2 size={14} /> Trash
          </button>
          <button
            onClick={() => navigate('/admin/employees/create')}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', color: 'white',
              boxShadow: '0 4px 14px color-mix(in srgb, var(--color-primary-500) 35%, transparent)', transition: 'box-shadow 150ms',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 20px color-mix(in srgb, var(--color-primary-500) 50%, transparent)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 14px color-mix(in srgb, var(--color-primary-500) 35%, transparent)'}
          >
            <UserPlus size={15} /> Add Employee
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      {statistics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
          {STAT_META.map(({ key, label, icon, accent, bg }) => (
            <StatCard key={key} label={label} value={statistics[key]?.toLocaleString()} icon={icon} accent={accent} bg={bg} />
          ))}
        </div>
      )}

      {/* ── Search + filter panel ── */}
      <div style={{ borderRadius: 12, border: '1px solid var(--line)' }}>
        {/* Search row */}
        <div style={{ padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} size={14} />
            <input
              type="text"
              placeholder="Search by name, email, employee number…"
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              onKeyPress={e => e.key === 'Enter' && fetchEmployees(1)}
              style={{
                width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8, fontSize: '0.82rem',
                background: 'var(--surface-card, #fff)', border: '1.5px solid var(--line)',
                color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                transition: 'border-color 150ms, box-shadow 150ms',
              }}
              onFocus={sFocus} onBlur={sBlur}
            />
          </div>
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div style={{ padding: '12px 16px 14px', borderTop: '1px solid var(--line)', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} style={selectStyle} onFocus={sFocus} onBlur={sBlur}>
              <option value="">All statuses</option>
              {Object.entries(STATUS_META).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
            </select>
            <select value={filters.department} onChange={e => setFilters(f => ({ ...f, department: e.target.value }))} style={selectStyle} onFocus={sFocus} onBlur={sBlur}>
              <option value="">All departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={filters.employment_type} onChange={e => setFilters(f => ({ ...f, employment_type: e.target.value }))} style={selectStyle} onFocus={sFocus} onBlur={sBlur}>
              <option value="">All types</option>
              {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button
              onClick={() => fetchEmployees(1)}
              style={{ padding: '7px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', color: 'white', border: 'none' }}
            >
              Apply
            </button>
            {hasFilters && (
              <button
                onClick={() => { setFilters({ search: '', status: '', department: '', employment_type: '' }); setTimeout(() => fetchEmployees(1), 0); }}
                style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '0 4px', transition: 'color 150ms' }}
                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                onMouseLeave={e => e.currentTarget.style.color = '#c4b5fd'}
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--surface-card, #fff)' }}>
                <TH sortable onClick={() => handleSort('employee_number')}>
                  Employee <SortArrow col="employee_number" />
                </TH>
                <TH>Contact</TH>
                <TH sortable onClick={() => handleSort('department')}>
                  Department <SortArrow col="department" />
                </TH>
                <TH sortable onClick={() => handleSort('status')}>
                  Status <SortArrow col="status" />
                </TH>
                <TH>Manager</TH>
                <TH sortable onClick={() => handleSort('hire_date')}>
                  Hired <SortArrow col="hire_date" />
                </TH>
                <th style={{ padding: '10px 16px', width: 44 }} />
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                : employees.length === 0
                  ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '64px 24px', textAlign: 'center' }}>
                        <Users size={36} style={{ color: 'color-mix(in srgb, var(--color-primary-500) 15%, transparent)', margin: '0 auto 12px', display: 'block' }} />
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', margin: '0 0 8px' }}>
                          {hasFilters ? 'No employees match your filters' : 'No employees found'}
                        </p>
                        {hasFilters && (
                          <button
                            onClick={() => { setFilters({ search: '', status: '', department: '', employment_type: '' }); setTimeout(() => fetchEmployees(1), 0); }}
                            style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-primary-500)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            Clear filters
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                  : employees.map((emp, i) => (
                    <tr
                      key={emp.id}
                      style={{ borderBottom: i === employees.length - 1 ? 'none' : '1px solid color-mix(in srgb, var(--color-primary-500) 5%, transparent)', transition: 'background 120ms' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 3%, transparent)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* Employee */}
                      <td style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => navigate(`/admin/employees/${emp.id}`)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'linear-gradient(135deg,color-mix(in srgb, var(--color-primary-500) 15%, transparent),color-mix(in srgb, var(--color-primary-600) 20%, transparent))',
                            color: 'var(--color-primary-600)', fontSize: '0.85rem', fontWeight: 800,
                            boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-primary-500) 20%, transparent)',
                          }}>
                            {emp.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {emp.full_name || 'Unknown'}
                            </p>
                            <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', margin: '0 0 1px' }}>
                              {emp.employee_number || 'N/A'}{emp.employee_id && ` · ${emp.employee_id}`}
                            </p>
                            <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', margin: 0 }}>{emp.job_title || '—'}</p>
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                          <Mail size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                            {emp.user?.email || '—'}
                          </span>
                        </div>
                        {emp.work_phone && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Phone size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{emp.work_phone}</span>
                          </div>
                        )}
                      </td>

                      {/* Department */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Building2 size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>{emp.department || '—'}</span>
                        </div>
                        <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', margin: '2px 0 0 17px' }}>
                          {EMPLOYMENT_TYPE_LABELS[emp.employment_type] || '—'}
                        </p>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '12px 16px' }}>
                        <Badge status={emp.status} />
                      </td>

                      {/* Manager */}
                      <td style={{ padding: '12px 16px' }}>
                        {emp.manager?.user ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: 'var(--surface-card, #fff)', color: 'var(--color-primary-600)', fontSize: '0.72rem', fontWeight: 700,
                              boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-primary-500) 15%, transparent)',
                            }}>
                              {emp.manager.user.name?.[0] || '?'}
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)' }}>{emp.manager.user.name}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>—</span>
                        )}
                      </td>

                      {/* Hire date */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: '0.75rem', color: emp.hire_date ? '#374151' : 'var(--text-tertiary)' }}>
                          {emp.hire_date ? new Date(emp.hire_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </span>
                        {emp.tenure_years && (
                          <p style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', margin: '1px 0 0' }}>{emp.tenure_years}y tenure</p>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                        <RowActions empId={emp.id} onDelete={() => handleSoftDelete(emp.id)} navigate={navigate} />
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && employees.length > 0 && pagination.last_page > 1 && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-card, #fff)' }}>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', margin: 0 }}>
              Page {pagination.current_page} of {pagination.last_page} — {pagination.total?.toLocaleString()} employees
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <PaginationBtn onClick={() => fetchEmployees(pagination.current_page - 1)} disabled={pagination.current_page <= 1}><ChevronLeft size={14} /></PaginationBtn>
              {Array.from({ length: Math.min(5, pagination.last_page) }, (_, i) => {
                const p = pagination.current_page <= 3 ? i + 1 : pagination.current_page >= pagination.last_page - 2 ? pagination.last_page - 4 + i : pagination.current_page - 2 + i;
                if (p < 1 || p > pagination.last_page) return null;
                const active = p === pagination.current_page;
                return (
                  <button key={p} onClick={() => fetchEmployees(p)} style={{
                    width: 30, height: 30, borderRadius: 8, fontSize: '0.75rem', fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 150ms',
                    background: active ? 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))' : 'none',
                    border: active ? 'none' : '1.5px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)',
                    color: active ? 'white' : 'var(--text-tertiary)',
                    boxShadow: active ? '0 2px 8px color-mix(in srgb, var(--color-primary-500) 30%, transparent)' : 'none',
                  }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)'; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'none'; }}
                  >{p}</button>
                );
              })}
              <PaginationBtn onClick={() => fetchEmployees(pagination.current_page + 1)} disabled={pagination.current_page >= pagination.last_page}><ChevronRight size={14} /></PaginationBtn>
            </div>
          </div>
        )}
      </div>

      {/* ── Trash Modal ── */}
      {showTrashModal && (
        <Modal onClose={() => setShowTrashModal(false)} title="Deleted Employees" subtitle="Restore or permanently remove records" icon={<Trash2 size={18} style={{ color: '#b91c1c' }} />} iconBg="rgba(239,68,68,0.1)">
          {trashLoading ? (
            <div style={{ padding: '48px 0', textAlign: 'center' }}>
              <div style={{ width: 32, height: 32, border: '3px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', borderTopColor: 'var(--color-primary-500)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>Loading…</p>
            </div>
          ) : trashedEmployees.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center' }}>
              <Trash2 size={32} style={{ color: 'color-mix(in srgb, var(--color-primary-500) 15%, transparent)', margin: '0 auto 12px', display: 'block' }} />
              <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', margin: 0 }}>Trash is empty</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {trashedEmployees.map(emp => (
                <div key={emp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--line)', transition: 'border-color 150ms' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 25%, transparent)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(107,114,128,0.1)', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 800 }}>
                      {emp.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.full_name || 'Unknown'}</p>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', margin: 0 }}>
                        {emp.job_title || '—'}{emp.department && ` · ${emp.department}`}
                      </p>
                      <p style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', margin: '1px 0 0' }}>
                        Deleted {emp.deleted_at ? new Date(emp.deleted_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <ActionBtn color="#059669" bg="rgba(5,150,105,0.08)" hoverBg="rgba(5,150,105,0.15)" onClick={() => setConfirmModal({ type: 'restore', employee: emp })} disabled={trashActionId === emp.id}>
                      <RotateCcw size={12} /> Restore
                    </ActionBtn>
                    <ActionBtn color="#b91c1c" bg="rgba(239,68,68,0.07)" hoverBg="rgba(239,68,68,0.13)" onClick={() => setConfirmModal({ type: 'force_delete', employee: emp })} disabled={trashActionId === emp.id}>
                      <ShieldAlert size={12} /> Delete Forever
                    </ActionBtn>
                  </div>
                </div>
              ))}
              <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 8 }}>
                {trashedEmployees.length} deleted — permanently deleted records cannot be recovered
              </p>
            </div>
          )}
        </Modal>
      )}

      {/* ── Confirm Modal ── */}
      {confirmModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.55)' }}>
          <div style={{ ...card, width: '100%', maxWidth: 380, padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: confirmModal.type === 'restore' ? 'rgba(5,150,105,0.1)' : 'rgba(239,68,68,0.1)' }}>
                {confirmModal.type === 'restore' ? <RotateCcw size={20} style={{ color: '#059669' }} /> : <ShieldAlert size={20} style={{ color: '#b91c1c' }} />}
              </div>
              <div>
                <p style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>
                  {confirmModal.type === 'restore' ? 'Restore Employee' : 'Permanently Delete'}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', margin: 0 }}>
                  {confirmModal.type === 'restore' ? 'This will reactivate the employee record.' : 'This action cannot be undone.'}
                </p>
              </div>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', margin: 0 }}>
              {confirmModal.type === 'restore'
                ? <>Are you sure you want to restore <strong>{confirmModal.employee.full_name}</strong>?</>
                : <>Permanently delete <strong>{confirmModal.employee.full_name}</strong>? All data will be lost forever.</>
              }
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmModal(null)} style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: '1.5px solid var(--line)', background: 'none', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button
                onClick={() => confirmModal.type === 'restore' ? handleRestore(confirmModal.employee) : handleForceDelete(confirmModal.employee)}
                disabled={trashActionId === confirmModal.employee.id}
                style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: trashActionId === confirmModal.employee.id ? 0.6 : 1, background: confirmModal.type === 'restore' ? '#059669' : '#dc2626', color: 'white' }}
              >
                {trashActionId === confirmModal.employee.id ? (confirmModal.type === 'restore' ? 'Restoring…' : 'Deleting…') : (confirmModal.type === 'restore' ? 'Yes, Restore' : 'Yes, Delete Forever')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Leave Logs Modal ── */}
      {showLeaveLogsModal && (
        <Modal
          onClose={() => { setShowLeaveLogsModal(false); setLeaveLogsFilter(''); setLeaveLogsPagination({ current_page: 1, last_page: 1, total: 0 }); }}
          title="Leave Log History"
          subtitle="All add / use leave activity across employees"
          icon={<History size={18} style={{ color: '#1d4ed8' }} />}
          iconBg="rgba(37,99,235,0.1)"
        >
          {/* Filter toggle */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {['', 'add', 'use'].map(v => (
              <button
                key={v}
                onClick={() => setLeaveLogsFilter(v)}
                style={{
                  padding: '5px 12px', borderRadius: 7, fontSize: '0.73rem', fontWeight: 700,
                  fontFamily: 'inherit', cursor: 'pointer', border: 'none', transition: 'all 120ms',
                  background: leaveLogsFilter === v
                    ? (v === 'add' ? '#059669' : v === 'use' ? '#d97706' : 'var(--color-primary-500)')
                    : 'color-mix(in srgb, var(--color-primary-500) 7%, transparent)',
                  color: leaveLogsFilter === v ? 'white' : 'var(--text-tertiary)',
                }}
              >
                {v === '' ? 'All' : v === 'add' ? '+ Add' : '− Use'}
              </button>
            ))}
          </div>

          {leaveLogsLoading ? (
            <div style={{ padding: '48px 0', textAlign: 'center' }}>
              <div style={{ width: 32, height: 32, border: '3px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', borderTopColor: 'var(--color-primary-500)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>Loading logs…</p>
            </div>
          ) : leaveLogs.filter(l => leaveLogsFilter === '' || l.action === leaveLogsFilter).length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center' }}>
              <History size={32} style={{ color: 'color-mix(in srgb, var(--color-primary-500) 15%, transparent)', margin: '0 auto 12px', display: 'block' }} />
              <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', margin: 0 }}>No leave logs yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {leaveLogs
                .filter(l => leaveLogsFilter === '' || l.action === leaveLogsFilter)
                .map(log => {
                  const isAdd = log.action === 'add';
                  return (
                    <div key={log.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                      padding: '11px 14px', borderRadius: 10,
                      border: `1px solid ${isAdd ? 'rgba(5,150,105,0.12)' : 'rgba(217,119,6,0.12)'}`,
                      background: isAdd ? 'rgba(5,150,105,0.03)' : 'rgba(217,119,6,0.03)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        {/* Action badge */}
                        <span style={{
                          flexShrink: 0, width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800,
                          background: isAdd ? 'rgba(5,150,105,0.12)' : 'rgba(217,119,6,0.12)',
                          color: isAdd ? '#059669' : '#d97706',
                        }}>
                          {isAdd ? '+' : '−'}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {log.employee?.user?.name || 'Unknown Employee'}
                          </p>
                          <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', margin: '0 0 1px' }}>
                            {log.reason || <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No reason given</span>}
                          </p>
                          <p style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={10} />
                            {new Date(log.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {log.actioned_by && ` · by ${log.actioned_by.name}`}
                          </p>
                        </div>
                      </div>
                      {/* Days + balance */}
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ fontSize: '0.88rem', fontWeight: 800, color: isAdd ? '#059669' : '#d97706', margin: '0 0 2px' }}>
                          {isAdd ? '+' : '−'}{log.days}d
                        </p>
                        <p style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', margin: 0 }}>
                          {log.balance_before} → {log.balance_after} days
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
          {/* Pagination */}
          {leaveLogsPagination.last_page > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
              <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', margin: 0 }}>
                Page {leaveLogsPagination.current_page} of {leaveLogsPagination.last_page} · {leaveLogsPagination.total} entries
              </p>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => fetchLeaveLogs(leaveLogsPagination.current_page - 1)}
                  disabled={leaveLogsPagination.current_page <= 1}
                  style={{ padding: '4px 10px', borderRadius: 7, fontSize: '0.73rem', fontWeight: 700, fontFamily: 'inherit', cursor: leaveLogsPagination.current_page <= 1 ? 'not-allowed' : 'pointer', border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', background: 'none', color: 'var(--color-primary-500)', opacity: leaveLogsPagination.current_page <= 1 ? 0.3 : 1 }}
                >
                  ← Prev
                </button>
                <button
                  onClick={() => fetchLeaveLogs(leaveLogsPagination.current_page + 1)}
                  disabled={leaveLogsPagination.current_page >= leaveLogsPagination.last_page}
                  style={{ padding: '4px 10px', borderRadius: 7, fontSize: '0.73rem', fontWeight: 700, fontFamily: 'inherit', cursor: leaveLogsPagination.current_page >= leaveLogsPagination.last_page ? 'not-allowed' : 'pointer', border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', background: 'none', color: 'var(--color-primary-500)', opacity: leaveLogsPagination.current_page >= leaveLogsPagination.last_page ? 0.3 : 1 }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ── Birthdays Modal ── */}
      {showBirthdaysModal && (
        <Modal
          onClose={() => setShowBirthdaysModal(false)}
          title="Upcoming Birthdays"
          subtitle={`Employees with birthdays in the next ${birthdayDays} days`} 
          icon={<Gift size={18} style={{ color: '#d97706' }} />}
          iconBg="rgba(217,119,6,0.1)"
        >
          {/* ── Day range toggles ── */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {[
              { label: 'This week', days: 7  },
              { label: '30 days',   days: 30 },
              { label: '60 days',   days: 60 },
              { label: '90 days',   days: 90 },
            ].map(({ label, days }) => (
              <button
                key={days}
                onClick={() => { setBirthdayDays(days); fetchBirthdays(days); }}
                style={{
                  padding: '5px 12px', borderRadius: 7, fontSize: '0.73rem', fontWeight: 700,
                  fontFamily: 'inherit', cursor: 'pointer', border: 'none', transition: 'all 120ms',
                  background: birthdayDays === days ? '#d97706' : 'rgba(217,119,6,0.08)',
                  color: birthdayDays === days ? 'white' : '#b45309',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {birthdaysLoading ? (
            <div style={{ padding: '48px 0', textAlign: 'center' }}>
              <div style={{ width: 32, height: 32, border: '3px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', borderTopColor: 'var(--color-primary-500)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>Loading…</p>
            </div>
          ) : birthdays.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center' }}>
              <Gift size={32} style={{ color: 'color-mix(in srgb, var(--color-primary-500) 15%, transparent)', margin: '0 auto 12px', display: 'block' }} />
              <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', margin: 0 }}>
                No upcoming birthdays in the next {birthdayDays} days  {/* ← was hardcoded 30 */}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {birthdays.map(emp => {
                const isToday = emp.days_until_birthday === 0;
                const isSoon  = emp.days_until_birthday <= 7;
                const accentColor = isToday ? 'var(--color-primary-600)' : isSoon ? '#d97706' : '#6b7280';
                const accentBg    = isToday ? 'color-mix(in srgb, var(--color-primary-600) 8%, transparent)' : isSoon ? 'rgba(217,119,6,0.07)' : 'rgba(107,114,128,0.06)';

                return (
                  <div key={emp.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    padding: '11px 14px', borderRadius: 10,
                    border: `1px solid ${isToday ? 'color-mix(in srgb, var(--color-primary-600) 20%, transparent)' : 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)'}`,
                    background: isToday ? 'color-mix(in srgb, var(--color-primary-600) 4%, transparent)' : 'transparent',
                    transition: 'border-color 150ms',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {/* Avatar */}
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: accentBg, color: accentColor, fontSize: '0.8rem', fontWeight: 800,
                      }}>
                        {emp.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 1px' }}>{emp.name}</p>
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', margin: 0 }}>
                          {new Date(emp.date_of_birth).toLocaleDateString('en-KE', { day: 'numeric', month: 'long' })}
                          {emp.age && ` · Turning ${emp.age + 1}`}
                        </p>
                      </div>
                    </div>
                    {/* Days pill */}
                    <span style={{
                      flexShrink: 0, padding: '4px 11px', borderRadius: 20,
                      fontSize: '0.72rem', fontWeight: 700,
                      background: accentBg, color: accentColor,
                    }}>
                      {isToday ? '🎂 Today!' : emp.days_until_birthday === 1 ? 'Tomorrow' : `${emp.days_until_birthday} days`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
    </AdminLayout>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function RowActions({ empId, onDelete, navigate }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', transition: 'background 120ms, color 120ms' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 8%, transparent)'; e.currentTarget.style.color = 'var(--color-primary-500)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#c4b5fd'; }}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 168, zIndex: 20, background: 'var(--surface-card, #fff)', borderRadius: 12, padding: '6px 0', border: '1.5px solid var(--line)', boxShadow: '0 8px 32px color-mix(in srgb, var(--color-primary-500) 15%, transparent)' }} onClick={e => e.stopPropagation()}>
            {[
              { icon: Eye,    label: 'View',    color: 'var(--text-primary)', onClick: () => navigate(`/admin/employees/${empId}`) },
              { icon: Edit3,  label: 'Edit',    color: 'var(--text-primary)', onClick: () => navigate(`/admin/employees/${empId}/edit`) },
              null,
              { icon: Trash2, label: 'Delete',  color: '#ef4444', onClick: onDelete },
            ].map((item, i) => item === null ? (
              <div key={i} style={{ margin: '4px 0', borderTop: '1px solid var(--line)' }} />
            ) : (
              <button key={i} onClick={() => { item.onClick(); setOpen(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', fontSize: '0.8rem', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: item.color, transition: 'background 120ms' }}
                onMouseEnter={e => e.currentTarget.style.background = item.color === '#ef4444' ? 'rgba(239,68,68,0.05)' : 'color-mix(in srgb, var(--color-primary-500) 4%, transparent)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <item.icon size={13} style={{ flexShrink: 0 }} /> {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Modal({ onClose, title, subtitle, icon, iconBg, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ ...card, width: '100%', maxWidth: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: iconBg }}>{icon}</div>
            <div>
              <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 1px' }}>{title}</p>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', margin: 0 }}>{subtitle}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <X size={16} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>{children}</div>
      </div>
    </div>
  );
}

function PaginationBtn({ onClick, disabled, children }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer', border: '1.5px solid var(--line)', background: 'none', color: 'var(--color-primary-500)', opacity: disabled ? 0.3 : 1, transition: 'background 120ms' }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)'; }}
      onMouseLeave={e => e.currentTarget.style.background = 'none'}
    >{children}</button>
  );
}

function ActionBtn({ color, bg, hoverBg, onClick, disabled, children }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 7, fontSize: '0.73rem', fontWeight: 700, fontFamily: 'inherit', cursor: disabled ? 'not-allowed' : 'pointer', border: 'none', background: bg, color, opacity: disabled ? 0.5 : 1, transition: 'background 120ms' }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = hoverBg; }}
      onMouseLeave={e => e.currentTarget.style.background = bg}
    >{children}</button>
  );
}