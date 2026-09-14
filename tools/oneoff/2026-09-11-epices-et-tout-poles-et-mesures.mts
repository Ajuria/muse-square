// tools/oneoff/2026-09-11-epices-et-tout-poles-et-mesures.mts — one-shot (docs/espace-et-pole.md § 4,
// audit profit-grains § 6 A3/A4, décision owner 6 du 11/09).
//
// Déclare les SEPT pôles d'Épices et Tout depuis les zones du plan et charge les 52 composants mesurés
// (~/Documents/Muse_Square/Clients/epices-et-tout/map/metres_lineaires_epices_et_tout_v2_2026-09-11.csv)
// dans analytics.space_measures — par LE MÊME chemin d'écriture que le formulaire de pôle
// (lib/dispositifs/poleCreate.ts → readMergeWrite + appendSpaceMeasures), jamais un INSERT à part.
//
// Ce que le plan dit, tel quel : le pôle de chaque composant (colonne « Pôle »), sa famille (colonne
// « Famille », déclarée en Part de linéaire = 100 % du composant), sa longueur, sa profondeur, ses faces
// de préhension. Le site n'a AUCUNE vente importée (vérifié 11/09) : chaque pôle est « Pôle en projet —
// Aucune vente importée », ses familles seront à rapprocher de la caisse à la première importation.
//
// Ce que le one-off corrige, et RIEN d'autre (accents et une coquille, listés pour être relus) :
//   « Pôle Epicerie sèche » → « Épicerie sèche » ; « Concerves » → « Conserves » (arbitrage owner 11/09,
//   n° 28) ; « Epices » → « Épices » ; « Gateaux » → « Gâteaux » ; « Riz & Pates » → « Riz & Pâtes ».
//   Le préfixe « Pôle » des noms tombe (le nom d'un pôle est « Cave », la copie dit « CA du pôle « Cave » »).
// Ce qu'il NE fait pas : le type de composant (le plan ne le dit pas → `autre`, la photo dira
// l'exposition) ; la surface de vente des pôles (non mesurée) ; le n° 19 (faces « 0 » = nature à vérifier
// sur place) reçoit longueur et profondeur, faces NULL → aucun mètre de façade tant que l'owner n'a pas
// tranché ; les n° 3, 6 et 49 sont chargés tels que mesurés sur le plan, à corriger au ruban (route
// commitments/space-measures) après le passage sur place.
//
// Usage : npx tsx tools/oneoff/2026-09-11-epices-et-tout-poles-et-mesures.mts            (charge)
//         … --location=f10c3e58-326e-4e38-947c-d59fcbe51df5                             (sur un autre site)
//         … --location=… --families=site   (owner 12/09 : les familles RÉELLES du site, réparties à parts égales
//             entre les 7 pôles — rang de CA contre rang de mètres, en boucle ; les parts par composant ne sont
//             pas déclarées : dbt répartit à parts égales entre les familles du pôle et le dit, share_source =
//             'defaut', E5. Provisoire, pour voir des euros par mètre sur un compte de test.)
//         npx tsx tools/oneoff/2026-09-11-epices-et-tout-poles-et-mesures.mts --rollback (retire tout)
// Refuse de charger si le site porte déjà un pôle. Vérifie APRÈS : 7 pôles, 52 mesures, mètres par pôle.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { makeBQClient } from "../../src/lib/bq";
import { createPermanentPole } from "../../src/lib/dispositifs/poleCreate";
import { listPoles } from "../../src/lib/dispositifs/poleReading";
import { listSpaceMeasures } from "../../src/lib/dispositifs/spaceMeasures";
import { listSiteFamilies } from "../../src/lib/kpi/kpiRegistry";

const PROJECT = "muse-square-open-data";
// Site cible : Épices et Tout par défaut (dims.dim_client_location, vérifié 11/09) ; `--location=<id>` charge les
// MÊMES pôles ailleurs — demande owner 12/09 : sur son compte de test Muse Square (f10c3e58…, ventes Kaggle du
// café) pour voir Piloter et Explorer avec des pôles mesurés. Ses familles de caisse ne sont pas celles du plan :
// chaque pôle y sera « Pôle en projet — À rapprocher de la caisse », avec ses mètres, sans € par mètre.
const LOCATION_ID = (process.argv.find((a) => a.startsWith("--location=")) || "").slice("--location=".length)
  || "a3b442c2-e7e5-43e8-b969-7b78e6c24bb0";
const CSV = `${process.env.HOME}/Documents/Muse_Square/Clients/epices-et-tout/map/metres_lineaires_epices_et_tout_v2_2026-09-11.csv`;
const MEASURED_AT = "2026-09-11";
const POLE_NAME: Record<string, string> = {
  "Pôle Cave": "Cave", "Pôle Cuisine": "Cuisine", "Pôle Maison": "Maison", "Pôle Epicerie sèche": "Épicerie sèche",
  "Pôle Produits frais": "Produits frais", "Pôle Petit déjeuner": "Petit déjeuner", "Pôle Caisse": "Caisse",
};
const FAMILY_FIX: Record<string, string> = { "Concerves": "Conserves", "Epices": "Épices", "Gateaux": "Gâteaux", "Riz & Pates": "Riz & Pâtes" };
const EXPECTED_M: Record<string, number> = { Cuisine: 42.89, Maison: 39.05, "Épicerie sèche": 37.34, "Produits frais": 31.09, Cave: 23.62, "Petit déjeuner": 20.41, Caisse: 7.83 };

const bq = makeBQClient(PROJECT);
const fr = (s: string) => Number(String(s).trim().replace(",", "."));

interface Fixture { no: number; pole: string; family: string; length_m: number; depth_m: number; faces: 1 | 2 | null; note: string }
function readCsv(): Fixture[] {
  const lines = readFileSync(CSV, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const head = lines[0].split(";");
  const col = (name: string) => { const i = head.indexOf(name); if (i < 0) throw new Error(`colonne absente : ${name}`); return i; };
  const iNo = col("N°"), iPole = col("Pôle"), iFam = col("Famille"), iLen = col("Longueur (m)"), iDep = col("Profondeur (m)"), iFaces = col("Faces de préhension"), iNote = col("Note / à vérifier");
  return lines.slice(1).map((l) => {
    const c = l.split(";");
    const pole = POLE_NAME[c[iPole].trim()];
    if (!pole) throw new Error(`pôle inconnu : ${c[iPole]}`);
    const famRaw = c[iFam].trim();
    const facesRaw = Number(c[iFaces].trim());
    return {
      no: Number(c[iNo].trim()), pole, family: FAMILY_FIX[famRaw] ?? famRaw,
      length_m: fr(c[iLen]), depth_m: fr(c[iDep]), faces: facesRaw === 1 || facesRaw === 2 ? facesRaw : null, note: (c[iNote] || "").trim(),
    };
  });
}

async function ownerUserId(): Promise<string> {
  const [rows] = await bq.query({
    query: `SELECT clerk_user_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE location_id = @l LIMIT 1`,
    params: { l: LOCATION_ID }, location: "EU",
  });
  const id = String((rows as any[])[0]?.clerk_user_id ?? "");
  if (!id) throw new Error("aucun profil pour le site — l'identité du déclarant manque");
  return id;
}

async function state() {
  const poles = await listPoles(bq, LOCATION_ID, 50);
  const measures = await listSpaceMeasures(LOCATION_ID);
  return { poles, measures };
}

async function rollback() {
  const before = await state();
  console.log(`AVANT : ${before.poles.length} pôles, ${before.measures.length} mesures`);
  await bq.query({ query: `DELETE FROM \`${PROJECT}.analytics.space_measures\` WHERE location_id = @l`, params: { l: LOCATION_ID }, location: "EU" });
  await bq.query({ query: `DELETE FROM \`${PROJECT}.analytics.action_commitments\` WHERE location_id = @l AND dispositif_nature = 'permanent' AND origin_kind = 'pole'`, params: { l: LOCATION_ID }, location: "EU" });
  const after = await state();
  console.log(`APRÈS : ${after.poles.length} pôles, ${after.measures.length} mesures`);
}

async function load() {
  const fixtures = readCsv();
  if (fixtures.length !== 52) throw new Error(`52 composants attendus, ${fixtures.length} lus`);
  const before = await state();
  if (before.poles.length || before.measures.length) throw new Error(`le site porte déjà ${before.poles.length} pôle(s) et ${before.measures.length} mesure(s) — rien n'est chargé`);
  const userId = await ownerUserId();
  const byPole = new Map<string, Fixture[]>();
  for (const f of fixtures) byPole.set(f.pole, [...(byPole.get(f.pole) ?? []), f]);
  // --families=site : les familles réelles du site, à parts égales entre les pôles (boucle sur les pôles
  // rangés par mètres décroissants, familles rangées par CA décroissant). Une famille vit dans un seul pôle.
  const useSiteFamilies = process.argv.includes("--families=site");
  const siteFamiliesByPole = new Map<string, string[]>();
  if (useSiteFamilies) {
    const fams = (await listSiteFamilies(bq, LOCATION_ID, 50)).sort((a, b) => b.avg_day_eur - a.avg_day_eur).map((f) => f.category);
    if (!fams.length) throw new Error("--families=site : le site n'a aucune famille vendue");
    const polesByMetres = [...byPole.keys()].sort((a, b) => (EXPECTED_M[b] ?? 0) - (EXPECTED_M[a] ?? 0));
    fams.forEach((f, i) => { const pole = polesByMetres[i % polesByMetres.length]; siteFamiliesByPole.set(pole, [...(siteFamiliesByPole.get(pole) ?? []), f]); });
    console.log("familles réelles réparties :", JSON.stringify(Object.fromEntries(siteFamiliesByPole)));
  }
  const created: Array<{ pole: string; commitment_id: string; n: number }> = [];
  for (const [pole, fx] of byPole) {
    fx.sort((a, b) => a.no - b.no);
    const families = useSiteFamilies ? (siteFamiliesByPole.get(pole) ?? []) : Array.from(new Set(fx.map((f) => f.family)));
    if (!families.length) { console.log(`ignoré : ${pole} — aucune famille réelle ne lui revient`); continue; }
    const body = {
      location_id: LOCATION_ID, dispositif_nature: "permanent", committed_action_text: pole, pole_families: families,
      components: fx.map((f) => ({ key: `p${f.no}`, type: "autre", role: null, label: `N° ${f.no} — ${f.family}` })),
      space_measures: {
        source: "plan", measured_at: MEASURED_AT,
        components: fx.map((f) => ({
          component_key: `p${f.no}`, fixture_no: f.no, length_m: f.length_m, depth_m: f.depth_m, faces: f.faces,
          families_share: useSiteFamilies ? null : [{ family: f.family, share: 1 }],
        })),
      },
    };
    const r = await createPermanentPole(bq, userId, body);
    if (r.status !== 200) throw new Error(`pôle « ${pole} » refusé : ${String(r.body.error)}`);
    created.push({ pole, commitment_id: String(r.body.commitment_id), n: Number(r.body.space_measures_written) });
    console.log(`créé : ${pole} — ${families.length} familles, ${fx.length} composants, ${r.body.space_measures_written} mesures`);
  }
  // Vérification après coup : relire, jamais conclure sur le seul « ok ».
  const after = await state();
  console.log(`APRÈS : ${after.poles.length} pôles, ${after.measures.length} mesures`);
  if (after.poles.length !== created.length) throw new Error(`${created.length} pôles attendus, ${after.poles.length} relus`);
  if (after.measures.length !== created.reduce((a, c) => a + c.n, 0)) throw new Error(`mesures relues : ${after.measures.length}, écrites : ${created.reduce((a, c) => a + c.n, 0)}`);
  const mByPole = new Map<string, number>();
  const labelOf = new Map(after.poles.map((p) => [p.dispositif_id, p.name]));
  for (const m of after.measures) {
    const name = labelOf.get(m.dispositif_id) ?? "?";
    mByPole.set(name, Math.round(((mByPole.get(name) ?? 0) + (m.linear_m_facade ?? 0)) * 100) / 100);
  }
  let total = 0;
  for (const [name, m] of mByPole) {
    total += m;
    const exp = EXPECTED_M[name];
    console.log(`${name.padEnd(16)} ${String(m).replace(".", ",").padStart(6)} m  attendu ${String(exp).replace(".", ",")} ${Math.abs(m - exp) < 0.02 ? "OK" : "ÉCART"}`);
  }
  console.log(`total ${String(Math.round(total * 100) / 100).replace(".", ",")} m (attendu 202,23)`);
}

if (process.argv.includes("--rollback")) await rollback(); else await load();
