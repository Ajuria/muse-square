// Harnais proto Tableau de bord (NON COMMITTÉ — support de public/tableau-proto.html).
// Capture le payload RÉEL du compte owner (site gabarit f10c3e58…) via le VRAI handler
// GET /api/insight/dashboard, pour les 3 périodes, + les deux agrégats correctifs :
//   (a) lignes mart avec resolved_date → preuve que 30/90 se DÉRIVENT du fetch 365 ;
//   (b) comptes best_practices par statut SANS LIMIT 20 → registre non plafonné.
// Lecture seule. Usage : npx tsx scripts/tableau-proto-harness.ts
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { makeBQClient } from "../src/lib/bq";
import { GET as dashGET } from "../src/pages/api/insight/dashboard";

const PROJECT = "muse-square-open-data";
const OWNER_LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const str_ = (v: any): string | null => (flat(v) == null ? null : String(flat(v)));

(async () => {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);

  // 1. Compte owner : uid + tous ses sites (profil par clerk_user_id, comme le middleware).
  const [uidRows] = await bq.query({
    query: `SELECT clerk_user_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE location_id = @loc LIMIT 1`,
    params: { loc: OWNER_LOC }, location: "EU",
  });
  const uid = String(flat((uidRows as any[])[0]?.clerk_user_id) || "");
  if (!uid) throw new Error("clerk_user_id introuvable pour le site owner");
  const [locRows] = await bq.query({
    query: `SELECT DISTINCT location_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE clerk_user_id = @u`,
    params: { u: uid }, location: "EU",
  });
  const allLocs = (locRows as any[]).map((r) => String(flat(r.location_id)));
  console.log(`compte owner : ${allLocs.length} site(s)`);

  const locals: any = { clerk_user_id: uid, all_location_ids: allLocs };
  const payloads: Record<string, any> = {};
  for (const p of [30, 90, 365]) {
    const t0 = Date.now();
    const res: any = await (dashGET as any)({ url: new URL(`http://l/api/insight/dashboard?period=${p}`), locals });
    payloads[String(p)] = JSON.parse(await res.text());
    console.log(`period=${p} : ${Date.now() - t0} ms · ok=${payloads[String(p)].ok}`);
    if (!payloads[String(p)].ok) throw new Error(`payload ${p} en erreur : ${payloads[String(p)].error}`);
  }

  // (a) mart avec resolved_date sur 365 j — pour dériver 30/90 côté client.
  const [martRows] = await bq.query({
    query: `SELECT commitment_id, verdict, CAST(resolved_date AS STRING) AS resolved_date,
                   ROUND(window_actual_revenue - window_expected_revenue, 0) AS gap_eur
            FROM \`${PROJECT}.mart.fct_client_commitment_outcomes\`
            WHERE location_id IN UNNEST(@locs)
              AND resolved_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)`,
    params: { locs: allLocs }, location: "EU",
  });
  const mart365 = (martRows as any[]).map((r) => ({
    commitment_id: String(flat(r.commitment_id)), verdict: flat(r.verdict) == null ? null : String(flat(r.verdict)),
    resolved_date: String(flat(r.resolved_date)), gap_eur: flat(r.gap_eur) == null ? null : Number(flat(r.gap_eur)),
  }));

  // Preuve de dérivation : pour chaque période, somme dérivée du 365 == payload réel.
  const today = new Date().toISOString().slice(0, 10);
  for (const p of [30, 90, 365]) {
    const cut = new Date(Date.parse(today + "T12:00:00Z") - p * 86_400_000).toISOString().slice(0, 10);
    const rows = mart365.filter((r) => r.resolved_date >= cut && r.verdict !== "confounded");
    const derived = rows.length ? rows.reduce((a, r) => a + (r.gap_eur ?? 0), 0) : null;
    const real = payloads[String(p)].impact.gap_eur;
    const realN = payloads[String(p)].impact.eur_windows;
    console.log(`dérivation ${p} j : dérivé ${derived} € / ${rows.length} fen. — réel ${real} € / ${realN} fen. ${derived === real && rows.length === realN ? "OK" : "ÉCART"}`);
  }

  // (b) comptes best_practices par statut, sans LIMIT.
  const [bpCounts] = await bq.query({
    query: `SELECT status, COUNT(*) AS n, COUNTIF(replay_commitment_id IS NOT NULL) AS n_replay
            FROM \`${PROJECT}.analytics.best_practices\` WHERE location_id IN UNNEST(@locs) GROUP BY 1`,
    params: { locs: allLocs }, location: "EU",
  });
  const practiceCounts = (bpCounts as any[]).map((r) => ({ status: String(flat(r.status)), n: Number(flat(r.n)), n_replay: Number(flat(r.n_replay)) }));
  console.log("best_practices (sans LIMIT) :", JSON.stringify(practiceCounts));

  // (c) tier RÉEL par pratique (registre canonique de bestPractices.ts : prouvée ssi le
  // rejeu a verdict 'met' au dernier état, tiebreak canonique) — pour le mode « après ».
  const [tierRows] = await bq.query({
    query: `SELECT bp.practice_id, bp.status AS bp_status, c.status AS replay_status, c.verdict AS replay_verdict
            FROM \`${PROJECT}.analytics.best_practices\` bp
            LEFT JOIN (
              SELECT commitment_id, status, verdict,
                     ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC, CASE WHEN status IN ('resolved', 'cancelled') THEN 1 ELSE 0 END DESC, (verdict IS NOT NULL) DESC, created_at DESC) AS rn
              FROM \`${PROJECT}.analytics.action_commitments\`
            ) c ON c.commitment_id = bp.replay_commitment_id AND c.rn = 1
            WHERE bp.location_id IN UNNEST(@locs)`,
    params: { locs: allLocs }, location: "EU",
  });
  const practiceTiers = (tierRows as any[]).map((r) => ({
    practice_id: String(flat(r.practice_id)), bp_status: String(flat(r.bp_status)),
    replay_status: flat(r.replay_status) == null ? null : String(flat(r.replay_status)),
    replay_verdict: flat(r.replay_verdict) == null ? null : String(flat(r.replay_verdict)),
  }));
  console.log("tiers réels :", JSON.stringify(practiceTiers));

  // (d) journal des engagements au dernier état + gap € du mart — pour « dernier verdict »,
  // le score de série (occurrences passées) et la fusion des personnes (proto v2).
  const [jrnRows] = await bq.query({
    query: `WITH latest AS (
              SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC, CASE WHEN status IN ('resolved', 'cancelled') THEN 1 ELSE 0 END DESC, (verdict IS NOT NULL) DESC, created_at DESC) AS rn
              FROM \`${PROJECT}.analytics.action_commitments\` WHERE location_id IN UNNEST(@locs)
            )
            SELECT l.commitment_id, l.location_id, l.status, l.verdict, l.owner_person_name,
                   l.committed_action_text, l.saved_item_id, l.origin_action_type,
                   CAST(l.window_start AS STRING) AS ws, CAST(l.window_end AS STRING) AS we,
                   m.gap_eur, CAST(m.resolved_date AS STRING) AS resolved_date
            FROM latest l
            LEFT JOIN (SELECT commitment_id, ROUND(window_actual_revenue - window_expected_revenue, 0) AS gap_eur, resolved_date
                       FROM \`${PROJECT}.mart.fct_client_commitment_outcomes\` WHERE location_id IN UNNEST(@locs)) m
              USING (commitment_id)
            WHERE l.rn = 1`,
    params: { locs: allLocs }, location: "EU",
  });
  const journal = (jrnRows as any[]).map((r) => ({
    commitment_id: String(flat(r.commitment_id)), location_id: String(flat(r.location_id)),
    status: str_(r.status), verdict: str_(r.verdict), owner: str_(r.owner_person_name),
    text: str_(r.committed_action_text), saved_item_id: str_(r.saved_item_id), origin: str_(r.origin_action_type),
    ws: str_(r.ws), we: str_(r.we),
    gap_eur: flat(r.gap_eur) == null ? null : Number(flat(r.gap_eur)), resolved_date: str_(r.resolved_date),
  }));
  console.log(`journal : ${journal.length} engagements (${journal.filter((c) => c.verdict).length} avec verdict)`);

  // (e) moat proto : jours chauds RÉELS par site (30 j, pour « occasions jouées/manquées »),
  // profondeur des ventes mesurées, et le store €/jour de classe (méthodo enjeu de l'app).
  const [hotRows] = await bq.query({
    query: `SELECT location_id, CAST(DATE(date) AS STRING) AS d
            FROM \`${PROJECT}.semantic.vw_insight_event_day_surface\`
            WHERE location_id IN UNNEST(@locs) AND lvl_heat >= 3
              AND DATE(date) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) AND CURRENT_DATE()
            ORDER BY d`,
    params: { locs: allLocs }, location: "EU",
  });
  const hotDays = (hotRows as any[]).map((r) => ({ location_id: String(flat(r.location_id)), d: String(flat(r.d)) }));
  const [depthRows] = await bq.query({
    query: `SELECT location_id, COUNT(DISTINCT transaction_date) AS n_days,
                   CAST(MIN(transaction_date) AS STRING) AS mn, CAST(MAX(transaction_date) AS STRING) AS mx
            FROM \`${PROJECT}.raw.client_transactions\` WHERE location_id IN UNNEST(@locs) GROUP BY 1`,
    params: { locs: allLocs }, location: "EU",
  });
  const salesDepth = (depthRows as any[]).map((r) => ({
    location_id: String(flat(r.location_id)), n_days: Number(flat(r.n_days)),
    mn: str_(r.mn), mx: str_(r.mx),
  }));
  const [dcRows] = await bq.query({
    query: `SELECT location_id, class_key, family, n_days, ROUND(avg_gap_eur, 0) AS avg_gap_eur
            FROM \`${PROJECT}.analytics.day_class_impacts\` WHERE location_id IN UNNEST(@locs)`,
    params: { locs: allLocs }, location: "EU",
  });
  const dayClassStore = (dcRows as any[]).map((r) => ({
    location_id: String(flat(r.location_id)), class_key: str_(r.class_key), family: str_(r.family),
    n_days: Number(flat(r.n_days)), avg_gap_eur: flat(r.avg_gap_eur) == null ? null : Number(flat(r.avg_gap_eur)),
  }));
  console.log(`jours chauds 30 j : ${hotDays.length} · profondeur ventes : ${JSON.stringify(salesDepth.map((x) => x.n_days))} · store classes : ${dayClassStore.length} lignes`);
  console.log("classes chaleur :", JSON.stringify(dayClassStore.filter((x) => /heat|chaleur|hot/i.test(String(x.class_key)))));

  const out = { captured_at: new Date().toISOString(), today, payloads, mart365, practiceCounts, practiceTiers, journal, hotDays, salesDepth, dayClassStore };
  const dest = new URL("../public/tableau-proto-data.js", import.meta.url).pathname;
  writeFileSync(dest, "window.TB_PROTO = " + JSON.stringify(out, null, 1) + ";\n");
  console.log("écrit :", dest);
})();
