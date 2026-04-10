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
import employeesApi from '../../../api/employees';

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_META = {
  active:     { bg: 'rgba(16,185,129,0.1)',  color: '#065f46', dot: '#10b981', ring: 'rgba(16,185,129,0.25)',  label: 'Active'     },
  on_leave:   { bg: 'rgba(245,158,11,0.1)',  color: '#b45309', dot: '#f59e0b', ring: 'rgba(245,158,11,0.25)',  label: 'On Leave'   },
  probation:  { bg: 'rgba(99,102,241,0.1)',  color: '#3730a3', dot: '#6366f1', ring: 'rgba(99,102,241,0.25)',  label: 'Probation'  },
  suspended:  { bg: 'rgba(239,68,68,0.1)',   color: '#b91c1c', dot: '#ef4444', ring: 'rgba(239,68,68,0.25)',   label: 'Suspended'  },
  terminated: { bg: 'rgba(107,114,128,0.1)', color: '#4b5563', dot: '#9ca3af', ring: 'rgba(107,114,128,0.2)',  label: 'Terminated' },
};

const STATUS_OPTIONS = [
  { value: 'active',     label: 'Active',     color: '#10b981' },
  { value: 'on_leave',   label: 'On Leave',   color: '#f59e0b' },
  { value: 'probation',  label: 'Probation',  color: '#6366f1' },
  { value: 'suspended',  label: 'Suspended',  color: '#ef4444' },
  { value: 'terminated', label: 'Terminated', color: '#9ca3af' },
];

const EMPLOYMENT_TYPE_LABELS = {
  full_time: 'Full Time', part_time: 'Part Time', contract: 'Contract', intern: 'Intern',
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// ── Shared styles ──────────────────────────────────────────────────────────────

const card = {
  background: 'white',
  borderRadius: 12,
  border: '1px solid rgba(168,85,247,0.1)',
  boxShadow: '0 2px 12px rgba(168,85,247,0.06)',
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

function InfoRow({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '9px 0', borderBottom: '1px solid rgba(168,85,247,0.05)' }}>
      <span style={{ fontSize: '0.75rem', color: '#9ca3af', flexShrink: 0, marginRight: 16 }}>{label}</span>
      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', textAlign: 'right', fontFamily: mono ? 'monospace' : 'inherit' }}>
        {value || '—'}
      </span>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, action }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(168,85,247,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(168,85,247,0.08)', color: '#a855f7' }}>
            <Icon size={14} />
          </div>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151' }}>{title}</span>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(168,85,247,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: iconBg }}>{icon}</div>
            <div>
              <p style={{ fontSize: '0.88rem', fontWeight: 700, color: '#111827', margin: '0 0 1px' }}>{title}</p>
              {subtitle && <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.06)'}
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
  background: 'rgba(168,85,247,0.03)', border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#111827', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  transition: 'border-color 150ms, box-shadow 150ms',
};
const iFocus = e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; };
const iBlur  = e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; };

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

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ width: 36, height: 36, border: '3px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (!employee) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: 12 }}>
      <AlertCircle size={36} style={{ color: 'rgba(168,85,247,0.3)' }} />
      <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Employee not found</p>
      <Link to="/admin/employees" style={{ color: '#a855f7', fontSize: '0.82rem', fontWeight: 600 }}>Back to Employees</Link>
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
          <button onClick={() => navigate('/admin/employees')} style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: '1.5px solid rgba(168,85,247,0.2)', background: 'none', cursor: 'pointer', color: '#9ca3af', transition: 'all 150ms' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.color = '#a855f7'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'; e.currentTarget.style.color = '#9ca3af'; }}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.02em', margin: '0 0 2px' }}>{employee.full_name}</h1>
            <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>{employee.employee_number} · {employee.job_title}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setShowStatusModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 9, fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', background: 'rgba(168,85,247,0.06)', border: '1.5px solid rgba(168,85,247,0.2)', color: '#7c3aed', transition: 'all 150ms' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.12)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(168,85,247,0.06)'}
          >
            <Shield size={14} /> Change Status
          </button>
          <button
            onClick={() => navigate(`/admin/employees/${id}/edit`)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white', boxShadow: '0 4px 14px rgba(168,85,247,0.35)', transition: 'box-shadow 150ms' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 20px rgba(168,85,247,0.5)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 14px rgba(168,85,247,0.35)'}
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
          <div style={{ width: 80, height: 80, borderRadius: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,rgba(168,85,247,0.15),rgba(124,58,237,0.25))', color: '#7c3aed', fontSize: '1.6rem', fontWeight: 800, boxShadow: '0 0 0 2px rgba(168,85,247,0.2)' }}>
            {employee.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          {/* Quick info grid */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 20 }}>
            {[
              { label: 'Status',          content: <Badge status={employee.status} /> },
              { label: 'Department',      content: <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 5 }}><Building2 size={13} style={{ color: '#c4b5fd' }} />{employee.department || '—'}</span> },
              { label: 'Employment Type', content: <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>{EMPLOYMENT_TYPE_LABELS[employee.employment_type] || '—'}</span> },
              { label: 'Hire Date',       content: <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 5 }}><Calendar size={13} style={{ color: '#c4b5fd' }} />{fmtDate(employee.hire_date)}</span> },
              { label: 'Email',           content: <span style={{ fontSize: '0.78rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 5 }}><Mail size={12} style={{ color: '#c4b5fd' }} />{employee.user?.email || '—'}</span> },
              { label: 'Phone',           content: <span style={{ fontSize: '0.78rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'monospace' }}><Phone size={12} style={{ color: '#c4b5fd' }} />{employee.work_phone || employee.user?.phone || '—'}</span> },
              { label: 'Tenure',          content: <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 5 }}><Clock size={13} style={{ color: '#c4b5fd' }} />{employee.tenure_years ? `${employee.tenure_years} years` : '—'}</span> },
              { label: 'Leave Balance',   content: <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#a855f7', display: 'flex', alignItems: 'center', gap: 5 }}><TrendingUp size={13} style={{ color: '#a855f7' }} />{employee.leave_balance} days</span> },
            ].map(({ label, content }) => (
              <div key={label}>
                <p style={{ fontSize: '0.62rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 5px' }}>{label}</p>
                {content}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(168,85,247,0.1)', padding: '0 4px' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '12px 16px', fontSize: '0.8rem', fontWeight: activeTab === tab.id ? 700 : 500,
              color: activeTab === tab.id ? '#a855f7' : '#9ca3af',
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              borderBottom: `2px solid ${activeTab === tab.id ? '#a855f7' : 'transparent'}`,
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
                <p style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>Quick Actions</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {[
                    { label: 'Add Leave Days', icon: Plus,  bg: 'rgba(5,150,105,0.08)',   color: '#065f46', hov: 'rgba(5,150,105,0.14)',   onClick: () => { setLeaveAction('add'); setShowLeaveModal(true); } },
                    { label: 'Use Leave Days', icon: Minus, bg: 'rgba(245,158,11,0.08)',  color: '#b45309', hov: 'rgba(245,158,11,0.14)',  onClick: () => { setLeaveAction('use'); setShowLeaveModal(true); } },
                    { label: 'Add Skill',      icon: Award, bg: 'rgba(168,85,247,0.08)',  color: '#7c3aed', hov: 'rgba(168,85,247,0.14)',  onClick: () => setShowSkillModal(true) },
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
                  <p style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>Reports To</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.1)' }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(37,99,235,0.1)', color: '#2563eb', fontWeight: 800 }}>
                      {employee.manager.user?.name?.[0]}
                    </div>
                    <div>
                      <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', margin: '0 0 1px' }}>{employee.manager.user?.name}</p>
                      <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>{employee.manager.job_title}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Direct reports */}
              {employee.subordinates?.length > 0 && (
                <div>
                  <p style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>Direct Reports ({employee.subordinates.length})</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                    {employee.subordinates.map(sub => (
                      <Link key={sub.id} to={`/admin/employees/${sub.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(168,85,247,0.1)', textDecoration: 'none', transition: 'all 150ms' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)'; e.currentTarget.style.background = 'rgba(168,85,247,0.03)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.1)'; e.currentTarget.style.background = 'none'; }}
                      >
                        <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(168,85,247,0.08)', color: '#7c3aed', fontSize: '0.75rem', fontWeight: 800 }}>
                          {sub.user?.name?.[0]}
                        </div>
                        <div>
                          <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', margin: '0 0 1px' }}>{sub.user?.name}</p>
                          <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>{sub.job_title}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {employee.notes && (
                <div>
                  <p style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>Notes</p>
                  <p style={{ fontSize: '0.82rem', color: '#374151', lineHeight: 1.6, padding: '12px 14px', borderRadius: 10, background: 'rgba(168,85,247,0.03)', border: '1px solid rgba(168,85,247,0.08)', margin: 0, whiteSpace: 'pre-wrap' }}>
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
                {employee.termination_date && <InfoRow label="Termination Date" value={fmtDate(employee.termination_date)} />}
              </SectionCard>
              <SectionCard title="Compensation" icon={DollarSign}>
                <InfoRow label="Salary Grade" value={employee.salary_grade} />
                <InfoRow label="Base Salary" value={employee.base_salary ? `${employee.currency || 'KES'} ${parseFloat(employee.base_salary).toLocaleString()}` : null} />
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
                <button onClick={() => setShowSkillModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 7, fontSize: '0.73rem', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', border: 'none', background: 'rgba(168,85,247,0.08)', color: '#7c3aed' }}>
                  <Plus size={12} /> Add Skill
                </button>
              }>
                {employee.skills?.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
                    {employee.skills.map((skill, i) => (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600, background: 'rgba(168,85,247,0.07)', color: '#7c3aed', border: '1px solid rgba(168,85,247,0.15)' }}>
                        {skill}
                        <button onClick={() => handleRemoveSkill(skill)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#c4b5fd', display: 'flex', alignItems: 'center', lineHeight: 1 }}
                          onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                          onMouseLeave={e => e.currentTarget.style.color = '#c4b5fd'}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.78rem', color: '#d1d5db', padding: '8px 0' }}>No skills added yet</p>
                )}
              </SectionCard>

              {employee.certifications?.length > 0 && (
                <SectionCard title="Certifications" icon={GraduationCap}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
                    {employee.certifications.map((cert, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 9, background: 'rgba(168,85,247,0.03)', border: '1px solid rgba(168,85,247,0.08)' }}>
                        <Award size={16} style={{ color: '#a855f7', flexShrink: 0, marginTop: 1 }} />
                        <div>
                          <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', margin: '0 0 1px' }}>{cert.name || cert}</p>
                          {cert.issuer && <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0 0 1px' }}>{cert.issuer}</p>}
                          {cert.date && <p style={{ fontSize: '0.65rem', color: '#d1d5db', margin: 0 }}>{fmtDate(cert.date)}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Status Modal ── */}
      {showStatusModal && (
        <Modal onClose={() => setShowStatusModal(false)} title="Change Status" subtitle="Select a new status for this employee" icon={<Shield size={16} style={{ color: '#7c3aed' }} />} iconBg="rgba(168,85,247,0.1)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {STATUS_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => handleStatusChange(opt.value)} disabled={employee.status === opt.value || actionLoading} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 9, border: `1.5px solid ${employee.status === opt.value ? opt.color : 'rgba(168,85,247,0.12)'}`, background: employee.status === opt.value ? `${opt.color}12` : 'none', cursor: employee.status === opt.value ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all 150ms', opacity: actionLoading && employee.status !== opt.value ? 0.5 : 1 }}
                onMouseEnter={e => { if (employee.status !== opt.value) e.currentTarget.style.background = `${opt.color}0d`; }}
                onMouseLeave={e => { if (employee.status !== opt.value) e.currentTarget.style.background = 'none'; }}
              >
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', flex: 1, textAlign: 'left' }}>{opt.label}</span>
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
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 6 }}>Number of Days</label>
              <input type="number" step="0.5" min="0" value={leaveDays} onChange={e => setLeaveDays(e.target.value)} placeholder="e.g. 5" style={inputStyle} onFocus={iFocus} onBlur={iBlur} />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 6 }}>Reason (optional)</label>
              <textarea value={leaveReason} onChange={e => setLeaveReason(e.target.value)} rows={3} placeholder="Enter reason…" style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} onFocus={iFocus} onBlur={iBlur} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowLeaveModal(false); setLeaveDays(''); setLeaveReason(''); }} style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: '1.5px solid rgba(168,85,247,0.18)', background: 'none', fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleLeaveAction} disabled={actionLoading} style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: leaveAction === 'add' ? '#059669' : '#d97706', color: 'white', opacity: actionLoading ? 0.6 : 1 }}>
                {actionLoading ? 'Processing…' : leaveAction === 'add' ? 'Add Days' : 'Use Days'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Skill Modal ── */}
      {showSkillModal && (
        <Modal onClose={() => { setShowSkillModal(false); setNewSkill(''); }} title="Add Skill" icon={<Award size={16} style={{ color: '#7c3aed' }} />} iconBg="rgba(168,85,247,0.1)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 6 }}>Skill Name</label>
              <input type="text" value={newSkill} onChange={e => setNewSkill(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleAddSkill()} placeholder="e.g. Project Management" style={inputStyle} onFocus={iFocus} onBlur={iBlur} autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowSkillModal(false); setNewSkill(''); }} style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: '1.5px solid rgba(168,85,247,0.18)', background: 'none', fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleAddSkill} disabled={actionLoading} style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white', opacity: actionLoading ? 0.6 : 1 }}>
                {actionLoading ? 'Adding…' : 'Add Skill'}
              </button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}