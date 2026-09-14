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
console.log(`\n${entries.some((e) => e.source === "note_rapport")
  ? "✓ Au moins une note de Rapport est en mémoire : la boucle est bouclée."
  : "⚠ Aucune note de Rapport en mémoire — écrire une note sur un Rapport pour prouver la boucle."}`);
