// Routes: /api/commitments  — CREATE / LIST / CANCEL only.
// Disposition, resolution, and retro are separate writers that reuse
// readMergeWrite() from src/lib/commitments/actionCommitments.ts. Mirrors
// src/pages/api/channels/internal-alert.ts (Clerk session, requireLocationOwnership).
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership, requireLocationAccess } from "../../../lib/requireLocationOwnership";
import { memberCommitmentInPerimeter, memberCommitmentProjection } from "../../../lib/memberCardPolicy";
import { sendSlack, sendEmail, loadChannelConfig } from "../../../lib/channels/internalSend";
import { kpiKeyForOrigin, kpiKeyForEventKpi, measureKpiBaseline, measureFamilyBaseline, measureProfitBaseline } from "../../../lib/kpi/kpiRegistry";
import { isCommitmentOrigin } from "../../../lib/commitments/commitmentOrigins";
import { readMergeWrite, readLatestSnapshot, type CommitmentRow, lineageFor } from "../../../lib/commitments/actionCommitments";
import { parseComponents } from "../../../lib/dispositifs/dispositifTypes";
import { listPoles } from "../../../lib/dispositifs/poleReading";
import { assignmentMessageFr } from "../../../lib/channels/slackMessagesFr";
import { themeForActionType } from "../../../lib/recos/recoThemeMap";
import { vif } from "../../../lib/commitments/commitmentResolve";
import { RHO_FLOOR } from "../../../lib/commitments/commitmentConstants";

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
  args: { ownerName: string; senderName?: string | null; actionText: string; thresholdBasis: string; thresholdValue: number; thresholdLevel: string; windowKind: string; windowEnd: string; commitmentId?: string },
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

  // Inc 8 (G2, mots owner 28/08) : « {Prénom} vous a assigné une tâche. » + action +
  // objectif — boutons Consulter · Ajuster (liens ; « Fait » serait trop tôt à
  // l'assignation, arbitrage owner). Copie au foyer unique lib/channels/slackMessagesFr
  // — corrige au passage le « CA vs attendu » banni (→ « vs votre résultat habituel »).
  const msg = assignmentMessageFr({
    senderName: args.senderName ?? null,
    actionText: args.actionText,
    thresholdBasis: args.thresholdBasis, thresholdValue: args.thresholdValue, thresholdLevel: args.thresholdLevel,
    windowKind: args.windowKind, windowEnd: args.windowEnd,
    commitmentId: args.commitmentId, locationId,
  });

  if (contact && typeof contact.email === "string" && contact.email.includes("@")) {
    const config = await loadChannelConfig(bq, userId, locationId, "email");
    const r = await sendEmail(config, { title: msg.title, body: msg.emailBody, recipient: contact.email });
    return { channel: "email", ok: r.ok, error: r.error };
  }
  if (contact && typeof contact.slack === "string" && contact.slack.trim()) {
    const config = await loadChannelConfig(bq, userId, locationId, "slack");
    const r = await sendSlack(config, { title: msg.title, body: msg.body, recipient: contact.slack, blocks: msg.blocks });
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
    // Vue équipe inc 5 : la LISTE s'ouvre au membre du site (filtrée à son périmètre plus
    // bas) ; goal_context (formulaire M'engager, geste owner) reste owner-only.
    requireLocationAccess(locals, locationId);
    const isMemberRole = String((locals as any)?.role || "") === "member";
    if (isMemberRole && url.searchParams.get("goal_context")) {
      return json({ ok: false, error: "FORBIDDEN: geste owner" }, 403);
    }

    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);

    // ── ?goal_context=1&window_kind=… → traduction €/% pour le formulaire « M'engager » ──
    // Objectif libre (18/07) : le formulaire affiche le CA habituel de la fenêtre + le plancher
    // de détectabilité + les presets Modeste/Net traduits dans le VRAI bruit du lieu (même math
    // que commitmentResolve : sigma jour récupérable |resid|/|z|, ρ mesuré flooré, VIF) — plus
    // jamais la constante globale 0,19. Sans historique de ventes → nulls (le formulaire dégrade).
    if (url.searchParams.get("goal_context")) {
      const wk = String(url.searchParams.get("window_kind") || "7d").trim();
      const days = WINDOW_DAYS[wk] || 7;
      // Pôles du site (03/09, « Je m'engage » rattaché à un pôle) : LE foyer listPoles, amorcé en
      // parallèle du contexte d'objectif — un aller-retour de plus en parallèle, jamais en série.
      const polesP = listPoles(bq, locationId).catch(() => []);
      const [gRows] = await bq.query({
        query: `
          WITH base AS (
            SELECT date, daily_revenue, expected_revenue, residual_z
            FROM \`${BQ_PROJECT}.semantic.vw_insight_event_day_residual\`
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
        // La liste des pôles ouverts pour « Rattacher à un pôle » (mêmes champs que create_context).
        poles: (await polesP).map((p) => ({ dispositif_id: p.dispositif_id, name: p.name, families: p.families })),
      });
    }

    const [rows] = await bq.query({
      query: `
        SELECT * EXCEPT(rn) FROM (
          SELECT *, ROW_NUMBER() OVER (
            PARTITION BY commitment_id ORDER BY updated_at DESC, CASE WHEN status IN ('resolved', 'cancelled') THEN 1 ELSE 0 END DESC, (verdict IS NOT NULL) DESC, created_at DESC
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
    // Membre : périmètre de pôles + PROJECTION liste blanche (la cible passe, le
    // kpi_baseline — un CA habituel, donc un niveau — et le reste du journal non).
    if (isMemberRole) {
      const memberItems = (rows || [])
        .filter((r: any) => memberCommitmentInPerimeter(locals, String(locationId), r))
        .map(memberCommitmentProjection);
      return json({ ok: true, role: "member", items: memberItems });
    }
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
    if (!body) return json({ ok: false, error: "Champs requis manquants" }, 400);

    // ── PÔLE / DISPOSITIF PERMANENT (spec poles-dispositifs-permanents, owner 27/08) ──
    // Une nature SANS terme : ni fenêtre, ni objectif, ni verdict — le cron de résolution ne
    // le voit jamais (window_end NULL). Ce qui le définit : le levier (description) et ses
    // familles RÉELLES (pole_families, jamais du texte libre). Même table, même chaîne de
    // versions (lineageFor) ; le responsable est un ATTRIBUT — le pôle demeure jusqu'à
    // fermeture (soft-cancel aujourd'hui, rendu « fermé » côté surface).
    if (String(body.dispositif_nature || "").trim() === "permanent") {
      if (!body.location_id || !body.committed_action_text) {
        return json({ ok: false, error: "Champs requis manquants (pôle) : location_id, committed_action_text" }, 400);
      }
      const fams = Array.isArray(body.pole_families)
        ? body.pole_families.map((f: any) => String(f).trim()).filter(Boolean) : [];
      if (!fams.length && !body.parent_commitment_id) {
        return json({ ok: false, error: "pole_families requis : les familles réelles du pôle" }, 400);
      }
      requireLocationOwnership(locals, body.location_id);
      const bqP = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
      const poleId = crypto.randomUUID();
      const _pParentId = body.parent_commitment_id ? String(body.parent_commitment_id).trim() : null;
      let _pParent: Awaited<ReturnType<typeof readLatestSnapshot>> = null;
      if (_pParentId) {
        _pParent = await readLatestSnapshot(bqP, _pParentId);
        if (!_pParent) return json({ ok: false, error: "parent_commitment_id introuvable" }, 400);
        if (String(_pParent.location_id) !== String(body.location_id).trim()) {
          return json({ ok: false, error: "parent_commitment_id d'un autre site" }, 403);
        }
        if ((_pParent as any).dispositif_nature !== "permanent") {
          return json({ ok: false, error: "le parent n'est pas un dispositif permanent" }, 400);
        }
      }
      const _pLineage = lineageFor(_pParent, poleId);
      // Composants (03/09, spec dispositifs-typologie § 3) : type/rôle du registre, clé stable,
      // libellé libre. Absents au POST → hérités du parent (même règle que le contexte de version).
      const _pComps = parseComponents(body.components, () => crypto.randomUUID().slice(0, 8));
      if (!_pComps.ok) return json({ ok: false, error: _pComps.error }, 400);
      const _pComponents: string | null = body.components != null
        ? (_pComps.components.length ? JSON.stringify(_pComps.components) : null)
        : (((_pParent as any)?.components as string | null | undefined) ?? null);
      const row = await readMergeWrite(bqP, {
        commitmentId: poleId, transitionType: "created", create: true,
        patch: {
          user_id: userId, location_id: String(body.location_id).trim(),
          status: "open", verdict: null, authorship: "user_authored",
          origin_kind: "pole", origin_action_type: "pole",
          dispositif_nature: "permanent",
          pole_families: fams.length ? JSON.stringify(fams) : ((_pParent as any)?.pole_families ?? null),
          components: _pComponents,
          committed_action_text: String(body.committed_action_text).trim(),
          owner_person_name: body.owner_person_name != null && String(body.owner_person_name).trim()
            ? String(body.owner_person_name).trim() : (_pParent?.owner_person_name ?? null),
          dispositif_plus: body.dispositif_plus != null && String(body.dispositif_plus).trim()
            ? String(body.dispositif_plus).trim() : ((_pParent as any)?.dispositif_plus ?? null),
          dispositif_why: body.dispositif_why != null && String(body.dispositif_why).trim()
            ? String(body.dispositif_why).trim() : ((_pParent as any)?.dispositif_why ?? null),
          dispositif_resources: body.dispositif_resources != null && String(body.dispositif_resources).trim()
            ? String(body.dispositif_resources).trim() : ((_pParent as any)?.dispositif_resources ?? null),
          adjustment_move: body.adjustment_move ? String(body.adjustment_move).trim() : null,
          adjustment_note: body.adjustment_note != null ? (String(body.adjustment_note).trim() || null) : null,
          parent_commitment_id: _pParentId,
          dispositif_id: _pLineage.dispositif_id,
          version_no: _pLineage.version_no,
          operation_cost_eur: body.operation_cost_eur != null && Number.isFinite(Number(body.operation_cost_eur)) && Number(body.operation_cost_eur) >= 0 && Number(body.operation_cost_eur) <= 1000000
            ? Math.round(Number(body.operation_cost_eur) * 100) / 100 : null,
        } as any,
      } as any);
      return json({ ok: true, commitment_id: row.commitment_id, dispositif_id: (row as any).dispositif_id, version_no: (row as any).version_no });
    }

    if (!body.location_id || !body.origin_action_type ||
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

    // Durée d'événement multi-jours (04/08, proto v4 validé) : `window_days` (1–31) surcharge
    // la durée nominale du kind — la fenêtre de mesure couvre [lancement, lancement+durée−1].
    // Absent → comportement historique inchangé. La résolution lit window_start/window_end/
    // window_days_expected en colonnes, jamais le kind : aucune autre pièce à toucher.
    let days = WINDOW_DAYS[windowKind];
    if (body.window_days != null) {
      const wd = Number(body.window_days);
      if (!Number.isInteger(wd) || wd < 1 || wd > 31) {
        return json({ ok: false, error: "window_days invalide (1–31) : " + body.window_days }, 400);
      }
      days = wd;
    }
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

    // Garde-fou (27/08, audit menu KPI) : un event_kpi FOURNI mais intraduisible ne retombe
    // JAMAIS en silence sur la dérivation carte — le verdict jugerait le CA alors que
    // l'utilisateur a déclaré un autre KPI (le défaut « KPI perdu », déjà mesuré deux fois :
    // la V2 d'un engagement événement, puis la carte journal). Inatteignable depuis l'UI
    // aujourd'hui (« Profit estimé » est désactivé) : défense en profondeur — refus explicite
    // plutôt qu'un verdict silencieusement faux.
    if (originActionType.startsWith("event_") && body.event_kpi != null && String(body.event_kpi).trim()
        && !kpiKeyForEventKpi(body.event_kpi)) {
      return json({ ok: false, error: "event_kpi non mesurable : " + String(body.event_kpi).trim() }, 400);
    }

    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    const commitmentId = crypto.randomUUID();

    // LIGNÉE (27/08, point identité) — une V2 hérite de son parent : l'identité du dispositif,
    // le numéro de version, LE KPI (re-tester = re-tester sur le même étage — un KPI redérivé
    // faisait juger la V2 sur le CA, défaut mesuré) et l'événement ancré qui porte la famille.
    // Règle pure : lineageFor (actionCommitments, testée). Le parent doit appartenir au même
    // site — un parent d'un autre lieu est refusé, jamais hérité en silence.
    const _parentId = body.parent_commitment_id ? String(body.parent_commitment_id).trim() : null;
    let _parentSnap: Awaited<ReturnType<typeof readLatestSnapshot>> = null;
    if (_parentId) {
      _parentSnap = await readLatestSnapshot(bq, _parentId);
      if (!_parentSnap) return json({ ok: false, error: "parent_commitment_id introuvable" }, 400);
      if (String(_parentSnap.location_id) !== String(body.location_id).trim()) {
        return json({ ok: false, error: "parent_commitment_id d'un autre site" }, 403);
      }
    }
    const _lineage = lineageFor(_parentSnap, commitmentId);

    // Rattachement opération→pôle (spec pôles, 27/08) : attached_pole_id = le dispositif_id
    // du pôle — validé contre le site et la nature, hérité du parent si absent. Ce n'est PAS
    // parent_commitment_id (filiation de versions). L'héritage du KPI famille depuis le pôle
    // passe par le rail saved_items.kpi_family (measured_metric est 'family_revenue' NU) —
    // branché avec la lecture continue, pas deviné ici.
    let _attachedPoleId: string | null = body.attached_pole_id
      ? String(body.attached_pole_id).trim()
      : (((_parentSnap as any)?.attached_pole_id as string | undefined) ?? null);
    if (body.attached_pole_id) {
      const [prows] = await bq.query({
        query: `SELECT 1 FROM (
                  SELECT dispositif_nature, location_id,
                         ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) AS rn
                  FROM \`${process.env.BQ_PROJECT_ID || BQ_PROJECT}.analytics.action_commitments\`
                  WHERE dispositif_id = @p
                ) WHERE rn = 1 AND dispositif_nature = 'permanent' AND location_id = @loc LIMIT 1`,
        params: { p: _attachedPoleId, loc: String(body.location_id).trim() },
        types: { p: "STRING", loc: "STRING" }, location: "EU",
      });
      if (!prows || !prows.length) {
        return json({ ok: false, error: "attached_pole_id introuvable ou pas un dispositif permanent de ce site" }, 400);
      }
    }
    const _natureRaw = String(body.dispositif_nature || "").trim();
    const _nature = _natureRaw === "serie" ? "serie"
      : _natureRaw === "operation" ? "operation"
      : (((_parentSnap as any)?.dispositif_nature as string | undefined) ?? "operation");

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
      saved_item_id: body.saved_item_id ? String(body.saved_item_id).trim() : _lineage.inherited_saved_item_id,
      // Étape 3 (26/07) : measured_metric = kpi de la CARTE (type + driver), plus jamais codé en
      // dur — kpiKeyForOrigin (lib/kpiRegistry). 'revenue_residual' reste le défaut et garde toute
      // sa machinerie ; les KPIs non-K1 sont mesurés en colonnes kpi_* (baseline ci-dessous,
      // window/delta à la résolution).
      // Événements (03/08) : le KPI DÉCLARÉ sur l'événement prime — mapping registre (foyer
      // unique kpiKeyForEventKpi) ; hors événement, la dérivation carte+driver inchangée.
      measured_metric: (_lineage.inherited_metric as any)
        || (originActionType.startsWith("event_") && kpiKeyForEventKpi(body.event_kpi))
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
      dispositif_id: _lineage.dispositif_id,
      version_no: _lineage.version_no,
      // Contexte de la version (étape 3, 27/08) — « Le plus du dispositif », « Pourquoi ça va
      // marcher », « Ressource(s) ». Chaque version porte les siens ; absents au POST, une V2
      // hérite de ceux du parent (même règle que measured_metric — posé ici, jamais re-dérivé).
      dispositif_plus: body.dispositif_plus != null && String(body.dispositif_plus).trim()
        ? String(body.dispositif_plus).trim() : ((_parentSnap as any)?.dispositif_plus ?? null),
      dispositif_why: body.dispositif_why != null && String(body.dispositif_why).trim()
        ? String(body.dispositif_why).trim() : ((_parentSnap as any)?.dispositif_why ?? null),
      dispositif_resources: body.dispositif_resources != null && String(body.dispositif_resources).trim()
        ? String(body.dispositif_resources).trim() : ((_parentSnap as any)?.dispositif_resources ?? null),
      // Pôles & natures (27/08) : nature explicite (jamais déduite de l'absence de dates),
      // rattachement au pôle validé/hérité ci-dessus. pole_families reste NULL sur une
      // opération datée — le périmètre appartient au pôle.
      dispositif_nature: _nature,
      attached_pole_id: _attachedPoleId,
      pole_families: null,
      // Coût de l'opération (ROI) : saisi, optionnel — jamais hérité en silence.
      operation_cost_eur: body.operation_cost_eur != null && Number.isFinite(Number(body.operation_cost_eur)) && Number(body.operation_cost_eur) >= 0 && Number(body.operation_cost_eur) <= 1000000
        ? Math.round(Number(body.operation_cost_eur) * 100) / 100 : null,
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
        // V2 héritée : la famille ne voyage pas dans le body — on la relit sur l'événement
        // ancré (raw.saved_items.kpi_family), la MÊME source que la résolution. Sinon la
        // baseline de la V2 partait à null en silence.
        let _fam = String(body.kpi_family || "").trim();
        if (!_fam && patch.saved_item_id) {
          const [fr] = await bq.query({
            query: `SELECT kpi_family FROM \`${process.env.BQ_PROJECT_ID || BQ_PROJECT}.raw.saved_items\` WHERE saved_item_id = @sid LIMIT 1`,
            params: { sid: String(patch.saved_item_id) }, types: { sid: "STRING" }, location: "EU",
          });
          const v = fr?.[0]?.kpi_family;
          _fam = v != null ? String((v as any)?.value ?? v).trim() : "";
        }
        patch.kpi_baseline = _fam ? await measureFamilyBaseline(bq, String(patch.location_id), _fam, String(patch.window_start)) : null;
      } catch { patch.kpi_baseline = null; }
    } else if (patch.measured_metric === "profit_estimated") {
      // K9 (24/08) : baseline profit estimé (30 j pré-fenêtre, marges déclarées lues au moment
      // de la mesure). Aucune marge déclarée → null — jamais un chiffre inventé. Échec soft.
      try {
        patch.kpi_baseline = await measureProfitBaseline(bq, String(patch.location_id), String(patch.window_start));
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
        commitmentId,
        senderName: String((locals as any)?.first_name || "").trim() || null,
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
