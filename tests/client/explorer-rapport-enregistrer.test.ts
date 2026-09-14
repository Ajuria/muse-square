// @vitest-environment happy-dom
// Suite CLIENT — 13/09 (owner : « rien n'est visible », puis « fixe le clic lui-même ») : LE CHEMIN du
// Rapport composé dans le chat vers le DOCUMENT, là où vivent les gestes. Le VRAI ie-prompt.js et le VRAI
// card-kit.js sont exécutés dans happy-dom ; seul le réseau est stubbé. On vérifie ce que le clic FAIT :
// l'écriture sur /api/explorer/rapports (la route de la page Rapports) puis l'ouverture du document.
import { it, expect, beforeAll } from "vitest";
import { bootOnce } from "./explorerTestKit";

const RAPPORT = {
  type: "rapport", titre: "Rapport de ventes — du 01/08/2026 au 31/08/2026",
  periode_fr: "du 01/08/2026 au 31/08/2026", synthese: null,
  sections: [{ cle: "volume", titre: "Nombre de ventes", definition: null, blocs: [{ type: "facts", items: ["Vous avez réalisé 6 249 ventes."] }], provenance: { outil: "lire_ventes", params: {} } }],
};
const posts: Array<{ url: string; body: any }> = [];
let allee = "";

beforeAll(async () => {
  await bootOnce([]);
  // Le réseau : on garde le stub du kit et on intercepte la route des Rapports.
  const avant = window.fetch as any;
  (window as any).fetch = async (u: any, init?: any) => {
    const url = String(u);
    if (url.includes("/api/explorer/rapports")) {
      posts.push({ url, body: JSON.parse(String(init?.body || "{}")) });
      return { ok: true, json: async () => ({ ok: true, document_id: "doc-42", version: 1 }) } as any;
    }
    return avant(u, init);
  };
  // L'ouverture : happy-dom naviguerait pour de vrai — on capte l'adresse demandée.
  delete (window as any).location;
  (window as any).location = { href: "", assign: (h: string) => { allee = h; } };
  Object.defineProperty(window.location, "href", { set: (h: string) => { allee = h; }, get: () => allee, configurable: true });
});

it("le CTA « Enregistrer → » du chat écrit le Rapport sur la route des documents, puis ouvre le document", async () => {
  const blocks = (window as any).__ieBlocksFromResponse({ ai: { output: { blocks: [RAPPORT, { type: "cta", action: "ouvrir_rapport", label: "Enregistrer →" }] } } });
  expect(blocks.some((b: any) => b.type === "rapport")).toBe(true);

  const hote = document.createElement("div");
  hote.className = "ie-msg-ai";
  hote.innerHTML = (window as any).MSCardKit.renderAnswerBlocks(blocks);
  document.body.appendChild(hote);

  const btn = hote.querySelector('[data-ab-cta-action="ouvrir_rapport"]') as HTMLButtonElement;
  expect(btn, "le bouton est rendu par le kit").toBeTruthy();
  expect(btn.textContent).toContain("Enregistrer");

  btn.click();
  await new Promise((r) => setTimeout(r, 50));

  expect(posts.length, "une écriture, une seule").toBe(1);
  expect(posts[0].url).toContain("/api/explorer/rapports");
  expect(posts[0].body.rapport.titre).toBe(RAPPORT.titre);        // le Rapport de CETTE réponse, pas un autre
  expect(posts[0].body.location_id).toBeTruthy();
  expect(allee, "le document créé s'ouvre").toBe("/app/insightevent/rapports?location_id=" + encodeURIComponent(posts[0].body.location_id) + "&document_id=doc-42");
});

it("une réponse SANS rapport ne laisse rien derrière elle : le clic suivant n'écrit pas un rapport périmé", async () => {
  const n = posts.length;
  (window as any).__ieBlocksFromResponse({ ai: { output: { blocks: [{ type: "prose", md: "Une réponse sans Rapport." }] } } });
  const orphelin = document.createElement("button");
  orphelin.setAttribute("data-ab-cta-action", "ouvrir_rapport");
  document.body.appendChild(orphelin);
  orphelin.click();
  await new Promise((r) => setTimeout(r, 30));
  expect(posts.length).toBe(n);
});
