import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Building, User, Mail, Phone, Lock, Eye, EyeOff, MapPin, ArrowRight } from 'lucide-react';
import { authAPI } from '../../../_shared/api/index';
import { useAuthStore } from '../../../_shared/store/index';
import toast from 'react-hot-toast';
import PolicyConsentCheckbox from '../../../_shared/components/legal/shared/PolicyConsentCheckbox';
import { AuthBrandBar, AuthBrandPanel } from '../../../core/pages/auth/AuthBrand';
import { useAuthBrand } from '../../../core/pages/auth/useAuthBrand';
import { colors, input, label as labelStyle, btnPrimary } from '../../../_shared/theme/tokens';

function Field({ name, label, type = 'text', placeholder, icon: Icon, value, error, focused, setFocused, onChange, rightEl }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: 'relative' }}>
        {Icon && <Icon size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: focused === name ? 'var(--color-primary-500)' : 'var(--text-tertiary)', transition: 'color 150ms', flexShrink: 0 }} />}
        <input
          name={name} type={type} value={value} onChange={onChange}
          onFocus={() => setFocused(name)} onBlur={() => setFocused('')}
          placeholder={placeholder}
          style={{
            ...input, padding: `9px ${rightEl ? '44px' : '13px'} 9px ${Icon ? '36px' : '13px'}`,
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

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!policyAccepted) { toast.error('Please accept the policies to continue.'); return; }

    setLoading(true);
    setErrors({});
    try {
      const res = await authAPI.registerVendor({ ...form, policy_acceptances: policyAcceptances });
      login(res.user, res.token);
      toast.success('Registration successful! Your account is pending approval.');
      navigate('/vendor-portal');
    } catch (err) {
      if (err.response?.status === 422) setErrors(err.response.data.errors || {});
      else toast.error(err.response?.data?.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const EyeBtn = ({ show, toggle }) => (
    <button type="button" onClick={toggle}
      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint, padding: 2 }}>
      {show ? <EyeOff size={15} /> : <Eye size={15} />}
    </button>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      <AuthBrandPanel brand={brand} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <AuthBrandBar brand={brand} />

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
          <div style={{ width: '100%', maxWidth: 440 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 4, color: colors.primary }}>Vendor Registration</h1>
            <p style={{ fontSize: '0.85rem', marginBottom: 24, color: colors.textMuted }}>
              Register as a vendor to access tenders, submit bids and manage pre-qualifications.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field name="company_name" label="Company name *" icon={Building} placeholder="Your company name" value={form.company_name} error={errors.company_name?.[0]} focused={focused} setFocused={setFocused} onChange={handleChange} />
              <Field name="contact_name" label="Contact person *" icon={User} placeholder="Full name" value={form.contact_name} error={errors.contact_name?.[0]} focused={focused} setFocused={setFocused} onChange={handleChange} />
              <Field name="email" label="Email *" type="email" icon={Mail} placeholder="you@company.com" value={form.email} error={errors.email?.[0]} focused={focused} setFocused={setFocused} onChange={handleChange} />
              <Field name="phone" label="Phone *" icon={Phone} placeholder="+254 7XX XXX XXX" value={form.phone} error={errors.phone?.[0]} focused={focused} setFocused={setFocused} onChange={handleChange} />
              <Field name="tax_id" label="Tax / KRA PIN" icon={Building} placeholder="e.g. A123456789B" value={form.tax_id} error={errors.tax_id?.[0]} focused={focused} setFocused={setFocused} onChange={handleChange} />
              <Field name="address" label="Address" icon={MapPin} placeholder="Street address" value={form.address} error={errors.address?.[0]} focused={focused} setFocused={setFocused} onChange={handleChange} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field name="city" label="City" value={form.city} error={errors.city?.[0]} focused={focused} setFocused={setFocused} onChange={handleChange} />
                <Field name="country" label="Country" value={form.country} error={errors.country?.[0]} focused={focused} setFocused={setFocused} onChange={handleChange} />
              </div>

              <Field name="password" label="Password *" type={showPassword ? 'text' : 'password'} icon={Lock} placeholder="Create a strong password" value={form.password} error={errors.password?.[0]} focused={focused} setFocused={setFocused} onChange={handleChange}
                rightEl={<EyeBtn show={showPassword} toggle={() => setShowPassword(!showPassword)} />} />
              <Field name="password_confirmation" label="Confirm password *" type={showConfirm ? 'text' : 'password'} icon={Lock} placeholder="Repeat your password" value={form.password_confirmation} error={errors.password_confirmation?.[0]} focused={focused} setFocused={setFocused} onChange={handleChange}
                rightEl={<EyeBtn show={showConfirm} toggle={() => setShowConfirm(!showConfirm)} />} />

              <PolicyConsentCheckbox context="vendor_register" onAcceptedChange={setPolicyAccepted} onAcceptancesChange={setPolicyAcceptances} />

              <button type="submit" disabled={loading || !policyAccepted}
                style={{ ...btnPrimary, width: '100%', padding: '12px 0', opacity: loading || !policyAccepted ? 0.5 : 1, cursor: loading || !policyAccepted ? 'not-allowed' : 'pointer' }}>
                {loading ? 'Creating account…' : <>Register as vendor <ArrowRight size={15} /></>}
              </button>
            </form>

            <p style={{ textAlign: 'center', fontSize: '0.8rem', marginTop: 20, color: colors.textMuted }}>
              Already have an account? <Link to="/login" style={{ color: 'var(--color-primary-500)', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
