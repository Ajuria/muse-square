// tools/harness/retrait-verify.mts — LE RETRAIT D'UNE PHOTO, DE BOUT EN BOUT (14/09).
//
// La règle du retrait a ses tests purs (src/lib/dispositifs/photoRetrait.test.ts, 8 cas, deux
// mutations vues tomber). Ce harnais prouve autre chose, que des tests purs ne peuvent pas prouver :
// que la ROUTE réelle, sur le compte réel, retire bien la ligne — et que la garde de la version 1
// tient sur des données de production, pas seulement sur des fixtures.
//
// SONDE. Il écrit une ligne de photo factice sur un composant RÉEL du pôle Caisse (le plus petit CA),
// puis la fait retirer PAR LE MÉCANISME SOUS TEST. Si le retrait échoue, le harnais nettoie lui-même :
// il ne laisse jamais sa sonde derrière lui. Aucun objet n'est écrit dans le bucket (le retrait tolère
// un objet absent : 404 ignoré), donc rien à nettoyer côté stockage.
//
// Usage : npx tsx tools/harness/retrait-verify.mts
import "dotenv/config";
import { makeBQClient } from "../../src/lib/bq";
import { listPoles } from "../../src/lib/dispositifs/poleReading";
import { insertPhotoRow, listPhotoRows, type PhotoRow } from "../../src/lib/dispositifs/dispositifPhotos";
import { POST as photosPOST } from "../../src/pages/api/dispositifs/photos";

const P = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";   // le compte de l'owner (CLAUDE.md)
const bq = makeBQClient(P);
const f = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

const [[u]] = await bq.query({
  query: `SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id = @l AND clerk_user_id IS NOT NULL LIMIT 1`,
  params: { l: LOC }, location: "EU",
});
const userId = String(f((u as any)?.clerk_user_id) || "");
const locals = { clerk_user_id: userId, role: "owner", all_location_ids: [LOC] };
const appel = (body: any) => Promise.resolve(
  photosPOST({ request: new Request("http://l/api/dispositifs/photos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), locals } as any),
).then((r: any) => r.json());

const poles = await listPoles(bq, LOC);
const caisse = poles.find((p) => /caisse/i.test(p.name));
if (!caisse || !(caisse.components || []).length) { console.error("✗ pas de pôle Caisse avec composant sur ce compte."); process.exit(2); }
const comp = caisse.components[0];
console.log(`\nLE RETRAIT D'UNE PHOTO — pôle « ${caisse.name} », composant « ${comp.label || comp.type_label_fr} » (${comp.component_key})\n`);

const compte = async () => (await listPhotoRows(bq, caisse.dispositif_id)).length;
const avant = await compte();
console.log(`  photos du pôle avant la sonde : ${avant}`);

// ── la sonde ────────────────────────────────────────────────────────────────────────────────────
const photo_id = crypto.randomUUID();
const sonde: PhotoRow = {
  photo_id, location_id: LOC, dispositif_id: caisse.dispositif_id, version_no: 1, component_key: comp.component_key,
  walk_id: null, seq: null, t_offset_s: null, gcs_uri: `gs://sonde/${photo_id}.jpg`,
  dispositif_type: comp.type, dispositif_role: comp.role, status: "read", checklist: {}, items_matched: [],
  items_confirmed: null, prices_seen: [], coverage_flag: "entier", model: "sonde", prompt_version: "sonde",
  created_by: userId, created_at: new Date().toISOString(),
  exposition: null, levels: null, families_present: [], fixture_no: null,
} as PhotoRow;
await insertPhotoRow(bq, sonde);
const apresSonde = await compte();
console.log(`  sonde écrite (${photo_id.slice(0, 8)}…)          : ${apresSonde}  ${apresSonde === avant + 1 ? "✓" : "✗ la sonde n'est pas en base"}`);

let echec = false;
try {
  // ── 1. le PLAN, sans rien toucher ────────────────────────────────────────────────────────────
  const dry = await appel({ action: "retirer", dispositif_id: caisse.dispositif_id, photo_id, dry: true });
  const pl = dry?.plan;
  console.log(`\n  plan (dry) : version ${pl?.version_no}, version retirée ${pl?.version ? "v" + pl.version.version_no : "aucune"}, gardée car « ${pl?.version_gardee} », redevient courante ${pl?.redevient_courante ? pl.redevient_courante.slice(0, 8) + "…" : "aucune"}`);
  const planOk = dry?.ok && pl && pl.version === null && pl.version_gardee === "version_1" && pl.variantes.length === 3;
  console.log(`  ${planOk ? "✓" : "✗"} la VERSION 1 n'est pas touchée, et les trois objets sont au plan`);
  const pendant = await compte();
  console.log(`  ${pendant === apresSonde ? "✓" : "✗"} `+ `un plan ne supprime RIEN (${pendant} photo(s), inchangé)`);
  if (!planOk || pendant !== apresSonde) echec = true;

  // ── 2. le retrait réel ───────────────────────────────────────────────────────────────────────
  const go = await appel({ action: "retirer", dispositif_id: caisse.dispositif_id, photo_id });
  console.log(`\n  retrait : ok=${go?.ok}, objets retirés ${go?.objets_retires} (aucun n'existait), version retirée ${go?.version_retiree ?? "aucune"}, photo servie ensuite ${go?.photo ? go.photo.photo_id.slice(0, 8) + "…" : "aucune"}`);
  const apres = await compte();
  console.log(`  ${apres === avant ? "✓" : "✗"} la ligne est partie : ${apres} photo(s), comme avant la sonde`);
  if (!go?.ok || apres !== avant) echec = true;

  // ── 3. une photo déjà retirée ne se retire pas deux fois ─────────────────────────────────────
  const encore = await appel({ action: "retirer", dispositif_id: caisse.dispositif_id, photo_id, dry: true });
  console.log(`  ${encore?.ok === false && /introuvable/.test(String(encore?.error)) ? "✓" : "✗"} un second retrait de la même photo est refusé (« ${encore?.error} »)`);
  if (encore?.ok !== false) echec = true;
} finally {
  const reste = (await listPhotoRows(bq, caisse.dispositif_id)).some((r) => r.photo_id === photo_id);
  if (reste) {
    await bq.query({ query: `DELETE FROM \`${P}.analytics.dispositif_photos\` WHERE location_id = @l AND photo_id = @p`, params: { l: LOC, p: photo_id }, location: "EU" });
    console.log(`\n  ⚠ le retrait n'a pas fait son travail : la sonde a été nettoyée par le harnais.`);
    echec = true;
  }
}
console.log(echec ? `\n✗ ÉCHEC.\n` : `\n✓ Le retrait fait ce qu'il dit, sur le compte réel.\n`);
process.exit(echec ? 1 : 0);
