// Le sujet vit dans public/js — d'où tests/ (règle de placement du dépôt).
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";

let MSVolet: any;
beforeAll(() => {
  const src = readFileSync(new URL("../public/js/volet-ligne.js", import.meta.url), "utf8");
  const win: any = { addEventListener() {} };
  new Function("window", "document", src)(win, { body: null });
  MSVolet = win.MSVolet;
});

describe("finDeRangee — où le volet se pose", () => {
  it("grille de 3 : toute la première rangée finit sur la tuile 2", () => {
    // Les 7 pôles de l'owner, en 3 colonnes : toucher la Caisse (0), la Cave (1) ou la Cuisine (2)
    // pose le volet au même endroit — après la Cuisine. C'est ça, « sous sa rangée ».
    expect(MSVolet.finDeRangee(0, 3, 7)).toBe(2);
    expect(MSVolet.finDeRangee(1, 3, 7)).toBe(2);
    expect(MSVolet.finDeRangee(2, 3, 7)).toBe(2);
  });
  it("grille de 3 : la deuxième rangée finit sur la tuile 5", () => {
    expect(MSVolet.finDeRangee(3, 3, 7)).toBe(5);
    expect(MSVolet.finDeRangee(5, 3, 7)).toBe(5);
  });
  it("la dernière rangée INCOMPLÈTE s'arrête à la dernière tuile, jamais au-delà", () => {
    // 7 pôles en 3 colonnes : la 3ᵉ rangée n'a qu'une tuile. Sans plafond, on viserait l'index 8.
    expect(MSVolet.finDeRangee(6, 3, 7)).toBe(6);
  });
  it("grille de 2 (le téléphone de l'owner, sous 640 px) : les rangées changent", () => {
    expect(MSVolet.finDeRangee(0, 2, 7)).toBe(1);
    expect(MSVolet.finDeRangee(2, 2, 7)).toBe(3);
    expect(MSVolet.finDeRangee(6, 2, 7)).toBe(6);
  });
  it("une colonne (une liste) : le volet se pose juste sous sa ligne", () => {
    expect(MSVolet.finDeRangee(0, 1, 4)).toBe(0);
    expect(MSVolet.finDeRangee(3, 1, 4)).toBe(3);
  });
  it("aucune tuile : rien où se poser", () => {
    expect(MSVolet.finDeRangee(0, 3, 0)).toBe(-1);
  });
  it("des entrées absurdes ne sortent jamais de la grille", () => {
    expect(MSVolet.finDeRangee(99, 3, 7)).toBe(6);
    expect(MSVolet.finDeRangee(-5, 3, 7)).toBe(2);
    expect(MSVolet.finDeRangee(1, 0, 7)).toBe(1);
    expect(MSVolet.finDeRangee(1, NaN as any, 7)).toBe(1);
  });
});

describe("colonnes — les pistes que le navigateur a calculées", () => {
  const faux = (v: string) => ({ nodeType: 1, __v: v });
  const avec = (v: string) => {
    const win: any = { addEventListener() {}, getComputedStyle: () => ({ gridTemplateColumns: v }) };
    const src = readFileSync(new URL("../public/js/volet-ligne.js", import.meta.url), "utf8");
    new Function("window", "document", src)(win, { body: null });
    return win.MSVolet.colonnes(faux(v));
  };
  it("compte les pistes réellement calculées", () => {
    expect(avec("220px 220px 220px")).toBe(3);
    expect(avec("180.5px 180.5px")).toBe(2);
  });
  it("« none » (pas une grille) vaut une colonne", () => {
    expect(avec("none")).toBe(1);
    expect(avec("")).toBe(1);
  });
});
