/**
 * Prep and cook minutes worked out from the method: a step whose words say it is preparing (dice, chop, wash...) counts its minutes toward prep, one that says it is cooking (fry, boil, bake...)
 * toward cook. A step with both kinds of word counts as cooking; one with neither, or with no minutes, counts for nothing. The result only fills the prep and cook boxes in: they can be changed.
 *
 * A word matches when a word in the step STARTS with it ("fry" finds "frying" and "fried"), ignoring capitals and accents ("sauté" finds "saute", "rôtir" finds "rotir"). The words are kept by
 * language; the steps may be written in any of them, or a mixture.
 */
export const WORDS = {
  English: {
    cook: [
      'fry', 'deep-fry', 'deep fry', 'shallow-fry', 'pan-fry', 'stir-fry', 'flash-fry', 'sweat', 'saute', 'sauté', 'brown', 'sear', 'caramelise', 'caramelize', 'crisp', 'sizzle', 'scramble', 'fry off',
      'boil', 'parboil', 'par-boil', 'blanch', 'scald', 'simmer', 'stew', 'poach', 'steam', 'braise', 'reduce', 'thicken', 'bubble', 'slow-cook', 'pressure-cook', 'cook', 'bring to the boil', 'bring to a boil',
      'heat', 'reheat', 'warm', 'melt', 'toast', 'char', 'griddle', 'grill', 'broil', 'barbecue', 'barbeque', 'bbq', 'smoke', 'baste', 'roast',
      'bake', 'bake blind', 'preheat', 'pre-heat', 'oven', 'gratin',
    ],
    prep: [
      'dice', 'chop', 'slice', 'mince', 'julienne', 'shave', 'halve', 'quarter', 'segment', 'fillet', 'debone', 'bone', 'carve', 'score', 'butterfly', 'portion', 'deseed', 'core', 'hull', 'zest', 'cut', 'trim', 'shred', 'grate',
      'peel', 'wash', 'rinse', 'scrub', 'drain', 'pat dry', 'dry', 'thaw', 'defrost', 'sift', 'sieve', 'strain', 'clean', 'gut', 'pick over',
      'mix', 'combine', 'toss', 'coat', 'rub', 'massage', 'brush', 'spread', 'stuff', 'fill', 'roll', 'shape', 'mould', 'mold', 'press', 'flatten', 'knead', 'prove', 'proof', 'rise', 'stir in', 'whisk', 'beat', 'cream', 'fold', 'blend',
      'marinate', 'marinade', 'brine', 'cure', 'infuse', 'steep', 'soak', 'dissolve', 'sprinkle', 'pour', 'add', 'season', 'measure', 'weigh', 'prepare', 'set aside', 'leave to', 'rest', 'chill', 'refrigerate', 'freeze', 'cool',
      'crush', 'pound', 'grind', 'mash', 'puree', 'purée', 'pulp', 'squeeze', 'juice', 'tenderise', 'tenderize',
      'layer', 'arrange', 'garnish', 'assemble', 'skewer', 'thread', 'wrap', 'cover', 'line', 'grease', 'flour', 'dust',
      'glaze', 'icing', 'frost', 'decorate', 'pipe', 'drizzle', 'dip', 'level', 'smooth', 'unmould', 'unmold', 'turn out', 'cut out', 'rub in', 'roll out', 'cut in',
    ],
  },
  Kiswahili: {
    cook: ['kaanga', 'chemsha', 'pika', 'oka', 'choma', 'tokosa', 'bandika', 'washa moto'],
    prep: ['kata', 'menya', 'osha', 'changanya', 'saga', 'kuna', 'twanga', 'loweka', 'koroga', 'ponda', 'chuja', 'andaa', 'pima', 'weka', 'mimina', 'tia', 'nyunyiza', 'kanda', 'fungua', 'chambua', 'poza', 'acha', 'kamua'],
  },
  Français: {
    cook: ['cuire', 'cuis', 'cuisson', 'frire', 'fris', 'frit', 'revenir', 'faire revenir', 'bouill', 'mijot', 'rotir', 'rôtir', 'gril', 'saisir', 'saisis', 'pocher', 'poch', 'blanchir', 'blanchis', 'braiser', 'brais', 'etuv', 'étuv', 'gratiner', 'gratin', 'flamber', 'flamb', 'reduire', 'réduire', 'chauff', 'fondre', 'fondu', 'dorer', 'doré', 'enfourn', 'au four', 'prechauff', 'préchauff', 'sauter', 'saute', 'sauté', 'caramel', 'griller', 'vapeur'],
    prep: ['couper', 'coupe', 'emincer', 'émincer', 'emince', 'hacher', 'hache', 'eplucher', 'éplucher', 'epluche', 'peler', 'pele', 'laver', 'lave', 'rincer', 'rince', 'melanger', 'mélanger', 'melange', 'fouetter', 'fouette', 'petrir', 'pétrir', 'petris', 'raper', 'râper', 'rape', 'ecraser', 'écraser', 'ecrase', 'mariner', 'marine', 'tremper', 'trempe', 'assaisonner', 'assaisonne', 'saler', 'poivrer', 'ciseler', 'denoyauter', 'dénoyauter', 'trancher', 'tranche', 'decouper', 'découper', 'decoupe', 'battre', 'bats', 'incorporer', 'incorpore', 'tamiser', 'tamise', 'egoutter', 'égoutter', 'egoutte', 'faconner', 'façonner', 'etaler', 'étaler', 'etale', 'rouler', 'roule', 'garnir', 'garnis', 'repos', 'reposer', 'laisser', 'refroidir', 'peser', 'pese', 'preparer', 'préparer', 'prepare', 'ajouter', 'ajoute', 'verser', 'verse', 'saupoudrer', 'badigeonner', 'beurrer', 'fariner', 'farce', 'farcir', 'moudre', 'moulu', 'piler', 'presser', 'presse', 'mixer', 'mixe', 'dessaler', 'parer', 'vider', 'denerver', 'dénerver', 'lever', 'pousse', 'glacer', 'decorer', 'décorer', 'napper'],
  },
  Español: {
    cook: ['cocinar', 'cocina', 'cocer', 'cuece', 'coccion', 'cocción', 'freir', 'freír', 'fríe', 'frie', 'sofreir', 'sofreír', 'sofrie', 'sofríe', 'saltear', 'hervir', 'hierve', 'hirvi', 'hornear', 'horno', 'precalentar', 'asar', 'asa', 'guisar', 'guisa', 'estofar', 'estofa', 'escalfar', 'escalfa', 'tostar', 'tuesta', 'dorar', 'dora', 'rehogar', 'rehoga', 'gratinar', 'gratina', 'calentar', 'calienta', 'plancha', 'brasear', 'sellar', 'derretir', 'derrite', 'reducir', 'reduce', 'cuece', 'saltea', 'hornea', 'ahumar', 'flamear', 'vapor', 'blanquear', 'escaldar', 'caramelizar', 'confitar'],
    prep: ['cortar', 'corta', 'picar', 'pica', 'trocear', 'trocea', 'rebanar', 'rebana', 'laminar', 'pelar', 'pela', 'lavar', 'lava', 'enjuagar', 'enjuaga', 'mezclar', 'mezcla', 'batir', 'bate', 'amasar', 'amasa', 'rallar', 'ralla', 'machacar', 'machaca', 'majar', 'maja', 'triturar', 'tritura', 'moler', 'muele', 'marinar', 'marina', 'adobar', 'adoba', 'remojar', 'remoja', 'sazonar', 'sazona', 'condimentar', 'salar', 'tamizar', 'tamiza', 'escurrir', 'escurre', 'desmenuzar', 'deshuesar', 'filetear', 'rellenar', 'rellena', 'enrollar', 'enrolla', 'extender', 'extiende', 'aplastar', 'aplasta', 'reposar', 'reposo', 'dejar', 'incorporar', 'incorpora', 'integrar', 'licuar', 'licua', 'colar', 'cuela', 'exprimir', 'exprime', 'pesar', 'pesa', 'medir', 'mide', 'preparar', 'prepara', 'enfriar', 'enfria', 'agregar', 'agrega', 'anadir', 'añadir', 'añade', 'verter', 'vierte', 'espolvorear', 'espolvorea', 'untar', 'unta', 'engrasar', 'enharinar', 'decorar', 'decora', 'glasear', 'cubrir', 'cubre', 'envolver', 'envuelve', 'montar', 'ensamblar', 'emplatar', 'lavar', 'limpiar', 'limpia', 'descongelar', 'descongela', 'desvenar', 'despellejar'],
  },
};

const fold = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const escape = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const build = (kind) => {
  const all = [...new Set(Object.values(WORDS).flatMap((l) => l[kind]).map((w) => fold(w).trim()).filter(Boolean))];

  return new RegExp(`(^|[^a-z])(${all.map(escape).join('|')})`);
};
const COOK = build('cook');
const PREP = build('prep');

/** 'cook', 'prep' or null for the words of one step. */
export const kindOf = (body) => {
  const t = fold(body);
  if (COOK.test(t)) return 'cook';
  if (PREP.test(t)) return 'prep';

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

/** The words of one kind, for the list shown on the recipe form: [[language, [words]]]. */
export const wordsOf = (kind) => Object.entries(WORDS).map(([language, w]) => [language, [...new Set(w[kind])]]);
