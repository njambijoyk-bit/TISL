import { useState, useEffect, useRef } from 'react';
import { Save, Upload, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { vendorPortalAPI } from '../../../_shared/api/index';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, card, colors } from '../../../_shared/theme/tokens';
import { Field, TextInput, SelectInput } from '../../../core/components/admin/ui/Form';
import { SitePage, Heading, Loading, ErrorBanner, StatusBadge } from '../../components/procurement/ui';
import { GROUP_LABELS } from '../../components/procurement/format';

const KEYS = ['company_name', 'contact_name', 'email', 'phone', 'tax_id', 'registration_number', 'address', 'city', 'country', 'special_group', 'special_group_certificate', 'special_group_valid_until'];
const crumbs = [['Home', '/'], ['Vendor portal', '/vendor-portal'], ['Profile', null]];
const sub = { fontSize: '0.78rem', color: colors.textMuted, margin: '2px 0 0', lineHeight: 1.5 };

export default function VendorProfile() {
  const fileRef = useRef(null);
  const [form, setForm] = useState(Object.fromEntries(KEYS.map(k => [k, ''])));
  const [status, setStatus] = useState('unconfirmed');
  const [scans, setScans] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);

  const apply = (v) => {
    setForm(Object.fromEntries(KEYS.map(k => [k, k === 'special_group_valid_until' ? String(v[k] || '').slice(0, 10) : (v[k] || '')])));
    setStatus(v.special_group_status || 'unconfirmed');
    setScans(v.scan_urls || []);
  };
  const load = () => vendorPortalAPI.profile().then(apply).catch(e => setError(errMsg(e, 'Failed to load profile'))).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => { setForm(f => ({ ...f, [k]: e.target.value })); setErrors(p => ({ ...p, [k]: '' })); };
  const err = (k) => (Array.isArray(errors[k]) ? errors[k][0] : errors[k]);
  const f = (k, label, extra = {}) => <Field label={label} error={err(k)}><TextInput value={form[k]} onChange={set(k)} error={err(k)} {...extra} /></Field>;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setErrors({}); setError(null);
    const body = {
      contact_name: form.contact_name, phone: form.phone, address: form.address || null, city: form.city || null, country: form.country || null,
      tax_id: form.tax_id || null, registration_number: form.registration_number || null,
      special_group: form.special_group || null, special_group_certificate: form.special_group_certificate || null, special_group_valid_until: form.special_group_valid_until || null,
    };
    try { const r = await vendorPortalAPI.updateProfile(body); toast.success(r.message); await load(); }
    catch (x) {
      if (x.response?.status === 422) setErrors(x.response.data.errors || {});
      setError(errMsg(x, 'Failed to update profile'));
    } finally { setSaving(false); }
  };

  const upload = async () => {
    const fd = new FormData();
    files.forEach(x => fd.append('files[]', x));
    setUploading(true); setError(null);
    try { const r = await vendorPortalAPI.uploadCertificate(fd); toast.success(r.message); setFiles([]); if (fileRef.current) fileRef.current.value = ''; await load(); }
    catch (x) { setError(errMsg(x, 'Upload failed')); } finally { setUploading(false); }
  };
  const remove = async () => {
    if (!window.confirm('Remove the uploaded certificate? Your people category will need confirming again.')) return;
    try { await vendorPortalAPI.deleteCertificate(); await load(); } catch (x) { setError(errMsg(x, 'Could not remove it')); }
  };

  if (loading) return <SitePage width={680} crumbs={crumbs}><Loading /></SitePage>;

  return (
    <SitePage width={680} crumbs={crumbs}>
      <Heading title="Company profile" description="Your company details as the buyer sees them." />
      <ErrorBanner message={error} />
      <form onSubmit={submit} style={{ ...card, padding: 22, display: 'grid', gap: 14 }}>
        {f('company_name', 'Company name', { disabled: true })}
        {f('contact_name', 'Contact person')}
        {f('email', 'Email', { type: 'email', disabled: true })}
        <p style={{ ...sub, margin: '-8px 0 0' }}>To change the company name or email, contact our procurement office.</p>
        {f('phone', 'Phone')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {f('tax_id', 'Tax / KRA PIN')}
          {f('registration_number', 'Company registration number')}
        </div>
        {f('address', 'Address')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>{f('city', 'City')}{f('country', 'Country')}</div>

        <div style={{ borderTop: `1px solid ${colors.tint(0.1)}`, paddingTop: 14, display: 'grid', gap: 12 }}>
          <div>
            <strong style={{ fontSize: '0.9rem', color: colors.text }}>People category</strong>
            <p style={sub}>Only if your business belongs to one of the groups some tenders are reserved for (youth, women, persons with disabilities, SMEs). Leave it as None otherwise. Our staff check your certificate before the category counts.</p>
          </div>
          <Field label="Category" error={err('special_group')}>
            <SelectInput value={form.special_group} onChange={set('special_group')}>
              <option value="">None</option>
              {Object.entries(GROUP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </SelectInput>
          </Field>
          {form.special_group && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                {f('special_group_certificate', 'Certificate number')}
                {f('special_group_valid_until', 'Certificate valid until', { type: 'date' })}
              </div>
              <div style={{ fontSize: '0.8rem', color: colors.textBody, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                Status: <StatusBadge status={status === 'confirmed' ? 'qualified' : 'pending'} label={status === 'confirmed' ? 'Confirmed by staff' : 'Waiting for staff to confirm'} />
              </div>
            </>
          )}
        </div>
        <div><button type="submit" disabled={saving} style={btnPrimary}><Save size={14} /> {saving ? 'Saving…' : 'Save profile'}</button></div>
      </form>

      {form.special_group && (
        <div style={{ ...card, padding: 22, marginTop: 14, display: 'grid', gap: 12 }}>
          <div>
            <strong style={{ fontSize: '0.9rem', color: colors.text }}>Certificate scan</strong>
            <p style={sub}>Upload your certificate as a PDF, or a photo or screenshot of each page (JPG, PNG or WebP, up to 6 files and 10 pages). For your safety and ours, the server does not keep the file you send: it redraws every page as a plain picture and keeps only that. Uploading again replaces the earlier scan.</p>
          </div>
          {scans.length > 0 && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {scans.map((url, i) => (
                <a key={url} href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open page ${i + 1}`} style={{ display: 'block', width: 110, border: `1px solid ${colors.tint(0.2)}`, borderRadius: 8, overflow: 'hidden' }}>
                  <img src={url} alt={`Certificate page ${i + 1}`} style={{ display: 'block', width: '100%', height: 140, objectFit: 'cover', objectPosition: 'top' }} />
                </a>
              ))}
            </div>
          )}
          <input ref={fileRef} type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => setFiles([...e.target.files])} aria-label="Certificate files" style={{ fontSize: '0.8rem', color: colors.text }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={!files.length || uploading} onClick={upload} style={{ ...btnPrimary, opacity: !files.length || uploading ? 0.6 : 1 }}><Upload size={14} /> {uploading ? 'Checking and uploading…' : 'Upload certificate'}</button>
            {scans.length > 0 && <button type="button" onClick={remove} style={{ ...btnGhost, color: colors.danger }}><Trash2 size={14} /> Remove</button>}
          </div>
        </div>
      )}
    </SitePage>
  );
}
