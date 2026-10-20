import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { vendorPortalAPI } from '../../../_shared/api/index';
import { btnPrimary, card } from '../../../_shared/theme/tokens';
import { Field, TextInput } from '../../../core/components/admin/ui/Form';
import { Page, Heading, Loading } from '../../components/procurement/ui';

const KEYS = ['company_name', 'contact_name', 'email', 'phone', 'tax_id', 'address', 'city', 'country'];

export default function VendorProfile() {
  const [form, setForm] = useState(Object.fromEntries(KEYS.map(k => [k, ''])));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    vendorPortalAPI.profile()
      .then(v => setForm(Object.fromEntries(KEYS.map(k => [k, v[k] || '']))))
      .catch(() => toast.error('Failed to load profile'))
      .finally(() => setLoading(false));
  }, []);

  const set = (k) => (e) => { setForm(f => ({ ...f, [k]: e.target.value })); setErrors(p => ({ ...p, [k]: '' })); };
  const err = (k) => (Array.isArray(errors[k]) ? errors[k][0] : errors[k]);
  const f = (k, label, extra = {}) => <Field label={label} error={err(k)}><TextInput value={form[k]} onChange={set(k)} error={err(k)} {...extra} /></Field>;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setErrors({});
    try { await vendorPortalAPI.updateProfile(form); toast.success('Profile updated'); }
    catch (x) {
      if (x.response?.status === 422) setErrors(x.response.data.errors || {});
      else toast.error('Failed to update profile');
    } finally { setSaving(false); }
  };

  if (loading) return <Page width={640}><Loading /></Page>;

  return (
    <Page width={640}>
      <Heading title="Company profile" description="Your company details as the buyer sees them." />
      <form onSubmit={submit} style={{ ...card, padding: 22, display: 'grid', gap: 14 }}>
        {f('company_name', 'Company name')}
        {f('contact_name', 'Contact person')}
        {f('email', 'Email', { type: 'email' })}
        {f('phone', 'Phone')}
        {f('tax_id', 'Tax / KRA PIN')}
        {f('address', 'Address')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>{f('city', 'City')}{f('country', 'Country')}</div>
        <div><button type="submit" disabled={saving} style={btnPrimary}><Save size={14} /> {saving ? 'Saving…' : 'Save profile'}</button></div>
      </form>
    </Page>
  );
}
