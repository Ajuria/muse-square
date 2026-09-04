// Shared grounding primitives — used by BOTH the grounded day validator and the grounded draft validator
// so the anti-fabrication rules are defined once. Numbers, entities, causal/outcome patterns.

// Pull numeric values out of French text. Normalize thousands spaces ("95 349"→"95349") and unify
// minus/dash variants (U+2212 −, en/em dash) to ASCII "-". Ground by MAGNITUDE (absolute value): a
// discount written "−20 %" and the instruction's "-20 %" are the same figure — sign varies by phrasing,
// and grounding cares whether the figure is SOURCED, not its sign.
export function extractNumbers(text: string): Set<string> {
  const joined = String(text ?? "")
    .replace(/[−–—]/g, "-")
    // Collapse thousands separators before number extraction. French formatting (toLocaleString
    // 'fr-FR') emits U+202F (narrow no-break space) or U+00A0 (no-break space), not a plain space —
    // without these, "51 447" splits into 51/447 and large measured numbers never ground.
    .replace(/(\d)[   ](?=\d{3}\b)/g, "$1");
  const out = new Set<string>();
  const re = /-?\d+(?:[.,]\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(joined))) {
    const n = Number(m[0].replace(",", "."));
    if (Number.isFinite(n)) out.add(String(Math.abs(Math.round(n * 100) / 100)));
  }
  return out;
}

// ── Bounded arithmetic (Phase 1 change #4) ───────────────────────────────────────────────────────────
// A number the model derives is legal ONLY when the validator can REPRODUCE it as a same-unit sum or
// difference of two numbers taken from the facts the model itself cited (cited_fact_ids). The validator
// does the arithmetic — the model can't invent a total, it can only surface one we recompute. Scope is
// deliberately interim per the Phase 1 spec: same-unit sum/diff of TWO operands, nothing else (no %, no
// rounding, no conversions, no counting) — those stay hard-rejected exactly as before.

export type NumWithUnit = { v: number; unit: string };

// Unit = the short token immediately after the number ("260 €", "−12 %", "34 °C", "19 km", "+15 min",
// "80 km/h", "3 points"). Unknown/absent → "" (unitless). km/h must be tried before km.
const UNIT_RE = /^\s*(km\/h|°c|€|%|km|min|points?|pts?)(?![\p{L}\d])/iu;

// extractNumbers, but keeping each number's unit — same normalization (dash variants, French thousands
// spaces, magnitude via abs, 2-decimal rounding) so both extractors always agree on the value itself.
export function extractNumbersWithUnits(text: string): NumWithUnit[] {
  const joined = String(text ?? "")
    .replace(/[−–—]/g, "-")
    // Même classe que extractNumbers (espace, U+00A0, U+202F) — écrite en échappements (04/09) : la
    // copie collée ici ne portait que des espaces simples, « 1 439 » en insécable donnait 1 et 439.
    .replace(/(\d)[ \u00a0\u202f](?=\d{3}\b)/g, "$1");
  const out: NumWithUnit[] = [];
  const re = /-?\d+(?:[.,]\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(joined))) {
    const n = Number(m[0].replace(",", "."));
    if (!Number.isFinite(n)) continue;
    const um = joined.slice(re.lastIndex).match(UNIT_RE);
    out.push({ v: Math.abs(Math.round(n * 100) / 100), unit: um ? um[1].toLowerCase() : "" });
  }
  return out;
}

// Can `stated` be reproduced as a±b from two same-unit numbers found in `operandText` (the CITED facts,
// nothing else)? Exact match after the shared 2-decimal rounding — "5" from cited 3+2 passes, "6" from
// the same two is rejected. If the stated number carries an explicit unit it must match the operands'.
export function reproducibleSumDiff(stated: NumWithUnit, operandText: string): { ok: boolean; expr: string | null } {
  const nums = extractNumbersWithUnits(operandText);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i].unit !== nums[j].unit) continue;                       // same-unit operands only
      if (stated.unit && nums[i].unit && stated.unit !== nums[i].unit) continue;
      const a = nums[i].v, b = nums[j].v;
      if (r2(a + b) === stated.v) return { ok: true, expr: `${a}+${b}` };
      if (r2(Math.abs(a - b)) === stated.v) return { ok: true, expr: `|${a}−${b}|` };
    }
  }
  return { ok: false, expr: null };
}

// ── Cohérence d'une COMPARAISON (I4, 04/09 — spec explorer-routage-inversion § 3.7) ─────────────────
// Née d'une réponse réelle (03/09, f10c3e58) : « 1 439 €, contre un CA habituel d'environ 1 533 € pour un
// jeudi — un écart de +70 % vs cette référence ». Chaque nombre existait dans le payload (1 533 = moyenne
// des jeudis, +70 % = résidu du mercredi vs 847 €) : le contrôle d'EXISTENCE laissait passer un
// RÉFÉRENTIEL CROISÉ. Ici on vérifie l'arithmétique que la phrase affirme : deux montants en €, un
// marqueur de comparaison, un écart SIGNÉ en % ⇒ écart ≈ (a − b) / b, dans un sens ou l'autre, à 1 point
// près (les deux côtés sont arrondis). Hors champ (aucun faux rejet possible) : % non signé (une part),
// pas de marqueur, autre chose que deux montants.
const COMPARISON_MARKERS_RE = /\b(contre|au lieu de|vs|par rapport a|versus|habituel|habituelle|habituels)\b/;
export function comparisonInconsistency(sentence: string): { a: number; b: number; stated: number; actual: number } | null {
  const raw = String(sentence ?? "");
  if (!COMPARISON_MARKERS_RE.test(norm(raw))) return null;
  const joined = raw.replace(/[−–—]/g, "-").replace(/(\d)[ \u00a0\u202f](?=\d{3}\b)/g, "$1");
  const euros: number[] = [];
  let signedPct: number | null = null;
  const re = /([+-]?)(\d+(?:[.,]\d+)?)\s*(€|%)/g;
  // Un % signé qui qualifie UN AUTRE sujet que les deux montants (« le panier moyen était en repli
  // (−10 % vs sa base) », mesuré 04/09 sur « Pourquoi le 28/08 ? ») ne se compare pas à eux : on
  // regarde les 45 caractères avant et les 30 après le %, normalisés.
  const OTHER_SUBJECT = /(panier|conversion|visiteur|frequentation|affluence|tickets?|unites?|ventes?\/jour|remise|vs (sa|son|leur) base|sa base|son habituel)/;
  let m: RegExpExecArray | null;
  while ((m = re.exec(joined))) {
    const v = Number(m[2].replace(",", "."));
    if (!Number.isFinite(v)) continue;
    if (m[3] === "€") euros.push(v);
    else if (m[1]) {
      const before = norm(joined.slice(Math.max(0, m.index - 45), m.index));
      const after = norm(joined.slice(re.lastIndex, re.lastIndex + 30));
      if (OTHER_SUBJECT.test(before) || OTHER_SUBJECT.test(after)) continue;
      if (signedPct != null) return null;   // deux % signés : hors champ
      signedPct = (m[1] === "-" ? -1 : 1) * v;
    }
  }
  if (euros.length !== 2 || signedPct == null) return null;
  const [x, y] = euros;
  const xy = y > 0 ? ((x - y) / y) * 100 : null;   // « X contre Y » lu dans l'ordre de la phrase
  const yx = x > 0 ? ((y - x) / x) * 100 : null;   // l'autre sens (« au lieu de » inverse souvent)
  const cands = [xy, yx].filter((c): c is number => c != null);
  if (!cands.length) return null;
  if (cands.some((c) => Math.abs(c - signedPct!) <= 1)) return null;
  return { a: x, b: y, stated: signedPct, actual: xy ?? yx! };
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

// Named entities in a text, article-cleaned. The bare `makeEntityRegex` greedily absorbs a capitalized
// SENTENCE-INITIAL article into the span — "L'écart de CA" (a common-noun phrase) and "La Brasserie Lipp"
// (a real name) both come out article-first. That was harmless under the old "appears anywhere in the
// whole payload" scan but wrong once grounding is checked against ONE cited fact (Phase 1 #6): the phrase
// "L'écart de CA" is in no fact and would false-reject. So: strip a leading French article, then re-extract
// — "L'écart de CA" → "écart de CA" → no entity (common nouns); "La Brasserie Lipp" → "Brasserie Lipp"
// (kept, and grounded by its bare form, which is how facts store the name). A real name never needs the
// article; only a common phrase looked like an entity because the article glued on. Used by the grounded
// DAY validator only — the draft validator keeps its own inline regex use, so its behaviour is unchanged.
export function extractNamedEntities(text: string): string[] {
  const re = makeEntityRegex();
  const out: string[] = [];
  for (const raw of String(text ?? "").match(re) ?? []) {
    const stripped = raw.replace(/^([LD]['’]|(?:Le|La|Les|Un|Une|Des|Du|De)\s+)/, "");
    if (stripped === raw) { out.push(raw); continue; }
    const reScanned = stripped.match(re)?.[0];   // re-extract; a lone/common remainder yields nothing
    if (reScanned) out.push(reScanned);
  }
  return out;
}

// Causal attribution on a fact ("X a causé…") — a claim about the PAST that the measured engines can, in
// principle, support. This is the ONLY group the tiered causal register (Phase 1 #5) may unlock, and only
// on a cited measured/observed_difference fact carrying its tier token.
export const CAUSAL_ATTRIBUTION_PATTERNS = [
  "a cause", "ont cause", "a genere", "ont genere", "a fait baisser", "ont fait baisser",
  "a fait grimper", "a fait chuter", "a reduit la frequentation", "a dope", "a booste",
  "responsable de la baisse", "responsable de la hausse", "explique la baisse", "explique la hausse",
  "a provoque", "a entraine une baisse", "a entraine une hausse", "fait exploser", "grace a la concurrence",
];

// Predicted OUTCOME (a promise about the FUTURE, not grounded advice) — "X augmentera vos ventes".
// NEVER unlockable by a tier: no measured past effect grounds a promise about what will happen. Kept a
// separate group precisely so the #5 relaxation cannot reach it.
export const PREDICTED_OUTCOME_PATTERNS = [
  "augmentera", "augmenteront", "boostera", "boosteront", "dopera", "doperont", "rapportera",
  "rapporteront", "generera", "genereront", "fera grimper", "fera gagner", "permettra de gagner",
  "vous fera gagner", "fera venir", "attirera", "doublera", "augmentera vos", "boostera vos",
];

// The union — UNCHANGED shape and contents. The grounded DRAFT validator consumes this and its behaviour
// must not shift: it scans both groups with no tier carve-out (draft copy is customer-facing; #5 is an
// operator-answer relaxation only). Do not "simplify" the draft validator onto the split groups.
export const CAUSAL_PATTERNS = [...CAUSAL_ATTRIBUTION_PATTERNS, ...PREDICTED_OUTCOME_PATTERNS];

// Split French prose into sentences. The tiered causal register is a PER-SENTENCE property ("this causal
// sentence carries its tier token"), so a blunt whole-text scan cannot express it. Splits after . ! ? …
// only when followed by whitespace, so French decimals/abbreviations inside a number ("1.5") never split.
export function splitSentences(text: string): string[] {
  return String(text ?? "")
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Extra fabricated-outcome phrases specific to DRAFT copy about external entities/attendance.
// ── Registre de verdict des engagements (J2.4, 27/08) ─────────────────────────────────────────
// « prouvé », « écarté », « non concluant », « objectif atteint / manqué » sont des mots de
// VERDICT JUGÉ (lexique l.17 / l.21) : une réponse ne peut les employer que si un fait cité
// porte le MÊME mot. Fabriquer un « effet prouvé » est le mensonge exact qui tuerait la
// confiance dans la mémoire opérationnelle des dispositifs. atteint/manqué ne sont gardés que
// dans une phrase qui parle d'objectif/cible (sinon « il manque 3 jours » serait rejeté).
// Limite assumée : contrôle au niveau du MOT — citer un fait « prouvé » du dispositif A ne
// protège pas d'un abus sur le dispositif B dans la même réponse.
export function verdictRegisterViolations(sentencesNorm: string[], citedFactsNorm: string): string[] {
  const out: string[] = [];
  const missing = (stem: string) => !citedFactsNorm.includes(stem);
  for (const s of sentencesNorm) {
    if (/\bprouv/.test(s) && missing("prouv")) out.push("prouvé");
    if (/\becarte(e|s|es)?\b/.test(s) && missing("ecarte")) out.push("écarté");
    if (/\bnon concluant/.test(s) && missing("non concluant")) out.push("non concluant");
    if (/\b(objectif|cible)s?\b/.test(s)) {
      if (/\batteint/.test(s) && missing("atteint")) out.push("objectif atteint");
      if (/\bmanqu/.test(s) && missing("manqu")) out.push("objectif manqué");
    }
  }
  return [...new Set(out)];
}

export const DRAFT_OUTCOME_PATTERNS = [
  "a guichets fermes", "affiche complet", "affichera complet", "complet depuis", "sold out",
  "des milliers de", "record d'affluence", "record de frequentation", "jamais vu",
];
