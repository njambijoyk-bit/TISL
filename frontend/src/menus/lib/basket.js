import { useCallback, useEffect, useMemo, useState } from 'react';

const KEY = 'tisl.menu.basket';

const read = (key) => { if (!key) return []; try { const v = JSON.parse(window.localStorage.getItem(key) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const write = (key, lines) => { if (!key) return; try { window.localStorage.setItem(key, JSON.stringify(lines)); } catch { /* private window: the basket just lives on this page */ } };

/** The same dish with the same choices, size, sides and note is one line. */
export const lineKey = (dishId, optionIds, note, servingId = null, picks = null, mods = null) => `${dishId}${mods?.length ? `~${mods.map((m) => `${m.kind[0]}${m.ingredient_id}`).sort().join(',')}` : ''}:${[...optionIds].sort((a, b) => a - b).join(',')}:${(note ?? '').trim()}:${servingId ?? ''}:${picks ? Object.keys(picks).sort().map((k) => `${k}=${picks[k].map((p) => `${p.side_id}x${p.qty}`).sort().join('+')}`).join(';') : ''}`;

/** The basket as the order calls want it: the dish, how many, the old choices, and the size and sides of a dish that has them. */
export const basketItems = (lines) => lines.map((l) => ({ dish_id: l.dish_id, quantity: l.quantity, option_ids: l.option_ids, note: l.note || undefined, ...(l.serving_id ? { serving_id: l.serving_id } : {}), ...(l.picks ? { picks: l.picks } : {}), ...(l.mods?.length ? { mods: l.mods } : {}) }));

/** Does this dish ask something before it goes in the basket: a size, sides, or one of the older choices? */
export const needsChoice = (d) => d.options.length > 0 || !!d.makeup || (d.modifiers ?? []).length > 0;

/** The price to show on a dish: its own, or for a dish sold in sizes the smallest one, marked `from`. Tax-inclusive when the menu has that figure. @returns {{ amount: number|null, from: boolean }} */
export const shownPrice = (d) => {
  const sizes = d.makeup?.servings ?? [];
  if (sizes.length) return { amount: Math.min(...sizes.map((s) => Number(s.price_incl ?? s.price))), from: sizes.length > 1 };
  const p = d.price_incl ?? d.price;

  return { amount: p == null ? null : Number(p), from: false };
};

/** The currency to show beside a dish's price when it is not the one the order is written in ("USD "), else nothing. */
export const priceTag = (d) => (d?.currency ? `${d.currency.code} ` : '');

/** What a line costs before tax: the dish and its choices, times how many. */
export const lineTotal = (l) => (Number(l.price) + l.option_delta) * l.quantity;

/** A basket. With the default key it is the customer's, kept in this browser (pass null for one that is only on this page, like the till's) so it survives a refresh. Each line: { key, dish_id, name, price, option_delta, option_ids, option_names, note, quantity, serving_id?, picks?, mods? }. For a dish with sizes the price is the size's, and what the sides add is in option_delta. */
export function useBasket(storageKey = KEY) {
  const [lines, setLines] = useState(() => read(storageKey));
  useEffect(() => { write(storageKey, lines); }, [storageKey, lines]);

  const add = useCallback((dish, { option_ids = [], option_names = [], option_delta = 0, note = '', quantity = 1, serving_id = null, picks = null, price = null, mods = null } = {}) => {
    const key = lineKey(dish.id, option_ids, note, serving_id, picks, mods);
    setLines((xs) => (xs.some((l) => l.key === key)
      ? xs.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, l.quantity + quantity) } : l))
      : [...xs, { key, dish_id: dish.id, name: dish.name, price: price ?? dish.price ?? 0, ...(dish.currency ? { currency: dish.currency.code } : {}), option_delta, option_ids, option_names, note: note.trim(), quantity, ...(serving_id ? { serving_id } : {}), ...(picks ? { picks } : {}), ...(mods?.length ? { mods } : {}) }]));
  }, []);
  const setQuantity = useCallback((key, quantity) => setLines((xs) => (quantity <= 0 ? xs.filter((l) => l.key !== key) : xs.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, quantity) } : l)))), []);
  const clear = useCallback(() => setLines([]), []);
  const count = useMemo(() => lines.reduce((n, l) => n + l.quantity, 0), [lines]);
  const subtotal = useMemo(() => lines.reduce((n, l) => n + lineTotal(l), 0), [lines]);

  const mixed = useMemo(() => lines.some((l) => l.currency), [lines]);   // dishes in another currency: a sum of the lines would add different money together, so the quote gives the total

  return { lines, add, setQuantity, clear, count, subtotal, mixed };
}
