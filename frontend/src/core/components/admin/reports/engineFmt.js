/**
 * How the engine's reports draw an amount, the same way everywhere. The server sends the person's display settings with every report
 * (Books → Configuration → Reports → Display); these functions apply them.
 */

export const DEFAULT_FORMAT = { decimals: 2, units: 'none', negative_format: 'minus', show_zero_balances: false };

const DIVISOR = { none: 1, thousands: 1000, millions: 1000000 };
export const UNIT_WORD = { none: '', thousands: 'in thousands', millions: 'in millions' };

const settings = (format) => ({ ...DEFAULT_FORMAT, ...(format ?? {}) });

/** The number, scaled by the units setting and cut to the decimals setting, with its sign still on: [shown digits, is it nothing at this precision, is it negative]. */
const parts = (value, format, locale) => {
  const f = settings(format);
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const scaled = n / (DIVISOR[f.units] ?? 1);
  const digits = Math.abs(scaled).toLocaleString(locale, { minimumFractionDigits: f.decimals, maximumFractionDigits: f.decimals });
  const nothing = Number(Math.abs(scaled).toFixed(f.decimals)) === 0;
  return { digits, nothing, negative: scaled < 0 && !nothing, f };
};

/** An amount: 1,234.50, -1,234.50 or (1,234.50). `blankZero` leaves a zero empty (for columns where a dash of nothing reads better). */
export function formatAmount(value, format, { blankZero = false, locale } = {}) {
  const p = parts(value, format, locale);
  if (!p) return '';
  if (p.nothing && blankZero) return '';
  if (!p.negative) return p.digits;

  return p.f.negative_format === 'brackets' ? `(${p.digits})` : `-${p.digits}`;
}

/** A signed balance (debit positive, credit negative) as "1,234.50 Dr" or "1,234.50 Cr"; nothing at all is just "0.00". */
export function formatBalance(signed, format, { locale } = {}) {
  const p = parts(signed, format, locale);
  if (!p) return '';
  if (p.nothing) return p.digits;

  return `${p.digits} ${Number(signed) >= 0 ? 'Dr' : 'Cr'}`;
}
