import { useEffect, useState } from 'react';
import preordersAPI from '../api/preorders';
import useLocationStore from '../store/locationStore';
import { isModuleActive, MODULES } from '../navigation/modules';

/**
 * What a product that is out of stock offers at the shopper's branch: 'preorder' (an open offer), 'coming_soon', or 'out'.
 * Cards on one page ask together: ids are collected for a moment and sent as one request, and answers are remembered per branch.
 * Nothing is asked when the Campaigns module is off or the product is in stock.
 */
const cache = new Map();      // `${branch}:${productId}` -> { state, variant_id, offer }
const waiting = new Map();    // key -> Set of listeners
let queued = new Set();
let timer = null;

const flush = () => {
  timer = null;
  const ids = [...queued];
  queued = new Set();
  if (!ids.length) return;
  const branch = useLocationStore.getState().currentId;
  preordersAPI.productStates(ids, branch).then((r) => {
    ids.forEach((id) => cache.set(`${branch ?? ''}:${id}`, r.products?.[id] ?? { state: 'out' }));
  }).catch(() => {
    ids.forEach((id) => cache.set(`${branch ?? ''}:${id}`, { state: 'out' }));
  }).finally(() => ids.forEach((id) => { (waiting.get(`${branch ?? ''}:${id}`) ?? []).forEach((fn) => fn()); }));
};

export default function usePreorderState(productId, wanted = true) {
  const branch = useLocationStore((s) => s.currentId);
  const key = `${branch ?? ''}:${productId}`;
  const [, tick] = useState(0);
  const on = wanted && productId && isModuleActive(MODULES.CAMPAIGNS);

  useEffect(() => {
    if (!on) return undefined;
    const fn = () => tick((n) => n + 1);
    if (!waiting.has(key)) waiting.set(key, new Set());
    waiting.get(key).add(fn);
    if (!cache.has(key)) {
      queued.add(productId);
      if (!timer) timer = setTimeout(flush, 60);
    }
    return () => waiting.get(key)?.delete(fn);
  }, [on, key, productId]);

  return on ? (cache.get(key) ?? null) : null;
}
