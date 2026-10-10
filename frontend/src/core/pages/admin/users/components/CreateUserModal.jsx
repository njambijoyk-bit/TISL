import { useState, useEffect } from 'react';
import {
  X, Eye, EyeOff, UserPlus, User, Mail, Phone,
  Building2, Hash, Briefcase, Shield, AlertCircle,
  MapPin, Calendar, GraduationCap, DollarSign, Users
} from 'lucide-react';
import useUsersStore from '../../../../../_shared/store/usersStore';
import toast from 'react-hot-toast';

// The chip colour follows the clearance level a role needs (0 to 6), never the role's name: roles are made in the role builder.
const LEVEL_CHIPS = [
  { color: '#d97706', bg: 'rgba(217,119,6,0.1)',   ring: 'rgba(217,119,6,0.3)'  },
  { color: '#6b7280', bg: 'rgba(107,114,128,0.1)', ring: 'rgba(107,114,128,0.3)' },
  { color: '#059669', bg: 'rgba(5,150,105,0.1)',   ring: 'rgba(5,150,105,0.3)'  },
  { color: '#0891b2', bg: 'rgba(8,145,178,0.1)',   ring: 'rgba(8,145,178,0.3)'  },
  { color: '#7c3aed', bg: 'rgba(124,58,237,0.1)',  ring: 'rgba(124,58,237,0.3)' },
  { color: '#2563eb', bg: 'rgba(37,99,235,0.1)',   ring: 'rgba(37,99,235,0.3)'  },
  { color: '#be185d', bg: 'rgba(190,24,93,0.1)',   ring: 'rgba(190,24,93,0.3)'  },
];
const chipOf = (r) => LEVEL_CHIPS[r?.min_clearance ?? 0] ?? LEVEL_CHIPS[0];

const STATUS_OPTIONS = [
  { value: 'active',               label: 'Active',    dot: '#22c55e' },
  { value: 'inactive',             label: 'Inactive',  dot: '#9ca3af' },
  { value: 'pending_verification', label: 'Pending',   dot: '#f59e0b' },
];

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'contract', label: 'Contract' },
  { value: 'intern', label: 'Intern' },
];

export default function CreateUserModal({ onClose, onSuccess, managers = [] }) {
  const { createUser, actionLoading, roles } = useUsersStore();

  // the roles this person may give, from the server (clearance decides, so a role built in the role builder appears here by itself)
  const assignableRoles = roles?.assignable ?? [];

  const [form, setForm] = useState({
    name: '', email: '', password: '', phone: '',
    role: assignableRoles[0]?.key || '',
    company_name: '', employee_id: '', department: '',
    status: 'active', force_password_change: true,
    // Employee-specific fields
    job_title: '',
    employment_type: 'full_time',
    hire_date: '',
    work_location: '',
    manager_id: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError]     = useState('');
  const [showPwd, setShowPwd]         = useState(false);
  const [activeTab, setActiveTab]     = useState('basic'); // 'basic' | 'employee'

  const selectedRole = assignableRoles.find(r => r.key === form.role);
  const isStaff      = selectedRole?.kind === 'staff';
  const chip         = chipOf(selectedRole);

  // the first role you may give, once the list has arrived
  useEffect(() => {
    const first = (roles?.assignable ?? [])[0];
    if (first) setForm(f => (f.role ? f : { ...f, role: first.key }));
  }, [roles]);

  // Reset employee fields when switching to a role that has no employee record
  useEffect(() => {
    if (!isStaff) {
      setActiveTab('basic');
    }
  }, [isStaff]);

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setFieldErrors(e => { const n = { ...e }; delete n[k]; return n; });
    setFormError('');
  };

  const handleSubmit = async () => {
    setFieldErrors({});
    setFormError('');
    try {
      await createUser(form);
      toast.success('User created successfully.');
      onSuccess();
    } catch (err) {
      const status = err.response?.status;
      const data   = err.response?.data;

      if (status === 422 && data?.errors) {
        setFieldErrors(data.errors);
        setFormError('Please fix the errors below before continuing.');
      } else if (status === 403) {
        setFormError(data?.message || 'You do not have permission to create this user.');
      } else {
        setFormError(data?.message || 'Failed to create user. Please try again.');
      }
    }
  };

  const tabs = [
    { id: 'basic', label: 'Basic Info', icon: User },
    ...(isStaff ? [{ id: 'employee', label: 'Employee Details', icon: Briefcase }] : []),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,10,30,0.65)', backdropFilter: 'blur(6px)' }}
    >
      {/* Click-outside */}
      <div className="absolute inset-0" onClick={onClose} />

      <div
        className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          boxShadow: '0 32px 80px color-mix(in srgb, var(--color-primary-600) 20%, transparent), 0 8px 32px rgba(0,0,0,0.25)',
          maxHeight: '90vh',
        }}
      >
        {/* Top accent */}
        <div className="h-1.5 flex-shrink-0" style={{ background: 'linear-gradient(90deg, var(--color-primary-400), var(--color-primary-500), var(--color-primary-600))' }} />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${chip.bg}, ${chip.ring})` }}>
              <UserPlus size={15} style={{ color: chip.color }} />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white leading-tight">Create User</h2>
              <p className="text-xs text-gray-400 leading-tight">
                {isStaff ? 'Add a new staff member' : `Add a new ${(selectedRole?.name || 'user').toLowerCase()} account`}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        {isStaff && (
          <div className="flex border-b border-gray-100 dark:border-gray-800">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50/50 dark:bg-primary-900/10'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <tab.icon size={14} />
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Form-level error */}
          {formError && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800">
              <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-red-600 dark:text-red-400">{formError}</p>
            </div>
          )}

          {activeTab === 'basic' && (
            <>
              {/* Role selector */}
              <div>
                <Label>Role *</Label>
                <div className="flex flex-wrap gap-2">
                  {assignableRoles.map(r => (
                    <button key={r.key} type="button" onClick={() => set('role', r.key)}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                      style={form.role === r.key
                        ? { background: chipOf(r).bg, color: chipOf(r).color, borderColor: chipOf(r).ring, boxShadow: `0 0 0 3px ${chipOf(r).color}18` }
                        : { background: 'transparent', color: 'var(--text-tertiary)', borderColor: 'var(--line)' }
                      }>
                      {r.name}
                    </button>
                  ))}
                </div>
                <Err msg={fieldErrors.role} />
              </div>

              {/* Name + Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField
                  label="Full Name *" icon={<User size={13} />}
                  value={form.name} onChange={v => set('name', v)}
                  placeholder="Jane Smith" error={fieldErrors.name?.[0]}
                />
                <InputField
                  label="Email *" icon={<Mail size={13} />} type="email"
                  value={form.email} onChange={v => set('email', v)}
                  placeholder="jane@example.com" error={fieldErrors.email?.[0]}
                />
              </div>

              {/* Password */}
              <div>
                <Label>Password *</Label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => set('password', e.target.value)}
                    placeholder="Min 10 characters"
                    className={inputCls(fieldErrors.password) + ' pr-10'}
                  />
                  <button type="button" onClick={() => setShowPwd(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <Err msg={fieldErrors.password?.[0]} />
              </div>

              {/* Phone */}
              <InputField
                label="Phone" icon={<Phone size={13} />}
                value={form.phone} onChange={v => set('phone', v)}
                placeholder="+254 700 000 000" error={fieldErrors.phone?.[0]}
              />

              {/* Conditional fields */}
              {!isStaff && (
                <InputField
                  label="Company" icon={<Building2 size={13} />}
                  value={form.company_name} onChange={v => set('company_name', v)}
                  placeholder="Company Ltd." error={fieldErrors.company_name?.[0]}
                />
              )}

              {isStaff && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InputField
                    label="Employee ID" icon={<Hash size={13} />}
                    value={form.employee_id} onChange={v => set('employee_id', v)}
                    placeholder="EMP-001" error={fieldErrors.employee_id?.[0]}
                  />
                  <InputField
                    label="Department" icon={<Briefcase size={13} />}
                    value={form.department} onChange={v => set('department', v)}
                    placeholder="Sales" error={fieldErrors.department?.[0]}
                  />
                </div>
              )}

              {/* Status */}
              <div>
                <Label icon={<Shield size={13} />}>Initial Status</Label>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map(s => (
                    <button key={s.value} type="button" onClick={() => set('status', s.value)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                      style={form.status === s.value
                        ? { background: s.dot + '18', color: s.dot === 'var(--text-tertiary)' ? 'var(--text-secondary)' : s.dot, borderColor: s.dot + '66', boxShadow: `0 0 0 3px ${s.dot}18` }
                        : { background: 'transparent', color: 'var(--text-tertiary)', borderColor: 'var(--line)' }
                      }>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.dot }} />
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Force password reset */}
              <button
                type="button"
                onClick={() => set('force_password_change', !form.force_password_change)}
                className="w-full flex items-start gap-3 p-4 rounded-2xl border text-left transition-all"
                style={form.force_password_change
                  ? { background: 'var(--surface-input)', borderColor: '#c4b5fd' }
                  : { background: 'var(--surface-input)', borderColor: 'var(--line)' }
                }>
                <div
                  className="mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all"
                  style={{ background: form.force_password_change ? 'var(--color-primary-600)' : '#e5e7eb' }}>
                  {form.force_password_change && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Require password reset on first login
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Recommended when setting a temporary password
                  </p>
                </div>
              </button>
            </>
          )}

          {activeTab === 'employee' && isStaff && (
            <>
              {/* Job Title + Employment Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField
                  label="Job Title" icon={<Briefcase size={13} />}
                  value={form.job_title} onChange={v => set('job_title', v)}
                  placeholder="Senior Sales Representative" error={fieldErrors.job_title?.[0]}
                />
                <div>
                  <Label icon={<GraduationCap size={13} />}>Employment Type</Label>
                  <select
                    value={form.employment_type}
                    onChange={e => set('employment_type', e.target.value)}
                    className={inputCls(fieldErrors.employment_type)}
                  >
                    {EMPLOYMENT_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                  <Err msg={fieldErrors.employment_type?.[0]} />
                </div>
              </div>

              {/* Hire Date + Work Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label icon={<Calendar size={13} />}>Hire Date</Label>
                  <input
                    type="date"
                    value={form.hire_date}
                    onChange={e => set('hire_date', e.target.value)}
                    className={inputCls(fieldErrors.hire_date)}
                  />
                  <Err msg={fieldErrors.hire_date?.[0]} />
                </div>
                <InputField
                  label="Work Location" icon={<MapPin size={13} />}
                  value={form.work_location} onChange={v => set('work_location', v)}
                  placeholder="Nairobi Office" error={fieldErrors.work_location?.[0]}
                />
              </div>

              {/* Manager */}
              {managers.length > 0 && (
                <div>
                  <Label icon={<Users size={13} />}>Reports To (Manager)</Label>
                  <select
                    value={form.manager_id}
                    onChange={e => set('manager_id', e.target.value)}
                    className={inputCls(fieldErrors.manager_id)}
                  >
                    <option value="">-- Select Manager --</option>
                    {managers.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} - {m.job_title}
                      </option>
                    ))}
                  </select>
                  <Err msg={fieldErrors.manager_id?.[0]} />
                </div>
              )}

              {/* Emergency Contact */}
              <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Shield size={14} className="text-primary-500" />
                  Emergency Contact
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InputField
                    label="Contact Name"
                    value={form.emergency_contact_name} onChange={v => set('emergency_contact_name', v)}
                    placeholder="John Doe" error={fieldErrors.emergency_contact_name?.[0]}
                  />
                  <InputField
                    label="Contact Phone"
                    value={form.emergency_contact_phone} onChange={v => set('emergency_contact_phone', v)}
                    placeholder="+254 700 000 000" error={fieldErrors.emergency_contact_phone?.[0]}
                  />
                </div>
                <div className="mt-3">
                  <InputField
                    label="Relationship"
                    value={form.emergency_contact_relationship} onChange={v => set('emergency_contact_relationship', v)}
                    placeholder="Spouse, Parent, Sibling, etc." error={fieldErrors.emergency_contact_relationship?.[0]}
                  />
                </div>
              </div>
            </>
          )}

          {/* Field errors summary (only if many errors) */}
          {Object.keys(fieldErrors).length > 1 && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-100 dark:bg-red-900/10 dark:border-red-900/30 space-y-1">
              <p className="text-xs font-bold text-red-500 uppercase tracking-wide mb-2">Fix the following:</p>
              {Object.entries(fieldErrors).map(([field, msgs]) => (
                <p key={field} className="text-xs text-red-500">
                  <span className="font-semibold capitalize">{field.replace(/_/g, ' ')}</span>
                  {' — '}{Array.isArray(msgs) ? msgs[0] : msgs}
                </p>
              ))}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900 flex-shrink-0">
          {isStaff && activeTab === 'basic' && (
            <button 
              onClick={() => setActiveTab('employee')}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-primary-200 text-primary-600 hover:bg-primary-50 transition-colors"
            >
              Next: Employee Details
            </button>
          )}
          {isStaff && activeTab === 'employee' && (
            <button 
              onClick={() => setActiveTab('basic')}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Back
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={actionLoading}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60 transition-opacity flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))', boxShadow: '0 4px 14px color-mix(in srgb, var(--color-primary-500) 35%, transparent)' }}>
            {actionLoading
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating…</>
              : <><UserPlus size={14} /> Create User</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Label({ icon, children }) {
  return (
    <label className="flex items-center gap-1 text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">
      {icon} {children}
    </label>
  );
}

function InputField({ label, icon, value, onChange, placeholder, type = 'text', error }) {
  return (
    <div>
      {label && <Label icon={icon}>{label}</Label>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls(error)}
      />
      <Err msg={error} />
    </div>
  );
}

function Err({ msg }) {
  if (!msg) return null;
  return (
    <p className="flex items-center gap-1 text-xs text-red-500 mt-1.5">
      <AlertCircle size={11} className="flex-shrink-0" /> {msg}
    </p>
  );
}

const inputCls = (error) =>
  `w-full px-3 py-2.5 rounded-xl text-sm border outline-none transition-all dark:bg-gray-800 dark:text-white placeholder:text-gray-300 dark:placeholder:text-gray-600 ${
    error
      ? 'border-red-400 bg-red-50/30 focus:border-red-400 focus:ring-2 focus:ring-red-100'
      : 'border-gray-200 dark:border-gray-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100'
  }`;