import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Edit3, Trash2, User, Mail, Phone,
  Briefcase, Building2, Calendar, DollarSign, GraduationCap,
  Award, Users, Shield, AlertCircle, CheckCircle, Clock,
  TrendingUp, FileText, Plus, Minus, X, RotateCcw, ShieldAlert,
  MapPin, CreditCard, Hash
} from 'lucide-react';
import toast from 'react-hot-toast';
import employeesApi from '../../../../_shared/api/employees';
import { getBaseCode } from '../../../../_shared/lib/baseCurrency';

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_META = {
  active:     { bg: 'rgba(16,185,129,0.1)',  color: '#065f46', dot: '#10b981', ring: 'rgba(16,185,129,0.25)',  label: 'Active'     },
  on_leave:   { bg: 'rgba(245,158,11,0.1)',  color: '#b45309', dot: '#f59e0b', ring: 'rgba(245,158,11,0.25)',  label: 'On Leave'   },
  probation:  { bg: 'rgba(99,102,241,0.1)',  color: '#3730a3', dot: '#6366f1', ring: 'rgba(99,102,241,0.25)',  label: 'Probation'  },
  suspended:  { bg: 'rgba(239,68,68,0.1)',   color: '#b91c1c', dot: '#ef4444', ring: 'rgba(239,68,68,0.25)',   label: 'Suspended'  },
  terminated: { bg: 'rgba(107,114,128,0.1)', color: 'var(--text-secondary)', dot: '#9ca3af', ring: 'rgba(107,114,128,0.2)',  label: 'Terminated' },
};

const ROLE_META = {
  admin:     { bg: 'rgba(239,68,68,0.1)',   color: '#b91c1c', label: 'Admin'     },
  manager:   { bg: 'rgba(59,130,246,0.1)',  color: '#1d4ed8', label: 'Manager'   },
  sales_rep: { bg: 'rgba(16,185,129,0.1)',  color: '#065f46', label: 'Sales Rep' },
};

const STATUS_OPTIONS = [
  { value: 'active',     label: 'Active',     color: '#10b981' },
  { value: 'on_leave',   label: 'On Leave',   color: '#f59e0b' },
  { value: 'probation',  label: 'Probation',  color: '#6366f1' },
  { value: 'suspended',  label: 'Suspended',  color: '#ef4444' },
  { value: 'terminated', label: 'Terminated', color: 'var(--text-tertiary)' },
];

const EMPLOYMENT_TYPE_LABELS = {
  full_time: 'Full Time', part_time: 'Part Time', contract: 'Contract', intern: 'Intern',
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// ── Shared styles ──────────────────────────────────────────────────────────────

const card = {
  background: 'var(--surface-card, #fff)',
  borderRadius: 12,
  border: '1px solid var(--line)',
  boxShadow: '0 2px 12px color-mix(in srgb, var(--color-primary-500) 6%, transparent)',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function Badge({ status }) {
  const s = STATUS_META[status] || STATUS_META.active;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700, background: s.bg, color: s.color, boxShadow: `0 0 0 1px ${s.ring}`, whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

function RoleBadge({ role }) {
  const r = ROLE_META[role] || { bg: 'rgba(107,114,128,0.1)', color: 'var(--text-secondary)', label: role || '—' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700, background: r.bg, color: r.color, whiteSpace: 'nowrap' }}>
      <Shield size={10} />
      {r.label}
    </span>
  );
}

function InfoRow({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '9px 0', borderBottom: '1px solid color-mix(in srgb, var(--color-primary-500) 5%, transparent)' }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', flexShrink: 0, marginRight: 16 }}>{label}</span>
      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right', fontFamily: mono ? 'monospace' : 'inherit' }}>
        {value || '—'}
      </span>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, action }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-input)', color: 'var(--color-primary-500)' }}>
            <Icon size={14} />
          </div>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
        </div>
        {action}
      </div>
      <div style={{ padding: '4px 18px 10px' }}>{children}</div>
    </div>
  );
}

function Modal({ onClose, title, subtitle, icon, iconBg, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ ...card, width: '100%', maxWidth: 420, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: iconBg }}>{icon}</div>
            <div>
              <p style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 1px' }}>{title}</p>
              {subtitle && <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', margin: 0 }}>{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          ><X size={15} /></button>
        </div>
        <div style={{ padding: '18px' }}>{children}</div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem',
  background: 'var(--surface-card, #fff)', border: '1.5px solid var(--line)',
  color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  transition: 'border-color 150ms, box-shadow 150ms',
};
const iFocus = e => { e.currentTarget.style.borderColor = 'var(--color-primary-500)'; e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--color-primary-500) 10%, transparent)'; };
const iBlur  = e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 18%, transparent)'; e.currentTarget.style.boxShadow = 'none'; };

// ── Main ───────────────────────────────────────────────────────────────────────

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [employee, setEmployee]       = useState(null);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState('overview');
  const [actionLoading, setActionLoading] = useState(false);

  // Modal states
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal]   = useState(false);
  const [showSkillModal, setShowSkillModal]   = useState(false);
  const [leaveAction, setLeaveAction]         = useState('add');
  const [leaveDays, setLeaveDays]             = useState('');
  const [leaveReason, setLeaveReason]         = useState('');
  const [newSkill, setNewSkill]               = useState('');

  const [showCertModal, setShowCertModal] = useState(false);
  const [newCert, setNewCert] = useState({ name: '', issuer: '', date: '' });

  const [editingTermDate, setEditingTermDate] = useState(false);
  const [termDate, setTermDate]               = useState('');

  useEffect(() => { fetchEmployee(); }, [id]);

  const fetchEmployee = async () => {
    setLoading(true);
    try { const data = await employeesApi.getEmployee(id); setEmployee(data.employee); }
    catch { toast.error('Failed to load employee'); navigate('/admin/employees'); }
    finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Move this employee to trash?')) return;
    try { await employeesApi.deleteEmployee(id); toast.success('Moved to trash'); navigate('/admin/employees'); }
    catch { toast.error('Failed to delete employee'); }
  };

  const handleStatusChange = async (newStatus) => {
    setActionLoading(true);
    try { await employeesApi.updateStatus(id, newStatus); toast.success(`Status updated to ${newStatus.replace('_', ' ')}`); setShowStatusModal(false); fetchEmployee(); }
    catch { toast.error('Failed to update status'); }
    finally { setActionLoading(false); }
  };

  const handleLeaveAction = async () => {
    if (!leaveDays || parseFloat(leaveDays) <= 0) return toast.error('Enter a valid number of days');
    setActionLoading(true);
    try {
      if (leaveAction === 'add') { await employeesApi.addLeaveDays(id, parseFloat(leaveDays), leaveReason); toast.success('Leave days added'); }
      else { await employeesApi.useLeaveDays(id, parseFloat(leaveDays), leaveReason); toast.success('Leave days used'); }
      setShowLeaveModal(false); setLeaveDays(''); setLeaveReason(''); fetchEmployee();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to update leave balance'); }
    finally { setActionLoading(false); }
  };

  const handleSaveTermDate = async () => {
    setActionLoading(true);
    try {
      await employeesApi.updateEmployee(id, { termination_date: termDate || null });
      toast.success('Termination date updated');
      setEditingTermDate(false);
      fetchEmployee();
    } catch { toast.error('Failed to update termination date'); }
    finally { setActionLoading(false); }
  };

  const handleAddSkill = async () => {
    if (!newSkill.trim()) return toast.error('Enter a skill');
    setActionLoading(true);
    try { await employeesApi.addSkill(id, newSkill.trim()); toast.success('Skill added'); setNewSkill(''); setShowSkillModal(false); fetchEmployee(); }
    catch { toast.error('Failed to add skill'); }
    finally { setActionLoading(false); }
  };

  const handleRemoveSkill = async (skill) => {
    if (!confirm(`Remove "${skill}"?`)) return;
    try { await employeesApi.removeSkill(id, skill); toast.success('Skill removed'); fetchEmployee(); }
    catch { toast.error('Failed to remove skill'); }
  };

  const handleAddCertification = async () => {
    if (!newCert.name.trim()) return toast.error('Enter a certification name');
    setActionLoading(true);
    try {
      await employeesApi.addCertification(id, newCert);
      toast.success('Certification added');
      setNewCert({ name: '', issuer: '', date: '' });
      setShowCertModal(false);
      fetchEmployee();
    } catch { toast.error('Failed to add certification'); }
    finally { setActionLoading(false); }
  };

  const handleRemoveCertification = async (index) => {
    if (!confirm('Remove this certification?')) return;
    try {
      await employeesApi.removeCertification(id, index);
      toast.success('Certification removed');
      fetchEmployee();
    } catch { toast.error('Failed to remove certification'); }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ width: 36, height: 36, border: '3px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', borderTopColor: 'var(--color-primary-500)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (!employee) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: 12 }}>
      <AlertCircle size={36} style={{ color: 'color-mix(in srgb, var(--color-primary-500) 30%, transparent)' }} />
      <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>Employee not found</p>
      <Link to="/admin/employees" style={{ color: 'var(--color-primary-500)', fontSize: '0.82rem', fontWeight: 600 }}>Back to Employees</Link>
    </div>
  );

  const s = STATUS_META[employee.status] || STATUS_META.active;
  const tabs = [
    { id: 'overview',   label: 'Overview',     icon: User      },
    { id: 'employment', label: 'Employment',   icon: Briefcase },
    { id: 'personal',   label: 'Personal',     icon: Shield    },
    { id: 'skills',     label: 'Skills',       icon: Award     },
  ];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => navigate('/admin/employees')} style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', transition: 'all 150ms' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary-500)'; e.currentTarget.style.color = 'var(--color-primary-500)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 20%, transparent)'; e.currentTarget.style.color = '#9ca3af'; }}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-primary-500)', letterSpacing: '-0.02em', margin: '0 0 2px' }}>{employee.full_name}</h1>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', margin: 0 }}>{employee.employee_number} · {employee.job_title}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setShowStatusModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 9, fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', background: 'var(--surface-card, #fff)', border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', color: 'var(--color-primary-600)', transition: 'all 150ms' }}
            onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)'}
            onMouseLeave={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)'}
          >
            <Shield size={14} /> Change Status
          </button>
          <button
            onClick={() => navigate(`/admin/employees/${id}/edit`)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', color: 'white', boxShadow: '0 4px 14px color-mix(in srgb, var(--color-primary-500) 35%, transparent)', transition: 'box-shadow 150ms' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 20px color-mix(in srgb, var(--color-primary-500) 50%, transparent)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 14px color-mix(in srgb, var(--color-primary-500) 35%, transparent)'}
          >
            <Edit3 size={14} /> Edit
          </button>
          <button onClick={handleDelete} style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: '1.5px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.05)', cursor: 'pointer', color: '#b91c1c', transition: 'all 150ms' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.05)'}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* ── Profile card ── */}
      <div style={{ ...card, padding: '24px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
          {/* Avatar */}
          <div style={{ width: 80, height: 80, borderRadius: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,color-mix(in srgb, var(--color-primary-500) 15%, transparent),color-mix(in srgb, var(--color-primary-600) 25%, transparent))', color: 'var(--color-primary-600)', fontSize: '1.6rem', fontWeight: 800, boxShadow: '0 0 0 2px color-mix(in srgb, var(--color-primary-500) 20%, transparent)' }}>
            {employee.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          {/* Quick info grid */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 20 }}>
            {[
              { label: 'Status',          content: <Badge status={employee.status} /> },
              { label: 'Role',            content: <RoleBadge role={employee.user?.role} /> },
              { label: 'Department',      content: <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 5 }}><Building2 size={13} style={{ color: 'var(--text-tertiary)' }} />{employee.department || '—'}</span> },
              { label: 'Employment Type', content: <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{EMPLOYMENT_TYPE_LABELS[employee.employment_type] || '—'}</span> },
              { label: 'Hire Date',       content: <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 5 }}><Calendar size={13} style={{ color: 'var(--text-tertiary)' }} />{fmtDate(employee.hire_date)}</span> },
              { label: 'Email',           content: <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}><Mail size={12} style={{ color: 'var(--text-tertiary)' }} />{employee.user?.email || '—'}</span> },
              { label: 'Phone',           content: <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'monospace' }}><Phone size={12} style={{ color: 'var(--text-tertiary)' }} />{employee.work_phone || employee.user?.phone || '—'}</span> },
              { label: 'Tenure',          content: <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 5 }}><Clock size={13} style={{ color: 'var(--text-tertiary)' }} />{employee.tenure_years ? `${employee.tenure_years} years` : '—'}</span> },
              { label: 'Leave Balance',   content: <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-primary-500)', display: 'flex', alignItems: 'center', gap: 5 }}><TrendingUp size={13} style={{ color: 'var(--color-primary-500)' }} />{employee.leave_balance} days</span> },
            ].map(({ label, content }) => (
              <div key={label}>
                <p style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 5px' }}>{label}</p>
                {content}
              </div>
            ))}
          </div>
        </div>
        {/* Set / Reset Password link */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          <Link
            to={`/admin/users/${employee.user_id}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-primary-500)', textDecoration: 'none' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--color-primary-600)'}
            onMouseLeave={e => e.currentTarget.style.color = '#ff0000'}
          >
            <Shield size={13} />
            Set / Reset Password for this Employee
          </Link>
        </div>
        {/* Termination Date — inline editable */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid color-mix(in srgb, var(--color-primary-500) 5%, transparent)' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', flexShrink: 0, marginRight: 16 }}>Termination Date</span>
          {editingTermDate ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="date"
                value={termDate}
                onChange={e => setTermDate(e.target.value)}
                style={{ fontSize: '0.78rem', padding: '4px 8px', borderRadius: 6, border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 35%, transparent)', outline: 'none', color: 'var(--text-primary)', fontFamily: 'inherit', background: 'var(--surface-card, #fff)' }}
                onFocus={iFocus} onBlur={iBlur}
                autoFocus
              />
              <button onClick={handleSaveTermDate} disabled={actionLoading}
                style={{ fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--color-primary-500)', color: 'white', fontFamily: 'inherit', opacity: actionLoading ? 0.6 : 1 }}>
                {actionLoading ? '…' : 'Save'}
              </button>
              <button onClick={() => setEditingTermDate(false)}
                style={{ fontSize: '0.72rem', fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', cursor: 'pointer', background: 'none', color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: employee.termination_date ? '#b91c1c' : '#374151' }}>
                {employee.termination_date ? fmtDate(employee.termination_date) : '—'}
              </span>
              <button
                onClick={() => { setTermDate(employee.termination_date ? employee.termination_date.toString().slice(0, 10) : ''); setEditingTermDate(true); }}
                style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: 5, border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', cursor: 'pointer', background: 'none', color: 'var(--text-tertiary)', fontFamily: 'inherit' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary-500)'; e.currentTarget.style.color = 'var(--color-primary-500)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 20%, transparent)'; e.currentTarget.style.color = '#9ca3af'; }}
              >
                {employee.termination_date ? 'Edit' : 'Set'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', padding: '0 4px' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '12px 16px', fontSize: '0.8rem', fontWeight: activeTab === tab.id ? 700 : 500,
              color: activeTab === tab.id ? 'var(--color-primary-500)' : 'var(--text-tertiary)',
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              borderBottom: `2px solid ${activeTab === tab.id ? 'var(--color-primary-500)' : 'transparent'}`,
              marginBottom: -1, transition: 'color 150ms',
            }}>
              <tab.icon size={14} /> {tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: '20px' }}>

          {/* Overview tab */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Quick actions */}
              <div>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>Quick Actions</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {[
                    { label: 'Add Leave Days', icon: Plus,  bg: 'rgba(5,150,105,0.08)',   color: '#065f46', hov: 'rgba(5,150,105,0.14)',   onClick: () => { setLeaveAction('add'); setShowLeaveModal(true); } },
                    { label: 'Use Leave Days', icon: Minus, bg: 'rgba(245,158,11,0.08)',  color: '#b45309', hov: 'rgba(245,158,11,0.14)',  onClick: () => { setLeaveAction('use'); setShowLeaveModal(true); } },
                    { label: 'Add Skill',      icon: Award, bg: 'color-mix(in srgb, var(--color-primary-500) 8%, transparent)',  color: 'var(--color-primary-600)', hov: 'color-mix(in srgb, var(--color-primary-500) 14%, transparent)',  onClick: () => setShowSkillModal(true) },
                  ].map(({ label, icon: Icon, bg, color, hov, onClick }) => (
                    <button key={label} onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 9, fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: 'none', background: bg, color, transition: 'background 150ms' }}
                      onMouseEnter={e => e.currentTarget.style.background = hov}
                      onMouseLeave={e => e.currentTarget.style.background = bg}
                    >
                      <Icon size={14} /> {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Manager */}
              {employee.manager && (
                <div>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>Reports To</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, background: 'var(--surface-card, #fff)', border: '1px solid var(--line)' }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(37,99,235,0.1)', color: '#2563eb', fontWeight: 800 }}>
                      {employee.manager.user?.name?.[0]}
                    </div>
                    <div>
                      <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 1px' }}>{employee.manager.user?.name}</p>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', margin: 0 }}>{employee.manager.job_title}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Direct reports */}
              {employee.subordinates?.length > 0 && (
                <div>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>Direct Reports ({employee.subordinates.length})</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                    {employee.subordinates.map(sub => (
                      <Link key={sub.id} to={`/admin/employees/${sub.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', textDecoration: 'none', transition: 'all 150ms' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 30%, transparent)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 3%, transparent)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)'; e.currentTarget.style.background = 'none'; }}
                      >
                        <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-input)', color: 'var(--color-primary-600)', fontSize: '0.75rem', fontWeight: 800 }}>
                          {sub.user?.name?.[0]}
                        </div>
                        <div>
                          <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 1px' }}>{sub.user?.name}</p>
                          <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', margin: 0 }}>{sub.job_title}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {employee.notes && (
                <div>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>Notes</p>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.6, padding: '12px 14px', borderRadius: 10, background: 'var(--surface-card, #fff)', border: '1px solid var(--line)', margin: 0, whiteSpace: 'pre-wrap' }}>
                    {employee.notes}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Employment tab */}
          {activeTab === 'employment' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <SectionCard title="Job Information" icon={Briefcase}>
                <InfoRow label="Job Title" value={employee.job_title} />
                <InfoRow label="Department" value={employee.department} />
                <InfoRow label="Employment Type" value={EMPLOYMENT_TYPE_LABELS[employee.employment_type]} />
                <InfoRow label="Employee ID" value={employee.employee_id} mono />
                <InfoRow label="Employee Number" value={employee.employee_number} mono />
              </SectionCard>
              <SectionCard title="Work Details" icon={MapPin}>
                <InfoRow label="Work Location" value={employee.work_location} />
                <InfoRow label="Work Email" value={employee.work_email || employee.user?.email} />
                <InfoRow label="Work Phone" value={employee.work_phone || employee.user?.phone} />
                <InfoRow label="Hire Date" value={fmtDate(employee.hire_date)} />
                 {/* Termination Date — inline editable */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid color-mix(in srgb, var(--color-primary-500) 5%, transparent)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', flexShrink: 0, marginRight: 16 }}>Termination Date</span>
                  {editingTermDate ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="date"
                        value={termDate}
                        onChange={e => setTermDate(e.target.value)}
                        style={{ fontSize: '0.78rem', padding: '4px 8px', borderRadius: 6, border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 35%, transparent)', outline: 'none', color: 'var(--text-primary)', fontFamily: 'inherit', background: 'var(--surface-card, #fff)' }}
                        onFocus={iFocus} onBlur={iBlur}
                        autoFocus
                      />
                      <button onClick={handleSaveTermDate} disabled={actionLoading}
                        style={{ fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--color-primary-500)', color: 'white', fontFamily: 'inherit', opacity: actionLoading ? 0.6 : 1 }}>
                        {actionLoading ? '…' : 'Save'}
                      </button>
                      <button onClick={() => setEditingTermDate(false)}
                        style={{ fontSize: '0.72rem', fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', cursor: 'pointer', background: 'none', color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: employee.termination_date ? '#b91c1c' : '#374151' }}>
                        {employee.termination_date ? fmtDate(employee.termination_date) : '—'}
                      </span>
                      <button
                        onClick={() => { setTermDate(employee.termination_date ? employee.termination_date.toString().slice(0, 10) : ''); setEditingTermDate(true); }}
                        style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: 5, border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', cursor: 'pointer', background: 'none', color: 'var(--text-tertiary)', fontFamily: 'inherit' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary-500)'; e.currentTarget.style.color = 'var(--color-primary-500)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 20%, transparent)'; e.currentTarget.style.color = '#9ca3af'; }}
                      >
                        {employee.termination_date ? 'Edit' : 'Set'}
                      </button>
                    </div>
                  )}
                </div>
              </SectionCard>
              <SectionCard title="Compensation" icon={DollarSign}>
                <InfoRow label="Salary Grade" value={employee.salary_grade} />
                <InfoRow label="Base Salary" value={employee.base_salary ? `${employee.currency || getBaseCode()} ${parseFloat(employee.base_salary).toLocaleString()}` : null} />
                <InfoRow label="Annual Leave Days" value={employee.annual_leave_days} />
                <InfoRow label="Leave Balance" value={`${employee.leave_balance} days`} />
              </SectionCard>
              <SectionCard title="Emergency Contact" icon={AlertCircle}>
                <InfoRow label="Name" value={employee.emergency_contact_name} />
                <InfoRow label="Phone" value={employee.emergency_contact_phone} />
                <InfoRow label="Relationship" value={employee.emergency_contact_relationship} />
              </SectionCard>
            </div>
          )}

          {/* Personal tab */}
          {activeTab === 'personal' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <SectionCard title="Personal Information" icon={User}>
                <InfoRow label="Full Name" value={employee.full_name} />
                <InfoRow label="Date of Birth" value={fmtDate(employee.date_of_birth)} />
                <InfoRow label="Age" value={employee.age ? `${employee.age} years` : null} />
                <InfoRow label="Gender" value={employee.gender ? employee.gender.charAt(0).toUpperCase() + employee.gender.slice(1) : null} />
                <InfoRow label="Marital Status" value={employee.marital_status ? employee.marital_status.charAt(0).toUpperCase() + employee.marital_status.slice(1) : null} />
                <InfoRow label="Education" value={employee.education_level} />
              </SectionCard>
              <SectionCard title="Identification" icon={Hash}>
                <InfoRow label="ID Number" value={employee.id_number} mono />
                <InfoRow label="KRA PIN" value={employee.kra_pin} mono />
                <InfoRow label="NSSF Number" value={employee.nssf_number} mono />
                <InfoRow label="NHIF Number" value={employee.nhif_number} mono />
              </SectionCard>
              <SectionCard title="Bank Details" icon={CreditCard}>
                <InfoRow label="Bank Name" value={employee.bank_name} />
                <InfoRow label="Account Name" value={employee.bank_account_name} />
                <InfoRow label="Account Number" value={employee.bank_account_number ? `****${employee.bank_account_number.slice(-4)}` : null} mono />
              </SectionCard>
            </div>
          )}

          {/* Skills tab */}
          {activeTab === 'skills' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <SectionCard title="Skills" icon={Award} action={
                <button onClick={() => setShowSkillModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 7, fontSize: '0.73rem', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', border: 'none', background: 'var(--surface-card, #fff)', color: 'var(--color-primary-600)' }}>
                  <Plus size={12} /> Add Skill
                </button>
              }>
                {employee.skills?.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
                    {employee.skills.map((skill, i) => (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600, background: 'var(--surface-card, #fff)', color: 'var(--color-primary-600)', border: '1px solid var(--line)' }}>
                        {skill}
                        <button onClick={() => handleRemoveSkill(skill)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', lineHeight: 1 }}
                          onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                          onMouseLeave={e => e.currentTarget.style.color = '#c4b5fd'}
                        ><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', padding: '8px 0' }}>No skills added yet</p>
                )}
              </SectionCard>

              <SectionCard title="Certifications" icon={GraduationCap} action={
                <button onClick={() => setShowCertModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 7, fontSize: '0.73rem', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', border: 'none', background: 'var(--surface-card, #fff)', color: 'var(--color-primary-600)' }}>
                  <Plus size={12} /> Add Certification
                </button>
              }>
                {employee.certifications?.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
                    {employee.certifications.map((cert, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 9, background: 'var(--surface-card, #fff)', border: '1px solid var(--line)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <Award size={16} style={{ color: 'var(--color-primary-500)', flexShrink: 0, marginTop: 1 }} />
                          <div>
                            <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 1px' }}>{cert.name || cert}</p>
                            {cert.issuer && <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', margin: '0 0 1px' }}>{cert.issuer}</p>}
                            {cert.date && <p style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', margin: 0 }}>{fmtDate(cert.date)}</p>}
                          </div>
                        </div>
                        <button onClick={() => handleRemoveCertification(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                          onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                          onMouseLeave={e => e.currentTarget.style.color = '#c4b5fd'}
                        ><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', padding: '8px 0' }}>No certifications added yet</p>
                )}
              </SectionCard>
            </div>
          )}

        </div>
      </div>

      {/* ── Status Modal ── */}
      {showStatusModal && (
        <Modal onClose={() => setShowStatusModal(false)} title="Change Status" subtitle="Select a new status for this employee" icon={<Shield size={16} style={{ color: 'var(--color-primary-600)' }} />} iconBg="color-mix(in srgb, var(--color-primary-500) 10%, transparent)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {STATUS_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => handleStatusChange(opt.value)} disabled={employee.status === opt.value || actionLoading} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 9, border: `1.5px solid ${employee.status === opt.value ? opt.color : 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)'}`, background: employee.status === opt.value ? `${opt.color}12` : 'none', cursor: employee.status === opt.value ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all 150ms', opacity: actionLoading && employee.status !== opt.value ? 0.5 : 1 }}
                onMouseEnter={e => { if (employee.status !== opt.value) e.currentTarget.style.background = `${opt.color}0d`; }}
                onMouseLeave={e => { if (employee.status !== opt.value) e.currentTarget.style.background = 'none'; }}
              >
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', flex: 1, textAlign: 'left' }}>{opt.label}</span>
                {employee.status === opt.value && <CheckCircle size={14} style={{ color: opt.color }} />}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* ── Leave Modal ── */}
      {showLeaveModal && (
        <Modal onClose={() => { setShowLeaveModal(false); setLeaveDays(''); setLeaveReason(''); }} title={leaveAction === 'add' ? 'Add Leave Days' : 'Use Leave Days'} subtitle={`Current balance: ${employee.leave_balance} days`} icon={leaveAction === 'add' ? <Plus size={16} style={{ color: '#059669' }} /> : <Minus size={16} style={{ color: '#d97706' }} />} iconBg={leaveAction === 'add' ? 'rgba(5,150,105,0.1)' : 'rgba(245,158,11,0.1)'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Number of Days</label>
              <input type="number" step="0.5" min="0" value={leaveDays} onChange={e => setLeaveDays(e.target.value)} placeholder="e.g. 5" style={inputStyle} onFocus={iFocus} onBlur={iBlur} />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Reason (optional)</label>
              <textarea value={leaveReason} onChange={e => setLeaveReason(e.target.value)} rows={3} placeholder="Enter reason…" style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} onFocus={iFocus} onBlur={iBlur} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowLeaveModal(false); setLeaveDays(''); setLeaveReason(''); }} style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: '1.5px solid var(--line)', background: 'none', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleLeaveAction} disabled={actionLoading} style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: leaveAction === 'add' ? '#059669' : '#d97706', color: 'white', opacity: actionLoading ? 0.6 : 1 }}>
                {actionLoading ? 'Processing…' : leaveAction === 'add' ? 'Add Days' : 'Use Days'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Skill Modal ── */}
      {showSkillModal && (
        <Modal onClose={() => { setShowSkillModal(false); setNewSkill(''); }} title="Add Skill" icon={<Award size={16} style={{ color: 'var(--color-primary-600)' }} />} iconBg="color-mix(in srgb, var(--color-primary-500) 10%, transparent)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Skill Name</label>
              <input type="text" value={newSkill} onChange={e => setNewSkill(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleAddSkill()} placeholder="e.g. Project Management" style={inputStyle} onFocus={iFocus} onBlur={iBlur} autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowSkillModal(false); setNewSkill(''); }} style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: '1.5px solid var(--line)', background: 'none', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleAddSkill} disabled={actionLoading} style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', color: 'white', opacity: actionLoading ? 0.6 : 1 }}>
                {actionLoading ? 'Adding…' : 'Add Skill'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showCertModal && (
        <Modal onClose={() => { setShowCertModal(false); setNewCert({ name: '', issuer: '', date: '' }); }} title="Add Certification" icon={<GraduationCap size={16} style={{ color: 'var(--color-primary-600)' }} />} iconBg="color-mix(in srgb, var(--color-primary-500) 10%, transparent)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Certification Name *</label>
              <input type="text" value={newCert.name} onChange={e => setNewCert(p => ({ ...p, name: e.target.value }))} placeholder="e.g. AWS Solutions Architect" style={inputStyle} onFocus={iFocus} onBlur={iBlur} autoFocus />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Issuing Body</label>
              <input type="text" value={newCert.issuer} onChange={e => setNewCert(p => ({ ...p, issuer: e.target.value }))} placeholder="e.g. Amazon Web Services" style={inputStyle} onFocus={iFocus} onBlur={iBlur} />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Date Obtained</label>
              <input type="date" value={newCert.date} onChange={e => setNewCert(p => ({ ...p, date: e.target.value }))} style={inputStyle} onFocus={iFocus} onBlur={iBlur} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowCertModal(false); setNewCert({ name: '', issuer: '', date: '' }); }} style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: '1.5px solid var(--line)', background: 'none', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleAddCertification} disabled={actionLoading} style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', color: 'white', opacity: actionLoading ? 0.6 : 1 }}>
                {actionLoading ? 'Adding…' : 'Add Certification'}
              </button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}