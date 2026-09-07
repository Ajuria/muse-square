// TRIPWIRE de l'artefact de build (owner 24/08, durci 04/09 — CLAUDE.md § Placement).
// Jusqu'au 04/09 ce script PURGEAIT les fichiers `*-proto*.html|js` et `*-harness.html` de l'artefact :
// les protos vivaient dans public/ et figeaient des données réelles de compte, servies sans
// authentification. Depuis, l'outillage vit dans tools/ (jamais copié par Astro) et public/ ne
// contient QUE ce qui doit être servi. Ce script ne purge plus : il ÉCHOUE si l'artefact contient
// quoi que ce soit qui ressemble à de l'outillage — une purge silencieuse masque le défaut, un
// tripwire le montre. Branché sur `npm run build` (Vercel l'exécute en CI).
import { readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const MOTIF = /-(?:proto(?:-data)?(?:-v\d+)?|harness)\.(?:html|js)$|-proto-[a-z0-9-]+\.(?:html|js)$/;
const DOSSIERS_INTERDITS = /^(tools|data|tests)(\/|$)/;   // public/scripts et public/docs sont LIVRÉS
const RACINES = [".vercel/output/static", "dist/client"].filter((d) => existsSync(d));
if (!RACINES.length) {
  console.error("strip-protos: aucun dossier de build trouvé (.vercel/output/static ni dist/client) — lancer après `astro build`.");
  process.exit(1);
}

const fautes = [];
let vus = 0;
for (const racine of RACINES) {
  const marche = (dir) => {
    for (const nom of readdirSync(dir)) {
      const chemin = join(dir, nom);
      if (statSync(chemin).isDirectory()) { marche(chemin); continue; }
      vus++;
      const rel = relative(racine, chemin);
      if (MOTIF.test(nom) || DOSSIERS_INTERDITS.test(rel)) fautes.push(chemin);
    }
  };
  marche(racine);
}
if (!vus) { console.error("strip-protos: artefact vide — le build n'a rien produit ?"); process.exit(1); }
if (fautes.length) {
  console.error("strip-protos: ÉCHEC — de l'outillage a atteint l'artefact de build :\n" + fautes.join("\n") +
    "\nCes fichiers doivent vivre dans tools/ (CLAUDE.md § Placement), jamais dans public/.");
  process.exit(1);
}
console.log(`strip-protos: OK — ${vus} fichier(s) dans l'artefact, aucun outillage.`);
