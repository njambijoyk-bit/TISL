import { useEffect, useState } from 'react';
import preordersAPI from '../api/preorders';
import { isModuleActive, MODULES } from '../navigation/modules';

/**
 * What hampers look like when a component is out of stock: 'preorder' (the short parts have an open offer), 'coming_soon' or 'out'.
 * Asked once for the ids given. With the Campaigns module off nothing is asked and nothing is returned, so hampers behave as before.
 * @returns {{ [hamperId: number]: { state: string, offer: object|null, blocked: string[] } }}
 */
export default function useHamperPreorder(ids) {
  const [states, setStates] = useState({});
  const key = (ids ?? []).filter(Boolean).join(',');

  useEffect(() => {
    if (!key || !isModuleActive(MODULES.CAMPAIGNS)) { setStates({}); return undefined; }
    let live = true;
    preordersAPI.hamperStates(key.split(',').map(Number)).then((r) => live && setStates(r)).catch(() => live && setStates({}));
    return () => { live = false; };
  }, [key]);

  return states;
}

/** "Expected 2026-12-01" or "Expected 2026-11-01 to 2026-12-01" from an offer, or null. */
export const expectedText = (offer) => {
  const from = offer?.expected_from;
  const until = offer?.expected_until;
  if (!from && !until) return null;
  return from && until && from !== until ? `Expected ${from} to ${until}` : `Expected ${until || from}`;
};
