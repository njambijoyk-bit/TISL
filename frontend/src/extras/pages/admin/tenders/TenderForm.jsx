import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { tendersAPI } from '../../../../_shared/api/index';
import { btnPrimary, btnGhost, card } from '../../../../_shared/theme/tokens';
import { Field, TextInput, NumberInput, SelectInput, TextArea } from '../../../../core/components/admin/ui/Form';
import { AdminPage, Heading, Loading } from '../../../components/procurement/ui';

const BLANK = { title: '', description: '', category: 'goods', budget_min: '', budget_max: '', submission_deadline: '', visibility: 'all_vendors', requirements: '', evaluation_criteria: '' };

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
    };
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
        <Field label="Submission deadline" error={err('submission_deadline')}><TextInput type="datetime-local" value={form.submission_deadline} onChange={set('submission_deadline')} error={err('submission_deadline')} /></Field>
        <Field label="Requirements" hint="One per line"><TextArea value={form.requirements} onChange={set('requirements')} rows={3} /></Field>
        <Field label="Evaluation criteria" hint="One per line"><TextArea value={form.evaluation_criteria} onChange={set('evaluation_criteria')} rows={3} /></Field>
        <div><button type="submit" disabled={saving} style={btnPrimary}><Save size={14} /> {saving ? 'Saving…' : isEdit ? 'Save tender' : 'Create tender'}</button></div>
      </form>
    </AdminPage>
  );
}
