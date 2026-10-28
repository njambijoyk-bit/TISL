import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleRows, foldableKeys, initiallyFolded, variance } from './statementRows.js';

const rows = [
  { key: 'h:A', parent: '', type: 'heading', expandable: true },
  { key: 'l:CASH', parent: 'h:A', type: 'line', expandable: true },
  { key: 'ledger:1', parent: 'l:CASH', type: 'ledger' },
  { key: 'l:BANK', parent: 'h:A', type: 'line', expandable: false },
  { key: 'subtotal:gp', parent: '', type: 'subtotal' },
];

test('a folded row hides everything under it, at any depth', () => {
  assert.deepEqual(visibleRows(rows, new Set()).map((r) => r.key), rows.map((r) => r.key));
  assert.deepEqual(visibleRows(rows, new Set(['l:CASH'])).map((r) => r.key), ['h:A', 'l:CASH', 'l:BANK', 'subtotal:gp']);
  assert.deepEqual(visibleRows(rows, new Set(['h:A'])).map((r) => r.key), ['h:A', 'subtotal:gp']);
});

test('lines with ledgers start folded; sections and empty lines do not', () => {
  assert.deepEqual([...initiallyFolded(rows)], ['l:CASH']);
  assert.deepEqual(foldableKeys(rows), ['h:A', 'l:CASH']);
});

test('variance gives the change and the percentage of the earlier figure', () => {
  assert.deepEqual(variance(120, 100), { change: 20, pct: 20 });
  assert.deepEqual(variance(80, 100), { change: -20, pct: -20 });
  assert.deepEqual(variance(-50, -100), { change: 50, pct: 50 });
  assert.deepEqual(variance(10, 0), { change: 10, pct: null });
});
