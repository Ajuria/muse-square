// GARDE-FOU DU FIL AGIR — les invariants de la maquette validée 14/08 (docs/agir-fil-spec.md),
// vérifiés sur la SOURCE d'émission de pulse.astro. Leçon des deux dérives visuelles du 14/08 :
// « vérifié » sans comparer à la maquette n'est pas vérifié. Ce test est le premier étage ;
// le harnais de rendu happy-dom (boot complet + payload monitor réel) est l'étage suivant.
// Un faux positif se lève en alignant l'émission sur la maquette — jamais en effaçant l'assertion.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../pages/app/insightevent/pulse.astro", import.meta.url).pathname, "utf8");
// Chaînes visibles seulement (hors commentaires) pour les assertions d'ABSENCE.
const sansCommentaires = src.replace(/\/\*[\s\S]*?\*\//g, " ").split("\n")
  .map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");

describe("fil Agir — invariants de la maquette (14/08)", () => {
  it("le score /10 et le radar sont HORS ASSEMBLAGE", () => {
    expect(sansCommentaires.includes("Pourquoi ce score")).toBe(false);
    expect(sansCommentaires.includes("Mon environnement")).toBe(false);
    // L'assemblage ne référence plus les volets (les définitions mortes restent — leur
    // suppression exige un outillage AST, pas un matcher d'accolades : il a avalé renderFeed
    // et la chaîne _cg* le 14/08, attrapé par vérification du diff AVANT re-push).
    const assemblage = src.slice(src.indexOf("root.innerHTML = pillsHtml"));
    expect(assemblage.slice(0, 400).includes("opsStrip")).toBe(false);
  });
  it("en-tête cible : Vos actions du jour, sans « Piloter → » (owner 25/08)", () => {
    expect(src.includes("Vos actions du jour")).toBe(true);
    expect(src.includes("Vos cartes du jour")).toBe(false);
    // Le lien « Piloter → » d'en-tête est mort (la nav globale le porte).
    expect(/Piloter \\u2192|Piloter →/.test(src)).toBe(false);
  });
  it("sections titrées, engagements d'abord", () => {
    const iEng = src.indexOf(">Vos engagements<");
    // L'en-tête de SECTION du brief (style 650) — les fallbacks « feed vide » ont le leur.
    const iJour = src.indexOf('rgba(17,24,39,0.60);">Actions du jour<', iEng);
    expect(iEng).toBeGreaterThan(-1);
    expect(iJour).toBeGreaterThan(-1);
    expect(iEng).toBeLessThan(iJour);
  });
  it("les menus déroulants Agir sont morts (contextuel ET engagement)", () => {
    expect(sansCommentaires.includes("Agir \\u25be")).toBe(false);
    expect(sansCommentaires.includes("Piloter \\u25be")).toBe(false);
    expect(sansCommentaires.includes("Piloter ▾")).toBe(false);
    expect(sansCommentaires.includes("data-eng-agir-toggle")).toBe(false);
  });
  it("grammaire CTA : pied à DEUX gestes — Pas pour moi · geste bleu (ratifié 25/08)", () => {
    for (const cls of ['class="pls-cta-pri"', 'class="pls-cta-sec"']) expect(src.includes(cls)).toBe(true);
    // « Communiquer » a quitté les rangées (il vit sur Consulter) ; « Déjà fait » aussi.
    expect(src.includes(">Communiquer</button>")).toBe(false);
    expect(src.includes(">Déjà fait</button>")).toBe(false);
    expect(src.includes(">Pas pour moi</button>")).toBe(true);
    // Geste bleu = dernier du pied (Pas pour moi avant le geste).
    expect(src.indexOf("_dispoHtml\n                + _commitEntry")).toBeGreaterThan(-1);
  });
  it("possession : conteneur engagements bleu pâle + liseré", () => {
    expect(src.includes("#pls-engagement-cards:not(:empty) { background:#F7F9FF")).toBe(true);
  });
  it("peau de fil : conteneur = holders du triage, cartes sans boîte", () => {
    expect(src.includes("[data-t-cards]:not(:empty)")).toBe(true);
    expect(src.includes("border-top:1px solid rgba(17,24,39,0.06); border-radius:0")).toBe(true);
  });
  it("€ héros : pastille teintée gain/defend, 19px tabulaire", () => {
    expect(src.includes(".amt.gain .amt-val")).toBe(true);
    expect(src.includes("font-variant-numeric:tabular-nums")).toBe(true);
  });
  it("fin de fil + filet Nouveau + pli « aussi aujourd'hui »", () => {
    expect(src.includes("Vous \\u00eates \\u00e0 jour")).toBe(true);
    // 25/08 soir — UNE seule implémentation du filet : la per-carte de renderActionCandidates
    // (ab-newline, texte en clair) ; le doublon jour-borné du 14/08 (échappé) est retiré.
    expect(src.includes("Nouveau depuis votre dernière visite")).toBe(true);
    expect(src.includes("aussi aujourd\\u2019hui")).toBe(true);
  });
  it("chrome hors maquette mort : progression, Besoin d'aide", () => {
    expect(sansCommentaires.includes("ab-help-global")).toBe(false);
  });
});
