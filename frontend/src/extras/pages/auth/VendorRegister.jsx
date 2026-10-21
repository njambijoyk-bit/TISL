import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Mail, Phone, Lock, Eye, EyeOff, Building, MapPin, ArrowRight } from 'lucide-react';
import { authAPI } from '../../../_shared/api/index';
import { useAuthStore } from '../../../_shared/store/index';
import toast from 'react-hot-toast';
import PolicyConsentCheckbox from '../../../_shared/components/legal/shared/PolicyConsentCheckbox';
import { AuthBrandBar, AuthBrandPanel } from '../../../core/pages/auth/AuthBrand';
import { useAuthBrand } from '../../../core/pages/auth/useAuthBrand';
import SuggestPassword from '../../../_shared/components/common/SuggestPassword';
import { colors, input, label as labelStyle } from '../../../_shared/theme/tokens';

const POLICY_KEYS = ['terms_of_use', 'privacy_policy'];

// Outside the page component so inputs keep focus while typing
function Field({ name, label, type = 'text', placeholder, icon: Icon, value, error, focused, setFocused, onChange, rightEl, suggest }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={labelStyle}>{label}{suggest && <SuggestPassword onPick={suggest} style={{ float: 'right' }} />}</label>
      <div style={{ position: 'relative' }}>
        {Icon && <Icon size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: focused === name ? colors.primary : colors.textFaint, transition: 'color 150ms', flexShrink: 0 }} />}
        <input
          name={name} type={type} value={value} onChange={onChange}
          onFocus={() => setFocused(name)} onBlur={() => setFocused('')}
          placeholder={placeholder}
          style={{
            ...input, padding: `10px ${rightEl ? '44px' : '13px'} 10px ${Icon ? '36px' : '13px'}`,
            borderColor: error ? colors.danger : focused === name ? colors.primary : colors.tint(0.18),
            boxShadow: focused === name ? `0 0 0 3px ${colors.tint(0.1)}` : 'none',
          }}
        />
        {rightEl}
      </div>
      {error && <p style={{ color: colors.danger, fontSize: '0.72rem', marginTop: 3 }}>{error}</p>}
    </div>
  );
}

function EyeBtn({ show, toggle }) {
  return (
    <button type="button" onClick={toggle} aria-label={show ? 'Hide password' : 'Show password'}
      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint, padding: 2 }}>
      {show ? <EyeOff size={15} /> : <Eye size={15} />}
    </button>
  );
}

export default function VendorRegister() {
  const brand = useAuthBrand();
  const navigate = useNavigate();
  const { login } = useAuthStore();

  const [form, setForm] = useState({
    company_name: '', contact_name: '', email: '', phone: '',
    tax_id: '', address: '', city: '', country: '',
    password: '', password_confirmation: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [errors,       setErrors]       = useState({});
  const [focused,      setFocused]      = useState('');
  const [policyAccepted,    setPolicyAccepted]    = useState(false);
  const [policyAcceptances, setPolicyAcceptances] = useState([]);

  const clear = (name) => { if (errors[name]) setErrors(e => ({ ...e, [name]: '' })); };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    clear(name);
  };

  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/[^0-9+\-\s()]/g, '').substring(0, 20);
    setForm(f => ({ ...f, phone: value }));
    clear('phone');
  };

  const validate = () => {
    const e = {};
    if (!form.company_name) e.company_name = 'Company name is required';
    if (!form.contact_name) e.contact_name = 'Contact person is required';
    if (!form.email) e.email = 'Email is required';
    if (!form.phone) e.phone = 'Phone is required';
    else if (form.phone.replace(/\D/g, '').length < 10) e.phone = 'Phone must be at least 10 digits';
    if (!form.password) e.password = 'Password is required';
    else if (form.password.length < 10) e.password = 'At least 10 characters';
    if (form.password !== form.password_confirmation) e.password_confirmation = 'Passwords do not match';
    if (!policyAccepted) e.policies = 'You must accept the policies to continue';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      setLoading(true);
      const res = await authAPI.registerVendor({ ...form, policy_acceptances: policyAcceptances });
      login(res.user, null, res.token, null, res.csrf ?? null);
      toast.success('Registration successful. Your account is pending approval.');
      navigate('/vendor-portal');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed');
      if (err.response?.data?.errors) {
        setErrors(Object.fromEntries(Object.entries(err.response.data.errors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
      }
    } finally {
      setLoading(false);
    }
  };

  const fp = { focused, setFocused, onChange: handleChange };
  const blocked = loading || !policyAccepted;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="tisl-outer" style={{ width: '100%', maxWidth: 900, display: 'flex', flexDirection: 'column' }}>

        <div className="tisl-mobile-bar" style={{
          display: 'none', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
          padding: '20px 24px', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <AuthBrandBar />
          </div>
          <Link to="/login" style={{ color: 'rgba(255,255,255,0.9)', borderRadius: 8, padding: '7px 16px', fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none', border: '1.5px solid rgba(255,255,255,0.35)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Login</Link>
        </div>

        <div className="tisl-card" style={{
          display: 'grid', gridTemplateColumns: '1fr 1.5fr',
          width: '100%', borderRadius: 24, overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.14)',
        }}>

          <div className="tisl-sidebar" style={{
            position: 'relative', overflow: 'hidden',
            background: 'linear-gradient(145deg, var(--color-primary-400) 0%, var(--color-primary-500) 40%, var(--color-primary-600) 100%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '40px 32px', gap: 24,
          }}>
            <div style={{ position: 'absolute', top: -60, left: -60, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ position: 'absolute', bottom: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ position: 'absolute', top: '40%', left: -30, width: 120, height: 120, borderRadius: 24, background: 'rgba(255,255,255,0.07)', transform: 'rotate(20deg)' }} />

            <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
              <AuthBrandPanel />
            </div>

            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              <Link to="/login" style={{ color: 'rgba(255,255,255,0.9)', borderRadius: 12, padding: '12px 20px', fontSize: '0.88rem', fontWeight: 600, textAlign: 'center', border: '1.5px solid rgba(255,255,255,0.35)', letterSpacing: '0.04em', textTransform: 'uppercase', textDecoration: 'none' }}>Login</Link>
              <div style={{ background: 'white', color: 'var(--color-primary-500)', borderRadius: 12, padding: '12px 20px', fontSize: '0.88rem', fontWeight: 800, textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Vendor Sign Up</div>
            </div>

            <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem', margin: 0, lineHeight: 1.7 }}>
                {brand.tagline || 'Register as a supplier to bid on tenders and get pre-qualified.'}
              </p>
            </div>
          </div>

          <div style={{ padding: '36px 40px', overflowY: 'auto', minWidth: 0 }} className="tisl-form bg-white dark:bg-gray-800">
            <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0 0 4px', color: colors.primary }}>Vendor registration</h1>
            <p style={{ fontSize: '0.8rem', margin: '0 0 20px', color: colors.textMuted, lineHeight: 1.5 }}>
              Supply us goods or services: browse tenders, submit bids and manage your pre-qualification.
            </p>

            <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="tisl-field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field name="company_name" label="Company name" icon={Building} placeholder="Your company" value={form.company_name} error={errors.company_name} {...fp} />
                <Field name="contact_name" label="Contact person" icon={User} placeholder="Full name" value={form.contact_name} error={errors.contact_name} {...fp} />
              </div>

              <div className="tisl-field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field name="email" label="Email" type="email" icon={Mail} placeholder="you@company.com" value={form.email} error={errors.email} {...fp} />
                <Field name="phone" label="Phone" type="tel" icon={Phone} placeholder="+254712345678" value={form.phone} error={errors.phone} {...fp} onChange={handlePhoneChange} />
              </div>

              <div className="tisl-field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field name="tax_id" label="Tax / KRA PIN (optional)" icon={Building} placeholder="A123456789B" value={form.tax_id} error={errors.tax_id} {...fp} />
                <Field name="address" label="Address (optional)" icon={MapPin} placeholder="Street address" value={form.address} error={errors.address} {...fp} />
              </div>

              <div className="tisl-field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field name="city" label="City (optional)" placeholder="Nairobi" value={form.city} error={errors.city} {...fp} />
                <Field name="country" label="Country (optional)" placeholder="Kenya" value={form.country} error={errors.country} {...fp} />
              </div>

              <Field name="password" label="Password" type={showPassword ? 'text' : 'password'} icon={Lock} placeholder="At least 10 characters"
                suggest={(pw) => { setForm(f => ({ ...f, password: pw, password_confirmation: pw })); setShowPassword(true); setShowConfirm(true); }}
                value={form.password} error={errors.password} {...fp}
                rightEl={<EyeBtn show={showPassword} toggle={() => setShowPassword(s => !s)} />} />
              <Field name="password_confirmation" label="Confirm password" type={showConfirm ? 'text' : 'password'} icon={Lock} placeholder="Confirm your password"
                value={form.password_confirmation} error={errors.password_confirmation} {...fp}
                rightEl={<EyeBtn show={showConfirm} toggle={() => setShowConfirm(s => !s)} />} />

              <PolicyConsentCheckbox
                policyKeys={POLICY_KEYS}
                actionContext="vendor_register"
                onChange={(isChecked, acceptances) => {
                  setPolicyAccepted(isChecked);
                  setPolicyAcceptances(acceptances);
                  clear('policies');
                }}
                disabled={loading}
              />
              {errors.policies && <p style={{ color: colors.danger, fontSize: '0.75rem', marginTop: -8 }}>{errors.policies}</p>}

              <button type="submit" disabled={blocked}
                style={{
                  height: 46, borderRadius: 12, border: 'none', cursor: blocked ? 'not-allowed' : 'pointer',
                  background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))', color: 'white',
                  fontSize: '0.88rem', fontWeight: 700, letterSpacing: '0.04em',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: blocked ? 'none' : `0 4px 14px ${colors.tint(0.35)}`, opacity: blocked ? 0.5 : 1, transition: 'all 200ms',
                }}>
                {loading ? 'Creating account…' : <><span>Register as vendor</span><ArrowRight size={16} /></>}
              </button>
            </form>

            <p style={{ textAlign: 'center', fontSize: '0.8rem', marginTop: 16, color: colors.textMuted }}>
              Already a vendor?{' '}
              <Link to="/login" style={{ color: colors.primary, fontWeight: 700, textDecoration: 'none' }}>Sign in as vendor</Link>
            </p>
            <p style={{ textAlign: 'center', fontSize: '0.75rem', marginTop: 6, color: colors.textFaint }}>
              Buying from us instead?{' '}
              <Link to="/register" style={{ color: colors.primary, fontWeight: 600, textDecoration: 'none' }}>Create a customer account</Link>
            </p>
          </div>
        </div>

        <style>{`
          @media (max-width: 640px) {
            .tisl-mobile-bar { display: flex !important; }
            .tisl-card { grid-template-columns: 1fr !important; border-radius: 0 0 24px 24px !important; box-shadow: 0 8px 32px rgba(0,0,0,0.10) !important; }
            .tisl-sidebar { display: none !important; }
            .tisl-outer { padding: 0 !important; }
            .tisl-form { padding: 28px 20px !important; }
            .tisl-field-row { grid-template-columns: 1fr !important; }
          }
          @media (min-width: 641px) { .tisl-mobile-bar { display: none !important; } }
        `}</style>
      </div>
    </div>
  );
}
