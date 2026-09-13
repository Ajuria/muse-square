// tools/oneoff/2026-09-13-mesure-etagere-par-article.mts — L'ÉTAGÈRE DE CHAQUE ARTICLE, MESURÉE AVEC LA
// CONSIGNE DE PRODUCTION (owner 13/09 : « go point 3 »).
//
// POURQUOI CETTE SECONDE MESURE. La sonde du matin (2026-09-13-mesure-lecture-etageres.mts) posait une
// consigne LIBRE : elle a rendu 171 positions sur 30 photos, mais en toutes lettres — « Bocaux et pots de
// condiments sur étagère ». Une désignation libre ne se croise avec AUCUNE vente. La lecture de production
// rend des `item_code` de la liste vendue du site ; depuis ce jour elle rend aussi leur `etagere`. Ce qui
// vaut preuve, c'est donc cette lecture-CI, pas la sonde.
//
// CE QUI EST MESURÉ : la MÊME consigne, le MÊME schéma et la MÊME porte que /api/dispositifs/photos —
// aucun chemin parallèle. Par photo : le nombre d'étagères du composant, chaque article reconnu avec son
// code, sa désignation, sa confiance et son étagère, et ce que la PORTE a ramené à null (une position
// qu'elle ne peut pas borner). La sortie est un document à confronter À L'ŒIL sur un sous-échantillon :
// c'est la vérification qui décide, jamais la sortie.
//
// CE QUE ÇA NE DIT PAS : rien sur la marge ni sur les ventes. Le croisement ne s'ouvre que si la position
// tient (étape 3 de docs/chantiers-ouverts-spec.md § 1).
//
// Usage :
//   npx tsx tools/oneoff/2026-09-13-mesure-etagere-par-article.mts --location=<uuid> [--n=30] [--type=lineaire] [--role=expert] [--pole="Pôle Cuisine"]
import "dotenv/config";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { makeBQClient } from "../../src/lib/bq";
import { listSiteItems } from "../../src/lib/dispositifs/dispositifPhotos";
import { listSiteFamilies } from "../../src/lib/kpi/kpiRegistry";
import { photoQuestions, photoExtractionSchema, photoExtractionSystem } from "../../src/lib/ai/photoExtraction";
import { validatePhotoExtraction } from "../../src/lib/ai/contracts/photoExtractionChecks";
import { callClaudeMessagesAPI } from "../../src/lib/ai/runtime/claude";
import { modelFor } from "../../src/lib/ai/models";

const RACINE = `${process.env.HOME}/Documents/Muse_Square/Clients/epices-et-tout/store_photos`;
const arg = (nom: string, defaut = "") => (process.argv.find((a) => a.startsWith(`--${nom}=`)) || "").slice(nom.length + 3) || defaut;
const LOC = arg("location");
const N = Number(arg("n", "30")) || 30;
const TYPE = arg("type", "lineaire");
const ROLE = arg("role", "expert") || null;
const POLE = arg("pole") || null;
const SORTIE = "data/shots/mesure-etagere-par-article-2026-09-13.md";

if (!LOC) {
  console.error("--location=<uuid> est requis : les codes d'article de la consigne sont CEUX DU SITE.\n" +
    "Une lecture faite avec la liste d'un autre site ne mesure rien.");
  process.exit(2);
}

const bq = makeBQClient(process.env.BQ_PROJECT_ID || "muse-square-open-data");
const [items, families] = await Promise.all([
  listSiteItems(bq, LOC),
  listSiteFamilies(bq, LOC, 50).then((f) => f.map((x: any) => String(x.category))).catch(() => [] as string[]),
]);
console.log(`Site ${LOC} : ${items.length} articles connus, ${families.length} familles vendues.`);
if (!items.length) {
  console.error("\nARRÊT — ce site n'a AUCUN article vendu connu.\n" +
    "La position d'un article ne se mesure que si l'article existe dans la liste vendue : sans elle, le modèle\n" +
    "n'a aucun code à recopier et la lecture ne rend que des positions orphelines. C'est le cas à traiter AVANT\n" +
    "de mesurer (les ventes du site ne sont pas ingérées, ou la photo appartient à un autre site que ses ventes).");
  process.exit(3);
}

function photos(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...photos(p));
    else if (/\.(jpe?g|png)$/i.test(e)) out.push(p);
  }
  return out;
}
const toutes = photos(POLE ? join(RACINE, POLE) : RACINE).sort();
// Échantillon RÉGULIER (pas constant) : la mesure se rejoue à l'identique, aucun tirage au sort.
const pas = Math.max(1, Math.floor(toutes.length / N));
const choisies = toutes.filter((_, i) => i % pas === 0).slice(0, N);
console.log(`${toutes.length} photos ${POLE ? `dans « ${POLE} »` : "au total"} ; ${choisies.length} mesurées (pas de ${pas}).`);

const codeVersDesignation: Record<string, string> = Object.fromEntries(items.map((i) => [i.item_code, i.item_description]));
const questions = photoQuestions({ type: TYPE, role: ROLE });
const systeme = photoExtractionSystem({ type: TYPE, role: ROLE, items, families }, questions);
const schema = photoExtractionSchema(questions, families);
const model = modelFor("packager");

type Ligne = {
  fichier: string; pole: string; erreur?: string;
  levels: number | null;
  articles: Array<{ code: string; designation: string; confiance: string; etagere: number | null }>;
  positions_rendues: number;      // ce que le MODÈLE a posé
  positions_gardees: number;      // ce que la PORTE a retenu
};
const lignes: Ligne[] = [];

for (const [i, chemin] of choisies.entries()) {
  const rel = chemin.slice(RACINE.length + 1);
  const pole = rel.split("/")[0];
  try {
    const jpeg = await sharp(chemin).rotate().resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    const rep = await callClaudeMessagesAPI({
      model, maxTokens: 2000, timeoutMs: 60_000, cacheSystem: true,
      system: systeme,
      userContent: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
        { type: "text", text: "Remplis le formulaire pour cette photo." },
      ],
      outputSchema: schema,
    });
    if (!rep.ok || !rep.rawText) throw new Error(rep.errors.join(" ") || "réponse vide");
    const brut = JSON.parse(rep.rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));
    const gate = validatePhotoExtraction(brut, questions.map((q) => q.key), items.map((x) => x.item_code), families);
    const rendues = (Array.isArray(brut.items) ? brut.items : []).filter((a: any) => a?.etagere != null).length;
    if (gate.rejected_person) { lignes.push({ fichier: rel, pole, erreur: "personne visible (image effacée en production)", levels: null, articles: [], positions_rendues: rendues, positions_gardees: 0 }); }
    else if (!gate.ok) { lignes.push({ fichier: rel, pole, erreur: "porte : " + gate.errors.slice(0, 3).join(" · "), levels: gate.levels, articles: [], positions_rendues: rendues, positions_gardees: 0 }); }
    else {
      lignes.push({
        fichier: rel, pole, levels: gate.levels,
        articles: gate.items.map((a) => ({ code: a.item_code, designation: codeVersDesignation[a.item_code] ?? a.item_code, confiance: a.confidence, etagere: a.etagere })),
        positions_rendues: rendues,
        positions_gardees: gate.items.filter((a) => a.etagere != null).length,
      });
    }
  } catch (e: any) {
    lignes.push({ fichier: rel, pole, erreur: String(e?.message || e).slice(0, 200), levels: null, articles: [], positions_rendues: 0, positions_gardees: 0 });
  }
  if ((i + 1) % 5 === 0) console.log(`  ${i + 1}/${choisies.length}`);
}

const ok = lignes.filter((l) => !l.erreur);
const arts = ok.flatMap((l) => l.articles);
const places = arts.filter((a) => a.etagere != null);
const hautes = places.filter((a) => a.confiance === "haute");
const jetees = lignes.reduce((s, l) => s + Math.max(0, l.positions_rendues - l.positions_gardees), 0);

const md = [
  `# L'étagère de chaque article — mesure du 13/09/2026, consigne de PRODUCTION`,
  ``,
  `Photos réelles d'Épices et Tout (prises le 10/09), échantillon régulier de ${choisies.length} sur ${toutes.length}.`,
  `Site des articles : \`${LOC}\` (${items.length} articles connus). Modèle : ${model}. Type supposé : ${TYPE}${ROLE ? ` · rôle ${ROLE}` : ""}.`,
  ``,
  `Même consigne, même schéma et même porte que \`/api/dispositifs/photos\` — aucun chemin parallèle.`,
  `**Rien n'est vérifié ici** : ce document est la sortie brute. C'est la confrontation À L'ŒIL du`,
  `sous-échantillon ci-dessous qui décide si la position tient, et donc si le croisement avec la marge s'ouvre.`,
  ``,
  `- lectures abouties : ${ok.length}/${choisies.length}${lignes.length - ok.length ? ` (${lignes.length - ok.length} écartées : porte, personne visible ou erreur)` : ""}`,
  `- composants avec un nombre d'étagères lu : ${ok.filter((l) => l.levels != null).length}/${ok.length}`,
  `- articles reconnus : ${arts.length} — dont POSITIONNÉS sur une étagère : ${places.length} (confiance « haute » : ${hautes.length})`,
  `- positions ramenées à null par la porte (hors des étagères du composant, ou composant sans étagère comptée) : ${jetees}`,
  ``,
  `| Photo | Pôle | Étagères | Articles reconnus (étagère · confiance) |`,
  `|---|---|---|---|`,
  ...lignes.map((l) => `| ${l.fichier} | ${l.pole} | ${l.erreur ? "—" : l.levels ?? "—"} | ${l.erreur ?? (l.articles.map((a) => `${a.designation} (${a.etagere ?? "—"} · ${a.confiance})`).join(" · ") || "aucun")} |`),
  ``,
  `## Le sous-échantillon à vérifier à l'œil`,
  ``,
  `Ouvrez ces photos et dites, pour chacune, si la position annoncée est la bonne. En dessous de ce verdict,`,
  `aucune chaîne ne parle de hauteur : une position fausse ferait dire une bêtise à une carte.`,
  ``,
  ...ok.filter((l) => l.articles.some((a) => a.etagere != null)).slice(0, 8).flatMap((l) => [
    `**${l.fichier}** — ${l.levels ?? "?"} étagères`,
    ...l.articles.filter((a) => a.etagere != null).map((a) => `  - étagère ${a.etagere} : ${a.designation} (${a.confiance})`),
    ``,
  ]),
];
writeFileSync(SORTIE, md.join("\n") + "\n");
console.log(`\n${ok.length}/${choisies.length} lectures ; ${places.length}/${arts.length} articles positionnés (${hautes.length} en « haute ») ; ${jetees} position(s) ramenée(s) à null par la porte.`);
console.log(`Sortie : ${SORTIE}`);
