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
 * INTENT: the analog must fit the owner's own result ("Votre action paie-t-elle ?"). We crawl a
 * distinct case per intent — pivot (below goal: what else to try) / reinforce (aligned: push it
 * further) / scale (above: make it last). The verdict->intent map lives in bestInClassStore.
 *
 * RUN: node src/scripts/crawl-best-in-class.mjs                 (full build — all industries x levers x intents, WRITE_TRUNCATE)
 *      INDUSTRIES=live_event LEVERS=conversion INTENTS=pivot node src/scripts/...   (subset, fast test)
 *      MODE=merge LEVERS=conversion INTENTS=pivot node src/scripts/...   (demand-drain: supersede ONLY these cells)
 *      MODE=refresh node src/scripts/...   (demand-drain: active verticals × stale/missing cells only)
 *
 * Causal honesty: outcome is reported AS-IS from the source; the model is told never to invent a
 * number. A play with no credible named source + URL is dropped, never surfaced.
 */
import "dotenv/config";
import fs from "fs";
import os from "os";
import path from "path";
import { BigQuery } from "@google-cloud/bigquery";
import * as core from "../lib/bestInClassCrawlCore.mjs";

const bq = new BigQuery({ projectId: "muse-square-open-data" });
const STORE = "analytics.best_in_class_plays";
const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = "claude-sonnet-4-6"; // web_search role (models.ts) — search + reasoning

// Crawl CONTRACT (labels, prompt, validate, schema) is the SINGLE SOURCE in bestInClassCrawlCore.mjs,
// shared with the demand-drain cron (src/pages/api/cron/crawl-best-in-class.ts). Edit the contract THERE.
const { LEVER_LABELS, INTENT_LABELS, SCHEMA } = core;
const NOW = new Date().toISOString();

// Crawl matrix — pipeline-driven, no hardcoded plays. Priority = live_event (the owner's vertical).
const INDUSTRIES = (process.env.INDUSTRIES || "live_event").split(",").map((s) => s.trim()).filter(Boolean);
const LEVERS = (process.env.LEVERS || Object.keys(LEVER_LABELS).join(",")).split(",").map((s) => s.trim()).filter(Boolean);
const INTENTS = (process.env.INTENTS || Object.keys(INTENT_LABELS).join(",")).split(",").map((s) => s.trim()).filter(Boolean);

const flat = (v) => (v && typeof v === "object" && "value" in v ? v.value : v);

// Which (industry x lever x intent) cells to crawl this run.
//   MODE=refresh : DEMAND-DRIVEN, not calendar. Only verticals that have ACTIVE commitments (real usage),
//                  and within those only cells MISSING or older than TTL_DAYS (default 90 — case studies
//                  don't rot monthly). This is the answer to "not a monthly scheduler": usually crawls
//                  nothing; fires only where owners are actually acting and the analog has aged out.
//   else         : the explicit env matrix (INDUSTRIES x LEVERS x INTENTS) — full build / targeted test.
async function selectCells(mode) {
  if (mode !== "refresh") {
    const cells = [];
    for (const industry of INDUSTRIES) for (const lever of LEVERS) for (const intent of INTENTS) cells.push({ industry, lever, intent });
    return cells;
  }
  const TTL = Number(process.env.TTL_DAYS || 90);
  const [ind] = await bq.query({
    query:
      `SELECT DISTINCT p.client_industry_code AS ind ` +
      `FROM \`muse-square-open-data.semantic.vw_insight_event_ai_location_context\` p ` +
      `WHERE p.client_industry_code IS NOT NULL AND p.location_id IN (` +
      `  SELECT DISTINCT location_id FROM \`analytics.action_commitments\` WHERE status IN ('open','pending','resolved'))`,
    location: "EU",
  });
  const industries = ind.map((r) => flat(r.ind)).filter(Boolean);
  let ages = [];
  try { [ages] = await bq.query({ query: `SELECT industry_code, lever, intent, MAX(generated_at) AS g FROM \`${STORE}\` GROUP BY 1,2,3`, location: "EU" }); } catch (e) { ages = []; }
  const ageMs = {};
  ages.forEach((r) => { const g = flat(r.g); ageMs[`${flat(r.industry_code)}|${flat(r.lever)}|${flat(r.intent)}`] = g ? new Date(g).getTime() : 0; });
  const now = Date.now();
  const cells = [];
  for (const industry of industries) for (const lever of LEVERS) for (const intent of INTENTS) {
    const last = ageMs[`${industry}|${lever}|${intent}`];
    if (!last || (now - last) / 86400000 > TTL) cells.push({ industry, lever, intent });
  }
  console.log(`refresh: ${industries.length} active vertical(s), ${cells.length} stale/missing cell(s) (TTL ${TTL}d)`);
  return cells;
}

async function main() {
  if (!API_KEY) { console.error("ANTHROPIC_API_KEY missing (.env)"); process.exit(1); }
  const MODE = process.env.MODE || "full"; // full = WRITE_TRUNCATE (whole rebuild); merge/refresh = supersede only the crawled cells
  const cells = await selectCells(MODE);
  if (!cells.length) { console.log("nothing to crawl (all fresh)"); return; }
  const rows = [];
  for (const { industry, lever, intent } of cells) {
    process.stdout.write(`crawl ${industry} x ${lever} x ${intent} ... `);
    try {
      const text = await core.callSearch(API_KEY, MODEL, industry, lever, intent);
      const raw = core.extractPlays(text);
      let kept = 0;
      raw.forEach((r, i) => { const v = core.validate(r, industry, lever, intent, i, NOW); if (v) { rows.push(v); kept++; } });
      console.log(`${raw.length} found, ${kept} kept`);
    } catch (e) {
      console.log(`ERR ${e.message}`);
    }
  }
  if (!rows.length) { console.error("no plays kept — nothing loaded"); process.exit(2); }
  const tmp = path.join(os.tmpdir(), `bic_${INDUSTRIES.join("-")}.ndjson`);
  fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join("\n"));
  const table = bq.dataset("analytics").table("best_in_class_plays");
  const supersede = MODE === "merge" || MODE === "refresh"; // both write only the crawled cells
  if (supersede) {
    // Ensure the table exists, then delete-supersede ONLY the cells we just recrawled — other cells
    // (levers/intents not in this run) are untouched. Then append the fresh rows.
    const BQT = { STRING: "STRING", TIMESTAMP: "TIMESTAMP", BOOLEAN: "BOOL" };
    const ddl = SCHEMA.fields.map((f) => `${f.name} ${f.mode === "REPEATED" ? "ARRAY<" + (BQT[f.type] || f.type) + ">" : (BQT[f.type] || f.type)}`).join(", ");
    await bq.query({ query: `CREATE TABLE IF NOT EXISTS \`${STORE}\` (${ddl})`, location: "EU" });
    const cells = Array.from(new Set(rows.map((r) => `${r.industry_code}|${r.lever}|${r.intent}`)));
    await bq.query({
      query: `DELETE FROM \`${STORE}\` WHERE CONCAT(industry_code,'|',lever,'|',intent) IN UNNEST(@cells)`,
      params: { cells }, types: { cells: ["STRING"] }, location: "EU",
    });
  }
  const [job] = await table.load(tmp, {
    sourceFormat: "NEWLINE_DELIMITED_JSON",
    schema: SCHEMA,
    writeDisposition: supersede ? "WRITE_APPEND" : "WRITE_TRUNCATE",
    location: "EU",
  });
  fs.unlinkSync(tmp);
  console.log(`[${MODE}] loaded ${rows.length} plays into ${STORE} (job ${job.id || "ok"})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
