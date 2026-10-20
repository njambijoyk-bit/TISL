import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { tendersAPI } from '../../../../_shared/api/index';
import toast from 'react-hot-toast';

export default function TenderForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [form, setForm] = useState({
    title: '', description: '', category: '', reference_number: '',
    estimated_budget: '', closing_date: '', visibility: 'all_vendors',
    requirements: '', evaluation_criteria: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);

  useEffect(() => {
    if (!isEdit) return;
    tendersAPI.show(id)
      .then(r => {
        const t = r.data || r;
        setForm({
          title: t.title || '', description: t.description || '', category: t.category || '',
          reference_number: t.reference_number || '', estimated_budget: t.estimated_budget || '',
          closing_date: t.closing_date ? t.closing_date.slice(0, 10) : '',
          visibility: t.visibility || 'all_vendors', requirements: Array.isArray(t.requirements) ? t.requirements.join('\n') : (t.requirements || ''),
          evaluation_criteria: Array.isArray(t.evaluation_criteria) ? t.evaluation_criteria.join('\n') : (t.evaluation_criteria || ''),
        });
      })
      .catch(() => toast.error('Failed to load tender'))
      .finally(() => setFetching(false));
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});
    try {
      const payload = {
        ...form,
        requirements: form.requirements ? form.requirements.split('\n').filter(Boolean) : [],
        evaluation_criteria: form.evaluation_criteria ? form.evaluation_criteria.split('\n').filter(Boolean) : [],
      };
      if (isEdit) {
        await tendersAPI.update(id, payload);
        toast.success('Tender updated');
      } else {
        const r = await tendersAPI.create(payload);
        toast.success('Tender created');
        navigate(`/admin/tenders/${r.data?.id || r.id}`);
        return;
      }
      navigate(`/admin/tenders/${id}`);
    } catch (err) {
      if (err.response?.status === 422) setErrors(err.response.data.errors || {});
      else toast.error(err.response?.data?.message || 'Failed to save tender');
    } finally { setLoading(false); }
  };

  if (fetching) return <div style={{ padding: 40, textAlign: 'center' }} className="text-gray-400">Loading…</div>;

  const Field = ({ name, label, type = 'text', as, rows, children }) => (
    <div>
      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }} className="text-gray-500 dark:text-gray-400">{label}</label>
      {as === 'select' ? (
        <select name={name} value={form[name]} onChange={handleChange}
          style={{ width: '100%', padding: '10px 13px', borderRadius: 10, border: `1.5px solid ${errors[name] ? '#ef4444' : '#e5e7eb'}`, fontSize: '0.85rem', outline: 'none' }}
          className="bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white">
          {children}
        </select>
      ) : as === 'textarea' ? (
        <textarea name={name} value={form[name]} onChange={handleChange} rows={rows || 4}
          style={{ width: '100%', padding: '10px 13px', borderRadius: 10, border: `1.5px solid ${errors[name] ? '#ef4444' : '#e5e7eb'}`, fontSize: '0.85rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
          className="bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
      ) : (
        <input name={name} type={type} value={form[name]} onChange={handleChange}
          style={{ width: '100%', padding: '10px 13px', borderRadius: 10, border: `1.5px solid ${errors[name] ? '#ef4444' : '#e5e7eb'}`, fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
          className="bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
      )}
      {errors[name] && <p style={{ color: '#ef4444', fontSize: '0.72rem', marginTop: 3 }}>{Array.isArray(errors[name]) ? errors[name][0] : errors[name]}</p>}
    </div>
  );

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 20px' }}>
      <button onClick={() => navigate(isEdit ? `/admin/tenders/${id}` : '/admin/tenders')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, marginBottom: 20 }}
        className="text-gray-500 dark:text-gray-400">
        <ArrowLeft size={15} /> Back
      </button>

      <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: 24 }} className="text-gray-900 dark:text-white">{isEdit ? 'Edit Tender' : 'New Tender'}</h1>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field name="title" label="Title *" />
        <Field name="description" label="Description" as="textarea" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field name="category" label="Category" />
          <Field name="reference_number" label="Reference number" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field name="estimated_budget" label="Estimated budget (KES)" type="number" />
          <Field name="closing_date" label="Closing date" type="date" />
        </div>
        <Field name="visibility" label="Visibility" as="select">
          <option value="all_vendors">All vendors</option>
          <option value="invited">Invited only</option>
          <option value="prequalified">Pre-qualified only</option>
        </Field>
        <Field name="requirements" label="Requirements (one per line)" as="textarea" rows={3} />
        <Field name="evaluation_criteria" label="Evaluation criteria (one per line)" as="textarea" rows={3} />

        <button type="submit" disabled={loading}
          style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', background: 'var(--color-primary-500)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Save size={15} /> {loading ? 'Saving…' : isEdit ? 'Update Tender' : 'Create Tender'}
        </button>
      </form>
    </div>
  );
}
