// COMPLÉMENT — cycle de vie événement (src/lib/eventLifecycleCards.ts), 4 types.
// Un seul tire sur le parc aujourd'hui ; les 3 autres portent une copie écrite qu'on rend
// avec un payload RECONSTRUIT depuis leurs propres appels push() — marqué comme tel.
// LECTURE SEULE. Usage : npx tsx scripts/copy-review-lifecycle.ts
import "dotenv/config";
import { writeFileSync, readFileSync } from "node:fs";
import { makeBQClient } from "../src/lib/bq";
import { buildEventLifecycleCards } from "../src/lib/eventLifecycleCards";
import { GET as monitorGET } from "../src/pages/api/insight/monitor";

const P = "muse-square-open-data";
const OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const strip = (h: any) => String(h == null ? "" : h).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

(async () => {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || P);
  const today = new Date().toISOString().slice(0, 10);
  const [[u]] = await bq.query({
    query: `SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id = @l LIMIT 1`,
    params: { l: OWNER }, location: "EU",
  });
  const uid = String(flat(u.clerk_user_id));

  const real = await buildEventLifecycleCards(bq, OWNER, uid, today);
  const byType = new Map<string, any>(real.map((c: any) => [String(c.action_type), c]));
  console.log("payloads réels :", [...byType.keys()].join(", ") || "(aucun)");

  // Base commune, prise du payload réel — les 3 types manquants ajoutent leurs propres champs.
  const seed = byType.get("event_prepare");
  const base = seed ? JSON.parse(seed.data_payload) : {};
  const RECON: Record<string, any> = {
    event_measure: { ...base, occurrence_date: today, measured_pending: true },
    event_decision_due: { ...base, decision_date: today },
    event_threat: { ...base, weather_label_fr: "Fortes pluies", lvl_max: 3 },
  };

  const res = await monitorGET({
    url: new URL(`http://l/api/insight/monitor?location_id=${OWNER}&selected_dates=${today}`),
    locals: { clerk_user_id: uid, location_id: OWNER, all_location_ids: [OWNER] },
  } as any);
  const j = JSON.parse(await (res as any).text());
  const day = (j.days || []).filter((d: any) => String(d.date) === today)[0] || (j.days || [])[0] || {};

  const { Window } = await import("happy-dom");
  const win: any = new Window({ url: "https://app.local/app/insightevent/pulse" });
  new Function("window", "document", readFileSync(new URL("../public/action-cards.js", import.meta.url), "utf8"))(win, win.document);

  const out: any[] = [];
  for (const t of ["event_prepare", "event_measure", "event_decision_due", "event_threat"]) {
    const hit = byType.get(t);
    const payload = hit ? JSON.parse(hit.data_payload) : RECON[t];
    const cand = {
      date: today, location_id: OWNER, action_type: t, card_instance_id: `review-${t}`,
      action_priority: hit?.action_priority ?? 80, action_category: "evenement",
      confidence_tier: null, suppression_key: null, expires_at: null, data_payload: payload,
    };
    let tm: any = {}, err: string | null = null;
    try { tm = (win.renderActionCandidates([cand], j.profile || {}, day, today, "veille", {}, today) || [])[0]?.tmpl || {}; }
    catch (e: any) { err = e?.message || String(e); }
    out.push({
      famille: "cycle de vie événement", action_type: t,
      payload_source: hit ? "réel" : "reconstruit",
      titre: strip(tm.what), corps: strip(tm.sowhat), geste: strip(tm.action), erreur: err,
    });
    console.log(`\n<${t}> payload ${hit ? "RÉEL" : "RECONSTRUIT"}${err ? "  ⚠ " + err : ""}`);
    console.log(`   T: ${strip(tm.what)}`);
    console.log(`   C: ${strip(tm.sowhat)}`);
    console.log(`   G: ${strip(tm.action)}`);
  }
  writeFileSync(new URL("../shots/copy-review-lifecycle.json", import.meta.url).pathname, JSON.stringify(out, null, 1));
  console.log("\nécrit: shots/copy-review-lifecycle.json");
})();
