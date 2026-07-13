// Shared grounding primitives — used by BOTH the grounded day validator and the grounded draft validator
// so the anti-fabrication rules are defined once. Numbers, entities, causal/outcome patterns.

// Pull numeric values out of French text. Normalize thousands spaces ("95 349"→"95349") and unify
// minus/dash variants (U+2212 −, en/em dash) to ASCII "-". Ground by MAGNITUDE (absolute value): a
// discount written "−20 %" and the instruction's "-20 %" are the same figure — sign varies by phrasing,
// and grounding cares whether the figure is SOURCED, not its sign.
export function extractNumbers(text: string): Set<string> {
  const joined = String(text ?? "")
    .replace(/[−–—]/g, "-")
    .replace(/(\d)[  ](?=\d{3}\b)/g, "$1");
  const out = new Set<string>();
  const re = /-?\d+(?:[.,]\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(joined))) {
    const n = Number(m[0].replace(",", "."));
    if (Number.isFinite(n)) out.add(String(Math.abs(Math.round(n * 100) / 100)));
  }
  return out;
}

export const norm = (s: string): string =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

// Named entity = 2+ consecutive Capitalized words (competitor / event / place). Uppercase start =
// [A-Z] + uppercase accented (U+00C0..U+00DD minus × U+00D7); continuation lowercase incl. accents.
export function makeEntityRegex(): RegExp {
  const U = "A-Z\\u00C0-\\u00D6\\u00D8-\\u00DD";
  const L = "a-z\\u00DF-\\u00FF\\w'’-";
  return new RegExp(`[${U}][${L}]+(?:\\s+(?:de|des|du|d['’]|la|le|les|the|of|von)?\\s*[${U}][${L}]+)+`, "g");
}

// Causal attribution on a fact ("X a causé…") + predicted OUTCOME ("X augmentera vos ventes",
// competitor "à guichets fermés" as a fabricated result). "Vu X, envisagez Y" advice is NOT here.
export const CAUSAL_PATTERNS = [
  // causal attribution on a fact
  "a cause", "ont cause", "a genere", "ont genere", "a fait baisser", "ont fait baisser",
  "a fait grimper", "a fait chuter", "a reduit la frequentation", "a dope", "a booste",
  "responsable de la baisse", "responsable de la hausse", "explique la baisse", "explique la hausse",
  "a provoque", "a entraine une baisse", "a entraine une hausse", "fait exploser", "grace a la concurrence",
  // predicted OUTCOME (a promise, not grounded advice) — banned in the geste and in draft copy
  "augmentera", "augmenteront", "boostera", "boosteront", "dopera", "doperont", "rapportera",
  "rapporteront", "generera", "genereront", "fera grimper", "fera gagner", "permettra de gagner",
  "vous fera gagner", "fera venir", "attirera", "doublera", "augmentera vos", "boostera vos",
];

// Extra fabricated-outcome phrases specific to DRAFT copy about external entities/attendance.
export const DRAFT_OUTCOME_PATTERNS = [
  "a guichets fermes", "affiche complet", "affichera complet", "complet depuis", "sold out",
  "des milliers de", "record d'affluence", "record de frequentation", "jamais vu",
];
