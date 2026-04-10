import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera, Save, X, Edit2, User, Mail, Phone, Globe,
  MessageCircle, Building2, FileText, MapPin, Package,
  Calendar, CreditCard, Star, Check, Loader2, Eye, EyeOff,
  ShieldCheck, ShieldAlert, Shield, 
} from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import { customersAPI, authAPI, referralsAPI } from '../../api';
import { useAuthStore, usePromoCodeStore } from '../../store';
import toast from 'react-hot-toast';

// ── Shared input styles ───────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: '0.875rem',
  border: '1.5px solid #e5e7eb', color: '#111827', outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  fontFamily: 'inherit', boxSizing: 'border-box', background: 'white',
};
const inputFocus = (e) => {
  e.currentTarget.style.borderColor = '#6366f1';
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)';
};
const inputBlur = (e) => {
  e.currentTarget.style.borderColor = '#e5e7eb';
  e.currentTarget.style.boxShadow = 'none';
};
const inputDisabled = {
  ...inputStyle,
  background: '#f9fafb', color: '#6b7280', cursor: 'not-allowed', borderColor: '#f3f4f6',
};

const labelStyle = {
  fontSize: '0.75rem', fontWeight: 600, color: '#374151',
  display: 'block', marginBottom: 4,
};

const card = {
  background: 'white', borderRadius: 12,
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
  padding: 24,
};

const sectionTitle = {
  fontSize: '0.875rem', fontWeight: 700, color: '#111827',
  display: 'flex', alignItems: 'center', gap: 8,
  margin: '0 0 18px', paddingBottom: 12,
  borderBottom: '1px solid #f3f4f6',
};

const TIER_COLORS = {
  bronze:   { bg: '#fff7ed', color: '#c2410c', ring: '#fed7aa' },
  silver:   { bg: '#f8fafc', color: '#475569', ring: '#cbd5e1' },
  gold:     { bg: '#fffbeb', color: '#b45309', ring: '#fde68a' },
  platinum: { bg: '#f5f3ff', color: '#6d28d9', ring: '#ddd6fe' },
};

// ── Field component ───────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, type = 'text', disabled, placeholder, icon }) {
  return (
    <div style={{ position: 'relative' }}>
      {icon && (
        <span style={{
          position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
          color: '#9ca3af', pointerEvents: 'none', display: 'flex',
        }}>
          {icon}
        </span>
      )}
      <input
        type={type} value={value ?? ''} onChange={onChange}
        disabled={disabled} placeholder={placeholder}
        style={{ ...(disabled ? inputDisabled : inputStyle), paddingLeft: icon ? 34 : 12 }}
        onFocus={disabled ? undefined : inputFocus}
        onBlur={disabled  ? undefined : inputBlur}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Profile() {
  const { user, updateUser } = useAuthStore();
  const { myCodes, fetchMyCodes } = usePromoCodeStore();
  const navigate = useNavigate();
  const imgInputRef = useRef(null);

  const [customer,  setCustomer]  = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [editing,   setEditing]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [imgLoading,setImgLoading]= useState(false);
  const [activeTab, setActiveTab] = useState('personal');
  const [errors,    setErrors]    = useState({});

  const [otp, setOtp]               = useState('');
  const [otpSent, setOtpSent]       = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const [form, setForm] = useState({
    first_name: '', last_name: '', phone: '', alternate_phone: '',
    birthday: '', whatsapp: '', website: '',
    company_name: '', company_registration_number: '', tax_id: '',
    default_shipping_address: '', default_billing_address: '',
  });

  const [pwd, setPwd] = useState({
    current_password: '', new_password: '', new_password_confirmation: '',
  });
  const [showPwd, setShowPwd]   = useState({ current: false, new: false, confirm: false });
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdErrors, setPwdErrors] = useState({});

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => { loadProfile(); }, []);

  useEffect(() => {
    if (activeTab === 'rewards') fetchMyCodes();
  }, [activeTab]);

  const loadProfile = async () => {
    setLoading(true);
    try {

      // Fetch profile and referral code in parallel
      const [profileRes, referralRes] = await Promise.allSettled([
        customersAPI.getProfile(),
        referralsAPI.myCode(), 
      ]);

      if (profileRes.status === 'rejected') {
        throw profileRes.reason;
      }

      const res = profileRes.value;
      const c   = res.customer ?? res;

      // Attach referral_code to customer if the call succeeded
      
      if (referralRes.status === 'fulfilled') {
        const rd = referralRes.value;
        // API returns { code: {...}, share_url: "...", stats: {...} }
        const rc = rd?.code ?? rd?.referral_code ?? rd?.data ?? null;
        c.referral_code = (rc && typeof rc.code === 'string') ? rc : null;
      }

      setCustomer(c);
      if (res.user) updateUser(res.user);
      setForm({
        first_name:                   c.first_name                   ?? '',
        last_name:                    c.last_name                    ?? '',
        phone:                        c.phone                        ?? '',
        alternate_phone:              c.alternate_phone              ?? '',
        birthday:                     c.birthday ? c.birthday.substring(0, 10) : '',
        whatsapp:                     c.whatsapp                     ?? '',
        website:                      c.website                      ?? '',
        company_name:                 c.company_name                 ?? '',
        company_registration_number:  c.company_registration_number  ?? '',
        tax_id:                       c.tax_id                       ?? '',
        default_shipping_address:     c.default_shipping_address     ?? '',
        default_billing_address:      c.default_billing_address      ?? '',
      });
    } catch {
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const set = (k) => (e) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors(er => ({ ...er, [k]: null }));
  };

  // ── Save profile ──────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setErrors({});
    try {
      const res = await customersAPI.updateProfile(form);
      const c   = res.customer ?? res;
      setCustomer(c);
      if (res.user) updateUser(res.user);
      setEditing(false);
      toast.success('Profile updated');
    } catch (e) {
      const errs = e.response?.data?.errors;
      if (errs) setErrors(errs);
      toast.error(e.response?.data?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleResendEmail = async () => {
    setResendLoading(true);
    try {
      await customersAPI.resendEmailVerification();
      toast.success('Verification email sent. Check your inbox.');
    } catch (e) {
      toast.error(e.response?.data?.message ?? 'Failed to send verification email.');
    } finally {
      setResendLoading(false);
    }
  };

  const handleSendOtp = async () => {
    setOtpLoading(true);
    try {
      await customersAPI.sendPhoneOtp();
      setOtpSent(true);
      toast.success('OTP sent to your phone.');
    } catch (e) {
      toast.error(e.response?.data?.message ?? 'Failed to send OTP.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) { toast.error('Enter the 6-digit OTP.'); return; }
    setOtpLoading(true);
    try {
      const res = await customersAPI.verifyPhoneOtp(otp);
      updateUser({ ...user, phone_verified_at: res.data?.phone_verified_at ?? new Date().toISOString() }); // ← update auth store
      setOtpSent(false);
      setOtp('');
      toast.success('Phone verified successfully.');
    } catch (e) {
      toast.error(e.response?.data?.message ?? 'Invalid or expired OTP.');
    } finally {
      setOtpLoading(false);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setErrors({});
    loadProfile();
  };

  // ── Profile image ─────────────────────────────────────────────────────────

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgLoading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await customersAPI.uploadCustomerProfileImage(formData);
      setCustomer(c => ({ ...c, profile_image_url: res.profile_image_url }));
      toast.success('Profile image updated');
    } catch {
      toast.error('Image upload failed');
    } finally {
      setImgLoading(false);
    }
  };

  // ── Password ──────────────────────────────────────────────────────────────

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
      toast.success('Password changed');
      setPwd({ current_password: '', new_password: '', new_password_confirmation: '' });
    } catch (e) {
      const errs = e.response?.data?.errors;
      if (errs) {
        setPwdErrors(errs);
      } else {
        toast.error(e.response?.data?.message ?? 'Failed to change password');
      }
    } finally {
      setSavingPwd(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #e0e7ff', borderTopColor: '#6366f1', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  if (!customer) return null;

  const tier    = customer.tier ?? 'bronze';
  const tierClr = TIER_COLORS[tier] ?? TIER_COLORS.bronze;
  const fmt     = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  // ── Tabs ──────────────────────────────────────────────────────────────────

  const TABS = [
    { key: 'personal',  label: 'Personal' },
    { key: 'business',  label: 'Business' },
    { key: 'addresses', label: 'Addresses' },
    { key: 'rewards',   label: '🎁 My Rewards' },
    { key: 'password',  label: 'Password'  },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />

      <div style={{ flex: 1, maxWidth: 1100, margin: '0 auto', padding: '32px 20px', width: '100%' }}>

        {/* ── Page heading ── */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a855f7', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
            My Profile
          </h1>
          <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: 0 }}>
            Manage your personal information and account settings
          </p>
        </div>

        {/* ── Account status banner ── */}
        {customer.account_status?.is_restricted && (
          <div style={{
            marginBottom: 20, padding: '12px 16px', borderRadius: 10,
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
            fontSize: '0.82rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            ⚠ {customer.account_status.message}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 24, alignItems: 'start' }}>

          {/* ── Left: main form ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* Profile image + name hero */}
            <div style={{ ...card, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {imgLoading ? (
                  <div style={{ width: 80, height: 80, borderRadius: 16, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Loader2 size={20} style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} />
                  </div>
                ) : (
                  <img
                    src={customer.profile_image_url}
                    alt={customer.full_name}
                    style={{ width: 80, height: 80, borderRadius: 16, objectFit: 'cover', background: '#f3f4f6', display: 'block' }}
                  />
                )}
                <button
                  onClick={() => imgInputRef.current?.click()}
                  disabled={imgLoading}
                  style={{
                    position: 'absolute', bottom: -4, right: -4, width: 26, height: 26,
                    borderRadius: '50%', background: 'white', border: '1.5px solid #e5e7eb',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                    transition: 'border-color 150ms',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#6366f1'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#e5e7eb'}
                >
                  <Camera size={11} style={{ color: '#6366f1' }} />
                </button>
                <input ref={imgInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', margin: '0 0 2px' }}>
                  {customer.full_name}
                </h2>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', fontFamily: 'monospace', margin: '0 0 6px' }}>
                  {customer.customer_number}
                </p>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 10px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700,
                  background: tierClr.bg, color: tierClr.color,
                  boxShadow: `0 0 0 1px ${tierClr.ring}`, textTransform: 'capitalize',
                }}>
                  <Star size={10} /> {tier}
                </span>
                <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 10px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700,
    background: 'rgba(99,102,241,0.08)', color: '#4338ca',
    boxShadow: '0 0 0 1px rgba(99,102,241,0.2)', textTransform: 'capitalize',
  }}>
    {customer.customer_type ?? 'individual'}
  </span>
              </div>

              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                {editing ? (
                  <>
                    <button onClick={cancelEdit} style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '7px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
                      background: 'transparent', color: '#6b7280',
                      border: '1px solid #e5e7eb', cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      <X size={14} /> Discard
                    </button>
                    <button onClick={handleSave} disabled={saving} style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '7px 16px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700,
                      border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                      background: '#6366f1', color: 'white',
                      boxShadow: '0 2px 8px rgba(99,102,241,0.35)',
                      opacity: saving ? 0.7 : 1,
                    }}>
                      {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </>
                ) : (
                  <button onClick={() => setEditing(true)} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '7px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
                    background: 'transparent', color: '#374151',
                    border: '1px solid #e5e7eb', cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'border-color 150ms',
                  }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#6366f1'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = '#e5e7eb'}
                  >
                    <Edit2 size={13} /> Edit profile
                  </button>
                )}
              </div>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 2, marginBottom: 16, borderBottom: '2px solid #f3f4f6' }}>
              {TABS.map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                  padding: '9px 16px', fontSize: '0.82rem', fontWeight: activeTab === t.key ? 700 : 500,
                  color: activeTab === t.key ? '#6366f1' : '#6b7280',
                  background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  borderBottom: `2px solid ${activeTab === t.key ? '#6366f1' : 'transparent'}`,
                  marginBottom: -2, transition: 'color 150ms',
                }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── TAB: Personal ── */}
            {activeTab === 'personal' && (

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* ── Personal info fields ── */}
                <div style={card}>
                  <p style={sectionTitle}><User size={14} style={{ color: '#6366f1' }} /> Personal information</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Field label="First name *">
                      <Input value={form.first_name} onChange={set('first_name')} disabled={!editing} icon={<User size={14} />} />
                      {errors.first_name && <p style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: 3 }}>{errors.first_name[0]}</p>}
                    </Field>
                    <Field label="Last name *">
                      <Input value={form.last_name} onChange={set('last_name')} disabled={!editing} icon={<User size={14} />} />
                      {errors.last_name && <p style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: 3 }}>{errors.last_name[0]}</p>}
                    </Field>
                    <Field label="Email">
                      <Input value={customer.email} disabled icon={<Mail size={14} />} />
                      <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 3 }}>Email cannot be changed</p>
                    </Field>
                    <Field label="Phone">
                      <Input value={form.phone} onChange={set('phone')} disabled={!editing} icon={<Phone size={14} />} placeholder="+254…" />
                      {errors.phone && <p style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: 3 }}>{errors.phone[0]}</p>}
                    </Field>
                    <Field label="Alternate phone">
                      <Input value={form.alternate_phone} onChange={set('alternate_phone')} disabled={!editing} icon={<Phone size={14} />} />
                    </Field>
                    <Field label="Date of birth">
                      <Input type="date" value={form.birthday} onChange={set('birthday')} disabled={!editing} icon={<Calendar size={14} />} />
                    </Field>
                    <Field label="WhatsApp">
                      <Input value={form.whatsapp} onChange={set('whatsapp')} disabled={!editing} icon={<MessageCircle size={14} />} placeholder="+254…" />
                    </Field>
                    <Field label="Website">
                      <Input value={form.website} onChange={set('website')} disabled={!editing} icon={<Globe size={14} />} placeholder="https://…" />
                      {errors.website && <p style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: 3 }}>{errors.website[0]}</p>}
                    </Field>
                  </div>
                </div>
              </div>
            )}
              
            {/* ── TAB: Business ── */}
            {activeTab === 'business' && (
              <div style={card}>
                <p style={sectionTitle}><Building2 size={14} style={{ color: '#6366f1' }} /> Business information</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="Company name">
                    <Input value={form.company_name} onChange={set('company_name')} disabled={!editing} icon={<Building2 size={14} />} />
                  </Field>
                  <Field label="Registration number">
                    <Input value={form.company_registration_number} onChange={set('company_registration_number')} disabled={!editing} icon={<FileText size={14} />} />
                  </Field>
                  <Field label="Tax ID / KRA PIN">
                    <Input value={form.tax_id} onChange={set('tax_id')} disabled={!editing} icon={<FileText size={14} />} />
                  </Field>
                </div>
                {!editing && (
                  <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 16 }}>
                    Click "Edit profile" above to update your business information.
                  </p>
                )}
              </div>
            )}

            {/* ── TAB: Addresses ── */}
            {activeTab === 'addresses' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={card}>
                  <p style={sectionTitle}><Package size={14} style={{ color: '#6366f1' }} /> Default shipping address</p>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 12, marginTop: -8 }}>
                    Used as the default delivery address when placing orders.
                  </p>
                  {editing ? (
                    <textarea
                      rows={4}
                      value={form.default_shipping_address}
                      onChange={set('default_shipping_address')}
                      placeholder="Street address, city, county, postal code…"
                      style={{ ...inputStyle, resize: 'none', width: '100%' }}
                      onFocus={inputFocus} onBlur={inputBlur}
                    />
                  ) : (
                    <div style={{
                      padding: '10px 12px', borderRadius: 8, background: '#f9fafb',
                      border: '1px solid #f3f4f6', fontSize: '0.875rem', color: '#374151',
                      minHeight: 80, whiteSpace: 'pre-wrap',
                    }}>
                      {form.default_shipping_address || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>No shipping address saved</span>}
                    </div>
                  )}
                </div>

                <div style={card}>
                  <p style={sectionTitle}><CreditCard size={14} style={{ color: '#6366f1' }} /> Default billing address</p>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 12, marginTop: -8 }}>
                    Used for invoicing and payment records.
                  </p>
                  {editing ? (
                    <textarea
                      rows={4}
                      value={form.default_billing_address}
                      onChange={set('default_billing_address')}
                      placeholder="Street address, city, county, postal code…"
                      style={{ ...inputStyle, resize: 'none', width: '100%' }}
                      onFocus={inputFocus} onBlur={inputBlur}
                    />
                  ) : (
                    <div style={{
                      padding: '10px 12px', borderRadius: 8, background: '#f9fafb',
                      border: '1px solid #f3f4f6', fontSize: '0.875rem', color: '#374151',
                      minHeight: 80, whiteSpace: 'pre-wrap',
                    }}>
                      {form.default_billing_address || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>No billing address saved</span>}
                    </div>
                  )}
                </div>

                <div style={{ ...card, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <p style={{ fontSize: '0.78rem', color: '#15803d', margin: 0, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <Check size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    These are quick-entry text addresses for your default shipping and billing. For detailed saved addresses with contact info, landmarks, and delivery instructions, visit the <strong>My Addresses</strong> section in your account dashboard.
                  </p>
                </div>
              </div>
            )}

            {/* ── TAB: Rewards ── */}
            {activeTab === 'rewards' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Active codes */}
                <div style={card}>
                  <p style={sectionTitle}>
                    <span style={{ fontSize: '1rem' }}>🎟</span> Active Promo Codes
                  </p>

                  {myCodes.active_codes.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '28px 0' }}>
                      <p style={{ fontSize: '2rem', margin: '0 0 8px' }}>🎁</p>
                      <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>
                        No active promo codes right now. Keep ordering to earn rewards!
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {myCodes.active_codes.map(code => (
                        <PromoCodeCard key={code.id} code={code} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Referral section */}
                {customer.referral_code && (
                  <div style={{ ...card, background: '#faf5ff', border: '1px solid #e9d5ff' }}>
                    <p style={{ ...sectionTitle, borderBottomColor: '#e9d5ff' }}>
                      <span style={{ fontSize: '1rem' }}>🔗</span> Your Referral Code
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                      <div>
                        <p style={{ fontSize: '0.72rem', color: '#7c3aed', fontWeight: 700, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          Share this code and earn KES 500 store credit per referral
                        </p>
                        <span style={{
                          fontFamily: 'monospace', fontWeight: 900, fontSize: '1.4rem',
                          color: '#6d28d9', letterSpacing: '0.1em',
                        }}>
                          {customer.referral_code.code}
                        </span>
                      </div>
                      <button
                        onClick={() => { navigator.clipboard.writeText(customer.referral_code.code); toast.success('Code copied!'); }}
                        style={{
                          padding: '8px 16px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
                          border: '1.5px solid #c4b5fd', background: 'white', color: '#7c3aed',
                          cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                        }}>
                        Copy Code
                      </button>
                    </div>

                    {/* Stats row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                      {[
                        { label: 'Total Referrals',   value: customer.referral_code.times_used ?? 0 },
                        { label: 'Referee Gets',      value: `${customer.referral_code.reward_value ?? 0}% off` },
                        { label: 'You Earn',          value: `KES ${Number(customer.referral_code.referrer_reward_value ?? 500).toLocaleString()}` },
                      ].map(({ label, value }) => (
                        <div key={label} style={{
                          padding: '10px 12px', borderRadius: 8,
                          background: 'rgba(168,85,247,0.07)', border: '1px solid rgba(168,85,247,0.15)',
                          textAlign: 'center',
                        }}>
                          <p style={{ fontSize: '0.62rem', color: '#a78bfa', fontWeight: 700, margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {label}
                          </p>
                          <p style={{ fontSize: '0.92rem', fontWeight: 900, color: '#5b21b6', margin: 0 }}>
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Share link */}
                    {customer.referral_code.share_url && (
                      <div style={{
                        padding: '10px 12px', borderRadius: 8,
                        background: 'rgba(168,85,247,0.05)', border: '1px dashed #c4b5fd',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                      }}>
                        <p style={{ fontSize: '0.72rem', color: '#7c3aed', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {customer.referral_code.share_url}
                        </p>
                        <button
                          onClick={() => { navigator.clipboard.writeText(customer.referral_code.share_url); toast.success('Link copied!'); }}
                          style={{
                            padding: '5px 12px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700,
                            border: '1px solid #c4b5fd', background: 'white', color: '#7c3aed',
                            cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                          }}>
                          Copy Link
                        </button>
                      </div>
                    )}

                    {/* Earnings summary */}
                    {Number(customer.referral_code.total_referrer_rewards ?? 0) > 0 && (
                      <div style={{
                        marginTop: 10, padding: '10px 12px', borderRadius: 8,
                        background: '#f0fdf4', border: '1px solid #bbf7d0',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      }}>
                        <span style={{ fontSize: '0.78rem', color: '#15803d', fontWeight: 600 }}>
                          Total earned from referrals
                        </span>
                        <span style={{ fontSize: '0.92rem', fontWeight: 900, color: '#15803d' }}>
                          KES {Number(customer.referral_code.total_referrer_rewards).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Used codes */}
                {myCodes.used_codes.length > 0 && (
                  <div style={card}>
                    <p style={sectionTitle}>
                      <span style={{ fontSize: '1rem' }}>✅</span> Used Codes
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {myCodes.used_codes.map(code => (
                        <PromoCodeCard key={code.id} code={code} used />
                      ))}
                    </div>
                  </div>
                )}

                {/* Expired codes */}
                {myCodes.expired_codes.length > 0 && (
                  <div style={card}>
                    <p style={sectionTitle}>
                      <span style={{ fontSize: '1rem' }}>⏰</span> Expired Codes
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {myCodes.expired_codes.map(code => (
                        <PromoCodeCard key={code.id} code={code} expired />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── TAB: Password ── */}
            {activeTab === 'password' && (

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* ── Email verification banner ── */}
                <div style={{
                  ...card,
                  padding: '14px 18px',
                  background: user?.email_verified_at ? '#f0fdf4' : '#fffbeb',
                  border: `1px solid ${user?.email_verified_at ? '#bbf7d0' : '#fde68a'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {user?.email_verified_at
                        ? <ShieldCheck size={18} style={{ color: '#15803d', flexShrink: 0 }} />
                        : <ShieldAlert size={18} style={{ color: '#b45309', flexShrink: 0 }} />
                      }
                      <div>
                        <p style={{ fontSize: '0.82rem', fontWeight: 700, color: user?.email_verified_at ? '#15803d' : '#b45309', margin: '0 0 1px' }}>
                          {user?.email_verified_at ? 'Email verified' : 'Email not verified'}
                        </p>
                        <p style={{ fontSize: '0.72rem', color: user?.email_verified_at ? '#166534' : '#92400e', margin: 0 }}>
                          {user?.email_verified_at
                            ? `Verified on ${new Date(user?.email_verified_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                            : 'Verify your email to access all features.'
                          }
                        </p>
                      </div>
                    </div>
                    {!user?.email_verified_at && (
                      <button
                        onClick={handleResendEmail}
                        disabled={resendLoading}
                        style={{
                          padding: '6px 14px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700,
                          border: 'none', cursor: resendLoading ? 'not-allowed' : 'pointer',
                          background: '#f59e0b', color: 'white', fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center', gap: 5,
                          opacity: resendLoading ? 0.7 : 1, flexShrink: 0,
                        }}
                      >
                        {resendLoading && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />}
                        {resendLoading ? 'Sending…' : 'Resend email'}
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Phone verification banner ── */}
                {customer.phone && (
                  <div style={{
                    ...card,
                    padding: '14px 18px',
                    background: user?.phone_verified_at ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${user?.phone_verified_at ? '#bbf7d0' : '#fecaca'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {user?.phone_verified_at
                          ? <ShieldCheck size={18} style={{ color: '#15803d', flexShrink: 0 }} />
                          : <ShieldAlert size={18} style={{ color: '#dc2626', flexShrink: 0 }} />
                        }
                        <div>
                          <p style={{ fontSize: '0.82rem', fontWeight: 700, color: user?.phone_verified_at ? '#15803d' : '#dc2626', margin: '0 0 1px' }}>
                            {user?.phone_verified_at ? 'Phone verified' : 'Phone not verified'}
                          </p>
                          <p style={{ fontSize: '0.72rem', color: user?.phone_verified_at ? '#166534' : '#991b1b', margin: 0 }}>
                            {user?.phone_verified_at
                              ? `Verified on ${new Date(user?.phone_verified_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                              : `We'll send a 6-digit code to ${customer.phone}`
                            }
                          </p>
                        </div>
                      </div>
                      {!user?.phone_verified_at && !otpSent && (
                        <button
                          onClick={handleSendOtp}
                          disabled={otpLoading}
                          style={{
                            padding: '6px 14px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700,
                            border: 'none', cursor: otpLoading ? 'not-allowed' : 'pointer',
                            background: '#ef4444', color: 'white', fontFamily: 'inherit',
                            display: 'flex', alignItems: 'center', gap: 5,
                            opacity: otpLoading ? 0.7 : 1, flexShrink: 0,
                          }}
                        >
                          {otpLoading && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />}
                          {otpLoading ? 'Sending…' : 'Send OTP'}
                        </button>
                      )}
                    </div>

                    {/* OTP entry form */}
                    {!user?.phone_verified_at && otpSent && (
                      <form onSubmit={handleVerifyOtp} style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={otp}
                          onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="Enter 6-digit OTP"
                          style={{
                            ...inputStyle, width: 160, textAlign: 'center',
                            letterSpacing: '0.2em', fontWeight: 700, fontSize: '1rem',
                          }}
                          onFocus={inputFocus} onBlur={inputBlur}
                        />
                        <button type="submit" disabled={otpLoading || otp.length !== 6} style={{
                          padding: '9px 16px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
                          border: 'none', cursor: (otpLoading || otp.length !== 6) ? 'not-allowed' : 'pointer',
                          background: '#6366f1', color: 'white', fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center', gap: 5,
                          opacity: (otpLoading || otp.length !== 6) ? 0.6 : 1,
                        }}>
                          {otpLoading && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />}
                          {otpLoading ? 'Verifying…' : 'Verify'}
                        </button>
                        <button type="button" onClick={() => { setOtpSent(false); setOtp(''); }} style={{
                          padding: '9px 12px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600,
                          border: '1px solid #e5e7eb', background: 'none', cursor: 'pointer',
                          color: '#6b7280', fontFamily: 'inherit',
                        }}>
                          Cancel
                        </button>
                        <button type="button" onClick={handleSendOtp} disabled={otpLoading} style={{
                          fontSize: '0.72rem', color: '#6366f1', background: 'none', border: 'none',
                          cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline',
                        }}>
                          Resend
                        </button>
                      </form>
                    )}
                  </div>
                )}

              <div style={card}>
                <p style={sectionTitle}><FileText size={14} style={{ color: '#6366f1' }} /> Change password</p>
                <form onSubmit={handlePasswordSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {[
                    { key: 'current_password',         label: 'Current password',      show: 'current' },
                    { key: 'new_password',             label: 'New password',          show: 'new',     hint: 'At least 8 characters' },
                    { key: 'new_password_confirmation',label: 'Confirm new password',  show: 'confirm' },
                  ].map(({ key, label, show, hint }) => (
                    <Field key={key} label={label}>
                      <div style={{ position: 'relative' }}>
                        <input
                          type={showPwd[show] ? 'text' : 'password'}
                          value={pwd[key]}
                          onChange={e => {
                            setPwd(p => ({ ...p, [key]: e.target.value }));
                            if (pwdErrors[key]) setPwdErrors(er => ({ ...er, [key]: null }));
                          }}
                          style={{
                            ...inputStyle, paddingRight: 36,
                            borderColor: pwdErrors[key] ? '#ef4444' : '#e5e7eb',
                          }}
                          onFocus={inputFocus} onBlur={inputBlur}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPwd(s => ({ ...s, [show]: !s[show] }))}
                          style={{
                            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                            background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex',
                          }}
                        >
                          {showPwd[show] ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                      {hint && !pwdErrors[key] && <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 3 }}>{hint}</p>}
                      {pwdErrors[key] && <p style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: 3 }}>{pwdErrors[key][0]}</p>}
                    </Field>
                  ))}
                  <button type="submit" disabled={savingPwd} style={{
                    padding: '9px 20px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700,
                    border: 'none', cursor: savingPwd ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                    background: '#6366f1', color: 'white',
                    boxShadow: '0 2px 8px rgba(99,102,241,0.35)',
                    opacity: savingPwd ? 0.7 : 1,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    alignSelf: 'flex-start',
                  }}>
                    {savingPwd && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
                    {savingPwd ? 'Changing…' : 'Change password'}
                  </button>
                </form>
              </div>
              </div>
            )}
          </div>

          {/* ── Right: account overview sidebar ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Tier + stats */}
            <div style={card}>
              <p style={{ ...sectionTitle, marginBottom: 14 }}><Star size={14} style={{ color: '#6366f1' }} /> Account overview</p>

              {/* Tier badge */}
              <div style={{
                padding: '12px 14px', borderRadius: 10, marginBottom: 14,
                background: tierClr.bg, border: `1px solid ${tierClr.ring}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: tierClr.color, margin: '0 0 2px' }}>Your tier</p>
                  <p style={{ fontSize: '1rem', fontWeight: 800, color: tierClr.color, margin: 0, textTransform: 'capitalize' }}>{tier}</p>
                </div>
                <Star size={24} style={{ color: tierClr.color, opacity: 0.4 }} />
              </div>

              {[
                { label: 'Customer no.',  value: customer.customer_number,      mono: true },
                { label: 'Total orders',     value: (customer.total_orders ?? 0).toLocaleString() },
                { label: 'Total spent',      value: fmt(customer.total_spent) },
                { label: 'Avg order value',  value: fmt(customer.average_order_value) },
                { label: 'First order',      value: fmtDate(customer.first_order_date) },
                { label: 'Last order',       value: fmtDate(customer.last_order_date) },
                { label: 'Store credit',  value: fmt(customer.store_credit) },
                { label: 'Loyalty pts',   value: `${(customer.loyalty_points ?? 0).toLocaleString()} pts` },
              ].map(({ label, value, mono }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, fontSize: '0.78rem' }}>
                  <span style={{ color: '#6b7280' }}>{label}</span>
                  <span style={{ fontWeight: 700, color: '#111827', fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
                </div>
              ))}

              {customer.discount_percentage > 0 && (
                <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <p style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 700, margin: 0 }}>
                    You have a {customer.discount_percentage}% personal discount
                  </p>
                </div>
              )}

              {/* Referral code */}
              {customer.referral_code && (
                <div style={{
                  marginTop: 10, padding: '10px 12px', borderRadius: 8,
                  background: '#faf5ff', border: '1px solid #e9d5ff',
                }}>
                  <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#7c3aed', margin: '0 0 6px' }}>
                    Your referral code
                  </p>

                  {/* Code + copy */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{
                      fontFamily: 'monospace', fontWeight: 800, fontSize: '1rem',
                      color: '#6d28d9', letterSpacing: '0.08em',
                    }}>
                      {customer.referral_code.code}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(customer.referral_code.code);
                        toast.success('Referral code copied!');
                      }}
                      title="Copy code"
                      style={{
                        padding: '3px 8px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 700,
                        border: '1px solid #ddd6fe', background: 'white', color: '#7c3aed',
                        cursor: 'pointer', fontFamily: 'inherit', transition: 'background 120ms',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f5f3ff'}
                      onMouseLeave={e => e.currentTarget.style.background = 'white'}
                    >
                      Copy
                    </button>
                  </div>

                  {/* Stats row */}
                  <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    {[
                      { label: 'Uses',   value: String(customer.referral_code.times_used ?? 0) },
                    { label: 'Reward', value: customer.referral_code.reward_type === 'percentage'
                        ? `${Number(customer.referral_code.reward_value ?? 0)}% off`
                        : `KES ${Number(customer.referral_code.reward_value ?? 0).toLocaleString()}` },
                    { label: 'Earned', value: `KES ${Number(customer.referral_code.total_referrer_rewards ?? 0).toLocaleString()}` },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ flex: 1 }}>
                        <p style={{ fontSize: '0.62rem', color: '#a78bfa', fontWeight: 600, margin: '0 0 1px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
                        <p style={{ fontSize: '0.78rem', fontWeight: 800, color: '#5b21b6', margin: 0 }}>{value}</p>
                      </div>
                    ))}
                    
                  </div>

                  {/* Share link */}
                  {customer.referral_code.share_url && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(customer.referral_code.share_url);
                        toast.success('Referral link copied!');
                      }}
                      style={{
                        marginTop: 8, width: '100%', padding: '5px 0', borderRadius: 6,
                        fontSize: '0.7rem', fontWeight: 700, border: '1px dashed #c4b5fd',
                        background: 'transparent', color: '#7c3aed', cursor: 'pointer',
                        fontFamily: 'inherit', transition: 'background 120ms',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f5f3ff'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      Copy invite link
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Tier benefits */}
            {customer.tier_benefits && (
              <div style={card}>
                <p style={{ ...sectionTitle, marginBottom: 12 }}><Star size={14} style={{ color: '#6366f1' }} /> Tier benefits</p>
                {[
                  { label: 'Loyalty multiplier', value: `×${customer.tier_benefits.loyalty_points_multiplier}` },
                  { label: 'Tier discount',      value: `${customer.tier_benefits.discount}%` },
                  { label: 'Priority support',   value: customer.tier_benefits.priority_support ? '✓ Yes' : '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.78rem' }}>
                    <span style={{ color: '#6b7280' }}>{label}</span>
                    <span style={{ fontWeight: 700, color: '#111827' }}>{value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Quick links */}
            <div style={card}>
              <p style={{ ...sectionTitle, marginBottom: 12 }}>Quick links</p>
              {[
                { label: 'My Orders',  href: '/orders' },
                { label: 'My Quotes',  href: '/quotes' },
                { label: 'My Projects',href: '/projects' },
                { label: 'Shop',       href: '/products' },
              ].map(({ label, href }) => (
                <button key={href} onClick={() => navigate(href)} style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 10px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 500,
                  background: 'none', border: 'none', cursor: 'pointer', color: '#374151',
                  fontFamily: 'inherit', marginBottom: 2, transition: 'background 120ms',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f5f3ff'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  {label} →
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

  function PromoCodeCard({ code, used = false, expired = false }) {
    const [copied, setCopied] = useState(false);

    const EVENT_ICONS = {
      birthday:          '🎂',
      first_time:        '🎉',
      vip_upgrade:       '🏆',
      loyalty_milestone: '🎯',
      win_back:          '👋',
      seasonal:          '🌟',
      flash_sale:        '⚡',
      bulk_order:        '📦',
      general:           '🏷',
    };

    const rewardStr = code.reward_type === 'percentage'
      ? `${code.reward_value}% off`
      : code.reward_type === 'fixed_amount'
        ? `KES ${Number(code.reward_value).toLocaleString()} off`
        : code.reward_type === 'free_shipping'
          ? 'Free shipping'
          : 'Store credit';

    const handleCopy = () => {
      navigator.clipboard.writeText(code.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success('Code copied!');
    };

    const opacity = used || expired ? 0.6 : 1;
    const borderColor = expired ? '#f3f4f6'
      : used    ? '#d1fae5'
      : '#e9d5ff';
    const bg = expired ? '#f9fafb'
      : used    ? '#f0fdf4'
      : '#faf5ff';

    return (
      <div style={{
        padding: '12px 14px', borderRadius: 10,
        border: `1px solid ${borderColor}`, background: bg,
        opacity, display: 'flex', alignItems: 'center', gap: 12,
      }}>
        {/* Icon */}
        <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>
          {EVENT_ICONS[code.event_type] || '🏷'}
        </span>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{
              fontFamily: 'monospace', fontWeight: 800, fontSize: '0.9rem',
              color: expired ? '#9ca3af' : used ? '#065f46' : '#6d28d9',
              letterSpacing: '0.06em',
            }}>
              {code.code}
            </span>
            {used    && <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#059669', background: '#d1fae5', padding: '1px 6px', borderRadius: 99 }}>USED</span>}
            {expired && <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#9ca3af', background: '#f3f4f6', padding: '1px 6px', borderRadius: 99 }}>EXPIRED</span>}
          </div>
          <p style={{ fontSize: '0.78rem', color: expired ? '#9ca3af' : '#374151', margin: '0 0 2px', fontWeight: 600 }}>
            {code.name}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', color: expired ? '#9ca3af' : '#7c3aed', fontWeight: 700 }}>
              {rewardStr}
            </span>
            {code.valid_until && (
              <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>
                {expired ? 'Expired' : 'Expires'}{' '}
                {new Date(code.valid_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
            {code.min_order_value > 0 && (
              <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>
                Min. KES {Number(code.min_order_value).toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Copy button — only for active codes */}
        {!used && !expired && (
          <button
            onClick={handleCopy}
            style={{
              padding: '6px 12px', borderRadius: 7, fontSize: '0.72rem', fontWeight: 700,
              border: '1.5px solid #c4b5fd', background: 'white', color: '#7c3aed',
              cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        )}
      </div>
    );
  }