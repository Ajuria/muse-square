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
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { eventTypeLabelFr } from "../../../lib/eventTypes";

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
    const locFilter = String(url.searchParams.get("location_id") || "").trim();
    if (locFilter) requireLocationOwnership(locals, locFilter);
    const locs = locFilter ? [locFilter] : allLocs;
    if (!locs.length) return json(400, { ok: false, error: "aucun site" });
    const uid = String((locals as any)?.clerk_user_id || "").trim();
    const period = [30, 90, 365].includes(Number(url.searchParams.get("period"))) ? Number(url.searchParams.get("period")) : 30;
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
    const P = { locs, period };

    const [[occRows], [comRows], [outRows], [bpRows], [alertRows], [bilanRows], [corrRows], [snapRows], [labelRows], [setupRows], [trigRows], [heatRows], [freshRows], [consigneRows]] = await Promise.all([
      // Occurrences à venir (60 j, cap 20) + prêt/pas prêt + météo du jour (niveau max).
      bq.query({
        query: `WITH occ AS (
                  SELECT si.saved_item_id, si.location_id, si.title, si.event_type, si.kpi, si.kpi_family,
                         si.kpi_target_pct, si.kpi_target_eur, si.duration_days, si.author_person_name,
                         CAST(d.date AS STRING) AS occ_date,
                         ROW_NUMBER() OVER (PARTITION BY si.saved_item_id ORDER BY d.date) AS occ_rank_upcoming,
                         (SELECT COUNT(*) FROM \`${PROJECT}.raw.saved_item_dates\` a WHERE a.saved_item_id = si.saved_item_id) AS n_total,
                         (SELECT COUNTIF(a.date < CURRENT_DATE()) FROM \`${PROJECT}.raw.saved_item_dates\` a WHERE a.saved_item_id = si.saved_item_id) AS n_past
                  FROM \`${PROJECT}.raw.saved_items\` si
                  JOIN \`${PROJECT}.raw.saved_item_dates\` d USING (saved_item_id, location_id)
                  WHERE si.location_id IN UNNEST(@locs)
                    AND d.date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 60 DAY)
                    AND (COALESCE(si.recurrence, 'none') != 'none' OR si.selected_date = d.date)
                )
                SELECT o.*,
                  (SELECT COUNT(*) FROM \`${PROJECT}.analytics.action_commitments\` c
                    WHERE c.saved_item_id = o.saved_item_id AND CAST(c.window_start AS STRING) = o.occ_date) AS n_com,
                  (SELECT COUNT(*) FROM \`${PROJECT}.raw.saved_item_snapshots\` s
                    WHERE s.saved_item_id = o.saved_item_id AND CAST(s.selected_date AS STRING) = o.occ_date) AS n_snap,
                  (SELECT GREATEST(COALESCE(v.lvl_rain,0), COALESCE(v.lvl_heat,0), COALESCE(v.lvl_wind,0), COALESCE(v.lvl_snow,0), COALESCE(v.lvl_cold,0))
                    FROM \`${PROJECT}.semantic.vw_insight_event_day_surface\` v
                    WHERE v.location_id = o.location_id AND CAST(v.date AS STRING) = o.occ_date) AS lvl_max
                FROM occ o ORDER BY o.occ_date LIMIT 20`,
        params: { locs }, location: "EU",
      }),
      // Engagements — dernier état par commitment (journal append-only) : ouverts + tenue période.
      bq.query({
        query: `WITH latest AS (
                  SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC, CASE WHEN status IN ('resolved', 'cancelled') THEN 1 ELSE 0 END DESC, (verdict IS NOT NULL) DESC, created_at DESC) AS rn
                  FROM \`${PROJECT}.analytics.action_commitments\` WHERE location_id IN UNNEST(@locs)
                )
                SELECT commitment_id, location_id, status, verdict, owner_person_name, committed_action_text,
                       measured_metric, threshold_basis, threshold_value, saved_item_id,
                       CAST(window_start AS STRING) AS ws, CAST(window_end AS STRING) AS we,
                       origin_action_type, action_done_status,
                       DATE_DIFF(window_end, CURRENT_DATE(), DAY) AS days_to_end,
                       (DATE(created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL @period DAY)) AS in_period
                FROM latest WHERE rn = 1`,
        params: P, location: "EU",
      }),
      // Impact € : le mart des outcomes, PAR commitment (le € par personne se recompose côté
      // endpoint via l'owner du journal). Contrat « fait par défaut » : le WHERE du mart passe
      // à « non déclarée pas-menée » (édit dbt côté owner, 05/08).
      bq.query({
        query: `SELECT commitment_id, beat, verdict,
                       ROUND(window_actual_revenue - window_expected_revenue, 0) AS gap_eur
                FROM \`${PROJECT}.mart.fct_client_commitment_outcomes\`
                WHERE location_id IN UNNEST(@locs)
                  AND resolved_date >= DATE_SUB(CURRENT_DATE(), INTERVAL @period DAY)`,
        params: P, location: "EU",
      }),
      bq.query({
        query: `SELECT practice_id, location_id, practice_text, status, author_person_name, replay_commitment_id, origin_action_type,
                       arm_enabled, arm_recipient_name, arm_recipient_contact, COALESCE(arm_cooldown_days, 7) AS arm_cooldown,
                       CAST(DATE(created_at) AS STRING) AS d
                FROM \`${PROJECT}.analytics.best_practices\`
                WHERE location_id IN UNNEST(@locs)
                ORDER BY created_at DESC LIMIT 20`,
        params: P, location: "EU",
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
      bq.query({
        query: `SELECT correction_type FROM \`${PROJECT}.intermediate.int_consulter_corrections_current\`
                WHERE location_id IN UNNEST(@locs)`,
        params: { locs }, location: "EU",
      }),
      // Reçu automatisations : contextes gelés récemment (7 j) par le cron/Choisir.
      bq.query({
        query: `SELECT CAST(selected_date AS STRING) AS d
                FROM \`${PROJECT}.raw.saved_item_snapshots\`
                WHERE location_id IN UNNEST(@locs) AND DATE(snapshotted_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
                ORDER BY selected_date LIMIT 10`,
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
                       MIN(CASE WHEN lvl_heat >= 3 AND DATE(date) > CURRENT_DATE() THEN CAST(DATE(date) AS STRING) END) AS next_hot
                FROM \`${PROJECT}.semantic.vw_insight_event_day_surface\`
                WHERE location_id IN UNNEST(@locs) GROUP BY 1`,
        params: P, location: "EU",
      }),
      // Fraîcheur des ventes (onboarding P1) : dernier jour importé par site — le carburant de
      // toute mesure. Un site sans ligne = aveugle ; un site figé = cartes du jour muettes.
      bq.query({
        query: `SELECT location_id, CAST(MAX(transaction_date) AS STRING) AS last_sale
                FROM \`${PROJECT}.raw.client_transactions\`
                WHERE location_id IN UNNEST(@locs) GROUP BY 1`,
        params: P, location: "EU",
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
    ]);

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
        type_label_fr: str(r.event_type) ? eventTypeLabelFr(String(str(r.event_type))) : null,
        occ_date: str(r.occ_date),
        occ_num: Number(num(r.n_past) ?? 0) + Number(num(r.occ_rank_upcoming) ?? 1),
        n_total: num(r.n_total),
        kpi: str(r.kpi), kpi_family: str(r.kpi_family), target,
        duration_days: num(r.duration_days),
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
      in_period: flat(r.in_period) === true,
    }));
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
    const martAll = (outRows as any[]).map((r) => ({ commitment_id: String(str(r.commitment_id)), beat: flat(r.beat) === true, verdict: str(r.verdict), gap_eur: num(r.gap_eur) }));
    const martRows = martAll.filter((r) => r.verdict !== "confounded");
    const confoundedCount = martAll.length - martRows.length;
    const gapSum = martRows.length ? martRows.reduce((a, r) => a + (r.gap_eur ?? 0), 0) : null;
    // Tenue par personne : verdicts rendus sur la période + € mesurés de LEURS fenêtres.
    const personKey = (name: string | null): string =>
      String(name || "—").split("·")[0].trim().toLowerCase() || "—";
    const equipe: Record<string, { label: string; open: any[]; kept: number; judged: number; gap: number | null }> = {};
    for (const c of coms) {
      const k = personKey(c.owner);
      equipe[k] = equipe[k] || { label: String(c.owner || "—"), open: [], kept: 0, judged: 0, gap: null };
      if (String(c.owner || "").length > equipe[k].label.length) equipe[k].label = String(c.owner);
      if (c.status === "open") equipe[k].open.push({ text: c.text, saved_item_id: c.saved_item_id, site_label: c.site_label, we: c.we, days_to_end: c.days_to_end });
      else if (c.verdict && c.verdict !== "confounded" && c.in_period) { equipe[k].judged += 1; if (/met|tenu|beat/i.test(String(c.verdict))) equipe[k].kept += 1; }
    }
    for (const r of martRows) {
      const k = personKey(ownerByCommitment[r.commitment_id] || null);
      if (equipe[k]) equipe[k].gap = (equipe[k].gap ?? 0) + (r.gap_eur ?? 0);
    }

    const bilans = (bilanRows as any[]).map((r) => ({ title: str(r.title), saved_item_id: str(r.saved_item_id), location_id: str(r.location_id), fin: str(r.fin) })).filter((b) => b.title);
    const corrections = (corrRows as any[]).map((r) => str(r.correction_type)).filter(Boolean);
    // Armement (cas 1) : dernier tir par pratique + détectabilité v1 (vérité serveur — miroir
    // de HEAT_DETECTABLE du dispatch) ; le client n'invente pas ce qui est branchable.
    const trigByPractice: Record<string, { last_fired: string | null; n: number }> = {};
    for (const r of trigRows as any[]) trigByPractice[String(str(r.practice_id))] = { last_fired: str(r.last_fired), n: Number(num(r.n_triggers) ?? 0) };
    const heatBySite: Record<string, { n_hot_30: number; next_hot: string | null }> = {};
    for (const r of heatRows as any[]) heatBySite[String(str(r.location_id))] = { n_hot_30: Number(num(r.n_hot_30) ?? 0), next_hot: str(r.next_hot) };
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
      };
    });
    // Gestes de connaissance (owner 05/08 — « les compteurs sans les gestes qui les font
    // avancer ») : verdicts tenus sans dispositif du même type documenté ; déclarés sans rejeu ;
    // rejeux en cours (ceux-là avancent seuls).
    const practiceTypes = new Set(practices.map((pr) => pr.origin_action_type).filter(Boolean));
    const toDocument = coms.filter((c) => c.status === "resolved" && /met|tenu|beat/i.test(String(c.verdict || "")) && !(c.origin && practiceTypes.has(c.origin))).length;
    const openById: Record<string, any> = {};
    for (const c of open) if (c.commitment_id) openById[c.commitment_id] = c;
    const replaysRunning = practices.filter((pr) => pr.replay_commitment_id && openById[pr.replay_commitment_id])
      .map((pr) => ({ end: openById[pr.replay_commitment_id!].we }));
    const declaredNoReplay = practices.filter((pr) => pr.status !== "proven" && !pr.replay_commitment_id).length;

    return json(200, {
      ok: true,
      period_days: period,
      impact: {
        gap_eur: gapSum,
        eur_windows: martRows.length,
        confounded: confoundedCount,
        windows_judged: judged.length,
        targets_met: judged.filter((c) => /met|tenu|beat/i.test(String(c.verdict))).length,
        practices_proven: practices.filter((p) => p.status === "proven").length,
        next_judgment: open.map((c) => c.we).filter((d) => d && String(d) >= new Date().toISOString().slice(0, 10)).sort()[0] || null,
      },
      multi_site: locs.length > 1,
      sites: locs.map((l) => ({ location_id: l, label: siteLabel[l] || "" })),
      operations,
      open_commitments: open.map((c) => ({ text: c.text, owner: c.owner, site_label: c.site_label, ws: c.ws, we: c.we, metric: c.metric, threshold_value: c.threshold_value, saved_item_id: c.saved_item_id, days_to_end: c.days_to_end, is_event: /^event_/.test(String(c.origin || "")) })),
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
            title: str(r.title), send_offset: off, next_occ: nextOcc,
            next_send: t.toISOString().slice(0, 10),
            last_sent_on: str(r.last_sent_on), last_n_recipients: num(r.last_n),
          };
        }),
        snapshots_recent: (snapRows as any[]).map((r) => str(r.d)),
        next_autoarm: operations.filter((o) => !o.ready_com && o.occ_date)
          .map((o) => ({ title: o.title, occ_date: o.occ_date }))[0] || null,
        verdicts_scheduled: open.map((c) => c.we).filter(Boolean).sort(),
        competitor_alerts_7d: alerts,
      },
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
        facts_active: corrections.length,
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
