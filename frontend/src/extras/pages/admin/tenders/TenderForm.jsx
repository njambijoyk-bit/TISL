import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { tendersAPI } from '../../../../_shared/api/index';
import { btnPrimary, btnGhost, card } from '../../../../_shared/theme/tokens';
import { Field, TextInput, NumberInput, SelectInput, TextArea, CheckboxRow } from '../../../../core/components/admin/ui/Form';
import { AdminPage, Heading, Loading } from '../../../components/procurement/ui';
import { METHOD_LABELS, SUBMISSION_LABELS } from '../../../components/procurement/format';

const BLANK = {
  title: '', description: '', category: 'goods', budget_min: '', budget_max: '', submission_deadline: '', visibility: 'all_vendors', requirements: '', evaluation_criteria: '',
  tender_number: '', ocid: '', procurement_method: 'open_tender', submission_method: 'electronic', reservation_scheme: '', has_preference_scheme: false,
  opening_venue: '', tender_fee: '', validity_days: '', financial_year: '', public_link: '',
};
const BLANK_TO_NULL = ['ocid', 'reservation_scheme', 'opening_venue', 'financial_year', 'public_link', 'validity_days'];

export default function TenderForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(isEdit);

  useEffect(() => {
    if (!isEdit) return;
    tendersAPI.show(id)
      .then(t => setForm({
        title: t.title || '', description: t.description || '', category: t.category || 'goods',
        budget_min: t.budget_min || '', budget_max: t.budget_max || '',
        submission_deadline: t.submission_deadline ? t.submission_deadline.replace(' ', 'T').slice(0, 16) : '',
        visibility: t.visibility || 'all_vendors',
        requirements: (t.requirements || []).map(r => r.label || r).join('\n'),
        evaluation_criteria: (t.evaluation_criteria || []).map(c => c.criterion || c).join('\n'),
        ocid: t.ocid || '', procurement_method: t.procurement_method || 'open_tender', submission_method: t.submission_method || 'electronic',
        reservation_scheme: t.reservation_scheme || '', has_preference_scheme: !!t.has_preference_scheme, opening_venue: t.opening_venue || '',
        tender_fee: Number(t.tender_fee) || '', validity_days: t.validity_days || '', financial_year: t.financial_year || '', public_link: t.public_link || '',
      }))
      .catch(() => toast.error('Failed to load tender'))
      .finally(() => setFetching(false));
  }, [id, isEdit]);

  const set = (k) => (e) => { setForm(f => ({ ...f, [k]: e.target.value })); setErrors(p => ({ ...p, [k]: '' })); };
  const err = (k) => (Array.isArray(errors[k]) ? errors[k][0] : errors[k]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setErrors({});
    const payload = {
      ...form,
      budget_min: form.budget_min || null,
      budget_max: form.budget_max || null,
      submission_deadline: form.submission_deadline || null,
      requirements: form.requirements.split('\n').filter(Boolean).map(label => ({ label })),
      evaluation_criteria: form.evaluation_criteria.split('\n').filter(Boolean).map(criterion => ({ criterion })),
      tender_fee: form.tender_fee === '' ? 0 : form.tender_fee,
      ...Object.fromEntries(BLANK_TO_NULL.map(k => [k, form[k] === '' ? null : form[k]])),
    };
    if (isEdit || !form.tender_number) delete payload.tender_number;
    try {
      if (isEdit) { await tendersAPI.update(id, payload); toast.success('Tender updated'); navigate(`/admin/tenders/${id}`); }
      else { const r = await tendersAPI.create(payload); toast.success('Tender created'); navigate(`/admin/tenders/${r.id}`); }
    } catch (x) {
      if (x.response?.status === 422) setErrors(x.response.data.errors || {});
      else toast.error(x.response?.data?.message || 'Failed to save tender');
    } finally { setSaving(false); }
  };

  if (fetching) return <AdminPage><Loading /></AdminPage>;

  return (
    <AdminPage width={720}>
      <Link to={isEdit ? `/admin/tenders/${id}` : '/admin/tenders'} style={{ ...btnGhost, textDecoration: 'none', marginBottom: 16, padding: '5px 12px', fontSize: '0.75rem' }}><ArrowLeft size={13} /> Back</Link>
      <Heading title={isEdit ? 'Edit tender' : 'New tender'} description="A tender stays a draft until you publish it from its page." />

      <form onSubmit={submit} style={{ ...card, padding: 22, display: 'grid', gap: 14 }}>
        <Field label="Title" error={err('title')}><TextInput value={form.title} onChange={set('title')} error={err('title')} /></Field>
        <Field label="Description" error={err('description')}><TextArea value={form.description} onChange={set('description')} rows={4} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <Field label="Category" error={err('category')}>
            <SelectInput value={form.category} onChange={set('category')}>
              <option value="goods">Goods</option><option value="services">Services</option><option value="works">Works</option>
            </SelectInput>
          </Field>
          <Field label="Visibility" error={err('visibility')}>
            <SelectInput value={form.visibility} onChange={set('visibility')}>
              <option value="all_vendors">All vendors</option><option value="prequalified">Pre-qualified only</option><option value="invited">Invited only</option>
            </SelectInput>
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <Field label="Budget min (KES)" error={err('budget_min')}><NumberInput value={form.budget_min} onChange={set('budget_min')} error={err('budget_min')} /></Field>
          <Field label="Budget max (KES)" error={err('budget_max')}><NumberInput value={form.budget_max} onChange={set('budget_max')} error={err('budget_max')} /></Field>
        </div>
        {!isEdit && <Field label="Tender number" hint="Leave blank to number it automatically" error={err('tender_number')}><TextInput value={form.tender_number} onChange={set('tender_number')} placeholder="e.g. KEFRI/1074/0003/2026-27" error={err('tender_number')} /></Field>}
        <Field label="OCID" error={err('ocid')}><TextInput value={form.ocid} onChange={set('ocid')} error={err('ocid')} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <Field label="Procurement method" error={err('procurement_method')}>
            <SelectInput value={form.procurement_method} onChange={set('procurement_method')}>
              {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </SelectInput>
          </Field>
          <Field label="Submission method" error={err('submission_method')}>
            <SelectInput value={form.submission_method} onChange={set('submission_method')}>
              {Object.entries(SUBMISSION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </SelectInput>
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <Field label="Reservation scheme" hint="e.g. AGPO - Youth" error={err('reservation_scheme')}><TextInput value={form.reservation_scheme} onChange={set('reservation_scheme')} error={err('reservation_scheme')} /></Field>
          <Field label="Financial year" hint="e.g. 2026/2027" error={err('financial_year')}><TextInput value={form.financial_year} onChange={set('financial_year')} placeholder="2026/2027" error={err('financial_year')} /></Field>
        </div>
        <CheckboxRow checked={form.has_preference_scheme} onChange={(v) => setForm(f => ({ ...f, has_preference_scheme: v }))} label="Preference and reservation scheme applies" />
        <Field label="Opening venue" error={err('opening_venue')}><TextInput value={form.opening_venue} onChange={set('opening_venue')} error={err('opening_venue')} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <Field label="Tender fee (KES)" hint="0 = free" error={err('tender_fee')}><NumberInput value={form.tender_fee} onChange={set('tender_fee')} error={err('tender_fee')} /></Field>
          <Field label="Tender validity (days)" error={err('validity_days')}><NumberInput value={form.validity_days} onChange={set('validity_days')} error={err('validity_days')} /></Field>
        </div>
        <Field label="Public link" hint="Where the notice is also published, if anywhere" error={err('public_link')}><TextInput type="url" value={form.public_link} onChange={set('public_link')} error={err('public_link')} /></Field>
        <Field label="Submission deadline" error={err('submission_deadline')}><TextInput type="datetime-local" value={form.submission_deadline} onChange={set('submission_deadline')} error={err('submission_deadline')} /></Field>
        <Field label="Requirements" hint="One per line"><TextArea value={form.requirements} onChange={set('requirements')} rows={3} /></Field>
        <Field label="Evaluation criteria" hint="One per line"><TextArea value={form.evaluation_criteria} onChange={set('evaluation_criteria')} rows={3} /></Field>
        <div><button type="submit" disabled={saving} style={btnPrimary}><Save size={14} /> {saving ? 'Saving…' : isEdit ? 'Save tender' : 'Create tender'}</button></div>
      </form>
    </AdminPage>
  );
}
