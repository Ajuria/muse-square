// tools/harness/astro-inline-check.mjs — LE CONTRÔLE DE SYNTAXE DES SCRIPTS INLINE D'UNE PAGE .astro
// (CLAUDE.md § Verify Before Done : « extraire le <script> inline et le node --check »).
// Le faire à la main à chaque fois, c'est l'oublier une fois. Ici : une commande.
//
//   npm run check:inline                       → toutes les pages qui portent un script is:inline
//   npm run check:inline -- src/components/EngagementDoc.astro   → celles qu'on nomme
//
// Ce que ça prouve : le JS écrit dans la page PARSE. Rien d'autre — le comportement se vérifie au
// harnais de la surface (card-harness, tableau-*-verify) et sur dev.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Script } from "node:vm";

const RACINE = ["src/pages", "src/components"];
const cibles = process.argv.slice(2);

function astroFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...astroFiles(p));
    else if (e.endsWith(".astro")) out.push(p);
  }
  return out;
}

// Les scripts inline d'un fichier .astro : le contenu entre <script …is:inline…> et </script>.
// Les noms injectés par `define:vars` ne sont PAS déclarés ici, et c'est voulu : une variable non
// déclarée est une erreur d'EXÉCUTION, jamais de compilation — les déclarer obligeait à parser la
// liste, et un objet imbriqué dans un `define:vars` produisait un faux échec.
function inlineScripts(src) {
  const out = [];
  const re = /<script\b([^>]*\bis:inline\b[^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(src))) {
    const attrs = m[1], corps = m[2];
    if (/\bsrc=/.test(attrs)) continue;                       // <script src> : rien à vérifier ici
    if (!corps.trim()) continue;
    out.push(corps);
  }
  return out;
}

// Pages qui portaient DÉJÀ plusieurs blocs le 15/09. La dette se paie en baissant ces nombres,
// jamais en ajoutant une ligne.
const CLIQUET_DOUBLES = {
  "src/components/Nav.astro": 3,
  "src/pages/app/insightevent/days.astro": 2,
  "src/pages/app/insightevent/insight.astro": 2,
  "src/pages/app/insightevent/map.astro": 2,
  "src/pages/app/insightevent/month.astro": 2,
  "src/pages/app/insightevent/prompt.astro": 2,
  "src/pages/profile.astro": 3,
};

const fichiers = cibles.length ? cibles : RACINE.flatMap(astroFiles);
let n = 0, ko = 0, doubles = 0;
for (const f of fichiers) {
  const scripts = inlineScripts(readFileSync(f, "utf8"));
  // UNE PAGE, UN SCRIPT (15/09, owner : « tu continues à créer des dupliqués »). Un second bloc
  // `<script is:inline>` dans une page qui en a déjà un est une DUPLICATION : le câblage de la page
  // se retrouve à deux endroits, et tout outil qui extrait « le » script en prend un au hasard.
  // Mesuré : le 14/09 j'ai ajouté un second bloc à `tableau.astro` ; le harnais de rendu de Piloter
  // extrayait le premier, mourait sur un SyntaxError avant sa première assertion, et n'a donc RIEN
  // vérifié pendant une journée — sans que rien ne le dise. Le code va dans le script qui existe.
  // LE CLIQUET. Sept pages portaient déjà plusieurs blocs au 15/09 — la dette est réelle, elle ne se
  // paie pas dans le commit qui pose la règle. Ce qui est REFUSÉ : une page NOUVELLE en double, ou
  // une page qui en gagne un. Ce qui est EXIGÉ : baisser le nombre ici quand on en retire un — un
  // progrès non enregistré fait échouer la commande (le patron de CLIQUET_BRUT).
  if (scripts.length > 1) {
    const du = CLIQUET_DOUBLES[f];
    if (du === undefined) { doubles++; console.error(`\n[DUPLICATION] ${f} — ${scripts.length} blocs <script is:inline>. Le code va DANS le script qui existe.`); }
    else if (scripts.length > du) { doubles++; console.error(`\n[DUPLICATION] ${f} — ${scripts.length} blocs, ${du} tolérés. Le code va DANS le script qui existe.`); }
  } else if (CLIQUET_DOUBLES[f] !== undefined && scripts.length <= 1) {
    doubles++;
    console.error(`\n[PROGRÈS NON ENREGISTRÉ] ${f} — ${scripts.length} bloc(s) : retirez sa ligne de CLIQUET_DOUBLES.`);
  }
  scripts.forEach((code, i) => {
    n++;
    // `new Script` COMPILE sans exécuter : la même porte que `node --check`, sans fichier temporaire.
    try {
      new Script(code, { filename: `${f}#inline-${i + 1}` });
    } catch (e) {
      ko++;
      console.error(`\n[ERREUR] ${f} — script inline #${i + 1}\n   ${String(e?.message || e)}`);
    }
  });
}
console.log(`\n${n} script(s) inline vérifié(s) dans ${fichiers.length} fichier(s) — ${ko ? `${ko} EN ERREUR` : "tous parsent"}${doubles ? `, ${doubles} page(s) EN DOUBLE` : ", une page = un script"}.`);
process.exit(ko || doubles ? 1 : 0);
