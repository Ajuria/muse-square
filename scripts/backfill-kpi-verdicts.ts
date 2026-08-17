// Backfill verdict-par-KPI (chantier 15/08) — re-juge les engagements RÉSOLUS dont le KPI
// déclaré est non-K1 (objectif 'pct') via LE MÊME resolveCommitment que le cron, et écrit
// un NOUVEAU snapshot transition 'kpi_verdict' (l'historique z reste intact — append-only).
// Idempotent : un snapshot déjà en verdict_basis='kpi' est sauté.
// Usage : npx tsx scripts/backfill-kpi-verdicts.ts           (constat seul, aucune écriture)
//         npx tsx scripts/backfill-kpi-verdicts.ts --apply   (écrit)
import "dotenv/config";
import { makeBQClient } from "../src/lib/bq";
import { readLatestSnapshot, readMergeWrite } from "../src/lib/actionCommitments";
import { resolveCommitment } from "../src/lib/commitmentResolve";

const P = "muse-square-open-data";
const APPLY = process.argv.includes("--apply");
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

(async () => {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || P);
  const [rows] = await bq.query({ query: `
    SELECT commitment_id FROM (
      SELECT commitment_id, status, measured_metric, threshold_basis, verdict_basis,
             ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) rn
      FROM \`${P}.analytics.action_commitments\`)
    WHERE rn = 1 AND status = 'resolved'
      AND measured_metric IS NOT NULL AND measured_metric != 'revenue_residual'
      AND threshold_basis = 'pct'
      AND (verdict_basis IS NULL OR verdict_basis != 'kpi')`, location: "EU" });
  console.log("candidats:", (rows as any[]).length, APPLY ? "(APPLY)" : "(constat seul)");
  for (const r of rows as any[]) {
    const id = String(flat(r.commitment_id));
    const snap = await readLatestSnapshot(bq, id);
    if (!snap) { console.log(id, "introuvable"); continue; }
    const res = await resolveCommitment(bq, snap, String(flat(snap.resolved_at) || new Date().toISOString()));
    const before = snap.verdict;
    const after = res.patch.verdict;
    console.log(
      String(snap.committed_action_text || "").slice(0, 42).padEnd(44),
      "| avant:", String(before).padEnd(10), "→ après:", String(after).padEnd(10),
      "| base:", res.patch.verdict_basis, "| se:", res.patch.kpi_noise_se, "|", res.note.slice(0, 90),
    );
    if (APPLY) {
      await readMergeWrite(bq, { commitmentId: id, transitionType: "kpi_verdict", patch: res.patch });
      console.log("  écrit (transition kpi_verdict)");
    }
  }
})();
