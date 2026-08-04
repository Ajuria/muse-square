// Routes: /api/commitments  — CREATE / LIST / CANCEL only.
// Disposition, resolution, and retro are separate writers that reuse
// readMergeWrite() from src/lib/actionCommitments.ts. Mirrors
// src/pages/api/channels/internal-alert.ts (Clerk session, requireLocationOwnership).
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { sendSlack, sendEmail, loadChannelConfig } from "../../../lib/channels/internalSend";
import { kpiKeyForOrigin, kpiKeyForEventKpi, measureKpiBaseline, measureFamilyBaseline } from "../../../lib/kpiRegistry";
import { isCommitmentOrigin } from "../../../lib/commitmentOrigins";
import { readMergeWrite, readLatestSnapshot, type CommitmentRow } from "../../../lib/actionCommitments";
import { themeForActionType } from "../../../lib/recoThemeMap";
import { vif } from "../../../lib/commitmentResolve";
import { RHO_FLOOR } from "../../../lib/commitmentConstants";

export const prerender = false;
const BQ_PROJECT = "muse-square-open-data";

const WINDOW_DAYS: Record<string, number> = { day_of: 1, "7d": 7, "14d": 14, "30d": 30 };
const THRESHOLD_Z: Record<string, number> = { modeste: 1.0, net: 1.5 };
// Raw driver stored as-captured (frozen provenance); folded to a bucket at read time.
// 'both'/unknown/absent -> null (an ambiguous driver is not a driver). Advisory, never a gate.
const DRIVER_SET = new Set(["conversion", "basket", "footfall", "transactions"]);

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
function uid(locals: any): string | null {
  return String(locals?.clerk_user_id || "").trim() || null;
}
function errStatus(err: any): number {
  return String(err?.message || "").startsWith("FORBIDDEN") ? 403 : 500;
}

// ── Notification d'assignation (owner 26/07) ──────────────────────────────────────────────
// Désigner un responsable ENVOIE désormais : le membre du roster dont le nom correspond reçoit
// la notification sur son canal de contact (email d'abord, sinon Slack), via les configs de
// canal du compte (loadChannelConfig, « site d'abord sinon compte »). NON BLOQUANT : pas de
// membre / pas de contact / pas de config / échec d'envoi → l'engagement est créé quand même
// et la réponse porte assignment_notified=false — jamais un 500, jamais un mur.
// Connu et assumé : le créateur qui s'assigne lui-même reçoit aussi la notification (aucun
// mapping fiable user_id → membre du roster pour l'exclure sans le deviner).
const WINDOW_FR: Record<string, string> = { day_of: "le jour même", "7d": "7 jours", "14d": "14 jours", "30d": "30 jours" };
async function notifyAssignment(
  bq: any,
  userId: string,
  locationId: string,
  args: { ownerName: string; actionText: string; thresholdBasis: string; thresholdValue: number; thresholdLevel: string; windowKind: string; windowEnd: string },
): Promise<{ channel: string; ok: boolean; error?: string } | null> {
  // Membre du roster par nom — même résolution compte que /api/channels/team (site d'abord).
  const [rows] = await bq.query({
    query: `
      SELECT channels_contact FROM (
        SELECT channels_contact, ROW_NUMBER() OVER (
          PARTITION BY member_id
          ORDER BY (location_id = @locationId) DESC, updated_at DESC
        ) AS rn
        FROM \`${BQ_PROJECT}.analytics.team_members\`
        WHERE user_id = @userId
          AND LOWER(TRIM(CONCAT(IFNULL(first_name, ''), ' ', IFNULL(last_name, '')))) = LOWER(TRIM(@name))
      )
      WHERE rn = 1
      LIMIT 1
    `,
    params: { userId, locationId, name: args.ownerName },
    location: "EU",
  });
  let contact: any = {};
  if (rows?.[0]) { try { contact = JSON.parse(rows[0].channels_contact || "{}"); } catch {} }

  // Copie FR terse (voix produit) ; date verdict JJ/MM/AAAA — jamais l'ISO en face utilisateur.
  const we = String(args.windowEnd || "");
  const verdictFr = we.length >= 10 ? we.slice(8, 10) + "/" + we.slice(5, 7) + "/" + we.slice(0, 4) : we;
  const goalFr = args.thresholdBasis === "pct"
    ? "+" + Math.round(args.thresholdValue) + " % (CA vs attendu)"
    : "niveau « " + args.thresholdLevel + " » (CA vs attendu)";
  const title = "Muse Square — un engagement vous est assigné";
  const body = args.ownerName + ", un engagement vous est assigné.\n\n"
    + "Action : " + args.actionText + "\n"
    + "Objectif : " + goalFr + " sur " + (WINDOW_FR[args.windowKind] || args.windowKind) + " — verdict le " + verdictFr + ".\n\n"
    + "À suivre sur votre page Pulse.";

  if (contact && typeof contact.email === "string" && contact.email.includes("@")) {
    const config = await loadChannelConfig(bq, userId, locationId, "email");
    const r = await sendEmail(config, { title, body, recipient: contact.email });
    return { channel: "email", ok: r.ok, error: r.error };
  }
  if (contact && typeof contact.slack === "string" && contact.slack.trim()) {
    const config = await loadChannelConfig(bq, userId, locationId, "slack");
    const r = await sendSlack(config, { title, body, recipient: contact.slack });
    return { channel: "slack", ok: r.ok, error: r.error };
  }
  return null; // pas de contact → rien à envoyer (le responsable voit la carte dans l'app)
}

// ── GET /api/commitments?location_id=… → latest-per-commitment, non-cancelled ──
export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const userId = uid(locals);
    if (!userId) return json({ ok: false }, 401);
    // Per-site scope, SAME ownership check as create (requireLocationOwnership) so a
    // commitment is readable exactly where it was writable — no create/list asymmetry.
    // Engagement cards behave like system cards: you see a site's cards when viewing
    // that site. user_id rides along per row for provenance + an optional "mes
    // engagements" client filter; visibility stays team-per-location.
    const locationId = url.searchParams.get("location_id");
    if (!locationId) return json({ ok: false, error: "Missing location_id" }, 400);
    requireLocationOwnership(locals, locationId);

    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);

    // ── ?goal_context=1&window_kind=… → traduction €/% pour le formulaire « M'engager » ──
    // Objectif libre (18/07) : le formulaire affiche le CA habituel de la fenêtre + le plancher
    // de détectabilité + les presets Modeste/Net traduits dans le VRAI bruit du lieu (même math
    // que commitmentResolve : sigma jour récupérable |resid|/|z|, ρ mesuré flooré, VIF) — plus
    // jamais la constante globale 0,19. Sans historique de ventes → nulls (le formulaire dégrade).
    if (url.searchParams.get("goal_context")) {
      const wk = String(url.searchParams.get("window_kind") || "7d").trim();
      const days = WINDOW_DAYS[wk] || 7;
      const [gRows] = await bq.query({
        query: `
          WITH base AS (
            SELECT date, daily_revenue, expected_revenue, residual_z
            FROM \`${BQ_PROJECT}.mart.fct_client_day_residual\`
            WHERE location_id = @locationId
              AND date >= DATE_SUB(CURRENT_DATE('Europe/Paris'), INTERVAL 56 DAY)
          ),
          mu AS (SELECT AVG(expected_revenue) AS mu_day, COUNT(*) AS n_days FROM base),
          sig AS (
            SELECT APPROX_QUANTILES(
              SAFE_DIVIDE(ABS(daily_revenue - expected_revenue), NULLIF(ABS(residual_z), 0)), 2
            )[OFFSET(1)] AS sigma_day
            FROM base WHERE residual_z IS NOT NULL AND ABS(residual_z) >= 0.05
          ),
          rho AS (
            SELECT CORR(residual_z, prev) AS rho
            FROM (SELECT residual_z, LAG(residual_z) OVER (ORDER BY date) AS prev FROM base)
            WHERE prev IS NOT NULL
          )
          SELECT mu.mu_day, mu.n_days, sig.sigma_day, rho.rho FROM mu, sig, rho
        `,
        params: { locationId },
        location: "EU",
      });
      const g: any = (gRows as any[])[0] || {};
      const mu = Number(g.mu_day) || 0;
      const sigma = Number(g.sigma_day) || 0;
      let rho = g.rho != null && Number.isFinite(Number(g.rho)) ? Number(g.rho) : RHO_FLOOR;
      if (!(rho >= RHO_FLOOR)) rho = RHO_FLOOR;
      const vifVal = vif(rho, days);
      const pctForZ = (z: number): number | null =>
        mu > 0 && sigma > 0 ? Math.max(1, Math.round((z * (sigma / mu) * Math.sqrt(vifVal) / Math.sqrt(days)) * 100)) : null;
      return json({
        ok: true,
        window_kind: wk,
        days,
        n_days: Number(g.n_days) || 0,
        baseline_daily: mu > 0 ? Math.round(mu) : null,
        baseline_window: mu > 0 ? Math.round(mu * days) : null,
        floor_pct: pctForZ(1.0),
        preset_modeste_pct: pctForZ(1.0),
        preset_net_pct: pctForZ(1.5),
      });
    }

    const [rows] = await bq.query({
      query: `
        SELECT * EXCEPT(rn) FROM (
          SELECT *, ROW_NUMBER() OVER (
            PARTITION BY commitment_id ORDER BY updated_at DESC
          ) AS rn
          FROM \`${BQ_PROJECT}.analytics.action_commitments\`
          WHERE location_id = @locationId
        )
        WHERE rn = 1 AND status != 'cancelled'
        ORDER BY updated_at DESC
      `,
      params: { locationId },
      location: "EU",
    });
    // user_id (creator) + owner_person_id ride along in each row → client can
    // build a "mes engagements" filter on top of the team-shared list.
    return json({ ok: true, items: rows || [] });
  } catch (err: any) {
    return json({ ok: false, error: err?.message || "Unknown error" }, errStatus(err));
  }
};

// ── POST /api/commitments → create ──
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = uid(locals);
    if (!userId) return json({ ok: false }, 401);

    const body = await request.json().catch(() => null);
    if (!body || !body.location_id || !body.origin_action_type ||
        !body.window_kind || (!body.threshold_level && body.threshold_pct == null) ||
        !body.committed_action_text || !body.owner_person_name) {
      return json({ ok: false, error: "Champs requis manquants" }, 400);
    }

    const originActionType = String(body.origin_action_type).trim();
    if (!isCommitmentOrigin(originActionType)) {
      return json({ ok: false, error: "origin_action_type non éligible : " + originActionType }, 400);
    }
    const windowKind = String(body.window_kind).trim();
    if (!(windowKind in WINDOW_DAYS)) {
      return json({ ok: false, error: "window_kind invalide : " + windowKind }, 400);
    }
    // Objectif libre (18/07, proto validé) : base 'pct' — l'utilisateur fixe x % (1–100),
    // le verdict comparera le % réalisé de la fenêtre à CE chiffre (commitmentResolve).
    // Legacy modeste/net (base residual_z) conservé pour les anciens clients/prefills.
    let thresholdLevel: string, thresholdBasis: string, thresholdValue: number;
    if (String(body.threshold_basis || "").trim() === "pct" || body.threshold_pct != null) {
      const p = Number(body.threshold_pct);
      if (!Number.isFinite(p) || p < 1 || p > 100) {
        return json({ ok: false, error: "threshold_pct invalide (1–100) : " + body.threshold_pct }, 400);
      }
      thresholdLevel = "custom";
      thresholdBasis = "pct";
      thresholdValue = Math.round(p);
    } else {
      thresholdLevel = String(body.threshold_level).trim();
      if (!(thresholdLevel in THRESHOLD_Z)) {
        return json({ ok: false, error: "threshold_level invalide : " + thresholdLevel }, 400);
      }
      thresholdBasis = "residual_z";
      thresholdValue = THRESHOLD_Z[thresholdLevel];
    }

    requireLocationOwnership(locals, body.location_id);

    const days = WINDOW_DAYS[windowKind];
    // Fenêtre ancrée (03/08, spec evenement-dossier § 1.3) : un engagement d'ÉVÉNEMENT mesure la
    // ou les dates de l'occurrence, pas « à partir d'aujourd'hui ». `window_start_date` (Y-m-d,
    // futur ou aujourd'hui) ancre la fenêtre ; absent → comportement historique inchangé.
    let start = new Date();
    if (body.window_start_date != null) {
      const ws = String(body.window_start_date).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ws) || Number.isNaN(Date.parse(ws + "T00:00:00Z"))) {
        return json({ ok: false, error: "window_start_date invalide (YYYY-MM-DD) : " + ws }, 400);
      }
      start = new Date(ws + "T00:00:00Z");
    }
    const end = new Date(start.getTime());
    end.setUTCDate(end.getUTCDate() + (days - 1));

    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    const commitmentId = crypto.randomUUID();

    const patch: Partial<CommitmentRow> = {
      user_id: userId,
      location_id: String(body.location_id).trim(),
      status: "open",
      verdict: null,
      origin_kind: "action_card",
      origin_action_type: originActionType,
      origin_driver: DRIVER_SET.has(String(body.origin_driver || "").trim().toLowerCase())
        ? String(body.origin_driver).trim().toLowerCase() : null,
      // Engine-1 A↔B bridge: the factor/theme the card was about. Advisory, not a gate. The client
      // may send it explicitly; otherwise we DERIVE it server-side from the action_type's theme
      // (recoThemeMap) — the granularity a card reliably carries — so commitments never land NULL.
      origin_factor: body.origin_factor
        ? String(body.origin_factor).trim().toLowerCase()
        : themeForActionType(originActionType),
      origin_suppression_key: body.origin_suppression_key ? String(body.origin_suppression_key) : null,
      origin_card_instance_id: body.origin_card_instance_id ? String(body.origin_card_instance_id) : null,
      origin_affected_date: body.origin_affected_date ? String(body.origin_affected_date) : null,
      saved_item_id: body.saved_item_id ? String(body.saved_item_id).trim() : null,
      // Étape 3 (26/07) : measured_metric = kpi de la CARTE (type + driver), plus jamais codé en
      // dur — kpiKeyForOrigin (lib/kpiRegistry). 'revenue_residual' reste le défaut et garde toute
      // sa machinerie ; les KPIs non-K1 sont mesurés en colonnes kpi_* (baseline ci-dessous,
      // window/delta à la résolution).
      // Événements (03/08) : le KPI DÉCLARÉ sur l'événement prime — mapping registre (foyer
      // unique kpiKeyForEventKpi) ; hors événement, la dérivation carte+driver inchangée.
      measured_metric: (originActionType.startsWith("event_") && kpiKeyForEventKpi(body.event_kpi))
        || kpiKeyForOrigin(
          originActionType,
          DRIVER_SET.has(String(body.origin_driver || "").trim().toLowerCase())
            ? String(body.origin_driver).trim().toLowerCase() : null,
        ),
      window_kind: windowKind,
      window_start: ymd(start),
      window_end: ymd(end),
      window_days_expected: days,
      threshold_level: thresholdLevel,
      threshold_basis: thresholdBasis,
      threshold_value: thresholdValue,
      committed_action_text: String(body.committed_action_text),
      owner_person_name: String(body.owner_person_name),
      owner_person_id: body.owner_person_id ? String(body.owner_person_id) : null,
      creation_residual_pct: body.creation_residual_pct != null ? Number(body.creation_residual_pct) : null,
      creation_residual_z: body.creation_residual_z != null ? Number(body.creation_residual_z) : null,
      creation_confidence_tier: body.creation_confidence_tier ? String(body.creation_confidence_tier) : null,
      // Measurable goal reference: window baseline (€) = the card's daily past-performance
      // average × window days. Stored in window_expected_revenue (null until now for open
      // rows; the resolution cron overwrites it with the ACTUAL Σexpected). Lets the card show
      // a concrete "votre habituel ~X€" target instead of the meaningless qualitative level.
      window_expected_revenue: body.creation_baseline_daily != null
        ? Math.round(Number(body.creation_baseline_daily) * days)
        : null,
      // Adjustment "how" loop: when this commitment adjusts a prior one (poursuivre/doubler/pivoter),
      // carry the move + what changed + the chain link. Null on a first-time (non-adjustment) commit.
      adjustment_move: body.adjustment_move ? String(body.adjustment_move).trim() : null,
      adjustment_note: body.adjustment_note != null ? (String(body.adjustment_note).trim() || null) : null,
      parent_commitment_id: body.parent_commitment_id ? String(body.parent_commitment_id) : null,
      // Gel de l'enjeu d'origine (26/07) : les champs VERBATIM de la pill de la carte — la page
      // évolution les rend tels quels (jamais recalculés, jamais reformulés). Null si la carte
      // d'origine ne portait pas d'enjeu (absence honnête → pas de bloc sur la page).
      creation_enjeu_eur_year: body.creation_enjeu_eur_year != null ? Number(body.creation_enjeu_eur_year) : null,
      creation_enjeu_tier_label_fr: body.creation_enjeu_tier_label_fr ? String(body.creation_enjeu_tier_label_fr) : null,
      creation_enjeu_label_fr: body.creation_enjeu_label_fr ? String(body.creation_enjeu_label_fr) : null,
      creation_enjeu_class_key: body.creation_enjeu_class_key ? String(body.creation_enjeu_class_key) : null,
      creation_enjeu_entangled: typeof body.creation_enjeu_entangled === "boolean" ? body.creation_enjeu_entangled : null,
      creation_enjeu_inherited: typeof body.creation_enjeu_inherited === "boolean" ? body.creation_enjeu_inherited : null,
    };

    // Baseline KPI (étape 3) : 30 j glissants avant la fenêtre, dans l'unité de measured_metric.
    // Non bloquant : échec/absence de données → null (jamais un chiffre inventé, jamais un 500).
    if (patch.measured_metric === "family_revenue") {
      // K8 : baseline famille (30 j pré-fenêtre) — la famille arrive du client à la création
      // (body.kpi_family) ; la résolution la relira sur l'événement ancré. Échec soft → null.
      try {
        const _fam = String(body.kpi_family || "").trim();
        patch.kpi_baseline = _fam ? await measureFamilyBaseline(bq, String(patch.location_id), _fam, String(patch.window_start)) : null;
      } catch { patch.kpi_baseline = null; }
    } else if (patch.measured_metric && patch.measured_metric !== "revenue_residual") {
      try {
        patch.kpi_baseline = await measureKpiBaseline(bq, String(patch.location_id), patch.measured_metric as any, String(patch.window_start));
      } catch { patch.kpi_baseline = null; }
    }

    await readMergeWrite(bq, { commitmentId, transitionType: "created", create: true, patch });

    // Notification d'assignation — attendue (Vercel ne garantit pas le travail post-réponse)
    // mais jamais bloquante : tout échec retombe sur notified=null, l'engagement est déjà créé.
    let notified: { channel: string; ok: boolean; error?: string } | null = null;
    try {
      notified = await notifyAssignment(bq, userId, String(patch.location_id), {
        ownerName: String(patch.owner_person_name),
        actionText: String(patch.committed_action_text),
        thresholdBasis, thresholdValue, thresholdLevel,
        windowKind,
        windowEnd: String(patch.window_end),
      });
    } catch { notified = null; }
    return json({
      ok: true,
      commitment_id: commitmentId,
      assignment_notified: Boolean(notified && notified.ok),
      assignment_channel: notified && notified.ok ? notified.channel : null,
    });
  } catch (err: any) {
    return json({ ok: false, error: err?.message || "Unknown error" }, errStatus(err));
  }
};

// ── DELETE /api/commitments → soft-cancel (full-snapshot append) ──
export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const userId = uid(locals);
    if (!userId) return json({ ok: false }, 401);
    const body = await request.json().catch(() => null);
    if (!body || !body.commitment_id || !body.location_id) {
      return json({ ok: false, error: "Champs requis : commitment_id, location_id" }, 400);
    }
    requireLocationOwnership(locals, body.location_id);

    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    const prior = await readLatestSnapshot(bq, String(body.commitment_id));
    if (!prior || prior.location_id !== String(body.location_id).trim()) {
      return json({ ok: false, error: "Engagement introuvable" }, 404);
    }
    if (prior.status === "cancelled") return json({ ok: true }); // idempotent

    await readMergeWrite(bq, {
      commitmentId: String(body.commitment_id),
      transitionType: "cancelled",
      // Soft-cancel. "Arrêter" sends adjustment_move='stop' + a reason (suppression then reappears the
      // system card); an adjust-supersede sends no move (the active child keeps the card suppressed).
      patch: {
        status: "cancelled",
        adjustment_move: body.adjustment_move ? String(body.adjustment_move).trim() : null,
        adjustment_note: body.adjustment_note != null ? (String(body.adjustment_note).trim() || null) : null,
      },
    });
    return json({ ok: true });
  } catch (err: any) {
    return json({ ok: false, error: err?.message || "Unknown error" }, errStatus(err));
  }
};
