import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, SelectInput } from '../../../core/components/admin/ui/Form';
import brochuresAPI from '../../../_shared/api/brochures';
import useAuthStore from '../../../_shared/store/authStore';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, card, colors } from '../../../_shared/theme/tokens';
import { filterStyle } from '../../../core/components/admin/books/booksFmt';
import BrochureSettingsForm from '../../components/admin/services/BrochureSettingsForm';
import { PRICE_LABEL } from '../../lib/brochure/labels';
import BrochurePreview from '../../components/admin/services/BrochurePreview';
import { brochurePages } from '../../lib/brochure';
import { TEMPLATES } from '../../lib/brochure/templates';
import { SAMPLE_COMPANY, SAMPLE_DATA, SAMPLE_MONEY } from '../../lib/brochure/sample';

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.textFaint };
const td = { padding: '9px 10px', fontSize: '0.84rem', color: colors.text, borderTop: '1px solid var(--line)' };

/** Template previews: each layout drawn with a made-up service, so you can see what a customer would get. */
function Gallery({ templates, current, onPick, canChange }) {
  const [imgs, setImgs] = useState({});
  useEffect(() => {
    let live = true;
    (async () => {
      const out = {};
      for (const key of Object.keys(templates)) {
        try { const [pg] = await brochurePages({ ...SAMPLE_DATA, settings: { template: key } }, { money: SAMPLE_MONEY, company: SAMPLE_COMPANY }, { width: 420 }); out[key] = pg.toDataURL('image/jpeg', 0.8); } catch { /* a preview that fails is simply left blank */ }
      }
      if (live) setImgs(out);
    })();

    return () => { live = false; };
  }, [templates]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 }}>
      {Object.entries(templates).map(([key, label]) => (
        <button key={key} type="button" disabled={!canChange} onClick={() => onPick(key)} style={{ padding: 8, textAlign: 'left', cursor: canChange ? 'pointer' : 'default', borderRadius: 12, fontFamily: 'inherit', background: 'var(--surface-card)', color: 'inherit', border: `2px solid ${current === key ? 'var(--color-primary-500)' : 'var(--line)'}` }}>
          <div style={{ aspectRatio: '210 / 297', background: 'rgba(148,163,184,0.15)', borderRadius: 6, overflow: 'hidden' }}>{imgs[key] && <img src={imgs[key]} alt={`${label} template`} style={{ width: '100%', display: 'block' }} />}</div>
          <div style={{ fontWeight: 700, fontSize: '0.84rem', marginTop: 6, color: colors.text }}>{label}{current === key && <span style={{ color: 'var(--color-primary-500)', fontWeight: 600 }}> · shop default</span>}</div>
          <div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{TEMPLATES[key]?.description}</div>
        </button>
      ))}
    </div>
  );
}

/** Brochures: the shop-wide defaults, the templates, and every service's own choices, with preview and "apply to many". */
export default function Brochures() {
  const role = useAuthStore((s) => s.user?.role);
  const canChange = ['admin', 'super_admin', 'manager'].includes(role);
  const [d, setD] = useState(null);
  const [defaults, setDefaults] = useState({});
  const [q, setQ] = useState('');
  const [sel, setSel] = useState([]);
  const [editing, setEditing] = useState(null);   // { service, own }
  const [previewing, setPreviewing] = useState(null);
  const [bulk, setBulk] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const r = await brochuresAPI.list(); setD(r); setDefaults(r.defaults); } catch (e) { toast.error(errMsg(e, 'Could not load the brochures')); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => (d?.services ?? []).filter((s) => !q || `${s.name} ${s.sku ?? ''} ${s.category ?? ''}`.toLowerCase().includes(q.toLowerCase())), [d, q]);
  if (!d) return <AdminLayout><div style={{ padding: 32, color: colors.textFaint }}>Loading…</div></AdminLayout>;

  const run = async (fn, ok) => { setBusy(true); try { const r = await fn(); toast.success(r?.message ?? ok); await load(); return true; } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 6000 }); return false; } finally { setBusy(false); } };
  const toggle = (id) => setSel((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id]));
  const allOn = rows.length > 0 && rows.every((r) => sel.includes(r.id));
  const apply = async () => {
    const settings = Object.fromEntries(Object.entries(bulk).filter(([, v]) => v !== '' && v !== undefined));
    if (!Object.keys(settings).length) { toast.error('Choose something to change first.'); return; }
    if (await run(() => brochuresAPI.saveServices(sel, settings))) { setBulk({}); setSel([]); }
  };
  const reset = async () => { if (window.confirm(`Take ${sel.length} service${sel.length === 1 ? '' : 's'} back to the shop-wide configuration?`)) { if (await run(() => brochuresAPI.saveServices(sel, {}, Object.keys(d.builtin)))) setSel([]); } };

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1300, margin: '0 auto', display: 'grid', gap: 20 }}>
        <HubHeader title="Brochures" description="A brochure is drawn from each service's own details. Choose the look, what it shows, and whether customers can download it." />
        {!d.ready && <p role="alert" style={{ ...card, padding: 12, fontSize: '0.84rem', color: colors.dangerText }}>Run script 92 first. Until then this configuration cannot be saved and every service uses the built-in defaults.</p>}

        <section style={{ ...card, padding: 18, display: 'grid', gap: 14 }}>
          <div><strong style={{ color: colors.text }}>Shop-wide configuration</strong><div style={{ fontSize: '0.78rem', color: colors.textFaint }}>Used by every service that has not chosen its own. A service with no template uses the default template.</div></div>
          <BrochureSettingsForm value={defaults} onChange={setDefaults} templates={d.templates} maxImages={d.max_images} disabled={!canChange} />
          <div><button type="button" style={{ ...btnPrimary, opacity: canChange && !busy ? 1 : 0.5 }} disabled={!canChange || busy} onClick={() => run(() => brochuresAPI.saveDefaults(defaults), 'Saved')}>Save shop-wide configuration</button></div>
        </section>

        <section style={{ ...card, padding: 18, display: 'grid', gap: 12 }}>
          <div><strong style={{ color: colors.text }}>Templates</strong><div style={{ fontSize: '0.78rem', color: colors.textFaint }}>Click one to make it the shop default (then Save above).</div></div>
          <Gallery templates={d.templates} current={defaults.template} onPick={(k) => setDefaults((x) => ({ ...x, template: k }))} canChange={canChange} />
        </section>

        <section style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ color: colors.text }}>Services</strong>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, SKU or category…" style={{ ...filterStyle, minWidth: 240 }} />
            <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: colors.textFaint }}>{sel.length ? `${sel.length} selected` : `${rows.length} services`}</span>
          </div>
          {sel.length > 0 && canChange && (
            <div style={{ padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', background: 'color-mix(in srgb, var(--color-primary-500) 8%, var(--surface-card))', borderTop: '1px solid var(--line)' }}>
              <Field label="Template"><SelectInput value={bulk.template ?? ''} onChange={(e) => setBulk((b) => ({ ...b, template: e.target.value }))}><option value="">(leave as is)</option>{Object.entries(d.templates).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
              <Field label="Customer download"><SelectInput value={bulk.download === undefined ? '' : bulk.download ? '1' : '0'} onChange={(e) => setBulk((b) => ({ ...b, download: e.target.value === '' ? undefined : e.target.value === '1' }))}><option value="">(leave as is)</option><option value="1">Allowed</option><option value="0">Not allowed</option></SelectInput></Field>
              <Field label="Price"><SelectInput value={bulk.price ?? ''} onChange={(e) => setBulk((b) => ({ ...b, price: e.target.value }))}><option value="">(leave as is)</option>{Object.entries(PRICE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
              <button type="button" style={btnPrimary} disabled={busy} onClick={apply}>Apply to {sel.length}</button>
              <button type="button" style={btnGhost} disabled={busy} onClick={reset}>Use shop-wide configuration</button>
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ ...th, width: 34 }}>{canChange && <input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? [] : rows.map((r) => r.id))} aria-label="Select all" />}</th><th style={th}>Service</th><th style={th}>Template</th><th style={th}>Customers download</th><th style={th}>Price</th><th style={th} /></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td style={td}>{canChange && <input type="checkbox" checked={sel.includes(s.id)} onChange={() => toggle(s.id)} aria-label={`Select ${s.name}`} />}</td>
                    <td style={td}><strong>{s.name}</strong>{s.category && <div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{s.category}</div>}</td>
                    <td style={td}>{d.templates[s.effective.template]}{s.own.template === undefined && <span style={{ color: colors.textFaint }}> (default)</span>}</td>
                    <td style={td}>{s.effective.download ? 'Yes' : 'No'}{s.own.download === undefined && <span style={{ color: colors.textFaint }}> (default)</span>}</td>
                    <td style={td}>{PRICE_LABEL[s.effective.price]}{s.own.price === undefined && <span style={{ color: colors.textFaint }}> (default)</span>}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.74rem' }} onClick={() => setPreviewing(s)}><Eye size={12} /> Preview</button>{' '}
                      {canChange && <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.74rem' }} onClick={() => setEditing({ service: s, own: { ...s.own } })}><Pencil size={12} /> Configuration</button>}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td style={td} colSpan={6}>No services match.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {editing && (
        <Modal title={`${editing.service.name}: brochure configuration`} subtitle="Leave a choice on Default to follow the shop-wide configuration" onClose={() => setEditing(null)} width={900}
          footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" style={btnGhost} onClick={() => setEditing(null)}>Cancel</button><button type="button" style={btnPrimary} disabled={busy} onClick={async () => { if (await run(() => brochuresAPI.saveServices([editing.service.id], editing.own, Object.keys(d.builtin).filter((k) => editing.own[k] === undefined)))) setEditing(null); }}>Save</button></div>}>
          <BrochureSettingsForm value={editing.own} onChange={(own) => setEditing((e) => ({ ...e, own }))} templates={d.templates} inherit={d.defaults} maxImages={d.max_images} />
        </Modal>
      )}
      {previewing && <BrochurePreview service={previewing} onClose={() => setPreviewing(null)} />}
    </AdminLayout>
  );
}
