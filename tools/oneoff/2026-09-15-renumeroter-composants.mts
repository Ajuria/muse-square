// tools/oneoff/2026-09-15-renumeroter-composants.mts — one-shot (owner 15/09 : « fais la
// renumérotation maintenant »).
//
// CE QUE ÇA FAIT. Les N° du plan d'Épices et Tout ont été relevés dans l'ordre de la capture, pas
// dans l'ordre des pôles : la Cave porte les 1, 2, 4, 7, 8, 14, 20 et la Cuisine les 3, 5, 6, 9…
// Devant le plan, l'exploitant ne peut pas dire de quel pôle relève un numéro. Ce one-shot les rend
// CONTIGUS PAR PÔLE et uniques sur le site : Cave 1-7, Cuisine 8-17, Maison 18-26, Épicerie sèche
// 27-39, Petit déjeuner 40-45, Produits frais 46-50, Caisse 51-52.
//
// L'ORDRE NE BOUGE PAS, et c'est la propriété qui rend l'opération sûre : les pôles sont rangés par
// leur plus petit numéro actuel, et dans chaque pôle les composants gardent leur ordre. La
// renumérotation est donc MONOTONE — le rang de la marche (`prochainAPlacer`, `prochainDuPole`) est
// exactement le même avant et après, et le chemin physique dans le magasin ne change pas d'un pas.
//
// TROIS ENDROITS PORTENT LE NUMÉRO, et chacun passe par SON foyer d'écriture — jamais un INSERT à part :
//   1. `analytics.space_measures.fixture_no` — 52 mesures, réécrites par `appendSpaceMeasures`
//      (append-only : la mesure en vigueur est la dernière `created_at`, la règle de dbt). Longueur,
//      profondeur, faces, mètres de façade, parts de famille, source et date de mesure sont REPORTÉS
//      tels quels : seul le N° change.
//   2. le `label` dans `action_commitments.components` — « N° 4 — Vin & Spiritueux » deviendrait faux.
//      Passe par `planDeRedescription` puis `readMergeWrite(transitionType: "edited")`, la porte de
//      la route `commitments/edit.ts` : elle REFUSE par construction d'ajouter, de retirer, de
//      permuter ou de renommer une clé. Seul le préfixe « N° n — » est touché ; le nom que l'owner a
//      posé sur le plan est lu et reporté, jamais recomposé.
//   3. `analytics.dispositif_photos.fixture_no` — les 3 photos de la Cave. UPDATE en place, et c'est
//      volontaire : renuméroter n'est pas un événement de la vie de la photo. Ajouter une ligne au
//      journal fabriquerait une seconde prise de vue qui n'a pas eu lieu.
//
// CE QUI NE BOUGE PAS. Les CLÉS (`p1`, `p45`) : elles sont l'identité à laquelle les photos, les
// mesures et les points du plan s'accrochent — après coup, `p45` portera « N° 51 — Caisse », et ce
// décalage est le prix à payer pour ne détacher personne. Une clé est interne, elle ne s'affiche
// jamais. Et `analytics.space_fixture_points` n'est PAS concernée : un point est attaché au
// COMPOSANT, pas à son numéro — les points déjà posés sur le plan restent en place et changent
// simplement de légende (le script refuse quand même de tourner s'il en trouve qui portent un numéro).
//
// Usage : npx tsx tools/oneoff/2026-09-15-renumeroter-composants.mts              (constat + plan, AUCUNE écriture)
//         npx tsx tools/oneoff/2026-09-15-renumeroter-composants.mts --appliquer  (écrit, puis re-vérifie)
//         … --location=<uuid>                                                     (un autre site)
import "dotenv/config";
import { makeBQClient } from "../../src/lib/bq";
import { listPoles } from "../../src/lib/dispositifs/poleReading";
import { listSpaceMeasures, currentMeasures, appendSpaceMeasures, parseMeasureSource, type SpaceMeasureRow } from "../../src/lib/dispositifs/spaceMeasures";
import { readLatestSnapshot, readMergeWrite } from "../../src/lib/commitments/actionCommitments";
import { planDeRedescription, lireComposants } from "../../src/lib/dispositifs/composantsDescription";
import { listPoints } from "../../src/lib/dispositifs/spaceFixturePoints";

const PROJECT = "muse-square-open-data";
const PHOTOS = `\`${PROJECT}.analytics.dispositif_photos\``;
const arg = (n: string, d: string) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `--${n}=${d}`).split("=").slice(1).join("=");
const LOCATION = arg("location", "f10c3e58-326e-4e38-947c-d59fcbe51df5");
const APPLIQUER = process.argv.includes("--appliquer");

/** Le préfixe « N° 4 — » d'un libellé, et rien d'autre : le nom qui suit est lu, jamais recomposé. */
const PREFIXE = /^N°\s*(\d+)\s*—\s*/;
function libelleRenumerote(label: string | null, avant: number, apres: number): { label: string | null; touche: boolean; alerte: string | null } {
  if (!label) return { label, touche: false, alerte: null };
  const m = PREFIXE.exec(label);
  if (!m) return { label, touche: false, alerte: `« ${label} » ne porte pas de préfixe « N° n — » : laissé tel quel` };
  if (Number(m[1]) !== avant) return { label, touche: false, alerte: `« ${label} » annonce le n° ${m[1]} alors que la mesure dit ${avant} : laissé tel quel` };
  const neuf = `N° ${apres} — ${label.slice(m[0].length)}`;
  return { label: neuf, touche: neuf !== label, alerte: null };
}

interface Composant { dispositif_id: string; pole: string; commitment_id: string | null; key: string; avant: number | null; apres: number; mesure: SpaceMeasureRow }

async function main() {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);

  const [poles, historique, points] = await Promise.all([
    listPoles(bq, LOCATION, 50),
    listSpaceMeasures(LOCATION),
    listPoints(bq, LOCATION).catch(() => []),
  ]);
  const nomDuPole = new Map(poles.map((p: any) => [p.dispositif_id, p.name as string]));
  const commitmentDuPole = new Map(poles.map((p: any) => [p.dispositif_id, (p.commitment_id as string | null) ?? null]));

  const mesures = currentMeasures(historique).filter((m) => m.component_key != null);
  console.log(`Site ${LOCATION} — ${poles.length} pôles, ${mesures.length} composants mesurés, ${points.length} points posés sur le plan.`);
  if (!mesures.length) { console.log("Aucune mesure au grain composant : rien à renuméroter."); return; }

  // ORDRE DES PÔLES = leur plus petit numéro actuel ; ORDRE DANS LE PÔLE = le numéro actuel.
  // Sans numéro : à la fin, départagé par la clé — le même départage que `prochainAPlacer`.
  const INF = Number.POSITIVE_INFINITY;
  const parPole = new Map<string, SpaceMeasureRow[]>();
  for (const m of mesures) {
    const l = parPole.get(m.dispositif_id) ?? [];
    l.push(m); parPole.set(m.dispositif_id, l);
  }
  const ordreDesPoles = [...parPole.entries()]
    .map(([did, l]) => ({ did, mini: Math.min(...l.map((m) => m.fixture_no ?? INF)) }))
    .sort((a, b) => (a.mini === b.mini ? String(nomDuPole.get(a.did) ?? a.did).localeCompare(String(nomDuPole.get(b.did) ?? b.did), "fr") : a.mini - b.mini));

  const plan: Composant[] = [];
  let n = 0;
  for (const { did } of ordreDesPoles) {
    const liste = [...(parPole.get(did) ?? [])].sort((a, b) => {
      const an = a.fixture_no ?? INF, bn = b.fixture_no ?? INF;
      if (an !== bn) return an - bn;
      return String(a.component_key).localeCompare(String(b.component_key));
    });
    for (const m of liste) {
      plan.push({
        dispositif_id: did, pole: nomDuPole.get(did) ?? did, commitment_id: commitmentDuPole.get(did) ?? null,
        key: String(m.component_key), avant: m.fixture_no, apres: ++n, mesure: m,
      });
    }
  }

  // ---------- VÉRIFICATIONS, avant toute écriture ----------
  const refus: string[] = [];
  if (plan.length !== mesures.length) refus.push(`le plan porte ${plan.length} composants pour ${mesures.length} mesures`);
  const nouveaux = new Set(plan.map((c) => c.apres));
  if (nouveaux.size !== plan.length) refus.push("un numéro nouveau revient deux fois");
  if (Math.min(...nouveaux) !== 1 || Math.max(...nouveaux) !== plan.length) refus.push(`les numéros nouveaux ne couvrent pas 1…${plan.length}`);
  const cles = new Set(plan.map((c) => `${c.dispositif_id}|${c.key}`));
  if (cles.size !== plan.length) refus.push("une clé de composant revient deux fois");
  for (const { did } of ordreDesPoles) {
    const nos = plan.filter((c) => c.dispositif_id === did).map((c) => c.apres).sort((a, b) => a - b);
    if (nos[nos.length - 1] - nos[0] + 1 !== nos.length) refus.push(`le pôle « ${nomDuPole.get(did) ?? did} » n'est pas contigu`);
  }
  const pointsNumerotes = (points as any[]).filter((p) => p.fixture_no != null);
  if (pointsNumerotes.length) refus.push(`${pointsNumerotes.length} point${pointsNumerotes.length > 1 ? "s" : ""} du plan porte${pointsNumerotes.length > 1 ? "nt" : ""} un numéro : ce script ne les traite pas`);

  // ---------- LE PLAN, montré pôle par pôle ----------
  const alertes: string[] = [];
  for (const { did } of ordreDesPoles) {
    const liste = plan.filter((c) => c.dispositif_id === did);
    const cid = liste[0].commitment_id;
    const snap = cid ? await readLatestSnapshot(bq, cid) : null;
    const composants = snap ? lireComposants((snap as any).components) : [];
    const labelParCle = new Map(composants.map((c) => [c.key, c.label]));
    console.log(`\n${liste[0].pole} (${liste.length})`);
    for (const c of liste) {
      const lib = libelleRenumerote(labelParCle.get(c.key) ?? null, c.avant ?? -1, c.apres);
      if (lib.alerte) alertes.push(`${c.pole} · ${c.key} : ${lib.alerte}`);
      const bouge = c.avant !== c.apres || lib.touche;
      console.log(`  ${String(c.avant ?? "—").padStart(3)} → ${String(c.apres).padStart(3)}  ${c.key.padEnd(5)}${bouge ? "" : "  (inchangé)"}  ${labelParCle.get(c.key) ?? "(sans libellé)"}${lib.touche ? `   ⇒  ${lib.label}` : ""}`);
    }
  }

  const photos = await bq.query({
    query: `SELECT photo_id, component_key, fixture_no FROM ${PHOTOS} WHERE location_id = @l AND fixture_no IS NOT NULL`,
    params: { l: LOCATION }, location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : []));
  const fl = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
  const parCle = new Map(plan.map((c) => [c.key, c]));
  const photosABouger = (photos as any[])
    .map((p) => ({ photo_id: String(fl(p.photo_id)), key: String(fl(p.component_key)), avant: Number(fl(p.fixture_no)), apres: parCle.get(String(fl(p.component_key)))?.apres ?? null }))
    .filter((p) => p.apres != null && p.apres !== p.avant);
  console.log(`\nPhotos portant un N° : ${photos.length} — à corriger : ${photosABouger.length}`);
  for (const p of photosABouger) console.log(`  ${p.key} : n° ${p.avant} → ${p.apres}`);

  if (alertes.length) { console.log("\nÀ relire :"); for (const a of alertes) console.log(`  · ${a}`); }
  if (refus.length) { console.log("\nREFUS — rien n'a été écrit :"); for (const r of refus) console.log(`  · ${r}`); process.exit(1); }
  if (!APPLIQUER) { console.log("\nConstat seul. Relancer avec --appliquer pour écrire."); return; }

  // ---------- ÉCRITURE ----------
  // 1. les mesures, par (dispositif, version, source, date de mesure) — un appel par lot.
  const lots = new Map<string, Composant[]>();
  for (const c of plan) {
    const k = `${c.dispositif_id}|${c.mesure.version_no}|${c.mesure.source}|${c.mesure.measured_at ?? ""}`;
    const l = lots.get(k) ?? []; l.push(c); lots.set(k, l);
  }
  let ecrites = 0;
  for (const [k, l] of lots) {
    const [dispositif_id, version_no, source, measured_at] = k.split("|");
    const ids = await appendSpaceMeasures({
      location_id: LOCATION, dispositif_id, version_no: Number(version_no),
      components: l.map((c) => ({
        component_key: c.key, fixture_no: c.apres, length_m: c.mesure.length_m, depth_m: c.mesure.depth_m,
        faces: (c.mesure.faces === 1 || c.mesure.faces === 2 ? c.mesure.faces : null) as 1 | 2 | null,
        linear_m_facade: c.mesure.linear_m_facade, families_share: c.mesure.families_share,
      })),
      pole: null, source: parseMeasureSource(source, "saisie"), measured_at: measured_at || null,
      declarant_user_id: "renumerotation-2026-09-15",
    });
    ecrites += ids.length;
  }
  console.log(`\nMesures réécrites : ${ecrites}`);

  // 2. les libellés, par la porte de `commitments/edit.ts`.
  for (const { did } of ordreDesPoles) {
    const liste = plan.filter((c) => c.dispositif_id === did);
    const cid = liste[0].commitment_id;
    if (!cid) { console.log(`  ${liste[0].pole} : aucun engagement — libellés non touchés`); continue; }
    const snap = await readLatestSnapshot(bq, cid);
    const actuels = lireComposants((snap as any)?.components);
    const proposes = actuels.map((c) => {
      const cible = liste.find((x) => x.key === c.key);
      const lib = cible ? libelleRenumerote(c.label, cible.avant ?? -1, cible.apres) : { label: c.label };
      return { key: c.key, type: c.type, role: c.role, label: lib.label };
    });
    const p = planDeRedescription({ actuels, proposes });
    if (!p.ok) { console.log(`  ${liste[0].pole} : ${p.error}`); continue; }
    await readMergeWrite(bq, { commitmentId: cid, transitionType: "edited", patch: { components: JSON.stringify(p.components) } as any });
    console.log(`  ${liste[0].pole} : ${p.changements.length} libellés`);
  }

  // 3. les photos — une correction de coordonnée, pas une prise de vue nouvelle.
  for (const p of photosABouger) {
    await bq.query({
      query: `UPDATE ${PHOTOS} SET fixture_no = @n WHERE photo_id = @id AND location_id = @l`,
      params: { n: p.apres, id: p.photo_id, l: LOCATION }, types: { n: "INT64", id: "STRING", l: "STRING" }, location: "EU",
    });
  }
  console.log(`Photos corrigées : ${photosABouger.length}`);

  // ---------- RE-VÉRIFICATION EN BASE ----------
  const apres = currentMeasures(await listSpaceMeasures(LOCATION)).filter((m) => m.component_key != null);
  const nos = apres.map((m) => m.fixture_no ?? -1).sort((a, b) => a - b);
  const attendus = plan.map((c) => c.apres).sort((a, b) => a - b);
  const conforme = apres.length === plan.length && nos.join(",") === attendus.join(",")
    && plan.every((c) => apres.find((m) => m.dispositif_id === c.dispositif_id && m.component_key === c.key)?.fixture_no === c.apres);
  console.log(`\nAprès écriture : ${apres.length} composants, N° ${nos[0]}…${nos[nos.length - 1]} — ${conforme ? "CONFORME au plan" : "ÉCART : à relire"}`);
  if (!conforme) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
