import { useEffect, useState } from 'react';
import engagementAPI from '../api/engagement';

/**
 * Which Engagement controls to show, read once from /engagement/config and shared by every component. When Extras is off, the engine is off, or the
 * request fails, nothing shows: `on(type, action)` is false for everything.
 */
let cached = null;
let pending = null;
const listeners = new Set();
const EMPTY = { enabled: false, rules: {}, reasons: [] };

function load() {
  if (!pending) {
    pending = engagementAPI.config().then((c) => { cached = c?.enabled ? c : EMPTY; }).catch(() => { cached = EMPTY; }).finally(() => { listeners.forEach((fn) => fn()); });
  }

  return pending;
}

/** Forget what was read (after the settings are changed in the same session). */
export function resetEngagementConfig() { cached = null; pending = null; listeners.forEach((fn) => fn()); }

export default function useEngagement() {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    if (!cached) load();

    return () => { listeners.delete(fn); };
  }, []);
  const c = cached ?? EMPTY;

  return { loaded: cached !== null, reasons: c.reasons, rule: (type, action) => c.rules?.[type]?.[action] ?? null, on: (type, action) => Boolean(c.enabled && c.rules?.[type]?.[action]) };
}
