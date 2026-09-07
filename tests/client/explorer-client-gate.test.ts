// @vitest-environment happy-dom
// I0 + I3 (spec docs/explorer-routage-inversion-spec.md § 3.8) — LA PORTE CLIENT, mesurée sur le
// VRAI ie-prompt.js. Avant I3, `isQuestion` détournait vers la recherche concurrents toute saisie
// courte sans « ? » (audit 03/09 : 7 des 10 dialogues de la batterie). Depuis I3 (owner 04/09) : la
// recherche concurrents ne prend que les QUESTIONS SUR LES CONCURRENTS, aux mots de l'owner
// (compétiteurs, concurrents, adversaires, rivaux, « menace mon activité ») ; tout le reste part
// à /api/insight/prompt. Un seul boot par fichier (explorerTestKit).

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { stubDom, stubFetch } from "./explorerTestKit";

const PROMPT_CALLS: string[] = [];
const CONC_CALLS: string[] = [];

beforeAll(async () => {
  stubDom();
  document.body.insertAdjacentHTML("beforeend", '<button id="ie-prompt-submit-btn">Envoyer</button><button class="ie-mode-btn active" data-mode="planning"></button>');
  stubFetch([]);
  // prompt.astro pose ces deux fonctions ; SANS elles la porte ne s'arme pas (typeof === 'function').
  (window as any).__ieSetMode = () => {};
  (window as any).__ieRunConcSearch = () => { CONC_CALLS.push((document.getElementById("ie-prompt-input") as HTMLTextAreaElement).value); };
  const baseFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = (url: any, init?: any) => {
    if (String(url).includes("/api/insight/prompt")) {
      try { PROMPT_CALLS.push(JSON.parse(String(init?.body)).q); } catch { PROMPT_CALLS.push("?"); }
      return Promise.resolve({ ok: true, headers: { get: () => "application/json" }, json: () => Promise.resolve({ ok: true, ai: { output: { headline: "x", answer: "x" } } }) });
    }
    return baseFetch(url, init);
  };
  (0, eval)(readFileSync("public/js/card-kit.js", "utf8"));
  (0, eval)(readFileSync("public/js/ie-prompt.js", "utf8"));
  await new Promise((r) => setTimeout(r, 100));
});

// Tape la ligne dans la zone de saisie et clique Envoyer — le geste réel, pas submitQuestion().
async function taper(q: string): Promise<"prompt" | "concurrence" | "rien"> {
  const p0 = PROMPT_CALLS.length, c0 = CONC_CALLS.length;
  (document.getElementById("ie-prompt-input") as HTMLTextAreaElement).value = q;
  (document.getElementById("ie-prompt-submit-btn") as HTMLElement).click();
  await new Promise((r) => setTimeout(r, 30));
  if (PROMPT_CALLS.length > p0) return "prompt";
  if (CONC_CALLS.length > c0) return "concurrence";
  return "rien";
}

// Vers l'endpoint : ouvertures de la batterie, suites, probes de l'audit — dont les 15 lignes que
// l'ancienne porte détournait (elles étaient en `it.fails` jusqu'à I3).
const VERS_PROMPT = [
  "planifie-moi septembre", "le CA de la famille Coffee cet été", "mes engagements", "le pôle charcuterie en août",
  "la famille Coffee vs la famille Tea en juillet", "la famille Coffee en juillet par rapport à juin", "la famille Coffee en juillet",
  "mon panier moyen en juillet", "et si je faisais une dégustation gratuite les jours de pluie ?",
  "et octobre ?", "non, plutôt juillet seulement", "pourquoi ?",
  "qui est Jésus ?", "bonjour", "merci", "mon panié moyen en juilet", "planifi moi septembr", "le CA de la famile Cofee cet ete",
  "mes engagemant", "ça va mes ventes ?", "top 3 produits août", "what were my sales in July?",
  // Un nom seul n'est plus une recherche : il part à l'endpoint (hors périmètre, I1).
  "Jésus",
  // « la concurrence » est une DIMENSION (chemin jour/famille du serveur), pas la recherche.
  "la concurrence a-t-elle pesé sur mon mois ?",
  "quel est l'impact du dispositif Corner de vente producteur sur le volume de transactions de la famille Coffee, le panier moyen ou le mix produits ?",
];

// Vers la recherche concurrents : les 8 saisies de l'owner (04/09), telles que tapées.
const VERS_RECHERCHE = [
  "qui sont mes compétiteurs?", "qui sont mes concurrents", "cherche adversaires et rivaux", "quels sont mes compétiteurs",
  "compétiteurs", "concurrents", "qui menace mon activité", "cherche compétiteurs",
  // Variantes de frappe : sans accent, majuscules.
  "Qui sont mes competiteurs ?", "CONCURRENTS",
];

describe("porte client (I3) — les questions métier atteignent /api/insight/prompt", () => {
  for (const q of VERS_PROMPT) it(`« ${q} »`, async () => { expect(await taper(q), `« ${q} »`).toBe("prompt"); });
});
describe("porte client (I3) — les questions sur les concurrents ouvrent la recherche", () => {
  for (const q of VERS_RECHERCHE) it(`« ${q} »`, async () => { expect(await taper(q), `« ${q} »`).toBe("concurrence"); });
});

// Mode CONCURRENCE (même bouton, icône loupe) : le comportement d'avant I3 est conservé — un nom court
// cherche, une question part à l'endpoint, une question sur les concurrents cherche.
describe("porte client (I3) — mode concurrence inchangé", () => {
  const setMode = (m: string) => { (document.querySelector(".ie-mode-btn") as HTMLElement).dataset.mode = m; };
  it("un nom court cherche ; une question part à l'endpoint ; une question concurrents cherche", async () => {
    setMode("concurrence");
    try {
      expect(await taper("GL Events")).toBe("concurrence");
      expect(await taper("Pourquoi le 28/08 ?")).toBe("prompt");
      expect(await taper("qui sont mes concurrents")).toBe("concurrence");
    } finally { setMode("planning"); }
  });
  it("retour en mode planning : « GL Events » seul part à l'endpoint", async () => {
    expect(await taper("GL Events")).toBe("prompt");
  });
});
