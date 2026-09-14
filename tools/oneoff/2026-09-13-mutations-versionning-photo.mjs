// tools/oneoff/2026-09-13-mutations-versionning-photo.mjs — VOIR LES TESTS TOMBER (CLAUDE.md : « UN TEST
// VERT NE PROUVE RIEN TANT QU'ON NE L'A PAS VU TOMBER »).
//
// Quatre tests du versionning automatique par la photo sont neufs et n'ont jamais rougi. Ce banc casse
// VOLONTAIREMENT ce que chacun est censé attraper, relance sa suite, et vérifie qu'elle passe au rouge —
// puis REMET le fichier à l'identique (contenu sauvegardé en mémoire, restauré dans un `finally`, et
// comparé en fin de course).
//
// Une mutation qui ne s'applique pas est le pire cas : la suite reste verte et on croit avoir prouvé
// quelque chose. Ici, un ancrage introuvable ARRÊTE tout, il ne passe jamais en silence.
//
//   node tools/oneoff/2026-09-13-mutations-versionning-photo.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const MUTATIONS = [
  {
    nom: "le plancher de cadrage",
    fichier: "src/lib/dispositifs/photoChangement.ts",
    de: "  if (!entier(avant) || !entier(apres)) return AUCUN;",
    vers: "  // MUTATION : plancher retiré",
    suite: "src/lib/dispositifs/photoChangement.test.ts",
    attendu: "« PLANCHER DE CADRAGE » — un cadrage partiel ferait disparaître une famille qui est là",
  },
  {
    nom: "la première photo d'un composant",
    fichier: "src/lib/dispositifs/photoChangement.ts",
    de: "  if (!avant) return AUCUN;",
    vers: '  if (!avant) return { change: true, raisons: [{ quoi: "familles", partis: [], venus: [], avant: null, apres: null }] };',
    suite: "src/lib/dispositifs/photoChangement.test.ts",
    attendu: "« aucune photo précédente » — la première photo créerait une version au lieu de documenter la sienne",
  },
  {
    nom: "l'écart de familles",
    fichier: "src/lib/dispositifs/photoChangement.ts",
    de: "  if (partis.length || venus.length) raisons.push({ quoi: \"familles\", partis, venus, avant: null, apres: null });",
    vers: "  // MUTATION : l'écart de familles ne compte plus",
    suite: "src/lib/dispositifs/photoChangement.test.ts",
    attendu: "les trois cas de familles — plus aucune version ne naîtrait d'un changement de contenu",
  },
  {
    nom: "la note d'une version dans l'historique",
    fichier: "public/js/card-kit.js",
    de: "              var _pNote = v.note ? String(v.note).trim() : '';",
    vers: "              var _pNote = '';   // MUTATION : la note ne se rend plus",
    suite: "src/lib/cardKit.evolutionLineage.test.ts",
    attendu: "« la note d'une version d'un PÔLE se lit sous sa ligne » — la question écrirait dans le vide",
  },
];

const rouge = (suite) => {
  try {
    execFileSync("npx", ["vitest", "run", suite], { stdio: "pipe", encoding: "utf8" });
    return false;                       // sortie 0 = vert
  } catch {
    return true;                        // sortie non nulle = rouge
  }
};

const resultats = [];
for (const m of MUTATIONS) {
  const avant = readFileSync(m.fichier, "utf8");
  if (!avant.includes(m.de)) {
    console.error(`\n[ARRÊT] Ancrage introuvable dans ${m.fichier} :\n   ${m.de}\n` +
      "Le fichier a changé depuis l'écriture du banc — rien n'a été muté, rien n'est prouvé.");
    process.exit(2);
  }
  let vu = false;
  try {
    writeFileSync(m.fichier, avant.replace(m.de, m.vers));
    vu = rouge(m.suite);
  } finally {
    writeFileSync(m.fichier, avant);
    if (readFileSync(m.fichier, "utf8") !== avant) {
      console.error(`[ARRÊT] ${m.fichier} n'a PAS été remis à l'identique — vérifiez git diff.`);
      process.exit(3);
    }
  }
  resultats.push({ ...m, vu });
  console.log(`${vu ? "[ROUGE]" : "[VERT ]"} ${m.nom} — ${m.attendu}`);
}

const muets = resultats.filter((r) => !r.vu);
console.log(`\n${resultats.length - muets.length}/${resultats.length} mutations vues ROUGES.`);
if (muets.length) {
  console.error("Ces gardes n'attrapent PAS ce qu'ils prétendent garder :");
  for (const m of muets) console.error(`   · ${m.nom} (${m.suite})`);
  process.exit(1);
}
console.log("Les fichiers sont remis à l'identique (git status doit être propre).");
