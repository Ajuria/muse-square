// GARDE-FOU DU LEXIQUE — le vocabulaire du dossier d'événement ne peut plus re-dériver.
//
// Pourquoi (owner, 10/08) : « attendu », « sans cible chiffrée », « Sur la série », « 0/3 à la
// cible » sont revenus trois fois. Corrigés à la main dans trois fichiers, ils reviennent au
// prochain qui écrit une ligne. Ce test lit `MOTS_BANNIS` (src/lib/fr/evenement.fr.ts) et
// échoue si un mot banni réapparaît dans une CHAÎNE VISIBLE des surfaces couvertes.
//
// Ce qu'il regarde : les littéraux de chaîne, hors commentaires (// et /* */), hors noms de
// champs techniques (expected_revenue, window_expected…). Un faux positif se lève en écrivant
// le mot maison — jamais en désactivant le test.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MOTS_BANNIS, EVT_FR } from "./evenement.fr";

// NB : `evenement.fr.ts` n'est PAS scanné — il NOMME les mots bannis (c'est son travail) ;
// ses valeurs sont couvertes par le test « le lexique lui-même » ci-dessous.
const SURFACES = [
  "src/lib/insightFamilies/evenement.ts",
  // 27/08 : la famille concurrent n'était PAS balayée — c'est ce qui a laissé vivre
  // « Pression locale même secteur » (mot banni + restriction sectorielle inexistante).
  "src/lib/insightFamilies/competitor.ts",
  "src/pages/app/insightevent/evenement.astro",
  "src/pages/app/insightevent/tableau.astro",
  "src/pages/app/insightevent/pulse.astro",
  "src/pages/app/insightevent/insight.astro",
  "src/lib/commitments/commitmentCopy.ts",
  "public/js/event-form.js",
  "public/js/action-cards.js",
  "public/js/card-kit.js",
  "public/js/draft-workspace.js",
  "public/js/commit-form.js",
  "public/js/pole-form.js",
  // 03/09 (I1) : la réponse hors périmètre d'Explorer — option A, owner 03/09.
  "src/lib/ai/horsPerimetre.ts",
  // 04/09 (I8) : la lecture dispositif × famille — libellés owner 04/09.
  "src/lib/dispositifs/dispositifFamille.ts",
  "src/lib/explorer/topFamilles.ts",
  // Le harnais de rendu DUPLIQUE la copie réelle dans ses fixtures : sans lui sous garde,
  // il affiche des mots périmés et ment sur ce que la page dit (constaté le 10/08).
  "tools/harness/card-harness.html",
  // Maquettes (owner 17/08) : elles portent la copie que l'owner VALIDE — un mot inventé
  // en maquette devient un mot en prod ; le garde-fou mord donc dès la maquette.
  "src/pages/app/insightevent/competitor.astro",
];

/** Retire les commentaires, puis ne garde que le contenu des littéraux de chaîne. */
function visibleStrings(src: string): string[] {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, " ");
  const noLine = noBlock
    .split("\n")
    .map((l) => l.replace(/(^|\s)\/\/.*$/, "$1"))
    .join("\n");
  const out: string[] = [];
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noLine)) !== null) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

// Identifiants techniques qui CONTIENNENT un mot banni sans jamais s'afficher.
const TECHNIQUE = /expected|window_expected|_attendu|attendu_|residual|kpi_target|threshold/i;
/** Un littéral d'UN SEUL token minuscule est une CLÉ (enum, champ), pas de la prose. */
const estUneCle = (s: string): boolean => /^[a-z_]+$/.test(s);

describe("lexique FR du dossier d'événement", () => {
  it("expose une table de mots bannis non vide", () => {
    expect(Object.keys(MOTS_BANNIS).length).toBeGreaterThan(0);
  });

  it("le lexique lui-même n'emploie aucun mot banni", () => {
    const textes = Object.values(EVT_FR).join(" ").toLowerCase();
    for (const mot of Object.keys(MOTS_BANNIS)) {
      // « habituel » contient… « habituel » : on teste le mot banni, pas son remplaçant.
      expect(textes.includes(mot.toLowerCase()), `EVT_FR emploie « ${mot} » — écrire « ${MOTS_BANNIS[mot]} »`).toBe(false);
    }
  });

  for (const f of SURFACES) {
    it(`aucun mot banni dans les chaînes visibles de ${f}`, () => {
      const src = readFileSync(new URL("../../../" + f, import.meta.url).pathname, "utf8");
      const fautes: string[] = [];
      for (const s of visibleStrings(src)) {
        if (TECHNIQUE.test(s) || estUneCle(s)) continue;
        // Les interpolations `${…}` sont du CODE, pas du texte visible : `${c.delta_pp}` ne doit
        // pas faire matcher « pp » (faux positifs mesurés le 27/08 en ajoutant pp au lexique).
        const low = s.replace(/\$\{[^}]*\}/g, " ").toLowerCase();
        for (const mot of Object.keys(MOTS_BANNIS)) {
          // Frontière de mot : « attendu » ne doit pas matcher « attendue » deux fois, ni un
          // identifiant collé. On cherche le mot entouré de non-lettres.
          const re = new RegExp("(^|[^a-zà-ÿ])" + mot.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-zà-ÿ]|$)", "i");
          if (re.test(low)) fautes.push(`« ${mot} » → écrire « ${MOTS_BANNIS[mot]} »  |  ${s.slice(0, 90)}`);
        }
      }
      expect(fautes, `Mots bannis trouvés dans ${f} :\n` + fautes.join("\n")).toEqual([]);
    });
  }
});
