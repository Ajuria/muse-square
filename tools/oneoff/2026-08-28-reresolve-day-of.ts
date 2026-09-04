// tools/oneoff/2026-08-28-reresolve-day-of.ts — RE-RÉSOUDRE les « jour même » mesurés le jour de CRÉATION.
//
// Pourquoi (owner 28/08, « b -> c'est du test, tu peux modifier ») : jusqu'au correctif de
// ce jour, un engagement « jour même » était mesuré sur le jour où il avait été CRÉÉ. Un
// jour même ancré sur un événement se prépare d'avance (corner producteur : créé le 15/08,
// opéré le 22/08) : la mesure portait donc sur une journée sans rapport avec l'opération.
// Le correctif ne vaut que pour les résolutions FUTURES — ce script rejoue les anciennes.
//
// Il n'écrase RIEN : `readMergeWrite` ajoute une ligne au journal append-only, exactement
// comme le cron. L'historique reste lisible (ancienne mesure + nouvelle).
//
//   npx tsx tools/oneoff/2026-08-28-reresolve-day-of.ts          → aperçu, aucune écriture
//   npx tsx tools/oneoff/2026-08-28-reresolve-day-of.ts --ecrire → applique
import { makeBQClient } from "../../src/lib/bq";
import { readLatestSnapshot, readMergeWrite } from "../../src/lib/actionCommitments";
import { resolveCommitment } from "../../src/lib/commitmentResolve";

const ECRIRE = process.argv.includes("--ecrire");
const PROJECT = "muse-square-open-data";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

(async () => {
  const bq: any = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
  // Les « jour même » RÉSOLUS dont la fenêtre stockée diffère du jour de création : les seuls
  // que l'ancienne convention pouvait mal mesurer.
  const rows: any[] = await bq.query({
    query: `SELECT commitment_id, location_id, CAST(DATE(created_at) AS STRING) cree,
                   CAST(window_start AS STRING) ws, window_actual_revenue, window_expected_revenue,
                   window_residual_pct, verdict
            FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC,
                    CASE WHEN status IN ('resolved','cancelled') THEN 1 ELSE 0 END DESC,
                    (verdict IS NOT NULL) DESC, created_at DESC) rn
                  FROM \`${PROJECT}.analytics.action_commitments\` WHERE window_kind = 'day_of')
            WHERE rn = 1 AND status = 'resolved' AND DATE(created_at) != window_start
            ORDER BY ws DESC`,
    location: "EU",
  }).then((r: any) => r[0] || []);

  console.log(`${rows.length} engagement(s) « jour même » mesuré(s) le jour de création.\n`);
  let change = 0;
  for (const r of rows) {
    const id = String(flat(r.commitment_id));
    const avant = {
      jour_mesure: String(flat(r.cree)), jour_operation: String(flat(r.ws)),
      ca: Number(flat(r.window_actual_revenue)), habituel: Number(flat(r.window_expected_revenue)),
      ecart_pct: flat(r.window_residual_pct) != null ? Number(flat(r.window_residual_pct)) : null,
      verdict: flat(r.verdict) ? String(flat(r.verdict)) : null,
    };
    const snap: any = await readLatestSnapshot(bq, id);
    if (!snap) { console.log(`  ! ${id} introuvable`); continue; }
    const { patch, note } = await resolveCommitment(bq, snap, new Date().toISOString());
    const apres = {
      ca: patch.window_actual_revenue ?? null, habituel: patch.window_expected_revenue ?? null,
      ecart_pct: patch.window_residual_pct ?? null, verdict: patch.verdict ?? null, statut: patch.status,
    };
    const bouge = Number(apres.ca) !== avant.ca || apres.verdict !== avant.verdict;
    console.log(`  ${bouge ? "→" : "="} ${id.slice(0, 8)} · opération du ${avant.jour_operation} (mesurée le ${avant.jour_mesure})`);
    console.log(`     avant : ${avant.ca} € vs ${avant.habituel} € (${avant.ecart_pct} %) · ${avant.verdict}`);
    console.log(`     après : ${apres.ca} € vs ${apres.habituel} € (${apres.ecart_pct} %) · ${apres.verdict} [${apres.statut}]`);
    console.log(`     ${note}`);
    if (!bouge) continue;
    change++;
    if (ECRIRE) {
      // MÊME chemin que le cron : une ligne de plus au journal, transition 'resolved'.
      await readMergeWrite(bq, { commitmentId: id, transitionType: "resolved", patch });
      console.log("     ✓ écrit au journal");
    }
  }
  console.log(`\n${change} mesure(s) à corriger. ${ECRIRE ? "ÉCRITES." : "Aucune écriture (relancer avec --ecrire)."}`);
  process.exit(0);
})();
