// @vitest-environment happy-dom
// E3 (owner 07/09, docs/explorer-etat-vide-spec.md § 6.3) : la carte « jour inexpliqué » porte SA saisie —
// « Un souvenir ? Notez-le · sinon, laissez » — et écrit la note (POST /api/insight/day-notes) sans
// quitter la page ; une fois notée, la carte disparaît. Quand une carte serveur porte la date de la
// question mesurée, la question cède (un jour = une carte). Un seul boot par fichier.
import { describe, it, expect, beforeAll } from "vitest";
import { SLOTS, DAY_NOTES, bootOnce, slotCards } from "./explorerTestKit";

beforeAll(async () => {
  SLOTS.cards = [
    { nature: "memoire", kind: "note", key: "explorer_slot_note", date: "2026-08-07", text: "Vendredi 07/08 : 1 169 €, −24 % vs votre CA habituel", sub: "Un souvenir ? Notez-le · sinon, laissez", cta: "Enregistrer", href: "" },
    { nature: "memoire", kind: "bilan", key: "explorer_slot_bilan", date: "2026-08-28", text: "Corner de vente producteur : objectif manqué, −394 € sur 1 jour", sub: "Votre bilan ajoute ce que la mesure ne voit pas — 2 minutes.", cta: "Bilan →", href: "/app/insightevent/engagement?id=0b4018cf" },
  ];
  await bootOnce([
    { date: "2026-08-07", daily_revenue: 1169, revenue_robust_z: -2.4, revenue_vs_30d_avg_pct: -24, alert_level_max: 0 },
  ]);
});

describe("la carte note", () => {
  it("la question mesurée du 07/08 cède à la carte serveur du même jour : deux cartes, aucune question", () => {
    const cards = slotCards();
    expect(cards.map((c) => c.getAttribute("data-nature"))).toEqual(["memoire", "memoire"]);
    expect(cards.some((c) => c.getAttribute("data-dynamic-q"))).toBe(false);
  });
  it("porte le fait du jour, la forme owner, un champ et le bouton « Enregistrer » — aucun rail, aucun chat", () => {
    const note = slotCards()[0] as HTMLElement;
    expect(note.getAttribute("data-kind")).toBe("note");
    expect(note.textContent).toContain("Vendredi 07/08 : 1 169 €");
    expect(note.textContent).toContain("Un souvenir ? Notez-le · sinon, laissez");
    expect(note.querySelector("input[data-note-input]")).toBeTruthy();
    expect(note.querySelector("button[data-note-save]")?.textContent).toBe("Enregistrer");
    expect(note.getAttribute("href")).toBeNull();
  });
  it("« Enregistrer » écrit la note (site × jour × texte) et retire la carte ; le champ vide n'écrit rien", () => {
    const note = slotCards()[0] as HTMLElement;
    const input = note.querySelector("input[data-note-input]") as HTMLInputElement;
    const save = note.querySelector("button[data-note-save]") as HTMLButtonElement;
    save.click();
    expect(DAY_NOTES.posts.length).toBe(0);
    input.value = "Marché annulé, rue barrée";
    save.click();
    expect(DAY_NOTES.posts.length).toBe(1);
    expect(DAY_NOTES.posts[0].date).toBe("2026-08-07");
    expect(DAY_NOTES.posts[0].note_text).toBe("Marché annulé, rue barrée");
    expect(typeof DAY_NOTES.posts[0].location_id).toBe("string");
    return new Promise<void>((r) => setTimeout(r, 50)).then(() => {
      expect(slotCards().length).toBe(1);
      expect(slotCards()[0].getAttribute("data-kind")).toBe("bilan");
      expect(document.getElementById("ie-prompt-actions-label")!.style.display).not.toBe("none");
    });
  });
});
