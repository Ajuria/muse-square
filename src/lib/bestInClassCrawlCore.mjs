/**
 * bestInClassCrawlCore.cjs — the SINGLE SOURCE for the best-in-class crawl CONTRACT (labels, prompt,
 * validation, schema). Shared by the standalone full-build script (src/scripts/crawl-best-in-class.mjs) AND the demand-drain cron (src/pages/api/cron/crawl-best-in-class.ts, via import — a
 * co-located .d.ts gives it types). Keep both callers in sync by editing HERE only.
 *
 * Pure + portable: no BigQuery / no dotenv / no fs. Uses global fetch (Node 18+ / Vercel). Callers
 * own their own BQ client, credentials, cell selection, and load path.
 *
 * Honesty contract: outcome is reported AS-IS from the source (the model is told never to invent a
 * number); a play with no credible named source + URL is dropped, never surfaced; the venue is named
 * only when the source names it publicly. External web only — never another Muse Square user's data.
 */

// Controlled lever vocabulary — aligned to the reco-library drivers + action families (see
// bestInClassStore.leverForActionType, which maps a card action_type onto ONE of these keys).
const LEVER_LABELS = {
  conversion: "convertir l'interet/le trafic en reservations ou ventes",
  panier: "augmenter le panier moyen / la depense par client",
  yield: "optimiser le prix et l'anticipation (early-bird, remplissage de capacite)",
  frequentation: "faire venir plus de monde (frequentation / affluence)",
  fidelisation: "faire revenir les clients (retention / repeat)",
};

// Vertical vocabulary — describes the "comparable venue" so the analog is same-vertical.
const INDUSTRY_LABELS = {
  live_event: "un lieu d'evenementiel live (salle de concert, de spectacle ou d'evenements a jauge)",
  cafe: "un cafe / restaurant de proximite",
  commercial: "un commerce de proximite / point de vente (retail)",
};

// Intent — chosen by the owner's own result ("Votre action paie-t-elle ?"). Distinct case per intent
// (verdict -> intent map lives in bestInClassStore.intentForState):
//   below goal   -> pivot     : a DIFFERENT move on the same lever that worked (what else to try)
//   aligned/thin -> reinforce : how one AMPLIFIED a working move (how to push it further)
//   above goal   -> scale     : how one SUSTAINED/scaled a winning move (how to make it last/bigger)
const INTENT_LABELS = {
  pivot: "un lieu qui a CHANGE d'approche sur ce levier apres un resultat decevant, et dont le nouveau geste a fonctionne — l'angle est : quoi essayer d'AUTRE",
  reinforce: "un lieu qui a AMPLIFIE un geste qui marchait deja sur ce levier — l'angle est : comment POUSSER PLUS LOIN ce qui marche",
  scale: "un lieu qui a INSTALLE DANS LA DUREE ou ETENDU un geste gagnant sur ce levier — l'angle est : comment PERENNISER / passer a l'echelle",
};

const SYSTEM = [
  "Tu es un analyste qui documente des cas concrets et VERIFIABLES d'operateurs de lieux, pour inspirer un exploitant francais.",
  "Tu cherches sur le web des etudes de cas reelles ou un lieu comparable a applique un levier precis et a obtenu un resultat MESURABLE (avant -> apres).",
  "Sources acceptees : presse specialisee, etudes de cas publiees, federations/organismes de la filiere, blogs d'operateurs etablis, medias reconnus.",
  "Sources REFUSEES : forums, fermes de contenu SEO, listicles generees, pages sans source identifiable. Si tu ne trouves aucune source credible et nommee avec une URL, renvoie une liste vide.",
  "Ne JAMAIS inventer de chiffre : le resultat doit etre celui rapporte par la source. Si la source ne quantifie pas, formule le resultat qualitativement.",
  "Nommer le lieu UNIQUEMENT si la source le nomme publiquement (etude de cas publique). Sinon, decris-le anonymement ('un lieu comparable ...').",
  "Reponds en francais. Copie sobre, orientee action, sans superlatifs.",
].join(" ");

function userPrompt(industry, lever, intent) {
  const iv = INDUSTRY_LABELS[industry] || industry;
  const lv = LEVER_LABELS[lever] || lever;
  const it = INTENT_LABELS[intent] || intent;
  return [
    `Trouve 1 a 2 cas reels ou ${iv} a travaille le levier suivant : ${lv}.`,
    `Cas recherche : ${it}.`,
    "Pour chaque cas, renvoie un objet JSON avec EXACTEMENT ces cles :",
    '{ "title": string (le geste, phrase-titre courte),',
    '  "context": string (le lieu et sa situation, anonymise si besoin),',
    '  "move": string (ce qu\'il a fait, precis — le X),',
    '  "outcome": string (le resultat mesure rapporte par la source — le Y),',
    '  "steps": string[] (2 a 4 etapes concretes pour reproduire),',
    '  "source_name": string (nom de la source), "source_url": string (URL),',
    '  "published_at": string (annee ou date si connue, sinon ""),',
    '  "confidence": "eleve" | "moyen" | "faible" (fiabilite de la source et du chiffre),',
    '  "venue_named": boolean (true seulement si la source nomme publiquement le lieu) }',
    "Renvoie UNIQUEMENT un tableau JSON [ ... ], sans texte autour. Liste vide [] si rien de credible.",
  ].join("\n");
}

// One (industry x lever x intent) web-search call. Returns the model's final text (JSON array inside).
async function callSearch(apiKey, model, industry, lever, intent) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 3000,
      system: SYSTEM,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      messages: [{ role: "user", content: userPrompt(industry, lever, intent) }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

function extractPlays(text) {
  if (!text) return [];
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try { const arr = JSON.parse(text.slice(start, end + 1)); return Array.isArray(arr) ? arr : []; }
  catch (e) { return []; }
}

function clean(s) { return typeof s === "string" ? s.trim() : ""; }

// Honesty gate + normalisation. `nowIso` is injected (callers stamp their own timestamp).
function validate(raw, industry, lever, intent, idx, nowIso) {
  const move = clean(raw.move);
  const outcome = clean(raw.outcome);
  const src = clean(raw.source_url);
  const srcName = clean(raw.source_name);
  if (!move || !outcome || !src || !srcName || !/^https?:\/\//i.test(src)) return null;
  const steps = Array.isArray(raw.steps) ? raw.steps.map(clean).filter(Boolean).slice(0, 4) : [];
  const conf = ["eleve", "moyen", "faible"].includes(raw.confidence) ? raw.confidence : "faible";
  return {
    play_id: `${industry}:${lever}:${intent}:${idx}`,
    generated_at: nowIso,
    industry_code: industry,
    lever,
    intent,
    title: clean(raw.title) || move.slice(0, 80),
    context: clean(raw.context),
    move,
    outcome,
    steps,
    source_name: srcName,
    source_url: src,
    published_at: clean(raw.published_at),
    confidence: conf,
    venue_named: raw.venue_named === true,
  };
}

// BigQuery load schema for analytics.best_in_class_plays (both callers load through this).
const SCHEMA = {
  fields: [
    { name: "play_id", type: "STRING" },
    { name: "generated_at", type: "TIMESTAMP" },
    { name: "industry_code", type: "STRING" },
    { name: "lever", type: "STRING" },
    { name: "intent", type: "STRING" },
    { name: "title", type: "STRING" },
    { name: "context", type: "STRING" },
    { name: "move", type: "STRING" },
    { name: "outcome", type: "STRING" },
    { name: "steps", type: "STRING", mode: "REPEATED" },
    { name: "source_name", type: "STRING" },
    { name: "source_url", type: "STRING" },
    { name: "published_at", type: "STRING" },
    { name: "confidence", type: "STRING" },
    { name: "venue_named", type: "BOOLEAN" },
  ],
};

export { LEVER_LABELS, INDUSTRY_LABELS, INTENT_LABELS, SYSTEM, userPrompt, callSearch, extractPlays, clean, validate, SCHEMA };
