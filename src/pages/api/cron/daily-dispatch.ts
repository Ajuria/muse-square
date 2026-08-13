import type { APIRoute } from "astro";
import crypto from "node:crypto";
import { makeBQClient } from "../../../lib/bq";
import { sendEmail, loadChannelConfig } from "../../../lib/channels/internalSend";
import { readMergeWrite, type CommitmentRow } from "../../../lib/actionCommitments";
import { measureKpiBaseline, isKpiMeasurable } from "../../../lib/kpiRegistry";

export const prerender = false;

const BQ_PROJECT = "muse-square-open-data";
const CRON_SECRET = process.env.CRON_SECRET || "";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const DOW_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const frDfull = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);
const dowFr = (iso: string) => DOW_FR[new Date(iso + "T12:00:00Z").getUTCDay()];

// ── Dispositifs ARMÉS sur signal (automatisation cas 1, docs/automatisation-spec.md) ──
// Détecteur v1 : « chaleur annoncée DEMAIN (lvl_heat >= 3) » — décision documentée (été
// continu : un début d'épisode ne tirerait quasi jamais ; le texte du dispositif réel dit
// « la veille »). Origines couvertes v1 : structural_traffic_high. Garde-fous : idempotence
// par (practice_id, target_date), cooldown arm_cooldown_days (défaut 7), échec soft.
const HEAT_DETECTABLE = new Set(["structural_traffic_high"]);

// ── Relance FRAÎCHEUR des ventes (onboarding P1) : un compte dont les données s'arrêtent
// n'a ni cartes du jour ni verdicts — audit Olivades : import unique 29/07, figé au 27/07,
// 0 verdict en 16 j. Sélection = MAX(transaction_date) réel < aujourd'hui, figé ≥ 7 j ;
// garde = 1 email max / 7 j / site (action_log action_key='freshness_reminder') ;
// destinataire = l'email du compte (des utilisateurs de l'app — le lien Explorer est légitime).
// `dry=1` : liste ce qui partirait sans rien envoyer (vérification).
async function runFreshnessReminders(bq: any, dry: boolean): Promise<{ scanned: number; sent: number; details: string[] }> {
  const details: string[] = [];
  let sent = 0;
  const baseUrl = process.env.APP_BASE_URL || "https://dev.musesquare.com";
  const [stale] = await bq.query({
    query: `
      WITH last AS (
        SELECT location_id, MAX(transaction_date) AS d
        FROM \`${BQ_PROJECT}.raw.client_transactions\` GROUP BY 1
      ),
      prof AS (
        SELECT location_id, email, clerk_user_id, COALESCE(site_name, company_name) AS site
        FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY location_id ORDER BY created_at DESC) AS rn
              FROM \`${BQ_PROJECT}.raw.insight_event_user_location_profile\` WHERE email IS NOT NULL)
        WHERE rn = 1
      ),
      reminded AS (
        SELECT DISTINCT location_id FROM \`${BQ_PROJECT}.analytics.action_log\`
        WHERE action_key = 'freshness_reminder'
          AND created_at > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
      )
      SELECT l.location_id, CAST(l.d AS STRING) AS last_sale,
             DATE_DIFF(CURRENT_DATE(), l.d, DAY) AS stale_days,
             p.email, p.clerk_user_id, p.site
      FROM last l
      JOIN prof p USING (location_id)
      WHERE l.d < CURRENT_DATE()
        AND DATE_DIFF(CURRENT_DATE(), l.d, DAY) >= 7
        AND l.location_id NOT IN (SELECT location_id FROM reminded)
      ORDER BY stale_days DESC LIMIT 10`,
    location: "EU",
  });
  for (const r of (stale as any[]) || []) {
    const loc = String(flat(r.location_id));
    const site = String(flat(r.site) || "votre site");
    const lastSale = String(flat(r.last_sale));
    const staleDays = Number(flat(r.stale_days));
    try {
      if (dry) { details.push(`DRY ${site} (${loc.slice(0, 8)}): figé au ${frDfull(lastSale).slice(0, 5)}, ${staleDays} j — enverrait à ${String(flat(r.email)).slice(0, 3)}…`); continue; }
      const subject = `Vos ventes s'arrêtent au ${frDfull(lastSale).slice(0, 5)} — ${site}`;
      const body = [
        `Vos données de ventes (${site}) s'arrêtent au ${dowFr(lastSale)} ${frDfull(lastSale)} — ${staleDays} jours sans données.`,
        `Sans ventes fraîches, Muse Square ne peut ni lire vos journées récentes, ni mesurer vos opérations en cours : les cartes du jour et les verdicts restent muets.`,
        `Le geste (2 minutes) : exportez la période manquante depuis votre caisse, puis importez le fichier dans Explorer :\n${baseUrl}/app/insightevent/prompt`,
        `— Relance automatique de Muse Square (une par semaine au plus, tant que les données ne sont pas à jour).`,
      ].join("\n\n");
      const cfg = await loadChannelConfig(bq, String(flat(r.clerk_user_id) || ""), loc, "email").catch(() => ({}));
      const res = await sendEmail(cfg, { title: subject, body, recipient: String(flat(r.email)) }).catch((e: any) => ({ ok: false, error: String(e?.message || e) }));
      if (!res.ok) { details.push(`freshness ${site}: échec envoi — ${String((res as any).error || "").slice(0, 80)}`); continue; }
      await bq.dataset("analytics").table("action_log").insert([{
        log_id: crypto.randomUUID(),
        user_id: String(flat(r.clerk_user_id) || ""),
        location_id: loc,
        action_key: "freshness_reminder",
        event: "freshness_reminder",
        affected_date: new Date().toISOString().slice(0, 10),
        reason: `stale_${lastSale}`,
        created_at: new Date().toISOString(),
      }]);
      sent += 1;
      details.push(`freshness ${site}: relance envoyée (figé au ${frDfull(lastSale).slice(0, 5)}, ${staleDays} j)`);
    } catch (e: any) {
      details.push(`freshness ${loc.slice(0, 8)}: ERREUR ${String(e?.message || e).slice(0, 100)}`);
    }
  }
  return { scanned: ((stale as any[]) || []).length, sent, details };
}

async function runArmedDispositifs(bq: any): Promise<{ scanned: number; triggered: number; details: string[] }> {
  const details: string[] = [];
  let triggered = 0;
  const today = new Date().toISOString().slice(0, 10);
  const target = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10); // demain

  const [armed] = await bq.query({
    query: `SELECT practice_id, user_id, location_id, practice_text, origin_action_type,
                   arm_recipient_name, arm_recipient_contact, arm_channel,
                   COALESCE(arm_cooldown_days, 7) AS cooldown, replay_commitment_id
            FROM \`${BQ_PROJECT}.analytics.best_practices\`
            WHERE arm_enabled = TRUE AND status = 'active'`,
    location: "EU",
  });

  for (const p of (armed as any[]) || []) {
    const pid = String(flat(p.practice_id));
    const loc = String(flat(p.location_id));
    try {
      const origin = String(flat(p.origin_action_type) || "");
      if (!HEAT_DETECTABLE.has(origin)) {
        details.push(`armed ${pid.slice(0, 8)}: origine ${origin} non détectable (v1) — rien envoyé`);
        continue;
      }
      // Détection : demain est-il un jour chaud annoncé (niveau >= 3) sur CE lieu ?
      const [[surf]] = await bq.query({
        query: `SELECT lvl_heat FROM \`${BQ_PROJECT}.semantic.vw_insight_event_day_surface\`
                WHERE location_id = @loc AND date = PARSE_DATE('%F', @d) LIMIT 1`,
        params: { loc, d: target }, location: "EU",
      }).then(([r]: any) => [r]);
      if (!surf || Number(flat(surf.lvl_heat) ?? 0) < 3) continue;

      // Idempotence (un tir par jour visé) + cooldown (1 tir max par N jours).
      const [[guard]] = await bq.query({
        query: `SELECT COUNTIF(target_date = PARSE_DATE('%F', @d)) AS n_same,
                       COUNTIF(sent_at > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @cd DAY)) AS n_recent
                FROM \`${BQ_PROJECT}.analytics.dispositif_triggers\` WHERE practice_id = @pid`,
        params: { pid, d: target, cd: Number(flat(p.cooldown)) }, location: "EU",
      }).then(([r]: any) => [r]);
      if (Number(flat(guard?.n_same) ?? 0) > 0) continue;
      if (Number(flat(guard?.n_recent) ?? 0) > 0) { details.push(`armed ${pid.slice(0, 8)}: cooldown ${flat(p.cooldown)} j — pas de tir`); continue; }

      const contact = String(flat(p.arm_recipient_contact) || "");
      if (!contact.includes("@")) { details.push(`armed ${pid.slice(0, 8)}: destinataire sans email — rien envoyé`); continue; }

      // Réglages du rejeu (dernier état, tiebreak canonique) — repli honnête sinon.
      let metric = "revenue_residual", thrBasis = "pct", thrValue = 10, ownerName = String(flat(p.arm_recipient_name) || "—");
      const rcid = flat(p.replay_commitment_id) != null ? String(flat(p.replay_commitment_id)) : null;
      if (rcid) {
        const [[rc]] = await bq.query({
          query: `SELECT measured_metric, threshold_basis, threshold_value, owner_person_name
                  FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC, IF(status IN ('resolved','cancelled'),1,0) DESC, IF(verdict IS NOT NULL,1,0) DESC, created_at DESC) rn
                        FROM \`${BQ_PROJECT}.analytics.action_commitments\` WHERE commitment_id = @cid)
                  WHERE rn = 1`,
          params: { cid: rcid }, location: "EU",
        }).then(([r]: any) => [r]);
        if (rc) {
          if (flat(rc.measured_metric) != null) metric = String(flat(rc.measured_metric));
          if (flat(rc.threshold_basis) != null) thrBasis = String(flat(rc.threshold_basis));
          if (flat(rc.threshold_value) != null) thrValue = Number(flat(rc.threshold_value));
          if (flat(rc.owner_person_name) != null) ownerName = String(flat(rc.owner_person_name));
        }
      }

      // L'email : consigne AUTO-SUFFISANTE, gestes à main courte seulement (délai de prévenance).
      const subject = `Consigne — dispositif armé · demain ${dowFr(target)} ${frDfull(target).slice(0, 5)}`;
      const body = [
        `Consigne d'opération — déclenchée par votre signal : chaleur annoncée demain (niveau >= 3).`,
        `Jour visé : ${dowFr(target)} ${frDfull(target)}.`,
        `Le dispositif :\n${String(flat(p.practice_text) || "")}`,
        `Rappel : gestes à votre main d'ici demain — achats et travail de l'équipe déjà planifiée ; on ne convoque personne.`,
        `La mesure s'arme seule : verdict automatique après le ${frDfull(target).slice(0, 5)} (${metric}, cible ${thrBasis === "pct" ? "+" + Math.round(thrValue) + " %" : Math.round(thrValue)}).`,
        `— Envoyée automatiquement par Muse Square (dispositif armé sur signal). Se désactive depuis la fiche dispositif.`,
      ].join("\n\n");
      const cfg = await loadChannelConfig(bq, String(flat(p.user_id) || ""), loc, "email").catch(() => ({}));
      const sent = await sendEmail(cfg, { title: subject, body, recipient: contact }).catch((e: any) => ({ ok: false, error: String(e?.message || e) }));
      if (!sent.ok) { details.push(`armed ${pid.slice(0, 8)}: échec envoi — ${String((sent as any).error || "").slice(0, 80)}`); continue; }

      // L'engagement mesuré du tir — mêmes réglages que le rejeu, fenêtre = le jour visé.
      let kpiBaseline: number | null = null;
      try { if (metric !== "revenue_residual" && isKpiMeasurable(metric as any)) kpiBaseline = await measureKpiBaseline(bq, loc, metric as any, target); } catch { kpiBaseline = null; }
      const commitmentId = crypto.randomUUID();
      const patch: Partial<CommitmentRow> = {
        user_id: String(flat(p.user_id) || ""),
        location_id: loc,
        status: "open",
        verdict: null,
        origin_kind: "signal_armed",
        origin_action_type: origin,
        origin_driver: null,
        origin_factor: null,
        origin_suppression_key: `armed:${pid}:${target}`,
        origin_card_instance_id: null,
        origin_affected_date: target,
        measured_metric: metric,
        window_kind: "day_of",
        window_start: target,
        window_end: target,
        window_days_expected: 1,
        threshold_level: "custom",
        threshold_basis: thrBasis,
        threshold_value: thrValue,
        committed_action_text: String(flat(p.practice_text) || ""),
        owner_person_name: ownerName,
        owner_person_id: null,
        kpi_baseline: kpiBaseline,
      };
      await readMergeWrite(bq, { commitmentId, transitionType: "created", create: true, patch });

      // Trace en DML (jamais streaming : le nettoyage/la relecture immédiate restent possibles).
      await bq.query({
        query: `INSERT INTO \`${BQ_PROJECT}.analytics.dispositif_triggers\`
                (trigger_id, practice_id, location_id, user_id, signal_key, target_date, sent_at, recipients, n_recipients, commitment_id)
                VALUES (@tid, @pid, @loc, @uid, 'heat_tomorrow_lvl3', PARSE_DATE('%F', @d), CURRENT_TIMESTAMP(), @recips, 1, @cid)`,
        params: { tid: crypto.randomUUID(), pid, loc, uid: String(flat(p.user_id) || ""), d: target, recips: JSON.stringify([contact]), cid: commitmentId },
        location: "EU",
      });
      triggered += 1;
      details.push(`armed ${pid.slice(0, 8)}: consigne envoyée (${contact.slice(0, 3)}…) + engagement ${commitmentId.slice(0, 8)} armé sur ${target}`);
    } catch (e: any) {
      details.push(`armed ${pid.slice(0, 8)}: ERREUR ${String(e?.message || e).slice(0, 100)}`);
    }
  }
  void today;
  return { scanned: ((armed as any[]) || []).length, triggered, details };
}

export const GET: APIRoute = async ({ request, url }) => {
  // Verify cron secret (Vercel sends Authorization header)
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  }

  const now = new Date();
  const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const results: any[] = [];

  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);

    // 0. Dispositifs armés sur signal (cas 1) — passe indépendante des règles, échec soft.
    let armedRes = { scanned: 0, triggered: 0, details: [] as string[] };
    try { armedRes = await runArmedDispositifs(bq); } catch (e: any) { armedRes.details.push("ERREUR passe armés: " + String(e?.message || e).slice(0, 120)); }

    // 0bis. Relance fraîcheur des ventes (onboarding P1) — indépendante, échec soft.
    const freshnessDry = url.searchParams.get("dry") === "1";
    let freshRes = { scanned: 0, sent: 0, details: [] as string[] };
    try { freshRes = await runFreshnessReminders(bq, freshnessDry); } catch (e: any) { freshRes.details.push("ERREUR passe fraîcheur: " + String(e?.message || e).slice(0, 120)); }

    // 1. Get all enabled automation rules
    const [rules] = await bq.query({
      query: `
        SELECT rule_id, user_id, location_id, member_id, signal_category, channel, recipient, require_approval, frequency
        FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY rule_id ORDER BY updated_at DESC) AS rn
          FROM \`${BQ_PROJECT}.analytics.automation_rules\`
        )
        WHERE rn = 1 AND enabled = TRUE
        ORDER BY user_id, location_id
      `,
      location: "EU",
    });

    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ ok: true, dispatched: 0, message: "No active rules", armed: armedRes, freshness: freshRes }), { status: 200, headers: { "content-type": "application/json" } });
    }

    // 2. Group rules by location
    const byLocation = new Map<string, any[]>();
    for (const rule of rules) {
      const key = `${rule.user_id}|${rule.location_id}`;
      if (!byLocation.has(key)) byLocation.set(key, []);
      byLocation.get(key)!.push(rule);
    }

    // 3. For each location, fetch today's signals
    for (const [key, locationRules] of byLocation) {
      const [userId, locationId] = key.split("|");

      const [signals] = await bq.query({
        query: `
          SELECT change_subtype, change_category, alert_level, affected_date,
                 old_value, new_value, event_label, distance_m, mobility_mode,
                 lvl_rain, lvl_wind, lvl_snow, lvl_heat, lvl_cold, score_delta
          FROM \`${BQ_PROJECT}.semantic.vw_insight_event_change_feed\`
          WHERE location_id = @locationId
            AND affected_date = DATE(@today)
            AND alert_level >= 2
          ORDER BY alert_level DESC
          LIMIT 20
        `,
        params: { locationId, today: todayYmd },
        location: "EU",
      });

      if (!signals || signals.length === 0) continue;

      // 4. Map change_subtype to signal_category
      const CATEGORY_MAP: Record<string, string> = {
        weather_worsened: "weather", weather_improved: "weather", weather_hazard_onset: "weather",
        competitor_event_launch: "competition", competitor_audience_conflict: "competition",
        competition_pressure_spike: "competition", competitor_event_ending: "competition",
        mobility_disruption: "mobility", mobility_disruption_planned: "mobility",
        score_up: "opportunity", score_down: "opportunity", calendar_audience_shift: "calendar",
        mega_event_activation: "competition", mega_event_end: "competition",
        competitor_review_surge: "competition", competitor_review_drop: "competition",
        competitor_hours_change: "competition", competitor_new_offering: "competition",
        competitor_sold_out: "competition", competitor_content_spike: "competition",
        competitor_content_silent: "competition", institution_campaign_detected: "competition",
        media_mention_detected: "competition",
      };

      // 5. Match signals to rules
      for (const rule of locationRules) {
        const matchingSignals = signals.filter((s: any) => {
          const cat = CATEGORY_MAP[String(s.change_subtype || "").toLowerCase()] || "";
          return cat === rule.signal_category;
        });

        if (matchingSignals.length === 0) continue;

        // Frequency check: first_occurrence = only if no dispatch today for this rule.
        // 05/08 : action_log n'a JAMAIS eu de colonne metadata (schéma réel vérifié) — la
        // requête 500-ait tout le cron ; le rule_id vit dans `reason` (colonne réelle),
        // aligné avec l'INSERT ci-dessous.
        if (rule.frequency === "first_occurrence") {
          const [existing] = await bq.query({
            query: `
              SELECT 1 FROM \`${BQ_PROJECT}.analytics.action_log\`
              WHERE location_id = @locationId
                AND action_key = 'auto_dispatch'
                AND reason = @ruleId
                AND DATE(created_at) = DATE(@today)
              LIMIT 1
            `,
            params: { locationId, ruleId: rule.rule_id, today: todayYmd },
            location: "EU",
          });
          if (existing && existing.length > 0) continue;
        }

        // 6. Generate draft
        const topSignal = matchingSignals[0];
        const signalJson = {
          change_subtype: topSignal.change_subtype,
          event_label: topSignal.event_label || null,
          distance_m: topSignal.distance_m != null ? Number(topSignal.distance_m) : null,
          mobility_mode: topSignal.mobility_mode || null,
          affected_date: todayYmd,
          old_value: topSignal.old_value != null ? String(topSignal.old_value) : null,
          new_value: topSignal.new_value != null ? String(topSignal.new_value) : null,
          lvl_rain: Number(topSignal.lvl_rain || 0),
          lvl_wind: Number(topSignal.lvl_wind || 0),
          lvl_snow: Number(topSignal.lvl_snow || 0),
          lvl_heat: Number(topSignal.lvl_heat || 0),
          lvl_cold: Number(topSignal.lvl_cold || 0),
          score_delta: topSignal.score_delta != null ? Number(topSignal.score_delta) : null,
        };

        const baseUrl = url.origin;
        let draftRes;
        try {
          draftRes = await fetch(`${baseUrl}/api/insight/generate-action-draft`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action_key: "draft",
              channel: rule.channel,
              change_subtype: topSignal.change_subtype,
              signal: signalJson,
              card_what: String(topSignal.change_subtype),
              card_sowhat: "",
            }),
          });
        } catch (e) { continue; }

        const draftJson = await draftRes.json().catch(() => null);
        if (!draftJson?.ok || !draftJson?.draft) continue;

        const draft = draftJson.draft;

        // 7. Publish or notify
        if (!rule.require_approval) {
          // Auto-publish
          try {
            const pubRes = await fetch(`${baseUrl}/api/channels/publish`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                channel: rule.channel,
                location_id: locationId,
                title: draft.title || "",
                body: draft.body || draft.full_text || "",
                hashtags: draft.hashtags || "",
                recipient: rule.recipient,
                signal_type: topSignal.change_subtype,
                affected_date: todayYmd,
              }),
            });
            const pubJson = await pubRes.json().catch(() => null);
            results.push({
              rule_id: rule.rule_id,
              location_id: locationId,
              signal: topSignal.change_subtype,
              action: "published",
              success: pubJson?.ok || false,
            });
          } catch (e) {
            results.push({ rule_id: rule.rule_id, action: "publish_error" });
          }
        } else {
          // Save draft for approval
          try {
            await fetch(`${baseUrl}/api/analytics/save-draft`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                location_id: locationId,
                signal_type: topSignal.change_subtype,
                channel: rule.channel,
                card_what: String(topSignal.change_subtype),
                card_sowhat: "",
                affected_date: todayYmd,
                severity: "",
                title: draft.title || "",
                body: draft.body || draft.full_text || "",
                hashtags: draft.hashtags || "",
                recipient: rule.recipient,
                original_ai_text: draft.body || draft.full_text || "",
                user_instruction: "auto_dispatch",
              }),
            });
            results.push({
              rule_id: rule.rule_id,
              location_id: locationId,
              signal: topSignal.change_subtype,
              action: "draft_saved_for_approval",
            });
          } catch (e) {
            results.push({ rule_id: rule.rule_id, action: "save_error" });
          }
        }

        // 8. Log dispatch
        try {
          // 05/08 : aligné sur le schéma RÉEL d'action_log (pas de metadata/signal_type —
          // l'insert d'origine échouait en silence) ; reason = rule_id (le pourquoi du log).
          const logTable = bq.dataset("analytics").table("action_log");
          await logTable.insert([{
            log_id: crypto.randomUUID(),
            user_id: userId,
            location_id: locationId,
            action_key: "auto_dispatch",
            event: "auto_dispatch",
            channel: rule.channel,
            change_subtype: topSignal.change_subtype,
            affected_date: todayYmd,
            reason: rule.rule_id,
            created_at: new Date().toISOString(),
          }]);
        } catch (e) {}
      }
    }

    return new Response(JSON.stringify({ ok: true, dispatched: results.length, results, armed: armedRes, freshness: freshRes }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err: any) {
    console.error("[daily-dispatch] Error:", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message || "Unknown error" }), { status: 500, headers: { "content-type": "application/json" } });
  }
};