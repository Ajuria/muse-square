// tools/harness/etageres-lecture-verify.mts — LE HARNAIS de la règle de hauteur (owner 15/09 : « go corrige
// contrat et re-mesure »). Il vit tant que la lecture d'étagère vit : toute retouche à `ETAGERE_REGLE_FR`
// ou à la consigne de cadrage du Relevé se re-mesure ICI, sur les mêmes six photos, avant d'être crue.
//
// LA QUESTION, précise : le contrat corrigé fait-il tomber le défaut mesuré le 15/09 au matin — un numéro
// d'étagère compté depuis LE CADRE, donc différent pour la même étagère si la photo est cadrée autrement ?
//
// CE QUI EST MESURÉ : les SIX MÊMES photos que le verdict du matin (`verdict-lecture-etageres-2026-09-15.md`),
// pas un nouvel échantillon — sinon on comparerait deux tirages et pas deux consignes. Chaque photo porte ce
// que le matin a établi À L'ŒIL ; la sortie se confronte à cette colonne, ligne à ligne.
//
// CE QUI GARANTIT QU'ON MESURE BIEN LA PRODUCTION : la règle n'est pas recopiée ici. Elle est IMPORTÉE
// (`ETAGERE_REGLE_FR`, `src/lib/ai/photoExtraction.ts`) — le texte mesuré est celui que le modèle recevra.
// Ce qui reste différent de la production, et qui est dit plutôt que caché : les articles sont désignés en
// toutes lettres et non par un `item_code`, parce qu'Épices et Tout n'a aucune vente ingérée, donc aucune
// liste d'articles. C'est la RÈGLE DE HAUTEUR qui est mesurée, pas l'accrochage à un code.
//
// Usage : npm run harness:etageres
import "dotenv/config";
import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { callClaudeMessagesAPI } from "../../src/lib/ai/runtime/claude";
import { modelFor } from "../../src/lib/ai/models";
import { ETAGERE_REGLE_FR } from "../../src/lib/ai/photoExtraction";

const RACINE = `${process.env.HOME}/Documents/Muse_Square/Clients/epices-et-tout/store_photos`;
const SORTIE = "data/shots/remesure-etageres-2026-09-15.md";

// Les six photos du verdict du matin, avec CE QUE L'ŒIL A ÉTABLI. `attendu` est la vérité de terrain.
const CAS = [
  { f: "Pôle Cave/Vin & Spiritueux/IMG_0114.jpeg", meuble: "rayonnage droit", etageres: 5,
    attendu: "Fontagard 2 · Bellevoye 2 · Glenfiddich 3 · Thompson's 3 · Hyde 4 · Lindores 4", matin: "5 étagères, 6/6 justes" },
  { f: "Pôle Epicerie sèche/Concerves/IMG_0104.jpeg", meuble: "rayonnage droit", etageres: 5,
    attendu: "confitures 1 · flageolets 2 · « à emporter » 3 · sauces 4 · soupes 5", matin: "5 étagères, 5/5 justes" },
  { f: "Pôle Cave/Vin & Spiritueux/IMG_0121.jpeg", meuble: "rayonnage droit", etageres: 4,
    attendu: "Chablis 1 · Javernand 1 · Pouilly Fumé 2 · Rully 1er cru 3 · Saint-Romain 4 · Hautes-Côtes de Nuits 2", matin: "4 étagères, 4/6 (2 désignations fausses)" },
  { f: "Pôle Petit déjeuner/Petit déjeuner/IMG_0075.jpeg", meuble: "meuble à casiers", etageres: 8,
    attendu: "8 rangées ; les confitures ORANGE/MANGUE/ABRICOT sont à 7, CITRON/GRIOTTE/FRAMBOISE ÉPÉPINÉE à 6", matin: "7 annoncées — TOUT décalé de 1" },
  { f: "Pôle Cuisine/Cuisson/IMG_0171.jpeg", meuble: "table + niche", etageres: 2,
    attendu: "la TABLE n'est pas une étagère ; la niche porte 2 rangées — planches et couvercles posés sur la table ⇒ null", matin: "3 annoncées, table comptée comme étagère 1" },
  { f: "Pôle Cave/Vin & Spiritueux/IMG_0128.jpeg", meuble: "vue large de la salle", etageres: null,
    attendu: "aucune position : quatre meubles différents dans le cadre", matin: "6 articles positionnés, mis à null par la porte" },
];

const CONSIGNE = `Tu regardes la photo d'un composant de magasin (un présentoir : casier, vitrine, comptoir, îlot…).
Réponds UNIQUEMENT en JSON, sans phrase autour :
{"base_visible": <true|false>, "etageres": <entier ou null>, "articles": [{"designation": "<ce que tu vois, en français>", "etagere": <entier ou null>, "confiance": "haute"|"moyenne"|"basse"}]}

${ETAGERE_REGLE_FR}

- "etageres" = le nombre de rangées que porte CE meuble, sous la même ancre que ci-dessus.
- Au plus 6 articles, les plus identifiables.`;

const model = modelFor("packager");
type L = { f: string; base: boolean | null; etageres: number | null; articles: Array<{ designation: string; etagere: number | null; confiance: string }>; erreur?: string };
const out: L[] = [];

for (const cas of CAS) {
  try {
    const jpeg = await sharp(`${RACINE}/${cas.f}`).rotate().resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    const rep = await callClaudeMessagesAPI({
      model, maxTokens: 700, timeoutMs: 60_000, cacheSystem: true,
      system: CONSIGNE,
      userContent: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
        { type: "text", text: "Lis ce composant." },
      ],
    });
    if (!rep.ok || !rep.rawText) throw new Error(rep.errors.join(" ") || "réponse vide");
    const t = rep.rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const o = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
    out.push({ f: cas.f, base: typeof o.base_visible === "boolean" ? o.base_visible : null, etageres: o.etageres ?? null, articles: Array.isArray(o.articles) ? o.articles : [] });
  } catch (e: any) {
    out.push({ f: cas.f, base: null, etageres: null, articles: [], erreur: String(e?.message || e).slice(0, 200) });
  }
  const d = out[out.length - 1];
  console.log(`${cas.f}\n   base_visible=${d.base}  étagères=${d.etageres ?? "null"}  (œil : ${cas.etageres ?? "—"})`);
  console.log(`   ${d.erreur ?? d.articles.map((a) => `${a.designation} (${a.etagere ?? "null"} · ${a.confiance})`).join(" · ")}`);
}

const lignes = [
  `# Re-mesure des étagères après correction du contrat — 15/09/2026`,
  ``,
  `Les SIX MÊMES photos que le verdict du matin, pour comparer deux consignes et non deux tirages.`,
  `Modèle : ${model}. La règle de hauteur est IMPORTÉE de \`src/lib/ai/photoExtraction.ts\` (\`ETAGERE_REGLE_FR\`) :`,
  `le texte mesuré ici est celui que la production envoie.`,
  ``,
  `| Photo | Meuble | Ce que l'œil a établi | Le matin | base_visible | Étagères | Articles rendus |`,
  `|---|---|---|---|---|---|---|`,
  ...CAS.map((c, i) => {
    const d = out[i];
    return `| ${c.f.split("/").pop()} | ${c.meuble} | ${c.attendu} | ${c.matin} | ${d.base ?? "—"} | ${d.etageres ?? "null"} (œil : ${c.etageres ?? "—"}) | ${d.erreur ?? (d.articles.map((a) => `${a.designation} (${a.etagere ?? "null"} · ${a.confiance})`).join(" · ") || "—")} |`;
  }),
];
writeFileSync(SORTIE, lignes.join("\n") + "\n");
console.log(`\nSortie : ${SORTIE}`);
