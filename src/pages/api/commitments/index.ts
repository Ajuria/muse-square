// Routes: /api/commitments  — CREATE / LIST / CANCEL only.
// Disposition, resolution, and retro are separate writers that reuse
// readMergeWrite() from src/lib/actionCommitments.ts. Mirrors
// src/pages/api/channels/internal-alert.ts (Clerk session, requireLocationOwnership).
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { isCommitmentOrigin } from "../../../lib/commitmentOrigins";
import { readMergeWrite, readLatestSnapshot, type CommitmentRow } from "../../../lib/actionCommitments";
import { themeForActionType } from "../../../lib/recoThemeMap";

export const prerender = false;
const BQ_PROJECT = "muse-square-open-data";

const WINDOW_DAYS: Record<string, number> = { day_of: 1, "7d": 7, "14d": 14 };
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
        !body.window_kind || !body.threshold_level ||
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
    const thresholdLevel = String(body.threshold_level).trim();
    if (!(thresholdLevel in THRESHOLD_Z)) {
      return json({ ok: false, error: "threshold_level invalide : " + thresholdLevel }, 400);
    }

    requireLocationOwnership(locals, body.location_id);

    const days = WINDOW_DAYS[windowKind];
    const start = new Date();
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
      measured_metric: "revenue_residual",
      window_kind: windowKind,
      window_start: ymd(start),
      window_end: ymd(end),
      window_days_expected: days,
      threshold_level: thresholdLevel,
      threshold_basis: "residual_z",
      threshold_value: THRESHOLD_Z[thresholdLevel],
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
    };

    await readMergeWrite(bq, { commitmentId, transitionType: "created", create: true, patch });
    return json({ ok: true, commitment_id: commitmentId });
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
      patch: { status: "cancelled" },
    });
    return json({ ok: true });
  } catch (err: any) {
    return json({ ok: false, error: err?.message || "Unknown error" }, errStatus(err));
  }
};
