import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAmount, formatBalance, DEFAULT_FORMAT } from './engineFmt.js';

const en = { locale: 'en-US' };

test('amounts use the decimals setting', () => {
  assert.equal(formatAmount(1234.5, undefined, en), '1,234.50');
  assert.equal(formatAmount(1234.567, { decimals: 0 }, en), '1,235');
  assert.equal(formatAmount(1234.567, { decimals: 3 }, en), '1,234.567');
});

test('thousands and millions scale the figure', () => {
  assert.equal(formatAmount(2500000, { units: 'thousands', decimals: 0 }, en), '2,500');
  assert.equal(formatAmount(2500000, { units: 'millions', decimals: 1 }, en), '2.5');
});

test('negative amounts follow the negative style', () => {
  assert.equal(formatAmount(-1000, undefined, en), '-1,000.00');
  assert.equal(formatAmount(-1000, { negative_format: 'brackets' }, en), '(1,000.00)');
});

test('a figure that rounds to nothing is never shown negative', () => {
  assert.equal(formatAmount(-0.001, undefined, en), '0.00');
  assert.equal(formatAmount(-0.001, { negative_format: 'brackets' }, en), '0.00');
  assert.equal(formatAmount(-400, { units: 'thousands', decimals: 0 }, en), '0', 'scaled to nothing');
});

test('blankZero leaves nothing empty and keeps real figures', () => {
  assert.equal(formatAmount(0, undefined, { ...en, blankZero: true }), '');
  assert.equal(formatAmount(0.004, undefined, { ...en, blankZero: true }), '');
  assert.equal(formatAmount(0.01, undefined, { ...en, blankZero: true }), '0.01');
});

test('a balance says debit or credit, and nothing is just 0.00', () => {
  assert.equal(formatBalance(1500, undefined, en), '1,500.00 Dr');
  assert.equal(formatBalance(-1500, undefined, en), '1,500.00 Cr');
  assert.equal(formatBalance(0, undefined, en), '0.00');
  assert.equal(formatBalance(-0.002, undefined, en), '0.00');
  assert.equal(formatBalance(-1500, { negative_format: 'brackets' }, en), '1,500.00 Cr', 'the negative style does not touch Dr/Cr');
});

test('something that is not a number is shown as empty, not NaN', () => {
  assert.equal(formatAmount(undefined, undefined, en), '');
  assert.equal(formatAmount('abc', undefined, en), '');
  assert.equal(formatBalance(null, undefined, en), '0.00', 'null counts as zero, as Number(null) does');
});

test('the defaults are what the server defaults to', () => {
  assert.deepEqual(DEFAULT_FORMAT, { decimals: 2, units: 'none', negative_format: 'minus', show_zero_balances: false });
});
