import { useState, useEffect } from 'react';
import { Building, Save, Mail, Phone, MapPin } from 'lucide-react';
import { vendorPortalAPI } from '../../../_shared/api/index';
import toast from 'react-hot-toast';

export default function VendorProfile() {
  const [form, setForm] = useState({ company_name: '', contact_name: '', email: '', phone: '', tax_id: '', address: '', city: '', country: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    vendorPortalAPI.profile()
      .then(r => {
        const v = r.data || r;
        setForm({ company_name: v.company_name || '', contact_name: v.contact_name || '', email: v.email || '', phone: v.phone || '', tax_id: v.tax_id || '', address: v.address || '', city: v.city || '', country: v.country || '' });
      })
      .catch(() => toast.error('Failed to load profile'))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await vendorPortalAPI.updateProfile(form);
      toast.success('Profile updated');
    } catch (err) {
      if (err.response?.status === 422) setErrors(err.response.data.errors || {});
      else toast.error('Failed to update profile');
    } finally { setSaving(false); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }} className="text-gray-400">Loading…</div>;

  const Field = ({ name, label, icon: Icon }) => (
    <div>
      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }} className="text-gray-500 dark:text-gray-400">{label}</label>
      <div style={{ position: 'relative' }}>
        {Icon && <Icon size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }} className="text-gray-400" />}
        <input name={name} value={form[name]} onChange={handleChange}
          style={{ width: '100%', padding: `10px 13px 10px ${Icon ? '36px' : '13px'}`, borderRadius: 10, border: `1.5px solid ${errors[name] ? '#ef4444' : '#e5e7eb'}`, fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
          className="bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
      </div>
      {errors[name] && <p style={{ color: '#ef4444', fontSize: '0.72rem', marginTop: 3 }}>{Array.isArray(errors[name]) ? errors[name][0] : errors[name]}</p>}
    </div>
  );

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '32px 20px' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 4 }} className="text-gray-900 dark:text-white">Company Profile</h1>
      <p style={{ fontSize: '0.82rem', marginBottom: 24 }} className="text-gray-500 dark:text-gray-400">Update your vendor company details</p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field name="company_name" label="Company name" icon={Building} />
        <Field name="contact_name" label="Contact person" />
        <Field name="email" label="Email" icon={Mail} />
        <Field name="phone" label="Phone" icon={Phone} />
        <Field name="tax_id" label="Tax / KRA PIN" />
        <Field name="address" label="Address" icon={MapPin} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field name="city" label="City" />
          <Field name="country" label="Country" />
        </div>

        <button type="submit" disabled={saving}
          style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', background: 'var(--color-primary-500)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Save size={15} /> {saving ? 'Saving…' : 'Update Profile'}
        </button>
      </form>
    </div>
  );
}
