// Porte de merge (07/09) : les six lignes d'action et trois titres des cartes concurrent sans terme,
// réécrits en français courant sur consigne owner (« make changes yourself »), rendus par le kit
// (la porte « fait seul » du 06/09 est levée). Payload minimal aux clés réelles (competitor_name, item,
// old_price_raw, new_price_raw, price_pct_change). Deux gestes dans la ligne → « Actions conseillées » (règle du kit, lexique). Sujet public/js/action-cards.js → tests/ (CLAUDE.md § Tests).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Window } from "happy-dom";

function render(type: string, payload: Record<string, unknown>) {
  const win: any = new Window({ url: "https://app.local/app/insightevent/pulse" });
  const src = readFileSync(resolve("public/js/action-cards.js"), "utf8");
  new Function("window", "document", src)(win, win.document);
  const date = "2026-09-04";
  const row = { date, action_type: type, action_priority: 3, action_category: "competition",
    location_id: "f10c3e58-326e-4e38-947c-d59fcbe51df5", data_payload: payload };
  const out = win.renderActionCandidates([row], {}, null, "2026-09-07", "pulse", null, "2026-09-07") || [];
  expect(out.length).toBe(1);
  return out[0].tmpl as { what: string; sowhat: string; action: string };
}
const BASE = { competitor_name: "Maison Dupont", item: "le thé Earl Grey 100 g", old_price_raw: "8,00 €", new_price_raw: "9,00 €", price_pct_change: 12.5, detected_date: "2026-09-04" };

describe("cartes concurrent — six lignes d'action, trois titres (owner 07/09)", () => {
  it("prix en hausse : titre nommé, geste sur votre prix", () => {
    const t = render("competitor_price_increase", BASE);
    expect(t.what).toBe("Prix en hausse chez Maison Dupont");
    expect(t.action).toBe("Actions conseillées : comparez votre prix de le thé Earl Grey 100 g au sien ; si le vôtre est plus bas, affichez-le.");
  });
  it("prix en baisse : deux semaines de ventes avant de bouger", () => {
    const t = render("competitor_price_drop", { ...BASE, new_price_raw: "7,00 €", price_pct_change: -12.5 });
    expect(t.action).toBe("Actions conseillées : notez votre prix et votre marge sur le thé Earl Grey 100 g, puis regardez vos ventes pendant deux semaines avant de changer quoi que ce soit.");
  });
  it("plusieurs prix modifiés : titre nommé, relevé des écarts", () => {
    const t = render("competitor_repricing_event", { competitor_name: "Maison Dupont", price_change_count: 5, increase_count: 3, decrease_count: 2, detected_date: "2026-09-04" });
    expect(t.what).toBe("Plusieurs prix modifiés chez Maison Dupont");
    expect(t.action).toBe("Actions conseillées : relevez ses nouveaux prix sur les produits que vous vendez aussi et notez les écarts.");
  });
  it("nouvelle offre : l'équivalent chez vous", () => {
    const t = render("competitor_new_offering", { ...BASE, item: "un coffret découverte" });
    expect(t.action).toBe("Action conseillée : si vous vendez un produit équivalent à un coffret découverte, mettez-le en avant cette semaine.");
  });
  it("offre retirée : titre nommé, ses clients cherchent où acheter", () => {
    const t = render("competitor_offering_removed", BASE);
    expect(t.what).toBe("Offre retirée chez Maison Dupont");
    expect(t.action).toBe("Action conseillée : si vous vendez le thé Earl Grey 100 g, mettez-le en avant : ses clients cherchent maintenant où l’acheter.");
  });
  it("horaires modifiés : les heures où vous êtes seul ouvert", () => {
    const t = render("competitor_hours_change", { competitor_name: "Maison Dupont", old_hours: "9h-19h", new_hours: "10h-20h", detected_date: "2026-09-04" });
    expect(t.action).toBe("Actions conseillées : comparez vos horaires aux siens ; indiquez sur votre fiche Google et en vitrine les heures où vous êtes le seul ouvert.");
  });
  it("aucune des anciennes maximes ne revient", () => {
    for (const ty of ["competitor_price_increase", "competitor_price_drop", "competitor_offering_removed", "competitor_repricing_event", "competitor_new_offering"]) {
      const t = render(ty, { ...BASE, price_change_count: 5, increase_count: 3, decrease_count: 2 });
      expect(t.action).not.toMatch(/positionnement tarifaire|par réflexe|Repositionnez|Analysez le mouvement|retrait est durable/);
    }
  });
});
