/**
 * Prep and cook minutes worked out from the method: a step whose words say it is preparing (dice, chop, wash...) counts its minutes toward prep, one that says it is cooking (fry, boil, bake...)
 * toward cook. A step with both kinds of word counts as cooking; one with neither, or with no minutes, counts for nothing. The result only fills the prep and cook boxes in: they can be changed.
 */
const COOK = ['fry', 'boil', 'simmer', 'bake', 'roast', 'grill', 'cook', 'steam', 'stew', 'brown', 'saute', 'sauté', 'heat', 'toast', 'braise', 'barbecue', 'poach', 'reduce', 'sear', 'deep-fry', 'warm'];
const PREP = ['dice', 'chop', 'slice', 'peel', 'wash', 'rinse', 'marinate', 'marinade', 'mix', 'whisk', 'knead', 'grate', 'cut', 'trim', 'soak', 'measure', 'prepare', 'cream', 'beat', 'fold', 'season', 'mince', 'crush', 'blend', 'shred', 'pound', 'strain', 'cool', 'rest'];

const has = (text, words) => words.some((w) => new RegExp(`(^|[^a-z])${w}`, 'i').test(text));

/** 'cook', 'prep' or null for the words of one step. */
export const kindOf = (body) => {
  const t = String(body ?? '').toLowerCase();
  if (has(t, COOK)) return 'cook';
  if (has(t, PREP)) return 'prep';

  return null;
};

/** @param {{body: string, minutes: string|number}[]} steps @returns {{prep: number, cook: number, left: number}} minutes by kind, and minutes in steps that matched no word */
export function fromSteps(steps) {
  const out = { prep: 0, cook: 0, left: 0 };
  steps.forEach((s) => {
    const m = Number(s.minutes) || 0;
    if (m <= 0) return;
    const k = kindOf(s.body);
    if (k) out[k] += m; else out.left += m;
  });

  return out;
}

export const KEYWORDS = { prep: PREP, cook: COOK };
