// Harnais proto PILOTER (NON COMMITTÉ). LECTURE SEULE.
// Capture les données RÉELLES du compte owner dans la HIÉRARCHIE VALIDÉE par l'owner (11/08) :
//   1. CE QUE JE DÉCIDE AUJOURD'HUI — opérations en cours qui dérivent + résultats à documenter
//      (le seul bloc avec des boutons) ;
//   2. CE QUI ME TOMBE DESSUS — menaces datées TRADUITES EN IMPACT SUR MES JOURS
//      (mon CA habituel ce jour-là, mes opérations ce jour-là, la météo en MOTS) ;
//   3. CE QUI ME MANQUE — savoir à déclarer + LE NOMBRE de ce que ça débloque ;
//   4. MA COUVERTURE — veille, PAR SITE (l'agrégat 4/5 cachait le vrai trou).
// Usage : npx tsx scripts/piloter-proto-harness.ts
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { makeBQClient } from "../src/lib/bq";

const PROJECT = "muse-square-open-data";
const OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const rows = (r: any[]) => r.map((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, flat(v)])));

(async () => {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
  const [uidRows] = await bq.query({
    query: `SELECT clerk_user_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE location_id = @l LIMIT 1`,
    params: { l: OWNER }, location: "EU",
  });
  const uid = String(flat((uidRows as any[])[0]?.clerk_user_id) || "");
  const [locRows] = await bq.query({
    query: `SELECT DISTINCT location_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE clerk_user_id = @u`,
    params: { u: uid }, location: "EU",
  });
  const locs = (locRows as any[]).map((r) => String(flat(r.location_id)));
  const P = { l: locs };
  const t0 = Date.now();

  const [
    [sites], [ouverts], [tendance], [aDocumenter], [monJour], [menacesEvts], [mesOccurrences],
    [couvertureSite], [trousSite], [crawl], [savoir], [ventes], [offres], [offresBase], [cartes],
  ] = await Promise.all([
    bq.query({ query: `SELECT location_id, ANY_VALUE(COALESCE(site_name, company_name)) AS label FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE location_id IN UNNEST(@l) GROUP BY 1`, params: P, location: "EU" }),

    // ── 1. DÉCIDER : opérations en cours ───────────────────────────────────
    bq.query({
      query: `WITH latest AS (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC, CASE WHEN status IN ('resolved','cancelled') THEN 1 ELSE 0 END DESC, (verdict IS NOT NULL) DESC, created_at DESC) AS rn
                FROM \`${PROJECT}.analytics.action_commitments\` WHERE location_id IN UNNEST(@l))
              SELECT l.commitment_id, l.location_id, l.committed_action_text, l.owner_person_name,
                     CAST(l.window_start AS STRING) AS ws, CAST(l.window_end AS STRING) AS we,
                     l.threshold_value, l.measured_metric, l.saved_item_id, l.origin_action_type,
                     DATE_DIFF(l.window_end, CURRENT_DATE(), DAY) AS jours_restants,
                     si.title AS event_title, si.kpi_family
              FROM latest l
              LEFT JOIN \`${PROJECT}.raw.saved_items\` si ON si.saved_item_id = l.saved_item_id
              WHERE l.rn = 1 AND l.status IN ('open','pending')`,
      params: P, location: "EU",
    }),
    // Tendance sur la partie ÉCOULÉE de chaque fenêtre ouverte — DANS LA MÉTRIQUE DÉCLARÉE
    // de l'engagement, jamais le CA total en dur. Preuve du piège (13/08, engagement résolu
    // 427e773f) : CA total sur sa fenêtre = −16,4 % alors que SA métrique a tenu (+510 €) —
    // afficher le CA sur un engagement famille produit deux verdicts opposés (règle
    // « kpi-declare-suit-partout »). CA → mart résiduel ; family_revenue → transactions de la
    // famille vs sa moyenne/jour historique (référence du provider evenementFamily).
    bq.query({
      query: `WITH latest AS (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC, CASE WHEN status IN ('resolved','cancelled') THEN 1 ELSE 0 END DESC, (verdict IS NOT NULL) DESC, created_at DESC) AS rn
                FROM \`${PROJECT}.analytics.action_commitments\` WHERE location_id IN UNNEST(@l)),
              o AS (SELECT l.commitment_id, l.location_id, l.window_start, l.window_end,
                           l.measured_metric, si.kpi_family
                    FROM latest l LEFT JOIN \`${PROJECT}.raw.saved_items\` si USING (saved_item_id)
                    WHERE l.rn = 1 AND l.status IN ('open','pending')),
              ca AS (SELECT o.commitment_id, COUNT(r.date) AS jours_mesures,
                            ROUND(SUM(r.daily_revenue), 0) AS valeur, ROUND(SUM(r.expected_revenue), 0) AS reference
                     FROM o JOIN \`${PROJECT}.mart.fct_client_day_residual\` r
                       ON r.location_id = o.location_id AND r.date BETWEEN o.window_start AND LEAST(o.window_end, CURRENT_DATE())
                     WHERE o.measured_metric != 'family_revenue' OR o.kpi_family IS NULL
                     GROUP BY 1),
              fam AS (SELECT o.commitment_id, COUNT(DISTINCT t.transaction_date) AS jours_mesures,
                             ROUND(SUM(t.revenue), 0) AS valeur,
                             ROUND(b.avg_day * COUNT(DISTINCT t.transaction_date), 0) AS reference
                      FROM o
                      JOIN \`${PROJECT}.raw.client_transactions\` t
                        ON t.location_id = o.location_id AND t.item_category = o.kpi_family
                       AND t.transaction_date BETWEEN o.window_start AND LEAST(o.window_end, CURRENT_DATE())
                      JOIN (SELECT location_id, item_category,
                                   SUM(revenue) / COUNT(DISTINCT transaction_date) AS avg_day
                            FROM \`${PROJECT}.raw.client_transactions\` GROUP BY 1, 2) b
                        ON b.location_id = o.location_id AND b.item_category = o.kpi_family
                      WHERE o.measured_metric = 'family_revenue' AND o.kpi_family IS NOT NULL
                      GROUP BY 1, b.avg_day)
              SELECT commitment_id, 'ca' AS metric, jours_mesures, valeur, reference,
                     ROUND(SAFE_DIVIDE(valeur - reference, reference) * 100, 1) AS ecart_pct FROM ca
              UNION ALL
              SELECT commitment_id, 'famille' AS metric, jours_mesures, valeur, reference,
                     ROUND(SAFE_DIVIDE(valeur - reference, reference) * 100, 1) AS ecart_pct FROM fam`,
      params: P, location: "EU",
    }),
    // Résultats à documenter : verdict TENU sans dispositif du même type (déblocage de savoir-faire).
    bq.query({
      query: `WITH latest AS (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC, CASE WHEN status IN ('resolved','cancelled') THEN 1 ELSE 0 END DESC, (verdict IS NOT NULL) DESC, created_at DESC) AS rn
                FROM \`${PROJECT}.analytics.action_commitments\` WHERE location_id IN UNNEST(@l))
              SELECT l.commitment_id, l.location_id, l.committed_action_text, l.origin_action_type,
                     CAST(l.window_end AS STRING) AS we, m.gap_eur
              FROM latest l
              LEFT JOIN (SELECT commitment_id, ROUND(window_actual_revenue - window_expected_revenue, 0) AS gap_eur
                         FROM \`${PROJECT}.mart.fct_client_commitment_outcomes\` WHERE location_id IN UNNEST(@l)) m USING (commitment_id)
              WHERE l.rn = 1 AND l.status = 'resolved' AND l.verdict = 'met'
                AND NOT EXISTS (SELECT 1 FROM \`${PROJECT}.analytics.best_practices\` bp
                                WHERE bp.location_id = l.location_id AND bp.status = 'active'
                                  AND bp.origin_action_type = l.origin_action_type)
              ORDER BY l.window_end DESC LIMIT 5`,
      params: P, location: "EU",
    }),

    // ── 2. IMPACT SUR MES JOURS : mon habituel par jour de semaine + la météo EN MOTS ──
    bq.query({
      query: `SELECT location_id, EXTRACT(DAYOFWEEK FROM date) AS dw, ROUND(AVG(expected_revenue), 0) AS habituel, COUNT(*) AS n
              FROM \`${PROJECT}.mart.fct_client_day_residual\`
              WHERE location_id IN UNNEST(@l) AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
              GROUP BY 1, 2`,
      params: P, location: "EU",
    }),
    // Les menaces datées : événements concurrents des 14 prochains jours + la météo du jour.
    bq.query({
      query: `WITH e AS (
                SELECT location_id, CAST(event_date AS STRING) AS d, event_name, venue_name, threat_level,
                       ROUND(distance_from_location_m) AS m, conflict_score
                FROM \`${PROJECT}.mart.fct_competitor_events_conflicts\`
                WHERE location_id IN UNNEST(@l)
                  AND event_date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 14 DAY))
              -- Le niveau agrégé MENT : lvl 4 peut être la chaleur pendant que le libellé dit
              -- « Ciel dégagé ». On rapporte CHAQUE aléa séparément et on le NOMME côté écran.
              SELECT e.*, v.weather_label_fr,
                     v.lvl_heat, v.lvl_rain, v.lvl_wind, v.lvl_snow, v.lvl_cold,
                     v.competition_pressure_ratio AS pression
              FROM e LEFT JOIN \`${PROJECT}.semantic.vw_insight_event_day_surface\` v
                ON v.location_id = e.location_id AND CAST(v.date AS STRING) = e.d
              ORDER BY e.d, e.conflict_score DESC`,
      params: P, location: "EU",
    }),
    // Mes propres opérations sur la même fenêtre (pour dire « ce jour-là, VOUS avez ceci »).
    bq.query({
      query: `SELECT si.location_id, CAST(d.date AS STRING) AS d, si.title, si.saved_item_id
              FROM \`${PROJECT}.raw.saved_items\` si
              JOIN \`${PROJECT}.raw.saved_item_dates\` d USING (saved_item_id, location_id)
              WHERE si.location_id IN UNNEST(@l)
                AND d.date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 14 DAY)`,
      params: P, location: "EU",
    }),

    // ── 4. COUVERTURE : PAR SITE (l'agrégat cachait le trou) ───────────────
    bq.query({
      query: `SELECT location_id, threat_level, COUNT(*) AS n_total, COUNTIF(is_followed) AS n_suivis
              FROM \`${PROJECT}.mart.fct_competitor_threat_profile\`
              WHERE location_id IN UNNEST(@l) GROUP BY 1, 2`,
      params: P, location: "EU",
    }),
    bq.query({
      query: `SELECT location_id, competitor_name, threat_level, ROUND(threat_score, 2) AS score,
                     ROUND(distance_km, 1) AS km, ROUND(audience_overlap_pct) AS overlap
              FROM \`${PROJECT}.mart.fct_competitor_threat_profile\`
              WHERE location_id IN UNNEST(@l) AND NOT is_followed AND threat_level = 'high'
              ORDER BY threat_score DESC LIMIT 6`,
      params: P, location: "EU",
    }),
    // SOUS-TÂCHE 1 — l'état RÉEL de la veille, concurrent par concurrent.
    // La vérité est `competitor_directory.last_crawl_attempt_at` : le cron nocturne
    // (cron/competitor-surveillance.ts) l'estampille à CHAQUE passage — succès, vide OU erreur.
    // NB : `competitor_enrichment_log` que je lisais avant est un AUTRE mécanisme (identité
    // Google Places), d'où mon « dernier passage il y a 47 j » : faux pour la veille.
    bq.query({
      query: `SELECT ct.location_id, cd.competitor_id, cd.competitor_name, cd.source_url, cd.google_place_id,
                     CAST(DATE(cd.last_crawl_attempt_at) AS STRING) AS dernier_passage,
                     DATE_DIFF(CURRENT_DATE(), DATE(cd.last_crawl_attempt_at), DAY) AS age_j,
                     (SELECT COUNT(*) FROM \`${PROJECT}.raw.competitor_events\` e WHERE e.competitor_id = cd.competitor_id) AS n_evts,
                     (SELECT COUNT(*) FROM \`${PROJECT}.raw.competitor_offering_history\` o WHERE o.competitor_id = cd.competitor_id) AS n_offres
              FROM \`${PROJECT}.raw.competitor_tracking\` ct
              JOIN \`${PROJECT}.raw.competitor_directory\` cd USING (competitor_id)
              -- cd.deleted_at : sans ce filtre, la jointure ressuscite les fiches soft-supprimées
              -- (doublons purgés 16/04 + 20/05) — c'est ce qui a affiché « 6 jamais visités »
              -- le 12/08. Le cron et la chaîne dbt filtrent déjà ; tout lecteur doit le faire.
              WHERE ct.location_id IN UNNEST(@l) AND ct.deleted_at IS NULL AND cd.deleted_at IS NULL
              ORDER BY age_j DESC NULLS FIRST`,
      params: P, location: "EU",
    }),

    // ── 3. CE QUI ME MANQUE : la marge (débloque le KPI profit) + sites aveugles ──
    bq.query({
      query: `SELECT
                (SELECT COUNT(*) FROM \`${PROJECT}.intermediate.int_consulter_corrections_current\`
                  WHERE location_id IN UNNEST(@l) AND correction_type = 'declared_margin_pct') AS marge,
                (SELECT COUNT(DISTINCT saved_item_id) FROM \`${PROJECT}.raw.saved_items\`
                  WHERE location_id IN UNNEST(@l) AND kpi IS NULL) AS evts_sans_objectif,
                -- TÂCHE 8 — cartes BLOQUÉES par la question du périmètre : les 2 types de la
                -- liste explicite du registre (dayClassRegistry, recensement 31/07), sur les
                -- seuls sites dont dims.dim_client_location.client_catchment est NULL. Le
                -- drapeau s'éteint seul une fois la réponse donnée (f10c3e58 = 'commune' : ses
                -- 4 cartes ne comptent PAS — vérifié 13/08, la boucle s'est déjà refermée).
                (SELECT COUNT(*) FROM \`${PROJECT}.mart.fct_location_daily_action_candidates\` c
                  JOIN \`${PROJECT}.dims.dim_client_location\` d USING (location_id)
                  WHERE c.location_id IN UNNEST(@l) AND d.client_catchment IS NULL
                    AND c.action_type IN ('competition_proximity','high_competition_density')
                    AND c.date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)) AS cartes_bloquees`,
      params: P, location: "EU",
    }),
    bq.query({
      query: `SELECT location_id, CAST(MAX(transaction_date) AS STRING) AS derniere_vente, COUNT(DISTINCT transaction_date) AS n_jours
              FROM \`${PROJECT}.raw.client_transactions\` WHERE location_id IN UNNEST(@l) GROUP BY 1`,
      params: P, location: "EU",
    }),

    // SOUS-TÂCHE 2 — trouvailles d'OFFRE chez les concurrents suivis.
    // Le mart compare dernier crawl vs précédent (grain concurrent × item) ; 0 ligne = offre
    // stable, PAS détection cassée (vérifié 13/08 : 97 tarifs, 0 bougé entre les 2 derniers
    // passages). L'écran doit DIRE cette absence, chiffrée par la base de comparaison.
    bq.query({
      query: `SELECT oc.competitor_id, oc.competitor_name, oc.item, oc.change_type,
                     oc.price_direction, oc.old_price_numeric, oc.new_price_numeric, oc.price_pct_change
              FROM \`${PROJECT}.mart.fct_competitor_offering_changes\` oc
              JOIN \`${PROJECT}.raw.competitor_tracking\` ct USING (competitor_id)
              WHERE ct.location_id IN UNNEST(@l) AND ct.deleted_at IS NULL
              LIMIT 8`,
      params: P, location: "EU",
    }),
    // La base de comparaison : combien de tarifs relevés au DERNIER passage chez les suivis.
    bq.query({
      query: `WITH ranked AS (
                SELECT competitor_id, crawled_at,
                       DENSE_RANK() OVER (PARTITION BY competitor_id ORDER BY crawled_at DESC) rn
                FROM (SELECT DISTINCT competitor_id, crawled_at FROM \`${PROJECT}.raw.competitor_offering_history\`))
              SELECT COUNT(DISTINCT h.item_norm) AS n_tarifs, COUNT(DISTINCT h.competitor_id) AS n_lieux
              FROM \`${PROJECT}.raw.competitor_offering_history\` h
              JOIN ranked r ON r.competitor_id = h.competitor_id AND r.crawled_at = h.crawled_at AND r.rn = 1
              JOIN \`${PROJECT}.raw.competitor_tracking\` ct ON ct.competitor_id = h.competitor_id
              WHERE ct.location_id IN UNNEST(@l) AND ct.deleted_at IS NULL AND h.price_numeric IS NOT NULL`,
      params: P, location: "EU",
    }),

    // TÂCHE 6 — les cartes SYSTÈME des 7 prochains jours (supprimées par erreur à la v2).
    // Dédoublonnées par type côté écran ; le libellé maison vient d'une table type→FR
    // (les headline_fr du mart portent encore du « niv. 4 » et de l'anglais — chantier à part).
    bq.query({
      query: `SELECT action_type, action_category, action_priority, headline_fr,
                     CAST(date AS STRING) AS d, location_id
              FROM \`${PROJECT}.mart.fct_location_daily_action_candidates\`
              WHERE location_id IN UNNEST(@l)
                AND date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY)
              ORDER BY action_priority ASC, date ASC LIMIT 30`,
      params: P, location: "EU",
    }),
  ]);
  console.log(`lot parallèle : ${Date.now() - t0} ms`);

  const out = {
    captured_at: new Date().toISOString(),
    today: new Date().toISOString().slice(0, 10),
    sites: rows(sites as any[]),
    decider: { ouverts: rows(ouverts as any[]), tendance: rows(tendance as any[]), a_documenter: rows(aDocumenter as any[]) },
    impact: { mon_habituel: rows(monJour as any[]), menaces: rows(menacesEvts as any[]), mes_occurrences: rows(mesOccurrences as any[]) },
    manque: { savoir: rows(savoir as any[])[0] || {}, ventes: rows(ventes as any[]) },
    couverture: { par_site: rows(couvertureSite as any[]), trous: rows(trousSite as any[]), veille: rows(crawl as any[]), offres: rows(offres as any[]), offres_base: rows(offresBase as any[])[0] || {} },
    systeme: { cartes: rows(cartes as any[]) },
  };
  console.log("ouverts:", out.decider.ouverts.length, "· à documenter:", out.decider.a_documenter.length);
  console.log("menaces 14 j:", out.impact.menaces.length, "· mes occurrences 14 j:", out.impact.mes_occurrences.length);
  console.log("trous (menace forte non suivie):", JSON.stringify(out.couverture.trous.map((t: any) => t.competitor_name + " @" + t.km + "km")));
  console.log("couverture par site:", JSON.stringify(out.couverture.par_site.filter((r: any) => r.threat_level === "high")));
  const dest = new URL("../public/piloter-proto-data.js", import.meta.url).pathname;
  writeFileSync(dest, "window.PILOTER_PROTO = " + JSON.stringify(out, null, 1) + ";\n");
  console.log("écrit :", dest);
})();
