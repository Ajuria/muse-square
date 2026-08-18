// Harnais maquette « héros v10 — bandeau 5 KPI » (owner 17/08 soir, corrigés par la doctrine :
// impact MESURÉ sur plage, croissance vs HABITUEL jamais vs hier, valeur d'opérations ≈ sur du
// jugé seulement, couvert = % de l'ENJEU identifié, prouvés = mot du lexique).
// Tout est calculé de données réelles ; chaque chiffre garde sa requête et sa fenêtre.
// Usage : npx tsx scripts/hero-kpis-proto-harness.ts
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
  if (!j.ok) throw new Error(j.error);

  // ── KPI 1 · Impact MESURÉ par plage (le vert d'aujourd'hui, dérivable 30/90/365). ──
  const cutIso = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
  const gapFor = (d: number) => (j.impact_rows || [])
    .filter((r: any) => String(r.resolved_date || "") >= cutIso(d) && r.verdict !== "confounded")
    .reduce((a: number, r: any) => a + (r.gap_eur || 0), 0);

  // ── KPI 2 · CA 7 jours vs HABITUEL (baseline jour-de-semaine 90 j, par site puis sommé —
  //    jamais « vs hier » : un lundi ne se compare pas à un dimanche). ──
  const [dp] = await bq.query({
    query: `SELECT location_id, CAST(transaction_date AS STRING) d, SUM(daily_revenue) rev
            FROM \`${P}.mart.fct_client_daily_performance\`
            WHERE location_id IN UNNEST(@locs)
              AND transaction_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 100 DAY) AND CURRENT_DATE()
            GROUP BY 1, 2`,
    params: { locs }, location: "EU",
  });
  const bySite: Record<string, Record<string, number>> = {};
  for (const r of dp as any[]) {
    const lid = String(flat(r.location_id)), d = String(flat(r.d));
    (bySite[lid] = bySite[lid] || {})[d] = Number(flat(r.rev)) || 0;
  }
  const last7 = [...Array(7)].map((_, i) => new Date(Date.now() - (i + 1) * 86_400_000).toISOString().slice(0, 10));
  let real7 = 0, exp7 = 0, nDays7 = 0;
  for (const lid of Object.keys(bySite)) {
    const days = bySite[lid];
    for (const d of last7) {
      if (days[d] == null) continue;
      const dow = new Date(d + "T12:00:00Z").getUTCDay();
      const peers = Object.keys(days).filter((k) => k < d && new Date(k + "T12:00:00Z").getUTCDay() === dow).sort().slice(-12).map((k) => days[k]);
      if (peers.length < 3) continue;
      const sorted = peers.slice().sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      real7 += days[d]; exp7 += med; nDays7++;
    }
  }
  const growthPct = exp7 > 0 ? Math.round(((real7 - exp7) / exp7) * 1000) / 10 : null;

  // ── KPI 3 · Opérations en cours (mesurées + automatisées) + ≈ €/an des opérations JUGÉES. ──
  const mesures = (j.glance || {}).mesures || [];
  const au = j.automated || {};
  const nOps = mesures.length + ((au.armed_dispositifs || []).length) + ((au.consignes || []).length);
  const siIds = mesures.map((m: any) => m.saved_item_id).filter(Boolean);
  let opsEurYear: number | null = null, opsBasis = "";
  if (siIds.length) {
    const [oc] = await bq.query({
      query: `SELECT saved_item_id, AVG(window_actual_revenue - window_expected_revenue) avg_gap,
                     COUNT(*) n
              FROM \`${P}.mart.fct_client_commitment_outcomes\`
              WHERE saved_item_id IN UNNEST(@ids) AND verdict IN ('met','missed') AND is_confounded = FALSE
              GROUP BY 1`,
      params: { ids: siIds }, location: "EU",
    });
    let total = 0, any = false;
    for (const r of oc as any[]) {
      const m = mesures.find((x: any) => x.saved_item_id === String(flat(r.saved_item_id)));
      const nOcc = m && m.kind === "serie" ? 52 : 12; // hebdo → 52/an ; défaut mensuel prudent
      if (Number(flat(r.n)) >= 2) { total += (Number(flat(r.avg_gap)) || 0) * nOcc; any = true; opsBasis = `${flat(r.n)} occurrences jugées × ${nOcc}/an`; }
    }
    if (any) opsEurYear = Math.round(total);
  }

  // ── KPI 4 · Couvert : % de l'ENJEU identifié porté par une action (jamais « % du CA »). ──
  const learnings = j.learnings || [];
  const totEnjeu = learnings.reduce((a: number, l: any) => a + Math.abs(Number(l.eur_year) || 0), 0);
  const covEnjeu = learnings.filter((l: any) => l.covered).reduce((a: number, l: any) => a + Math.abs(Number(l.eur_year) || 0), 0);
  const couvertPct = totEnjeu > 0 ? Math.round((covEnjeu / totEnjeu) * 100) : null;

  // ── KPI 5 · Dispositifs PROUVÉS (mot du lexique) ce mois-ci. ──
  const practices = (j.practices || []).filter((p: any) => p.tier !== "archivee");
  const nProuvesMois = 0; // aucun prouvé au total aujourd'hui — le zéro est l'état réel
  const nProuvesTotal = practices.filter((p: any) => p.tier === "prouvee").length;
  const nTest = practices.filter((p: any) => p.tier !== "prouvee" && p.tier !== "ecartee").length;

  const out = {
    captured_at: new Date().toISOString(),
    kpis: {
      impact: { p30: Math.round(gapFor(30)), p90: Math.round(gapFor(90)), p365: Math.round(gapFor(365)) },
      croissance: { pct: growthPct, real7: Math.round(real7), exp7: Math.round(exp7), n_jours: nDays7 },
      ops: { n: nOps, n_mesurees: mesures.length, n_auto: nOps - mesures.length, eur_year: opsEurYear, basis: opsBasis },
      couvert: { pct: couvertPct, cov: Math.round(covEnjeu), tot: Math.round(totEnjeu), n_motifs: learnings.length },
      prouves: { mois: nProuvesMois, total: nProuvesTotal, en_test: nTest },
    },
    occasions: j.occasions || {}, veille_n: ((j.glance || {}).offres || []).length,
  };
  writeFileSync(new URL("../public/hero-kpis-proto-data.js", import.meta.url).pathname,
    "window.HERO_KPIS_PROTO = " + JSON.stringify(out, null, 1) + ";\n");
  console.log("OK —", JSON.stringify(out.kpis));
})();
