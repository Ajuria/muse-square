// tools/harness/pole-page-verify.mts — LA PAGE D'UN PÔLE, MESURÉE SUR LE COMPTE DE L'OWNER (14/09).
//
// POURQUOI CE FICHIER EXISTE. J'ai annoncé les points 1-3 « livrés » sur la foi de tests verts, dont un
// que je n'avais pas joué. Un test vert prouve une fonction, jamais une livraison (CLAUDE.md § Verify
// Before Done). Ce harnais prouve les DEUX choses que les tests ne peuvent pas prouver :
//   1. le RENDU : le vrai endpoint sur f10c3e58 → le vrai card-kit.js dans un vm → les sections sont-elles
//      dans le HTML, avec de vrais nombres ? (le harnais EST la page)
//   2. le BUDGET : combien de temps l'endpoint met, en vrai, avec la décomposition sur 120 jours que le
//      point 2 y a ajoutée. 3 secondes est un budget DUR. Mesurer, jamais déduire.
//
// Il tourne sur TOUS les pôles du site, pas sur un : un pôle sans mesure d'espace et un pôle mesuré ne
// rendent pas la même page, et c'est justement l'absence qui doit se dire proprement.
//
// Usage : npx tsx tools/harness/pole-page-verify.mts [--dump="<nom du pôle>"]
import "dotenv/config";
import { readFileSync } from "node:fs";
import * as vm from "node:vm";
import { makeBQClient } from "../../src/lib/bq";
import { GET as evoGET } from "../../src/pages/api/commitments/evolution";
import { EVOL_COPY } from "../../src/lib/commitments/commitmentCopy";
import { listPoles } from "../../src/lib/dispositifs/poleReading";

const P = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";           // le compte que l'owner teste (CLAUDE.md)
const BUDGET_MS = 3000;
const DUMP = (process.argv.find((a) => a.startsWith("--dump=")) || "").slice(7);

const bq = makeBQClient(P);

const [[u]] = await bq.query({
  query: `SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id = @l AND clerk_user_id IS NOT NULL LIMIT 1`,
  params: { l: LOC }, location: "EU",
});
const userId = String((u as any)?.clerk_user_id?.value ?? (u as any)?.clerk_user_id ?? "");
if (!userId) { console.error("Aucun utilisateur sur ce site."); process.exit(3); }

// LE DÉMARRAGE À FROID SE MESURE À PART, SINON IL MENT. Le premier aller-retour BigQuery d'un processus
// paie l'initialisation du client (mesuré le 14/09 : 12,6 s contre 1,2 s ensuite, même pôle, même requête).
// Compté dans la page, il ferait croire à une régression ; caché, il ferait croire que la page est froide
// aussi rapide que chaude. Il est donc chronométré, annoncé, et exclu des mesures de page.
const tFroid = Date.now();
const poles = await listPoles(bq, LOC, 20);
const msFroid = Date.now() - tFroid;
if (!poles.length) { console.error("Aucun pôle déclaré — rien à vérifier."); process.exit(2); }

const bac: any = { window: {}, console: { log() {}, warn() {}, error() {} } };
bac.window.window = bac.window;
vm.createContext(bac);
vm.runInContext(readFileSync("public/js/card-kit.js", "utf8"), bac, { filename: "card-kit.js" });
const kit = bac.window.MSCardKit;

type Ligne = { nom: string; ms: number; espace: string; comparaison: string; decomposition: string; plan: string; octets: number };
const lignes: Ligne[] = [];
let erreurs = 0;

for (const p of poles) {
  const id = String(p.commitment_id);
  const t0 = Date.now();
  const res = await evoGET({
    url: new URL(`http://l/api/commitments/evolution?commitment_id=${encodeURIComponent(id)}`),
    locals: { clerk_user_id: userId },
  } as any);
  const data: any = await (res as Response).json();
  const ms = Date.now() - t0;
  if (!data?.ok) { console.error(`✗ ${p.name} : evolution a répondu « ${data?.error} »`); erreurs++; continue; }
  if (data.commitment?.dispositif_nature !== "permanent") continue;

  let html = "";
  try { html = String(kit.renderEvolution(data, EVOL_COPY)); }
  catch (e: any) { console.error(`✗ ${p.name} : LE KIT PLANTE — ${e?.message}`); erreurs++; continue; }

  // Ce qu'on lit dans le RENDU, jamais dans le payload : une donnée servie et non rendue est le défaut
  // exact qui a fait « pourquoi rien n'est visible ? » le 13/09.
  const texte = (bloc: string): string =>
    bloc.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const sec = (marqueur: string, titre: string): string => {
    // On ancre sur le marqueur quand il existe, SINON sur le titre rendu — jamais sur indexOf(""),
    // qui vaut 0 et découpe l'en-tête de la page à la place de la section (ma faute du premier tir).
    const i = marqueur ? html.indexOf(marqueur) : html.indexOf(titre);
    if (i < 0) return "absente";
    const chiffres = (texte(html.slice(i, i + 4000)).match(/\d[\d  ]*(?:,\d+)?\s*(?:€|m²|m|%)(?![a-zA-Z-])/g) || []).slice(0, 4);
    return chiffres.length ? `rendue · ${chiffres.join(" · ")}` : "rendue SANS AUCUN NOMBRE";
  };
  const espace = sec("data-eg-espace", String(EVOL_COPY.pole_space_title));
  const espaceTxt = html.includes(String(EVOL_COPY.pole_space_none)) ? "absence DITE" : espace;
  const comparaison = data.pole?.comparaison ? sec("data-eg-poles-rank", String(EVOL_COPY.pole_rank_title))
    : (html.includes("data-eg-poles-rank") ? "RENDUE SANS DONNÉE" : "non servie (moins de 2 pôles mesurés)");
  // 14/09 (point 5) — le plan : rendu, et SA zone distinguee ? Un plan ou l'on ne se trouve pas ne sert a rien.
  const plan = !data.pole?.plan ? "non servi (aucun contour relevé)"
    : !html.includes("data-eg-plan") ? "SERVI MAIS PAS RENDU"
    : (html.match(/stroke="#111827" stroke-width="3"/g) || []).length
      ? `rendu · ${data.pole.plan.zones.length} zone(s) · CE pôle contouré`
      : "rendu MAIS ce pôle n'est pas distingué";
  const decomposition = data.shape ? (html.includes(String(EVOL_COPY.shape_title)) ? sec("", String(EVOL_COPY.shape_title)) : "SERVIE MAIS PAS RENDUE")
    : "non servie (aucune famille au périmètre)";

  // LA PAGE ENTIÈRE, pas seulement les sections du chantier : tout montant à trois décimales est un défaut
  // de formatage français (CLAUDE.md § Localization). C'est le contrôle qui a trouvé « 491,109 € ».
  const mauvais = [...new Set((texte(html).match(/\d[\d  ]*,\d{3,}\s*(?:€|m²|m|%)?/g) || []))];
  if (mauvais.length) { console.error(`✗ ${p.name} : ${mauvais.length} nombre(s) mal formaté(s) — ${mauvais.slice(0, 6).join(" · ")}`); erreurs++; }

  lignes.push({ nom: String(p.name), ms, espace: espaceTxt, comparaison, decomposition: decomposition.replace(/^rendue/, "rendue"), plan, octets: html.length });

  // --dump=<nom du pôle> : le TEXTE des trois sections, pour relire les nombres et les phrases à l'œil
  // (une valeur mal formatée passe tous les tests — le formatage français ne se déduit pas d'un vert).
  if (DUMP && String(p.name) === DUMP) {
    const bloc = (marqueur: string, fin: string) => {
      const i = html.indexOf(marqueur); if (i < 0) return "(absente)";
      const j = html.indexOf(fin, i); return texte(html.slice(i, j > i ? j + fin.length : i + 2500));
    };
    console.log(`\n── ${p.name} · ESPACE ──\n${bloc("data-eg-espace", "</div></div>").slice(0, 600)}`);
    console.log(`\n── ${p.name} · COMPARAISON ──\n${bloc("data-eg-poles-rank", "</table>")}`);
    console.log(`\n── ${p.name} · DÉCOMPOSITION (début) ──\n${bloc(String(EVOL_COPY.shape_title), "</div></div>").slice(0, 600)}`);
    console.log(`\n── ce que l'API sert ──\n${JSON.stringify({ space: data.pole?.space, comparaison_lignes: data.pole?.comparaison?.rows?.length ?? null }, null, 1).slice(0, 900)}\n`);
  }
}

console.log(`\nLA PAGE D'UN PÔLE SUR f10c3e58 — ${lignes.length} pôle(s), budget ${BUDGET_MS} ms`);
console.log(`Démarrage à froid du client BigQuery : ${msFroid} ms (hors page, payé une fois par processus)\n`);
for (const l of lignes) {
  const verdict = l.ms > BUDGET_MS ? "HORS BUDGET" : "dans le budget";
  console.log(`${l.ms > BUDGET_MS ? "✗" : "✓"} ${l.nom}`);
  console.log(`    endpoint      ${l.ms} ms (${verdict}) · ${l.octets} octets rendus`);
  console.log(`    espace        ${l.espace}`);
  console.log(`    comparaison   ${l.comparaison}`);
  console.log(`    décomposition ${l.decomposition}`);
  console.log(`    plan          ${l.plan}`);
}
const pire = lignes.reduce((a, l) => Math.max(a, l.ms), 0);
const hors = lignes.slice(1).filter((l) => l.ms > BUDGET_MS).length;
if (lignes[0] && lignes[0].ms > BUDGET_MS) console.log(`(le premier pôle mesuré, ${lignes[0].nom}, paie encore le froid : ${lignes[0].ms} ms — relancer pour le lire à chaud)`);
console.log(`\nLe plus lent : ${pire} ms. Hors budget : ${hors}/${lignes.length}. Erreurs : ${erreurs}.`);
process.exit(erreurs || hors ? 1 : 0);
