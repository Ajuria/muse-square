// tools/harness/redescription-verify.mts — TYPER UN COMPOSANT SANS CRÉER DE VERSION (owner 14/09).
//
// La règle a ses tests purs (src/lib/dispositifs/composantsDescription.test.ts, 17 cas, trois
// mutations vues tomber). Ce harnais prouve ce que des tests purs ne peuvent pas prouver :
//   1. la ROUTE réelle (`/api/commitments/edit`) écrit bien la description sur le compte réel ;
//   2. le `version_no` NE BOUGE PAS — c'est toute la demande de l'owner ;
//   3. les PHOTOS de la version courante restent visibles après coup. C'est le défaut qu'on
//      cherchait à éviter : la section « Composants » de la page du pôle ne lit que la version
//      courante, donc une version nouvelle aurait fait disparaître les 7 photos de la Cave ;
//   4. la vue semantic reflète la description nouvelle (c'est elle que l'app lit, jamais analytics).
//
// SONDE. Il type UN composant réel, vérifie, puis REMET la description d'origine et le revérifie.
// Le retour en arrière est dans un `finally` : une erreur au milieu ne laisse pas le compte modifié.
//
// Usage : npx tsx tools/harness/redescription-verify.mts
import "dotenv/config";
import { makeBQClient } from "../../src/lib/bq";
import { readLatestSnapshot } from "../../src/lib/commitments/actionCommitments";
import { lireComposants } from "../../src/lib/dispositifs/composantsDescription";
import { listPhotoRows } from "../../src/lib/dispositifs/dispositifPhotos";
import { POST as editPOST } from "../../src/pages/api/commitments/edit";

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
  editPOST({ request: new Request("http://l/api/commitments/edit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), locals } as any),
).then((r: any) => r.json());

// Le pôle Cave : c'est lui qui porte les 7 premières photos réelles.
const [[cave]] = await bq.query({
  query: `SELECT commitment_id, dispositif_id, version_no
          FROM \`${P}.semantic.vw_insight_event_dispositif_components\`
          WHERE location_id = @l AND committed_action_text = 'Cave' LIMIT 1`,
  params: { l: LOC }, location: "EU",
});
if (!cave) { console.error("✗ pôle Cave introuvable sur ce compte."); process.exit(2); }
const commitment_id = String(f((cave as any).commitment_id));
const dispositif_id = String(f((cave as any).dispositif_id));

// L'état de départ, relu en base — jamais supposé.
const depart = await readLatestSnapshot(bq, commitment_id);
const comps0 = lireComposants((depart as any)?.components);
const v0 = Number((depart as any)?.version_no);
const cible = comps0[0];
if (!cible) { console.error("✗ la Cave n'a aucun composant."); process.exit(2); }

const photosV = async () => (await listPhotoRows(bq, dispositif_id)).filter((r) => r.version_no === v0).length;
const p0 = await photosV();

console.log(`\nTYPER SANS VERSIONNER — pôle Cave, composant « ${cible.label || cible.key} » (${cible.key})\n`);
console.log(`  état de départ : version ${v0}, type « ${cible.type} », ${comps0.length} composants, ${p0} photo(s) sur cette version`);

const etat = async () => {
  const row = await readLatestSnapshot(bq, commitment_id);
  const cs = lireComposants((row as any)?.components);
  return { version: Number((row as any)?.version_no), type: cs.find((c) => c.key === cible.key)?.type, n: cs.length, ordre: cs.map((c) => c.key).join(",") };
};
const vue = async () => {
  const [rows] = await bq.query({
    query: `SELECT component_key, component_type, version_no
            FROM \`${P}.semantic.vw_insight_event_dispositif_components\`
            WHERE dispositif_id = @d AND component_key = @k`,
    params: { d: dispositif_id, k: cible.key }, location: "EU",
  });
  const r = (rows as any[])[0];
  return r ? { type: String(f(r.component_type)), version: Number(f(r.version_no)) } : null;
};

let echecs = 0;
const dire = (ok: boolean, txt: string) => { if (!ok) echecs++; console.log(`  ${ok ? "✓" : "✗"} ${txt}`); };
const NEUF = cible.type === "lineaire" ? "vitrine" : "lineaire";

try {
  // ── 1. la redescription ───────────────────────────────────────────────────────────────────────
  // La liste envoyée est la COMPOSITION du pôle, pas un delta : l'écran rend toutes ses rangées,
  // il les renvoie toutes. Une liste courte se lit comme un retrait, et c'est voulu.
  const tous = (t: string) => comps0.map((c) => (c.key === cible.key ? { key: c.key, type: t } : { key: c.key }));
  const r1 = await appel({ commitment_id, location_id: LOC, components: tous(NEUF) });
  dire(r1?.ok === true, `la route accepte la redescription (« ${cible.type} » → « ${NEUF} »)`);
  dire(Array.isArray(r1?.changements) && r1.changements.length === 1 && r1.changements[0].champ === "type",
    `elle rend le changement : ${JSON.stringify(r1?.changements)}`);

  const e1 = await etat();
  dire(e1.type === NEUF, `la ligne porte le type neuf : ${e1.type}`);
  dire(e1.version === v0, `LA VERSION N'A PAS BOUGÉ : ${e1.version} (départ ${v0})`);
  dire(e1.n === comps0.length, `le nombre de composants est le même : ${e1.n}`);
  dire(e1.ordre === comps0.map((c) => c.key).join(","), `l'ordre est le même : ${e1.ordre}`);

  const p1 = await photosV();
  dire(p1 === p0, `LES PHOTOS DE LA VERSION COURANTE SONT TOUJOURS LÀ : ${p1} (départ ${p0})`);

  const s1 = await vue();
  dire(s1?.type === NEUF && s1?.version === v0, `la vue semantic le montre : ${JSON.stringify(s1)}`);

  // ── 2. ce que la route doit REFUSER ───────────────────────────────────────────────────────────
  const rAjout = await appel({ commitment_id, location_id: LOC, components: [...comps0.map((c) => ({ key: c.key })), { key: "sonde_en_trop", type: "lineaire" }] });
  dire(rAjout?.ok === false && String(rAjout?.error).includes("version nouvelle"), `un composant AJOUTÉ est refusé : ${rAjout?.error}`);
  const rRetrait = await appel({ commitment_id, location_id: LOC, components: comps0.slice(1).map((c) => ({ key: c.key })) });
  dire(rRetrait?.ok === false && String(rRetrait?.error).includes("version nouvelle"), `un composant RETIRÉ est refusé : ${rRetrait?.error}`);
  const eApresRefus = await etat();
  dire(eApresRefus.n === comps0.length && eApresRefus.version === v0, `un refus n'a rien écrit : ${eApresRefus.n} composants, version ${eApresRefus.version}`);
} finally {
  // ── 3. le retour en arrière, quoi qu'il arrive ───────────────────────────────────────────────
  const r2 = await appel({ commitment_id, location_id: LOC, components: comps0.map((c) => ({ key: c.key, type: c.type })) });
  const e2 = await etat();
  const p2 = await photosV();
  const remis = e2.type === cible.type && e2.version === v0 && p2 === p0;
  dire(remis, `REMIS EN ÉTAT : type « ${e2.type} », version ${e2.version}, ${p2} photo(s)${r2?.ok ? "" : ` (réponse : ${r2?.error})`}`);
}

console.log(`\n  ${echecs === 0 ? "✓ tout est vert." : `✗ ${echecs} contrôle(s) en échec.`}\n`);
process.exit(echecs === 0 ? 0 : 1);
