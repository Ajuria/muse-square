// Ce que l'exploitant a noté, mis sous les yeux du modèle à chaque tour (owner 14/09). Ce qui se garde :
// le bloc DIT que ce n'est pas une mesure (sinon le modèle citera une note comme un fait vérifié), il est
// borné (le contexte ne grossit pas indéfiniment), il nomme la provenance, et sans mémoire il n'existe pas.
import { describe, expect, it } from "vitest";
import { blocMemoires } from "./siteMemory";

const m = (subject: string, body: string, source: any = "note_rapport", created_at = "2026-08-31T10:00:00Z") =>
  ({ memory_id: "m", location_id: "l", subject, body, author_user_id: "u", author_role: "owner", source, created_at }) as any;

describe("blocMemoires", () => {
  it("dit au modèle que ce n'est PAS une mesure, et qu'il doit attribuer", () => {
    const b = blocMemoires([m("Chiffre d'affaires — août 2026", "On a fermé le lundi tout le mois.")])!;
    expect(b).toContain("Ce n'est PAS une mesure");
    expect(b).toContain("vous aviez noté que");
    expect(b).toContain("N'invente jamais une note qui n'est pas dans cette liste.");
  });

  it("chaque ligne porte le sujet, la date en français, la provenance et le corps", () => {
    const b = blocMemoires([m("Chiffre d'affaires — août 2026", "On a fermé le lundi tout le mois.")])!;
    expect(b).toContain("- Chiffre d'affaires — août 2026 (31/08/2026, note sur un Rapport) : On a fermé le lundi tout le mois.");
  });

  it("la provenance est NOMMÉE et distingue les trois sources", () => {
    const b = blocMemoires([m("a", "x", "note_rapport"), m("b", "y", "conversation"), m("c", "z", "outil")])!;
    expect(b).toContain("note sur un Rapport");
    expect(b).toContain("dit en conversation");
    expect(b).toContain("relevé d'un outil");
  });

  it("BORNÉ : au-delà du plafond, les plus récentes seulement — le contexte ne grossit pas sans fin", () => {
    const l = Array.from({ length: 50 }, (_, i) => m("sujet " + i, "corps " + i));
    const b = blocMemoires(l, 20)!;
    expect((b.match(/^- /gm) || []).length).toBe(20);
    expect(b).toContain("sujet 0");
    expect(b).not.toContain("sujet 49");
  });

  it("un corps trop long est COUPÉ, jamais rendu entier", () => {
    const b = blocMemoires([m("s", "x".repeat(1000))], 20, 400)!;
    expect(b).toContain("…");
    expect(b.length).toBeLessThan(900);
  });

  it("aucune mémoire : AUCUN bloc — on n'ajoute pas un en-tête vide au contexte", () => {
    expect(blocMemoires([])).toBeNull();
    expect(blocMemoires([m("", "x")])).toBeNull();
    expect(blocMemoires([m("s", "")])).toBeNull();
  });
});
