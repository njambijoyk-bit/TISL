import { useEffect, useState } from 'react';
import booksAPI from '../../../../_shared/api/books';

/**
 * The statement lines a ledger or group can report under (database/sql/227_statements.sql), fetched once and shared by every form on the page.
 * `ready` is false until script 227 has been run, and the screens leave the field out.
 */
let cache = null;
let inflight = null;

const load = () => {
  if (cache) return Promise.resolve(cache);
  inflight ??= booksAPI.statementLines()
    .then((r) => { cache = { ready: Boolean(r.ready), lines: r.lines ?? [] }; return cache; })
    .catch(() => ({ ready: false, lines: [] }))   // not fatal: the field simply is not offered
    .finally(() => { inflight = null; });
  return inflight;
};

/** Forget what was fetched (after someone adds or renames a line in the Reports settings). */
export const refreshStatementLines = () => { cache = null; };

export default function useStatementLines() {
  const [state, setState] = useState(cache ?? { ready: false, lines: [], loading: true });
  useEffect(() => {
    let live = true;
    load().then((c) => { if (live) setState({ ...c, loading: false }); });
    return () => { live = false; };
  }, []);
  const byId = Object.fromEntries(state.lines.map((l) => [l.id, l]));
  return { ...state, byId };
}
