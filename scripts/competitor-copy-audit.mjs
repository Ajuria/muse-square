// Audit de COPIE des cartes concurrence — rendu RÉEL (le vrai action-cards.js, les vrais
// payloads candidates du compte owner), pas une lecture de code. Règle maison : citer la
// chaîne rendue. Usage : npx tsx scripts/competitor-copy-audit.mjs
import "dotenv/config";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { makeBQClient } from "../src/lib/bq";
const P = "muse-square-open-data";
const flat = (v) => (v && typeof v === "object" && "value" in v ? v.value : v);
const bq = makeBQClient(process.env.BQ_PROJECT_ID || P);
const OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5";

const [locs] = await bq.query({ query: `SELECT location_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE clerk_user_id = (SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id=@o LIMIT 1)`, params: { o: OWNER }, location: "EU" });
const ids = locs.map(r => String(flat(r.location_id)));
const COMP = ['competition_proximity','high_competition_density','competition_pressure_spike','competitor_threat_direct','competitor_event_launch','competitor_audience_conflict','competitor_review_surge','competitor_review_drop','competitor_hours_change','competitor_new_offering','competitor_sold_out','competitor_price_increase','competitor_price_drop','competitor_offering_removed','competitor_positioning_brief','competitor_positioning_gap','competitor_reputation_strength','competitor_repricing_event','competitor_event_ending','same_bucket_saturation','low_competition_window'];
const [cands] = await bq.query({ query: `SELECT * FROM \`${P}.mart.fct_location_daily_action_candidates\` WHERE location_id IN UNNEST(@locs) AND action_type IN UNNEST(@t) AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 21 DAY) QUALIFY ROW_NUMBER() OVER (PARTITION BY action_type ORDER BY date DESC) = 1 ORDER BY action_type`, params: { locs: ids, t: COMP }, location: "EU" });
const [profs] = await bq.query({ query: `SELECT * FROM \`${P}.semantic.vw_insight_event_location_profile\` WHERE location_id = @o LIMIT 1`, params: { o: OWNER }, location: "EU" }).catch(() => [[]]);
const [days] = await bq.query({ query: `SELECT * FROM \`${P}.semantic.vw_location_context_daily\` WHERE location_id = @o AND date = CURRENT_DATE() LIMIT 1`, params: { o: OWNER }, location: "EU" }).catch(() => [[]]);

const win = new Window({ url: "https://app.local/x" });
const doc = win.document;
doc.body.innerHTML = '<div id="m"></div>';
win.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }), text: () => Promise.resolve("{}") });
for (const m of ["ms-loader.js", "reco-library.js", "action-cards.js"]) {
  new Function("window", "document", "fetch", readFileSync(new URL("../public/" + m, import.meta.url), "utf8"))(win, doc, win.fetch);
}
const deep = (o) => { const r = {}; for (const k in o) r[k] = flat(o[k]); return r; };
const prof = profs.length ? deep(profs[0]) : {};
const day = days.length ? deep(days[0]) : {};
const today = new Date().toISOString().slice(0, 10);

for (const c0 of cands) {
  const c = deep(c0);
  let pl = {};
  try { pl = typeof c.data_payload === "string" ? JSON.parse(c.data_payload) : (c.data_payload || {}); } catch {}
  const cand = { ...c, ...pl, data_payload: pl, date: String(c.date), affected_date: String(c.affected_date || c.date) };
  let entries = [];
  try { entries = win.renderActionCandidates([cand], prof, day, String(cand.date), "veille", {}, today) || []; } catch (e) { console.log("  ERREUR " + e.message); }
  console.log("\n### " + c.action_type + "  (" + String(c.date) + ")");
  if (!entries.length) { console.log("  (aucune entrée rendue — la carte ne tire pas sur sa propre date)"); continue; }
  const e0 = entries[0], tm = e0.tmpl || {};
  console.log("  TITRE  : " + (tm.what || "(vide)"));
  console.log("  FAITS  : " + (tm.sowhat || "(vide)"));
  console.log("  ACTION : " + (tm.action || "(vide)"));
}
console.log("\n" + cands.length + " types concurrence rendus.");
process.exit(0);
