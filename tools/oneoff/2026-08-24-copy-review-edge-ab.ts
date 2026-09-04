// A/B « description crawlée dans le corps de carte » — LECTURE SEULE.
// Rend chaque type DEUX fois par le vrai moteur : profil réel, puis profil dont les champs
// nourrissant userEdge() sont vidés. La différence EST ce que retirerait la suppression.
// Usage : npx tsx tools/oneoff/2026-08-24-copy-review-edge-ab.ts
import "dotenv/config";
import { writeFileSync, readFileSync } from "node:fs";
import { makeBQClient } from "../../src/lib/bq";
import { GET as monitorGET } from "../../src/pages/api/insight/monitor";

const P = "muse-square-open-data";
const OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const strip = (h: any) => String(h == null ? "" : h).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

(async () => {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || P);
  const [rows] = await bq.query({
    query: `SELECT action_type, ANY_VALUE(data_payload HAVING MAX date) AS data_payload,
                   ANY_VALUE(action_priority) AS action_priority, ANY_VALUE(action_category) AS action_category,
                   COUNT(DISTINCT location_id) AS sites
            FROM \`${P}.semantic.vw_insight_event_action_candidates\` GROUP BY action_type`,
    location: "EU",
  });
  const [[u]] = await bq.query({
    query: `SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id=@l LIMIT 1`,
    params: { l: OWNER }, location: "EU",
  });
  const today = new Date().toISOString().slice(0, 10);
  const res = await monitorGET({
    url: new URL(`http://l/api/insight/monitor?location_id=${OWNER}&selected_dates=${today}`),
    locals: { clerk_user_id: String(flat(u.clerk_user_id)), location_id: OWNER, all_location_ids: [OWNER] },
  } as any);
  const j = JSON.parse(await (res as any).text());
  const day = (j.days || []).filter((d: any) => String(d.date) === today)[0] || (j.days || [])[0] || {};

  // Profil SANS les champs qui nourrissent userEdge : crawledDiff/Offering/Desc + evLabel.
  const prof = j.profile || {};
  const profSansEdge = { ...prof, auto_enriched_description: null, business_short_description: null,
                         event_type_1: null, event_type_2: null, event_type_3: null };

  const { Window } = await import("happy-dom");
  const win: any = new Window({ url: "https://app.local/app/insightevent/pulse" });
  new Function("window", "document", readFileSync(new URL("../../public/action-cards.js", import.meta.url), "utf8"))(win, win.document);

  const render = (cand: any, p: any) => {
    try {
      const tm = (win.renderActionCandidates([cand], p, day, today, "veille", {}, today) || [])[0]?.tmpl || {};
      return { corps: strip(tm.sowhat), geste: strip(tm.action) };
    } catch { return { corps: "", geste: "" }; }
  };

  const out: any[] = [];
  for (const r of rows as any[]) {
    const t = String(flat(r.action_type));
    const pl = flat(r.data_payload);
    const cand = { date: today, location_id: OWNER, action_type: t, card_instance_id: "ab-" + t,
      action_priority: Number(flat(r.action_priority) ?? 2), action_category: String(flat(r.action_category) ?? ""),
      confidence_tier: null, suppression_key: null, expires_at: null,
      data_payload: typeof pl === "string" ? JSON.parse(pl) : pl };
    const A = render(cand, prof), B = render(cand, profSansEdge);
    if (A.corps === B.corps && A.geste === B.geste) continue;
    out.push({ action_type: t, sites: Number(flat(r.sites)), avant: A, apres: B,
      perte_corps: A.corps.length - B.corps.length, perte_geste: A.geste.length - B.geste.length });
  }
  out.sort((a, b) => b.sites - a.sites);
  writeFileSync(new URL("../../data/shots/edge-ab.json", import.meta.url).pathname, JSON.stringify(out, null, 1));
  console.log(`types affectés : ${out.length} / ${(rows as any[]).length}\n`);
  for (const o of out) {
    console.log(`── ${o.action_type} · ${o.sites} sites  (−${o.perte_corps} car. corps, −${o.perte_geste} geste)`);
    if (o.perte_corps) { console.log(`   AVANT  ${o.avant.corps}`); console.log(`   APRÈS  ${o.apres.corps || "(vide)"}`); }
    if (o.perte_geste) { console.log(`   AVANT→ ${o.avant.geste}`); console.log(`   APRÈS→ ${o.apres.geste || "(vide)"}`); }
    console.log();
  }
})();
