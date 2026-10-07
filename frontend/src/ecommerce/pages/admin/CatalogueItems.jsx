import { useCallback, useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import cataloguesAPI from '../../../_shared/api/catalogues';
import priceListsAPI from '../../../_shared/api/priceLists';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import useAuthStore from '../../../_shared/store/authStore';
import { btnPrimary, btnGhost, card, colors } from '../../../_shared/theme/tokens';
import CatalogueTabs from '../../components/admin/catalogue/CatalogueTabs';
import SectionListEditor from '../../components/admin/catalogue/SectionListEditor';
import { fieldStyle, useCatalogueMeta } from '../../components/admin/catalogue/catalogueMeta';
import { SECTION_LABELS, TYPE_LABELS } from '../../lib/catalogue/labels';
import { THEMES } from '../../lib/catalogue/themes';

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.textFaint };
const td = { padding: '8px 10px', fontSize: '0.84rem', color: colors.text, borderTop: '1px solid var(--line)' };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.74rem', display: 'inline-flex', gap: 4, alignItems: 'center' };

const summary = (meta, defaults) => {
  const own = meta?.sections?.length ? meta.sections : null;
  const list = own ?? defaults ?? [];

  return { own: Boolean(own), text: list.map((s) => `${SECTION_LABELS[s.key]?.split(':')[0] ?? s.key} (${THEMES[s.theme]?.label ?? s.theme})`).join(', ') };
};

/** Each item's own brochure choice: which sections it uses and in which theme, and whether customers may download its brochure. Set one by one, or for many at once. */
export default function CatalogueItems() {
  const role = useAuthStore((s) => s.user?.role);
  const canChange = ['admin', 'super_admin', 'manager'].includes(role);
  const [meta] = useCatalogueMeta();
  const [type, setType] = useState('product');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [res, setRes] = useState(null);
  const [sel, setSel] = useState([]);
  const [edit, setEdit] = useState(null);
  const [bulk, setBulk] = useState({ sections: [], scope: 'selected', kind: 'category', find: '', found: [], picked: null });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRes(await cataloguesAPI.items({ type, q, page })); } catch (e) { toast.error(errMsg(e, 'Could not load the items')); }
  }, [type, q, page]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setSel([]); setPage(1); }, [type]);
  useEffect(() => {
    if (bulk.scope !== 'group') return undefined;
    let on = true;
    priceListsAPI.picker(bulk.kind, bulk.find).then((r) => on && setBulk((b) => ({ ...b, found: r.data }))).catch(() => {});

    return () => { on = false; };
  }, [bulk.scope, bulk.kind, bulk.find]);

  const keys = meta?.sections?.[type] ?? [];
  const run = async (fn) => { setBusy(true); try { const r = await fn(); toast.success(r?.message ?? 'Saved'); await load(); return true; } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 7000 }); return false; } finally { setBusy(false); } };
  const toggle = (id) => setSel((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id]));
  const rows = res?.data ?? [];
  const allOn = rows.length > 0 && rows.every((r) => sel.includes(r.id));

  const applyBulk = () => {
    if (!bulk.sections.length) { toast.error('Choose at least one section to apply.'); return; }
    const body = { type, meta: { enabled: true, sections: bulk.sections } };
    if (bulk.scope === 'selected') { if (!sel.length) { toast.error('Tick some items first.'); return; } body.ids = sel; }
    else if (bulk.scope === 'all') body.all = true;
    else { if (!bulk.picked) { toast.error('Choose the category or brand.'); return; } body.picks = [{ type: bulk.picked.type, id: bulk.picked.id }]; }
    if (bulk.scope === 'all' && !window.confirm(`Apply to every ${TYPE_LABELS[type].toLowerCase()} item? Each one's own choice will be replaced.`)) return;
    run(() => cataloguesAPI.bulkItemMeta(body));
  };

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1300, margin: '0 auto', display: 'grid', gap: 16 }}>
        <div><CatalogueTabs /><HubHeader title="Item settings" description="Which sections each item uses in a brochure, and in which theme. An item with no choice of its own follows the default for its type. A catalogue can still choose differently for one entry." /></div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {Object.entries(TYPE_LABELS).map(([k, l]) => <button key={k} type="button" onClick={() => setType(k)} style={{ ...small, borderRadius: 999, background: type === k ? 'var(--color-primary-500)' : 'var(--surface-card)', color: type === k ? '#fff' : colors.text }}>{l}</button>)}
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search by name or code…" style={{ ...fieldStyle, width: 260, marginLeft: 'auto' }} />
        </div>

        {canChange && (
          <section style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
            <div><strong style={{ color: colors.text }}>Set many at once</strong><div style={{ fontSize: '0.76rem', color: colors.textFaint }}>Choose the sections and themes, then who gets them.</div></div>
            <SectionListEditor type={type} keys={keys} value={bulk.sections} onChange={(v) => setBulk({ ...bulk, sections: v })} />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={bulk.scope} onChange={(e) => setBulk({ ...bulk, scope: e.target.value, picked: null })} style={{ ...fieldStyle, width: 'auto' }} aria-label="Apply to">
                <option value="selected">The {sel.length} ticked below</option>
                {type === 'product' && <option value="group">A whole category or brand</option>}
                <option value="all">Every {TYPE_LABELS[type].toLowerCase()} item</option>
              </select>
              {bulk.scope === 'group' && (
                <>
                  <select value={bulk.kind} onChange={(e) => setBulk({ ...bulk, kind: e.target.value, picked: null })} style={{ ...fieldStyle, width: 'auto' }} aria-label="Category or brand"><option value="category">Category</option><option value="brand">Brand</option></select>
                  <input value={bulk.find} onChange={(e) => setBulk({ ...bulk, find: e.target.value })} placeholder="Search…" style={{ ...fieldStyle, width: 170 }} />
                  <select value={bulk.picked ? `${bulk.picked.type}:${bulk.picked.id}` : ''} onChange={(e) => { const [t, i] = e.target.value.split(':'); setBulk({ ...bulk, picked: e.target.value ? { type: t, id: Number(i) } : null }); }} style={{ ...fieldStyle, width: 'auto', minWidth: 160 }} aria-label="Which one">
                    <option value="">Choose…</option>{bulk.found.map((x) => <option key={x.id} value={`${bulk.kind}:${x.id}`}>{x.label}</option>)}
                  </select>
                </>
              )}
              <button type="button" style={btnPrimary} disabled={busy} onClick={applyBulk}>Apply</button>
            </div>
          </section>
        )}

        <section style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ ...th, width: 34 }}>{canChange && <input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? [] : rows.map((r) => r.id))} aria-label="Select all on this page" />}</th><th style={th}>Item</th><th style={th}>Sections and themes</th><th style={th}>Customer download</th><th style={th} /></tr></thead>
              <tbody>
                {!res && <tr><td style={td} colSpan={5}>Loading…</td></tr>}
                {res && rows.length === 0 && <tr><td style={td} colSpan={5}>Nothing matches.</td></tr>}
                {rows.map((r) => {
                  const s = summary(r.meta, res.defaults);

                  return (
                    <tr key={r.id}>
                      <td style={td}>{canChange && <input type="checkbox" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} />}</td>
                      <td style={td}><strong>{r.name}</strong><div style={{ fontSize: '0.72rem', color: colors.textFaint }}>{[r.sub, r.category].filter(Boolean).join(' · ')}</div></td>
                      <td style={{ ...td, maxWidth: 420 }}>{s.text}{!s.own && <span style={{ color: colors.textFaint }}> (default)</span>}</td>
                      <td style={td}>{r.meta && r.meta.enabled === false ? 'Off' : 'On'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{canChange && <button type="button" style={small} onClick={() => setEdit({ id: r.id, name: r.name, enabled: !(r.meta && r.meta.enabled === false), sections: r.meta?.sections ?? [] })}><Pencil size={12} /> Edit</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {res && res.last_page > 1 && (
            <div style={{ padding: 12, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', fontSize: '0.8rem', color: colors.textFaint }}>
              <button type="button" style={small} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>Page {res.current_page} of {res.last_page}
              <button type="button" style={small} disabled={page >= res.last_page} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </section>
      </div>

      {edit && (
        <Modal title={edit.name} subtitle="Leave the list empty to follow the default for this type." onClose={() => setEdit(null)} width={720}
          footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" style={btnGhost} onClick={() => setEdit(null)}>Cancel</button><button type="button" style={btnPrimary} disabled={busy} onClick={async () => { if (await run(() => cataloguesAPI.saveItemMeta(type, edit.id, { enabled: edit.enabled, sections: edit.sections }))) setEdit(null); }}>Save</button></div>}>
          <div style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem', color: colors.text }}><input type="checkbox" checked={edit.enabled} onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })} /> Customers can download a brochure of this item</label>
            <SectionListEditor type={type} keys={keys} value={edit.sections} onChange={(v) => setEdit({ ...edit, sections: v })} />
            {edit.sections.length > 0 && <button type="button" style={{ ...btnGhost, justifySelf: 'start' }} onClick={() => setEdit({ ...edit, sections: [] })}>Use the default for this type</button>}
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
