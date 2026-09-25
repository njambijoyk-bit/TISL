import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import useCurrencyStore from '../../../store/currencyStore';
import useProductStore from '../../../store/productStore';
import { colors, radius } from '../../../theme/tokens';

/**
 * Storefront currency switcher for the header.
 *
 * Changing it persists the choice (sent as X-Currency on every request) and
 * calls onChange so the page can refetch its listing. Hidden when only one
 * currency is active.
 */
export default function CurrencyToggle({ onChange, compact = false }) {
  const { currencies, fetchCurrencies, setDisplayCurrency, getActive } = useCurrencyStore();
  const invalidateDisplayPrices = useProductStore((s) => s.invalidateDisplayPrices);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => { if (!currencies.length) fetchCurrencies(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const active = getActive();
  if (currencies.length < 2 || !active) return null;

  const choose = (c) => {
    setOpen(false);
    if (c.code === active.code) return;
    setDisplayCurrency(c.is_base ? null : c.code);
    invalidateDisplayPrices();
    onChange?.(c);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Prices shown in ${active.name}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: compact ? '4px 8px' : '6px 10px', borderRadius: radius.md,
          border: `1.5px solid ${colors.tint(0.18)}`, background: colors.tint(0.04),
          color: colors.textBody, fontSize: '0.78rem', fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span style={{ color: colors.primary }}>{active.symbol}</span>
        {active.code}
        <ChevronDown size={12} style={{ transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Choose a currency"
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 60,
            minWidth: 190, margin: 0, padding: 4, listStyle: 'none',
            background: colors.surface, borderRadius: radius.lg,
            border: `1px solid ${colors.tint(0.12)}`, boxShadow: `0 8px 24px ${colors.tint(0.15)}`,
          }}
        >
          {currencies.map((c) => {
            const selected = c.code === active.code;
            return (
              <li key={c.id} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => choose(c)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', borderRadius: radius.md, border: 'none',
                    background: selected ? colors.tint(0.08) : 'transparent',
                    color: colors.textBody, fontSize: '0.8rem', textAlign: 'left',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = colors.tint(0.04); }}
                  onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ width: 22, fontWeight: 700, color: colors.primary }}>{c.symbol}</span>
                  <span style={{ flex: 1 }}>
                    <strong style={{ fontWeight: 700 }}>{c.code}</strong>
                    <span style={{ color: colors.textFaint }}> · {c.name}</span>
                  </span>
                  {selected && <Check size={13} style={{ color: colors.primary }} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
