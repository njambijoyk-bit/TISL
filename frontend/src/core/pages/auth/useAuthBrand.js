import { useCompany } from '../../../_shared/lib/useCompany';

/**
 * Who the business is, for the sign-in, register and password pages: read from the company profile, never written into the page.
 * The bold name is the trading name, else the legal name, else the short code; under it the company description; the logo, or the first letter of the name when there is none.
 */
export function useAuthBrand() {
  const c = useCompany();
  const name = [c.name, c.legal_name, c.short_code].map((x) => (x ?? '').trim()).find(Boolean) ?? '';

  return { name, description: (c.description ?? '').trim(), tagline: (c.tagline ?? '').trim(), logo: c.logo_view || null, letter: name.slice(0, 1).toUpperCase() };
}
