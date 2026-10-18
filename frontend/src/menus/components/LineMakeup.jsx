/** The size and sides a dish was ordered with, indented under it (kitchen screen, order lists, what the customer sees). Nothing for a dish ordered without a make-up. */
export default function LineMakeup({ line, color = 'inherit', size = '0.85em' }) {
  const sides = line.sides ?? [];
  if (!line.serving && sides.length === 0) return null;

  return (
    <ul data-testid="line-makeup" style={{ listStyle: 'none', margin: '2px 0 0', padding: '0 0 0 14px', fontSize: size, color }}>
      {line.serving && <li style={{ fontWeight: 700 }}>{line.serving}</li>}
      {sides.map((s) => <li key={s}>- {s}</li>)}
    </ul>
  );
}
