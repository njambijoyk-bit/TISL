import { useAuthBrand } from './useAuthBrand';

function Mark({ size, radius, font, letterSpacing }) {
  const { name, logo, letter } = useAuthBrand();
  const box = { width: size, height: size, borderRadius: radius, background: 'rgba(255,255,255,0.18)', border: '1.5px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 };

  return (
    <div style={box}>
      {logo
        ? <img src={logo} alt={name} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: size > 50 ? 8 : 4, boxSizing: 'border-box' }} />
        : <span style={{ fontSize: font, fontWeight: 900, color: 'white', letterSpacing }}>{letter}</span>}
    </div>
  );
}

/** The small version, for the top bar on a phone. */
export function AuthBrandBar() {
  const { name, description } = useAuthBrand();

  return (
    <>
      <Mark size={36} radius={10} font="1rem" />
      <div>
        <div style={{ color: 'white', fontWeight: 800, fontSize: '0.95rem', letterSpacing: '-0.01em' }}>{name}</div>
        {description && <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.65rem', fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{description}</div>}
      </div>
    </>
  );
}

/** The large version, for the coloured panel beside the form. */
export function AuthBrandPanel() {
  const { name, description } = useAuthBrand();

  return (
    <>
      <div style={{ margin: '0 auto 16px', width: 72 }}><Mark size={72} radius={20} font="1.6rem" letterSpacing="-0.04em" /></div>
      <h2 style={{ color: 'white', fontSize: '1.5rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>{name}</h2>
      {description && <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', margin: '6px 0 0', fontWeight: 500, lineHeight: 1.4 }}>{description}</p>}
    </>
  );
}
