import booksAPI from '../../_shared/api/books';
import { isModuleActive, MODULES } from '../../_shared/navigation/modules';

/**
 * What kinds of stocked item this business has. Products need the E-commerce module, ingredients need Menus; Core stock pages show whichever are on
 * (and say "kitchen item", "product" or "kitchen item or product" accordingly).
 */
export const stockKinds = () => ({ products: isModuleActive(MODULES.ECOMMERCE), ingredients: isModuleActive(MODULES.MENUS) });

export const itemWord = (k = stockKinds()) => (k.products && k.ingredients ? 'kitchen item or product' : k.ingredients ? 'kitchen item' : 'product');

export const searchPlaceholder = (k = stockKinds()) => {
  if (k.products && k.ingredients) return 'Search a kitchen item or product…';
  if (k.ingredients) return 'Search a kitchen item…';
  return 'Search a product or SKU to add…';
};

/** Rows for the kinds that are on, products first. Each row says what it is in `type`: 'product' or 'ingredient'. */
export async function lookupStock(q, { purpose = 'purchase', locationId, kinds = stockKinds() } = {}) {
  const [products, ingredients] = await Promise.all([
    kinds.products ? booksAPI.lookup('product', q, purpose).catch(() => []) : [],
    kinds.ingredients ? booksAPI.lookup('ingredient', q, purpose, locationId ? { location_id: locationId } : {}).catch(() => []) : [],
  ]);
  return [...products, ...ingredients];
}

/** An ingredient row's name as one line: "Wheat flour — Exe 2 kg". */
export const ingredientName = (r) => `${r.ingredient}${r.variant ? ` — ${r.variant}` : ''}`;

/** The unit a stock quantity is usually typed in for an ingredient: packs, else the bigger unit, else the base unit. */
export const defaultUnit = (units = []) => (units.find((u) => u.unit === 'pack') ?? units.find((u) => u.unit === 'alt') ?? units[0])?.unit ?? 'base';

/** The report type of Menus' kitchen stock, as the stock reports name it (its label there is "Kitchen stock"). */
export const KITCHEN_TYPE = 'menus_ingredient_item';

/** The kind of ingredient in a kitchen stock group's name: the report groups them as "Ready to serve: Cola". Empty for any other group. */
export const kitchenKindOf = (group) => { const i = String(group ?? '').indexOf(': '); return i > 0 ? String(group).slice(0, i) : ''; };
