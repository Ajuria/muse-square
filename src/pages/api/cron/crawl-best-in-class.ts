// Cron: demand-drain for the best-in-class "lieux comparables" store — NOT a calendar refresh.
// Bearer CRON_SECRET (mirrors commitment-resolve.ts). Each run crawls at most `n` (default 1, cap 3)
// stale/missing cells, and ONLY for verticals that have ACTIVE commitments (real usage) — a cell is
// stale when missing or older than TTL_DAYS (90). Usually a no-op. Bounded so it fits the serverless
// timeout (each web_search cell ~20-30s). Fire it often (e.g. hourly/daily); it drains any backlog
// gradually and the standalone script (src/scripts/crawl-best-in-class.cjs) does instant full builds.
//
// The crawl CONTRACT (prompt/validate/schema/vocab) is the shared core — no drift with the script.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { modelFor } from "../../../lib/ai/models";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { waitUntil } from "@vercel/functions";
import * as core from "../../../lib/bestInClassCrawlCore.mjs";

export const prerender = false;
const BQ_PROJECT = "muse-square-open-data";
const STORE = "analytics.best_in_class_plays";
const CTX = `${BQ_PROJECT}.semantic.vw_insight_event_ai_location_context`;
const COMMITMENTS = `${BQ_PROJECT}.analytics.action_commitments`;
const CRON_SECRET = process.env.CRON_SECRET || "";
const MODEL = modelFor("web_search"); // web_search role (models.ts)

const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const LEVERS = Object.keys(core.LEVER_LABELS);
const INTENTS = Object.keys(core.INTENT_LABELS);

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

// Verticals with active commitments (real demand) × levers × intents, filtered to cells that are
// missing or older than TTL_DAYS. Same logic as the script's MODE=refresh.
async function staleCells(bq: any, ttlDays: number): Promise<Array<{ industry: string; lever: string; intent: string }>> {
  const [ind] = await bq.query({
    query:
      `SELECT DISTINCT p.client_industry_code AS ind FROM \`${CTX}\` p ` +
      `WHERE p.client_industry_code IS NOT NULL AND p.location_id IN (` +
      `  SELECT DISTINCT location_id FROM \`${COMMITMENTS}\` WHERE status IN ('open','pending','resolved'))`,
    location: "EU",
  });
  const industries = ind.map((r: any) => flat(r.ind)).filter(Boolean);
  let ages: any[] = [];
  try { [ages] = await bq.query({ query: `SELECT industry_code, lever, intent, MAX(generated_at) AS g FROM \`${STORE}\` GROUP BY 1,2,3`, location: "EU" }); } catch (e) { ages = []; }
  const ageMs: Record<string, number> = {};
  ages.forEach((r: any) => { const g = flat(r.g); ageMs[`${flat(r.industry_code)}|${flat(r.lever)}|${flat(r.intent)}`] = g ? new Date(g).getTime() : 0; });
  const now = Date.now();
  const cells: Array<{ industry: string; lever: string; intent: string }> = [];
  for (const industry of industries) for (const lever of LEVERS) for (const intent of INTENTS) {
    const last = ageMs[`${industry}|${lever}|${intent}`];
    if (!last || (now - last) / 86400000 > ttlDays) cells.push({ industry, lever, intent });
  }
  return cells;
}

export const GET: APIRoute = async ({ request, url }) => {
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) return json(401, { ok: false, error: "Unauthorized" });

  const apiKey = process.env.ANTHROPIC_API_KEY || "";
  if (!apiKey) return json(500, { ok: false, error: "ANTHROPIC_API_KEY missing" });

  const n = Math.max(1, Math.min(3, Number(url.searchParams.get("n") || 1)));       // cells this run (bounded for timeout)
  const ttlDays = Number(url.searchParams.get("ttl") || process.env.BIC_TTL_DAYS || 90);
  const nowIso = new Date().toISOString();

  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    // Shuffle before slicing: missing cells tie on age (last=0), so a fixed order would let a
    // permanently-empty cell (honesty-gate: never yields) get re-picked forever and starve the
    // fillable ones. Random pick spreads attempts so the drain always makes progress.
    const all = await staleCells(bq, ttlDays);
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    const cells = all.slice(0, n);
    if (!cells.length) return json(200, { ok: true, drained: 0, note: "all fresh — nothing to crawl" });

    // Crawl (~20-40s/cell via web_search) runs in the BACKGROUND (waitUntil keeps the function alive
    // after the response) so cron.org / any pinger gets a fast 200 instead of a client-side timeout.
    // Mirrors competitor-surveillance.ts. Errors post-response go to logs, not the client.
    waitUntil(crawlAndLoad(bq, cells, apiKey, nowIso));
    return json(200, { ok: true, status: "started", queued: cells.map((c) => `${c.industry}:${c.lever}:${c.intent}`) });
  } catch (err: any) {
    console.error("[api/cron/crawl-best-in-class] Error", err);
    return json(500, { ok: false, error: err?.message ?? "Erreur interne" });
  }
};

// Background: crawl each cell + supersede-load. Supersedes ONLY cells that produced fresh plays —
// a transient empty re-crawl must NOT wipe a cell's existing good plays; attempted-but-empty cells
// are left untouched. Runs after the HTTP response via waitUntil.
async function crawlAndLoad(bq: any, cells: Array<{ industry: string; lever: string; intent: string }>, apiKey: string, nowIso: string): Promise<void> {
  try {
    const rows: any[] = [];
    for (const { industry, lever, intent } of cells) {
      try {
        const text = await core.callSearch(apiKey, MODEL, industry, lever, intent);
        core.extractPlays(text).forEach((r, i) => { const v = core.validate(r, industry, lever, intent, i, nowIso); if (v) rows.push(v); });
      } catch (e: any) { console.error(`[cron/best-in-class] cell ${industry}:${lever}:${intent} failed`, e?.message); }
    }
    if (!rows.length) { console.log("[cron/best-in-class] crawled", cells.length, "cell(s), 0 plays kept"); return; }
    const cellKeys = Array.from(new Set(rows.map((r) => `${r.industry_code}|${r.lever}|${r.intent}`)));
    await bq.query({
      query: `DELETE FROM \`${STORE}\` WHERE CONCAT(industry_code,'|',lever,'|',intent) IN UNNEST(@cells)`,
      params: { cells: cellKeys }, types: { cells: ["STRING"] }, location: "EU",
    });
    const tmp = join(tmpdir(), `bic_cron_${Date.now()}.ndjson`);
    writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join("\n"));
    await bq.dataset("analytics").table("best_in_class_plays").load(tmp, {
      sourceFormat: "NEWLINE_DELIMITED_JSON", schema: core.SCHEMA, writeDisposition: "WRITE_APPEND", location: "EU",
    });
    unlinkSync(tmp);
    console.log("[cron/best-in-class] loaded", rows.length, "plays for", cellKeys.join(", "));
  } catch (err: any) {
    console.error("[cron/best-in-class] crawlAndLoad fatal", err?.message);
  }
}
