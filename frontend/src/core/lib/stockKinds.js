import booksAPI from '../../_shared/api/books';
import { isModuleActive, MODULES } from '../../_shared/navigation/modules';

/**
 * What kinds of stocked item this business has. Products need the E-commerce module, ingredients need Menus; Core stock pages show whichever are on
 * (and say "ingredient", "product" or "ingredient or product" accordingly).
 */
export const stockKinds = () => ({ products: isModuleActive(MODULES.ECOMMERCE), ingredients: isModuleActive(MODULES.MENUS) });

export const itemWord = (k = stockKinds()) => (k.products && k.ingredients ? 'ingredient or product' : k.ingredients ? 'ingredient' : 'product');

export const searchPlaceholder = (k = stockKinds()) => {
  if (k.products && k.ingredients) return 'Search an ingredient or product…';
  if (k.ingredients) return 'Search an ingredient…';
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
