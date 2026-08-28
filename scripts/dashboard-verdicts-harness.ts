// scripts/dashboard-verdicts-harness.ts — les verdicts rendus arrivent-ils au tableau de bord ?
// Question owner du 28/08 : « s'assurer que les résultats journaliers des KPI sont bien
// affichés, et qu'ils sont bien reflétés dans le dashboard (notamment feedback, pivot) ».
// Appelle le VRAI endpoint /api/insight/dashboard sur le compte réel et vérifie que ce que
// porte le journal (verdict, € mesuré, move d'ajustement) ressort bien côté tableau.
//   npx tsx scripts/dashboard-verdicts-harness.ts
import { GET as dashGET } from "../src/pages/api/insight/dashboard";
import { makeBQClient } from "../src/lib/bq";

const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
let pass = 0, fail = 0;
function ok(label: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`, detail !== undefined ? JSON.stringify(detail).slice(0, 260) : ""); }
}

(async () => {
  const bq: any = makeBQClient(process.env.BQ_PROJECT_ID || "muse-square-open-data");
  const res: any = await dashGET({
    url: new URL(`http://local/api/insight/dashboard?location_id=${LOC}&period=30`),
    locals: { clerk_user_id: "harness", all_location_ids: [LOC] },
  } as any);
  const j = await res.json();
  ok("tableau de bord rendu", j?.ok === true, j?.error);

  // ── LA VÉRITÉ DE RÉFÉRENCE : le journal des engagements ──
  const flat = (v: any) => (v && typeof v === "object" && "value" in v ? v.value : v);
  const rows: any[] = await bq.query({
    query: `SELECT commitment_id, status, verdict, saved_item_id, adjustment_move,
                   CAST(window_start AS STRING) ws,
                   ROUND(window_actual_revenue - window_expected_revenue, 0) gap
            FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC,
                    CASE WHEN status IN ('resolved','cancelled') THEN 1 ELSE 0 END DESC,
                    (verdict IS NOT NULL) DESC, created_at DESC) rn
                  FROM \`muse-square-open-data.analytics.action_commitments\`
                  WHERE location_id = @l)
            WHERE rn = 1 AND status = 'resolved' AND verdict IS NOT NULL
            ORDER BY ws DESC`,
    params: { l: LOC }, location: "EU",
  }).then((r: any) => (r[0] || []).map((x: any) => ({
    id: String(flat(x.commitment_id)), verdict: String(flat(x.verdict)),
    saved_item_id: flat(x.saved_item_id) ? String(flat(x.saved_item_id)) : null,
    ws: String(flat(x.ws)), gap: flat(x.gap) != null ? Number(flat(x.gap)) : null,
  })));
  console.log(`   journal : ${rows.length} verdicts rendus`);
  ok("des verdicts existent à refléter", rows.length > 0, rows.length);

  // ── 1. Le dernier verdict rendu ──
  const dernier = rows[0];
  ok("le dernier verdict du journal est celui du tableau",
    j.last_verdict?.verdict === dernier?.verdict, { tableau: j.last_verdict?.verdict, journal: dernier?.verdict });
  ok("son € mesuré est rendu (repli journal si le mart est gelé)",
    j.last_verdict?.gap_eur != null && dernier.gap != null && Math.abs(j.last_verdict.gap_eur - dernier.gap) <= 1,
    { tableau: j.last_verdict?.gap_eur, journal: dernier?.gap });

  // ── 2. L'occurrence précédente d'une série — le défaut du 28/08 : une occurrence EN
  //    ATTENTE de mesure (verdict null) masquait les verdicts réellement rendus.
  const opsAvecPrev = (j.operations || []).filter((o: any) => o.prev_occ);
  ok("les séries portent le verdict de leur occurrence précédente", opsAvecPrev.length > 0,
    (j.operations || []).map((o: any) => ({ t: o.title, prev: o.prev_occ })));
  for (const o of opsAvecPrev) {
    const jugees = rows.filter((r) => r.saved_item_id === o.saved_item_id);
    ok(`« ${String(o.title).slice(0, 28)} » : verdict jugé, jamais un vide`,
      o.prev_occ.verdict != null && jugees.some((r) => r.verdict === o.prev_occ.verdict),
      { montre: o.prev_occ, jugees: jugees.map((r) => [r.ws, r.verdict]) });
    ok(`« ${String(o.title).slice(0, 28)} » : son € mesuré remonte`, o.prev_occ.gap_eur != null, o.prev_occ);
  }

  // ── 3. Les opérations en cours (le « pivot » et la suite se pilotent depuis là) ──
  ok("les engagements ouverts remontent avec leur échéance",
    Array.isArray(j.open_commitments) && j.open_commitments.every((c: any) => c.commitment_id && c.we),
    j.open_commitments);

  // ── 4. La tuile € des opérations : elle lit le mart des outcomes, gelé depuis le 05/08.
  //    Le harnais ne la déclare pas fausse — il DIT ce qu'elle vaut, pour que l'écart soit vu.
  const gapJournalPeriode = rows.reduce((s, r) => s + (r.gap ?? 0), 0);
  console.log(`   tuile impact (mart) : ${JSON.stringify(j.impact)}`);
  console.log(`   somme des € du JOURNAL sur les verdicts rendus : ${gapJournalPeriode} €`);
  ok("l'écart mart/journal est signalé, pas masqué",
    j.impact != null && (j.impact.gap_eur == null || Math.abs(j.impact.gap_eur - gapJournalPeriode) <= 1),
    { tuile: j.impact?.gap_eur, journal: gapJournalPeriode });

  console.log(`\n${pass} vert · ${fail} rouge`);
  process.exit(fail ? 1 : 0);
})();
