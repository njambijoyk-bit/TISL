import { useEffect, useState } from 'react';
import useCartStore, { lineKey } from '../../../_shared/store/cartStore';
import { fetchVariantData, defaultUnit, variantLabel, buildCartLine, isLooseProductLine } from '../../../_shared/lib/cartVariants';
import VariantChooserModal from './VariantChooserModal';

/**
 * Cart lines that were added without a variant: one with a single variant gets it automatically; one with several must be
 * chosen by the shopper before checkout. `blocked` is true while any is still undecided.
 */
export default function useCartVariantCheck() {
  const items = useCartStore((s) => s.items);
  const replaceLine = useCartStore((s) => s.replaceLine);
  const [needs, setNeeds] = useState([]);       // [{ item, data }] — products with several variants
  const [checking, setChecking] = useState(false);
  const [choosing, setChoosing] = useState(null);

  const loose = items.filter(isLooseProductLine);
  const sig = loose.map(lineKey).join('|');

  useEffect(() => {
    if (!loose.length) { setNeeds([]); setChecking(false); return undefined; }
    let on = true;
    setChecking(true);
    (async () => {
      const need = [];
      for (const it of loose) {
        try {
          const data = await fetchVariantData(it.id);
          const vs = data?.variants ?? [];
          if (vs.length === 1) {
            const u = defaultUnit(vs[0]);
            if (u) replaceLine(lineKey(it), buildCartLine(it, vs[0], u, variantLabel(data, vs[0])));
          } else if (vs.length > 1) {
            need.push({ item: it, data });
          }
        } catch { /* could not load: leave the line as it is — checkout will use the product's default */ }
      }
      if (on) { setNeeds(need); setChecking(false); }
    })();
    return () => { on = false; };
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  const unresolved = needs.filter((n) => items.some((i) => lineKey(i) === lineKey(n.item)));

  const chooser = choosing ? (
    <VariantChooserModal product={choosing.item} confirmLabel="Use this option" onClose={() => setChoosing(null)}
      onConfirm={(c) => { replaceLine(lineKey(choosing.item), buildCartLine(choosing.item, c.variant, c.unit, c.label)); setChoosing(null); }} />
  ) : null;

  return { unresolved, checking, choose: setChoosing, chooser, blocked: checking || unresolved.length > 0 };
}
