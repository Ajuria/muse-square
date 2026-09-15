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
  // 07/09 (état vide Explorer, guichet de la mémoire) : les mots des cartes de l'état vide.
  "src/lib/explorer/explorerSlotsCopy.fr.ts",
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
      // EXCEPTION NOMMÉE (owner 14/09) — « meuble » reste banni partout SAUF dans les consignes du
      // relevé. Le mot du MODÈLE est « composant » (owner 03/09, D1) ; l'owner a tranché le 14/09 que
      // ce n'est pas le mot d'une phrase dite à quelqu'un qui marche dans son magasin. L'exception est
      // portée par les CLÉS, jamais par un « sauf si ça ressemble à » : une exception qui ne se
      // nomme pas est un contournement, et la prochaine chaîne y passerait sans qu'on le voie.
      const EXCEPTIONS: Record<string, string[]> = { meuble: ["releve_consigne_1", "releve_consigne_2", "releve_consigne_3"] };
      const cleDe = (texte: string): string => {
        const m = src.match(new RegExp("([A-Za-z0-9_]+)\\s*:\\s*\"" + texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\""));
        return m ? m[1] : "";
      };
      for (const s of visibleStrings(src)) {
        if (TECHNIQUE.test(s) || estUneCle(s)) continue;
        // Les interpolations `${…}` sont du CODE, pas du texte visible : `${c.delta_pp}` ne doit
        // pas faire matcher « pp » (faux positifs mesurés le 27/08 en ajoutant pp au lexique).
        const low = s.replace(/\$\{[^}]*\}/g, " ").toLowerCase();
        for (const mot of Object.keys(MOTS_BANNIS)) {
          // Frontière de mot : « attendu » ne doit pas matcher « attendue » deux fois, ni un
          // identifiant collé. On cherche le mot entouré de non-lettres.
          const re = new RegExp("(^|[^a-zà-ÿ])" + mot.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-zà-ÿ]|$)", "i");
          if (!re.test(low)) continue;
          const exemptees = EXCEPTIONS[mot.toLowerCase()];
          if (exemptees && exemptees.includes(cleDe(s))) continue;
          fautes.push(`« ${mot} » → écrire « ${MOTS_BANNIS[mot]} »  |  ${s.slice(0, 90)}`);
        }
      }
      expect(fautes, `Mots bannis trouvés dans ${f} :\n` + fautes.join("\n")).toEqual([]);
    });
  }
});

// ── 15/09 — LE LEXIQUE FAIT LOI, ET PLUS PERSONNE NE PEUT L'OUBLIER (owner : « on streamline le
// lexique -> utilises-tu le lexique + intent.md comme spécifié dans CLAUDE.md ? »).
//
// CE QUI S'EST PASSÉ. Le 15/09 j'ai écrit deux titres de section — « Comment ce pôle est installé » et
// « Ce que cette place rapporte » — après avoir montré le grep de `MOTS_BANNIS`. Le grep passait, et la
// chaîne était fautive quand même : « place » était un SYNONYME de `pôle`, le mot de l'owner depuis le
// 27/08. Chercher les mots INTERDITS ne dit pas si le concept avait DÉJÀ son mot, et la règle 7 du
// lexique (un mot validé s'inscrit le JOUR MÊME) n'avait pas été appliquée non plus : les deux titres
// n'étaient nulle part dans `docs/lexique.md`. Verdict owner : « Non -> Ce que ce pôle rapporte ».
//
// LA GARDE. Tout titre de section de la page d'un pôle doit se retrouver VERBATIM dans le lexique.
// C'est le sens littéral de « le lexique fait loi sur toute chaîne visible » : une chaîne que le
// lexique ne porte pas n'a pas de loi, donc pas d'arbitrage, donc elle dérive.
//
// LE CLIQUET. Six titres étaient déjà absents au moment où la garde est posée — une dette qui n'est pas
// la mienne et qui ne se paie pas en réécrivant des chaînes que l'owner a approuvées ailleurs : leur
// ligne de lexique demande SA raison et SA date, que je n'ai pas. Le chiffre ne peut donc que BAISSER.
// Un titre NOUVEAU non inscrit fait échouer la suite, ce qui est exactement le défaut du 15/09.
const CLIQUET_TITRES_HORS_LEXIQUE = 6;

describe("le lexique fait loi sur les titres de la page d'un pôle", () => {
  it(`au plus ${CLIQUET_TITRES_HORS_LEXIQUE} titres hors du lexique — un titre NOUVEAU s'y inscrit le jour même`, async () => {
    const { EVOL_COPY } = await import("../commitments/commitmentCopy");
    const lex = readFileSync("docs/lexique.md", "utf8");
    const titres = Object.entries(EVOL_COPY as Record<string, unknown>)
      .filter(([k, v]) => /^pole_.*_title$/.test(k) && typeof v === "string" && v.trim().length > 0);
    const absents = titres.filter(([, v]) => !lex.includes(String(v))).map(([k, v]) => `${k} = « ${v} »`);
    expect(titres.length).toBeGreaterThan(5);            // la liste ne s'est pas vidée en silence
    expect(absents, absents.join("\n")).toHaveLength(CLIQUET_TITRES_HORS_LEXIQUE);
  });

  it("les deux titres de l'espace d'un pôle sont ceux du lexique, au mot près", async () => {
    const { EVOL_COPY } = await import("../commitments/commitmentCopy");
    const lex = readFileSync("docs/lexique.md", "utf8");
    expect((EVOL_COPY as any).pole_setup_title).toBe("Comment ce pôle est installé");
    expect((EVOL_COPY as any).pole_yield_title).toBe("Ce que ce pôle rapporte — 30 derniers jours");
    expect(lex).toContain("Comment ce pôle est installé");
    expect(lex).toContain("Ce que ce pôle rapporte — 30 derniers jours");
    // « place » comme synonyme de pôle est l'erreur nommée : elle ne revient pas par une autre porte.
    for (const v of Object.values(EVOL_COPY as Record<string, unknown>)) {
      if (typeof v === "string") expect(v).not.toMatch(/cette place|la place de ce/i);
    }
  });
});
