import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ListChecks } from 'lucide-react';
import cataloguesAPI from '../../../_shared/api/catalogues';

const pill = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 999, fontSize: '0.82rem', fontWeight: 700, textDecoration: 'none', border: '1.5px solid var(--color-primary-500)', color: 'var(--color-primary-500)', background: 'transparent' };

/**
 * On the products page: "Look at these brochures" and "Price lists". Each shows only when the shop's settings allow it AND there is at least one the visitor may open
 * (the server works that out for this visitor), so a customer never lands on an empty page.
 */
export default function CatalogueLinks() {
  const [s, setS] = useState(null);
  useEffect(() => { let on = true; cataloguesAPI.status().then((r) => on && setS(r)).catch(() => {}); return () => { on = false; }; }, []);
  if (!s || (!s.catalogues?.show && !s.price_lists?.show)) return null;

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '0 0 14px' }}>
      {s.catalogues?.show && <Link to="/brochures" style={pill}><BookOpen size={15} /> Look at these brochures</Link>}
      {s.price_lists?.show && <Link to="/price-lists" style={pill}><ListChecks size={15} /> Price lists</Link>}
    </div>
  );
}
