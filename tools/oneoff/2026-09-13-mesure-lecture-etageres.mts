// tools/oneoff/2026-09-13-mesure-lecture-etageres.mts — MESURER AVANT DE PROMETTRE (owner 13/09 : « on
// mesure avant de promettre », et « okay » pour cette mesure).
//
// LA QUESTION : le modèle sait-il lire, sur une photo de composant, COMBIEN d'étagères porte le
// composant et SUR LAQUELLE se trouve chaque article ? Tant que ce chiffre n'existe pas, aucune carte
// ne peut dire « vos références à forte marge sont toutes en bas » — une position fausse ferait dire
// une bêtise à une carte, et c'est pire que pas de carte.
//
// CE QUI EST MESURÉ : un échantillon des photos RÉELLES d'Épices et Tout (prises par l'owner le 10/09,
// ~/Documents/Muse_Square/Clients/epices-et-tout/store_photos, 235 images rangées par pôle et famille).
// Aucune donnée fabriquée. La sortie est un tableau par photo — nombre d'étagères, articles nommés avec
// leur étagère (en partant du BAS) et la confiance du modèle — à confronter à l'œil sur un sous-échantillon.
// Précédent : la mesure du tri de familles du 10/09 (68 % en choix ouvert, 93 % sur les « haute »).
//
// CE QUE ÇA NE DIT PAS : rien sur la marge ni sur les ventes — juste la lecture d'une position.
//
// Usage : npx tsx tools/oneoff/2026-09-13-mesure-lecture-etageres.mts [--n=30] [--pole="Pôle Cuisine"]
import "dotenv/config";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { callClaudeMessagesAPI } from "../../src/lib/ai/runtime/claude";
import { modelFor } from "../../src/lib/ai/models";

const RACINE = `${process.env.HOME}/Documents/Muse_Square/Clients/epices-et-tout/store_photos`;
const N = Number((process.argv.find((a) => a.startsWith("--n=")) || "--n=30").slice(4)) || 30;
const POLE = (process.argv.find((a) => a.startsWith("--pole=")) || "").slice("--pole=".length) || null;
const SORTIE = "data/shots/mesure-lecture-etageres-2026-09-13.md";

const CONSIGNE = `Tu regardes la photo d'un composant de magasin (un présentoir : casier, vitrine, comptoir, îlot…).
Réponds UNIQUEMENT en JSON, sans phrase autour :
{"etageres": <entier ou null>, "articles": [{"designation": "<ce que tu vois, en français>", "etagere": <entier>, "confiance": "haute"|"moyenne"|"basse"}]}

Règles :
- "etageres" = le nombre d'étagères (rangées horizontales de pose) que porte CE composant, visible sur la photo. Un comptoir plat, une vitrine sans rangée, une table : null.
- "etagere" = la rangée où se trouve l'article, EN PARTANT DU BAS (1 = la plus basse visible).
- Au plus 6 articles, les plus identifiables. Si tu ne distingues aucune rangée, rends "articles": [].
- Ne devine jamais : une rangée que tu ne peux pas compter vaut null, un article dont tu n'es pas sûr de la rangée vaut "confiance": "basse".`;

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
// Échantillon RÉGULIER (un pas constant) : pas de tirage au sort, la mesure se rejoue à l'identique.
const pas = Math.max(1, Math.floor(toutes.length / N));
const choisies = toutes.filter((_, i) => i % pas === 0).slice(0, N);
console.log(`${toutes.length} photos ${POLE ? `dans « ${POLE} »` : "au total"} ; ${choisies.length} mesurées (pas de ${pas}).`);

const model = modelFor("packager");
type Lecture = { fichier: string; pole: string; etageres: number | null; articles: Array<{ designation: string; etagere: number; confiance: string }>; erreur?: string };
const lectures: Lecture[] = [];

for (const [i, chemin] of choisies.entries()) {
  const rel = chemin.slice(RACINE.length + 1);
  const pole = rel.split("/")[0];
  try {
    const jpeg = await sharp(chemin).rotate().resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    const rep = await callClaudeMessagesAPI({
      model, maxTokens: 700, timeoutMs: 60_000, cacheSystem: true,
      system: CONSIGNE,
      userContent: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
        { type: "text", text: "Lis ce composant." },
      ],
    });
    if (!rep.ok || !rep.rawText) throw new Error(rep.errors.join(" ") || "réponse vide");
    const texte = rep.rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const o = JSON.parse(texte.slice(texte.indexOf("{"), texte.lastIndexOf("}") + 1));
    lectures.push({ fichier: rel, pole, etageres: o.etageres ?? null, articles: Array.isArray(o.articles) ? o.articles : [] });
  } catch (e: any) {
    lectures.push({ fichier: rel, pole, etageres: null, articles: [], erreur: String(e?.message || e).slice(0, 300) });
  }
  if ((i + 1) % 5 === 0) console.log(`  ${i + 1}/${choisies.length}`);
}

const ok = lectures.filter((l) => !l.erreur);
const avecEtageres = ok.filter((l) => l.etageres != null);
const arts = ok.flatMap((l) => l.articles);
const hautes = arts.filter((a) => a.confiance === "haute");
const lignes = [
  `# Lecture des étagères — mesure du 13/09/2026`,
  ``,
  `Photos réelles d'Épices et Tout (prises le 10/09), échantillon régulier de ${choisies.length} sur ${toutes.length}.`,
  `Modèle : ${model}. La consigne demande le nombre d'étagères du composant et, pour chaque article reconnu,`,
  `son étagère EN PARTANT DU BAS, avec une confiance. **Rien n'est vérifié ici** : ce document est la sortie brute,`,
  `à confronter à l'œil sur un sous-échantillon — c'est la vérification qui décide, pas la sortie.`,
  ``,
  `- lectures abouties : ${ok.length}/${choisies.length}${lectures.length - ok.length ? ` (${lectures.length - ok.length} en erreur)` : ""}`,
  `- composants où le modèle compte des étagères : ${avecEtageres.length}/${ok.length}`,
  `- articles positionnés : ${arts.length} — dont « haute » confiance : ${hautes.length}`,
  ``,
  `| Photo | Pôle | Étagères | Articles (étagère · confiance) |`,
  `|---|---|---|---|`,
  ...lectures.map((l) => `| ${l.fichier} | ${l.pole} | ${l.erreur ? "ERREUR" : l.etageres ?? "—"} | ${l.erreur ?? (l.articles.map((a) => `${a.designation} (${a.etagere} · ${a.confiance})`).join(" · ") || "—")} |`),
];
writeFileSync(SORTIE, lignes.join("\n") + "\n");
console.log(`\n${ok.length}/${choisies.length} lectures ; ${avecEtageres.length} composants avec étagères ; ${arts.length} articles positionnés (${hautes.length} en « haute »).`);
console.log(`Sortie : ${SORTIE}`);
