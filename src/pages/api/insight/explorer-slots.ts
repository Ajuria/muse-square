// GET /api/insight/explorer-slots?location_id=… — LE GUICHET DE LA MÉMOIRE de l'état vide d'Explorer
// (spec docs/explorer-etat-vide-spec.md, owner 07/09). Lit les lignes du compte, classe par
// score = € de l'objet × ancienneté (lib/explorer/explorerSlots.ts, pur), rend au plus trois cartes
// typées { nature, kind, key, date, text, sub, cta, href }. Jamais de remplissage : zéro carte quand
// rien ne manque.
//
// Sources (vérifiées INFORMATION_SCHEMA 07/09) : analytics.action_commitments (dernier instantané par
// engagement — la MÊME fenêtre ROW_NUMBER que commitments/index.ts, jamais une seconde définition)
// jointe à raw.saved_items pour le titre de l'opération liée. Candidats : les engagements résolus sans
// bilan (retro_worked nul). Aucune carte « fait / pas fait » : le silence vaut « action menée »
// (doctrine owner 05/08, voir lib/explorer/explorerSlots.ts). Accès : requireLocationAccess (membre :
// périmètre de pôles via memberCommitmentInPerimeter, comme la liste des engagements).

import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationAccess } from "../../../lib/requireLocationOwnership";
import { memberCommitmentInPerimeter } from "../../../lib/profile/memberCardPolicy";
import { commitmentCandidates, rankSlots, type CommitmentSlotRow } from "../../../lib/explorer/explorerSlots";

export const prerender = false;
const BQ_PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const userId = String((locals as any)?.clerk_user_id || "").trim();
    if (!userId) return json({ ok: false, error: "UNAUTHENTICATED" }, 401);
    const locationId = String(url.searchParams.get("location_id") || "").trim();
    if (!locationId) return json({ ok: false, error: "Missing location_id" }, 400);
    requireLocationAccess(locals, locationId);

    const bq = makeBQClient(BQ_PROJECT);
    const [rows] = await bq.query({
      query: `
        WITH latest AS (
          SELECT * EXCEPT(rn) FROM (
            SELECT *, ROW_NUMBER() OVER (
              PARTITION BY commitment_id ORDER BY updated_at DESC, CASE WHEN status IN ('resolved', 'cancelled') THEN 1 ELSE 0 END DESC, (verdict IS NOT NULL) DESC, created_at DESC
            ) AS rn
            FROM \`${BQ_PROJECT}.analytics.action_commitments\`
            WHERE location_id = @locationId
          )
          WHERE rn = 1 AND status = 'resolved'
        )
        SELECT l.commitment_id, l.status, l.verdict, l.committed_action_text, s.title AS saved_item_title,
               CAST(l.window_start AS STRING) AS window_start, CAST(l.window_end AS STRING) AS window_end,
               l.window_days_expected, l.retro_worked,
               l.window_expected_revenue, l.window_actual_revenue, CAST(l.resolved_at AS STRING) AS resolved_at,
               l.pole_families, l.owner_person_id, l.user_id, l.location_id
        FROM latest l
        LEFT JOIN \`${BQ_PROJECT}.raw.saved_items\` s
          ON s.saved_item_id = l.saved_item_id AND s.location_id = l.location_id
        WHERE l.retro_worked IS NULL
      `,
      params: { locationId },
      location: "EU",
    });
    const isMember = String((locals as any)?.role || "") === "member";
    const visible = (rows as any[]).filter((r) => !isMember || memberCommitmentInPerimeter(locals, locationId, r));
    const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
    const cards = rankSlots(commitmentCandidates(visible as CommitmentSlotRow[], todayIso));
    return json({ ok: true, cards, candidates: visible.length });
  } catch (err: any) {
    const status = /FORBIDDEN|UNAUTH/.test(String(err?.message)) ? 403 : 500;
    return json({ ok: false, error: err?.message || "Unknown error" }, status);
  }
};
