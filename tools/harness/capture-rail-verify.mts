// tools/harness/capture-rail-verify.mts — LE RAIL DE LA PHOTO, DE BOUT EN BOUT (14/09).
//
// `analytics.dispositif_photos` est VIDE sur tous les sites : aucune photo n'a jamais été écrite. Avant de
// coder « les photos par composant avec leurs versions » (point 4), il faut savoir si le rail qui les
// produit fonctionne — un point 4 sur zéro photo n'a rien à montrer.
//
// Ce harnais rejoue le chemin RÉEL, sans téléphone : ce que le Tableau de bord pose dans `window._tbPoles`
// (le seul contexte dont la feuille de capture dispose), puis ce que la feuille exige pour aller au bout.
// Il n'ÉCRIT RIEN : il dit si l'écriture serait possible.
//
// Usage : npx tsx tools/harness/capture-rail-verify.mts
import "dotenv/config";
import { makeBQClient } from "../../src/lib/bq";
import { GET as dashGET } from "../../src/pages/api/insight/dashboard";

const P = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const bq = makeBQClient(P);

const [[u]] = await bq.query({
  query: `SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id = @l AND clerk_user_id IS NOT NULL LIMIT 1`,
  params: { l: LOC }, location: "EU",
});
const userId = String((u as any)?.clerk_user_id?.value ?? (u as any)?.clerk_user_id ?? "");

const res = await dashGET({
  url: new URL("http://l/api/insight/dashboard?period=365"),
  locals: { clerk_user_id: userId, role: "owner", all_location_ids: [LOC] },
} as any);
const j: any = await (res as Response).json();
if (!j?.ok) { console.error("dashboard :", j?.error); process.exit(2); }

const poles: any[] = Array.isArray(j.poles) ? j.poles : [];
console.log(`\nLE RAIL DE LA PHOTO — ce que « Documenter » reçoit du Tableau de bord\n`);
console.log(`  j.poles                ${poles.length} pôle(s)`);
if (!poles.length) { console.error("✗ AUCUN pôle servi : la feuille n'a rien à proposer, la capture est impossible."); process.exit(1); }

let bloques = 0;
for (const p of poles) {
  // Ce que la feuille exige, dans son ordre : un dispositif_id pour la question 1, des composants
  // (label OU type_label_fr, sinon le Tableau de bord les filtre) pour la question 2, et une clé de
  // composant pour l'envoi — `component_key` NOT NULL en base : sans elle, rien ne peut s'écrire.
  const comps: any[] = Array.isArray(p.components) ? p.components : [];
  const nommes = comps.filter((c) => c && (c.label || c.type_label_fr));
  const avecCle = nommes.filter((c) => c.component_key || c.key);
  const ok = !!p.dispositif_id && avecCle.length > 0;
  if (!ok) bloques++;
  console.log(`  ${ok ? "✓" : "✗"} ${String(p.name ?? "(sans nom)").padEnd(18)} dispositif_id ${p.dispositif_id ? "oui" : "NON"} · composants ${comps.length} · nommés ${nommes.length} · avec clé ${avecCle.length}`);
  if (!ok && comps.length) console.log(`      premier composant servi : ${JSON.stringify(comps[0])}`);
}
const [[c]] = await bq.query({ query: `SELECT COUNT(*) AS n FROM \`${P}.analytics.dispositif_photos\``, location: "EU" });
const n = Number((c as any)?.n?.value ?? (c as any)?.n ?? 0);
console.log(`\n  photos déjà écrites    ${n}`);
console.log(bloques
  ? `\n✗ ${bloques}/${poles.length} pôle(s) ne peuvent PAS aboutir à une écriture.`
  : `\n✓ Les ${poles.length} pôles peuvent aboutir : le rail n'est pas bloqué côté contexte.`);
process.exit(bloques ? 1 : 0);
