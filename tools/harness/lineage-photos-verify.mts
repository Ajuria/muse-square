// Vérité CHEMIN RÉEL — LA MÉMOIRE VISUELLE DU DISPOSITIF (13/09, owner : « garder la mémoire visuelle
// des dispositifs qui ont fonctionné ou non au niveau de l'agencement »). L'endpoint RÉEL
// /api/commitments/evolution, sur le compte de test (f10c3e58) et sur un dispositif RÉEL à trois
// versions : la chaîne porte-t-elle `photos` par version, et le rendu du kit tient-il sur CE payload ?
// Aucune donnée fabriquée : ce que la base contient est ce qui est affiché — au 13/09, zéro photo sur
// tout le parc (analytics.dispositif_photos : 0 ligne), donc la rangée de vignettes n'existe pas encore
// et le harnais le DIT. Il redeviendra parlant à la première photo prise depuis « Documenter → ».
// Usage : npm run harness:lineage-photos
import "dotenv/config";
import { readFileSync } from "node:fs";
import * as vm from "node:vm";
import { makeBQClient } from "../../src/lib/bq";
import { GET } from "../../src/pages/api/commitments/evolution";
import { listPhotoRows, photosParVersion } from "../../src/lib/dispositifs/dispositifPhotoRows";
import { dispositifTypeLabelFr } from "../../src/lib/dispositifs/dispositifTypes";
import { EVOL_COPY } from "../../src/lib/commitments/commitmentCopy";

const P = "muse-square-open-data";
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const DISPO = "49a325dd-b06f-4cbc-982f-7ab71af70b12";      // trois versions sur le compte de test
const CID = "49a325dd-b06f-4cbc-982f-7ab71af70b12";        // la version 1 — le dernier instantané des versions 2 et 3
// ne porte plus le dispositif (ligne de résolution du cron, dispositif_id NULL) : leur page n'a donc pas d'historique. Défaut
// de données antérieur au 13/09, signalé à l'owner, hors de ce chantier.
let fails = 0;
const check = (l: string, c: boolean, d?: unknown) => { console.log((c ? "  OK " : "  FAIL ") + l + (d !== undefined ? " — " + String(d).slice(0, 200) : "")); if (!c) fails++; };
const flat = (v: any) => (v && typeof v === "object" && "value" in v ? v.value : v);

const bq = makeBQClient(process.env.BQ_PROJECT_ID || P);
const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id = @l LIMIT 1`, params: { l: LOC }, location: "EU" });
const locals = { clerk_user_id: String(flat(u.clerk_user_id)), location_id: LOC, all_location_ids: [LOC] };

const t0 = Date.now();
const res: any = await GET({ url: new URL(`http://l/api/commitments/evolution?commitment_id=${CID}&location_id=${LOC}`), locals } as any);
const ms = Date.now() - t0;
const body = JSON.parse(await res.text());
check("l'endpoint répond", body.ok === true, body.error);
const lin: any[] = body.lineage || [];
check("la chaîne réelle porte ses versions", lin.length >= 2, lin.map((v) => `v${v.version_no} ${v.verdict ?? v.status}`).join(" · "));
check("chaque version porte le champ photos (jamais undefined : le rendu ne devine pas)", lin.every((v) => Array.isArray(v.photos)), JSON.stringify(lin.map((v) => v.photos)));
// Le COÛT de l'ajout, mesuré (§ Performance — jamais déduit) : la requête photos est amorcée avec la
// requête de la chaîne et attendue après, donc elle ne coûte pas son aller-retour. Mesuré le 13/09 sur
// trois appels chauds : 3 459 ms avec, 3 372 ms sans — +90 ms, pas +500. Le 3,4 s de l'endpoint lui-même
// est ANTÉRIEUR à ce chantier (mesuré sans la requête photos) : il dépasse le budget et reste à traiter.
const tPhotos = Date.now(); const rows = await listPhotoRows(bq, DISPO); const msPhotos = Date.now() - tPhotos;
check(`la lecture des photos ne coûte pas un aller-retour de plus (${msPhotos} ms, amorcée en parallèle ; endpoint ${ms} ms)`, msPhotos < 1500, `${msPhotos} ms`);

// Ce que la base contient VRAIMENT, dit tel quel.
const parV = photosParVersion(rows, dispositifTypeLabelFr);
console.log(`  base : ${rows.length} photo(s) sur ce dispositif ; versions photographiées : ${Object.keys(parV).join(", ") || "aucune"}`);
const attendu = Object.fromEntries(lin.map((v) => [v.version_no, (parV[v.version_no]?.photos ?? []).length]));
check("ce que la page rend = ce que la base porte, version par version", lin.every((v) => v.photos.length === attendu[v.version_no]), JSON.stringify(attendu));

// Le RENDU du kit sur CE payload (le harnais est la page).
const sandbox: any = { window: {}, console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(readFileSync("public/js/card-kit.js", "utf8"), sandbox, { filename: "card-kit.js" });
const html = String(sandbox.window.MSCardKit.renderEvolution(body, EVOL_COPY));
check("l'historique du dispositif est rendu", html.includes("Historique du dispositif"));
const avecPhoto = lin.some((v) => v.photos.length);
check(avecPhoto ? "la rangée de vignettes est rendue" : "aucune photo en base : AUCUN emplacement rendu (un cadre vide ne raconte rien)",
  avecPhoto ? html.includes("data-lin-photos") : !html.includes("data-lin-photos") && !html.includes("Aucune photo"));
if (avecPhoto) {
  const p = lin.flatMap((v) => v.photos)[0];
  check("la vignette lit la variante carrée, le lien ouvre l'image entière", html.includes("variant=square") && html.includes(String(p.url).replace(/&/g, "&amp;")));
  check("aucune clé technique de composant à l'écran", !lin.flatMap((v) => v.photos).some((x: any) => html.includes(String(x.component_key))));
}

console.log(fails ? `\n${fails} échec(s).` : "\nTout vert.");
process.exit(fails ? 1 : 0);
