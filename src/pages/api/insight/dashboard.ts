// GET /api/insight/dashboard — le Tableau de bord (proto V5 validé 04/08, onglet Piloter).
// Six blocs, un job chacun : Impact (écart mesuré € sur fenêtres engagées jugées — mart outcomes,
// jamais extrapolé) · Opérations en cours (occurrences à venir + engagements ouverts, cible SUR la
// ligne, drapeaux concurrent/météo) · Équipe (par personne : opérations NOMMÉES + tenue) ·
// Dispositifs prouvés (best_practices) · Opérations automatisées (reçu du travail des crons) ·
// Débloquer (marge déclarée ?, bilans manquants, faits actifs).
// GARDE-FOU (owner 04/08) : aucune métrique brute sans son verdict — pas de courbe de CA ici.
// Période ?period=30|90|365 (défaut 30) : filtre l'AFFICHAGE des agrégats, jamais un recalcul.
// Perf : UN lot Promise.all de 8 lectures légères (~1 aller-retour BQ de wall-clock).
import type { APIRoute } from "astro";
import { personKey, isKeptVerdict } from "../../../lib/actionCommitments";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership, requireLocationAccess } from "../../../lib/requireLocationOwnership";
import { rowsToImpactsWithImmaterial, readDayClassStore, annualRevenueByLocation } from "../../../lib/dayClassRegistry";
// KPI -> colonne journalière : LU au registre, jamais retapé (les deux CASE ci-dessous en
// étaient des copies ; un mart qui renomme une colonne cassait alors 3 surfaces sur 4).
import { kpiCaseSql, kpiKeyListSql } from "../../../lib/kpiRegistry";
// Marges par famille (24/08) : le slug et le préfixe viennent du propriétaire du log — jamais retapés.
import { familySlug, MARGIN_FAMILY_PREFIX } from "../../../lib/ai/corrections";

const PROJECT = "muse-square-open-data";
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const num = (v: any): number | null => (flat(v) == null ? null : Number(flat(v)));
const str = (v: any): string | null => (flat(v) == null ? null : String(flat(v)));

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    // Multi-sites (owner 05/08) : le tableau couvre TOUS les sites du compte par défaut —
    // l'activité vit sur plusieurs sites (constat réel : 3 opérations sur 3 sites, le mono-site
    // en cachait 2). ?location_id= reste un filtre optionnel.
    const allLocs: string[] = Array.isArray((locals as any)?.all_location_ids) ? (locals as any).all_location_ids : [];
    // Vue équipe inc 3 (docs/vue-equipe-slack-spec.md) : un membre lit ce tableau en
    // version light — ses sites viennent de member_location_ids (jamais fusionnés dans
    // all_location_ids), la garde de lecture est requireLocationAccess (owner inchangé).
    const role: "owner" | "member" = String((locals as any)?.role || "") === "member" ? "member" : "owner";
    const memberLocs: string[] = Array.isArray((locals as any)?.member_location_ids) ? (locals as any).member_location_ids : [];
    const memberPoles: Record<string, string[]> = (locals as any)?.member_poles || {};
    const locFilter = String(url.searchParams.get("location_id") || "").trim();
    if (locFilter) requireLocationAccess(locals, locFilter);
    const locs = locFilter ? [locFilter] : (role === "member" ? memberLocs : allLocs);
    if (!locs.length) return json(400, { ok: false, error: "aucun site" });
    const uid = String((locals as any)?.clerk_user_id || "").trim();
    const period = [30, 90, 365].includes(Number(url.searchParams.get("period"))) ? Number(url.searchParams.get("period")) : 30;
    const bq0 = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
    // Mesure par requête (CLAUDE.md § Performance : mesurer, jamais déduire) — DASH_TIMING=1
    // via npx tsx sur le harnais ; zéro effet sans la variable.
    const bq = (process.env.DASH_TIMING
      ? { query: async (opts: any) => { const t0 = Date.now(); try { return await bq0.query(opts); } finally { console.error(`[dash-timing] ${Date.now() - t0} ms — ${String(opts.query).replace(/\s+/g, " ").slice(0, 90)}`); } } }
      : bq0) as typeof bq0;
    const P = { locs, period };

    const [[occRows], [comRows], [outRows], [bpRows], [bpCountRows], [alertRows], [bilanRows], [corrRows], [labelRows], [setupRows], [trigRows], [heatRows], [freshRows], [consigneRows], [dcRows], [annualRevRows], [tendRows], [veilleRows], [offChgRows], [offBaseRows], [covSiteRows], [watchedRows], [trousRows], [evts14Rows], [dowRows], [savoirRows], [cartesRows], [mesRows], [mesDailyRows], [ficheRows], [serieRows], [audRows], [gapRows], [testRows], [caDailyRows], [opsValRows], [evtPubRows], [evtCovRows], [funnelRows], [famCaRows], [bandeauRows]] = await Promise.all([
      // Occurrences à venir (60 j, cap 20) + prêt/pas prêt + météo du jour (niveau max).
      bq.query({
        // Perf 25/08 : les 5 sous-requêtes corrélées (2,6-4,7 s de plan, 1 Mo scanné — coupable
        // nommé par JOBS_BY_PROJECT) deviennent des pré-agrégats joints — mêmes clés, mêmes
        // COUNT (COALESCE 0 : un COUNT corrélé vide rendait 0, jamais NULL), même lvl_max
        // (grain jour du view — MAX() ne change rien à 1 ligne, l'original aurait planté à 2).
        query: `WITH occ AS (
                  SELECT si.saved_item_id, si.location_id, si.title, si.event_type, si.kpi, si.kpi_family,
                         si.kpi_target_pct, si.kpi_target_eur, si.author_person_name,
                         CAST(d.date AS STRING) AS occ_date,
                         ROW_NUMBER() OVER (PARTITION BY si.saved_item_id ORDER BY d.date) AS occ_rank_upcoming
                  FROM \`${PROJECT}.raw.saved_items\` si
                  JOIN \`${PROJECT}.raw.saved_item_dates\` d USING (saved_item_id, location_id)
                  WHERE si.location_id IN UNNEST(@locs)
                    AND d.date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 60 DAY)
                    AND (COALESCE(si.recurrence, 'none') != 'none' OR si.selected_date = d.date)
                ),
                -- Branches INDÉPENDANTES filtrées @locs (un IN (SELECT … FROM occ) sérialisait le
                -- plan : occ → semi-join → agrégat, 28 étages mesurés). Invariant d'écriture :
                -- les lignes d'un saved_item portent toujours SA location (jointure USING des
                -- deux clés partout) — le filtre site vaut le filtre par saved_item.
                tot AS (
                  SELECT a.saved_item_id, COUNT(*) AS n_total, COUNTIF(a.date < CURRENT_DATE()) AS n_past
                  FROM \`${PROJECT}.raw.saved_item_dates\` a
                  WHERE a.location_id IN UNNEST(@locs) GROUP BY 1
                ),
                com AS (
                  SELECT c.saved_item_id, CAST(c.window_start AS STRING) AS occ_date, COUNT(*) AS n_com
                  FROM \`${PROJECT}.analytics.action_commitments\` c
                  WHERE c.location_id IN UNNEST(@locs) AND c.saved_item_id IS NOT NULL GROUP BY 1, 2
                ),
                snap AS (
                  SELECT s.saved_item_id, CAST(s.selected_date AS STRING) AS occ_date, COUNT(*) AS n_snap
                  FROM \`${PROJECT}.raw.saved_item_snapshots\` s
                  WHERE s.location_id IN UNNEST(@locs) GROUP BY 1, 2
                ),
                wx AS (
                  SELECT v.location_id, CAST(v.date AS STRING) AS occ_date,
                         MAX(GREATEST(COALESCE(v.lvl_rain,0), COALESCE(v.lvl_heat,0), COALESCE(v.lvl_wind,0), COALESCE(v.lvl_snow,0), COALESCE(v.lvl_cold,0))) AS lvl_max
                  FROM \`${PROJECT}.semantic.vw_insight_event_day_surface\` v
                  WHERE v.location_id IN UNNEST(@locs)
                    AND v.date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 60 DAY)
                  GROUP BY 1, 2
                )
                SELECT o.*, tot.n_total, tot.n_past,
                       COALESCE(com.n_com, 0) AS n_com, COALESCE(snap.n_snap, 0) AS n_snap, wx.lvl_max
                FROM occ o
                LEFT JOIN tot USING (saved_item_id)
                LEFT JOIN com ON com.saved_item_id = o.saved_item_id AND com.occ_date = o.occ_date
                LEFT JOIN snap ON snap.saved_item_id = o.saved_item_id AND snap.occ_date = o.occ_date
                LEFT JOIN wx ON wx.location_id = o.location_id AND wx.occ_date = o.occ_date
                ORDER BY o.occ_date LIMIT 20`,
        params: { locs }, location: "EU",
      }),
      // Engagements — dernier état par commitment (journal append-only) : ouverts + tenue période.
      bq.query({
        // Perf 25/08 : colonnes nommées avant le ROW_NUMBER — le SELECT * faisait transiter le
        // journal entier (toutes colonnes) par l'étage de fenêtrage à chaque appel.
        query: `WITH latest AS (
                  SELECT commitment_id, location_id, status, verdict, owner_person_name, committed_action_text,
                         measured_metric, threshold_basis, threshold_value, saved_item_id, window_start, window_end,
                         origin_action_type, action_done_status, created_at, dispositif_id, attached_pole_id,
                         ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC, CASE WHEN status IN ('resolved', 'cancelled') THEN 1 ELSE 0 END DESC, (verdict IS NOT NULL) DESC, created_at DESC) AS rn
                  FROM \`${PROJECT}.analytics.action_commitments\` WHERE location_id IN UNNEST(@locs)
                )
                SELECT commitment_id, location_id, status, verdict, owner_person_name, committed_action_text,
                       measured_metric, threshold_basis, threshold_value, saved_item_id,
                       dispositif_id, attached_pole_id,
                       CAST(window_start AS STRING) AS ws, CAST(window_end AS STRING) AS we,
                       origin_action_type, action_done_status,
                       CAST(DATE(created_at) AS STRING) AS created_d,
                       DATE_DIFF(window_end, CURRENT_DATE(), DAY) AS days_to_end,
                       (DATE(created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL @period DAY)) AS in_period
                FROM latest WHERE rn = 1`,
        params: P, location: "EU",
      }),
      // Impact € : le mart des outcomes, PAR commitment (le € par personne se recompose côté
      // endpoint via l'owner du journal). Contrat « fait par défaut » : le WHERE du mart passe
      // à « non déclarée pas-menée » (édit dbt côté owner, 05/08).
      // Toujours 365 j + resolved_date : le serveur filtre en JS pour la période demandée et
      // renvoie les lignes brutes (impact_rows) — le client dérive 30/90/365 SANS re-fetch
      // (bascule de période instantanée ; dérivation prouvée identique au harnais 09/08).
      bq.query({
        query: `SELECT commitment_id, beat, verdict, CAST(resolved_date AS STRING) AS resolved_date,
                       ROUND(window_actual_revenue - window_expected_revenue, 0) AS gap_eur, location_id
                FROM \`${PROJECT}.mart.fct_client_commitment_outcomes\`
                WHERE location_id IN UNNEST(@locs)
                  AND resolved_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)`,
        params: { locs }, location: "EU",
      }),
      // Tier CANONIQUE (registre de bestPractices.ts) : prouvée ssi le rejeu a verdict 'met' au
      // dernier état — `status='proven'` n'est écrit nulle part, l'ancien test était toujours
      // faux (« Dispositifs prouvés » structurellement à 0, attrapé au proto 09/08).
      bq.query({
        query: `SELECT bp.practice_id, bp.location_id, bp.practice_text, bp.status, bp.author_person_name, bp.replay_commitment_id, bp.origin_action_type,
                       bp.arm_enabled, bp.arm_recipient_name, bp.arm_recipient_contact, COALESCE(bp.arm_cooldown_days, 7) AS arm_cooldown,
                       CAST(DATE(bp.created_at) AS STRING) AS d,
                       c.status AS replay_status, c.verdict AS replay_verdict
                FROM \`${PROJECT}.analytics.best_practices\` bp
                LEFT JOIN (
                  -- Perf 25/08 : journal pré-filtré aux rejeux du compte AVANT le fenêtrage
                  -- (le ROW_NUMBER tournait sur le journal ENTIER, coût croissant avec lui).
                  SELECT commitment_id, status, verdict,
                         ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC, CASE WHEN status IN ('resolved', 'cancelled') THEN 1 ELSE 0 END DESC, (verdict IS NOT NULL) DESC, created_at DESC) AS rn
                  FROM \`${PROJECT}.analytics.action_commitments\`
                  WHERE commitment_id IN (SELECT replay_commitment_id FROM \`${PROJECT}.analytics.best_practices\`
                                          WHERE location_id IN UNNEST(@locs) AND replay_commitment_id IS NOT NULL)
                ) c ON c.commitment_id = bp.replay_commitment_id AND c.rn = 1
                WHERE bp.location_id IN UNNEST(@locs)
                ORDER BY bp.created_at DESC LIMIT 20`,
        params: { locs }, location: "EU",
      }),
      // Comptes par tier SANS le plafond LIMIT 20 (au-delà de 20 pratiques, l'ancien compteur
      // « prouvés » se mettait à BAISSER à chaque déclaration nouvelle).
      bq.query({
        query: `SELECT
                  COUNTIF(bp.status = 'active' AND c.verdict = 'met') AS n_proven,
                  COUNTIF(bp.status = 'active' AND c.status = 'open') AS n_rejeu,
                  COUNTIF(bp.status = 'active' AND (c.commitment_id IS NULL OR (c.status != 'open' AND COALESCE(c.verdict, '') != 'met'))) AS n_declared
                FROM \`${PROJECT}.analytics.best_practices\` bp
                LEFT JOIN (
                  -- Perf 25/08 : même pré-filtre que bpRows — journal réduit aux rejeux du compte.
                  SELECT commitment_id, status, verdict,
                         ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC, CASE WHEN status IN ('resolved', 'cancelled') THEN 1 ELSE 0 END DESC, (verdict IS NOT NULL) DESC, created_at DESC) AS rn
                  FROM \`${PROJECT}.analytics.action_commitments\`
                  WHERE commitment_id IN (SELECT replay_commitment_id FROM \`${PROJECT}.analytics.best_practices\`
                                          WHERE location_id IN UNNEST(@locs) AND replay_commitment_id IS NOT NULL)
                ) c ON c.commitment_id = bp.replay_commitment_id AND c.rn = 1
                WHERE bp.location_id IN UNNEST(@locs)`,
        params: { locs }, location: "EU",
      }),
      bq.query({
        query: `SELECT location_id, CAST(affected_date AS STRING) AS d, change_subtype, ROUND(distance_m / 1000, 1) AS km
                FROM \`${PROJECT}.raw.competitor_alerts\`
                WHERE location_id IN UNNEST(@locs)
                  AND affected_date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY)
                ORDER BY affected_date LIMIT 10`,
        params: { locs }, location: "EU",
      }),
      bq.query({
        query: `SELECT si.title, si.saved_item_id, si.location_id,
                       CAST(COALESCE(si.event_end_date, lo.last_d, si.selected_date) AS STRING) AS fin
                FROM \`${PROJECT}.raw.saved_items\` si
                LEFT JOIN (SELECT saved_item_id, MAX(date) AS last_d FROM \`${PROJECT}.raw.saved_item_dates\` GROUP BY 1) lo USING (saved_item_id)
                WHERE si.location_id IN UNNEST(@locs)
                  AND COALESCE(si.event_end_date, lo.last_d, si.selected_date) < CURRENT_DATE()
                  AND NOT EXISTS (SELECT 1 FROM \`${PROJECT}.raw.event_outcomes\` o WHERE o.saved_item_id = si.saved_item_id)
                ORDER BY COALESCE(si.event_end_date, lo.last_d, si.selected_date) DESC LIMIT 5`,
        params: { locs }, location: "EU",
      }),
      // + colonnes marges (24/08) : correction_text (le %), raw_turn (libellé famille exact),
      // location_id — même aller-retour, le compteur facts_active ne change pas.
      bq.query({
        query: `SELECT location_id, correction_type, correction_text, raw_turn
                FROM \`${PROJECT}.intermediate.int_consulter_corrections_current\`
                WHERE location_id IN UNNEST(@locs)`,
        params: { locs }, location: "EU",
      }),
      // Libellés de site (pastilles multi-sites) — dans le MÊME lot parallèle (budget perf).
      bq.query({
        query: `SELECT location_id, ANY_VALUE(COALESCE(site_name, company_name)) AS label
                FROM \`${PROJECT}.raw.insight_event_user_location_profile\`
                WHERE location_id IN UNNEST(@locs) GROUP BY 1`,
        params: { locs }, location: "EU",
      }),
      // État de config du compte (gestes d'onboarding, owner 05/08) : chaque geste n'apparaît
      // que si le manque est RÉEL en base — jamais une checklist générique.
      bq.query({
        query: `SELECT
                  (SELECT COUNT(*) FROM \`${PROJECT}.analytics.team_members\` WHERE user_id = @uid) AS team_n,
                  (SELECT COUNT(*) FROM \`${PROJECT}.analytics.channel_configs\` WHERE user_id = @uid AND enabled = TRUE) AS chan_n,
                  (SELECT COUNT(*) FROM \`${PROJECT}.raw.notification_preferences\` WHERE clerk_user_id = @uid) AS pref_n,
                  (SELECT LOGICAL_OR(COALESCE(alerts_critical, FALSE)) FROM \`${PROJECT}.raw.notification_preferences\` WHERE clerk_user_id = @uid) AS alerts_on,
                  (SELECT COUNTIF(signal_routing IS NOT NULL AND TRIM(signal_routing) != '') FROM \`${PROJECT}.analytics.team_members\` WHERE user_id = @uid) AS routed_n`,
        params: { uid }, location: "EU",
      }),
      // Armement sur signal (cas 1) : dernier déclenchement par pratique + contexte du signal
      // chaleur par site (fréquence 30 j RÉELLE + prochain jour chaud annoncé) — le panneau
      // « Armer » montre ce qu'on branche, jamais une promesse.
      bq.query({
        query: `SELECT practice_id, CAST(DATE(MAX(sent_at)) AS STRING) AS last_fired,
                       COUNT(*) AS n_triggers
                FROM \`${PROJECT}.analytics.dispositif_triggers\`
                WHERE location_id IN UNNEST(@locs) GROUP BY 1`,
        params: P, location: "EU",
      }),
      bq.query({
        query: `SELECT location_id,
                       COUNTIF(lvl_heat >= 3 AND DATE(date) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) AND CURRENT_DATE()) AS n_hot_30,
                       MIN(CASE WHEN lvl_heat >= 3 AND DATE(date) > CURRENT_DATE() AND DATE(date) <= DATE_ADD(CURRENT_DATE(), INTERVAL 14 DAY) THEN CAST(DATE(date) AS STRING) END) AS next_hot,
                       ARRAY_AGG(CASE WHEN lvl_heat >= 3 AND DATE(date) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) AND CURRENT_DATE() THEN CAST(DATE(date) AS STRING) END IGNORE NULLS) AS hot_dates
                FROM \`${PROJECT}.semantic.vw_insight_event_day_surface\`
                WHERE location_id IN UNNEST(@locs) GROUP BY 1`,
        params: { locs }, location: "EU",
      }),
      // Fraîcheur des ventes (onboarding P1) : dernier jour importé par site — le carburant de
      // toute mesure. Un site sans ligne = aveugle ; un site figé = cartes du jour muettes.
      bq.query({
        query: `SELECT location_id, CAST(MAX(transaction_date) AS STRING) AS last_sale,
                       COUNT(DISTINCT transaction_date) AS n_days, CAST(MIN(transaction_date) AS STRING) AS first_sale
                FROM \`${PROJECT}.raw.client_transactions\`
                WHERE location_id IN UNNEST(@locs) GROUP BY 1`,
        params: { locs }, location: "EU",
      }),
      // Consignes d'opération ACTIVES (automatisation inc. 5) : prochaine occurrence + dernière
      // trace d'envoi réelle — le volet Automatisation ne liste que ce qui tourne, zéro dummy.
      bq.query({
        query: `SELECT si.saved_item_id, si.location_id, si.title, si.consigne_send_offset,
                       CAST(nx.next_d AS STRING) AS next_occ,
                       ls.sent_on AS last_sent_on, ls.n_recipients AS last_n
                FROM \`${PROJECT}.raw.saved_items\` si
                JOIN (SELECT saved_item_id, MIN(date) AS next_d FROM \`${PROJECT}.raw.saved_item_dates\`
                      WHERE date >= CURRENT_DATE() GROUP BY 1) nx ON nx.saved_item_id = si.saved_item_id
                LEFT JOIN (SELECT saved_item_id, CAST(DATE(sent_at) AS STRING) AS sent_on, n_recipients
                           FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY saved_item_id ORDER BY sent_at DESC) AS rn
                                 FROM \`${PROJECT}.analytics.consigne_sends\`)
                           WHERE rn = 1) ls ON ls.saved_item_id = si.saved_item_id
                WHERE si.location_id IN UNNEST(@locs) AND si.consigne_enabled = TRUE
                ORDER BY nx.next_d LIMIT 20`,
        params: { locs }, location: "EU",
      }),
      // Store de classes — LA lecture du registre (readDayClassStore, 23/08) : plus de copie
      // locale ni de double schéma. Gated ensuite par rowsToImpactsWithImmaterial, même registre
      // que les pills/chantiers de Pulse. Compte jamais batché = carte absente.
      readDayClassStore(bq, locs).then((rows: any[]) => [rows]),
      // CA annualisé par site — LA formule du registre (annualRevenueByLocation, 23/08), plus de
      // copie locale. Dénominateur de la porte de matérialité ; sans CA la porte ne s'applique pas.
      annualRevenueByLocation(bq, locs).then((m: Map<string, number>) => [[...m.entries()].map(([location_id, annual_revenue]) => ({ location_id, annual_revenue }))]),

      // ═══ Lectures GLANCE (refonte Piloter 13/08 — hiérarchie « À faire → Événements
      //     concurrents → À surveiller → savoir-faire → couverture », prototypée et validée
      //     bloc par bloc sur les données du compte owner). Toutes dans le MÊME lot. ═══

      // Tendance des fenêtres OUVERTES — dans la MÉTRIQUE DÉCLARÉE de l'engagement, jamais le
      // CA total en dur (preuve 13/08 : CA total −16,4 % sur la fenêtre d'un engagement famille
      // dont la métrique a TENU +510 € — deux verdicts opposés sinon ; règle kpi-declare-suit-partout).
      bq.query({
        // Perf 25/08 : colonnes nommées avant le ROW_NUMBER (même motif que comRows) ; baseline
        // famille b restreinte aux sites du compte (l'agrégat balayait TOUTES les locations).
        query: `WITH latest AS (
                  SELECT commitment_id, location_id, status, window_start, window_end, measured_metric, saved_item_id,
                         ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC, CASE WHEN status IN ('resolved','cancelled') THEN 1 ELSE 0 END DESC, (verdict IS NOT NULL) DESC, created_at DESC) AS rn
                  FROM \`${PROJECT}.analytics.action_commitments\` WHERE location_id IN UNNEST(@locs)),
                o AS (SELECT l.commitment_id, l.location_id, l.window_start, l.window_end, l.measured_metric, si.kpi_family
                      FROM latest l LEFT JOIN \`${PROJECT}.raw.saved_items\` si USING (saved_item_id)
                      WHERE l.rn = 1 AND l.status IN ('open','pending')),
                ca AS (SELECT o.commitment_id, COUNT(r.date) AS jours, ROUND(SUM(r.daily_revenue), 0) AS valeur, ROUND(SUM(r.expected_revenue), 0) AS reference
                       FROM o JOIN (SELECT location_id, date, daily_revenue, expected_revenue
                                    FROM \`${PROJECT}.semantic.vw_insight_event_day_residual\` WHERE location_id IN UNNEST(@locs)) r
                         ON r.location_id = o.location_id AND r.date BETWEEN o.window_start AND LEAST(o.window_end, CURRENT_DATE())
                       WHERE o.measured_metric != 'family_revenue' OR o.kpi_family IS NULL GROUP BY 1),
                fam AS (SELECT o.commitment_id, COUNT(DISTINCT t.transaction_date) AS jours, ROUND(SUM(t.revenue), 0) AS valeur,
                               ROUND(b.avg_day * COUNT(DISTINCT t.transaction_date), 0) AS reference
                        FROM o JOIN (SELECT location_id, item_category, transaction_date, revenue
                                     FROM \`${PROJECT}.raw.client_transactions\` WHERE location_id IN UNNEST(@locs)) t
                          ON t.location_id = o.location_id AND t.item_category = o.kpi_family
                         AND t.transaction_date BETWEEN o.window_start AND LEAST(o.window_end, CURRENT_DATE())
                        JOIN (SELECT location_id, item_category, SUM(revenue) / COUNT(DISTINCT transaction_date) AS avg_day
                              FROM \`${PROJECT}.raw.client_transactions\` WHERE location_id IN UNNEST(@locs) GROUP BY 1, 2) b
                          ON b.location_id = o.location_id AND b.item_category = o.kpi_family
                        WHERE o.measured_metric = 'family_revenue' AND o.kpi_family IS NOT NULL GROUP BY 1, b.avg_day)
                SELECT commitment_id, 'ca' AS metric, jours, valeur, reference,
                       ROUND(SAFE_DIVIDE(valeur - reference, reference) * 100, 1) AS ecart_pct FROM ca
                UNION ALL
                SELECT commitment_id, 'famille' AS metric, jours, valeur, reference,
                       ROUND(SAFE_DIVIDE(valeur - reference, reference) * 100, 1) AS ecart_pct FROM fam`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // Veille : état par fiche suivie. cd.deleted_at OBLIGATOIRE — sans lui la jointure exhume
      // les doublons soft-supprimés (16/04 + 20/05) : c'est le bug d'affichage du 12/08.
      bq.query({
        query: `SELECT ct.location_id, cd.competitor_id, cd.competitor_name, cd.google_place_id, cd.source_url,
                       DATE_DIFF(CURRENT_DATE(), DATE(cd.last_crawl_attempt_at), DAY) AS age_j
                FROM \`${PROJECT}.raw.competitor_tracking\` ct
                JOIN \`${PROJECT}.raw.competitor_directory\` cd USING (competitor_id)
                WHERE ct.location_id IN UNNEST(@locs) AND ct.deleted_at IS NULL AND cd.deleted_at IS NULL`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // Changements d'offre détectés (mart latest-vs-previous) chez les suivis.
      bq.query({
        query: `SELECT oc.competitor_name, oc.item, oc.change_type, oc.price_direction,
                       oc.old_price_numeric, oc.new_price_numeric, oc.price_pct_change,
                       -- « vu le » HONNÊTE (25/08, mart bloc 5) : une offre RETIRÉE n'a pas de
                       -- current_crawled_at (le crawl où elle disparaît ne la porte plus) — sa
                       -- date de constat est change_first_seen_on, calculée par l'int (premier
                       -- crawl après la dernière apparition). Vérifié en base : les 2 retraits
                       -- du compte (« cinema au musee », Pont du Gard) ont crawl NULL et
                       -- constat 24/08. COALESCE : les changements de prix gardent leur crawl.
                       oc.new_price_qualifier,
                       CAST(COALESCE(DATE(oc.current_crawled_at), oc.change_first_seen_on) AS STRING) AS vu_le,
                       COALESCE(cd.tarifs_url, cd.source_url) AS src_url
                FROM \`${PROJECT}.mart.fct_competitor_offering_changes\` oc
                JOIN \`${PROJECT}.raw.competitor_tracking\` ct USING (competitor_id)
                LEFT JOIN \`${PROJECT}.raw.competitor_directory\` cd
                  ON cd.competitor_id = oc.competitor_id AND cd.deleted_at IS NULL
                WHERE ct.location_id IN UNNEST(@locs) AND ct.deleted_at IS NULL
                -- un concurrent suivi par PLUSIEURS sites du compte fan-out sinon (grain mart
                -- = competitor × item ; liste de trouvailles au niveau compte, prouvé 24/08)
                QUALIFY ROW_NUMBER() OVER (PARTITION BY oc.competitor_id, oc.item_norm ORDER BY ct.created_at) = 1
                ORDER BY COALESCE(DATE(oc.current_crawled_at), oc.change_first_seen_on) DESC LIMIT 8`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // Base de comparaison des offres : tarifs relevés au DERNIER passage (l'absence se chiffre).
      bq.query({
        query: `WITH ranked AS (SELECT competitor_id, crawled_at,
                       DENSE_RANK() OVER (PARTITION BY competitor_id ORDER BY crawled_at DESC) rn
                  FROM (SELECT DISTINCT competitor_id, crawled_at FROM \`${PROJECT}.raw.competitor_offering_history\`))
                SELECT COUNT(DISTINCT h.item_norm) AS n_tarifs, COUNT(DISTINCT h.competitor_id) AS n_lieux
                FROM \`${PROJECT}.raw.competitor_offering_history\` h
                JOIN ranked r ON r.competitor_id = h.competitor_id AND r.crawled_at = h.crawled_at AND r.rn = 1
                JOIN \`${PROJECT}.raw.competitor_tracking\` ct ON ct.competitor_id = h.competitor_id
                WHERE ct.location_id IN UNNEST(@locs) AND ct.deleted_at IS NULL AND h.price_numeric IS NOT NULL`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // Couverture de menace PAR SITE (l'agrégat compte masquait le site aveugle — retiré 13/08).
      bq.query({
        query: `SELECT location_id, COUNT(*) AS n_total, COUNTIF(is_followed) AS n_suivis
                FROM \`${PROJECT}.mart.fct_competitor_threat_profile\`
                WHERE location_id IN UNNEST(@locs) AND threat_level = 'high' GROUP BY 1`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // Suivis RÉELS par site (23/08) : competitor_tracking filtré par location_id — la table
      // que lisent les fiches ci-dessous, les crawls et add/unfollow. Pas watched_competitors :
      // les deux divergent (34 vs 32 lignes, 29 communes ; sur f10c3e58 l'Orangerie y porte
      // deux competitor_id différents). Et pas le `is_followed` de la couverture, calculé SANS
      // location_id dans fct_competitor_directory (11 affichés sur f10c3e58 pour 5 réels).
      bq.query({
        query: `SELECT location_id, COUNT(DISTINCT competitor_id) AS n_watched
                FROM \`${PROJECT}.raw.competitor_tracking\`
                WHERE location_id IN UNNEST(@locs) AND deleted_at IS NULL GROUP BY 1`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // Les trous nommés : menaces fortes NON suivies (le geste « Suivez X »).
      bq.query({
        query: `SELECT tp.location_id, tp.competitor_name, ROUND(tp.distance_km, 1) AS km, ROUND(tp.audience_overlap_pct) AS overlap,
                       cd.google_place_id, cd.city
                FROM \`${PROJECT}.mart.fct_competitor_threat_profile\` tp
                JOIN \`${PROJECT}.raw.competitor_directory\` cd
                  ON cd.competitor_id = tp.competitor_id AND cd.deleted_at IS NULL
                WHERE tp.location_id IN UNNEST(@locs) AND NOT tp.is_followed AND tp.threat_level = 'high'
                  -- Vérité LIVE (16/08) : le mart est nocturne — un suivi créé aujourd'hui, ou un
                  -- doublon fusionné, ne doit pas laisser un « trou » fantôme. Exclusion si un
                  -- suivi VIVANT du même site existe sur CETTE entrée ou sur une entrée vivante
                  -- partageant la même clé google_place_id.
                  AND NOT EXISTS (
                    SELECT 1 FROM \`${PROJECT}.raw.competitor_tracking\` ct2
                    JOIN \`${PROJECT}.raw.competitor_directory\` cd2
                      ON cd2.competitor_id = ct2.competitor_id AND cd2.deleted_at IS NULL
                    WHERE ct2.location_id = tp.location_id AND ct2.deleted_at IS NULL
                      AND (cd2.competitor_id = cd.competitor_id
                           OR (cd.google_place_id IS NOT NULL AND cd2.google_place_id = cd.google_place_id)))
                ORDER BY tp.threat_score DESC LIMIT 3`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // Événements concurrents 14 j + aléas PAR NATURE (l'agrégat ment : lvl 4 peut être la
      // chaleur pendant que le libellé dit « Ciel dégagé » — chaque aléa se nomme lui-même).
      bq.query({
        query: `WITH e AS (SELECT location_id, CAST(event_date AS STRING) AS d, event_name, venue_name,
                       ROUND(distance_from_location_m) AS m, conflict_score
                  FROM \`${PROJECT}.mart.fct_competitor_events_conflicts\`
                  WHERE location_id IN UNNEST(@locs)
                    AND event_date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 14 DAY))
                SELECT e.*, v.lvl_heat, v.lvl_rain, v.lvl_wind, v.lvl_snow, v.lvl_cold
                FROM e LEFT JOIN \`${PROJECT}.semantic.vw_insight_event_day_surface\` v
                  ON v.location_id = e.location_id AND CAST(v.date AS STRING) = e.d
                ORDER BY e.d, e.conflict_score DESC LIMIT 20`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // CA habituel par jour de semaine (90 j) — l'unité d'impact « votre sam ≈ 1 190 € ».
      bq.query({
        query: `SELECT location_id, EXTRACT(DAYOFWEEK FROM date) AS dw, ROUND(AVG(expected_revenue), 0) AS habituel
                FROM \`${PROJECT}.semantic.vw_insight_event_day_residual\`
                WHERE location_id IN UNNEST(@locs) AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
                GROUP BY 1, 2`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // Déblocages chiffrés : événements sans objectif + cartes BLOQUÉES par la question du
      // périmètre (liste explicite du registre : les 2 seuls types au rayon local, sur les seuls
      // sites au périmètre inconnu — le drapeau s'éteint seul une fois la réponse donnée).
      bq.query({
        query: `SELECT
                  (SELECT COUNT(DISTINCT saved_item_id) FROM \`${PROJECT}.raw.saved_items\`
                    WHERE location_id IN UNNEST(@locs) AND kpi IS NULL) AS evts_sans_objectif,
                  (SELECT COUNT(*) FROM \`${PROJECT}.mart.fct_location_daily_action_candidates\` c
                    JOIN \`${PROJECT}.dims.dim_client_location\` d USING (location_id)
                    WHERE c.location_id IN UNNEST(@locs) AND d.client_catchment IS NULL
                      AND c.action_type IN ('competition_proximity','high_competition_density')
                      AND c.date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)) AS cartes_bloquees`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // Cartes système des 7 prochains jours (menaces + occasions produites par les crons —
      // invisibles sur Piloter jusqu'ici). Le libellé maison vit côté client (table type→FR).
      bq.query({
        query: `SELECT action_type, action_category, action_priority, CAST(date AS STRING) AS d, location_id
                FROM \`${PROJECT}.mart.fct_location_daily_action_candidates\`
                WHERE location_id IN UNNEST(@locs)
                  AND date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY)
                ORDER BY action_priority ASC, date ASC LIMIT 30`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // Mini-jauges (owner 16/08) : engagements OUVERTS + réalisé-à-date dans le KPI DÉCLARÉ —
      // une seule requête (K1 residual / K2-K6 perf / K8 famille), jours futurs jamais comptés.
      bq.query({
        query: `WITH cm AS (
                  SELECT * EXCEPT(rn) FROM (
                    SELECT commitment_id, location_id, status, measured_metric, threshold_basis, threshold_value,
                           threshold_level, window_start, window_end, window_days_expected, kpi_baseline,
                           saved_item_id, committed_action_text,
                           ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) rn
                    FROM \`${PROJECT}.analytics.action_commitments\`
                    WHERE location_id IN UNNEST(@locs))
                  WHERE rn = 1 AND status = 'open'),
                -- Perf 25/08 : filtre @locs DANS des tables dérivées — posé en WHERE de jointure il
                -- n'était pas poussé au scan (mesuré : 199 738 lignes lues → 149 116 shufflées ;
                -- le même filtre en sous-requête scanne 199 738 → 7 374 dans le b de tendRows).
                k1 AS (
                  SELECT c.commitment_id, AVG(r.daily_revenue) realized, AVG(r.expected_revenue) exp_base
                  FROM cm c JOIN (SELECT location_id, date, daily_revenue, expected_revenue
                                  FROM \`${PROJECT}.semantic.vw_insight_event_day_residual\` WHERE location_id IN UNNEST(@locs)) r
                    ON r.location_id = c.location_id
                   AND r.date BETWEEN c.window_start AND LEAST(c.window_end, CURRENT_DATE('Europe/Paris'))
                  WHERE c.measured_metric IS NULL OR c.measured_metric = 'revenue_residual' GROUP BY 1),
                kp AS (
                  SELECT c.commitment_id, AVG(${kpiCaseSql("c.measured_metric", "p")}) realized
                  FROM cm c JOIN (SELECT * FROM \`${PROJECT}.mart.fct_client_daily_performance\` WHERE location_id IN UNNEST(@locs)) p
                    ON p.location_id = c.location_id
                   AND p.transaction_date BETWEEN c.window_start AND LEAST(c.window_end, CURRENT_DATE('Europe/Paris'))
                  WHERE c.measured_metric IN (${kpiKeyListSql()}) GROUP BY 1),
                fam AS (
                  SELECT c.commitment_id, SUM(t.revenue) / COUNT(DISTINCT t.transaction_date) realized
                  FROM cm c JOIN \`${PROJECT}.raw.saved_items\` si ON si.saved_item_id = c.saved_item_id
                  JOIN (SELECT location_id, item_category, transaction_date, revenue
                        FROM \`${PROJECT}.raw.client_transactions\` WHERE location_id IN UNNEST(@locs)) t
                    ON t.location_id = c.location_id AND t.item_category = si.kpi_family
                   AND t.transaction_date BETWEEN c.window_start AND LEAST(c.window_end, CURRENT_DATE('Europe/Paris'))
                  WHERE c.measured_metric = 'family_revenue' GROUP BY 1)
                SELECT c.commitment_id, c.location_id, c.measured_metric, c.threshold_basis, c.threshold_value,
                       c.threshold_level, c.window_days_expected, c.kpi_baseline, c.committed_action_text,
                       CAST(c.window_start AS STRING) ws, CAST(c.window_end AS STRING) we,
                       COALESCE(k1.realized, kp.realized, fam.realized) realized, k1.exp_base,
                       c.saved_item_id, si.kpi_family, si.recurrence, si.title AS event_title,
                       lbl.site_label
                FROM cm c LEFT JOIN k1 USING (commitment_id) LEFT JOIN kp USING (commitment_id) LEFT JOIN fam USING (commitment_id)
                LEFT JOIN \`${PROJECT}.raw.saved_items\` si ON si.saved_item_id = c.saved_item_id
                -- Perf 25/08 : ANY_VALUE(company_name) par site en jointure groupée — la sous-requête
                -- corrélée par LIGNE était le coupable « WITH cm » de JOBS_BY_PROJECT (2,6-4,1 s).
                LEFT JOIN (SELECT location_id, ANY_VALUE(company_name) AS site_label
                           FROM \`${PROJECT}.raw.insight_event_user_location_profile\`
                           WHERE location_id IN UNNEST(@locs) GROUP BY 1) lbl ON lbl.location_id = c.location_id`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // Cartes « fenêtre multi-jours » (proto 17/08) : la mini-courbe veut le KPI PAR JOUR —
      // fenêtres ouvertes de plus d'un jour, jours futurs exclus.
      bq.query({
        query: `WITH cm AS (
                  SELECT * EXCEPT(rn) FROM (
                    SELECT commitment_id, location_id, status, measured_metric, window_start, window_end, saved_item_id,
                           ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) rn
                    FROM \`${PROJECT}.analytics.action_commitments\`
                    WHERE location_id IN UNNEST(@locs))
                  WHERE rn = 1 AND status = 'open' AND window_end > window_start)
                SELECT c.commitment_id, CAST(r.date AS STRING) d, r.daily_revenue v
                FROM cm c JOIN \`${PROJECT}.semantic.vw_insight_event_day_residual\` r
                  ON r.location_id = c.location_id AND r.date BETWEEN c.window_start AND LEAST(c.window_end, CURRENT_DATE('Europe/Paris'))
                WHERE c.measured_metric IS NULL OR c.measured_metric = 'revenue_residual'
                UNION ALL
                SELECT c.commitment_id, CAST(p.transaction_date AS STRING) d,
                       ${kpiCaseSql("c.measured_metric", "p")} v
                FROM cm c JOIN \`${PROJECT}.mart.fct_client_daily_performance\` p
                  ON p.location_id = c.location_id AND p.transaction_date BETWEEN c.window_start AND LEAST(c.window_end, CURRENT_DATE('Europe/Paris'))
                WHERE c.measured_metric IN (${kpiKeyListSql()})
                UNION ALL
                SELECT c.commitment_id, CAST(t.transaction_date AS STRING) d, SUM(t.revenue) v
                FROM cm c JOIN \`${PROJECT}.raw.saved_items\` si ON si.saved_item_id = c.saved_item_id
                JOIN \`${PROJECT}.raw.client_transactions\` t
                  ON t.location_id = c.location_id AND t.item_category = si.kpi_family
                 AND t.transaction_date BETWEEN c.window_start AND LEAST(c.window_end, CURRENT_DATE('Europe/Paris'))
                WHERE c.measured_metric = 'family_revenue'
                GROUP BY 1, 2, c.measured_metric
                ORDER BY 1, 2`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // Fiches par suivi (« Mon positionnement », proto validé 17/08) : note Google + avis,
      // audience, fourchette de tarifs relevés, page lue — les absences restent des NULL dits.
      bq.query({
        query: `SELECT ct.location_id, cd.competitor_name nom, cd.google_rating note,
                       cd.google_rating_count avis, cd.primary_audience audience,
                       COALESCE(cd.tarifs_url, cd.source_url) url,
                       MIN(h.price_numeric) p_min, MAX(h.price_numeric) p_max,
                       COUNT(DISTINCT h.item_norm) n_tarifs,
                       ANY_VALUE(cd.competitor_id) cid,
                       ANY_VALUE(cd.secondary_audience) audience2,
                       ANY_VALUE(cd.competitive_analysis_json) ana_json,
                       ANY_VALUE(cd.commercial_news_json) news_json,
                       CAST(ANY_VALUE(cd.commercial_news_at) AS STRING) news_at,
                       ANY_VALUE(tp.audience_overlap_pct) overlap_pct,
                       ANY_VALUE(tp.distance_km) km,
                       LOGICAL_OR(COALESCE(ct.proposed, FALSE)) proposed,
                       -- Mémoire 30 j par suivi (23/08, point 2 « wow ») : nuits de lecture,
                       -- mouvements de prix du mart (fenêtre 30 j du modèle), prochain événement.
                       ANY_VALUE(nu.nuits_30j) nuits_30j,
                       ANY_VALUE(oc.hausses) hausses, ANY_VALUE(oc.baisses) baisses,
                       ANY_VALUE(av.avis_30j) avis_30j,
                       ANY_VALUE(ev.prochain_nom) prochain_nom, CAST(ANY_VALUE(ev.prochain_date) AS STRING) prochain_date, ANY_VALUE(ev.n_a_venir) evts_a_venir
                FROM \`${PROJECT}.raw.competitor_tracking\` ct
                -- Perf 25/08 : chaque sous-requête agrégeait TOUS les concurrents de la base avant
                -- que la jointure sur ct n'en garde une poignée — pré-filtre aux suivis du compte
                -- (exact : une ligne hors suivi ne joignait jamais).
                LEFT JOIN (
                  -- Nuits de lecture, SANS le filtre price_numeric de la jointure h ci-dessous :
                  -- une page lue sans prix numérique (quai Branly, sans URL tarifs) est une nuit lue.
                  SELECT competitor_id, COUNT(DISTINCT DATE(crawled_at)) nuits_30j
                  FROM \`${PROJECT}.raw.competitor_offering_history\`
                  WHERE crawled_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
                    AND competitor_id IN (SELECT competitor_id FROM \`${PROJECT}.raw.competitor_tracking\`
                                          WHERE location_id IN UNNEST(@locs) AND deleted_at IS NULL)
                  GROUP BY 1) nu ON nu.competitor_id = ct.competitor_id
                LEFT JOIN (
                  SELECT competitor_id, COUNTIF(change_type = 'price_increase') hausses, COUNTIF(change_type = 'price_decrease') baisses
                  FROM \`${PROJECT}.mart.fct_competitor_offering_changes\`
                  WHERE competitor_id IN (SELECT competitor_id FROM \`${PROJECT}.raw.competitor_tracking\`
                                          WHERE location_id IN UNNEST(@locs) AND deleted_at IS NULL)
                  GROUP BY 1) oc ON oc.competitor_id = ct.competitor_id
                LEFT JOIN (
                  -- Avis gagnés sur 30 j (23/08) : dernier relevé GBP − premier relevé de la fenêtre.
                  -- Un FAIT par suivi, sans seuil — la carte « surge » reste bloquée (porte absolue :
                  -- Orsay tirait tous les jours ; porte relative : 3 tirs / 14 j, trop mince).
                  SELECT competitor_id,
                         MAX_BY(google_rating_count, snapshot_date) - MIN_BY(google_rating_count, snapshot_date) avis_30j
                  FROM \`${PROJECT}.raw.competitor_snapshots\`
                  WHERE source = 'gbp' AND crawl_status = 'success' AND google_rating_count IS NOT NULL
                    AND snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
                    AND competitor_id IN (SELECT competitor_id FROM \`${PROJECT}.raw.competitor_tracking\`
                                          WHERE location_id IN UNNEST(@locs) AND deleted_at IS NULL)
                  GROUP BY 1 HAVING COUNT(DISTINCT snapshot_date) >= 2) av ON av.competitor_id = ct.competitor_id
                LEFT JOIN (
                  SELECT competitor_id, location_id, COUNT(*) n_a_venir,
                         ARRAY_AGG(event_name ORDER BY event_date LIMIT 1)[OFFSET(0)] prochain_nom,
                         MIN(event_date) prochain_date
                  FROM \`${PROJECT}.mart.fct_competitor_events_conflicts\`
                  WHERE event_date >= CURRENT_DATE() AND location_id IN UNNEST(@locs) GROUP BY 1, 2) ev
                  ON ev.competitor_id = ct.competitor_id AND ev.location_id = ct.location_id
                JOIN \`${PROJECT}.raw.competitor_directory\` cd
                  ON cd.competitor_id = ct.competitor_id AND cd.deleted_at IS NULL
                LEFT JOIN \`${PROJECT}.mart.fct_competitor_threat_profile\` tp
                  ON tp.location_id = ct.location_id AND tp.competitor_id = ct.competitor_id
                LEFT JOIN (SELECT competitor_id, price_numeric, item_norm
                           FROM \`${PROJECT}.raw.competitor_offering_history\`
                           WHERE price_numeric IS NOT NULL
                             AND competitor_id IN (SELECT competitor_id FROM \`${PROJECT}.raw.competitor_tracking\`
                                                   WHERE location_id IN UNNEST(@locs) AND deleted_at IS NULL)) h
                  ON h.competitor_id = ct.competitor_id
                WHERE ct.location_id IN UNNEST(@locs) AND ct.deleted_at IS NULL
                GROUP BY 1, 2, 3, 4, 5, 6`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // Cartes « série » (proto 17/08) : la frise = dates STOCKÉES (raw.saved_item_dates) +
      // verdict par occurrence (dernier snapshot du commitment de la date).
      bq.query({
        query: `WITH cm AS (
                  SELECT * EXCEPT(rn) FROM (
                    SELECT commitment_id, location_id, status, saved_item_id,
                           ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) rn
                    FROM \`${PROJECT}.analytics.action_commitments\`
                    WHERE location_id IN UNNEST(@locs))
                  WHERE rn = 1 AND status = 'open' AND saved_item_id IS NOT NULL),
                occ_v AS (
                  -- Perf 25/08 : pré-filtre @locs avant le fenêtrage (journal entier sinon) — un
                  -- commitment ne change jamais de site, la partition reste entière.
                  SELECT * EXCEPT(rn) FROM (
                    SELECT saved_item_id, CAST(window_start AS STRING) d, verdict, status,
                           kpi_window_value, kpi_baseline,
                           ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) rn
                    FROM \`${PROJECT}.analytics.action_commitments\`
                    WHERE location_id IN UNNEST(@locs))
                  WHERE rn = 1 AND status != 'cancelled')
                SELECT DISTINCT c.commitment_id, CAST(sd.date AS STRING) d, v.verdict, v.status AS occ_status,
                       v.kpi_window_value AS occ_v, v.kpi_baseline AS occ_base
                FROM cm c
                JOIN \`${PROJECT}.raw.saved_items\` si ON si.saved_item_id = c.saved_item_id AND si.recurrence != 'none'
                JOIN \`${PROJECT}.raw.saved_item_dates\` sd ON sd.saved_item_id = c.saved_item_id
                LEFT JOIN occ_v v ON v.saved_item_id = c.saved_item_id AND v.d = CAST(sd.date AS STRING)
                ORDER BY 1, 2`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // Votre public par site (référent du comparatif « même public que vous », 17/08).
      bq.query({
        query: `SELECT location_id, ANY_VALUE(primary_audience_1) a1, ANY_VALUE(primary_audience_2) a2
                FROM \`${PROJECT}.raw.insight_event_user_location_profile\`
                WHERE location_id IN UNNEST(@locs) GROUP BY 1`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // Produit phare (payload réel de la carte gap du jour) — la ligne « offre signature ».
      bq.query({
        query: `SELECT location_id, data_payload
                FROM \`${PROJECT}.mart.fct_location_daily_action_candidates\`
                WHERE location_id IN UNNEST(@locs) AND action_type = 'competitor_positioning_gap'
                  AND date = CURRENT_DATE()`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // Faits du DERNIER TEST par dispositif (rejeu : dates, KPI, réalisé vs cible, verdict).
      bq.query({
        query: `SELECT bp.practice_id, c.verdict, c.measured_metric, c.kpi_window_value, c.kpi_baseline,
                       c.threshold_basis, c.threshold_value, c.status AS test_status,
                       CAST(c.window_start AS STRING) ws, CAST(c.window_end AS STRING) we
                FROM \`${PROJECT}.analytics.best_practices\` bp
                JOIN (SELECT commitment_id, status, verdict, measured_metric, kpi_window_value, kpi_baseline,
                             threshold_basis, threshold_value, window_start, window_end,
                             ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) rn
                      FROM \`${PROJECT}.analytics.action_commitments\`
                      -- Perf 25/08 : journal pré-filtré aux rejeux du compte avant le fenêtrage.
                      WHERE commitment_id IN (SELECT replay_commitment_id FROM \`${PROJECT}.analytics.best_practices\`
                                              WHERE location_id IN UNNEST(@locs) AND replay_commitment_id IS NOT NULL)) c
                  ON c.commitment_id = bp.replay_commitment_id AND c.rn = 1
                WHERE bp.location_id IN UNNEST(@locs) AND bp.status = 'active'`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // Héros v11 (spec 24/08) — CA quotidien 365 j par site sur LE référentiel arbitré
      // (fct_client_day_residual : réel + attendu dow+tendance). UNE série pour trois usages
      // cohérents : le chiffre (Σ période), le % (vs Σ attendu) et la mini-courbe — l'ancienne
      // tuile « CA multi-site » sommait seulement les jours ayant ≥ 3 pairs même-jour (21
      // site-jours retenus → 36 440 € étiquetés « 30 jours ») : chiffre partiel, référentiel
      // divergent, incompatible avec une courbe. Élucidé + remplacé, cf. docs/piloter-redesign.md.
      bq.query({
        query: `SELECT location_id, CAST(DATE(date) AS STRING) d,
                       ROUND(daily_revenue) ca, ROUND(expected_revenue) exp
                FROM \`${PROJECT}.semantic.vw_insight_event_day_residual\`
                WHERE location_id IN UNNEST(@locs)
                  AND DATE(date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)
                  AND DATE(date) < CURRENT_DATE()
                ORDER BY d`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // Bandeau v10 — valeur des opérations : gap mesuré moyen par saved_item JUGÉ (met/missed,
      // confounded exclus). Indépendant de mesRows (jointure côté client) — zéro aller-retour séquentiel.
      bq.query({
        query: `SELECT saved_item_id, AVG(window_actual_revenue - window_expected_revenue) avg_gap, COUNT(*) n
                FROM \`${PROJECT}.mart.fct_client_commitment_outcomes\`
                WHERE location_id IN UNNEST(@locs) AND saved_item_id IS NOT NULL
                  AND verdict IN ('met','missed') AND is_confounded = FALSE
                GROUP BY 1`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // Événements PUBLICS autour de chaque site (maquette validée 19/08) — LECTURE de la surface
      // MATÉRIALISÉE la nuit (runEventSurface, cron snapshot-competitors) : le calcul géodésique
      // coûtait 10-17 s à la requête (mesuré 19/08) — interdit par le budget 3 s. Entonnoir déjà
      // appliqué à la matérialisation : même bucket que le site + ≤ 15 km, 14 j, dédup nom+lieu
      // au public LU d'abord. Le rayon d'AFFICHAGE (catchment) se tranche côté client.
      bq.query({
        // Les 100 PLUS PROCHES par site (jamais un LIMIT plat : ordonné par location_id il
        // amputait des sites entiers) — la zone (≤ 20 km max) est toujours dedans ; les COMPTES
        // vrais voyagent séparément (requête couverture), l'affichage ne ment jamais.
        query: `SELECT location_id, nom, lieu, ville, d, dfin, pub, gratuit, m
                FROM \`${PROJECT}.analytics.location_public_events\`
                WHERE location_id IN UNNEST(@locs)
                QUALIFY ROW_NUMBER() OVER (PARTITION BY location_id ORDER BY m) <= 100
                ORDER BY location_id, d, m`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // Couverture 30 j (matérialisée) + catchment EN DIRECT sur la dim (le rayon suit la
      // réponse périmètre sans attendre la nuit) + COMPTES VRAIS calculés serveur : n14 (secteur
      // ≤ 15 km) et n_zone (rayon du catchment — le MÊME CASE que dayClassRegistry). Un site
      // sans géo n'a pas de ligne : le bloc ne se rend pas. Table absente → catch → bloc absent.
      bq.query({
        query: `SELECT c.location_id, ANY_VALUE(cl.client_catchment) catchment, ANY_VALUE(c.n30) n30,
                       COUNT(e.nom) n14,
                       COUNTIF(e.m <= CASE cl.client_catchment WHEN 'commune' THEN 1000 WHEN 'beyond' THEN 20000 ELSE 500 END) n_zone
                FROM \`${PROJECT}.analytics.location_public_events_coverage\` c
                JOIN \`${PROJECT}.dims.dim_client_location\` cl ON cl.location_id = c.location_id
                LEFT JOIN \`${PROJECT}.analytics.location_public_events\` e ON e.location_id = c.location_id
                WHERE c.location_id IN UNNEST(@locs)
                GROUP BY c.location_id, cl.client_catchment`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // Décomposition funnel des fenêtres ouvertes (arbitrage owner 24/08 : un écart € ne
      // s'affiche jamais seul). Sommes mesurées + attendues PAR FACTEUR sur le référentiel
      // UNIQUE de day_residual (jamais les baselines 28 j de sales_signals) — ratio des
      // sommes : CA = passages × conversion × panier ferme exactement, la phrase du client
      // décompose l'écart sans mélange de référentiels. Deux jeux de jours alignés : n2 =
      // jours avec attendu ventes (funnel ventes × panier), n3 = jours avec attendu
      // visiteurs AUSSI (funnel complet) — un facteur absent reste NULL, jamais inventé.
      bq.query({
        query: `WITH cm AS (
                  SELECT * EXCEPT(rn) FROM (
                    SELECT commitment_id, location_id, status, window_start, window_end,
                           ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) rn
                    FROM \`${PROJECT}.analytics.action_commitments\`
                    WHERE location_id IN UNNEST(@locs))
                  WHERE rn = 1 AND status = 'open' AND window_end > window_start),
                d AS (
                  SELECT c.commitment_id, r.daily_revenue, r.expected_revenue,
                         s.daily_visitors, s.daily_transactions,
                         r.expected_visitors, r.expected_transactions
                  FROM cm c
                  JOIN \`${PROJECT}.semantic.vw_insight_event_day_residual\` r
                    ON r.location_id = c.location_id
                   AND r.date BETWEEN c.window_start AND LEAST(c.window_end, CURRENT_DATE('Europe/Paris'))
                  LEFT JOIN \`${PROJECT}.mart.fct_client_sales_signals_daily\` s
                    ON s.location_id = c.location_id AND s.transaction_date = r.date)
                SELECT commitment_id,
                  COUNTIF(expected_transactions IS NOT NULL) n2,
                  ROUND(SUM(IF(expected_transactions IS NOT NULL, daily_revenue, NULL)), 0) m_rev2,
                  ROUND(SUM(IF(expected_transactions IS NOT NULL, expected_revenue, NULL)), 0) e_rev2,
                  SUM(IF(expected_transactions IS NOT NULL, daily_transactions, NULL)) m_tx2,
                  ROUND(SUM(IF(expected_transactions IS NOT NULL, expected_transactions, NULL)), 0) e_tx2,
                  COUNTIF(expected_visitors IS NOT NULL AND expected_transactions IS NOT NULL) n3,
                  ROUND(SUM(IF(expected_visitors IS NOT NULL AND expected_transactions IS NOT NULL, daily_revenue, NULL)), 0) m_rev3,
                  ROUND(SUM(IF(expected_visitors IS NOT NULL AND expected_transactions IS NOT NULL, expected_revenue, NULL)), 0) e_rev3,
                  SUM(IF(expected_visitors IS NOT NULL AND expected_transactions IS NOT NULL, daily_visitors, NULL)) m_vis3,
                  ROUND(SUM(IF(expected_visitors IS NOT NULL AND expected_transactions IS NOT NULL, expected_visitors, NULL)), 0) e_vis3,
                  SUM(IF(expected_visitors IS NOT NULL AND expected_transactions IS NOT NULL, daily_transactions, NULL)) m_tx3,
                  ROUND(SUM(IF(expected_visitors IS NOT NULL AND expected_transactions IS NOT NULL, expected_transactions, NULL)), 0) e_tx3
                FROM d GROUP BY 1`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // Marges par famille (owner 24/08) — CA 30 j par famille produit et par site, la base du
      // KPI profit progressif (Σ CA_famille × marge_famille sur les familles déclarées).
      // Fenêtre BORNÉE à CURRENT_DATE() : la graine porte des dates FUTURES (vérifié 24/08,
      // max 2026-09-30 chez f10c3e58) — sans la borne haute la « fenêtre 30 j » compte 68 jours.
      bq.query({
        query: `SELECT location_id, item_category, ROUND(SUM(revenue), 0) AS ca30
                FROM \`${PROJECT}.mart.fct_client_offering_daily\`
                WHERE location_id IN UNNEST(@locs)
                  AND transaction_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) AND CURRENT_DATE()
                GROUP BY 1, 2 ORDER BY 3 DESC`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]),
      // Bandeau membre (vue équipe inc 3 — membre SEUL, l'owner ne paie pas la requête) :
      // volume d'achats + affluence + conversion, 30 derniers jours vs les 90 précédents
      // (convention poleReading). Borne haute STRICTE < CURRENT_DATE() : la graine porte des
      // dates FUTURES (revérifié 28/08 : max 2026-09-30 chez f10c3e58). Grain du mart =
      // location × date × source_type → agrégats par fenêtre (la conversion se recalcule
      // Σtx/Σvisiteurs, jamais une moyenne de taux). Aucun CA, aucun champ €.
      role === "member" ? bq.query({
        query: `SELECT location_id,
                       CASE WHEN transaction_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) THEN 'a' ELSE 'b' END AS w,
                       COUNT(DISTINCT transaction_date) AS n_days,
                       SUM(daily_transactions) AS tx,
                       SUM(daily_visitors) AS vis
                FROM \`${PROJECT}.mart.fct_client_daily_performance\`
                WHERE location_id IN UNNEST(@locs)
                  AND transaction_date < CURRENT_DATE()
                  AND transaction_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 120 DAY)
                GROUP BY 1, 2`,
        params: { locs }, location: "EU",
      }).catch(() => [[]]) : Promise.resolve([[]]),
    ]);

    const opsValue = (opsValRows as any[]).map((r) => ({ saved_item_id: str(r.saved_item_id), avg_gap: num(r.avg_gap), n: num(r.n) ?? 0 }));

    const siteLabel: Record<string, string> = {};
    for (const r of labelRows as any[]) siteLabel[String(str(r.location_id))] = String(str(r.label) ?? "");

    const alerts = (alertRows as any[]).map((r) => ({ location_id: str(r.location_id), date: str(r.d), subtype: str(r.change_subtype), km: num(r.km) }));
    const alertKeys = new Set(alerts.map((a) => a.location_id + "|" + a.date));

    const operations = (occRows as any[]).map((r) => {
      const target = num(r.kpi_target_eur) != null ? `${num(r.kpi_target_eur)} €`
        : num(r.kpi_target_pct) != null ? `+${Math.round(num(r.kpi_target_pct)!)} %` : null;
      return {
        saved_item_id: str(r.saved_item_id),
        location_id: str(r.location_id),
        site_label: siteLabel[String(str(r.location_id))] || null,
        title: str(r.title),
        occ_date: str(r.occ_date),
        occ_num: Number(num(r.n_past) ?? 0) + Number(num(r.occ_rank_upcoming) ?? 1),
        n_total: num(r.n_total),
        kpi: str(r.kpi), kpi_family: str(r.kpi_family), target,
        owner: str(r.author_person_name),
        ready_com: Number(num(r.n_com) ?? 0) > 0,
        ready_snap: Number(num(r.n_snap) ?? 0) > 0,
        weather_lvl: num(r.lvl_max),
        competitor_flag: alertKeys.has(String(str(r.location_id)) + "|" + String(str(r.occ_date))),
      };
    });

    const coms = (comRows as any[]).map((r) => ({
      commitment_id: str(r.commitment_id), location_id: str(r.location_id),
      site_label: siteLabel[String(str(r.location_id))] || null,
      done: str(r.action_done_status),
      status: str(r.status), verdict: str(r.verdict), owner: str(r.owner_person_name),
      text: str(r.committed_action_text), metric: str(r.measured_metric),
      threshold_basis: str(r.threshold_basis), threshold_value: num(r.threshold_value),
      saved_item_id: str(r.saved_item_id), ws: str(r.ws), we: str(r.we),
      origin: str(r.origin_action_type), days_to_end: num(r.days_to_end),
      created_d: str(r.created_d),
      in_period: flat(r.in_period) === true,
      // Vue équipe inc 3 : le lien pôle (filtre de périmètre membre) — dispositif_id
      // identifie le pôle lui-même, attached_pole_id une opération rattachée.
      dispositif_id: str(r.dispositif_id), attached_pole_id: str(r.attached_pole_id),
    }));
    const todayYmd = new Date().toISOString().slice(0, 10);
    const open = coms.filter((c) => c.status === "open");
    // DEUX registres (owner 05/08) : « jugées » = TOUS les verdicts rendus (journal) ;
    // « € » = le mart seulement (contrat : non déclarée pas-menée — fait par défaut).
    // « Jugées » = verdicts MESURABLES (met/missed) — un confounded n'est ni tenu ni manqué,
    // il est compté à part (owner 05/08 : non-mesurable ≠ manqué, ni en tuile ni en tenue).
    const judged = coms.filter((c) => c.status === "resolved" && c.verdict && c.verdict !== "confounded" && c.in_period);
    const ownerByCommitment: Record<string, string> = {};
    for (const c of coms) if (c.commitment_id) ownerByCommitment[c.commitment_id] = c.owner || "—";
    // Un verdict « confounded » est NON MESURABLE (guardrail 3 du mart) : jamais dans les €,
    // compté à part — le mart le garde flaggé, le tableau respecte le flag.
    const mart365 = (outRows as any[]).map((r) => ({ commitment_id: String(str(r.commitment_id)), beat: flat(r.beat) === true, verdict: str(r.verdict), resolved_date: str(r.resolved_date), gap_eur: num(r.gap_eur), location_id: str(r.location_id) }));
    const periodCut = new Date(Date.parse(todayYmd + "T12:00:00Z") - period * 86_400_000).toISOString().slice(0, 10);
    const martAll = mart365.filter((r) => String(r.resolved_date || "") >= periodCut);
    const martRows = martAll.filter((r) => r.verdict !== "confounded");
    const confoundedCount = martAll.length - martRows.length;
    const gapSum = martRows.length ? martRows.reduce((a, r) => a + (r.gap_eur ?? 0), 0) : null;
    const martGap: Record<string, number | null> = {};
    for (const r of mart365) martGap[r.commitment_id] = r.gap_eur;
    // Tenue par personne : verdicts rendus sur la période + € mesurés de LEURS fenêtres.
    // personKey / isKeptVerdict : règles partagées (actionCommitments, extraites 27/08).
    const equipe: Record<string, { label: string; open: any[]; kept: number; judged: number; gap: number | null }> = {};
    for (const c of coms) {
      const k = personKey(c.owner);
      equipe[k] = equipe[k] || { label: String(c.owner || "—"), open: [], kept: 0, judged: 0, gap: null };
      if (String(c.owner || "").length > equipe[k].label.length) equipe[k].label = String(c.owner);
      if (c.status === "open") equipe[k].open.push({ text: c.text, saved_item_id: c.saved_item_id, site_label: c.site_label, we: c.we, days_to_end: c.days_to_end });
      else if (c.verdict && c.verdict !== "confounded" && c.in_period) { equipe[k].judged += 1; if (isKeptVerdict(c.verdict)) equipe[k].kept += 1; }
    }
    for (const r of martRows) {
      const k = personKey(ownerByCommitment[r.commitment_id] || null);
      if (equipe[k]) equipe[k].gap = (equipe[k].gap ?? 0) + (r.gap_eur ?? 0);
    }

    const bilans = (bilanRows as any[]).map((r) => ({ title: str(r.title), saved_item_id: str(r.saved_item_id), location_id: str(r.location_id), fin: str(r.fin) })).filter((b) => b.title);
    const corrections = (corrRows as any[]).map((r) => str(r.correction_type)).filter(Boolean);

    // ── Marges par famille + KPI profit progressif (owner 24/08). ──
    // profit = Σ CA_famille_30j × marge_famille sur les familles DÉCLARÉES — jamais un chiffre
    // qui prétend être complet : la couverture (CA couvert / CA total 30 j) voyage avec.
    // Flux historique conservé (ADD, don't REPLACE) : une marge GLOBALE active couvre 100 % du
    // CA de son site tant qu'aucune famille n'y est déclarée.
    const famMarginBySite: Record<string, Record<string, { pct: number; famille: string | null }>> = {};
    const globalMarginBySite: Record<string, number> = {};
    for (const r of corrRows as any[]) {
      const lid = String(str(r.location_id));
      const t = String(str(r.correction_type) ?? "");
      const v = Number(String(str(r.correction_text) ?? "").replace(",", "."));
      if (!Number.isFinite(v) || v < 1 || v > 90) continue;
      if (t === "declared_margin_pct") globalMarginBySite[lid] = v;
      else if (t.startsWith(MARGIN_FAMILY_PREFIX)) {
        (famMarginBySite[lid] = famMarginBySite[lid] || {})[t.slice(MARGIN_FAMILY_PREFIX.length)] = { pct: v, famille: str(r.raw_turn) };
      }
    }
    const margesFamilles = (famCaRows as any[]).map((r) => {
      const lid = String(str(r.location_id));
      const cat = String(str(r.item_category) ?? "");
      const m = (famMarginBySite[lid] || {})[familySlug(cat)] || null;
      return { location_id: lid, famille: cat, ca30: Number(num(r.ca30) ?? 0), marge_pct: m ? m.pct : null };
    }).filter((f) => f.famille && f.ca30 > 0);
    let _profitEur = 0, _caCovered = 0, _caTotal = 0;
    {
      const bySite: Record<string, typeof margesFamilles> = {};
      for (const f of margesFamilles) (bySite[f.location_id] = bySite[f.location_id] || []).push(f);
      for (const lid of Object.keys(bySite)) {
        const fams = bySite[lid];
        const siteCa = fams.reduce((a, f) => a + f.ca30, 0);
        _caTotal += siteCa;
        const declared = fams.filter((f) => f.marge_pct != null);
        if (declared.length) {
          for (const f of declared) { _profitEur += f.ca30 * ((f.marge_pct as number) / 100); _caCovered += f.ca30; }
        } else if (globalMarginBySite[lid] != null) {
          _profitEur += siteCa * (globalMarginBySite[lid] / 100); _caCovered += siteCa;
        }
      }
    }
    const marges = {
      familles: margesFamilles.map((f) => ({ ...f, part_pct: _caTotal > 0 ? Math.round((f.ca30 / _caTotal) * 100) : null })),
      profit30: _caCovered > 0 ? Math.round(_profitEur) : null,
      couverture_pct: _caTotal > 0 && _caCovered > 0 ? Math.min(100, Math.round((_caCovered / _caTotal) * 100)) : null,
      n_declarees: margesFamilles.filter((f) => f.marge_pct != null).length,
      n_familles: margesFamilles.length,
    };
    // Armement (cas 1) : dernier tir par pratique + détectabilité v1 (vérité serveur — miroir
    // de HEAT_DETECTABLE du dispatch) ; le client n'invente pas ce qui est branchable.
    const trigByPractice: Record<string, { last_fired: string | null; n: number }> = {};
    for (const r of trigRows as any[]) trigByPractice[String(str(r.practice_id))] = { last_fired: str(r.last_fired), n: Number(num(r.n_triggers) ?? 0) };
    const heatBySite: Record<string, { n_hot_30: number; next_hot: string | null }> = {};
    const hotDatesBySite: Record<string, string[]> = {};
    for (const r of heatRows as any[]) {
      const l = String(str(r.location_id));
      heatBySite[l] = { n_hot_30: Number(num(r.n_hot_30) ?? 0), next_hot: str(r.next_hot) };
      hotDatesBySite[l] = Array.isArray(flat(r.hot_dates)) ? (flat(r.hot_dates) as any[]).map((d) => String(flat(d))) : [];
    }
    const ARMABLE_V1 = new Set(["structural_traffic_high"]);
    const practices = (bpRows as any[]).map((r) => {
      const pid = String(str(r.practice_id));
      const locId = String(str(r.location_id));
      const trig = trigByPractice[pid] || { last_fired: null, n: 0 };
      return {
        practice_id: str(r.practice_id), location_id: str(r.location_id), text: str(r.practice_text), status: str(r.status), author: str(r.author_person_name), date: str(r.d), replay_commitment_id: str(r.replay_commitment_id), origin_action_type: str(r.origin_action_type),
        armable: ARMABLE_V1.has(String(str(r.origin_action_type) || "")),
        arm_enabled: flat(r.arm_enabled) === true,
        arm_recipient_name: str(r.arm_recipient_name), arm_recipient_contact: str(r.arm_recipient_contact),
        arm_cooldown: Number(num(r.arm_cooldown) ?? 7),
        arm_last_fired: trig.last_fired, arm_n_triggers: trig.n,
        arm_signal_ctx: heatBySite[locId] || null,
        replay_status: str(r.replay_status),
        // Tier canonique (bestPractices.ts) : prouvée ssi rejeu au verdict 'met' (dernier état).
        // Statuts owner 17/08 : en test (ex-déclaré fusionné) · prouvé (cible atteinte) ·
        // écarté (cible manquée proprement — pas rejouable tel quel) ; non concluant → en test.
        tier: String(str(r.status)) !== "active" ? "archivee"
          : str(r.replay_commitment_id) && String(str(r.replay_status)) === "open" ? "en_test"
          : str(r.replay_commitment_id) && String(str(r.replay_verdict)) === "met" ? "prouvee"
          : str(r.replay_commitment_id) && String(str(r.replay_verdict)) === "missed" ? "ecartee"
          : "declaree",
      };
    });
    const practiceCounts = {
      proven: Number(num((bpCountRows as any[])[0]?.n_proven) ?? 0),
      en_test: Number(num((bpCountRows as any[])[0]?.n_rejeu) ?? 0),
      declared: Number(num((bpCountRows as any[])[0]?.n_declared) ?? 0),
    };
    // Gestes de connaissance (owner 05/08 — « les compteurs sans les gestes qui les font
    // avancer ») : verdicts tenus sans dispositif du même type documenté ; déclarés sans rejeu ;
    // rejeux en cours (ceux-là avancent seuls).
    const practiceTypes = new Set(practices.map((pr) => pr.origin_action_type).filter(Boolean));
    const toDocument = coms.filter((c) => c.status === "resolved" && /met|tenu|beat/i.test(String(c.verdict || "")) && !(c.origin && practiceTypes.has(c.origin))).length;
    const openById: Record<string, any> = {};
    for (const c of open) if (c.commitment_id) openById[c.commitment_id] = c;
    const replaysRunning = practices.filter((pr) => pr.replay_commitment_id && openById[pr.replay_commitment_id])
      .map((pr) => ({ end: openById[pr.replay_commitment_id!].we }));
    // Un rejeu ANNULÉ ne compte pas comme rejeu : la pratique redevient prouvable.
    const declaredNoReplay = practices.filter((pr) => pr.tier === "declaree" && (!pr.replay_commitment_id || pr.replay_status === "cancelled")).length;

    // Score de série : le verdict de l'occurrence PRÉCÉDENTE d'un événement récurrent.
    for (const o of operations as any[]) {
      o.prev_occ = null;
      if (Number(o.n_total) > 1 && o.saved_item_id) {
        const prevs = coms.filter((c) => c.saved_item_id === o.saved_item_id && c.status !== "cancelled" && c.ws && c.ws < todayYmd)
          .sort((a, b) => String(b.ws).localeCompare(String(a.ws)));
        if (prevs[0]) o.prev_occ = { verdict: prevs[0].verdict, gap_eur: prevs[0].commitment_id ? martGap[prevs[0].commitment_id] ?? null : null };
      }
    }
    // Dernier verdict rendu (récence) + dernière recette PROUVÉE (verdict tenu).
    const resolvedV = coms.filter((c) => c.status === "resolved" && c.verdict)
      .sort((a, b) => String(b.we || "").localeCompare(String(a.we || "")));
    const lv = resolvedV[0] || null;
    const lastVerdict = lv ? { text: lv.text, verdict: lv.verdict, we: lv.we, gap_eur: lv.commitment_id ? martGap[lv.commitment_id] ?? null : null } : null;
    const mr = resolvedV.filter((c) => c.verdict === "met")[0] || null;
    const metRecipe = mr ? { text: mr.text, ws: mr.ws, we: mr.we, gap_eur: mr.commitment_id ? martGap[mr.commitment_id] ?? null : null } : null;
    // Impacts de classes au REGISTRE CANONIQUE : lignes store par site → pipeline
    // rowsToImpactsWithImmaterial (médiane €/j, eur_year annualisé, tier estimé/mesuré).
    const annualRevBySite: Record<string, number | null> = {};
    for (const r of annualRevRows as any[]) {
      const v = Number(flat(r.annual_revenue));
      annualRevBySite[String(str(r.location_id))] = Number.isFinite(v) && v > 0 ? v : null;
    }
    const dcBySite: Record<string, any[]> = {};
    for (const r of dcRows as any[]) {
      const l = String(str(r.location_id));
      (dcBySite[l] = dcBySite[l] || []).push(r);
    }
    const impactsBySite: Record<string, Map<string, any>> = {};
    for (const l of Object.keys(dcBySite)) {
      impactsBySite[l] = rowsToImpactsWithImmaterial(dcBySite[l], annualRevBySite[l] ?? null).impacts;
    }
    const activeComs = coms.filter((c) => c.status !== "cancelled");
    let occPlayed = 0, occTotal = 0;
    const occBySite: any[] = [];
    for (const l of Object.keys(hotDatesBySite)) {
      const days = hotDatesBySite[l];
      if (!days.length) continue;
      const missed = days.filter((d) => !activeComs.some((c) => c.location_id === l && c.ws && c.we && c.ws <= d && d <= c.we));
      occPlayed += days.length - missed.length; occTotal += days.length;
      occBySite.push({ location_id: l, site_label: siteLabel[l] || null, total: days.length, played: days.length - missed.length, missed_dates: missed });
    }
    // Prochaine occasion : parmi les sites avec un jour chaud annoncé, PRÉFÉRER celui dont
    // l'effet chaleur est CHIFFRÉ au registre — « à récupérer » doit porter un nombre (owner
    // 10/08 : « How much? Don't understand ») ; à défaut de site chiffré, le plus proche.
    const heatRangeOf = (l: string): { mn: number; mx: number } | null => {
      const vals: number[] = [];
      if (impactsBySite[l]) for (const [k, imp] of impactsBySite[l]) if (/^heat_/.test(k)) vals.push(Number(imp.avg_gap_eur) || 0);
      return vals.length ? { mn: Math.min(...vals), mx: Math.max(...vals) } : null;
    };
    let nextHot: string | null = null, nextHotSite: string | null = null, nextHotRange: { mn: number; mx: number } | null = null;
    for (const l of Object.keys(heatBySite)) {
      const nh = heatBySite[l].next_hot;
      if (!nh) continue;
      const rg = heatRangeOf(l);
      const better = !nextHot || (!!rg && !nextHotRange) || (!!rg === !!nextHotRange && nh < String(nextHot));
      if (better) { nextHot = nh; nextHotSite = l; nextHotRange = rg; }
    }
    const occasions = {
      next_hot: nextHot,
      next_hot_site_label: nextHotSite ? siteLabel[nextHotSite] || null : null,
      heat_range: nextHotRange,
      played: occPlayed, total: occTotal, by_site: occBySite,
    };
    // Apprentissages : impacts GATED du registre, famille 'card' exclue (populations de tirs,
    // pas des jours vécus — même filtre que les motifs structurels de Pulse), top |€/an|,
    // un par classe. États alignés sur Pulse : couvert (dispositif actif structural_<key>) /
    // en test (engagement OUVERT structural_<key> sur le site — règle de suppression 03/08).
    const allImpacts: any[] = [];
    for (const l of Object.keys(impactsBySite)) {
      for (const [, imp] of impactsBySite[l]) {
        if (String(imp.family || "") === "card") continue;
        allImpacts.push({ ...imp, location_id: l });
      }
    }
    const seenClass = new Set<string>();
    const learnings = allImpacts
      .sort((a, b) => Math.abs(b.eur_year ?? 0) - Math.abs(a.eur_year ?? 0))
      .filter((r) => (seenClass.has(r.class_key) ? false : (seenClass.add(r.class_key), true)))
      .slice(0, 3)
      .map((r) => {
        const test = coms.filter((c) => (c.status === "open" || c.status === "pending")
          && c.location_id === r.location_id && c.origin === "structural_" + r.class_key)[0] || null;
        return {
          class_key: r.class_key, label_fr: r.label_fr, family: r.family, location_id: r.location_id,
          site_label: siteLabel[r.location_id] || null, n_days: r.n_days, span_months: r.span_months,
          avg_gap_eur: r.avg_gap_eur, eur_year: r.eur_year, tier_label_fr: r.tier_label_fr,
          covered: practices.some((p) => p.location_id === r.location_id && p.status === "active" && p.origin_action_type === "structural_" + r.class_key),
          in_test: test ? { end: test.we } : null,
        };
      });

    // ═══ Vue équipe inc 3 — réponse MEMBRE : liste blanche de blocs, jamais un masquage
    // client (docs/vue-equipe-slack-spec.md, arbitrage chiffres 28/08 : occasions d'agir
    // oui, état du business jamais). Les blocs impact/€ cumulés/marges/CA quotidien/équipe/
    // prouvés/veille/débloquer/automatisations NE SONT PAS ENVOYÉS. Périmètre : les pôles
    // du membre — le pôle lui-même (dispositif_id) et les opérations rattachées
    // (attached_pole_id) ; une occurrence passe si un engagement de son saved_item passe.
    if (role === "member") {
      const comPasses = (c: any) => {
        const poles = new Set((memberPoles[String(c.location_id)] || []).map(String));
        return (c.dispositif_id != null && poles.has(String(c.dispositif_id)))
            || (c.attached_pole_id != null && poles.has(String(c.attached_pole_id)));
      };
      const memberSavedItems = new Set(coms.filter(comPasses).map((c) => c.saved_item_id).filter(Boolean).map(String));
      return json(200, {
        ok: true,
        role: "member",
        period_days: period,
        multi_site: locs.length > 1,
        sites: locs.map((l) => ({ location_id: l, label: siteLabel[l] || "" })),
        operations: (operations as any[]).filter((o) => o.saved_item_id != null && memberSavedItems.has(String(o.saved_item_id))),
        open_commitments: open.filter(comPasses).map((c) => ({ commitment_id: c.commitment_id, text: c.text, owner: c.owner, location_id: c.location_id, site_label: c.site_label, ws: c.ws, we: c.we, metric: c.metric, threshold_value: c.threshold_value, saved_item_id: c.saved_item_id, days_to_end: c.days_to_end, is_event: /^event_/.test(String(c.origin || "")) })),
        bandeau: (bandeauRows as any[]).map((r) => ({
          location_id: str(r.location_id), w: str(r.w),
          n_days: Number(num(r.n_days) ?? 0), tx: Number(num(r.tx) ?? 0), vis: Number(num(r.vis) ?? 0),
        })),
      });
    }

    return json(200, {
      ok: true,
      period_days: period,
      impact: {
        gap_eur: gapSum,
        eur_windows: martRows.length,
        confounded: confoundedCount,
        windows_judged: judged.length,
        targets_met: judged.filter((c) => /met|tenu|beat/i.test(String(c.verdict))).length,
        // Tier canonique + compte SANS LIMIT — l'ancien `status === "proven"` n'était jamais vrai.
        practices_proven: practiceCounts.proven,
        next_judgment: open.map((c) => c.we).filter((d) => d && String(d) >= todayYmd).sort()[0] || null,
      },
      // Dérivation des périodes CÔTÉ CLIENT (bascule instantanée, zéro re-fetch) : lignes mart
      // 365 j + méta des verdicts (created_d) — égalité serveur/client prouvée au harnais 09/08.
      impact_rows: mart365,
      judged_meta: coms.filter((c) => c.status === "resolved" && c.verdict).map((c) => ({ verdict: c.verdict, created_d: c.created_d, location_id: c.location_id })),
      practice_counts: practiceCounts,
      // Série CA quotidienne (365 j, par site) — chiffre/%/courbe dérivés CLIENT par période et par site.
      // (le `ca30` serveur de la branche marges est REMPLACÉ par cette dérivation client — pas repris.)
      ca_daily: (caDailyRows as any[]).map((r) => ({ l: str(r.location_id), d: str(r.d), ca: num(r.ca) ?? 0, exp: num(r.exp) })),
      marges,
      ops_value: opsValue,
      last_verdict: lastVerdict,
      met_recipe: metRecipe,
      occasions,
      learnings,
      learned_classes: new Set(allImpacts.map((r) => r.class_key)).size,
      sales_depth: (freshRows as any[]).map((r) => ({
        location_id: str(r.location_id), site_label: siteLabel[String(str(r.location_id))] || null,
        n_days: Number(num(r.n_days) ?? 0), first_sale: str(r.first_sale), last_sale: str(r.last_sale),
      })),
      multi_site: locs.length > 1,
      sites: locs.map((l) => ({ location_id: l, label: siteLabel[l] || "" })),
      operations,
      open_commitments: open.map((c) => ({ commitment_id: c.commitment_id, text: c.text, owner: c.owner, location_id: c.location_id, site_label: c.site_label, ws: c.ws, we: c.we, metric: c.metric, threshold_value: c.threshold_value, saved_item_id: c.saved_item_id, days_to_end: c.days_to_end, is_event: /^event_/.test(String(c.origin || "")) })),
      equipe: Object.values(equipe).map((e) => ({ who: e.label, open: e.open, judged: e.judged, kept: e.kept, gap_eur: e.gap })),
      practices,
      automated: {
        armed_dispositifs: practices.filter((p) => p.arm_enabled).map((p) => ({
          practice_id: p.practice_id, location_id: p.location_id,
          site_label: siteLabel[String(p.location_id)] || null,
          text: p.text, last_fired: p.arm_last_fired, n_triggers: p.arm_n_triggers,
        })),
        consignes: (consigneRows as any[]).map((r) => {
          const off = num(r.consigne_send_offset) != null ? Number(num(r.consigne_send_offset)) : 2;
          const nextOcc = String(str(r.next_occ) || "");
          const t = new Date(nextOcc + "T12:00:00Z");
          t.setUTCDate(t.getUTCDate() - off);
          return {
            saved_item_id: str(r.saved_item_id), location_id: str(r.location_id),
            site_label: siteLabel[String(str(r.location_id))] || null,
            title: str(r.title), send_offset: off,
            next_send: t.toISOString().slice(0, 10),
            last_sent_on: str(r.last_sent_on), last_n_recipients: num(r.last_n),
          };
        }),
        competitor_alerts_7d: alerts,
      },
      // ═══ GLANCE (refonte 13/08) — mise en forme minimale ; le client assemble l'écran. ═══
      glance: (() => {
        // Veille dédoublonnée par la CLÉ Google (jamais le nom : deux fiches homonymes peuvent
        // être deux lieux, deux noms différents le même lieu). Sans clé = fiche à identifier.
        const parLieu: Record<string, any> = {}; const sansCle: any[] = [];
        for (const v of veilleRows as any[]) {
          const k = str(v.google_place_id);
          const row = { location_id: str(v.location_id), nom: str(v.competitor_name), age_j: num(v.age_j), a_url: !!flat(v.source_url) };
          if (!k) { sansCle.push(row); continue; }
          if (!parLieu[k]) parLieu[k] = { ...row, fiches: 0 };
          parLieu[k].fiches++;
          if (row.age_j != null && (parLieu[k].age_j == null || row.age_j < parLieu[k].age_j)) { parLieu[k].age_j = row.age_j; parLieu[k].nom = row.nom; }
        }
        return {
          tendance: (tendRows as any[]).map((r) => ({ commitment_id: str(r.commitment_id), metric: str(r.metric), jours: num(r.jours), ecart_pct: num(r.ecart_pct) })),
          veille: { lieux: Object.values(parLieu), sans_cle: sansCle },
          offres: (offChgRows as any[]).map((r) => ({ nom: str(r.competitor_name), item: str(r.item), change_type: str(r.change_type), direction: str(r.price_direction), avant: num(r.old_price_numeric), apres: num(r.new_price_numeric), pct: num(r.price_pct_change), qualif: str(r.new_price_qualifier), vu_le: str(r.vu_le), src_url: str(r.src_url) })),
          offres_base: { n_tarifs: Number(num((offBaseRows as any[])[0]?.n_tarifs) ?? 0), n_lieux: Number(num((offBaseRows as any[])[0]?.n_lieux) ?? 0) },
          par_site: (covSiteRows as any[]).map((r) => ({ location_id: str(r.location_id), site_label: siteLabel[String(str(r.location_id))] || null, n_total: num(r.n_total), n_suivis: num(r.n_suivis) })),
          // Suivis réels par site (watched_competitors × location_id) — pour l'amorçage
          // « découvrir des concurrents » (23/08). Tous les sites demandés, 0 inclus.
          watched_par_site: locs.map((l) => {
            const w = (watchedRows as any[]).find((r) => String(str(r.location_id)) === String(l));
            return { location_id: String(l), site_label: siteLabel[String(l)] || null, n_watched: w ? num(w.n_watched) : 0 };
          }),
          trous: (trousRows as any[]).map((r) => ({ nom: str(r.competitor_name), km: num(r.km), overlap: num(r.overlap), place_id: str(r.google_place_id), city: str(r.city), location_id: str(r.location_id) })),
          // Mon positionnement (17/08) : la fiche factuelle par suivi — on nomme ou on se tait.
          fiches: (ficheRows as any[]).map((r) => {
            // Fiche enrichie (validé owner 17/08) : analyse competitor-profile + actu commerciale,
            // parsées ICI — la page reste bête, un JSON illisible = section absente, jamais un throw.
            let ana: any = null, actu: any = null;
            try {
              const a = JSON.parse(String(str(r.ana_json) || "null"));
              if (a) ana = {
                value_prop: a.value_prop_theirs || null,
                prix: (Array.isArray(a.price_comparison) ? a.price_comparison : []).slice(0, 4).map((x: any) => ({
                  cat: x.category || null, eux: x.their_item || null, eux_prix: x.their_price || null,
                  vous: x.your_item || null, vous_prix: x.your_price || null, signal: x.signal || null, lecture: x.reading || null,
                })),
                gaps: (Array.isArray(a.product_gaps) ? a.product_gaps : []).slice(0, 3),
              };
            } catch { /* analyse illisible → absente */ }
            try {
              const n = JSON.parse(String(str(r.news_json) || "null"));
              if (n) actu = {
                lead: n.lead || null,
                mises: (Array.isArray(n.mises_en_avant) ? n.mises_en_avant : []).slice(0, 4),
                autres_offres: n.autres_offres || null,
                sources: (Array.isArray(n.sources) ? n.sources : []).slice(0, 4),
                lu_le: str(r.news_at),
              };
            } catch { /* actu illisible → absente */ }
            return {
              location_id: str(r.location_id), cid: str(r.cid), site: siteLabel[String(str(r.location_id))] || null, nom: str(r.nom),
              note: num(r.note), avis: num(r.avis), audience: str(r.audience), audience2: str(r.audience2),
              p_min: num(r.p_min), p_max: num(r.p_max), n_tarifs: num(r.n_tarifs) ?? 0,
              overlap_pct: num(r.overlap_pct), km: num(r.km), analyse: ana, actu,
              // P3.1-f : suivi posé par le système à l'onboarding → la fiche le dit (« suivi proposé — ajustez »).
              proposed: r.proposed === true || (r.proposed && (r.proposed as any).value === true) || false,
              nuits_30j: num(r.nuits_30j), hausses: num(r.hausses), baisses: num(r.baisses),
              avis_30j: num(r.avis_30j),
              prochain_nom: str(r.prochain_nom), prochain_date: str(r.prochain_date), evts_a_venir: num(r.evts_a_venir),
            };
          }),
          audiences: (audRows as any[]).map((r) => ({ location_id: str(r.location_id), a1: str(r.a1), a2: str(r.a2) })),
          gap_facts: (gapRows as any[]).map((r) => {
            let pl: any = {};
            try { pl = JSON.parse(String(str(r.data_payload) || "{}")); } catch { /* payload illisible → ligne absente */ }
            return { location_id: str(r.location_id), item: pl.top_item_description || null,
                     share: pl.top_item_revenue_share != null ? Number(pl.top_item_revenue_share) : null };
          }),
          tests: (testRows as any[]).map((r) => ({
            practice_id: str(r.practice_id), verdict: str(r.verdict), metric: str(r.measured_metric),
            realized: num(r.kpi_window_value), baseline: num(r.kpi_baseline),
            basis: str(r.threshold_basis), value: num(r.threshold_value), test_status: str(r.test_status),
            ws: str(r.ws), we: str(r.we),
          })),
          evts14: (evts14Rows as any[]).map((r) => ({ location_id: str(r.location_id), d: str(r.d), nom: str(r.event_name), lieu: str(r.venue_name), m: num(r.m), score: num(r.conflict_score), lvl_heat: num(r.lvl_heat), lvl_rain: num(r.lvl_rain), lvl_wind: num(r.lvl_wind), lvl_snow: num(r.lvl_snow), lvl_cold: num(r.lvl_cold) })),
          // Événements publics (entonnoir secteur+15 km) + couverture/catchment par site (19/08).
          evtpub: {
            sites: (evtCovRows as any[]).map((r) => ({ location_id: str(r.location_id), catchment: str(r.catchment), n30: Number(num(r.n30) ?? 0), n14: Number(num(r.n14) ?? 0), n_zone: Number(num(r.n_zone) ?? 0) })),
            evts: (evtPubRows as any[]).map((r) => ({ location_id: str(r.location_id), nom: str(r.nom), lieu: str(r.lieu), ville: str(r.ville), d: str(r.d), dfin: str(r.dfin), m: num(r.m), pub: str(r.pub), gratuit: flat(r.gratuit) === true })),
          },
          habituel_dow: (dowRows as any[]).map((r) => ({ location_id: str(r.location_id), dw: num(r.dw), habituel: num(r.habituel) })),
          savoir: { evts_sans_objectif: Number(num((savoirRows as any[])[0]?.evts_sans_objectif) ?? 0), cartes_bloquees: Number(num((savoirRows as any[])[0]?.cartes_bloquees) ?? 0) },
          cartes: (cartesRows as any[]).map((r) => ({ type: str(r.action_type), cat: str(r.action_category), prio: num(r.action_priority), d: str(r.d), location_id: str(r.location_id) })),
          // Opérations en cours (proto validé 17/08) — 3 variantes : occurrence / fenêtre / série.
          mesures: (mesRows as any[]).map((r) => {
            const cid = str(r.commitment_id);
            const daily = (mesDailyRows as any[]).filter((x) => str(x.commitment_id) === cid && flat(x.v) != null)
              .map((x) => ({ d: str(x.d), v: Number(flat(x.v)) }));
            const occ = (serieRows as any[]).filter((x) => str(x.commitment_id) === cid)
              .map((x) => ({ d: str(x.d), verdict: str(x.verdict), status: str(x.occ_status), v: num(x.occ_v), base: num(x.occ_base) }));
            // Décomposition funnel (24/08) — sommes fenêtre par facteur, référentiel day_residual.
            const fr = (funnelRows as any[]).find((x) => str(x.commitment_id) === cid) || null;
            const funnel = fr ? {
              n2: num(fr.n2) ?? 0, m_rev2: num(fr.m_rev2), e_rev2: num(fr.e_rev2), m_tx2: num(fr.m_tx2), e_tx2: num(fr.e_tx2),
              n3: num(fr.n3) ?? 0, m_rev3: num(fr.m_rev3), e_rev3: num(fr.e_rev3), m_vis3: num(fr.m_vis3), e_vis3: num(fr.e_vis3), m_tx3: num(fr.m_tx3), e_tx3: num(fr.e_tx3),
            } : null;
            return {
              commitment_id: cid, location_id: str(r.location_id),
              metric: str(r.measured_metric) || "revenue_residual",
              basis: str(r.threshold_basis), value: num(r.threshold_value),
              days: num(r.window_days_expected), baseline: num(r.kpi_baseline) ?? num(r.exp_base),
              realized: num(r.realized), ws: str(r.ws), we: str(r.we),
              texte: str(r.committed_action_text),
              famille: str(r.kpi_family), site: str(r.site_label), event_title: str(r.event_title), saved_item_id: str(r.saved_item_id),
              kind: occ.length ? "serie" : (str(r.ws) === str(r.we) ? "occurrence" : "fenetre"),
              daily, occ, funnel,
            };
          }),
        };
      })(),
      debloquer: {
        // Fraîcheur des ventes (P1) : sales_stale = le PIRE site figé (données présentes mais
        // arrêtées ≥ 7 j — un max futur, ex. seed, n'est pas figé) ; sales_missing = sites
        // sans AUCUNE ligne. Premier test (P2) : des ventes existent mais AUCUN engagement
        // (hors annulés) n'a JAMAIS été pris sur le compte — le geste disparaît au premier.
        ...(() => {
          const todayYmd = new Date().toISOString().slice(0, 10);
          const lastBySite: Record<string, string> = {};
          for (const r of freshRows as any[]) lastBySite[String(str(r.location_id))] = String(str(r.last_sale));
          const staleList = locs
            .filter((l) => lastBySite[l] && lastBySite[l] < todayYmd)
            .map((l) => ({
              location_id: l, site_label: siteLabel[l] || null, last_sale_date: lastBySite[l],
              stale_days: Math.round((Date.parse(todayYmd + "T12:00:00Z") - Date.parse(lastBySite[l] + "T12:00:00Z")) / 86_400_000),
            }))
            .filter((s) => s.stale_days >= 7)
            .sort((a, b) => b.stale_days - a.stale_days);
          const missing = locs.filter((l) => !lastBySite[l]).map((l) => ({ location_id: l, site_label: siteLabel[l] || null }));
          const anyCommitEver = (comRows as any[]).some((c) => String(str(c.status)) !== "cancelled");
          const dataSite = locs.find((l) => lastBySite[l]) || null;
          return {
            sales_stale: staleList[0] || null,
            sales_missing: missing,
            first_test: !anyCommitEver && dataSite ? { location_id: dataSite, site_label: siteLabel[dataSite] || null } : null,
          };
        })(),
        team_empty: Number(num((setupRows as any[])[0]?.team_n) ?? 0) === 0,
        channels_missing: Number(num((setupRows as any[])[0]?.chan_n) ?? 0) === 0,
        alerts_prefs_missing: Number(num((setupRows as any[])[0]?.pref_n) ?? 0) === 0,
        alerts_critical_on: flat((setupRows as any[])[0]?.alerts_on) === true,
        team_routing_set: Number(num((setupRows as any[])[0]?.routed_n) ?? 0) > 0,
        margin_declared: corrections.includes("declared_margin_pct"),
        bilans_pending: bilans,
        to_document: toDocument,
        declared_no_replay: declaredNoReplay,
        replays_running: replaysRunning,
      },
    });
  } catch (err: any) {
    const forbidden = /FORBIDDEN/.test(String(err?.message || ""));
    return json(forbidden ? 403 : 500, { ok: false, error: err?.message || "Erreur" });
  }
};
