// GARDE-FOU DES TOURNURES — le français de machine ne peut plus arriver jusqu'à l'owner.
//
// Frère du garde-fou des MOTS (evenement.fr.guard.test.ts) : celui-ci attrape les
// CONSTRUCTIONS refusées (src/lib/fr/tournures.fr.ts). Même mécanique de lecture — les
// littéraux de chaîne, commentaires retirés — parce que le défaut est toujours dans ce qui
// s'AFFICHE, jamais dans ce qui s'explique entre développeurs.
//   npx vitest run src/lib/fr/tournures.fr.guard.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { TOURNURES_LLM } from "./tournures.fr";

// Foyers de copie d'abord. La liste s'étend au fur et à mesure qu'une surface est nettoyée —
// jamais l'inverse (un garde-fou qu'on désactive pour faire passer un build ne garde rien).
const SURFACES = [
  "src/lib/commitments/commitmentCopy.ts",
  "src/lib/fr/evenement.fr.ts",
  "public/js/reco-library.js",
  "public/js/card-kit.js",
  "tools/proto/engagement-redesign-proto.html",
];

/** Retire les commentaires, puis ne garde que le contenu des littéraux de chaîne. */
function visibleStrings(src: string): string[] {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, " ");
  const noLine = noBlock.split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");
  const out: string[] = [];
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noLine)) !== null) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}
const estUneCle = (s: string): boolean => /^[a-z_]+$/.test(s);

describe("tournures de machine dans les chaînes visibles", () => {
  it("la table est non vide et chaque entrée porte la chaîne qui l'a value", () => {
    expect(TOURNURES_LLM.length).toBeGreaterThan(0);
    for (const t of TOURNURES_LLM) {
      expect(t.faute.length, "chaque tournance dit CE QUI CLOCHE").toBeGreaterThan(10);
      expect(t.refusee.length, "chaque tournure garde la trace de la phrase refusée").toBeGreaterThan(5);
    }
  });

  it("chaque motif attrape bien la phrase qui l'a fait naître", () => {
    for (const t of TOURNURES_LLM) {
      if (t.refusee.startsWith("(")) continue; // tic générique : pas de phrase refusée à rejouer
      expect(t.motif.test(t.refusee.toLowerCase()), `le motif ${t.motif} n'attrape plus « ${t.refusee} »`).toBe(true);
    }
  });

  for (const f of SURFACES) {
    it(`aucune tournure de machine dans ${f}`, () => {
      const src = readFileSync(new URL("../../../" + f, import.meta.url).pathname, "utf8");
      const fautes: string[] = [];
      for (const s of visibleStrings(src)) {
        if (estUneCle(s) || s.length < 12) continue;
        const low = s.replace(/\$\{[^}]*\}/g, " ").toLowerCase();
        for (const t of TOURNURES_LLM) {
          if (t.motif.test(low)) fautes.push(`${t.faute}\n     → « ${s.slice(0, 110)} »`);
        }
      }
      expect(fautes, `Tournures de machine dans ${f} :\n  ` + fautes.join("\n  ")).toEqual([]);
    });
  }
});
