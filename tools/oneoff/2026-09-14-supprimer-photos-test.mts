// tools/oneoff/2026-09-14-supprimer-photos-test.mts — DÉFAIRE UNE PHOTO DE TEST, ENTIÈREMENT (owner 14/09).
//
// POURQUOI. L'owner teste la capture sur du contenu factice (une bibliothèque chez lui) rattaché à un VRAI
// pôle de Muse Square. Il n'existe AUCUN bouton pour retirer une photo : les lignes sont en ajout seul, et
// le seul effacement du produit est un retour arrière automatique quand la photo est refusée. Ce script est
// donc écrit AVANT le test, pas après.
//
// UNE PHOTO ÉCRIT DANS CINQ ENDROITS, et il faut les cinq — une ligne retirée sans son image laisse un
// orphelin facturé, une image retirée sans sa ligne laisse une vignette morte sur la page :
//   1. analytics.dispositif_photos          — la ligne
//   2. le bucket, image entière             — <location_id>/<dispositif_id>/<photo_id>.jpg
//   3. le bucket, variante bande            — …<photo_id>.band.webp
//   4. le bucket, variante carrée           — …<photo_id>.square.webp
//   5. si une VERSION est née de la photo : analytics.action_commitments (la version) ET
//      analytics.space_measures (ses mesures recopiées)
//
// SÛRETÉ. Blanc par défaut : sans --go, il ne supprime RIEN et se contente de dire ce qu'il retirerait.
// Il refuse TOUJOURS de toucher la version 1 d'un pôle — c'est le pôle lui-même, jamais un déchet de test.
//
// Usage :
//   npx tsx tools/oneoff/2026-09-14-supprimer-photos-test.mts --depuis=2026-09-14
//   npx tsx tools/oneoff/2026-09-14-supprimer-photos-test.mts --depuis=2026-09-14 --go
//   (ou --dispositif=<uuid> pour cibler un seul pôle ; --site=<location_id> pour changer de site)
//
// À SUPPRIMER après le nettoyage (convention tools/oneoff, docs/organisation-depot.md).
import "dotenv/config";
import { makeBQClient } from "../../src/lib/bq";
import { makeStorageClient, PHOTO_BUCKET, photoVariantPath } from "../../src/lib/dispositifs/dispositifPhotos";

const P = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const arg = (n: string): string => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : "";
};
const GO = process.argv.includes("--go");
const SITE = arg("site") || "f10c3e58-326e-4e38-947c-d59fcbe51df5";   // le compte de l'owner (CLAUDE.md)
const DEPUIS = arg("depuis");
const DISPOSITIF = arg("dispositif");
if (!DEPUIS && !DISPOSITIF) {
  console.error("Préciser --depuis=AAAA-MM-JJ (les photos prises à partir de ce jour) ou --dispositif=<uuid>.");
  process.exit(2);
}
if (DEPUIS && !/^\d{4}-\d{2}-\d{2}$/.test(DEPUIS)) { console.error("--depuis doit être AAAA-MM-JJ."); process.exit(2); }

const bq = makeBQClient(P);
const f = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

// ── 1. Les photos visées ────────────────────────────────────────────────────────────────────────
const [photos] = await bq.query({
  query: `SELECT photo_id, dispositif_id, location_id, component_key, version_no, CAST(created_at AS STRING) AS created_at
          FROM \`${P}.analytics.dispositif_photos\`
          WHERE location_id = @site
            ${DISPOSITIF ? "AND dispositif_id = @disp" : ""}
            ${DEPUIS ? "AND DATE(created_at) >= DATE(@depuis)" : ""}
          ORDER BY created_at`,
  params: { site: SITE, ...(DISPOSITIF ? { disp: DISPOSITIF } : {}), ...(DEPUIS ? { depuis: DEPUIS } : {}) },
  location: "EU",
});
const ph = (photos as any[]).map((r) => ({
  photo_id: String(f(r.photo_id)), dispositif_id: String(f(r.dispositif_id)), location_id: String(f(r.location_id)),
  component_key: String(f(r.component_key)), version_no: Number(f(r.version_no)), created_at: String(f(r.created_at)),
}));

console.log(`\nSUPPRESSION DES PHOTOS DE TEST — site ${SITE.slice(0, 8)}…${DEPUIS ? `, depuis le ${DEPUIS}` : ""}${DISPOSITIF ? `, pôle ${DISPOSITIF.slice(0, 8)}…` : ""}`);
console.log(GO ? "MODE RÉEL (--go) : ce qui suit sera supprimé.\n" : "BLANC (sans --go) : RIEN ne sera supprimé.\n");
if (!ph.length) { console.log("Aucune photo ne correspond — rien à faire."); process.exit(0); }
ph.forEach((p) => console.log(`  photo ${p.photo_id.slice(0, 8)}…  pôle ${p.dispositif_id.slice(0, 8)}…  composant ${p.component_key}  v${p.version_no}  ${p.created_at.slice(0, 16)}`));

// ── 2. Les versions NÉES de ces photos ──────────────────────────────────────────────────────────
// Une version née d'une photo porte parent_commitment_id et version_no > 1. La version 1 est le pôle
// lui-même : elle est exclue par construction, jamais par un filtre qu'on pourrait oublier.
const disps = [...new Set(ph.map((p) => p.dispositif_id))];
const [versions] = await bq.query({
  query: `SELECT commitment_id, dispositif_id, version_no, CAST(created_at AS STRING) AS created_at
          FROM \`${P}.analytics.action_commitments\`
          WHERE location_id = @site AND dispositif_id IN UNNEST(@disps)
            AND COALESCE(dispositif_nature, 'operation') = 'permanent'
            AND version_no > 1
            ${DEPUIS ? "AND DATE(created_at) >= DATE(@depuis)" : ""}
          ORDER BY dispositif_id, version_no`,
  params: { site: SITE, disps, ...(DEPUIS ? { depuis: DEPUIS } : {}) }, location: "EU",
});
const vs = (versions as any[]).map((r) => ({
  commitment_id: String(f(r.commitment_id)), dispositif_id: String(f(r.dispositif_id)),
  version_no: Number(f(r.version_no)), created_at: String(f(r.created_at)),
}));
console.log(vs.length ? `\n  versions nées d'une photo (la v1 n'est JAMAIS touchée) :` : `\n  aucune version née d'une photo.`);
vs.forEach((v) => console.log(`    v${v.version_no} de ${v.dispositif_id.slice(0, 8)}…  ${v.commitment_id.slice(0, 8)}…  ${v.created_at.slice(0, 16)}`));
if (vs.some((v) => v.version_no <= 1)) { console.error("\n✗ REFUS : une version 1 est dans la liste. Le script s'arrête."); process.exit(3); }

// ── 3. Les objets du bucket ─────────────────────────────────────────────────────────────────────
const objets = ph.flatMap((p) => (["full", "band", "square"] as const).map((v) => photoVariantPath(p.location_id, p.dispositif_id, p.photo_id, v)));
console.log(`\n  objets du bucket ${PHOTO_BUCKET} : ${objets.length} (image entière + 2 variantes par photo)`);

if (!GO) {
  console.log(`\nRien n'a été supprimé. Relancer avec --go pour exécuter.`);
  process.exit(0);
}

// ── 4. Exécution — le bucket d'abord (une ligne sans image reste réparable, l'inverse laisse un
//      orphelin facturé qu'on ne retrouvera plus), la base ensuite. ──────────────────────────────
const storage = makeStorageClient();
let effaces = 0, absents = 0;
for (const chemin of objets) {
  try { await storage.bucket(PHOTO_BUCKET).file(chemin).delete(); effaces++; }
  catch (e: any) { if (String(e?.code) === "404") absents++; else console.error(`  ✗ ${chemin} : ${e?.message}`); }
}
console.log(`\n  bucket : ${effaces} objet(s) supprimé(s), ${absents} déjà absent(s).`);

const ids = ph.map((p) => p.photo_id);
await bq.query({ query: `DELETE FROM \`${P}.analytics.dispositif_photos\` WHERE location_id = @site AND photo_id IN UNNEST(@ids)`, params: { site: SITE, ids }, location: "EU" });
console.log(`  analytics.dispositif_photos : ${ids.length} ligne(s) supprimée(s).`);

if (vs.length) {
  const vids = vs.map((v) => v.commitment_id);
  await bq.query({ query: `DELETE FROM \`${P}.analytics.space_measures\` WHERE location_id = @site AND dispositif_id IN UNNEST(@disps) AND version_no IN UNNEST(@vnos)`, params: { site: SITE, disps, vnos: vs.map((v) => v.version_no) }, location: "EU" });
  console.log(`  analytics.space_measures : les mesures des versions ${vs.map((v) => "v" + v.version_no).join(", ")} supprimées.`);
  await bq.query({ query: `DELETE FROM \`${P}.analytics.action_commitments\` WHERE location_id = @site AND commitment_id IN UNNEST(@vids) AND version_no > 1`, params: { site: SITE, vids }, location: "EU" });
  console.log(`  analytics.action_commitments : ${vids.length} version(s) supprimée(s). La v1 de chaque pôle est intacte.`);
}
console.log(`\n✓ Terminé. Relancer sans --go pour vérifier qu'il ne reste rien.`);
