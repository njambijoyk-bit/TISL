import { useEffect, useState } from 'react';
import codesAPI from '../../_shared/api/codes';
import LabelDialog from '../../core/components/admin/codes/LabelDialog';

/**
 * The label dialog of the Codes page, opened from a kitchen screen for the things in `items` ([{ type, id, label }], types of the Codes page: dish, recipe, prep_lot, stock_lot, kitchen_item).
 * It reads the company's label settings and the kinds of code first, so what is printed is what the Codes page would print.
 */
export default function LabelPrint({ items, onClose }) {
  const [defaults, setDefaults] = useState(null);
  const [kinds, setKinds] = useState([]);
  useEffect(() => {
    codesAPI.kinds().then((r) => setKinds(r.kinds)).catch(() => {});
    codesAPI.settings().then((r) => setDefaults(r.settings.label)).catch(() => setDefaults({ name: true, sku: false, price: false, code_text: true, batch: true, size: 'a4-24' }));
  }, []);
  if (!defaults) return null;

  return <LabelDialog items={items} defaults={defaults} kinds={kinds} onClose={onClose} />;
}
