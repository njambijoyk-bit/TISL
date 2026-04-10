import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Save, User, Mail, Phone, Briefcase, Building2,
  Calendar, MapPin, DollarSign, Shield, AlertCircle, Users,
  GraduationCap, Hash, CreditCard
} from 'lucide-react';
import toast from 'react-hot-toast';
import employeesApi from '../../../api/employees';

// ── Constants ──────────────────────────────────────────────────────────────────

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'contract',  label: 'Contract'  },
  { value: 'intern',    label: 'Intern'    },
];

const STATUS_OPTIONS = [
  { value: 'active',     label: 'Active'     },
  { value: 'probation',  label: 'Probation'  },
  { value: 'on_leave',   label: 'On Leave'   },
  { value: 'suspended',  label: 'Suspended'  },
  { value: 'terminated', label: 'Terminated' },
];

const GENDER_OPTIONS = [
  { value: '',                label: 'Select gender'       },
  { value: 'male',            label: 'Male'                },
  { value: 'female',          label: 'Female'              },
  { value: 'other',           label: 'Other'               },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const MARITAL_OPTIONS = [
  { value: '',        label: 'Select status' },
  { value: 'single',  label: 'Single'        },
  { value: 'married', label: 'Married'       },
  { value: 'divorced',label: 'Divorced'      },
  { value: 'widowed', label: 'Widowed'       },
];

const EMPTY_FORM = {
  name: '', email: '', phone: '',
  employee_id: '', job_title: '', department: '',
  employment_type: 'full_time', hire_date: '',
  work_location: '', work_email: '', work_phone: '',
  manager_id: '', status: 'active',
  date_of_birth: '', gender: '', marital_status: '',
  education_level: '',
  id_number: '', kra_pin: '', nssf_number: '', nhif_number: '',
  emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relationship: '',
  salary_grade: '', base_salary: '', currency: 'KES', annual_leave_days: 21,
  bank_name: '', bank_account_name: '', bank_account_number: '',
  skills: [], certifications: [],
  notes: '',
};

// ── Shared styles ──────────────────────────────────────────────────────────────

const card = {
  background: 'white',
  borderRadius: 12,
  border: '1px solid rgba(168,85,247,0.1)',
  boxShadow: '0 2px 12px rgba(168,85,247,0.06)',
};

const baseInput = {
  width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem',
  background: 'rgba(168,85,247,0.03)', border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#111827', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  transition: 'border-color 150ms, box-shadow 150ms',
};

const errorInput = {
  ...baseInput,
  borderColor: 'rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.02)',
};

const iFocus = e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; };
const iBlur  = e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; };
const eFocus = e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.08)'; };
const eBlur  = e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)'; e.currentTarget.style.boxShadow = 'none'; };

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionCard({ title, icon: Icon, children }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px', borderBottom: '1px solid rgba(168,85,247,0.08)' }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(168,85,247,0.08)', color: '#a855f7' }}>
          <Icon size={14} />
        </div>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151' }}>{title}</span>
      </div>
      <div style={{ padding: '16px 18px' }}>{children}</div>
    </div>
  );
}

function Field({ label, required, error, children }) {
  return (
    <div>
      <label style={{ fontSize: '0.7rem', fontWeight: 700, color: error ? '#b91c1c' : '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {error && <p style={{ fontSize: '0.68rem', color: '#b91c1c', margin: '4px 0 0', fontWeight: 500 }}>{error}</p>}
    </div>
  );
}

function Input({ value, onChange, error, type = 'text', placeholder, icon: Icon }) {
  const style = error ? errorInput : baseInput;
  return (
    <div style={{ position: 'relative' }}>
      {Icon && <Icon size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#c4b5fd', pointerEvents: 'none' }} />}
      <input
        type={type} value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...style, paddingLeft: Icon ? 30 : 12 }}
        onFocus={error ? eFocus : iFocus}
        onBlur={error ? eBlur : iBlur}
      />
    </div>
  );
}

function Select({ value, onChange, options, error }) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      style={error ? errorInput : baseInput}
      onFocus={error ? eFocus : iFocus}
      onBlur={error ? eBlur : iBlur}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Grid({ cols = 3, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14 }}>
      {children}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function EmployeeForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [loading, setLoading]   = useState(isEditing);
  const [saving, setSaving]     = useState(false);
  const [managers, setManagers] = useState([]);
  const [errors, setErrors]     = useState({});
  const [form, setForm]         = useState(EMPTY_FORM);

  useEffect(() => {
    fetchManagers();
    if (isEditing) fetchEmployee();
  }, [id]);

  const fetchManagers = async () => {
    try { const data = await employeesApi.getPotentialManagers(); setManagers(data.data || []); }
    catch { console.error('Failed to fetch managers'); }
  };

  const fetchEmployee = async () => {
    try {
      const data = await employeesApi.getEmployee(id);
      const emp = data.employee;

      // date inputs need YYYY-MM-DD — API returns ISO strings like "2026-03-25T00:00:00.000000Z"
      const toDateInput = (val) => val ? val.toString().slice(0, 10) : '';

      setForm({
        name: emp.user?.name || '', email: emp.user?.email || '', phone: emp.user?.phone || '',
        employee_id: emp.employee_id || '', job_title: emp.job_title || '',
        department: emp.department || '', employment_type: emp.employment_type || 'full_time',
        hire_date: toDateInput(emp.hire_date), work_location: emp.work_location || '',
        work_email: emp.work_email || '', work_phone: emp.work_phone || '',
        manager_id: emp.manager_id || '', status: emp.status || 'active',
        date_of_birth: toDateInput(emp.date_of_birth), gender: emp.gender || '',
        marital_status: emp.marital_status || '', education_level: emp.education_level || '',
        id_number: emp.id_number || '', kra_pin: emp.kra_pin || '',
        nssf_number: emp.nssf_number || '', nhif_number: emp.nhif_number || '',
        emergency_contact_name: emp.emergency_contact_name || '',
        emergency_contact_phone: emp.emergency_contact_phone || '',
        emergency_contact_relationship: emp.emergency_contact_relationship || '',
        salary_grade: emp.salary_grade || '', base_salary: emp.base_salary || '',
        currency: emp.currency || 'KES', annual_leave_days: emp.annual_leave_days || 21,
        bank_name: emp.bank_name || '', bank_account_name: emp.bank_account_name || '',
        bank_account_number: emp.bank_account_number || '',
        skills: emp.skills || [], certifications: emp.certifications || [],
        notes: emp.notes || '',
      });
    } catch { toast.error('Failed to load employee'); navigate('/admin/employees'); }
    finally { setLoading(false); }
  };

  const set = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    if (errors[field]) setErrors(e => { const n = { ...e }; delete n[field]; return n; });
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim())       e.name       = 'Name is required';
    if (!form.email.trim())      e.email      = 'Email is required';
    if (!form.job_title.trim())  e.job_title  = 'Job title is required';
    if (!form.department.trim()) e.department = 'Department is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      if (isEditing) { await employeesApi.updateEmployee(id, form); toast.success('Employee updated'); }
      else { await employeesApi.createEmployee(form); toast.success('Employee created'); }
      navigate('/admin/employees');
    } catch (err) {
      if (err.response?.data?.errors) { setErrors(err.response.data.errors); toast.error('Please fix the errors'); }
      else toast.error(err.response?.data?.message || 'Failed to save employee');
    } finally { setSaving(false); }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ width: 36, height: 36, border: '3px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
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
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.02em', margin: '0 0 2px' }}>
              {isEditing ? 'Edit Employee' : 'New Employee'}
            </h1>
            <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>
              {isEditing ? 'Update employee details' : 'Add a new employee record'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => navigate('/admin/employees')} style={{ padding: '8px 16px', borderRadius: 9, border: '1.5px solid rgba(168,85,247,0.2)', background: 'none', fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 150ms' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'}
          >
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white', boxShadow: '0 4px 14px rgba(168,85,247,0.35)', opacity: saving ? 0.7 : 1, transition: 'box-shadow 150ms' }}
            onMouseEnter={e => { if (!saving) e.currentTarget.style.boxShadow = '0 6px 20px rgba(168,85,247,0.5)'; }}
            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 14px rgba(168,85,247,0.35)'}
          >
            <Save size={14} />
            {saving ? 'Saving…' : isEditing ? 'Update Employee' : 'Create Employee'}
          </button>
        </div>
      </div>

      {/* ── Basic Info ── */}
      <SectionCard title="Basic Information" icon={User}>
        <Grid cols={3}>
          <Field label="Full Name" required error={errors.name}>
            <Input value={form.name} onChange={v => set('name', v)} error={errors.name} icon={User} placeholder="Jane Doe" />
          </Field>
          <Field label="Email" required error={errors.email}>
            <Input value={form.email} onChange={v => set('email', v)} error={errors.email} type="email" icon={Mail} placeholder="jane@company.com" />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={v => set('phone', v)} icon={Phone} placeholder="+254 7xx xxx xxx" />
          </Field>
        </Grid>
      </SectionCard>

      {/* ── Employment ── */}
      <SectionCard title="Employment Details" icon={Briefcase}>
        <Grid cols={3}>
          <Field label="Employee ID">
            <Input value={form.employee_id} onChange={v => set('employee_id', v)} icon={Hash} placeholder="EMP-001" />
          </Field>
          <Field label="Job Title" required error={errors.job_title}>
            <Input value={form.job_title} onChange={v => set('job_title', v)} error={errors.job_title} icon={Briefcase} placeholder="Software Engineer" />
          </Field>
          <Field label="Department" required error={errors.department}>
            <Input value={form.department} onChange={v => set('department', v)} error={errors.department} icon={Building2} placeholder="Engineering" />
          </Field>
          <Field label="Employment Type">
            <Select value={form.employment_type} onChange={v => set('employment_type', v)} options={EMPLOYMENT_TYPES} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={v => set('status', v)} options={STATUS_OPTIONS} />
          </Field>
          <Field label="Hire Date">
            <input type="date" value={form.hire_date} onChange={e => set('hire_date', e.target.value)} style={baseInput} onFocus={iFocus} onBlur={iBlur} />
          </Field>
          <Field label="Work Location">
            <Input value={form.work_location} onChange={v => set('work_location', v)} icon={MapPin} placeholder="Nairobi HQ" />
          </Field>
          <Field label="Work Email">
            <Input value={form.work_email} onChange={v => set('work_email', v)} type="email" icon={Mail} placeholder="work@company.com" />
          </Field>
          <Field label="Work Phone">
            <Input value={form.work_phone} onChange={v => set('work_phone', v)} icon={Phone} />
          </Field>
          <Field label="Reports To">
            <select value={form.manager_id} onChange={e => set('manager_id', e.target.value)} style={baseInput} onFocus={iFocus} onBlur={iBlur}>
              <option value="">— No Manager —</option>
              {managers.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.job_title ? ` · ${m.job_title}` : ''}{m.department ? ` (${m.department})` : ''}{m.role ? ` [${m.role.replace('_', ' ')}]` : ''}
                </option>
              ))}
            </select>
          </Field>
        </Grid>
      </SectionCard>

      {/* ── Personal ── */}
      <SectionCard title="Personal Information" icon={Shield}>
        <Grid cols={3}>
          <Field label="Date of Birth">
            <input type="date" value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} style={baseInput} onFocus={iFocus} onBlur={iBlur} />
          </Field>
          <Field label="Gender">
            <Select value={form.gender} onChange={v => set('gender', v)} options={GENDER_OPTIONS} />
          </Field>
          <Field label="Marital Status">
            <Select value={form.marital_status} onChange={v => set('marital_status', v)} options={MARITAL_OPTIONS} />
          </Field>
          <Field label="Education Level">
            <Input value={form.education_level} onChange={v => set('education_level', v)} icon={GraduationCap} placeholder="Bachelor's Degree" />
          </Field>
        </Grid>
      </SectionCard>

      {/* ── Identification ── */}
      <SectionCard title="Identification" icon={Hash}>
        <Grid cols={4}>
          <Field label="ID Number"><Input value={form.id_number} onChange={v => set('id_number', v)} placeholder="12345678" /></Field>
          <Field label="KRA PIN"><Input value={form.kra_pin} onChange={v => set('kra_pin', v)} placeholder="A000000000X" /></Field>
          <Field label="NSSF Number"><Input value={form.nssf_number} onChange={v => set('nssf_number', v)} /></Field>
          <Field label="NHIF Number"><Input value={form.nhif_number} onChange={v => set('nhif_number', v)} /></Field>
        </Grid>
      </SectionCard>

      {/* ── Emergency Contact ── */}
      <SectionCard title="Emergency Contact" icon={Users}>
        <Grid cols={3}>
          <Field label="Contact Name"><Input value={form.emergency_contact_name} onChange={v => set('emergency_contact_name', v)} icon={User} /></Field>
          <Field label="Contact Phone"><Input value={form.emergency_contact_phone} onChange={v => set('emergency_contact_phone', v)} icon={Phone} /></Field>
          <Field label="Relationship"><Input value={form.emergency_contact_relationship} onChange={v => set('emergency_contact_relationship', v)} placeholder="e.g. Spouse, Parent" /></Field>
        </Grid>
      </SectionCard>

      {/* ── Compensation ── */}
      <SectionCard title="Compensation" icon={DollarSign}>
        <Grid cols={4}>
          <Field label="Salary Grade"><Input value={form.salary_grade} onChange={v => set('salary_grade', v)} placeholder="G4" /></Field>
          <Field label="Base Salary"><Input value={form.base_salary} onChange={v => set('base_salary', v)} type="number" icon={DollarSign} placeholder="50000" /></Field>
          <Field label="Currency"><Input value={form.currency} onChange={v => set('currency', v)} placeholder="KES" /></Field>
          <Field label="Annual Leave Days"><Input value={form.annual_leave_days} onChange={v => set('annual_leave_days', v)} type="number" icon={Calendar} /></Field>
        </Grid>
      </SectionCard>

      {/* ── Bank Details ── */}
      <SectionCard title="Bank Details" icon={CreditCard}>
        <Grid cols={3}>
          <Field label="Bank Name"><Input value={form.bank_name} onChange={v => set('bank_name', v)} placeholder="Equity Bank" /></Field>
          <Field label="Account Name"><Input value={form.bank_account_name} onChange={v => set('bank_account_name', v)} /></Field>
          <Field label="Account Number"><Input value={form.bank_account_number} onChange={v => set('bank_account_number', v)} /></Field>
        </Grid>
      </SectionCard>

      {/* ── Notes ── */}
      <SectionCard title="Notes" icon={AlertCircle}>
        <textarea
          value={form.notes} onChange={e => set('notes', e.target.value)}
          rows={4} placeholder="Additional notes about this employee…"
          style={{ ...baseInput, resize: 'vertical', lineHeight: 1.6 }}
          onFocus={iFocus} onBlur={iBlur}
        />
      </SectionCard>

      {/* ── Footer actions ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button onClick={() => navigate('/admin/employees')} style={{ padding: '9px 20px', borderRadius: 9, border: '1.5px solid rgba(168,85,247,0.2)', background: 'none', fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}>
          Cancel
        </button>
        <button onClick={handleSubmit} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 22px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white', boxShadow: '0 4px 14px rgba(168,85,247,0.35)', opacity: saving ? 0.7 : 1 }}>
          <Save size={14} />
          {saving ? 'Saving…' : isEditing ? 'Update Employee' : 'Create Employee'}
        </button>
      </div>
    </div>
  );
}