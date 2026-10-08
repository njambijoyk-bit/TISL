import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Eye, Plus, SlidersHorizontal, X } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field } from '../../../core/components/admin/ui/Form';
import cataloguesAPI from '../../../_shared/api/catalogues';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import useAuthStore from '../../../_shared/store/authStore';
import { btnPrimary, btnGhost, card, colors } from '../../../_shared/theme/tokens';
import CatalogueTabs from '../../components/admin/catalogue/CatalogueTabs';
import CataloguePreview from '../../components/catalogue/CataloguePreview';
import SectionListEditor from '../../components/admin/catalogue/SectionListEditor';
import { AudiencePicker } from '../../components/admin/catalogue/bits';
import { fieldStyle, useCatalogueMeta } from '../../components/admin/catalogue/catalogueMeta';
import { SIZE_LABELS, TYPE_ONE } from '../../lib/catalogue/labels';

const KINDS = [['product', 'Products'], ['service', 'Services'], ['hamper', 'Hampers'], ['auction', 'Auctions'], ['category', 'A category'], ['brand', 'A brand']];
const PUBLISHERS = ['admin', 'super_admin', 'manager', 'finance'];
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.76rem', display: 'inline-flex', gap: 4, alignItems: 'center' };
const iconBtn = { border: '1px solid var(--line)', background: 'var(--surface-card)', color: 'inherit', borderRadius: 6, padding: 4, display: 'inline-flex', cursor: 'pointer' };

/** Make or change a brochure or catalogue: its title, size and audience, the items in it (in order), and each entry's own size and sections. */
export default function CatalogueEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const canPublish = PUBLISHERS.includes(role);
  const [meta] = useCatalogueMeta();
  const [f, setF] = useState({ title: '', subtitle: '', size: 'full', status: 'draft', access: 'everyone', customer_types: [], settings: { cover: true, contents: true, back: true } });
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(isNew);
  const [canEdit, setCanEdit] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [kind, setKind] = useState('product');
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [busy, setBusy] = useState(false);
  const [ov, setOv] = useState(null);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (isNew) return;
    cataloguesAPI.show(id).then((r) => {
      const b = r.data;
      setF({ title: b.title, subtitle: b.subtitle ?? '', size: b.size, status: b.status, access: b.access, customer_types: b.customer_types ?? [], settings: { cover: true, contents: true, back: true, ...(b.settings ?? {}) } });
      setEntries(b.entries.map((e) => ({ ...e, name: e.name ?? `${TYPE_ONE[e.type]} #${e.id}` })));
      setCanEdit(b.can_edit); setLoaded(true);
    }).catch((e) => { toast.error(errMsg(e, 'Could not load it')); navigate('/admin/catalogues'); });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let on = true;
    const t = setTimeout(() => { cataloguesAPI.picker(kind, q).then((r) => on && setFound(r.data)).catch(() => on && setFound([])); }, 250);

    return () => { on = false; clearTimeout(t); };
  }, [kind, q]);

  const touch = (fn) => { fn(); setDirty(true); };
  const has = (type, i) => entries.some((e) => e.type === type && e.id === i);
  const addOne = (x) => touch(() => { if (!has(x.type, x.id)) setEntries((e) => [...e, { type: x.type, id: x.id, name: x.name }]); });
  const addGroup = async (picks) => {
    try {
      const r = await cataloguesAPI.expand(picks);
      touch(() => setEntries((cur) => { const seen = new Set(cur.map((e) => `${e.type}:${e.id}`)); return [...cur, ...r.data.filter((x) => !seen.has(`${x.type}:${x.id}`))]; }));
      toast.success(`${r.data.length} items added${r.total > r.data.length ? ` (the first ${r.data.length} of ${r.total})` : ''}.`);
    } catch (e) { toast.error(errMsg(e, 'Could not add them')); }
  };
  const move = (i, d) => touch(() => setEntries((cur) => { const j = i + d; if (j < 0 || j >= cur.length) return cur; const n = [...cur]; [n[i], n[j]] = [n[j], n[i]]; return n; }));
  const patchEntry = (i, p) => touch(() => setEntries((cur) => cur.map((e, n) => (n === i ? { ...e, ...p } : e))));

  const save = async (status) => {
    if (!f.title.trim()) { toast.error('Give it a title.'); return; }
    setBusy(true);
    try {
      const body = { ...f, status: status ?? f.status, entries: entries.map(({ type, id: i, size, sections }) => ({ type, id: i, ...(size ? { size } : {}), ...(sections?.length ? { sections } : {}) })) };
      const r = isNew ? await cataloguesAPI.create(body) : await cataloguesAPI.update(id, body);
      toast.success(r.message ?? 'Saved.');
      setDirty(false);
      if (isNew) navigate(`/admin/catalogues/${r.data.id}`, { replace: true }); else setF((x) => ({ ...x, status: r.data.status }));
    } catch (e) { toast.error(errMsg(e, 'Could not save'), { duration: 8000 }); } finally { setBusy(false); }
  };

  if (!loaded) return <AdminLayout><div style={{ padding: 32, color: colors.textFaint }}>Loading…</div></AdminLayout>;
  const groupKind = kind === 'category' || kind === 'brand';

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1300, margin: '0 auto', display: 'grid', gap: 18 }}>
        <div><CatalogueTabs back="/admin/catalogues" backLabel="Catalogues" /><HubHeader title={isNew ? 'New catalogue' : f.title || 'Catalogue'} description={entries.length > 1 ? `A catalogue of ${entries.length} items.` : 'One item makes a brochure; several make a catalogue.'} /></div>
        {!canEdit && <p role="alert" style={{ ...card, padding: 12, fontSize: '0.84rem', color: colors.warningText }}>You can look at this one, but only its maker (while it is a draft) or a manager, finance, admin or super admin can change it.</p>}

        <section style={{ ...card, padding: 18, display: 'grid', gap: 14 }}>
          <strong style={{ color: colors.text }}>The document</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            <Field label="Title"><input value={f.title} disabled={!canEdit} onChange={(e) => touch(() => setF({ ...f, title: e.target.value }))} maxLength={160} style={fieldStyle} /></Field>
            <Field label="Subtitle (optional)"><input value={f.subtitle} disabled={!canEdit} onChange={(e) => touch(() => setF({ ...f, subtitle: e.target.value }))} maxLength={255} style={fieldStyle} /></Field>
            <Field label="Size of each entry" hint="Each entry can still choose its own."><select value={f.size} disabled={!canEdit} onChange={(e) => touch(() => setF({ ...f, size: e.target.value }))} style={fieldStyle}>{Object.entries(SIZE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          </div>
          <Field label="Who can see it once published" hint="Customers only see the Catalogues link on the products page once one is published and open to them."><AudiencePicker access={f.access} types={f.customer_types} disabled={!canEdit} onChange={(a) => touch(() => setF({ ...f, ...a }))} /></Field>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {[['cover', 'Cover page'], ['contents', 'Contents page'], ['back', 'Back page with our details']].map(([k, l]) => (
              <label key={k} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.84rem', color: colors.text }}><input type="checkbox" disabled={!canEdit} checked={f.settings[k]} onChange={(e) => touch(() => setF({ ...f, settings: { ...f.settings, [k]: e.target.checked } }))} /> {l}</label>
            ))}
            <span style={{ fontSize: '0.74rem', color: colors.textFaint }}>The cover and contents only appear when there is more than one item.</span>
          </div>
        </section>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {canEdit && <button type="button" style={btnPrimary} disabled={busy} onClick={() => save()}>{isNew ? 'Save as draft' : 'Save'}</button>}
          {canEdit && canPublish && f.status !== 'published' && <button type="button" style={btnGhost} disabled={busy || entries.length === 0} onClick={() => save('published')}>Save and publish</button>}
          {canEdit && canPublish && f.status === 'published' && <button type="button" style={btnGhost} disabled={busy} onClick={() => save('draft')}>Take off (back to draft)</button>}
          {!isNew && <button type="button" style={{ ...btnGhost, display: 'inline-flex', gap: 6, alignItems: 'center' }} disabled={dirty || entries.length === 0} title={dirty ? 'Save your changes first' : ''} onClick={() => setPreview(true)}><Eye size={14} /> Preview and download</button>}
          {!canPublish && <span style={{ fontSize: '0.78rem', color: colors.textFaint }}>A manager, finance, admin or super admin publishes it.</span>}
          {dirty && <span style={{ fontSize: '0.78rem', color: colors.warningText }}>Unsaved changes</span>}
          <button type="button" style={{ ...btnGhost, marginLeft: 'auto' }} onClick={() => navigate('/admin/catalogues')}>Back to the list</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18, alignItems: 'start' }}>
          {canEdit && (
            <section style={{ ...card, padding: 18, display: 'grid', gap: 10 }}>
              <strong style={{ color: colors.text }}>Add items</strong>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {KINDS.map(([k, l]) => <button key={k} type="button" onClick={() => setKind(k)} style={{ ...small, borderRadius: 999, background: kind === k ? 'var(--color-primary-500)' : 'var(--surface-card)', color: kind === k ? '#fff' : colors.text }}>{l}</button>)}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={small} onClick={() => addGroup([{ type: 'all_hampers' }])}>Every hamper</button>
                <button type="button" style={small} onClick={() => addGroup([{ type: 'all_auctions' }])}>Every running auction</button>
                <button type="button" style={small} onClick={() => addGroup([{ type: 'all_products' }])}>Every product on sale</button>
                <button type="button" style={small} onClick={() => addGroup([{ type: 'all_services' }])}>Every service</button>
              </div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" style={fieldStyle} />
              <div style={{ display: 'grid', gap: 3, maxHeight: 320, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10, padding: 6 }}>
                {found.length === 0 && <div style={{ padding: 8, fontSize: '0.82rem', color: colors.textFaint }}>Nothing found.</div>}
                {found.map((x) => (
                  <button key={`${x.type}-${x.id}`} type="button" onClick={() => (groupKind ? addGroup([{ type: x.type, id: x.id }]) : addOne(x))} disabled={!groupKind && has(x.type, x.id)}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 10, textAlign: 'left', padding: '6px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: colors.text, fontFamily: 'inherit', fontSize: '0.84rem', cursor: 'pointer', opacity: !groupKind && has(x.type, x.id) ? 0.45 : 1 }}>
                    <span>{x.name}{x.sub && <span style={{ color: colors.textFaint }}> · {x.sub}</span>}</span><Plus size={14} />
                  </button>
                ))}
              </div>
            </section>
          )}

          <section style={{ ...card, padding: 18, display: 'grid', gap: 8 }}>
            <strong style={{ color: colors.text }}>In this {entries.length > 1 ? 'catalogue' : 'brochure'} ({entries.length})</strong>
            {entries.length === 0 && <span style={{ fontSize: '0.82rem', color: colors.textFaint }}>Nothing yet. Add items on the left.</span>}
            {entries.map((e, i) => (
              <div key={`${e.type}-${e.id}`} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', width: 54 }}>{TYPE_ONE[e.type]}</span>
                <span style={{ flex: '1 1 140px', fontSize: '0.84rem', color: colors.text, minWidth: 0 }}>{e.name}{e.sections?.length ? <span style={{ color: colors.textFaint }}> · own sections</span> : ''}</span>
                <select value={e.size ?? ''} disabled={!canEdit} onChange={(ev) => patchEntry(i, { size: ev.target.value || undefined })} aria-label="Size" style={{ ...fieldStyle, width: 112, padding: '4px 6px' }}>
                  <option value="">Size: {f.size}</option>{Object.keys(SIZE_LABELS).map((k) => <option key={k} value={k}>{k === 'full' ? 'Full page' : k === 'half' ? 'Half page' : 'Card'}</option>)}
                </select>
                {canEdit && (
                  <>
                    <button type="button" style={iconBtn} title="Choose this entry's sections" onClick={() => setOv({ index: i, sections: e.sections ?? [] })}><SlidersHorizontal size={13} /></button>
                    <button type="button" style={iconBtn} aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
                    <button type="button" style={iconBtn} aria-label="Move down" disabled={i === entries.length - 1} onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
                    <button type="button" style={iconBtn} aria-label={`Remove ${e.name}`} onClick={() => touch(() => setEntries((cur) => cur.filter((_, n) => n !== i)))}><X size={13} /></button>
                  </>
                )}
              </div>
            ))}
          </section>
        </div>
      </div>

      {ov && (
        <Modal title={`Sections for ${entries[ov.index]?.name}`} subtitle="Only for this catalogue. Leave it empty to use the item's own choice, or the default for its type." onClose={() => setOv(null)} width={720}
          footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" style={btnGhost} onClick={() => setOv(null)}>Cancel</button><button type="button" style={btnPrimary} onClick={() => { patchEntry(ov.index, { sections: ov.sections.length ? ov.sections : undefined }); setOv(null); }}>Use these</button></div>}>
          <SectionListEditor type={entries[ov.index]?.type} keys={meta?.sections?.[entries[ov.index]?.type] ?? []} value={ov.sections} onChange={(v) => setOv({ ...ov, sections: v })} />
        </Modal>
      )}
      {preview && <CataloguePreview title={f.title} loadSlice={(from) => cataloguesAPI.data(id, { from, limit: 20 })} onClose={() => setPreview(false)} />}
    </AdminLayout>
  );
}
