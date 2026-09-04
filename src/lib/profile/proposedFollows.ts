// src/lib/profile/proposedFollows.ts — P3.1-f (onboarding) : suivis proposés par menace.
// Un compte NEUF dont la chaîne géo vient d'aboutir (le mart menaces porte ses concurrents)
// n'a encore RIEN en veille — le système lui pose ses premiers suivis : le top des menaces
// mesurées (threat_score), marqués `proposed` sur la fiche (« suivi proposé — ajustez »).
// Appelé par le cron 15 min (competitor-surveillance, waitUntil) → J0 + ≤15 min après la géo.
// Idempotence : marqueur action_log action_key='suivis_proposed' par site (posé même quand
// 0 menace en mart — un site rural n'est pas re-scanné à chaque tick) ; un site où
// l'utilisateur a déjà suivi ou tout retiré (deleted_at) n'est jamais re-proposé.
// Écritures = MÊMES tables que add-competitor.ts (watched_competitors + competitor_tracking),
// mêmes gardes d'existence — un suivi proposé EST un suivi (fiches, veille, crawls nocturnes).
import { randomUUID } from "node:crypto";

const PROJECT = "muse-square-open-data";
const MAX_LOCATIONS_PER_RUN = 3;
const MAX_PROPOSALS = 5;
const FRESH_ACCOUNT_DAYS = 14;

const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

export async function runProposedFollows(bq: any): Promise<{ scanned: number; proposed: number; details: string[] }> {
  const details: string[] = [];
  let proposedTotal = 0;

  const [cands] = await bq.query({
    query: `
      SELECT p.location_id, ANY_VALUE(p.clerk_user_id) AS uid
      FROM \`${PROJECT}.raw.insight_event_user_location_profile\` p
      WHERE p.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${FRESH_ACCOUNT_DAYS} DAY)
        AND EXISTS (SELECT 1 FROM \`${PROJECT}.mart.fct_competitor_threat_profile\` tp
                    WHERE tp.location_id = p.location_id)
        AND NOT EXISTS (SELECT 1 FROM \`${PROJECT}.raw.competitor_tracking\` ct
                        WHERE ct.location_id = p.location_id)
        AND NOT EXISTS (SELECT 1 FROM \`${PROJECT}.analytics.action_log\` al
                        WHERE al.location_id = p.location_id AND al.action_key = 'suivis_proposed')
      GROUP BY 1
      LIMIT ${MAX_LOCATIONS_PER_RUN}`,
    location: "EU",
  });

  for (const c of (cands as any[]) || []) {
    const location_id = String(flat(c.location_id));
    const clerk_user_id = String(flat(c.uid) || "");
    try {
      const [threats] = await bq.query({
        query: `
          SELECT tp.competitor_id, tp.competitor_name, tp.threat_score, tp.competitor_industry_code,
                 ANY_VALUE(cd.city) AS city
          FROM \`${PROJECT}.mart.fct_competitor_threat_profile\` tp
          JOIN \`${PROJECT}.raw.competitor_directory\` cd
            ON cd.competitor_id = tp.competitor_id AND cd.deleted_at IS NULL
          WHERE tp.location_id = @loc AND tp.is_followed = false AND tp.threat_score IS NOT NULL
          GROUP BY 1, 2, 3, 4
          ORDER BY tp.threat_score DESC
          LIMIT ${MAX_PROPOSALS}`,
        params: { loc: location_id }, types: { loc: "STRING" }, location: "EU",
      });
      const rows: any[] = (threats as any[]) || [];

      let inserted = 0;
      for (const t of rows) {
        const competitor_id = String(flat(t.competitor_id));
        const competitor_name = String(flat(t.competitor_name) || "");
        if (!competitor_id || !competitor_name) continue;
        // Gardes d'existence — mêmes que add-competitor (jamais de doublon de suivi).
        const [[wExists], [tExists]] = await Promise.all([
          bq.query({
            query: `SELECT 1 FROM \`${PROJECT}.raw.watched_competitors\`
                    WHERE location_id = @loc AND competitor_id = @cid AND deleted_at IS NULL LIMIT 1`,
            params: { loc: location_id, cid: competitor_id }, types: { loc: "STRING", cid: "STRING" }, location: "EU",
          }),
          bq.query({
            query: `SELECT 1 FROM \`${PROJECT}.raw.competitor_tracking\`
                    WHERE location_id = @loc AND competitor_id = @cid AND deleted_at IS NULL LIMIT 1`,
            params: { loc: location_id, cid: competitor_id }, types: { loc: "STRING", cid: "STRING" }, location: "EU",
          }),
        ]);
        if (!((wExists as any[]) || []).length) {
          await bq.query({
            query: `INSERT INTO \`${PROJECT}.raw.watched_competitors\` (
                      watched_competitor_id, clerk_user_id, location_id,
                      competitor_id, competitor_name, industry_code, city, entity_type,
                      created_at, deleted_at
                    ) VALUES (@wid, @uid, @loc, @cid, @name, @ind, @city, 'competitor', CURRENT_TIMESTAMP(), NULL)`,
            params: {
              wid: randomUUID(), uid: clerk_user_id, loc: location_id, cid: competitor_id,
              name: competitor_name,
              ind: flat(t.competitor_industry_code) != null ? String(flat(t.competitor_industry_code)) : null,
              city: flat(t.city) != null ? String(flat(t.city)) : null,
            },
            types: { wid: "STRING", uid: "STRING", loc: "STRING", cid: "STRING", name: "STRING", ind: "STRING", city: "STRING" },
            location: "EU",
          });
        }
        if (!((tExists as any[]) || []).length) {
          await bq.query({
            query: `INSERT INTO \`${PROJECT}.raw.competitor_tracking\` (
                      tracking_id, competitor_id, clerk_user_id, location_id, created_at, deleted_at, proposed
                    ) VALUES (@tid, @cid, @uid, @loc, CURRENT_TIMESTAMP(), NULL, TRUE)`,
            params: { tid: randomUUID(), cid: competitor_id, uid: clerk_user_id, loc: location_id },
            types: { tid: "STRING", cid: "STRING", uid: "STRING", loc: "STRING" },
            location: "EU",
          });
        }
        inserted += 1;
      }

      // Marqueur d'idempotence — posé aussi à 0 menace exploitable (absence dite, pas re-scannée).
      await bq.dataset("analytics").table("action_log").insert([{
        log_id: randomUUID(),
        user_id: clerk_user_id,
        location_id,
        action_key: "suivis_proposed",
        event: "suivis_proposed",
        affected_date: new Date().toISOString().slice(0, 10),
        reason: `proposed_${inserted}`,
        created_at: new Date().toISOString(),
      }]);
      proposedTotal += inserted;
      details.push(`${location_id.slice(0, 8)}: ${inserted} suivi(s) proposé(s)${rows.length === 0 ? " (aucune menace en mart)" : ""}`);
    } catch (e: any) {
      details.push(`${location_id.slice(0, 8)}: ERREUR ${String(e?.message || e).slice(0, 100)}`);
    }
  }

  return { scanned: ((cands as any[]) || []).length, proposed: proposedTotal, details };
}
