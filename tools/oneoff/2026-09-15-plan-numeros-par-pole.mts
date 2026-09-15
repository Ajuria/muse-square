// tools/oneoff/2026-09-15-plan-numeros-par-pole.mts — one-shot (owner 15/09, à la suite de la
// renumérotation contiguë : « update le plan pdf avec les nouveaux numéros »).
//
// CE QU'IL FAIT : il pose sur le plan PDF, SOUS chaque étiquette « Pôle X » que le plan porte
// déjà, la plage de numéros de ce pôle — « n° 1 à 7 » sous « Pôle Cave », « n° 8 à 17 » sous
// « Pôle Cuisine », etc. Devant le plan, un numéro dit désormais son pôle.
//
// CE QU'IL NE FAIT PAS, ET POURQUOI : il ne pose PAS les 52 numéros sur les 52 composants. Le plan
// ne porte aucun repère par composant — ni numéro, ni identifiant dans sa couche texte (201 mots :
// les 7 noms de pôle, 33 noms de famille, « NON ACCESSIBLE AU PUBLIC », des cotes). Trois tentatives
// de découpage automatique des rectangles bleus, mesurées le 15/09 : par chevauchement seul → 134
// blocs ; en collant ce qui se touche à 12 cm près → 27 blocs (les meubles adossés fusionnent) ; par
// les tracés à 7 points → 84. Aucune ne rend 52. Et les 33 étiquettes de famille du plan ne
// désignent qu'UN SEUL composant sans ambiguïté dans 9 cas sur 52. Un numéro posé au mauvais endroit
// est pire qu'un numéro absent : il ferait mentir le plan, et la photo suivrait le mauvais composant.
// Les 52 numéros exacts se poseront depuis les points que l'exploitant tape sur le plan pendant la
// marche (`analytics.space_fixture_points`, x/y en fraction du plan) : ces positions-là viennent de
// lui, elles ne peuvent pas être fausses.
//
// TOUT VIENT DE LA SOURCE, RIEN N'EST ÉCRIT EN DUR : les plages sont lues dans
// `semantic.vw_insight_event_component_space` ; les positions des étiquettes sont lues dans la couche
// texte du PDF (`pdftotext -bbox-layout`) au moment de l'exécution.
//
// Usage : npx tsx tools/oneoff/2026-09-15-plan-numeros-par-pole.mts
//         … --location=<uuid>  --plan=<chemin.pdf>  --sortie=<chemin.pdf>
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeBQClient } from "../../src/lib/bq";
import { listPoles } from "../../src/lib/dispositifs/poleReading";
import { listSpaceMeasures, currentMeasures } from "../../src/lib/dispositifs/spaceMeasures";

const PROJECT = "muse-square-open-data";
const HOME = process.env.HOME || "";
const arg = (n: string, d: string) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `--${n}=${d}`).split("=").slice(1).join("=");
const LOCATION = arg("location", "f10c3e58-326e-4e38-947c-d59fcbe51df5");
const PLAN = arg("plan", `${HOME}/Documents/Muse_Square/Clients/epices-et-tout/map/Plan_Poles_Epices_et_Tout.pdf`);
const SORTIE = arg("sortie", `${HOME}/Documents/Muse_Square/Clients/epices-et-tout/map/Plan_Poles_Epices_et_Tout_numerote_2026-09-15.pdf`);
const PYTHON = `${HOME}/.venv/bin/python3`;
const POLICE = "Helvetica-Bold";
const CORPS = 11;

/** Une boîte de texte du PDF, en points, mesurée depuis le HAUT de la page. */
interface Boite { x0: number; y0: number; x1: number; y1: number; mot: string }
/** L'étiquette « Pôle X » telle que le PDF la porte, avec sa boîte. */
interface Etiquette { nom: string; x0: number; y0: number; x1: number; y1: number }

function motsDuPlan(pdf: string, dossier: string): Boite[] {
  const html = join(dossier, "plan-bbox.html");
  execFileSync("pdftotext", ["-bbox-layout", pdf, html]);
  const t = readFileSync(html, "utf8");
  return [...t.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)]
    .map((m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], mot: m[5] }));
}

function etiquettesDuPlan(mots: Boite[]): Etiquette[] {
  const out: Etiquette[] = [];
  for (const p of mots.filter((m) => m.mot === "Pôle")) {
    // Le nom du pôle = les mots alphabétiques qui suivent « Pôle » sur la même ligne.
    const suite = mots
      .filter((m) => Math.abs(m.y0 - p.y0) < 6 && m.x0 > p.x0 && m.x0 < p.x0 + 130 && /^[A-Za-zÀ-ÿ]/.test(m.mot))
      .sort((a, b) => a.x0 - b.x0);
    if (!suite.length) continue;
    out.push({
      nom: suite.map((m) => m.mot).join(" "), x0: p.x0, y0: Math.min(p.y0, ...suite.map((m) => m.y0)),
      x1: Math.max(p.x1, ...suite.map((m) => m.x1)), y1: Math.max(p.y1, ...suite.map((m) => m.y1)),
    });
  }
  return out;
}

/**
 * Où poser la plage sans RIEN couvrir de ce que le plan écrit déjà. Le même principe que
 * `placementEtiquettes` de card-kit.js : des candidats dans l'ordre de préférence, le premier qui
 * ne touche aucun mot du plan gagne ; si aucun ne passe, on ne pose pas — on le dit.
 * (Défaut vu au premier tirage : « n° 51 à 52 » recouvrait le « Caisse » du plan.)
 */
function placeLibre(e: Etiquette, l: number, h: number, mots: Boite[], page: { L: number; H: number }): { x: number; y: number } | null {
  const M = 1.5;   // une marge d'un point et demi : deux textes qui se frôlent se lisent mal
  const cx = (e.x0 + e.x1) / 2;
  const candidats = [
    { x: e.x0, y: e.y1 + 3 },                 // sous l'étiquette, aligné à gauche — la forme lue au premier tirage
    { x: cx - l / 2, y: e.y1 + 3 },           // sous l'étiquette, centré
    { x: cx - l / 2, y: e.y0 - h - 3 },       // au-dessus, centré
    { x: e.x1 + 5, y: (e.y0 + e.y1 + h) / 2 - h / 2 },  // à droite, sur la ligne
    { x: e.x0 - l - 5, y: (e.y0 + e.y1 + h) / 2 - h / 2 },
    { x: e.x0, y: e.y1 + 3 + h + 3 },         // une ligne plus bas
  ];
  for (const c of candidats) {
    if (c.x < 0 || c.y < 0 || c.x + l > page.L || c.y + h > page.H) continue;
    const heurte = mots.some((m) => m.x0 - M < c.x + l && m.x1 + M > c.x && m.y0 - M < c.y + h && m.y1 + M > c.y);
    if (!heurte) return c;
  }
  return null;
}

/** « Épicerie sèche » du compte contre « Epicerie sèche » du plan : on compare sans accents ni casse. */
const pli = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

async function main() {
  if (!existsSync(PLAN)) { console.error(`Plan introuvable : ${PLAN}`); process.exit(1); }
  if (!existsSync(PYTHON)) { console.error(`Interpréteur absent : ${PYTHON} (pypdf + reportlab)`); process.exit(1); }
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);

  const [poles, historique] = await Promise.all([listPoles(bq, LOCATION, 50), listSpaceMeasures(LOCATION)]);
  const nom = new Map(poles.map((p: any) => [p.dispositif_id, p.name as string]));
  const plages = new Map<string, { min: number; max: number; n: number }>();
  for (const m of currentMeasures(historique)) {
    if (m.component_key == null || m.fixture_no == null) continue;
    const p = nom.get(m.dispositif_id) ?? m.dispositif_id;
    const a = plages.get(p) ?? { min: m.fixture_no, max: m.fixture_no, n: 0 };
    a.min = Math.min(a.min, m.fixture_no); a.max = Math.max(a.max, m.fixture_no); a.n++;
    plages.set(p, a);
  }
  console.log(`Site ${LOCATION} — ${plages.size} pôles numérotés.`);

  const dossier = mkdtempSync(join(tmpdir(), "plan-"));
  const mots = motsDuPlan(PLAN, dossier);
  const etiquettes = etiquettesDuPlan(mots);
  console.log(`Couche texte du plan : ${mots.length} mots, dont ${etiquettes.length} étiquettes « Pôle X ».`);

  // La page et la largeur EXACTE de chaque ligne, mesurées par la police qui va les dessiner.
  const voulus = etiquettes.map((e) => {
    const cle = [...plages.keys()].find((p) => pli(p) === pli(e.nom));
    const a = cle ? plages.get(cle)! : null;
    return { e, cle, texte: !a ? "" : a.min === a.max ? `n° ${a.min}` : `n° ${a.min} à ${a.max}` };
  });
  const mesure = JSON.parse(execFileSync(PYTHON, ["-c", `
import json, sys
from pypdf import PdfReader
from reportlab.pdfbase.pdfmetrics import stringWidth
p = PdfReader(${JSON.stringify(PLAN)}).pages[0]
print(json.dumps({"L": float(p.mediabox.width), "H": float(p.mediabox.height),
  "w": [stringWidth(t, "${POLICE}", ${CORPS}) for t in json.loads(sys.argv[1])]}))
`, JSON.stringify(voulus.map((v) => v.texte))], { encoding: "utf8" })) as { L: number; H: number; w: number[] };

  const aPoser: Array<{ x: number; y: number; texte: string; pole: string }> = [];
  const orphelins: string[] = [];
  voulus.forEach((v, i) => {
    if (!v.cle) { orphelins.push(`plan : « Pôle ${v.e.nom} » — aucun pôle de ce nom sur le compte`); return; }
    const a = plages.get(v.cle)!;
    if (a.max - a.min + 1 !== a.n) { orphelins.push(`« ${v.cle} » : ${a.n} composants pour la plage ${a.min}-${a.max} — plage non contiguë, non posée`); return; }
    const place = placeLibre(v.e, mesure.w[i], CORPS, mots, mesure);
    if (!place) { orphelins.push(`« ${v.cle} » : aucune place libre autour de son étiquette — rien ne sera posé plutôt que de couvrir le plan`); return; }
    aPoser.push({ x: place.x, y: place.y, texte: v.texte, pole: v.cle });
  });
  for (const p of plages.keys()) if (!aPoser.some((a) => a.pole === p) && !orphelins.some((o) => o.includes(`« ${p} »`))) orphelins.push(`« ${p} » : aucune étiquette à ce nom dans le PDF`);

  for (const a of aPoser) console.log(`  ${a.pole.padEnd(16)} ${a.texte.padEnd(12)} @ ${a.x.toFixed(0)},${a.y.toFixed(0)}`);
  if (orphelins.length) { console.log("\nÀ relire :"); for (const o of orphelins) console.log(`  · ${o}`); }
  if (aPoser.length !== plages.size) { console.log("\nREFUS — un pôle sans sa plage laisserait le plan à moitié faux."); process.exit(1); }

  const script = join(dossier, "poser.py");
  writeFileSync(join(dossier, "poses.json"), JSON.stringify(aPoser), "utf8");
  writeFileSync(script, `
import json, io
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
poses = json.load(open(${JSON.stringify(join(dossier, "poses.json"))}, encoding="utf-8"))
src = PdfReader(${JSON.stringify(PLAN)})
page = src.pages[0]
L = float(page.mediabox.width); H = float(page.mediabox.height)
buf = io.BytesIO()
c = canvas.Canvas(buf, pagesize=(L, H))
c.setFont("${POLICE}", ${CORPS})
c.setFillColorRGB(0.043, 0.216, 0.898)   # --color-brand-blue #0b37e5
for p in poses:
    # pdftotext mesure depuis le HAUT de la page, reportlab depuis le BAS ; y est le haut de la ligne.
    c.drawString(p["x"], H - p["y"] - ${CORPS}, p["texte"])
c.save(); buf.seek(0)
page.merge_page(PdfReader(buf).pages[0])
w = PdfWriter(); w.add_page(page)
for i in range(1, len(src.pages)): w.add_page(src.pages[i])
w.write(${JSON.stringify(SORTIE)})
print("pages :", len(src.pages))
`, "utf8");
  console.log(execFileSync(PYTHON, [script], { encoding: "utf8" }).trim());

  // Vérification : le PDF écrit porte les plages dans sa couche texte, et garde celle du plan.
  const relu = join(dossier, "relu.txt");
  execFileSync("pdftotext", ["-layout", SORTIE, relu]);
  const texte = readFileSync(relu, "utf8");
  const manquants = aPoser.filter((a) => !texte.includes(a.texte));
  const avant = join(dossier, "avant.txt");
  execFileSync("pdftotext", ["-layout", PLAN, avant]);
  const motsAvant = readFileSync(avant, "utf8").split(/\s+/).filter(Boolean).length;
  const motsApres = texte.split(/\s+/).filter(Boolean).length;
  console.log(`\n${SORTIE}`);
  console.log(`Plages relues dans le PDF : ${aPoser.length - manquants.length} / ${aPoser.length}${manquants.length ? " — manquantes : " + manquants.map((m) => m.texte).join(", ") : ""}`);
  console.log(`Mots du plan : ${motsAvant} avant, ${motsApres} après (rien du plan n'a été retiré : ${motsApres > motsAvant ? "oui" : "À RELIRE"}).`);
  if (manquants.length || motsApres <= motsAvant) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
