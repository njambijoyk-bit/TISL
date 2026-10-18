/** Which prices on an order were converted, and at what rate: "Prices in USD are converted at today's rate (1 USD = 130 KES)." Nothing when nothing was converted. */
export default function ConversionNote({ quote, style }) {
  const list = quote?.conversions ?? [];
  if (list.length === 0) return null;

  return (
    <p data-testid="conversion-note" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary, #475569)', ...style }}>
      {list.map((c) => `Prices in ${c.code} are converted at today's rate (1 ${c.code} = ${Number(c.rate).toLocaleString('en-KE', { maximumFractionDigits: 4 })} ${c.to})`).join('. ')}. Each price is rounded to two decimals as it is converted.
    </p>
  );
}
