import { useEffect, useMemo, useState } from 'react';
import serviceCatalogAPI from '../../../../_shared/api/serviceCatalog';

/**
 * Loads a service's options, packages and requirements and tracks the shopper's
 * choice. Options narrow down to one package; a service without options has a
 * single package. `initialVariantId` opens it with that package chosen (a campaign links to one package with ?variant=ID).
 */
export default function useServicePackages(serviceId, initialVariantId = null) {
  const [data, setData] = useState(null);
  const [selection, setSelection] = useState({});   // { [option_id]: value_id }
  const [variantId, setVariantId] = useState(null); // direct choice when there are no options (custom packages)

  useEffect(() => {
    if (!serviceId) return;
    let cancelled = false;
    setData(null);
    serviceCatalogAPI.getPackages(serviceId)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        const start = (initialVariantId && res.variants.find((v) => String(v.id) === String(initialVariantId))) || res.variants.find((v) => v.is_default) || res.variants[0];
        setSelection(start ? { ...start.selection } : {});
        setVariantId(start?.id ?? null);
      })
      .catch(() => { if (!cancelled) setData({ options: [], variants: [], requirements: [], tax_label: null }); });
    return () => { cancelled = true; };
  }, [serviceId, initialVariantId]);

  const options = data?.options ?? [];
  const variants = data?.variants ?? [];

  const variant = useMemo(() => {
    if (!variants.length) return null;
    // hand-made packages (no option values) are chosen directly
    const direct = variants.find((v) => v.id === variantId);
    if (direct && Object.keys(direct.selection ?? {}).length === 0) return direct;
    if (!options.length) return direct ?? variants[0];
    return variants.find((v) => options.every((o) => String(v.selection?.[o.id]) === String(selection[o.id]))) ?? null;
  }, [variants, options, selection, variantId]);

  const pick = (optionId, valueId) => {
    const next = { ...selection, [optionId]: valueId };
    const exact = variants.find((v) => options.every((o) => String(v.selection?.[o.id]) === String(next[o.id])));
    const target = exact ?? variants.find((v) => String(v.selection?.[optionId]) === String(valueId));
    setSelection(target ? { ...target.selection } : next);
    if (target) setVariantId(target.id);
  };

  const label = variant
    ? (options.map((o) => o.values.find((v) => String(v.id) === String(variant.selection?.[o.id]))?.value).filter(Boolean).join(' / ') || variant.name || 'Standard')
    : null;

  return { data, options, variants, selection, variant, label, pick, setVariantId, setSelection };
}

