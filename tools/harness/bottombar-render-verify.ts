// Harnais de la barre basse mobile (PiloterBottomBar.astro rendue par BaseLayout, 07/09) :
// rendu RÉEL du composant par le container Astro, sur les chemins de l'app et les deux rôles.
// Mutations vues tomber le 07/09 : Explorer montré au membre → rouge ; evenement retiré de
// Piloter → rouge. Usage : npm run harness:bottombar
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { expect, test } from "vitest";
import Bar from "../../src/components/PiloterBottomBar.astro";

async function render(path: string, role: string | null) {
  const c = await AstroContainer.create();
  return c.renderToString(Bar, { request: new Request("http://l" + path), locals: { role }, props: {} });
}
const activeOf = (html: string) => (html.match(/<a class="ms-bb-item is-active" href="[^"]+" aria-label="([^"]+)"/) || [])[1];

test("l'onglet actif suit les règles de Nav.astro (Piloter = tableau/evenement · Explorer = prompt · Agir = le reste · Compte = aucun)", async () => {
  const cases: Array<[string, string]> = [
    ["/app/insightevent/tableau", "Piloter"], ["/app/insightevent/evenement?id=x", "Piloter"],
    ["/app/insightevent/pulse", "Agir"], ["/app/insightevent/insight?type=x", "Agir"], ["/app/insightevent/dispositif?id=y", "Agir"],
    ["/app/insightevent/prompt", "Explorer"],
  ];
  for (const [p, label] of cases) expect(activeOf(await render(p, "owner")), p).toBe(label);
  for (const p of ["/profile?tab=profil", "/app/insightevent/suivis"]) expect(await render(p, "owner"), p).not.toContain("is-active");
});

test("un membre n'a pas l'onglet Explorer (hors périmètre) ; le gérant a les trois", async () => {
  const member = await render("/app/insightevent/pulse", "member");
  const owner = await render("/app/insightevent/pulse", "owner");
  expect(member).not.toContain('aria-label="Explorer"');
  expect(member).toContain('aria-label="Piloter"'); expect(member).toContain('aria-label="Agir"');
  expect(owner).toContain('aria-label="Explorer"');
});

test("le script clavier est embarqué (focusin cache, focusout rend, visualViewport)", async () => {
  const html = await render("/app/insightevent/pulse", "owner");
  for (const s of ['addEventListener("focusin"', 'addEventListener("focusout"', "visualViewport", "ms-bb-hidden"]) expect(html).toContain(s);
});
