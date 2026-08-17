// Harnais proto « Autour de vous réorganisé » (17/08 — Compétitivité / Processus métiers).
// LECTURE SEULE. Capture le payload dashboard réel + le score de conflit du mart (le payload
// ne le portait pas) → public/piloter-autour-proto-data.js. Chaque carte de la maquette
// s'affiche OUVERTE avec ces données.
// Usage : npx tsx scripts/piloter-autour-proto-harness.ts
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { makeBQClient } from "../src/lib/bq";
import { GET as dashGET } from "../src/pages/api/insight/dashboard";

const P = "muse-square-open-data";
const OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

(async () => {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || P);
  const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id = @l LIMIT 1`, params: { l: OWNER }, location: "EU" });
  const uid = String(flat(u.clerk_user_id));
  const [locRows] = await bq.query({ query: `SELECT DISTINCT location_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE clerk_user_id = @u`, params: { u: uid }, location: "EU" });
  const locs = (locRows as any[]).map((r) => String(flat(r.location_id)));
  const locals = { clerk_user_id: uid, location_id: OWNER, all_location_ids: locs };
  const res = await dashGET({ url: new URL("http://l/api/insight/dashboard?period=365"), locals } as any);
  const j = JSON.parse(await (res as any).text());
  const g = j.glance || {};

  // Score de conflit RÉEL (fct_competitor_events_conflicts — industry+audience+date+proximité).
  const [ev] = await bq.query({ query: `
    SELECT location_id, CAST(event_date AS STRING) d, event_name, venue_name,
           ROUND(distance_from_location_m) m, conflict_score
    FROM \`${P}.mart.fct_competitor_events_conflicts\`
    WHERE location_id IN UNNEST(@locs)
      AND event_date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 14 DAY)
    ORDER BY conflict_score DESC, event_date LIMIT 14`, params: { locs }, location: "EU" });

  // Libellés sites.
  const [ln] = await bq.query({ query: `SELECT location_id, ANY_VALUE(company_name) nom FROM \`${P}.raw.insight_event_user_location_profile\` GROUP BY 1`, location: "EU" });
  const siteName: Record<string, string> = {};
  for (const r of ln as any[]) siteName[String(flat(r.location_id))] = String(flat(r.nom) || "");

  const out = {
    captured_at: new Date().toISOString(),
    evts: (ev as any[]).map((r) => ({
      site: siteName[String(flat(r.location_id))] || "", d: String(flat(r.d)),
      nom: String(flat(r.event_name) || ""), lieu: String(flat(r.venue_name) || ""),
      m: flat(r.m) != null ? Number(flat(r.m)) : null, score: Number(flat(r.conflict_score)) || 0,
    })),
    veille: g.veille || {}, offres: g.offres || [], offres_base: g.offres_base || {},
    trous: g.trous || [], cartes: g.cartes || [], par_site: g.par_site || [],
    occasions: j.occasions || {}, practices: j.practices || [], learnings: j.learnings || [],
    equipe: j.equipe || [], automated: j.automated || {},
    mesures: g.mesures || [],
    site_of: siteName,
  };
  writeFileSync(new URL("../public/piloter-autour-proto-data.js", import.meta.url).pathname,
    "window.AUTOUR_PROTO = " + JSON.stringify(out, null, 1) + ";\n");
  console.log("evts:", out.evts.length, "· veille lieux:", ((out.veille as any).lieux || []).length,
    "· tarifs base:", (out.offres_base as any).n_tarifs, "· cartes:", out.cartes.length,
    "· practices:", out.practices.length, "· learnings:", out.learnings.length, "· equipe:", out.equipe.length);
})();
