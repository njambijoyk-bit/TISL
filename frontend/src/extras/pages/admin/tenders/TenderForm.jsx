import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { tendersAPI } from '../../../../_shared/api/index';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';
import { Field, TextInput, NumberInput, SelectInput, TextArea, CheckboxRow } from '../../../../core/components/admin/ui/Form';
import { AdminPage, Heading, Loading } from '../../../components/procurement/ui';
import { METHOD_LABELS, SUBMISSION_LABELS, GROUP_LABELS, VISIBILITY_LABELS, NOTICE_TYPE_LABELS } from '../../../components/procurement/format';

const BLANK = {
  title: '', description: '', notice_type: 'tender', category: 'goods', visibility: 'public', procuring_entity: '', submission_deadline: '',
  tender_number: '', ocid: '', procurement_method: 'open_tender', submission_method: 'electronic', reservation_scheme: '', has_preference_scheme: false,
  opening_venue: '', tender_fee: '', validity_days: '', financial_year: '', public_link: '', lots: [],
};
const BLANK_TO_NULL = ['ocid', 'reservation_scheme', 'opening_venue', 'financial_year', 'public_link', 'validity_days', 'procuring_entity'];
const row2 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 };

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
        title: t.title || '', description: t.description || '', notice_type: t.notice_type || 'tender', category: t.category || 'goods',
        visibility: t.visibility || 'public', procuring_entity: t.procuring_entity || '',
        submission_deadline: t.submission_deadline ? t.submission_deadline.replace(' ', 'T').slice(0, 16) : '',
        tender_number: t.tender_number || '', ocid: t.ocid || '', procurement_method: t.procurement_method || 'open_tender', submission_method: t.submission_method || 'electronic',
        reservation_scheme: t.reservation_scheme || '', has_preference_scheme: !!t.has_preference_scheme, opening_venue: t.opening_venue || '',
        tender_fee: Number(t.tender_fee) || '', validity_days: t.validity_days || '', financial_year: t.financial_year || '', public_link: t.public_link || '',
        lots: (t.lots || []).map(l => ({ code: l.code, title: l.title, description: l.description || '', reservation_group: l.reservation_group || '' })),
      }))
      .catch(() => toast.error('Failed to load tender'))
      .finally(() => setFetching(false));
  }, [id, isEdit]);

  const set = (k) => (e) => { setForm(f => ({ ...f, [k]: e.target.value })); setErrors(p => ({ ...p, [k]: '' })); };
  const err = (k) => (Array.isArray(errors[k]) ? errors[k][0] : errors[k]);

  const setLot = (i, k, v) => setForm(f => ({ ...f, lots: f.lots.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const addLot = () => setForm(f => ({ ...f, lots: [...f.lots, { code: String.fromCharCode(65 + f.lots.length), title: '', description: '', reservation_group: '' }] }));
  const dropLot = (i) => setForm(f => ({ ...f, lots: f.lots.filter((_, j) => j !== i) }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setErrors({});
    const payload = {
      ...form,
      submission_deadline: form.submission_deadline || null,
      tender_fee: form.tender_fee === '' ? 0 : form.tender_fee,
      lots: form.lots.map(l => ({ ...l, description: l.description || null, reservation_group: l.reservation_group || null })),
      ...Object.fromEntries(BLANK_TO_NULL.map(k => [k, form[k] === '' ? null : form[k]])),
    };
    if (isEdit || !form.tender_number) delete payload.tender_number;
    try {
      if (isEdit) { await tendersAPI.update(id, payload); toast.success('Tender updated'); navigate(`/admin/tenders/${id}`); }
      else { const r = await tendersAPI.create(payload); toast.success('Tender created. Add its files next.'); navigate(`/admin/tenders/${r.id}`); }
    } catch (x) {
      if (x.response?.status === 422) { setErrors(x.response.data.errors || {}); toast.error(x.response.data.message || 'Check the form'); }
      else toast.error(x.response?.data?.message || 'Failed to save tender');
    } finally { setSaving(false); }
  };

  if (fetching) return <AdminPage><Loading /></AdminPage>;

  return (
    <AdminPage width={760}>
      <Link to={isEdit ? `/admin/tenders/${id}` : '/admin/tenders'} style={{ ...btnGhost, textDecoration: 'none', marginBottom: 16, padding: '5px 12px', fontSize: '0.75rem' }}><ArrowLeft size={13} /> Back</Link>
      <Heading title={isEdit ? 'Edit tender' : 'New tender'} description="Fill in the notice. Upload the tender document and other files on the next page. It stays a draft until you publish it." />

      <form onSubmit={submit} style={{ ...card, padding: 22, display: 'grid', gap: 14 }}>
        <Field label="Title" error={err('title')}><TextInput value={form.title} onChange={set('title')} error={err('title')} /></Field>
        <Field label="Description" error={err('description')}><TextArea value={form.description} onChange={set('description')} rows={4} /></Field>
        <div style={row2}>
          <Field label="This notice is a" error={err('notice_type')}>
            <SelectInput value={form.notice_type} onChange={set('notice_type')}>
              {Object.entries(NOTICE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </SelectInput>
          </Field>
          <Field label="Category" error={err('category')}>
            <SelectInput value={form.category} onChange={set('category')}>
              <option value="goods">Goods</option><option value="services">Services</option><option value="works">Works</option>
            </SelectInput>
          </Field>
        </div>
        <Field label="Who can see it" hint="Customers never see anything except Public tenders" error={err('visibility')}>
          <SelectInput value={form.visibility} onChange={set('visibility')}>
            {Object.entries(VISIBILITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </SelectInput>
        </Field>
        <div style={row2}>
          <Field label="Procuring entity" hint="Blank = our company" error={err('procuring_entity')}><TextInput value={form.procuring_entity} onChange={set('procuring_entity')} error={err('procuring_entity')} /></Field>
          {!isEdit && <Field label="Tender number" hint="Leave blank to number it automatically" error={err('tender_number')}><TextInput value={form.tender_number} onChange={set('tender_number')} placeholder="e.g. KEFRI/1074/0003/2026-27" error={err('tender_number')} /></Field>}
        </div>
        <Field label="OCID" error={err('ocid')}><TextInput value={form.ocid} onChange={set('ocid')} error={err('ocid')} /></Field>
        <div style={row2}>
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
        <div style={row2}>
          <Field label="Reserved for (the whole tender)" hint="Blank = open to everyone. Reserve single lots below instead if only some are reserved" error={err('reservation_scheme')}>
            <SelectInput value={form.reservation_scheme} onChange={set('reservation_scheme')}>
              <option value="">Not reserved</option>
              {Object.entries(GROUP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </SelectInput>
          </Field>
          <Field label="Financial year" hint="e.g. 2026/2027" error={err('financial_year')}><TextInput value={form.financial_year} onChange={set('financial_year')} placeholder="2026/2027" error={err('financial_year')} /></Field>
        </div>
        <CheckboxRow checked={form.has_preference_scheme} onChange={(v) => setForm(f => ({ ...f, has_preference_scheme: v }))} label="Preference and reservation scheme applies" />
        <Field label="Opening venue" error={err('opening_venue')}><TextInput value={form.opening_venue} onChange={set('opening_venue')} error={err('opening_venue')} /></Field>
        <div style={row2}>
          <Field label="Tender fee (KES)" hint="0 = free" error={err('tender_fee')}><NumberInput value={form.tender_fee} onChange={set('tender_fee')} error={err('tender_fee')} /></Field>
          <Field label="Tender validity (days)" error={err('validity_days')}><NumberInput value={form.validity_days} onChange={set('validity_days')} error={err('validity_days')} /></Field>
        </div>
        <Field label="Public link" hint="Where the notice is also published, if anywhere" error={err('public_link')}><TextInput type="url" value={form.public_link} onChange={set('public_link')} error={err('public_link')} /></Field>
        <Field label="Close date and time" error={err('submission_deadline')}><TextInput type="datetime-local" value={form.submission_deadline} onChange={set('submission_deadline')} error={err('submission_deadline')} /></Field>

        <div style={{ borderTop: `1px solid ${colors.tint(0.1)}`, paddingTop: 14, display: 'grid', gap: 10 }}>
          <div>
            <strong style={{ fontSize: '0.85rem', color: colors.text }}>Lots</strong>
            <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: colors.textMuted }}>Optional. List the lots (A, B, C...) and, for a lot meant for one group of people, choose it. Leave the group blank for open lots.</p>
          </div>
          {err('lots') && <p role="alert" style={{ margin: 0, fontSize: '0.75rem', color: colors.danger }}>{err('lots')}</p>}
          {form.lots.map((l, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px minmax(160px, 2fr) minmax(150px, 1fr) auto', gap: 8, alignItems: 'start' }}>
              <TextInput value={l.code} onChange={e => setLot(i, 'code', e.target.value)} aria-label="Lot code" placeholder="A" />
              <TextInput value={l.title} onChange={e => setLot(i, 'title', e.target.value)} aria-label="Lot title" placeholder="Cups" />
              <SelectInput value={l.reservation_group} onChange={e => setLot(i, 'reservation_group', e.target.value)} aria-label="Reserved for">
                <option value="">Open to all</option>
                {Object.entries(GROUP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </SelectInput>
              <button type="button" onClick={() => dropLot(i)} aria-label="Remove lot" style={{ ...btnGhost, padding: '8px 10px' }}><Trash2 size={14} /></button>
            </div>
          ))}
          <div><button type="button" onClick={addLot} style={btnGhost}><Plus size={14} /> Add a lot</button></div>
        </div>

        <div><button type="submit" disabled={saving} style={btnPrimary}><Save size={14} /> {saving ? 'Saving…' : isEdit ? 'Save tender' : 'Create tender'}</button></div>
      </form>
    </AdminPage>
  );
}
