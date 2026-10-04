import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  User, Mail, Phone, Shield, Key, LogOut, ChevronRight,
  FolderOpen, FileText, AlertCircle, MapPin, ShoppingBag,
  Eye, EyeOff, Loader2, ShieldCheck, ShieldAlert, Award,
  UserCheck, ClipboardList, TrendingUp, Briefcase, Hash,
  ArrowRight, CalendarClock, Bell, Truck,
  ChevronDown, ChevronUp, Users, Star, Ticket, Camera, Calendar, CalendarCheck,
} from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import MyCalendar from './calendar/MyCalendar';
import LoadingSpinner from '../../../_shared/components/layout/LoadingSpinner';
import NotificationsModal from '../../../_shared/components/common/NotificationsModal';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../../_shared/store/index';
import { authAPI, notificationsAPI } from '../../../_shared/api/index';
import calendarAPI from '../../../_shared/api/calendar';
import employeesAPI from '../../../_shared/api/employees';

// ─── Style constants (matching customer Profile) ──────────────────────────────

const card = {
  background: 'var(--surface-card, #fff)',
  borderRadius: 12,
  border: '1px solid var(--line)',
  boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
  padding: 24,
};

const sectionTitle = {
  fontSize: '0.875rem',
  fontWeight: 700,
  color: 'var(--text-primary)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  margin: '0 0 18px',
  paddingBottom: 12,
  borderBottom: '1px solid var(--line)',
};

const labelStyle = {
  fontSize: '0.75rem',
  fontWeight: 600,
  color: 'var(--text-primary)',
  display: 'block',
  marginBottom: 4,
};

const inputStyle = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  fontSize: '0.875rem',
  border: '1.5px solid var(--line)',
  color: 'var(--text-primary)',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  background: 'var(--surface-card, #fff)',
};

const STATUS_COLORS = {
  active:     { bg: '#dcfce7', text: '#166534', dot: '#22c55e' },
  on_leave:   { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
  probation:  { bg: '#e0e7ff', text: '#3730a3', dot: 'var(--color-primary-500)' },
  suspended:  { bg: '#fee2e2', text: '#991b1b', dot: '#ef4444' },
  terminated: { bg: '#f3f4f6', text: '#6b7280', dot: '#9ca3af' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminProfile() {
  const navigate  = useNavigate();
  const { user, logout, updateUser } = useAuthStore();

  const [activeTab, setActiveTab] = useState('overview');
  const [loading,   setLoading]   = useState(true);

  // what is on my calendar over the next 30 days: the quick stats, the work summary and the upcoming list all read from it
  const [calEntries, setCalEntries] = useState([]);

  // Password
  const [pwd,      setPwd]      = useState({ current_password: '', new_password: '', new_password_confirmation: '' });
  const [showPwd,  setShowPwd]  = useState({ current: false, new: false, confirm: false });
  const [savingPwd,setSavingPwd]= useState(false);
  const [pwdErrors,setPwdErrors]= useState({});

  const [empRecord, setEmpRecord] = useState(null);
  const [empLoading, setEmpLoading] = useState(false);

  // Profile picture
  const imgInputRef = useRef(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    notificationsAPI.unreadCount()
      .then(res => setUnreadCount(res.data.count))
      .catch(() => {});
  }, []);

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImgLoading(true);
      const formData = new FormData();
      formData.append('image', file);
      const res = await authAPI.uploadProfilePicture(formData);
      updateUser({ ...user, profile_picture_url: res.profile_picture_url });
      toast.success('Profile picture updated');
    } catch {
      toast.error('Image upload failed');
    } finally {
      setImgLoading(false);
    }
  };
  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    fetchDashboard();
    if (user?.role !== 'driver') fetchEmployeeRecord();
  }, [user?.id]);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const from = new Date(); const to = new Date(); to.setDate(to.getDate() + 30);
      const res = await calendarAPI.mine({ from: ymd(from), to: ymd(to) });
      setCalEntries(res?.entries ?? []);
    } catch (err) {
      console.error('Calendar error:', err.response?.data || err.message);   // the page still works without the numbers
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployeeRecord = async () => {
    setEmpLoading(true);
    try {
      const data = await employeesAPI.getMyRecord();
      setEmpRecord(data.employee);
    } catch { /* not all admins have an employee record, silently fail */ }
    finally { setEmpLoading(false); }
  };

  // ── Password ───────────────────────────────────────────────────────────────
  const handlePasswordSave = async (e) => {
    e.preventDefault();
    setPwdErrors({});
    if (pwd.new_password !== pwd.new_password_confirmation) {
      setPwdErrors({ new_password_confirmation: ['Passwords do not match.'] });
      return;
    }
    setSavingPwd(true);
    try {
      await authAPI.changePassword({
        current_password:          pwd.current_password,
        new_password:              pwd.new_password,
        new_password_confirmation: pwd.new_password_confirmation,
      });
      toast.success('Password changed successfully');
      setPwd({ current_password: '', new_password: '', new_password_confirmation: '' });
    } catch (e) {
      const errs = e.response?.data?.errors;
      if (errs) setPwdErrors(errs);
      else toast.error(e.response?.data?.message || 'Failed to change password');
    } finally {
      setSavingPwd(false);
    }
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const kindCount = (k) => calEntries.filter((e) => e.kind === k).length;
  const upcoming = [...calEntries].filter((e) => new Date(e.starts_at) >= new Date(new Date().setHours(0, 0, 0, 0))).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)).slice(0, 5);

  const daysUntil = (dateStr) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  };

  if (loading) return <LoadingSpinner />;

  const TABS = [
    { key: 'overview',    label: 'Overview',  icon: User },
    { key: 'calendar',    label: 'My Calendar', icon: CalendarCheck },
    { key: 'employee',    label: 'Employee Record', icon: UserCheck },
    { key: 'security',    label: 'Security',  icon: Key },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <style>{`
        @media (max-width: 600px) {
          .stats-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 400px) {
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 600px) {
          .info-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 900px) {
          .admin-profile-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Header Banner ────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, var(--color-primary-600) 0%, var(--color-primary-700) 100%)', color: 'white' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {imgLoading ? (
                <div style={{
                  width: 72, height: 72, borderRadius: 16,
                  background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)',
                  border: '2px solid rgba(255,255,255,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Loader2 size={20} style={{ color: 'white', animation: 'spin 1s linear infinite' }} />
                </div>
              ) : user?.profile_picture_url && !user.profile_picture_url.includes('ui-avatars.com') ? (
                <img
                  src={user.profile_picture_url}
                  alt={user.name}
                  style={{
                    width: 72, height: 72, borderRadius: 16, objectFit: 'cover',
                    border: '2px solid rgba(255,255,255,0.3)', display: 'block',
                  }}
                />
              ) : (
                <div style={{
                  width: 72, height: 72, borderRadius: 16,
                  background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)',
                  border: '2px solid rgba(255,255,255,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em',
                }}>
                  {user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'AD'}
                </div>
              )}
              <button
                onClick={() => imgInputRef.current?.click()}
                disabled={imgLoading}
                style={{
                  position: 'absolute', bottom: -4, right: -4, width: 26, height: 26,
                  borderRadius: '50%', background: 'white', border: '1.5px solid rgba(255,255,255,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                  transition: 'border-color 150ms',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-primary-500)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'}
              >
                <Camera size={11} style={{ color: 'var(--color-primary-600)' }} />
              </button>
              <input ref={imgInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
                  {user?.name || 'Admin User'}
                </h1>
                <span style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700,
                  background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  {user?.role?.replace(/_/g, ' ')}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', opacity: 0.8 }}>{user?.email}</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setShowNotifications(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 14px', borderRadius: 10, fontSize: '0.8rem', fontWeight: 700,
                  fontFamily: 'inherit', cursor: 'pointer',
                  border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)',
                  background: 'white', color: 'var(--color-primary-600)',
                  transition: 'background 150ms',
                  boxShadow: '0 1px 6px color-mix(in srgb, var(--color-primary-500) 8%, transparent)',
                  position: 'relative',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)'}
                onMouseLeave={e => e.currentTarget.style.background = 'white'}
              >
                <Bell size={13} />
                Notifications
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: -6, right: -6,
                    minWidth: 18, height: 18, borderRadius: 99,
                    background: '#ef4444', border: '2px solid white',
                    fontSize: '0.6rem', fontWeight: 800, color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 4px',
                  }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Layout ──────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px', width: '100%', boxSizing: 'border-box', flex: 1 }}>
        <div className="admin-profile-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 24, alignItems: 'start' }}>

          {/* ── Left: main panel ──────────────────────────────────────────── */}
          <div>
            {/* Tab bar */}
            <div style={{ 
              display: 'flex', gap: 2, marginBottom: 16, 
              borderBottom: '2px solid var(--line)', 
              flexWrap: 'wrap'  
            }}>
              {TABS.map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '9px 16px', fontSize: '0.82rem',
                  fontWeight: activeTab === t.key ? 700 : 500,
                  color: activeTab === t.key ? 'var(--color-primary-600)' : 'var(--text-tertiary)',
                  background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  borderBottom: `2px solid ${activeTab === t.key ? 'var(--color-primary-600)' : 'transparent'}`,
                  marginBottom: -2,
                }}>
                  <t.icon size={14} /> {t.label}
                </button>
              ))}
            </div>

            {/* ── OVERVIEW TAB ──────────────────────────────────────────── */}
            {activeTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={card}>
                  <p style={sectionTitle}><User size={14} style={{ color: 'var(--color-primary-600)' }} /> Personal information</p>
                  <div className="info-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    {[
                      { label: 'Full Name', value: user?.name },
                      { label: 'Email',     value: user?.email },
                      { label: 'Phone',     value: user?.phone || '—' },
                      { label: 'Role',      value: user?.role?.replace(/_/g, ' ')?.toUpperCase() },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <label style={labelStyle}>{label}</label>
                        <p style={{
                          margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)',
                          padding: '9px 12px', background: 'var(--surface-input)', borderRadius: 8, border: '1px solid var(--line)',
                        }}>
                          {value || '—'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick stats */}
                <div style={card}>
                  <p style={sectionTitle}><TrendingUp size={14} style={{ color: 'var(--color-primary-600)' }} /> Quick stats <span style={{ fontWeight: 400, fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>· from your calendar, next 30 days</span></p>
                  <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    {[
                      { label: 'Tasks',      value: kindCount('task'),      color: '#3b82f6', bg: '#eff6ff', ink: '#1d4ed8' },
                      { label: 'Milestones', value: kindCount('milestone'), color: '#10b981', bg: '#f0fdf4', ink: '#047857' },
                      { label: 'Bookings',   value: kindCount('booking'),   color: '#f59e0b', bg: '#fffbeb', ink: '#b45309' },
                      { label: 'Project ends', value: kindCount('project'), color: '#06b6d4', bg: '#ecfeff', ink: '#0e7490' },
                    ].map(({ label, value, color, bg, ink }) => (
                      <div key={label} style={{ padding: 16, borderRadius: 10, background: bg, textAlign: 'center' }}>
                        <p style={{ fontSize: '1.6rem', fontWeight: 800, color, margin: '0 0 2px' }}>{value}</p>
                        <p style={{ fontSize: '0.72rem', color: ink, margin: 0, fontWeight: 700 }}>{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── MY CALENDAR TAB ── */}
            {activeTab === 'calendar' && <MyCalendar embedded />}

            {activeTab === 'employee' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {empLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                    <div style={{ width: 28, height: 28, border: '3px solid color-mix(in srgb, var(--color-primary-600) 20%, transparent)', borderTopColor: 'var(--color-primary-600)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  </div>
                ) : !empRecord ? (
                  <div style={{ ...card, textAlign: 'center', padding: 40 }}>
                    <UserCheck size={36} style={{ color: '#d1d5db', display: 'block', margin: '0 auto 10px' }} />
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', margin: 0 }}>No employee record linked to your account.</p>
                  </div>
                ) : (
                  <>
                    {/* Employment */}
                    <div style={card}>
                      <p style={sectionTitle}><Briefcase size={14} style={{ color: 'var(--color-primary-600)' }} /> Employment Details</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {[
                          { label: 'Employee Number', value: empRecord.employee_number },
                          { label: 'Employee ID',     value: empRecord.employee_id },
                          { label: 'Job Title',       value: empRecord.job_title },
                          { label: 'Department',      value: empRecord.department },
                          { label: 'Employment Type', value: empRecord.employment_type?.replace(/_/g, ' ') },
                          { label: 'Status',          value: empRecord.status },
                          { label: 'Work Location',   value: empRecord.work_location },
                          { label: 'Work Email',      value: empRecord.work_email },
                          { label: 'Work Phone',      value: empRecord.work_phone },
                          { label: 'Hire Date',       value: fmtDate(empRecord.hire_date) },
                          { label: 'Termination Date',value: fmtDate(empRecord.termination_date) },
                          { label: 'Annual Leave Days', value: empRecord.annual_leave_days },
                          { label: 'Leave Balance',   value: empRecord.leave_balance ? `${empRecord.leave_balance} days` : null },
                        ].map(({ label, value }) => value ? (
                          <div key={label}>
                            <label style={{ ...labelStyle, fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>{label}</label>
                            <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', padding: '7px 10px', background: 'var(--surface-input)', borderRadius: 7, border: '1px solid var(--line)' }}>{value}</p>
                          </div>
                        ) : null)}
                      </div>
                    </div>

                    {/* Personal */}
                    <div style={card}>
                      <p style={sectionTitle}><User size={14} style={{ color: 'var(--color-primary-600)' }} /> Personal Information</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {[
                          { label: 'Date of Birth',  value: fmtDate(empRecord.date_of_birth) },
                          { label: 'Gender',         value: empRecord.gender?.replace(/_/g, ' ') },
                          { label: 'Marital Status', value: empRecord.marital_status },
                          { label: 'Education',      value: empRecord.education_level },
                        ].map(({ label, value }) => value ? (
                          <div key={label}>
                            <label style={{ ...labelStyle, fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>{label}</label>
                            <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', padding: '7px 10px', background: 'var(--surface-input)', borderRadius: 7, border: '1px solid var(--line)' }}>{value}</p>
                          </div>
                        ) : null)}
                      </div>
                    </div>

                    {/* Identification */}
                    <div style={card}>
                      <p style={sectionTitle}><Hash size={14} style={{ color: 'var(--color-primary-600)' }} /> Identification</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {[
                          { label: 'ID Number',   value: empRecord.id_number },
                          { label: 'KRA PIN',     value: empRecord.kra_pin },
                          { label: 'NSSF Number', value: empRecord.nssf_number },
                          { label: 'NHIF Number', value: empRecord.nhif_number },
                        ].map(({ label, value }) => value ? (
                          <div key={label}>
                            <label style={{ ...labelStyle, fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>{label}</label>
                            <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', padding: '7px 10px', background: 'var(--surface-input)', borderRadius: 7, border: '1px solid var(--line)', fontFamily: 'monospace' }}>{value}</p>
                          </div>
                        ) : null)}
                      </div>
                    </div>

                    {/* Emergency Contact */}
                    {(empRecord.emergency_contact_name || empRecord.emergency_contact_phone) && (
                      <div style={card}>
                        <p style={sectionTitle}><Users size={14} style={{ color: 'var(--color-primary-600)' }} /> Emergency Contact</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          {[
                            { label: 'Name',         value: empRecord.emergency_contact_name },
                            { label: 'Phone',        value: empRecord.emergency_contact_phone },
                            { label: 'Relationship', value: empRecord.emergency_contact_relationship },
                          ].map(({ label, value }) => value ? (
                            <div key={label}>
                              <label style={{ ...labelStyle, fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>{label}</label>
                              <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', padding: '7px 10px', background: 'var(--surface-input)', borderRadius: 7, border: '1px solid var(--line)' }}>{value}</p>
                            </div>
                          ) : null)}
                        </div>
                      </div>
                    )}

                    {/* Skills */}
                    {empRecord.skills?.length > 0 && (
                      <div style={card}>
                        <p style={sectionTitle}><Star size={14} style={{ color: 'var(--color-primary-600)' }} /> Skills</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {empRecord.skills.map((skill, i) => (
                            <span key={i} style={{ padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, background: 'var(--surface-input)', color: 'var(--color-primary-600)', border: '1px solid color-mix(in srgb, var(--color-primary-500) 10%, var(--bg-primary))' }}>
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Certifications */}
                    {empRecord.certifications?.length > 0 && (
                      <div style={card}>
                        <p style={sectionTitle}><Award size={14} style={{ color: 'var(--color-primary-600)' }} /> Certifications</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {empRecord.certifications.map((cert, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--surface-input)', border: '1px solid var(--line)' }}>
                              <Award size={15} style={{ color: 'var(--color-primary-600)', flexShrink: 0, marginTop: 1 }} />
                              <div>
                                <p style={{ margin: '0 0 1px', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{cert.name || cert}</p>
                                {cert.issuer && <p style={{ margin: '0 0 1px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{cert.issuer}</p>}
                                {cert.date && <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>{fmtDate(cert.date)}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {empRecord.notes && (
                      <div style={card}>
                        <p style={sectionTitle}><FileText size={14} style={{ color: 'var(--color-primary-600)' }} /> Notes</p>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{empRecord.notes}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── SECURITY TAB ──────────────────────────────────────────── */}
            {activeTab === 'security' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Email verification banner */}
                <div style={{
                  ...card,
                  padding: '14px 18px',
                  background: user?.email_verified_at ? '#f0fdf4' : '#fffbeb',
                  border: `1px solid ${user?.email_verified_at ? '#bbf7d0' : '#fde68a'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {user?.email_verified_at
                      ? <ShieldCheck size={18} style={{ color: '#15803d', flexShrink: 0 }} />
                      : <ShieldAlert size={18} style={{ color: '#b45309', flexShrink: 0 }} />
                    }
                    <div>
                      <p style={{ margin: '0 0 1px', fontSize: '0.82rem', fontWeight: 700, color: user?.email_verified_at ? '#15803d' : '#b45309' }}>
                        {user?.email_verified_at ? 'Email verified' : 'Email not verified'}
                      </p>
                      {user?.email_verified_at && (
                        <p style={{ margin: 0, fontSize: '0.72rem', color: '#166534' }}>
                          Verified on {fmtDate(user.email_verified_at)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Change password */}
                <div style={card}>
                  <p style={sectionTitle}><Key size={14} style={{ color: 'var(--color-primary-600)' }} /> Change password</p>
                  <form onSubmit={handlePasswordSave} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 420 }}>
                    {[
                      { key: 'current_password',          label: 'Current password',    show: 'current' },
                      { key: 'new_password',              label: 'New password',         show: 'new',    hint: 'At least 8 characters' },
                      { key: 'new_password_confirmation', label: 'Confirm new password', show: 'confirm' },
                    ].map(({ key, label, show, hint }) => (
                      <div key={key}>
                        <label style={labelStyle}>{label}</label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type={showPwd[show] ? 'text' : 'password'}
                            value={pwd[key]}
                            onChange={e => { setPwd(p => ({ ...p, [key]: e.target.value })); if (pwdErrors[key]) setPwdErrors(er => ({ ...er, [key]: null })); }}
                            style={{ ...inputStyle, paddingRight: 36, borderColor: pwdErrors[key] ? '#ef4444' : '#e5e7eb' }}
                            required
                          />
                          <button type="button" onClick={() => setShowPwd(s => ({ ...s, [show]: !s[show] }))} style={{
                            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex',
                          }}>
                            {showPwd[show] ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                        {hint && !pwdErrors[key] && <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', marginTop: 3 }}>{hint}</p>}
                        {pwdErrors[key] && <p style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: 3 }}>{pwdErrors[key][0]}</p>}
                      </div>
                    ))}
                    <button type="submit" disabled={savingPwd} style={{
                      alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '9px 20px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700,
                      border: 'none', cursor: savingPwd ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                      background: 'var(--color-primary-600)', color: 'white',
                      boxShadow: '0 2px 8px color-mix(in srgb, var(--color-primary-600) 35%, transparent)',
                      opacity: savingPwd ? 0.7 : 1,
                    }}>
                      {savingPwd && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
                      {savingPwd ? 'Changing…' : 'Change password'}
                    </button>
                  </form>
                </div>

                {/* Danger zone */}
                <div style={{ ...card, background: '#fff5f5', border: '1px solid #fecaca' }}>
                  <p style={{ ...sectionTitle, borderBottomColor: '#fecaca' }}>
                    <AlertCircle size={14} style={{ color: '#ef4444' }} />
                    <span style={{ color: '#dc2626' }}>Danger zone</span>
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                    <div>
                      <p style={{ margin: '0 0 2px', fontSize: '0.875rem', fontWeight: 700, color: '#991b1b' }}>Sign out</p>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: '#b91c1c' }}>Sign out of your account on this device</p>
                    </div>
                    <button onClick={handleLogout} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 16px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700,
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      background: '#ef4444', color: 'white', flexShrink: 0,
                    }}>
                      <LogOut size={14} /> Sign out
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Right sidebar ─────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Contact info */}
            <div style={card}>
              <p style={{ ...sectionTitle, marginBottom: 14 }}>
                <User size={14} style={{ color: 'var(--color-primary-600)' }} /> Contact information
              </p>
              {[
                { icon: Mail,  label: 'Email',  value: user?.email },
                { icon: Phone, label: 'Phone',  value: user?.phone || 'Not set' },
                { icon: MapPin,label: 'Location', value: 'Not set' },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 8,
                    background: 'var(--surface-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon size={13} style={{ color: 'var(--color-primary-600)' }} />
                  </div>
                  <div>
                    <p style={{ margin: '0 0 1px', fontSize: '0.68rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
                    <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Assignment counts */}
            <div style={card}>
              <p style={{ ...sectionTitle, marginBottom: 14 }}>
                <ClipboardList size={14} style={{ color: 'var(--color-primary-600)' }} /> Work summary <span style={{ fontWeight: 400, fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>· next 30 days</span>
              </p>
              {[
                { label: 'Tasks',          value: kindCount('task') },
                { label: 'Milestones',     value: kindCount('milestone') },
                { label: 'Project ends',   value: kindCount('project') },
                { label: 'Bookings',       value: kindCount('booking') },
                { label: 'Verifications',  value: kindCount('verification') },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: '0.78rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Coming up, from the calendar */}
            {upcoming.length > 0 && (
              <div style={card}>
                <p style={{ ...sectionTitle, marginBottom: 14 }}>
                  <CalendarClock size={14} style={{ color: 'var(--color-primary-600)' }} /> Coming up
                </p>
                {upcoming.map((e, idx) => {
                  const days = daysUntil(e.starts_at);
                  const inner = (
                    <>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: days <= 3 ? '#ef4444' : days <= 7 ? '#f59e0b' : '#fbbf24' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</p>
                        <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>{e.kind}</p>
                      </div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, flexShrink: 0, color: days <= 3 ? '#ef4444' : days <= 7 ? '#f59e0b' : '#d97706' }}>{days <= 0 ? 'today' : `${days}d`}</span>
                    </>
                  );
                  const row = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, marginBottom: 4, textDecoration: 'none', background: 'var(--surface-input)', border: '1px solid var(--line)' };
                  return e.url ? <Link key={idx} to={e.url} style={row}>{inner}</Link> : <div key={idx} style={row}>{inner}</div>;
                })}
                <button type="button" onClick={() => setActiveTab('calendar')} style={{ marginTop: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary-500)', fontSize: '0.74rem', fontWeight: 600, padding: 0 }}>Open my calendar →</button>
              </div>
            )}
          </div>
        </div>
      </div>
        <NotificationsModal
          open={showNotifications}
          onClose={() => {
            setShowNotifications(false);
            notificationsAPI.unreadCount()
              .then(res => setUnreadCount(res.data.count))
              .catch(() => {});
          }}
        />
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Avatar({ initials, icon: Icon, color, textColor }) {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 8, background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '0.75rem', fontWeight: 700, color: textColor, flexShrink: 0,
    }}>
      {initials ?? (Icon ? <Icon size={14} /> : null)}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    active:           { bg: '#dcfce7', color: '#166534' },
    delivered:        { bg: '#dcfce7', color: '#166534' },
    approved:         { bg: '#dcfce7', color: '#166534' },
    pending:          { bg: '#fef3c7', color: '#92400e' },
    planning:         { bg: '#dbeafe', color: '#1e40af' },
    converted:        { bg: '#dbeafe', color: '#1e40af' },
    draft:            { bg: '#f3f4f6', color: 'var(--text-secondary)' },
    open:             { bg: '#fef3c7', color: '#92400e' },
    in_progress:      { bg: '#dbeafe', color: '#1e40af' },
    waiting_customer: { bg: '#ffedd5', color: '#9a3412' },
    resolved:         { bg: '#dcfce7', color: '#166534' },
    closed:           { bg: '#f3f4f6', color: 'var(--text-secondary)' },
    confirmed:        { bg: '#dcfce7', color: '#166534' },
    no_show:          { bg: '#fee2e2', color: '#991b1b' },
  };
  const style = map[status] ?? { bg: '#f3f4f6', color: 'var(--text-secondary)' };
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700,
      background: style.bg, color: style.color, flexShrink: 0,
    }}>
      {status?.replace('_', ' ')}
    </span>
  );
}

function PriorityBadge({ priority }) {
  const map = {
    urgent: { bg: '#fee2e2', color: '#991b1b' },
    high:   { bg: '#ffedd5', color: '#9a3412' },
    medium: { bg: '#dbeafe', color: '#1e40af' },
    low:    { bg: '#f3f4f6', color: 'var(--text-secondary)' },
  };
  const style = map[priority] ?? { bg: '#f3f4f6', color: 'var(--text-secondary)' };
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700,
      background: style.bg, color: style.color,
    }}>
      {priority}
    </span>
  );
}