// tools/harness/memoire-contexte-verify.mts — CE QUE LE MODÈLE VOIT DE LA MÉMOIRE DU SITE (14/09).
// Les notes prises sous une section d'un Rapport rejoignent `site_memory` et entrent dans le tour. Ce
// harnais montre le bloc EXACT tel qu'il part au modèle, sur le compte de l'owner — pour qu'on lise ce
// qu'on lui donne, au lieu de le supposer.
// Usage : npx tsx tools/harness/memoire-contexte-verify.mts
import "dotenv/config";
import { makeBQClient } from "../../src/lib/bq";
import { readSiteMemory, blocMemoires } from "../../src/lib/explorer/siteMemory";

const P = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const bq = makeBQClient(P);
const t0 = Date.now();
const entries = await readSiteMemory(bq, LOC, {});
const ms = Date.now() - t0;
console.log(`\nLA MÉMOIRE DU SITE DANS LE TOUR — ${entries.length} mémoire(s), lues en ${ms} ms\n`);
const par: Record<string, number> = {};
entries.forEach((e) => { par[e.source] = (par[e.source] ?? 0) + 1; });
Object.entries(par).forEach(([k, v]) => console.log(`  ${k.padEnd(14)} ${v}`));
const bloc = blocMemoires(entries);
console.log(`\n── le bloc envoyé au modèle ${bloc ? `(${bloc.length} caractères)` : "(AUCUN — rien à dire)"} ──`);
if (bloc) console.log(bloc);
// 14/09 — LA DIVERGENCE QUI AURAIT DÛ SE VOIR. Une note écrite sous une section DOIT devenir une mémoire.
// Le 14/09, le valideur d'écriture refusait la source `note_rapport` : les notes s'écrivaient dans le
// Rapport, aucune n'atteignait la mémoire, et l'échec était avalé par un try/catch. Rien ne comparait les
// deux comptes — c'est ce contrôle qui manquait, pas un test unitaire de plus.
const [docs] = await bq.query({
  query: `SELECT COUNT(*) AS n FROM (
            SELECT document_id FROM \`${P}.analytics.report_documents\`
            WHERE location_id = @l AND CONTAINS_SUBSTR(rapport_json, '"type":"note"')
            GROUP BY document_id)`,
  params: { l: LOC }, location: "EU",
});
const avecNote = Number((docs as any[])[0]?.n?.value ?? (docs as any[])[0]?.n ?? 0);
const enMemoire = entries.filter((e) => e.source === "note_rapport").length;
console.log(`\n  Rapports portant une note   ${avecNote}`);
console.log(`  notes en mémoire            ${enMemoire}`);
if (avecNote > 0 && enMemoire === 0) {
  console.error(`\n✗ DES NOTES SONT ÉCRITES ET AUCUNE N'ATTEINT LA MÉMOIRE — la boucle est rompue.`);
  process.exit(1);
}

console.log(`\n${entries.some((e) => e.source === "note_rapport")
  ? "✓ Au moins une note de Rapport est en mémoire : la boucle est bouclée."
  : "⚠ Aucune note de Rapport en mémoire — écrire une note sur un Rapport pour prouver la boucle."}`);
