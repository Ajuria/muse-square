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
  "src/pages/app/insightevent/evenement.astro",
  "public/event-form.js",
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
        if (TECHNIQUE.test(s)) continue;
        const low = s.toLowerCase();
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
