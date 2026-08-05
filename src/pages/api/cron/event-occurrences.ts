// GET /api/cron/event-occurrences — l'engagement de mesure + le snapshot de CHAQUE occurrence
// d'événement, à l'approche (spec docs/evenement-dossier-spec.md § 1.3 : « créé par le cron à
// J-7 de chaque occurrence, jamais 52 d'un coup »). Quotidien via cron-job.org (Bearer
// CRON_SECRET, patron daily.ts).
//
// IDEMPOTENT par construction :
//  - fenêtre GLISSANTE [aujourd'hui, J+7] (rattrape un jour sauté) ;
//  - un engagement n'est créé QUE s'il n'en existe aucun pour (saved_item_id, occurrence)
//    — la clé window_start ancrée ;
//  - un snapshot n'est posé QUE s'il n'en existe aucun pour (saved_item_id, occurrence) ; si la
//    date est hors horizon de la surface, l'INSERT..SELECT n'insère rien → retenté demain.
// Héritage de SÉRIE : seuil, texte d'action, responsable et measured_metric du PREMIER
// engagement de la série (même saved_item_id) — cohérence garantie ; repli : dérivation depuis
// les champs kpi de l'événement (kpiKeyForEventKpi + kpi_target_pct, défaut 10 %).
// Échec SOFT par occurrence : une erreur n'arrête ni les autres occurrences ni le cron.
import type { APIRoute } from "astro";
import crypto from "node:crypto";
import { makeBQClient } from "../../../lib/bq";
import { readMergeWrite, type CommitmentRow } from "../../../lib/actionCommitments";
import { kpiKeyForEventKpi, measureKpiBaseline, measureFamilyBaseline, isKpiMeasurable } from "../../../lib/kpiRegistry";
import { sendEmail, loadChannelConfig } from "../../../lib/channels/internalSend";

const PROJECT = "muse-square-open-data";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const DOW_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const frD = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);
const dowFr = (iso: string) => DOW_FR[new Date(iso + "T12:00:00Z").getUTCDay()];

// ── Consigne d'opération (automatisation inc. 4, docs/automatisation-spec.md § 4) ──
// L'email est AUTO-SUFFISANT : les participants externes n'ont pas l'app — tout est dans le
// corps, aucune section vide (absence honnête), texte brut (les valeurs sont du texte owner).
function buildConsigneBody(r: any, occ: string, ownerName: string): { subject: string; body: string } {
  const title = String(flat(r.title) || "Événement");
  const parts: string[] = [];
  parts.push(`Consigne d'opération — ${title}`);
  // Lexique métier (owner 05/08) : « opération », jamais « occurrence » dans ce qui se lit.
  const hs = flat(r.hour_start), he = flat(r.hour_end);
  parts.push(`Opération : ${dowFr(occ)} ${frD(occ)}` + (hs != null && he != null ? ` · ouverture au public ${hs} h – ${he} h` : ""));
  if (flat(r.consigne_arrival) != null) parts.push(`Arrivée des participants : ${String(flat(r.consigne_arrival))}`);
  if (flat(r.consigne_deroule) != null) parts.push(`Déroulé :\n${String(flat(r.consigne_deroule))}`);
  const tgtEur = flat(r.kpi_target_eur), tgtPct = flat(r.kpi_target_pct);
  const kpiLbl = String(flat(r.kpi) || "") === "family_revenue" ? `famille ${String(flat(r.kpi_family) || "")}` : "CA vs attendu";
  if (tgtEur != null || tgtPct != null) {
    parts.push(`Objectif de l'opération : ${kpiLbl} ${tgtEur != null ? Math.round(Number(tgtEur)) + " €" : "+" + Math.round(Number(tgtPct)) + " %"} — mesuré automatiquement.`);
  }
  if (flat(r.description) != null) parts.push(`Le dispositif :\n${String(flat(r.description))}`);
  if (flat(r.consigne_store_info) != null) parts.push(`Consigne :\n${String(flat(r.consigne_store_info))}`);
  if (flat(r.consigne_interactions) != null) parts.push(`Interactions clients :\n${String(flat(r.consigne_interactions))}`);
  parts.push(`Responsable : ${ownerName}`);
  parts.push(`— Envoyée automatiquement par Muse Square. Une question : répondez au responsable.`);
  return { subject: `Consigne — ${title} · ${dowFr(occ)} ${frD(occ).slice(0, 5)}`, body: parts.join("\n\n") };
}

// Le responsable reçoit chaque envoi : email résolu par le roster (nom normalisé, la partie
// avant « · »), repli = email du profil utilisateur (même source que cron/alerts).
function normName(s: string): string {
  return String(s || "").split("·")[0].trim().toLowerCase();
}

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 });
  }
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
  const today = ymd(new Date());
  const horizon = ymd(new Date(Date.now() + 7 * 86_400_000));

  // Occurrences à venir (récurrents : toutes les dates ; ponctuels : la date CHOISIE seule),
  // avec l'état d'idempotence (engagement ? snapshot ?) en agrégats joints — une requête.
  const [rows] = await bq.query({
    query: `
      WITH occ AS (
        SELECT si.saved_item_id, si.location_id, si.clerk_user_id, si.title, si.description,
               si.event_type, si.kpi, si.kpi_family, si.kpi_target_pct, si.author_person_name,
               si.kpi_target_eur, si.hour_start, si.hour_end,
               si.consigne_enabled, si.consigne_send_offset, si.consigne_arrival,
               si.consigne_store_info, si.consigne_interactions, si.consigne_deroule,
               CAST(d.date AS STRING) AS occ_date
        FROM \`${PROJECT}.raw.saved_items\` si
        JOIN \`${PROJECT}.raw.saved_item_dates\` d
          ON d.saved_item_id = si.saved_item_id AND d.location_id = si.location_id
        WHERE d.date BETWEEN @today AND @horizon
          AND (COALESCE(si.recurrence, 'none') != 'none' OR si.selected_date = d.date)
      ),
      com AS (
        SELECT saved_item_id, CAST(window_start AS STRING) AS occ_date, COUNT(*) AS n
        FROM \`${PROJECT}.analytics.action_commitments\`
        WHERE saved_item_id IS NOT NULL GROUP BY 1, 2
      ),
      snap AS (
        SELECT saved_item_id, CAST(selected_date AS STRING) AS occ_date, COUNT(*) AS n
        FROM \`${PROJECT}.raw.saved_item_snapshots\` GROUP BY 1, 2
      ),
      csend AS (
        SELECT saved_item_id, CAST(occurrence_date AS STRING) AS occ_date, COUNT(*) AS n
        FROM \`${PROJECT}.analytics.consigne_sends\` GROUP BY 1, 2
      ),
      first_com AS (
        SELECT saved_item_id, threshold_level, threshold_basis, threshold_value,
               committed_action_text, owner_person_name, measured_metric
        FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY saved_item_id ORDER BY created_at ASC) AS rn
          FROM \`${PROJECT}.analytics.action_commitments\` WHERE saved_item_id IS NOT NULL
        ) WHERE rn = 1
      )
      SELECT o.*, COALESCE(c.n, 0) AS n_com, COALESCE(s.n, 0) AS n_snap, COALESCE(cs.n, 0) AS n_csend,
             f.threshold_level AS f_level, f.threshold_basis AS f_basis, f.threshold_value AS f_value,
             f.committed_action_text AS f_text, f.owner_person_name AS f_owner, f.measured_metric AS f_metric
      FROM occ o
      LEFT JOIN com c ON c.saved_item_id = o.saved_item_id AND c.occ_date = o.occ_date
      LEFT JOIN snap s ON s.saved_item_id = o.saved_item_id AND s.occ_date = o.occ_date
      LEFT JOIN csend cs ON cs.saved_item_id = o.saved_item_id AND cs.occ_date = o.occ_date
      LEFT JOIN first_com f ON f.saved_item_id = o.saved_item_id
      ORDER BY o.occ_date
      LIMIT 200`,
    params: { today: bq.date(today), horizon: bq.date(horizon) }, location: "EU",
  });

  let created = 0, snapshots = 0, consignes = 0;
  const details: string[] = [];
  const CAP = 50;
  const SEND_CAP = 20;
  const daysUntil = (occ: string) => Math.round((new Date(occ + "T12:00:00Z").getTime() - new Date(today + "T12:00:00Z").getTime()) / 86_400_000);

  for (const r of rows as any[]) {
    const sid = String(flat(r.saved_item_id));
    const loc = String(flat(r.location_id));
    const occ = String(flat(r.occ_date));
    try {
      // ── Engagement de l'occurrence (si absent, plafond CAP par passage) ──
      if (Number(flat(r.n_com)) === 0 && created < CAP) {
        const metric = (flat(r.f_metric) != null ? String(flat(r.f_metric)) : null)
          || kpiKeyForEventKpi(flat(r.kpi) as any) || "revenue_residual";
        const thresholdValue = flat(r.f_value) != null ? Number(flat(r.f_value))
          : Math.max(1, Math.min(100, Math.round(Number(flat(r.kpi_target_pct) ?? 10)) || 10));
        let kpiBaseline: number | null = null;
        try {
          if (metric === "family_revenue" && flat(r.kpi_family) != null) {
            kpiBaseline = await measureFamilyBaseline(bq, loc, String(flat(r.kpi_family)), occ);
          } else if (metric !== "revenue_residual" && isKpiMeasurable(metric as any)) {
            kpiBaseline = await measureKpiBaseline(bq, loc, metric as any, occ);
          }
        } catch { kpiBaseline = null; }
        const patch: Partial<CommitmentRow> = {
          user_id: String(flat(r.clerk_user_id)),
          location_id: loc,
          status: "open",
          verdict: null,
          origin_kind: "event_occurrence",
          origin_action_type: `event_${String(flat(r.event_type) || "autre")}`,
          origin_driver: null,
          origin_factor: null,
          origin_suppression_key: null,
          origin_card_instance_id: null,
          origin_affected_date: occ,
          saved_item_id: sid,
          measured_metric: metric,
          window_kind: "day_of",
          window_start: occ,
          window_end: occ,
          window_days_expected: 1,
          threshold_level: flat(r.f_level) != null ? String(flat(r.f_level)) : "custom",
          threshold_basis: flat(r.f_basis) != null ? String(flat(r.f_basis)) : "pct",
          threshold_value: thresholdValue,
          committed_action_text: flat(r.f_text) != null ? String(flat(r.f_text))
            : `${String(flat(r.title) || "Événement")}${flat(r.description) ? " — " + String(flat(r.description)) : ""}`,
          owner_person_name: flat(r.f_owner) != null ? String(flat(r.f_owner)) : (flat(r.author_person_name) != null ? String(flat(r.author_person_name)) : "—"),
          owner_person_id: null,
          kpi_baseline: kpiBaseline,
        };
        await readMergeWrite(bq, { commitmentId: crypto.randomUUID(), transitionType: "created", create: true, patch });
        created += 1;
        details.push(`commitment ${sid.slice(0, 8)}@${occ}`);
      }
      // ── Snapshot de l'occurrence (gel de contexte ; no-op si surface hors horizon) ──
      if (Number(flat(r.n_snap)) === 0) {
        const [job] = await bq.query({
          query: `INSERT INTO \`${PROJECT}.raw.saved_item_snapshots\`
                  SELECT @sid, @loc, @cid, PARSE_DATE('%F', @occ), CURRENT_TIMESTAMP(),
                         SAFE_CAST(opportunity_score_final_local AS FLOAT64), opportunity_regime,
                         lvl_rain, lvl_wind, lvl_snow, lvl_heat, lvl_cold,
                         alert_level_max, delta_att_events_pct,
                         -- La colonne snapshot s'appelle delta_att_mobility_car_pct ; la vue a
                         -- renommé la mesure delta_ops_mobility_car_pct (bug latent attrapé par
                         -- ce cron le 04/08 — le snapshot.ts legacy échouait en silence).
                         delta_ops_mobility_car_pct,
                         is_forced_regime_c_flag, primary_score_driver_label, weather_label_fr,
                         competition_presence_flag, events_within_5km_count, CAST(NULL AS STRING)  -- mobility_status_region : colonne disparue de la vue (04/08) — NULL honnête, jamais un substitut
                  FROM \`${PROJECT}.semantic.vw_insight_event_day_surface\`
                  WHERE location_id = @loc AND date = PARSE_DATE('%F', @occ)
                  LIMIT 1`,
          params: { sid, loc, cid: String(flat(r.clerk_user_id)), occ }, location: "EU",
        });
        void job;
        snapshots += 1;
      }
      // ── Consigne d'opération (inc. 4) : due si activée, à J-offset ou plus proche,
      //    JAMAIS déjà tracée pour cette occurrence (idempotence = la trace). ──
      const off = flat(r.consigne_send_offset) != null ? Number(flat(r.consigne_send_offset)) : 2;
      if (flat(r.consigne_enabled) === true && Number(flat(r.n_csend)) === 0
          && daysUntil(occ) <= off && consignes < SEND_CAP) {
        const uid = String(flat(r.clerk_user_id));
        const ownerName = flat(r.f_owner) != null ? String(flat(r.f_owner))
          : (flat(r.author_person_name) != null ? String(flat(r.author_person_name)) : "—");
        // Destinataires : participants de l'occurrence (email) + le responsable (roster par
        // nom, repli email du profil — même source que cron/alerts). 3 lectures ponctuelles :
        // les consignes dues un jour donné se comptent sur les doigts d'une main.
        const [[partRows], [teamRows], [profRows]] = await Promise.all([
          bq.query({
            query: `SELECT participant_name, contact
                    FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY participant_id ORDER BY updated_at DESC) AS rn
                          FROM \`${PROJECT}.raw.saved_item_participants\` WHERE saved_item_id = @sid)
                    WHERE rn = 1 AND COALESCE(deleted, FALSE) = FALSE
                      AND (date = PARSE_DATE('%F', @occ) OR date IS NULL)`,
            params: { sid, occ }, location: "EU",
          }),
          bq.query({
            query: `SELECT first_name, last_name, channels_contact
                    FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY updated_at DESC) AS rn
                          FROM \`${PROJECT}.analytics.team_members\` WHERE user_id = @uid)
                    WHERE rn = 1 AND COALESCE(status, 'active') = 'active'
                    ORDER BY (location_id = @loc) DESC`,
            params: { uid, loc }, location: "EU",
          }),
          bq.query({
            query: `SELECT email FROM \`${PROJECT}.raw.insight_event_user_location_profile\`
                    WHERE clerk_user_id = @uid AND email IS NOT NULL LIMIT 1`,
            params: { uid }, location: "EU",
          }),
        ]);
        const recipients: string[] = [];
        for (const p of (partRows as any[]) || []) {
          const c = String(flat(p.contact) || "");
          if (c.includes("@")) recipients.push(c);
        }
        let ownerEmail: string | null = null;
        const wanted = normName(ownerName);
        for (const t of (teamRows as any[]) || []) {
          const full = normName(`${String(flat(t.first_name) || "")} ${String(flat(t.last_name) || "")}`);
          if (wanted && full === wanted) {
            try { ownerEmail = JSON.parse(String(flat(t.channels_contact) || "{}")).email || null; } catch { ownerEmail = null; }
            if (ownerEmail) break;
          }
        }
        if (!ownerEmail && (profRows as any[])?.length) ownerEmail = String(flat((profRows as any[])[0].email) || "") || null;
        if (ownerEmail && !recipients.includes(ownerEmail)) recipients.push(ownerEmail);

        if (!recipients.length) {
          details.push(`consigne ${sid.slice(0, 8)}@${occ}: aucun destinataire email — non envoyée, retentée demain`);
        } else {
          const { subject, body } = buildConsigneBody(r, occ, ownerName);
          const cfg = await loadChannelConfig(bq, uid, loc, "email").catch(() => ({}));
          const sent: string[] = [];
          for (const to of recipients) {
            const res = await sendEmail(cfg, { title: subject, body, recipient: to }).catch((e: any) => ({ ok: false, error: String(e?.message || e) }));
            if (res.ok) sent.push(to);
            else details.push(`consigne ${sid.slice(0, 8)}@${occ}: échec vers ${to.slice(0, 3)}…: ${String((res as any).error || "").slice(0, 80)}`);
          }
          if (sent.length) {
            await bq.dataset("analytics").table("consigne_sends").insert([{
              send_id: crypto.randomUUID(),
              saved_item_id: sid,
              location_id: loc,
              occurrence_date: occ,
              send_offset: off,
              channel: "email",
              recipients: JSON.stringify(sent),
              n_recipients: sent.length,
              sent_at: new Date().toISOString(),
            }]);
            consignes += 1;
            details.push(`consigne ${sid.slice(0, 8)}@${occ}: envoyée à ${sent.length} destinataire(s)`);
          }
        }
      }
    } catch (e: any) {
      details.push(`ERREUR ${sid.slice(0, 8)}@${occ}: ${String(e?.message || e).slice(0, 120)}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, window: [today, horizon], scanned: (rows as any[]).length, created, snapshots_attempted: snapshots, consignes_sent: consignes, details }), {
    status: 200, headers: { "content-type": "application/json" },
  });
};
