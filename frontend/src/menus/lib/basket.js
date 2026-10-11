import { useCallback, useEffect, useMemo, useState } from 'react';

const KEY = 'tisl.menu.basket';

const read = () => { try { const v = JSON.parse(window.localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const write = (lines) => { try { window.localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* private window: the basket just lives on this page */ } };

/** The same dish with the same choices and note is one line. */
export const lineKey = (dishId, optionIds, note) => `${dishId}:${[...optionIds].sort((a, b) => a - b).join(',')}:${(note ?? '').trim()}`;

/** What a line costs before tax: the dish and its choices, times how many. */
export const lineTotal = (l) => (Number(l.price) + l.option_delta) * l.quantity;

/** The customer's basket, kept in this browser so it survives a refresh. Each line: { key, dish_id, name, price, option_delta, option_ids, option_names, note, quantity }. */
export function useBasket() {
  const [lines, setLines] = useState(read);
  useEffect(() => { write(lines); }, [lines]);

  const add = useCallback((dish, { option_ids = [], option_names = [], option_delta = 0, note = '', quantity = 1 } = {}) => {
    const key = lineKey(dish.id, option_ids, note);
    setLines((xs) => (xs.some((l) => l.key === key)
      ? xs.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, l.quantity + quantity) } : l))
      : [...xs, { key, dish_id: dish.id, name: dish.name, price: dish.price ?? 0, option_delta, option_ids, option_names, note: note.trim(), quantity }]));
  }, []);
  const setQuantity = useCallback((key, quantity) => setLines((xs) => (quantity <= 0 ? xs.filter((l) => l.key !== key) : xs.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, quantity) } : l)))), []);
  const clear = useCallback(() => setLines([]), []);
  const count = useMemo(() => lines.reduce((n, l) => n + l.quantity, 0), [lines]);
  const subtotal = useMemo(() => lines.reduce((n, l) => n + lineTotal(l), 0), [lines]);

  return { lines, add, setQuantity, clear, count, subtotal };
}
