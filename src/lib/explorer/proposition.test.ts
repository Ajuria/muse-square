import { describe, expect, it } from "vitest";
import { composerProposition, datesFr, pourquoiRetenu } from "./proposition";
import { EVENT_TYPES_ALL } from "../events/eventTypes";

const ctx = (faits: string[]) => ({ location_id: "loc-1", today: "2026-09-12", familles_site: ["Épices", "Thés"], types: EVENT_TYPES_ALL, faits_du_tour: faits });
const FAIT = "Épices génère 462 € par jour sur les 26 jours du 12/08/2026 au 10/09/2026.";

describe("proposition — le « pourquoi » n'est fait que de faits du tour", () => {
  it("garde une phrase dont chaque nombre est dans les faits, écarte celle qui invente, garde une phrase sans nombre seulement si elle reprend un fait", () => {
    const r = pourquoiRetenu([FAIT, "Épices génère 462 € par jour.", "Épices génère 900 € par jour.", "Aucune action issue de vos signaux.", "Les épices se vendent bien."], [FAIT, "Aucune action issue de vos signaux."]);
    expect(r.retenues).toEqual([FAIT, "Épices génère 462 € par jour.", "Aucune action issue de vos signaux."]);
    expect(r.ecartees).toEqual(["Épices génère 900 € par jour.", "Les épices se vendent bien."]);
  });
  it("dates en français", () => {
    expect(datesFr(["2026-09-19"])).toBe("le 19/09/2026");
    expect(datesFr(["2026-09-19", "2026-09-20", "2026-09-26"])).toBe("les 19/09/2026, 20/09/2026 et 26/09/2026");
  });
});

describe("proposition — composerProposition : les refus et le bloc", () => {
  it("sans famille : CA du jour en %, cible 15 par défaut ; type par défaut « autre »", () => {
    const r = composerProposition({ titre: "Samedi gourmand", dispositif: "Une table de dégustation à l'entrée", dates: ["2026-09-19"], pourquoi: [FAIT] }, ctx([FAIT]));
    expect("erreur" in r).toBe(false);
    if ("erreur" in r) return;
    expect(r.block).toMatchObject({ event_type: { value: "autre", label_fr: "Autre" }, familles: [], objectif: { kpi: "revenue_residual", libelle_fr: "CA du jour vs votre résultat habituel" }, cible: { valeur: 15, unite: "%", libelle_fr: "+15 % vs votre résultat habituel" }, dates_fr: "le 19/09/2026", pourquoi: [FAIT] });
    expect(r.block.url).toContain("kpi=revenue_residual&cible=15");
    expect(r.block.url).not.toContain("familles=");
  });
  it("refus : nom vide, dispositif vide, type inconnu, objectif famille sans famille, cible nulle, trop de dates, date mal formée, aucun fait", () => {
    const base = { titre: "x", dispositif: "y", dates: ["2026-09-19"], pourquoi: [FAIT] };
    const c = ctx([FAIT]);
    expect(composerProposition({ ...base, titre: "" }, c)).toEqual({ erreur: "Le nom de l'opération est requis." });
    expect(composerProposition({ ...base, dispositif: " " }, c)).toEqual({ erreur: "Le dispositif est requis : ce que l'exploitant va faire, en une phrase." });
    expect((composerProposition({ ...base, type: "carnaval" }, c) as any).erreur).toMatch(/^Type d'opération inconnu « carnaval »/);
    expect(composerProposition({ ...base, objectif: "family_revenue" }, c)).toEqual({ erreur: "L'objectif « CA de ce que le dispositif vend » demande au moins une famille." });
    expect(composerProposition({ ...base, cible: 0 }, c)).toEqual({ erreur: "La cible est un pourcentage positif au-dessus du résultat habituel." });
    expect(composerProposition({ ...base, familles: ["Épices"], cible: undefined }, c)).toEqual({ erreur: "La cible est un montant en euros (le CA visé des familles sur la journée), positif." });
    expect(composerProposition({ ...base, dates: ["2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"] }, c)).toEqual({ erreur: "7 dates au plus (la limite du formulaire)." });
    expect(composerProposition({ ...base, dates: ["19/09/2026"] }, c)).toEqual({ erreur: "Date invalide « 19/09/2026 » : AAAA-MM-JJ." });
    expect((composerProposition(base, ctx([])) as any).erreur).toMatch(/^Aucun fait lu ne motive cette proposition \(1 phrase\(s\) écartée\(s\)/);
  });
});
