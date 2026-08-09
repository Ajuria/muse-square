// Lie-bait WEB (étape 5, 08/08) — le rendu « Web — non vérifié » ne peut ship que des liens SÛRS et
// du texte INERTE. Chaque appât planté doit être neutralisé par le renderer réel (public/card-kit.js
// exécuté en vm — lire à la regex dirait ce qui est écrit, pas ce qui est rendu). Fait partie de la
// porte de merge : npx vitest run src/lib/ai/contracts/.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";

let kit: any;

beforeAll(() => {
  const src = readFileSync("public/card-kit.js", "utf8");
  const sandbox: any = {
    console,
    URL,
    window: {},
    document: { createElement: () => ({ style: {} }), addEventListener: () => {} },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  kit = sandbox.window.MSCardKit;
});

const render = (data: any) => kit.renderAnswerBlocks([{ type: "register", register: "vetted" }, { type: "websources", data }]);

describe("websources — lie-bait web (étape 5)", () => {
  it("source https → lien cliquable, libellé hostname, rel=noopener", () => {
    const html = render({ takeaway: "Défilé militaire.", sources: ["https://www.defense.gouv.fr/x"] });
    expect(html).toContain('href="https://www.defense.gouv.fr/x"');
    expect(html).toContain(">defense.gouv.fr</a>");
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("APPÂT : source http:// (non chiffrée) → AUCUN lien", () => {
    const html = render({ takeaway: "T.", sources: ["http://evil.example/x"] });
    expect(html).not.toContain("<a ");
  });

  it("APPÂT : source javascript: → AUCUN lien", () => {
    const html = render({ takeaway: "T.", sources: ["javascript:alert(1)"] });
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("javascript:");
  });

  it("APPÂT : XSS dans takeaway et facteurs → texte inerte, zéro élément actif", () => {
    const html = render({
      takeaway: '<img src=x onerror=alert(1)> concert',
      key_factors: ['<script>alert(2)</script> marché nocturne'],
      sources: [],
    });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("concert");
    expect(html).toContain("marché nocturne");
  });

  it("données vides → RIEN (jamais une boîte vide)", () => {
    const html = kit.renderAnswerBlocks([{ type: "websources", data: { takeaway: null, key_factors: [], sources: ["https://a.fr"] } }]);
    expect(html).not.toContain("Web — non vérifié");
  });

  it("la boîte porte son registre ambre et ne fabrique jamais une pilule Vérifié", () => {
    const html = kit.renderAnswerBlocks([{ type: "websources", data: { takeaway: "T.", sources: [] }, asserts_nothing: true }]);
    expect(html).toContain("Web — non vérifié");
    expect(html).not.toContain(">Vérifié<");
  });
});
