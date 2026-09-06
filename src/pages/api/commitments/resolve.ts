// Route: /api/commitments/resolve — résolution À LA LECTURE (06/09, audit N5).
// POST { commitment_id, location_id } → si le dernier instantané est open/pending ET que sa
// fenêtre est close (Europe/Paris), résout et persiste par resolveAndPersist — la MÊME fonction
// que cron/commitment-resolve (verdict Slack compris). Sinon 200 { ok:true, changed:false }.
// Pourquoi : le cron nocturne tourne AVANT l'ingestion des ventes de la veille (mesuré 06/09 :
// pending 0/1 écrit à 02:00 UTC, ventes du 05/09 présentes dans vw_insight_event_day_residual
// le matin) ; la page affichait « Ventes reçues 0 / 1 j. » à côté d'un « Résultat d'hier » à
// +612 €. Coût mesuré : ~3,5 s par résolution — d'où un POST déclenché par la page APRÈS le
// premier rendu (renderEngagements, pulse.astro), jamais dans le GET de la liste (budget 3 s).
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationAccess } from "../../../lib/requireLocationOwnership";
import { memberCommitmentInPerimeter } from "../../../lib/profile/memberCardPolicy";
import { readLatestSnapshot } from "../../../lib/commitments/actionCommitments";
import { resolveAndPersist } from "../../../lib/commitments/commitmentResolve";

export const prerender = false;
const BQ_PROJECT = "muse-square-open-data";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

// Date calendaire Europe/Paris ('YYYY-MM-DD') — le grain du mart, même règle que le cron
// (`window_end < CURRENT_DATE('Europe/Paris')`).
function parisToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
    if (!userId) return json({ ok: false }, 401);

    const body = await request.json().catch(() => null);
    if (!body || !body.commitment_id || !body.location_id) {
      return json({ ok: false, error: "Champs requis : commitment_id, location_id" }, 400);
    }
    // Même garde que disposition.ts : membre du site, sur son périmètre seulement.
    requireLocationAccess(locals, body.location_id);

    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    const prior = await readLatestSnapshot(bq, String(body.commitment_id));
    if (!prior || prior.location_id !== String(body.location_id).trim()) {
      return json({ ok: false, error: "Engagement introuvable" }, 404);
    }
    if (!memberCommitmentInPerimeter(locals, String(body.location_id), prior as any)) {
      return json({ ok: false, error: "FORBIDDEN: hors du périmètre de vos pôles" }, 403);
    }
    const status = String(prior.status || "");
    const windowEnd = String(flat(prior.window_end) || "").slice(0, 10);
    if (status !== "open" && status !== "pending") {
      return json({ ok: true, changed: false, outcome: status, reason: "déjà résolu" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(windowEnd) || windowEnd >= parisToday()) {
      return json({ ok: true, changed: false, outcome: status, reason: "fenêtre ouverte" });
    }
    const snap: any = {};
    for (const k of Object.keys(prior)) snap[k] = flat((prior as any)[k]);
    const r = await resolveAndPersist(bq, snap, new Date().toISOString());
    return json({ ok: true, changed: r.changed, outcome: r.outcome, verdict: r.verdict, verdict_slack: r.verdict_slack ?? null });
  } catch (err: any) {
    const msg = String(err?.message || "Unknown error");
    const st = /FORBIDDEN/.test(msg) ? 403 : 500;
    return json({ ok: false, error: msg }, st);
  }
};
