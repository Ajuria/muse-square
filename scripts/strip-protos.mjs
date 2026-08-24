// Purge des protos/harnais de l'ARTEFACT DE BUILD (sécurité, owner 24/08) : les fichiers
// public/*-proto*.html|js et *-harness.html figent des données réelles de compte et étaient
// servis SANS authentification en prod. Ils restent dans le repo (outillage vivant : harnais
// générateurs + garde-fou lexical + launch `proto-static`) — ils sortent seulement du déploiement.
// Branché sur `npm run build` (package.json) : Vercel l'exécute en CI, le fichier n'existe
// plus en prod (404), zéro middleware, zéro coût runtime.
// Échec DUR si un fichier au motif survit après la passe — jamais une purge silencieusement vide.
import { readdirSync, rmSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const MOTIF = /-(?:proto(?:-data)?(?:-v\d+)?|harness)\.(?:html|js)$/;   // -proto-v2.html etc. compris
const RACINES = [".vercel/output/static", "dist/client"].filter((d) => existsSync(d));
if (!RACINES.length) {
  console.error("strip-protos: aucun dossier de build trouvé (.vercel/output/static ni dist/client) — lancer après `astro build`.");
  process.exit(1);
}

let purges = 0;
for (const racine of RACINES) {
  const marche = (dir) => {
    for (const nom of readdirSync(dir)) {
      const chemin = join(dir, nom);
      if (statSync(chemin).isDirectory()) { marche(chemin); continue; }
      if (MOTIF.test(nom)) { rmSync(chemin); purges++; console.log("strip-protos: retiré " + chemin); }
    }
  };
  marche(racine);
  // Contre-vérification : plus AUCUN fichier au motif dans l'artefact.
  const restants = [];
  const verifie = (dir) => {
    for (const nom of readdirSync(dir)) {
      const chemin = join(dir, nom);
      if (statSync(chemin).isDirectory()) { verifie(chemin); continue; }
      if (MOTIF.test(nom)) restants.push(chemin);
    }
  };
  verifie(racine);
  if (restants.length) {
    console.error("strip-protos: ÉCHEC — fichiers au motif encore présents :\n" + restants.join("\n"));
    process.exit(1);
  }
}
console.log(`strip-protos: OK — ${purges} fichier(s) retiré(s) de l'artefact de build.`);
