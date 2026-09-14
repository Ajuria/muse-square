// tools/harness/rapport-graphiques-verify.mts — QUELLES SECTIONS D'UN RAPPORT PORTENT UN GRAPHIQUE (14/09).
// L'owner demande « peut-on ajouter un camembert, une colonne ? ». Avant d'en construire, compter ce qui
// EXISTE : le composeur pose déjà un graphique sur le mix (parts), les jours (barres) et les pôles
// (barres_h) — encore faut-il que ça arrive jusqu'au document. On compose un vrai Rapport sur le compte de
// l'owner et on regarde section par section.
// Usage : npx tsx tools/harness/rapport-graphiques-verify.mts
import "dotenv/config";
import { makeBQClient } from "../../src/lib/bq";
import { composerSurPeriode } from "../../src/lib/rapport/gestes";
import { SECTIONS } from "../../src/lib/fr/rapport.fr";

const P = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const bq = makeBQClient(P);
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
const cles = SECTIONS.map((s) => s.cle).filter((c) => c !== "synthese" && c !== "sources");
const per = { du: "2026-08-15", au: "2026-09-13", relative: null, libelle_fr: "du 15/08/2026 au 13/09/2026" };

const r = await composerSurPeriode(bq, LOC, [LOC], { cles: cles as any, indicateur: "ca", titre: null, periode: per }, today);
const GRAPHS = new Set(["parts", "barres", "barres_h"]);
console.log(`\nLES GRAPHIQUES D'UN RAPPORT — ${r.block.sections.length} section(s) composée(s) sur f10c3e58\n`);
let avec = 0;
for (const s of r.block.sections) {
  const types = s.blocs.map((b: any) => b.type);
  const g = types.filter((t) => GRAPHS.has(t));
  if (g.length) avec++;
  console.log(`  ${g.length ? "✓" : " "} ${String(s.titre).slice(0, 42).padEnd(44)} ${g.length ? g.join(", ") : "aucun"}   [${types.join(" · ")}]`);
}
console.log(`\n  ${avec} section(s) sur ${r.block.sections.length} portent un graphique.`);
