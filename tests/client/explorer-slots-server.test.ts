// @vitest-environment happy-dom
// Le guichet de la mémoire côté CLIENT (owner 07/09, docs/explorer-etat-vide-spec.md) : les cartes
// serveur d'abord, la question mesurée en dernier, trois au plus, jamais trois de la même nature ;
// une carte de la mémoire porte sa ligne CTA et OUVRE SON RAIL au clic (href), elle ne pré-remplit pas
// le chat. Un seul boot par fichier (explorerTestKit) ; état A (anomalie du 07/08) + 3 cartes serveur.
import { describe, it, expect, beforeAll } from "vitest";
import { SLOTS, ACTION_LOG, bootOnce, slotCards } from "./explorerTestKit";

const card = (id: string, nature: "memoire" | "decision", text: string) => ({
  nature, kind: "bilan", key: "explorer_slot_" + id, date: "2026-08-0" + id.length, text, sub: "Votre bilan ajoute ce que la mesure ne voit pas — 2 minutes.", cta: "Bilan →",
  href: "/app/insightevent/engagement?id=" + id,
});

beforeAll(async () => {
  // Trois cartes de la MÊME nature : la troisième doit céder (jamais trois de même nature), et
  // l'anomalie prend la dernière place — deux serveur + une question.
  SLOTS.cards = [card("a", "memoire", "A : objectif manqué, −394 € sur 1 jour"), card("bb", "memoire", "B : objectif atteint, +904 € sur 7 jours"), card("ccc", "memoire", "C : objectif manqué, −10 € sur 1 jour")];
  await bootOnce([
    { date: "2026-08-07", daily_revenue: 1169, revenue_robust_z: -2.4, revenue_vs_30d_avg_pct: -24, alert_level_max: 0 },
    { date: "2026-08-08", daily_revenue: null, revenue_robust_z: null, alert_level_max: 3, temperature_2m_max: 34 },
  ]);
});

describe("fusion serveur + question mesurée", () => {
  it("deux cartes serveur puis l'anomalie ; la troisième carte de même nature cède", () => {
    const cards = slotCards();
    expect(cards.length).toBe(3);
    expect(cards.map((c) => c.getAttribute("data-nature"))).toEqual(["memoire", "memoire", "question"]);
    expect(cards[0].textContent).toContain("A : objectif manqué, −394 € sur 1 jour");
    expect(cards[1].textContent).toContain("B : objectif atteint");
    expect(cards[2].getAttribute("data-dynamic-q")).toBe("Pourquoi le 07/08 ?");
  });
  it("une carte de la mémoire porte sa ligne CTA et son rail", () => {
    const a = slotCards()[0];
    expect(a.textContent).toContain("Bilan →");
    expect(a.getAttribute("data-dynamic-href")).toBe("/app/insightevent/engagement?id=a");
    expect(a.getAttribute("href")).toBe("/app/insightevent/engagement?id=a");
    expect(a.getAttribute("data-dynamic-q")).toBeNull();
  });
  it("le clic sur une carte de la mémoire écrit la marque « consulté » puis ouvre le rail — jamais le chat", () => {
    const a = slotCards()[0] as HTMLElement;
    const before = ACTION_LOG.posts.length;
    a.click();
    const post = ACTION_LOG.posts.slice(before).find((p) => p && p.change_subtype === "explorer_slot_a");
    expect(post).toBeTruthy();
    expect(post.event).toBe("explorer_consulted");
    expect((document.getElementById("ie-prompt-input") as HTMLTextAreaElement).value).toBe("");
  });
  it("le label ACTIONS reste visible quand il y a des cartes", () => {
    expect(document.getElementById("ie-prompt-actions-label")!.style.display).not.toBe("none");
  });
});
