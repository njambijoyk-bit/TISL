import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  User, Mail, Phone, Shield, Key, LogOut, ChevronRight,
  FolderOpen, FileText, AlertCircle, MapPin, ShoppingBag,
  Eye, EyeOff, Loader2, ShieldCheck, ShieldAlert, Award,
  UserCheck, ClipboardList, TrendingUp, Briefcase, Hash,
  MessageSquareQuote, ArrowRight, CalendarClock, Bell,
  ChevronDown, ChevronUp, Users, Star, Ticket, Camera, Calendar,
} from 'lucide-react';
import Header from '../../components/layout/Header';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import NotificationsModal from '../../components/common/NotificationsModal';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store';
import { authAPI, workAPI, notificationsAPI } from '../../api';
import employeesAPI from '../../api/employees';

// ─── Style constants (matching customer Profile) ──────────────────────────────

const card = {
  background: 'white',
  borderRadius: 12,
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
  padding: 24,
};

const sectionTitle = {
  fontSize: '0.875rem',
  fontWeight: 700,
  color: '#111827',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  margin: '0 0 18px',
  paddingBottom: 12,
  borderBottom: '1px solid #f3f4f6',
};

const labelStyle = {
  fontSize: '0.75rem',
  fontWeight: 600,
  color: '#374151',
  display: 'block',
  marginBottom: 4,
};

const inputStyle = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  fontSize: '0.875rem',
  border: '1.5px solid #e5e7eb',
  color: '#111827',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  background: 'white',
};

const STATUS_COLORS = {
  active:     { bg: '#dcfce7', text: '#166534', dot: '#22c55e' },
  on_leave:   { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
  probation:  { bg: '#e0e7ff', text: '#3730a3', dot: '#6366f1' },
  suspended:  { bg: '#fee2e2', text: '#991b1b', dot: '#ef4444' },
  terminated: { bg: '#f3f4f6', text: '#6b7280', dot: '#9ca3af' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminProfile() {
  const navigate  = useNavigate();
  const { user, logout, updateUser } = useAuthStore();

  const [activeTab, setActiveTab] = useState('overview');
  const [loading,   setLoading]   = useState(true);

  const [assignments, setAssignments] = useState({
    customers: [], orders: [], quotes: [], quoteRequests: [],
    projects: [], tasks: [], milestones: [], tickets: [], bookings: [], counts: {},
  });
  const [deadlines, setDeadlines] = useState({ projects: [], quotes: [], milestones: [], tasks: [], tickets: [] });
  const [activity,  setActivity]  = useState([]);

  // Collapsible sections state for My Work tab
  const [openSections, setOpenSections] = useState({
    customers: true,
    projects:  true,
    orders:    false,
    quotes:    false,
    quoteRequests: false,
    tickets:   false,
    bookings:  false,
  });

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
    fetchEmployeeRecord();
  }, [user?.id]);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const dashData = await workAPI.myDashboard();
      setAssignments(
        dashData?.assignments ?? { customers: [], orders: [], quotes: [], quoteRequests: [], projects: [], tasks: [], milestones: [], tickets: [], counts: {} }
      );
      setDeadlines(dashData?.deadlines ?? { projects: [], quotes: [], milestones: [], tasks: [], tickets: [] });
      setActivity(dashData?.activity ?? []);
    } catch (err) {
      console.error('Dashboard error:', err.response?.data || err.message);
      toast.error('Failed to load dashboard data');
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

  const refreshAssignments = async () => {
    setLoading(true);
    try {
      const data = await workAPI.myAssignments();
      setAssignments(data);
      toast.success('Assignments refreshed');
    } catch (err) {
      toast.error('Failed to refresh assignments');
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (key) =>
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

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

  const daysUntil = (dateStr) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  };

  if (loading) return <LoadingSpinner />;

  const TABS = [
    { key: 'overview',    label: 'Overview',  icon: User },
    { key: 'assignments', label: 'My Work',   icon: ClipboardList },
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
      <div style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', color: 'white' }}>
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
                onMouseEnter={e => e.currentTarget.style.borderColor = '#a855f7'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'}
              >
                <Camera size={11} style={{ color: '#7c3aed' }} />
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
                  border: '1.5px solid rgba(168,85,247,0.2)',
                  background: 'white', color: '#7c3aed',
                  transition: 'background 150ms',
                  boxShadow: '0 1px 6px rgba(168,85,247,0.08)',
                  position: 'relative',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.06)'}
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
              borderBottom: '2px solid #f3f4f6', 
              flexWrap: 'wrap'  
            }}>
              {TABS.map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '9px 16px', fontSize: '0.82rem',
                  fontWeight: activeTab === t.key ? 700 : 500,
                  color: activeTab === t.key ? '#7c3aed' : '#6b7280',
                  background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  borderBottom: `2px solid ${activeTab === t.key ? '#7c3aed' : 'transparent'}`,
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
                  <p style={sectionTitle}><User size={14} style={{ color: '#7c3aed' }} /> Personal information</p>
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
                          margin: 0, fontSize: '0.875rem', fontWeight: 600, color: '#111827',
                          padding: '9px 12px', background: '#f9fafb', borderRadius: 8, border: '1px solid #f3f4f6',
                        }}>
                          {value || '—'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick stats */}
                <div style={card}>
                  <p style={sectionTitle}><TrendingUp size={14} style={{ color: '#7c3aed' }} /> Quick stats</p>
                  <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
                    {[
                      { label: 'Customers', value: assignments.counts?.customers || 0, color: '#3b82f6', bg: '#eff6ff' },
                      { label: 'Projects',  value: assignments.counts?.projects  || 0, color: '#10b981', bg: '#f0fdf4' },
                      { label: 'Orders',    value: assignments.counts?.orders    || 0, color: '#f59e0b', bg: '#fffbeb' },
                      { label: 'Quotes',    value: assignments.counts?.quotes    || 0, color: '#8b5cf6', bg: '#f5f3ff' },
                      { label: 'Tickets',   value: assignments.counts?.tickets   || 0, color: '#06b6d4', bg: '#ecfeff' },
                    ].map(({ label, value, color, bg }) => (
                      <div key={label} style={{ padding: 16, borderRadius: 10, background: bg, textAlign: 'center' }}>
                        <p style={{ fontSize: '1.6rem', fontWeight: 800, color, margin: '0 0 2px' }}>{value}</p>
                        <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: 0, fontWeight: 600 }}>{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── MY WORK TAB ───────────────────────────────────────────── */}
            {activeTab === 'assignments' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#6b7280' }}>
                    Your active work across the platform
                  </p>
                  <button onClick={refreshAssignments} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: '0.75rem', color: '#7c3aed', background: 'none', border: 'none',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    <Loader2 size={12} /> Refresh
                  </button>
                </div>

                {/* Each section is a collapsible card */}
                {[
                  {
                    key: 'customers',
                    label: 'Assigned Customers',
                    count: assignments.counts?.customers || 0,
                    icon: Users,
                    color: '#3b82f6',
                    colorBg: '#eff6ff',
                    items: assignments.customers,
                    emptyMsg: 'No customers assigned to you yet',
                    renderItem: (c, idx) => (
                      <Link key={idx} to={`/admin/customers/${c.id}`} style={rowStyle}>
                        <Avatar initials={`${c.first_name?.[0] || ''}${c.last_name?.[0] || ''}`} color="#eff6ff" textColor="#3b82f6" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={rowTitle}>{c.full_name}</p>
                          <p style={rowSub}>{c.email}</p>
                        </div>
                        <StatusBadge status={c.status} />
                        <ArrowRight size={14} style={{ color: '#9ca3af', flexShrink: 0 }} />
                      </Link>
                    ),
                  },
                  {
                    key: 'projects',
                    label: 'My Projects',
                    count: assignments.counts?.projects || 0,
                    icon: FolderOpen,
                    color: '#10b981',
                    colorBg: '#f0fdf4',
                    items: assignments.projects,
                    emptyMsg: 'No projects assigned to you yet',
                    renderItem: (p, idx) => (
                      <Link key={idx} to={`/admin/projects/${p.id}`} style={rowStyle}>
                        <Avatar icon={FolderOpen} color="#f0fdf4" textColor="#10b981" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={rowTitle}>{p.title}</p>
                          <p style={rowSub}>{p.customer?.full_name || 'No customer'}</p>
                        </div>
                        <StatusBadge status={p.status} />
                        {p.deadline && (
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: daysUntil(p.deadline) <= 7 ? '#ef4444' : '#9ca3af', flexShrink: 0 }}>
                            {daysUntil(p.deadline)}d
                          </span>
                        )}
                        <ArrowRight size={14} style={{ color: '#9ca3af', flexShrink: 0 }} />
                      </Link>
                    ),
                  },
                  {
                    key: 'orders',
                    label: 'Assigned Orders',
                    count: assignments.counts?.orders || 0,
                    icon: ShoppingBag,
                    color: '#f59e0b',
                    colorBg: '#fffbeb',
                    items: assignments.orders,
                    emptyMsg: 'No orders assigned to you yet',
                    renderItem: (o, idx) => (
                      <Link key={idx} to={`/admin/orders/${o.id}`} style={rowStyle}>
                        <Avatar icon={ShoppingBag} color="#fffbeb" textColor="#f59e0b" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={rowTitle}>{o.order_number}</p>
                          <p style={rowSub}>{o.customer?.full_name || 'Unknown'}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827', margin: '0 0 3px' }}>
                            {o.currency || 'KES'} {Number(o.total || 0).toLocaleString()}
                          </p>
                          <StatusBadge status={o.status} />
                        </div>
                        <ArrowRight size={14} style={{ color: '#9ca3af', flexShrink: 0 }} />
                      </Link>
                    ),
                  },
                  {
                    key: 'quotes',
                    label: 'Assigned Quotes',
                    count: assignments.counts?.quotes || 0,
                    icon: FileText,
                    color: '#8b5cf6',
                    colorBg: '#f5f3ff',
                    items: assignments.quotes,
                    emptyMsg: 'No quotes assigned to you yet',
                    renderItem: (q, idx) => (
                      <Link key={idx} to={`/admin/quotes/${q.id}`} style={rowStyle}>
                        <Avatar icon={FileText} color="#f5f3ff" textColor="#8b5cf6" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={rowTitle}>{q.quote_number}</p>
                          <p style={rowSub}>{q.customer?.full_name || 'Unknown'}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827', margin: '0 0 3px' }}>
                            {q.currency || 'KES'} {Number(q.total || 0).toLocaleString()}
                          </p>
                          <StatusBadge status={q.status} />
                        </div>
                        <ArrowRight size={14} style={{ color: '#9ca3af', flexShrink: 0 }} />
                      </Link>
                    ),
                  },
                  {
                    key: 'quoteRequests',
                    label: 'Assigned Quote Requests',
                    count: assignments.counts?.quoteRequests || 0,
                    icon: MessageSquareQuote,
                    color: '#ec4899',
                    colorBg: '#fdf2f8',
                    items: assignments.quoteRequests,
                    emptyMsg: 'No quote requests assigned to you yet',
                    renderItem: (qr, idx) => (
                      <Link key={idx} to={`/admin/quote-requests/${qr.id}`} style={rowStyle}>
                        <Avatar icon={MessageSquareQuote} color="#fdf2f8" textColor="#ec4899" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={rowTitle}>{qr.request_number}</p>
                          <p style={rowSub}>{qr.request_title || 'No title'}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <PriorityBadge priority={qr.priority} />
                          <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '3px 0 0' }}>{qr.status}</p>
                        </div>
                        <ArrowRight size={14} style={{ color: '#9ca3af', flexShrink: 0 }} />
                      </Link>
                    ),
                  },
                  {
                    key: 'bookings',
                    label: 'My Bookings',
                    count: assignments.counts?.bookings || 0,
                    icon: Calendar,
                    color: '#db2777',
                    colorBg: '#fdf2f8',
                    items: assignments.bookings,
                    emptyMsg: 'No bookings assigned to you yet',
                    renderItem: (b, idx) => (
                      <Link key={idx} to={b.url} style={rowStyle}>
                        <Avatar icon={Calendar} color="#fdf2f8" textColor="#db2777" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={rowTitle}>{b.booking_number}</p>
                          <p style={rowSub}>{b.customer || 'Unknown customer'}</p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <StatusBadge status={b.status} />
                          {b.scheduled_at && (
                            <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '3px 0 0' }}>
                              {fmtDate(b.scheduled_at)}
                            </p>
                          )}
                        </div>
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 600, flexShrink: 0,
                          padding: '2px 7px', borderRadius: 99,
                          background: b.role === 'lead' ? '#fdf2f8' : '#f3f4f6',
                          color: b.role === 'lead' ? '#db2777' : '#6b7280',
                        }}>
                          {b.role}
                        </span>
                        <ArrowRight size={14} style={{ color: '#9ca3af', flexShrink: 0 }} />
                      </Link>
                    ),
                  },
                  {
                    key: 'tickets',
                    label: 'Assigned Tickets',
                    count: assignments.counts?.tickets || 0,
                    icon: Ticket,
                    color: '#06b6d4',
                    colorBg: '#ecfeff',
                    items: assignments.tickets,
                    emptyMsg: 'No tickets assigned to you yet',
                    renderItem: (t, idx) => (
                      <Link key={idx} to={`/admin/tickets/${t.id}`} style={rowStyle}>
                        <Avatar icon={Ticket} color="#ecfeff" textColor="#06b6d4" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={rowTitle}>{t.ticket_number}</p>
                          <p style={rowSub}>{t.subject}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <PriorityBadge priority={t.priority} />
                          <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '3px 0 0' }}>{t.status?.replace('_', ' ')}</p>
                        </div>
                        <ArrowRight size={14} style={{ color: '#9ca3af', flexShrink: 0 }} />
                      </Link>
                    ),
                  },
                ].map(({ key, label, count, icon: Icon, color, colorBg, items, emptyMsg, renderItem }) => (
                  <div key={key} style={{ ...card, padding: 0, overflow: 'hidden' }}>
                    {/* Section header — always visible, clickable to toggle */}
                    <button
                      onClick={() => toggleSection(key)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '14px 18px', background: 'none', border: 'none',
                        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                        borderBottom: openSections[key] ? '1px solid #f3f4f6' : 'none',
                      }}
                    >
                      <div style={{
                        width: 30, height: 30, borderRadius: 8,
                        background: colorBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <Icon size={14} style={{ color }} />
                      </div>
                      <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>
                        {label}
                      </span>
                      <span style={{
                        padding: '2px 8px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700,
                        background: colorBg, color,
                      }}>
                        {count}
                      </span>
                      {openSections[key]
                        ? <ChevronUp size={16} style={{ color: '#9ca3af', flexShrink: 0 }} />
                        : <ChevronDown size={16} style={{ color: '#9ca3af', flexShrink: 0 }} />
                      }
                    </button>

                    {/* Collapsible body */}
                    {openSections[key] && (
                      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {items?.length > 0
                          ? items.map((item, idx) => renderItem(item, idx))
                          : (
                            <div style={{ textAlign: 'center', padding: '24px 0' }}>
                              <Icon size={28} style={{ color: '#d1d5db', display: 'block', margin: '0 auto 8px' }} />
                              <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>{emptyMsg}</p>
                            </div>
                          )
                        }
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── EMPLOYEE RECORD TAB ───────────────────────────────────── */}
            {activeTab === 'employee' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {empLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                    <div style={{ width: 28, height: 28, border: '3px solid rgba(124,58,237,0.2)', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  </div>
                ) : !empRecord ? (
                  <div style={{ ...card, textAlign: 'center', padding: 40 }}>
                    <UserCheck size={36} style={{ color: '#d1d5db', display: 'block', margin: '0 auto 10px' }} />
                    <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>No employee record linked to your account.</p>
                  </div>
                ) : (
                  <>
                    {/* Employment */}
                    <div style={card}>
                      <p style={sectionTitle}><Briefcase size={14} style={{ color: '#7c3aed' }} /> Employment Details</p>
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
                            <label style={{ ...labelStyle, fontSize: '0.68rem', color: '#9ca3af' }}>{label}</label>
                            <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#111827', padding: '7px 10px', background: '#f9fafb', borderRadius: 7, border: '1px solid #f3f4f6' }}>{value}</p>
                          </div>
                        ) : null)}
                      </div>
                    </div>

                    {/* Personal */}
                    <div style={card}>
                      <p style={sectionTitle}><User size={14} style={{ color: '#7c3aed' }} /> Personal Information</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {[
                          { label: 'Date of Birth',  value: fmtDate(empRecord.date_of_birth) },
                          { label: 'Gender',         value: empRecord.gender?.replace(/_/g, ' ') },
                          { label: 'Marital Status', value: empRecord.marital_status },
                          { label: 'Education',      value: empRecord.education_level },
                        ].map(({ label, value }) => value ? (
                          <div key={label}>
                            <label style={{ ...labelStyle, fontSize: '0.68rem', color: '#9ca3af' }}>{label}</label>
                            <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#111827', padding: '7px 10px', background: '#f9fafb', borderRadius: 7, border: '1px solid #f3f4f6' }}>{value}</p>
                          </div>
                        ) : null)}
                      </div>
                    </div>

                    {/* Identification */}
                    <div style={card}>
                      <p style={sectionTitle}><Hash size={14} style={{ color: '#7c3aed' }} /> Identification</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {[
                          { label: 'ID Number',   value: empRecord.id_number },
                          { label: 'KRA PIN',     value: empRecord.kra_pin },
                          { label: 'NSSF Number', value: empRecord.nssf_number },
                          { label: 'NHIF Number', value: empRecord.nhif_number },
                        ].map(({ label, value }) => value ? (
                          <div key={label}>
                            <label style={{ ...labelStyle, fontSize: '0.68rem', color: '#9ca3af' }}>{label}</label>
                            <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#111827', padding: '7px 10px', background: '#f9fafb', borderRadius: 7, border: '1px solid #f3f4f6', fontFamily: 'monospace' }}>{value}</p>
                          </div>
                        ) : null)}
                      </div>
                    </div>

                    {/* Emergency Contact */}
                    {(empRecord.emergency_contact_name || empRecord.emergency_contact_phone) && (
                      <div style={card}>
                        <p style={sectionTitle}><Users size={14} style={{ color: '#7c3aed' }} /> Emergency Contact</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          {[
                            { label: 'Name',         value: empRecord.emergency_contact_name },
                            { label: 'Phone',        value: empRecord.emergency_contact_phone },
                            { label: 'Relationship', value: empRecord.emergency_contact_relationship },
                          ].map(({ label, value }) => value ? (
                            <div key={label}>
                              <label style={{ ...labelStyle, fontSize: '0.68rem', color: '#9ca3af' }}>{label}</label>
                              <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#111827', padding: '7px 10px', background: '#f9fafb', borderRadius: 7, border: '1px solid #f3f4f6' }}>{value}</p>
                            </div>
                          ) : null)}
                        </div>
                      </div>
                    )}

                    {/* Skills */}
                    {empRecord.skills?.length > 0 && (
                      <div style={card}>
                        <p style={sectionTitle}><Star size={14} style={{ color: '#7c3aed' }} /> Skills</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {empRecord.skills.map((skill, i) => (
                            <span key={i} style={{ padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ede9fe' }}>
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Certifications */}
                    {empRecord.certifications?.length > 0 && (
                      <div style={card}>
                        <p style={sectionTitle}><Award size={14} style={{ color: '#7c3aed' }} /> Certifications</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {empRecord.certifications.map((cert, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 8, background: '#f9fafb', border: '1px solid #f3f4f6' }}>
                              <Award size={15} style={{ color: '#7c3aed', flexShrink: 0, marginTop: 1 }} />
                              <div>
                                <p style={{ margin: '0 0 1px', fontSize: '0.82rem', fontWeight: 600, color: '#111827' }}>{cert.name || cert}</p>
                                {cert.issuer && <p style={{ margin: '0 0 1px', fontSize: '0.72rem', color: '#6b7280' }}>{cert.issuer}</p>}
                                {cert.date && <p style={{ margin: 0, fontSize: '0.68rem', color: '#9ca3af' }}>{fmtDate(cert.date)}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {empRecord.notes && (
                      <div style={card}>
                        <p style={sectionTitle}><FileText size={14} style={{ color: '#7c3aed' }} /> Notes</p>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{empRecord.notes}</p>
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
                  <p style={sectionTitle}><Key size={14} style={{ color: '#7c3aed' }} /> Change password</p>
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
                            background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex',
                          }}>
                            {showPwd[show] ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                        {hint && !pwdErrors[key] && <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 3 }}>{hint}</p>}
                        {pwdErrors[key] && <p style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: 3 }}>{pwdErrors[key][0]}</p>}
                      </div>
                    ))}
                    <button type="submit" disabled={savingPwd} style={{
                      alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '9px 20px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700,
                      border: 'none', cursor: savingPwd ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                      background: '#7c3aed', color: 'white',
                      boxShadow: '0 2px 8px rgba(124,58,237,0.35)',
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
                <User size={14} style={{ color: '#7c3aed' }} /> Contact information
              </p>
              {[
                { icon: Mail,  label: 'Email',  value: user?.email },
                { icon: Phone, label: 'Phone',  value: user?.phone || 'Not set' },
                { icon: MapPin,label: 'Location', value: 'Not set' },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 8,
                    background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon size={13} style={{ color: '#7c3aed' }} />
                  </div>
                  <div>
                    <p style={{ margin: '0 0 1px', fontSize: '0.68rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
                    <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#111827' }}>{value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Assignment counts */}
            <div style={card}>
              <p style={{ ...sectionTitle, marginBottom: 14 }}>
                <ClipboardList size={14} style={{ color: '#7c3aed' }} /> Work summary
              </p>
              {[
                { label: 'Customers',      value: assignments.counts?.customers     || 0 },
                { label: 'Projects',       value: assignments.counts?.projects      || 0 },
                { label: 'Orders',         value: assignments.counts?.orders        || 0 },
                { label: 'Quotes',         value: assignments.counts?.quotes        || 0 },
                { label: 'Quote Requests', value: assignments.counts?.quoteRequests || 0 },
                { label: 'Bookings',       value: assignments.counts?.bookings      || 0 },
                { label: 'Tickets',        value: assignments.counts?.tickets       || 0 },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: '0.78rem' }}>
                  <span style={{ color: '#6b7280' }}>{label}</span>
                  <span style={{ fontWeight: 700, color: '#111827' }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Upcoming deadlines */}
            {([...(deadlines.projects || []), ...(deadlines.quotes || []), ...(deadlines.tickets || [])].length > 0) && (
              <div style={card}>
                <p style={{ ...sectionTitle, marginBottom: 14 }}>
                  <CalendarClock size={14} style={{ color: '#7c3aed' }} /> Upcoming deadlines
                </p>
                {[...(deadlines.projects || []), ...(deadlines.quotes || []), ...(deadlines.tickets || [])]
                  .sort((a, b) => new Date(a.deadline || a.created_at) - new Date(b.deadline || b.created_at))
                  .slice(0, 5)
                  .map((item, idx) => {
                    const days = item.deadline ? daysUntil(item.deadline) : null;
                    return (
                      <Link key={idx} to={item.url} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px', borderRadius: 8, marginBottom: 4,
                        textDecoration: 'none',
                        background: '#f9fafb', border: '1px solid #f3f4f6',
                      }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                          background: days !== null
                            ? (days <= 3 ? '#ef4444' : days <= 7 ? '#f59e0b' : '#fbbf24')
                            : (item.priority === 'urgent' ? '#ef4444' : item.priority === 'high' ? '#f59e0b' : '#fbbf24'),
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.label}
                          </p>
                          <p style={{ margin: 0, fontSize: '0.68rem', color: '#9ca3af' }}>{item.type}</p>
                        </div>
                        {days !== null && (
                          <span style={{
                            fontSize: '0.72rem', fontWeight: 700, flexShrink: 0,
                            color: days <= 3 ? '#ef4444' : days <= 7 ? '#f59e0b' : '#d97706',
                          }}>
                            {days}d
                          </span>
                        )}
                      </Link>
                    );
                  })}
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

// ─── Shared row styles ────────────────────────────────────────────────────────

const rowStyle = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 12px', borderRadius: 8,
  background: '#f9fafb', border: '1px solid #f3f4f6',
  textDecoration: 'none', transition: 'background 120ms',
};

const rowTitle = { margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const rowSub   = { margin: 0, fontSize: '0.72rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

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
    draft:            { bg: '#f3f4f6', color: '#6b7280' },
    open:             { bg: '#fef3c7', color: '#92400e' },
    in_progress:      { bg: '#dbeafe', color: '#1e40af' },
    waiting_customer: { bg: '#ffedd5', color: '#9a3412' },
    resolved:         { bg: '#dcfce7', color: '#166534' },
    closed:           { bg: '#f3f4f6', color: '#6b7280' },
    confirmed:        { bg: '#dcfce7', color: '#166534' },
    no_show:          { bg: '#fee2e2', color: '#991b1b' },
  };
  const style = map[status] ?? { bg: '#f3f4f6', color: '#6b7280' };
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
    low:    { bg: '#f3f4f6', color: '#6b7280' },
  };
  const style = map[priority] ?? { bg: '#f3f4f6', color: '#6b7280' };
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700,
      background: style.bg, color: style.color,
    }}>
      {priority}
    </span>
  );
}