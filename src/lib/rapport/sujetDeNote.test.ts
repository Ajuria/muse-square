// Le sujet sous lequel une note de Rapport entre dans la mémoire du site (owner 14/09). Ce qui se garde :
// il porte la SECTION ET la période (la mémoire ne garde que la dernière ligne par sujet — trop large, une
// note efface l'autre ; trop étroit, deux notes du même mois ne se retrouvent pas ensemble), et sans
// section nommée il n'y a pas de sujet : on n'en invente pas un.
import { describe, expect, it } from "vitest";
import { sujetDeNote } from "./gestes";

describe("sujetDeNote", () => {
  it("porte la section ET la période", () => {
    expect(sujetDeNote("Chiffre d'affaires", "le mois dernier, du 01/08/2026 au 31/08/2026"))
      .toBe("Chiffre d'affaires — le mois dernier, du 01/08/2026 au 31/08/2026");
  });

  it("deux sections différentes sur la même période ne se confondent pas", () => {
    const a = sujetDeNote("Chiffre d'affaires", "août 2026");
    const b = sujetDeNote("Marge brute", "août 2026");
    expect(a).not.toBe(b);
  });

  it("la même section sur deux périodes ne se confond pas non plus", () => {
    expect(sujetDeNote("Chiffre d'affaires", "août 2026")).not.toBe(sujetDeNote("Chiffre d'affaires", "juillet 2026"));
  });

  it("sans période, la section seule suffit — jamais un tiret orphelin", () => {
    expect(sujetDeNote("Chiffre d'affaires", "")).toBe("Chiffre d'affaires");
    expect(sujetDeNote("Chiffre d'affaires", null)).toBe("Chiffre d'affaires");
  });

  it("sans section nommée : AUCUN sujet — on n'en invente pas", () => {
    expect(sujetDeNote("", "août 2026")).toBeNull();
    expect(sujetDeNote(null, "août 2026")).toBeNull();
    expect(sujetDeNote("   ", "août 2026")).toBeNull();
  });

  it("les espaces multiples et les retours à la ligne sont aplatis", () => {
    expect(sujetDeNote("  Chiffre   d'affaires \n", " août  2026 ")).toBe("Chiffre d'affaires — août 2026");
  });
});
