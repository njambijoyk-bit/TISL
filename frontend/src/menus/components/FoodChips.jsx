import { colors } from '../../_shared/theme/tokens';

const chip = (bg, fg) => ({ display: 'inline-block', padding: '1px 8px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, background: bg, color: fg, marginRight: 4, marginBottom: 3 });

/** Allergens as small amber chips (names from the server's list). */
export function AllergenChips({ codes = [], names = {}, empty = null }) {
  if (!codes.length) return empty;

  return <span data-testid="allergens">{codes.map((c) => <span key={c} style={chip(colors.warningBg, colors.warningText)}>{names[c] ?? c}</span>)}</span>;
}

/** Diet badges as small green chips. */
export function DietChips({ codes = [], names = {} }) {
  if (!codes.length) return null;

  return <span data-testid="diets">{codes.map((c) => <span key={c} style={chip(colors.successBg, colors.successText)}>{names[c] ?? c}</span>)}</span>;
}

export const Pill = ({ children, tone = 'neutral' }) => {
  const t = { neutral: [colors.neutralBg, colors.neutralText], danger: [colors.dangerBg, colors.dangerText], warn: [colors.warningBg, colors.warningText], ok: [colors.successBg, colors.successText] }[tone];

  return <span style={chip(t[0], t[1])}>{children}</span>;
};
