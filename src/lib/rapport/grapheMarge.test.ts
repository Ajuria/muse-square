// La marge brute par famille, en barres (owner 14/09, après mesure : 3 sections sur 14 portaient un
// graphique, la marge en avait la matière et pas le dessin). Ce qui se garde : les valeurs sont DESSINÉES,
// jamais recalculées ; sous deux familles rien ne part (une barre seule ne compare rien) ; une marge
// négative ne se dessine pas sur une échelle qui part de zéro.
import { describe, expect, it } from "vitest";
import { grapheMargeParFamille } from "./composer";

const nb = (x: string): string => x.replace(/[\u202f\u00a0]/g, " ");

const fam = (family: string, gross_margin_ht: number | null, margin_share_pct?: number) =>
  ({ family, gross_margin_ht, ...(margin_share_pct != null ? { margin_share_pct } : {}) });

describe("grapheMargeParFamille", () => {
  it("dessine les familles de la plus forte marge à la plus faible, avec leur part", () => {
    const g = grapheMargeParFamille({ families: [fam("Tea", 3369, 27.9), fam("Coffee", 4753, 39.4), fam("Bakery", 1202, 10)] })!;
    expect(g.type).toBe("barres_h");
    expect((g as any).items.map((i: any) => i.label)).toEqual(["Coffee", "Tea", "Bakery"]);
    expect({ ...(g as any).items[0], value_fr: nb((g as any).items[0].value_fr) })
      .toEqual({ label: "Coffee", value: 4753, value_fr: "4 753 €", part_fr: "39,4 %" });
  });

  it("la valeur dessinée est celle LUE — aucun arrondi ni recalcul de notre côté", () => {
    const g = grapheMargeParFamille({ families: [fam("Tea", 3369), fam("Coffee", 4753)] })!;
    expect((g as any).items.map((i: any) => i.value)).toEqual([4753, 3369]);
  });

  it("SOUS DEUX FAMILLES, aucun graphique — une barre seule ne compare rien", () => {
    expect(grapheMargeParFamille({ families: [fam("Coffee", 4753)] })).toBeNull();
    expect(grapheMargeParFamille({ families: [] })).toBeNull();
    expect(grapheMargeParFamille(null)).toBeNull();
  });

  it("une marge NÉGATIVE ou absente ne se dessine pas — l'échelle part de zéro", () => {
    const g = grapheMargeParFamille({ families: [fam("Coffee", 4753), fam("Perte", -200), fam("Tea", 3369), fam("Inconnue", null)] })!;
    expect((g as any).items.map((i: any) => i.label)).toEqual(["Coffee", "Tea"]);
  });

  it("une seule famille positive parmi des négatives : rien ne part", () => {
    expect(grapheMargeParFamille({ families: [fam("Coffee", 4753), fam("Perte", -200)] })).toBeNull();
  });

  it("PLAFONNÉ : au-delà de huit familles, les huit plus fortes — un graphique à trente barres ne se lit pas", () => {
    const l = Array.from({ length: 20 }, (_, i) => fam("F" + i, 100 + i));
    expect((grapheMargeParFamille({ families: l }) as any).items).toHaveLength(8);
    expect((grapheMargeParFamille({ families: l }) as any).items[0].label).toBe("F19");
  });

  it("la part est OMISE quand elle n'est pas connue — jamais un pourcentage inventé", () => {
    const g = grapheMargeParFamille({ families: [fam("Coffee", 4753), fam("Tea", 3369)] })!;
    expect((g as any).items[0].part_fr).toBeUndefined();
  });

  it("l'unité nomme la fenêtre — une barre sans référentiel ne dit rien", () => {
    expect((grapheMargeParFamille({ families: [fam("A", 2), fam("B", 1)] }) as any).unite).toBe("marge brute sur 30 jours");
  });
});
