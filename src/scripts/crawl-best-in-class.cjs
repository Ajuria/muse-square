/**
 * crawl-best-in-class.cjs — offline monthly crawl for the "lieux comparables" advice slot.
 *
 * WHAT: for each (industry_code x lever) it web-searches reputable sources for a REAL case study
 * where a comparable venue applied a concrete move on that lever and got a MEASURABLE before->after
 * outcome, then loads validated plays into `analytics.best_in_class_plays`.
 *
 * WHY it exists: the engagement diagnosis panel + the insight "Plan a essayer" cards surface an
 * analog to try ("un lieu comparable a fait X -> a obtenu Y"), never a promised result. Fills the
 * dashed "bientot" slot (card-kit.js) + the track-1 References footer (source_url).
 *
 * DECISIONS (owner, 2026-07-14): monthly refresh (WRITE_TRUNCATE each run) · open web but the prompt
 * DROPS non-reputable sources (forums/content farms/unverifiable/AI listicles) · name the venue ONLY
 * when the source publicly names it; otherwise anonymize. NEVER surfaces another Muse Square user's
 * data — this is external web only.
 *
 * STORE: analytics.best_in_class_plays (mirrors analytics.b_sensitivity_store — script-loaded, read
 * directly by the app, repointable to a mart later). NOT a dbt model.
 *
 * RUN: node src/scripts/crawl-best-in-class.cjs                 (all industries x levers)
 *      INDUSTRIES=live_event LEVERS=conversion node src/scripts/...   (subset, for a fast test)
 *
 * Causal honesty: outcome is reported AS-IS from the source; the model is told never to invent a
 * number. A play with no credible named source + URL is dropped, never surfaced.
 */
require("dotenv").config();
const fs = require("fs");
const os = require("os");
const path = require("path");
const { BigQuery } = require("@google-cloud/bigquery");

const bq = new BigQuery({ projectId: "muse-square-open-data" });
const STORE = "analytics.best_in_class_plays";
const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = "claude-sonnet-4-6"; // web_search role (models.ts) — search + reasoning

// Controlled lever vocabulary — aligned to the reco-library drivers + action families. The engagement
// panel and the insight plan cards map a card's action_type/tag onto ONE of these (see leverForCard).
const LEVER_LABELS = {
  conversion: "convertir l'interet/le trafic en reservations ou ventes",
  panier: "augmenter le panier moyen / la depense par client",
  yield: "optimiser le prix et l'anticipation (early-bird, remplissage de capacite)",
  frequentation: "faire venir plus de monde (frequentation / affluence)",
  fidelisation: "faire revenir les clients (retention / repeat)",
};

// Vertical vocabulary — describes the "comparable venue" to the model so the analog is same-vertical.
const INDUSTRY_LABELS = {
  live_event: "un lieu d'evenementiel live (salle de concert, de spectacle ou d'evenements a jauge)",
  cafe: "un cafe / restaurant de proximite",
};

// Crawl matrix — pipeline-driven, no hardcoded plays. Priority = live_event (the owner's vertical).
const INDUSTRIES = (process.env.INDUSTRIES || "live_event").split(",").map((s) => s.trim()).filter(Boolean);
const LEVERS = (process.env.LEVERS || Object.keys(LEVER_LABELS).join(",")).split(",").map((s) => s.trim()).filter(Boolean);

const SYSTEM = [
  "Tu es un analyste qui documente des cas concrets et VERIFIABLES d'operateurs de lieux, pour inspirer un exploitant francais.",
  "Tu cherches sur le web des etudes de cas reelles ou un lieu comparable a applique un levier precis et a obtenu un resultat MESURABLE (avant -> apres).",
  "Sources acceptees : presse specialisee, etudes de cas publiees, federations/organismes de la filiere, blogs d'operateurs etablis, medias reconnus.",
  "Sources REFUSEES : forums, fermes de contenu SEO, listicles generees, pages sans source identifiable. Si tu ne trouves aucune source credible et nommee avec une URL, renvoie une liste vide.",
  "Ne JAMAIS inventer de chiffre : le resultat doit etre celui rapporte par la source. Si la source ne quantifie pas, formule le resultat qualitativement.",
  "Nommer le lieu UNIQUEMENT si la source le nomme publiquement (etude de cas publique). Sinon, decris-le anonymement ('un lieu comparable ...').",
  "Reponds en francais. Copie sobre, orientee action, sans superlatifs.",
].join(" ");

function userPrompt(industry, lever) {
  const iv = INDUSTRY_LABELS[industry] || industry;
  const lv = LEVER_LABELS[lever] || lever;
  return [
    `Trouve 1 a 2 cas reels ou ${iv} a travaille le levier suivant : ${lv}.`,
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

async function callSearch(industry, lever) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3000,
      system: SYSTEM,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      messages: [{ role: "user", content: userPrompt(industry, lever) }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return text;
}

function extractPlays(text) {
  if (!text) return [];
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let arr;
  try { arr = JSON.parse(text.slice(start, end + 1)); } catch (e) { return []; }
  return Array.isArray(arr) ? arr : [];
}

function clean(s) { return typeof s === "string" ? s.trim() : ""; }

function validate(raw, industry, lever, idx) {
  const move = clean(raw.move);
  const outcome = clean(raw.outcome);
  const src = clean(raw.source_url);
  const srcName = clean(raw.source_name);
  // Honesty gate: a play with no move/outcome or no credible named source is dropped, never surfaced.
  if (!move || !outcome || !src || !srcName || !/^https?:\/\//i.test(src)) return null;
  const steps = Array.isArray(raw.steps) ? raw.steps.map(clean).filter(Boolean).slice(0, 4) : [];
  const conf = ["eleve", "moyen", "faible"].includes(raw.confidence) ? raw.confidence : "faible";
  return {
    play_id: `${industry}:${lever}:${idx}`,
    generated_at: new Date().toISOString(),
    industry_code: industry,
    lever,
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

const SCHEMA = {
  fields: [
    { name: "play_id", type: "STRING" },
    { name: "generated_at", type: "TIMESTAMP" },
    { name: "industry_code", type: "STRING" },
    { name: "lever", type: "STRING" },
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

async function main() {
  if (!API_KEY) { console.error("ANTHROPIC_API_KEY missing (.env)"); process.exit(1); }
  const rows = [];
  for (const industry of INDUSTRIES) {
    for (const lever of LEVERS) {
      process.stdout.write(`crawl ${industry} x ${lever} ... `);
      try {
        const text = await callSearch(industry, lever);
        const raw = extractPlays(text);
        let kept = 0;
        raw.forEach((r, i) => { const v = validate(r, industry, lever, i); if (v) { rows.push(v); kept++; } });
        console.log(`${raw.length} found, ${kept} kept`);
      } catch (e) {
        console.log(`ERR ${e.message}`);
      }
    }
  }
  if (!rows.length) { console.error("no plays kept — nothing loaded"); process.exit(2); }
  const tmp = path.join(os.tmpdir(), `bic_${INDUSTRIES.join("-")}.ndjson`);
  fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join("\n"));
  const [job] = await bq.dataset("analytics").table("best_in_class_plays").load(tmp, {
    sourceFormat: "NEWLINE_DELIMITED_JSON",
    schema: SCHEMA,
    writeDisposition: "WRITE_TRUNCATE",
    location: "EU",
  });
  fs.unlinkSync(tmp);
  console.log(`loaded ${rows.length} plays into ${STORE} (job ${job.id || "ok"})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
