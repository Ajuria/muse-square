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

const fichiers = cibles.length ? cibles : RACINE.flatMap(astroFiles);
let n = 0, ko = 0;
for (const f of fichiers) {
  const scripts = inlineScripts(readFileSync(f, "utf8"));
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
console.log(`\n${n} script(s) inline vérifié(s) dans ${fichiers.length} fichier(s) — ${ko ? `${ko} EN ERREUR` : "tous parsent"}.`);
process.exit(ko ? 1 : 0);
