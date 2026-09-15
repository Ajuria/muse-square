// Le BILAN D'UNE MARCHE (owner 15/09 : « le film prend beaucoup de photos dont beaucoup seront
// éliminées »). Le sujet est `public/js/releve-espace.js` — hors de `src/`, donc le test vit ici
// (CLAUDE.md § Placement). La fonction est PURE : elle ne lit que ce que la marche a compté.
import { readFileSync } from "node:fs";
import * as vm from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";
import { EVOL_COPY } from "../src/lib/commitments/commitmentCopy";

let bilan: any;
beforeAll(() => {
  // Un élément factice : le Relevé attache ses écouteurs AU CHARGEMENT. Avec `getElementById` qui rend
  // null, le fichier lève avant d'exposer quoi que ce soit — et les 6 tests étaient « skipped », ce qui
  // se lit comme un succès dans une sortie qu'on survole. Un test sauté n'est pas un test vert.
  const el = (): any => ({
    style: {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {},
    addEventListener() {}, removeEventListener() {}, appendChild() {}, querySelector: () => null,
    querySelectorAll: () => [], getAttribute: () => null, setAttribute() {}, removeAttribute() {},
    get innerHTML() { return ""; }, set innerHTML(_v: string) {}, textContent: "", children: [],
    // Le Relevé prend un canvas de travail dès le chargement (la détection de mouvement) : sans
    // `getContext`, le fichier lève avant d'exposer le bilan.
    getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }), width: 0, height: 0,
  });
  const sb: any = {
    window: {},
    document: { getElementById: el, querySelector: el, querySelectorAll: () => [], addEventListener() {}, createElement: el, body: el() },
    navigator: { userAgent: "test", mediaDevices: {} }, console, setTimeout, clearTimeout,
    setInterval, clearInterval, requestAnimationFrame: (f: any) => setTimeout(f, 16), cancelAnimationFrame: clearTimeout,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }), performance: { now: () => Date.now() },
    URL: { createObjectURL: () => "", revokeObjectURL() {} }, crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000000" },
    location: { href: "http://l/app/insightevent/releve", search: "" }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  sb.window.window = sb.window; sb.window.document = sb.document; sb.window.navigator = sb.navigator;
  vm.createContext(sb);
  vm.runInContext(readFileSync("public/js/releve-espace.js", "utf8"), sb, { filename: "releve-espace.js" });
  bilan = sb.window.__releveBilan;
});

const t = (k: string) => (EVOL_COPY as any)[k] || "";
const pb = (reason: string, kept = false) => ({ t: 1, pole: "Cave", reason, kept });

describe("le bilan d'une marche — ce qu'elle a donné, en mots", () => {
  it("les gardées et la durée, au singulier comme au pluriel", () => {
    expect(bilan({ t, gardees: 7, dureeS: 320, problems: [] }).ligne1).toBe("7 photos gardées en 5 min");
    expect(bilan({ t, gardees: 1, dureeS: 40, problems: [] }).ligne1).toBe("1 photo gardée en 1 min");
    // Une marche de 40 s ne s'affiche pas « 0 min » : on arrondit au moins à la minute.
    expect(bilan({ t, gardees: 3, dureeS: 5, problems: [] }).ligne1).toContain("1 min");
  });

  it("les écartées se disent PAR MOTIF — c'est le motif qui se corrige à la marche suivante", () => {
    const b = bilan({ t, gardees: 5, dureeS: 300, problems: [pb("floue"), pb("floue"), pb("sombre")] });
    // Deux floues et une sombre, dans l'ordre alphabétique des motifs — un ordre STABLE, pour qu'une
    // marche à l'autre se compare. (Attendu écrit à l'envers au premier jet : c'est le test qui avait
    // tort, pas le compte.)
    expect(b.ligne2).toBe("3 écartées : 2 trop floue · 1 trop sombre");
    // ET L'ORDRE NE SUIT PAS CELUI DES INCIDENTS : ici « sombre » arrive en premier dans la marche, et
    // sort quand même en second. Sans ce cas, retirer le tri laissait le test vert — l'ordre
    // d'insertion coïncidait avec l'alphabet dans la fixture ci-dessus.
    const inverse = bilan({ t, gardees: 5, dureeS: 300, problems: [pb("sombre"), pb("floue"), pb("floue")] });
    expect(inverse.ligne2).toBe("3 écartées : 2 trop floue · 1 trop sombre");
  });

  it("une seule écartée : le singulier, jamais « 1 écartées »", () => {
    expect(bilan({ t, gardees: 5, dureeS: 300, problems: [pb("sombre")] }).ligne2).toBe("1 écartée : 1 trop sombre");
  });

  it("aucune écartée se DIT — une ligne vide laisserait croire que le compte manque", () => {
    expect(bilan({ t, gardees: 5, dureeS: 300, problems: [] }).ligne2).toBe("Aucune écartée.");
  });

  it("une image GARDÉE malgré son défaut ne compte pas comme écartée", () => {
    // `commit(b, true, reason)` garde la meilleure image d'une fenêtre en signalant son défaut :
    // elle porte `kept: true`. La compter comme écartée ferait mentir le bilan dans les deux sens.
    const b = bilan({ t, gardees: 4, dureeS: 200, problems: [pb("floue", true), pb("sombre")] });
    expect(b.ligne2).toBe("1 écartée : 1 trop sombre");
  });

  it("une marche dont le détail n'a pas été enregistré le DIT, et rassure sur les photos", () => {
    // Mesuré le 15/09 : la table des marches était vide et personne ne le savait — le trou ne se
    // découvrait qu'en interrogeant la base. Il se dit maintenant sur la page de fin.
    const b = bilan({ t, gardees: 3, dureeS: 120, problems: [pb("marche_non_ecrite:HTTP 500")] });
    expect(b.perdue).toBe(true);
    expect(b.perdue_texte).toContain("Vos photos, elles, sont en base.");
    // Et un échec d'enregistrement n'est PAS une photo écartée.
    expect(b.ligne2).toBe("Aucune écartée.");
  });
});
