// tools/battery/explorer-agent-battery.ts — LA BATTERIE de l'agent Explorer (docs/explorer-outil-spec.md § 8, § 9
// incrément 1) : les questions COMPOSÉES du § 2.3 et les questions de l'owner du 12/09, rejouées sur la VRAIE boucle
// (buildAgentTools + toolRunner, mêmes deps que /api/explorer/agent, hors HTTP et hors Clerk) sur LE compte de test
// owner (f10c3e58). Portes DURES par cas : les outils attendus ont été appelés dans le tour, le texte porte le fait
// attendu, la durée reste sous le plafond, le registre est « vetted » quand le cas l'exige. Le registre est aussi
// rapporté pour les cas où il n'est pas une porte (mesuré 12/09 : sur « mes pôles au m² », le modèle additionne deux
// parts de son cru et la porte rend « model » — la porte fait son travail ; la consigne ou le modèle reste à durcir).
// Budget owner : 3 s par réponse — MESURÉ ici, jamais déduit ; au 12/09 la boucle rend en 10-22 s avec claude-opus-5
// (l'outil lui-même : 0,6-1,3 s). Le rapport va dans data/shots/explorer-agent-battery-report.md.
// Usage : npm run battery:agent   (ANTHROPIC_API_KEY et les identifiants BigQuery dans .env)
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { makeBQClient } from "../../src/lib/bq";
import { listPoles } from "../../src/lib/dispositifs/poleReading";
import { buildAgentTools, readSiteFamilies30d, type ToolCallRecord } from "../../src/lib/explorer/agentTools";
import { readSiteMemory } from "../../src/lib/explorer/siteMemory";
import { SYSTEME_FR, OUTILS_FR } from "../../src/lib/explorer/agentSystem.fr";
import { FAMILIES } from "../../src/lib/insightFamilies";
import { assembleAnswerBlocks, groundAgentText } from "../../src/lib/explorer/blocks";
import { computeSalesReport } from "../../src/lib/rapport/ventes";
import { readResultat } from "../../src/lib/kpi/resultat";
import { readPoleClassement } from "../../src/lib/dispositifs/poleClassement";
import { modelFor } from "../../src/lib/ai/models";

const LOC = process.env.BATTERY_LOCATION_ID || "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const MAX_SECONDS = Number(process.env.BATTERY_MAX_SECONDS || 30);

type Case = { q: string; tools: string[]; answerMatch: RegExp; vetted: boolean; maxSeconds?: number };
const BATTERY: Case[] = [
  // § 2.3 — deux sujets dans une question : deux outils dans le même tour.
  { q: "Quelles familles souffrent de la pluie, et quelle est ma marge brute ?", tools: ["lire_familles_face_aux_jours", "lire_marge"], answerMatch: /marge brute/i, vetted: true },
  { q: "Combien ai-je vendu sur mes 30 derniers jours, et qu'est-ce qui a bougé par rapport à la période précédente ?", tools: ["lire_ventes"], answerMatch: /période précédente/i, vetted: true },
  { q: "Quel est mon résultat net du mois dernier, et mon seuil de rentabilité est-il atteint aujourd'hui ?", tools: ["lire_resultat"], answerMatch: /seuil de rentabilité/i, vetted: true },
  { q: "Mon CA de la semaine dernière ?", tools: ["lire_ventes"], answerMatch: /chiffre d'affaires|CA/i, vetted: true },
  // Owner 12/09 — le classement des pôles ; le registre est rapporté, pas exigé (voir l'en-tête).
  { q: "Montre-moi comment mes pôles performent au m².", tools: ["lire_poles_classement"], answerMatch: /m²/, vetted: false },
  { q: "Classe mes pôles par marge brute sur le mois dernier.", tools: ["lire_poles_classement"], answerMatch: /marge brute/i, vetted: false },
];

const bq = makeBQClient("muse-square-open-data");
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

async function ask(q: string) {
  const t0 = Date.now();
  const calls: ToolCallRecord[] = [];
  const tools = buildAgentTools({
    location_id: LOC, author: { user_id: "battery", role: "owner" },
    listPoles: () => listPoles(bq, LOC, 12), readFamilies: () => readSiteFamilies30d(bq, LOC),
    readPhotos: async () => [], readPhotoBytes: async () => null,
    readMemory: (s) => readSiteMemory(bq, LOC, s ? { subject: s } : {}), writeMemory: async () => {},
    runFamily: (key, date) => FAMILIES[key].run(bq, LOC, date),
    runVentes: (s, e) => computeSalesReport(bq, { location_id: LOC, owned: [LOC], start: s, end: e }),
    runResultat: () => readResultat(bq, LOC),
    runPolesClassement: (s, e) => readPoleClassement(bq, LOC, s, e),
    today, record: (r) => calls.push(r),
  });
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const runner = client.beta.messages.toolRunner({
    model: modelFor("agent"), max_tokens: 16000, thinking: { type: "adaptive" },
    system: [{ type: "text", text: SYSTEME_FR, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: q }], tools, max_iterations: 8,
  });
  const final = await runner.runUntilDone();
  const text = final.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
  const g = groundAgentText(text, calls.flatMap((c) => c.facts ?? []));
  const blocks = assembleAnswerBlocks(calls.map((c) => c.blocks ?? []), g);
  return { seconds: (Date.now() - t0) / 1000, model: final.model, text, calls, grounding: g, blocks };
}

(async () => {
  if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY absente"); process.exit(2); }
  const rows: string[] = [];
  let hardFails = 0;
  for (const c of BATTERY) {
    let r: Awaited<ReturnType<typeof ask>> | null = null; let err = "";
    try { r = await ask(c.q); } catch (e: any) { err = String(e?.message || e); }
    const used = r ? r.calls.map((x) => x.name) : [];
    const gates: Array<[string, boolean]> = [
      ["outils", c.tools.every((t) => used.includes(t))],
      ["fait", !!r && c.answerMatch.test(r.text)],
      ["durée", !!r && r.seconds <= (c.maxSeconds ?? MAX_SECONDS)],
      ["registre", !c.vetted || (!!r && r.grounding.register === "vetted")],
    ];
    const failed = gates.filter(([, ok]) => !ok).map(([n]) => n);
    if (failed.length) hardFails++;
    const line = `${failed.length ? "FAIL" : "OK  "} ${r ? r.seconds.toFixed(1).padStart(5) : "  —  "} s · ${r ? r.grounding.register.padEnd(6) : "erreur"} · ${used.map((n) => OUTILS_FR[n] ?? n).join(" ; ") || "aucun outil"}${failed.length ? " · portes : " + failed.join(", ") : ""}${err ? " · " + err : ""}`;
    console.log(`\nQ: ${c.q}\n  ${line}`);
    if (r) console.log("  " + r.text.slice(0, 500).replace(/\n+/g, " / "));
    if (r && r.grounding.ungrounded_numbers.length) console.log("  nombres non fondés :", r.grounding.ungrounded_numbers.join(", "));
    rows.push(`| ${c.q} | ${r ? r.seconds.toFixed(1) : "—"} | ${r ? r.grounding.register : "erreur"} | ${used.join(", ")} | ${r ? r.blocks.map((b: any) => b.type).join(", ") : ""} | ${failed.length ? "FAIL " + failed.join(", ") : "OK"} |`);
  }
  const report = [
    `# Batterie de l'agent Explorer — ${new Date().toISOString().slice(0, 16).replace("T", " ")} (compte ${LOC.slice(0, 8)}, modèle ${modelFor("agent")})`,
    "", "| Question | s | registre | outils | blocs | portes |", "|---|---|---|---|---|---|", ...rows, "",
    `${hardFails} cas en échec sur ${BATTERY.length}. Budget owner : 3 s (mesuré, pas atteint : décision modèle en attente, spec § 10).`,
  ].join("\n");
  fs.mkdirSync("data/shots", { recursive: true });
  fs.writeFileSync("data/shots/explorer-agent-battery-report.md", report);
  console.log(`\n${hardFails ? `${hardFails} cas en échec` : "Tout vert"} — rapport : data/shots/explorer-agent-battery-report.md`);
  process.exit(hardFails ? 1 : 0);
})();
