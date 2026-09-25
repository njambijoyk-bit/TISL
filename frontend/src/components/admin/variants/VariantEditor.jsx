import { Fragment, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Star, ChevronDown, ChevronRight, Package } from 'lucide-react';
import useProductVariantStore from '../../../store/productVariantStore';
import useUomStore from '../../../store/uomStore';
import StatusBadge from '../../common/StatusBadge';
import OptionsEditor from './OptionsEditor';
import VariantForm from './VariantForm';
import VariantUnitForm from './VariantUnitForm';
import VariantImagesManager from './VariantImagesManager';
import RowActions from '../tax/sections/RowActions';
import useDeleteConfirm from '../tax/sections/useDeleteConfirm';
import { formatMoney } from '../../../lib/money';
import { colors, card, btnPrimary, btnGhost, radius } from '../../../theme/tokens';

const ROLE_LABEL = { base: 'Base', compound: 'Pack', alternate: 'Alternate' };
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 }));

function Section({ title, description, children, action }) {
  return (
    <section style={{ ...card, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: colors.primaryDeep }}>{title}</p>
          {description && <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: colors.textFaint, maxWidth: 560 }}>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Structured variant editor for one saved product: options, variants,
 * each variant's selling units and prices, and variant images.
 *
 * @param {number}  productId
 * @param {string}  currencyCode   the product's currency — every price here is in it
 * @param {boolean} readOnly
 */
export default function VariantEditor({ productId, currencyCode = 'KES', readOnly = false }) {
  const {
    productId: loadedId, variants, loading, actionLoading, error,
    loadProduct, reset, deleteVariant, setDefaultVariant, deleteUnit, effectiveUnitPrice,
  } = useProductVariantStore();
  const { fetchUnits, unitById } = useUomStore();
  const [editingVariant, setEditingVariant] = useState(null);   // variant | 'new'
  const [editingUnit, setEditingUnit] = useState(null);         // { variant, unit? }
  const [open, setOpen] = useState(() => new Set());
  const { ask, modal } = useDeleteConfirm(actionLoading);

  useEffect(() => {
    if (productId && loadedId !== Number(productId)) loadProduct(productId).catch(() => {});
    fetchUnits().catch(() => {});
  }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => reset(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const unitLabel = (vu) => { const u = unitById(vu.unit_id); return u ? `${u.name} (${u.code})` : `Unit #${vu.unit_id}`; };
  const optionLabel = (v) => (v.option_values ?? []).map((ov) => ov.value).join(' / ');
  const money = (n) => (n == null ? '—' : formatMoney(n, currencyCode));

  if (loading.all && loadedId !== Number(productId)) {
    return <div style={{ height: 160, borderRadius: radius.xl, background: colors.tint(0.06) }} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && <p role="alert" style={{ margin: 0, fontSize: '0.8rem', color: colors.dangerText }}>{error}</p>}

      <Section title="Options" description="What shoppers choose between, like size or colour. Add these first.">
        <OptionsEditor readOnly={readOnly} />
      </Section>

      <Section
        title="Variants"
        description={`Each variant has its own SKU, stock and selling units. Prices are in ${currencyCode}.`}
        action={!readOnly && <button type="button" onClick={() => setEditingVariant('new')} style={btnPrimary}><Plus size={14} /> New variant</button>}
      >
        {variants.length === 0 ? (
          <p style={{ margin: 0, padding: '22px 16px', textAlign: 'center', borderRadius: radius.lg, border: `1.5px dashed ${colors.tint(0.2)}`, fontSize: '0.8rem', color: colors.textMuted }}>
            No variants yet. Create one to set units and prices.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.tint(0.1)}` }}>
                  {['', 'Variant', 'SKU', 'Stock', 'Base price', 'Units', 'Status', ''].map((h, i) => (
                    <th key={i} scope="col" style={{ padding: '8px 10px', textAlign: i === 3 || i === 4 ? 'right' : 'left', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => {
                  const base = v.units?.find((u) => u.role === 'base');
                  // derive from units rather than has_base_unit, which goes stale after local edits
                  const hasBase = Boolean(base);
                  const expanded = open.has(v.id);
                  return (
                    <Fragment key={v.id}>
                      <tr style={{ borderBottom: `1px solid ${colors.tint(0.05)}` }}>
                        <td style={{ padding: '10px 6px 10px 10px', width: 28 }}>
                          <button type="button" aria-expanded={expanded} aria-label={expanded ? 'Hide units' : 'Show units'} onClick={() => toggle(v.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint, display: 'flex' }}>
                            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </td>
                        <td style={{ padding: 10 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: colors.text }}>
                            {v.is_default && <Star size={12} fill={colors.warning} style={{ color: colors.warning }} aria-label="Default variant" />}
                            {v.name || optionLabel(v) || 'Standard'}
                          </span>
                          {v.name && optionLabel(v) && <span style={{ display: 'block', fontSize: '0.7rem', color: colors.textFaint }}>{optionLabel(v)}</span>}
                        </td>
                        <td style={{ padding: 10, fontFamily: 'monospace' }}>{v.sku || '—'}</td>
                        <td style={{ padding: 10, textAlign: 'right' }}>{fmt(v.stock_quantity)} {base ? unitById(base.unit_id)?.code : ''}</td>
                        <td style={{ padding: 10, textAlign: 'right', fontWeight: 700, color: colors.text }}>{money(base?.price)}</td>
                        <td style={{ padding: 10 }}>
                          {hasBase
                            ? `${v.units?.length ?? 0}`
                            : <span style={{ color: colors.warningText, fontSize: '0.72rem' }}>No base unit — can't be sold</span>}
                        </td>
                        <td style={{ padding: 10 }}><StatusBadge status={v.status} /></td>
                        <td style={{ padding: 10 }}>
                          {!readOnly && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                              {!v.is_default && (
                                <button type="button" onClick={() => setDefaultVariant(v.id).catch(() => toast.error('Could not change the default'))}
                                  style={{ ...btnGhost, padding: '3px 8px', fontSize: '0.7rem' }}>Make default</button>
                              )}
                              <RowActions label={v.name || 'variant'} onEdit={() => setEditingVariant(v)} onDelete={() => ask({
                                title: `Delete ${v.name || 'this variant'}?`, message: 'Its units and prices go with it.',
                                run: () => deleteVariant(v.id), done: 'Variant deleted',
                              })} />
                            </div>
                          )}
                        </td>
                      </tr>

                      {expanded && (
                        <tr>
                          <td />
                          <td colSpan={7} style={{ padding: '4px 10px 14px' }}>
                            <div style={{ borderRadius: radius.lg, border: `1px solid ${colors.tint(0.1)}`, background: colors.tint(0.02), padding: 10 }}>
                              {(v.units ?? []).length === 0 ? (
                                <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: colors.textMuted }}>Add the base unit first — the unit you count stock in.</p>
                              ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', marginBottom: 8 }}>
                                  <thead>
                                    <tr>{['Unit', 'Kind', 'Holds', 'Price', 'Sold', ''].map((h, i) => (
                                      <th key={i} scope="col" style={{ padding: '4px 8px', textAlign: i === 3 ? 'right' : 'left', fontSize: '0.62rem', color: colors.textFaint, fontWeight: 700 }}>{h}</th>
                                    ))}</tr>
                                  </thead>
                                  <tbody>
                                    {v.units.map((u) => {
                                      const eff = effectiveUnitPrice(v, u);
                                      return (
                                        <tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.5 }}>
                                          <td style={{ padding: '6px 8px', color: colors.text, fontWeight: 600 }}>
                                            {unitLabel(u)} {u.is_default_sale && <span style={{ fontSize: '0.65rem', color: colors.primaryDeep }}>· default</span>}
                                          </td>
                                          <td style={{ padding: '6px 8px' }}>{ROLE_LABEL[u.role]}</td>
                                          <td style={{ padding: '6px 8px' }}>{u.role === 'base' ? '—' : `${fmt(u.base_factor)} ${base ? unitById(base.unit_id)?.code ?? '' : ''}`}</td>
                                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                                            {money(eff)}
                                            {u.price == null && eff != null && <span style={{ display: 'block', fontSize: '0.62rem', color: colors.textFaint }}>from base price</span>}
                                          </td>
                                          <td style={{ padding: '6px 8px', color: colors.textMuted }}>{u.is_sellable ? 'Yes' : 'No'}</td>
                                          <td style={{ padding: '6px 8px' }}>
                                            {!readOnly && (
                                              <RowActions label={unitLabel(u)} onEdit={() => setEditingUnit({ variant: v, unit: u })}
                                                onDelete={u.role === 'base' ? undefined : () => ask({
                                                  title: `Remove ${unitLabel(u)}?`, message: 'Not possible while a pack unit is built from it.',
                                                  run: () => deleteUnit(v.id, u.id), done: 'Unit removed',
                                                })} />
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                              {!readOnly && (
                                <button type="button" onClick={() => setEditingUnit({ variant: v })} style={{ ...btnGhost, padding: '5px 10px', fontSize: '0.75rem' }}>
                                  <Package size={13} /> {hasBase ? 'Add a pack or alternate unit' : 'Add base unit'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Variant images" description="Photos for particular options or variants. The main gallery stays on the Images tab.">
        <VariantImagesManager readOnly={readOnly} />
      </Section>

      {editingVariant && (
        <VariantForm variant={editingVariant === 'new' ? null : editingVariant} currencyCode={currencyCode} onClose={() => setEditingVariant(null)} />
      )}
      {editingUnit && (
        <VariantUnitForm
          // always hand the form the freshest copy of the variant
          variant={variants.find((x) => x.id === editingUnit.variant.id) ?? editingUnit.variant}
          unit={editingUnit.unit}
          currencyCode={currencyCode}
          onClose={() => setEditingUnit(null)}
        />
      )}
      {modal}
    </div>
  );
}
