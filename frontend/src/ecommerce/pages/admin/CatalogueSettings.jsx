import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../core/components/admin/ui/HubHeader';
import { Field } from '../../../core/components/admin/ui/Form';
import cataloguesAPI from '../../../_shared/api/catalogues';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import CatalogueTabs from '../../components/admin/catalogue/CatalogueTabs';
import SectionListEditor from '../../components/admin/catalogue/SectionListEditor';
import { fieldStyle, resetCatalogueMeta } from '../../components/admin/catalogue/catalogueMeta';
import { TYPE_LABELS } from '../../lib/catalogue/labels';
import { EARLIER_LABEL } from '../../lib/priceList/format';

/** The shop-wide choices for price lists and brochures: the limit, the earlier-price rule, what customers may download, and the sections each item type starts with. */
export default function CatalogueSettings() {
  const [res, setRes] = useState(null);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { cataloguesAPI.settings().then((r) => { setRes(r); setF(r.data); }).catch((e) => toast.error(errMsg(e, 'Could not load the configuration'))); }, []);
  if (!f || !res) return <AdminLayout><div style={{ padding: 32, color: colors.textFaint }}>Loading…</div></AdminLayout>;

  const can = res.can_edit;
  const save = async () => {
    setBusy(true);
    try { const r = await cataloguesAPI.saveSettings(f); resetCatalogueMeta(); setF(r.data); toast.success('Saved.'); } catch (e) { toast.error(errMsg(e, 'Could not save'), { duration: 7000 }); } finally { setBusy(false); }
  };
  const check = (k, label, hint) => (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.86rem', color: colors.text }}>
      <input type="checkbox" disabled={!can} checked={Boolean(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.checked })} style={{ marginTop: 3 }} />
      <span>{label}<span style={{ display: 'block', fontSize: '0.76rem', color: colors.textFaint }}>{hint}</span></span>
    </label>
  );

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1000, margin: '0 auto', display: 'grid', gap: 18 }}>
        <div><CatalogueTabs /><HubHeader title="Price list and brochure configuration" description="Shop-wide choices. Only people with the permission to change the catalogue settings can change them." /></div>

        <section style={{ ...card, padding: 18, display: 'grid', gap: 14 }}>
          <strong style={{ color: colors.text }}>Price lists</strong>
          <Field label="Most price lists kept" hint="From 1 to 1000. The bin counts. At the limit nothing new can be made until an old list is downloaded as a zip, added to the Archive and deleted for good. Nothing is deleted automatically.">
            <input type="number" min={1} max={1000} disabled={!can} value={f.max_price_lists} onChange={(e) => setF({ ...f, max_price_lists: Number(e.target.value) })} style={{ ...fieldStyle, maxWidth: 140 }} />
          </Field>
          <Field label="Earlier price, for new lists"><select disabled={!can} value={f.earlier_price} onChange={(e) => setF({ ...f, earlier_price: e.target.value })} style={fieldStyle}>{Object.entries(EARLIER_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        </section>

        <section style={{ ...card, padding: 18, display: 'grid', gap: 14 }}>
          <strong style={{ color: colors.text }}>What customers can do</strong>
          {check('customer_item_brochure', 'Customers can download a brochure of one item', 'A button on a product, hamper or auction page. An item can also switch it off for itself under Item settings.')}
          {check('customer_catalogue_link', 'Show the link to the published brochures and catalogues', 'On the products page, shown only when there is at least one the customer is allowed to see.')}
        </section>

        <section style={{ ...card, padding: 18, display: 'grid', gap: 16 }}>
          <div><strong style={{ color: colors.text }}>Sections each item type starts with</strong><div style={{ fontSize: '0.78rem', color: colors.textFaint }}>Used when an item has no choice of its own. An item's own choice, and a single catalogue's choice for an entry, come first.</div></div>
          {Object.keys(res.sections).map((t) => (
            <div key={t} style={{ display: 'grid', gap: 6 }}>
              <strong style={{ fontSize: '0.84rem', color: colors.text }}>{TYPE_LABELS[t]}</strong>
              <SectionListEditor type={t} keys={res.sections[t]} value={f.brochure_defaults[t].sections} disabled={!can} onChange={(v) => setF({ ...f, brochure_defaults: { ...f.brochure_defaults, [t]: { sections: v } } })} />
            </div>
          ))}
        </section>

        {can && <div><button type="button" style={btnPrimary} disabled={busy} onClick={save}>Save configuration</button></div>}
      </div>
    </AdminLayout>
  );
}
