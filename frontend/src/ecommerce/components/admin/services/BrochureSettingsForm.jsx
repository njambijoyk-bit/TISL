import { Field, SelectInput } from '../../../../core/components/admin/ui/Form';
import { colors } from '../../../../_shared/theme/tokens';
import { PRICE_LABEL } from '../../../lib/brochure/labels';

const SWITCHES = [['main_image', 'Main picture on the cover'], ['charges', 'Other charges'], ['policy', 'Booking policy'], ['features', 'Features'], ['deliverables', 'What the customer receives'], ['requirements', 'Requirements and questions'], ['tiers', 'Packages and their prices'], ['rating', 'Rating and reviews']];
const yn = (v) => (v ? 'Yes' : 'No');

/**
 * The brochure's settings. For the shop-wide defaults every choice is explicit. For one service, `inherit` is the defaults: each choice can be left on "Default (...)",
 * and `value` then holds only what the service has chosen for itself.
 */
export default function BrochureSettingsForm({ value, onChange, templates, inherit = null, maxImages = 6, disabled = false }) {
  const set = (k, v) => { const n = { ...value }; if (v === '' || v === undefined) delete n[k]; else n[k] = v; onChange(n); };
  const bool = (k) => (value[k] === undefined ? '' : value[k] ? '1' : '0');
  const label = (k, shown) => (inherit ? `Default (${shown})` : shown);
  const boolSel = (k, title) => (
    <Field label={title} key={k}>
      <SelectInput disabled={disabled} value={bool(k)} onChange={(e) => set(k, e.target.value === '' ? '' : e.target.value === '1')}>
        {inherit && <option value="">{`Default (${yn(inherit[k])})`}</option>}
        <option value="1">Yes</option><option value="0">No</option>
      </SelectInput>
    </Field>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
      {boolSel('download', 'Customers can download the brochure')}
      <Field label="Template">
        <SelectInput disabled={disabled} value={value.template ?? ''} onChange={(e) => set('template', e.target.value)}>
          {inherit && <option value="">{label('template', templates[inherit.template])}</option>}
          {Object.entries(templates).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </SelectInput>
      </Field>
      <Field label="Price">
        <SelectInput disabled={disabled} value={value.price ?? ''} onChange={(e) => set('price', e.target.value)}>
          {inherit && <option value="">{label('price', PRICE_LABEL[inherit.price])}</option>}
          {Object.entries(PRICE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </SelectInput>
      </Field>
      <Field label="Other pictures" hint="Besides the main one">
        <SelectInput disabled={disabled} value={value.other_images ?? ''} onChange={(e) => set('other_images', e.target.value === '' ? '' : Number(e.target.value))}>
          {inherit && <option value="">{label('other_images', inherit.other_images === 0 ? 'none' : inherit.other_images)}</option>}
          {Array.from({ length: maxImages + 1 }, (_, i) => <option key={i} value={i}>{i === 0 ? 'None' : i}</option>)}
        </SelectInput>
      </Field>
      {SWITCHES.map(([k, l]) => boolSel(k, l))}
      {inherit && <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: '0.74rem', color: colors.textFaint }}>Anything left on "Default" follows the shop-wide configuration, so changing those later changes this service too.</p>}
    </div>
  );
}
