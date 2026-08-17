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

  // Fiches par suivi (v2 « Mon positionnement ») : note, avis, audience, fourchette de tarifs.
  const [fiches] = await bq.query({ query: `
    SELECT cd.competitor_name nom, cd.google_rating note, cd.google_rating_count avis,
           cd.primary_audience audience, COALESCE(cd.tarifs_url, cd.source_url) url,
           MIN(h.price_numeric) p_min, MAX(h.price_numeric) p_max, COUNT(DISTINCT h.item_norm) n_tarifs
    FROM \`${P}.raw.competitor_tracking\` ct
    JOIN \`${P}.raw.competitor_directory\` cd ON cd.competitor_id = ct.competitor_id AND cd.deleted_at IS NULL
    LEFT JOIN \`${P}.raw.competitor_offering_history\` h ON h.competitor_id = ct.competitor_id AND h.price_numeric IS NOT NULL
    WHERE ct.location_id = @l AND ct.deleted_at IS NULL
    GROUP BY 1,2,3,4,5`, params: { l: OWNER }, location: "EU" });
  // Votre référence : panier moyen 30 j (référentiel DIT différent — pas comparé aux billets).
  const [[me]] = await bq.query({ query: `
    SELECT ROUND(AVG(daily_avg_basket), 2) basket FROM \`${P}.mart.fct_client_daily_performance\`
    WHERE location_id = @l AND transaction_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)`, params: { l: OWNER }, location: "EU" });

  // Votre audience (profil) — le référent du comparatif « même public que vous ».
  const [[prof]] = await bq.query({ query: `
    SELECT ANY_VALUE(primary_audience_1) a1, ANY_VALUE(primary_audience_2) a2
    FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id = @l`, params: { l: OWNER }, location: "EU" });

  // Faits du DERNIER TEST par dispositif (rejeu : dates, KPI, réalisé vs cible, verdict).
  const [tests] = await bq.query({ query: `
    SELECT bp.practice_id, c.verdict, c.measured_metric, c.kpi_window_value, c.kpi_baseline,
           c.threshold_basis, c.threshold_value, CAST(c.window_start AS STRING) ws, CAST(c.window_end AS STRING) we
    FROM \`${P}.analytics.best_practices\` bp
    JOIN (SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) rn
          FROM \`${P}.analytics.action_commitments\`) c
      ON c.commitment_id = bp.replay_commitment_id AND c.rn = 1
    WHERE bp.status = 'active'`, location: "EU" }).catch(() => [[]]);

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
    fiches: (fiches as any[]).map((r) => ({
      nom: String(flat(r.nom) || ""), note: flat(r.note) != null ? Number(flat(r.note)) : null,
      avis: flat(r.avis) != null ? Number(flat(r.avis)) : null, audience: String(flat(r.audience) || ""),
      url: flat(r.url) ? String(flat(r.url)) : null,
      p_min: flat(r.p_min) != null ? Number(flat(r.p_min)) : null, p_max: flat(r.p_max) != null ? Number(flat(r.p_max)) : null,
      n_tarifs: Number(flat(r.n_tarifs)) || 0,
    })),
    mon_panier: me && flat(me.basket) != null ? Number(flat(me.basket)) : null,
    mon_audience: prof ? { a1: flat(prof.a1), a2: flat(prof.a2) } : {},
    tests: (tests as any[]).map((r) => ({
      practice_id: String(flat(r.practice_id)), verdict: flat(r.verdict), metric: flat(r.measured_metric),
      realized: flat(r.kpi_window_value) != null ? Number(flat(r.kpi_window_value)) : null,
      baseline: flat(r.kpi_baseline) != null ? Number(flat(r.kpi_baseline)) : null,
      basis: flat(r.threshold_basis), value: flat(r.threshold_value) != null ? Number(flat(r.threshold_value)) : null,
      ws: String(flat(r.ws) || ""), we: String(flat(r.we) || ""),
    })),
    site_of: siteName,
  };
  writeFileSync(new URL("../public/piloter-autour-proto-data.js", import.meta.url).pathname,
    "window.AUTOUR_PROTO = " + JSON.stringify(out, null, 1) + ";\n");
  console.log("evts:", out.evts.length, "· veille lieux:", ((out.veille as any).lieux || []).length,
    "· tarifs base:", (out.offres_base as any).n_tarifs, "· cartes:", out.cartes.length,
    "· practices:", out.practices.length, "· learnings:", out.learnings.length, "· equipe:", out.equipe.length);
})();
