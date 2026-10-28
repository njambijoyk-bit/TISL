/**
 * Folding and comparing the rows of a statement (the engine's P&L and balance sheet). Rows come flat, in reading order, each with its `key`, its
 * `parent` key and its `depth`; a row is hidden when any row above it is folded.
 */

/** @param {object[]} rows  @param {Set<string>} collapsed keys of the folded rows */
export function visibleRows(rows, collapsed) {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const hidden = (r) => {
    for (let p = r.parent ? byKey.get(r.parent) : null, guard = 0; p && guard < 50; p = p.parent ? byKey.get(p.parent) : null, guard++) {
      if (collapsed.has(p.key)) return true;
    }
    return false;
  };

  return rows.filter((r) => !hidden(r));
}

/** The keys of the rows that fold: a section, or a line with ledgers under it. */
export const foldableKeys = (rows) => rows.filter((r) => r.expandable).map((r) => r.key);

/** The keys folded when a statement opens: the ledgers sit inside their lines until a line is opened. */
export const initiallyFolded = (rows) => new Set(rows.filter((r) => r.type === 'line' && r.expandable).map((r) => r.key));

/** The change from the earlier figure to this one, and as a percentage of the earlier (null when there is nothing to divide by). */
export function variance(current, earlier) {
  const change = Math.round((Number(current) - Number(earlier)) * 100) / 100;
  const pct = Math.abs(Number(earlier)) >= 0.005 ? Math.round((change / Math.abs(Number(earlier))) * 1000) / 10 : null;

  return { change, pct };
}
