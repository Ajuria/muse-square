// tools/battery/explorer-agent-battery.ts — LA BATTERIE de l'agent Explorer (docs/explorer-outil-spec.md § 8, § 9
// incrément 1) : les questions COMPOSÉES du § 2.3 et les questions de l'owner du 12/09, rejouées sur la VRAIE boucle
// (buildAgentTools + toolRunner, mêmes deps que /api/explorer/agent, hors HTTP et hors Clerk) sur LE compte de test
// owner (f10c3e58). Portes DURES par cas : les outils attendus ont été appelés dans le tour, le texte porte le fait
// attendu, la durée reste sous le plafond, le registre est « vetted » quand le cas l'exige. Le registre est aussi
// rapporté pour les cas où il n'est pas une porte (mesuré 12/09 : sur « mes pôles au m² », le modèle additionne deux
// parts de son cru et la porte rend « model » — la porte fait son travail ; la consigne ou le modèle reste à durcir).
// Budget owner : 3 s par réponse — MESURÉ ici, jamais déduit ; au 12/09 la boucle rend en 10-22 s avec claude-opus-5
// (l'outil lui-même : 0,6-1,3 s). Le rapport va dans data/shots/explorer-agent-battery-report.md.
// Usage : npm run battery:agent   (ANTHROPIC_API_KEY et les identifiants BigQuery dans .env) ; BATTERY_ONLY=rapport pour un cas.
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { makeBQClient } from "../../src/lib/bq";
import { listPoles } from "../../src/lib/dispositifs/poleReading";
import { buildAgentTools, readSiteFamilies30d, type ToolCallRecord } from "../../src/lib/explorer/agentTools";
import { readSiteMemory } from "../../src/lib/explorer/siteMemory";
import { SYSTEME_FR, OUTILS_FR } from "../../src/lib/explorer/agentSystem.fr";
import { FAMILIES } from "../../src/lib/insightFamilies";
import { assembleAnswerBlocks, groundAgentText } from "../../src/lib/explorer/blocks";
import { readMargeLecture } from "../../src/lib/kpi/margeLecture";
import { toApiMessages } from "../../src/lib/explorer/agentTurn";
import { listClassDispositifs } from "../../src/lib/dispositifs/bestPractices";
import { loadSiteEntities } from "../../src/lib/explorer/entityResolver";
import { operationLife, readDispositifFamille } from "../../src/lib/dispositifs/dispositifFamille";
import { computeSalesReport } from "../../src/lib/rapport/ventes";
import { readResultat } from "../../src/lib/kpi/resultat";
import { readPoleClassement } from "../../src/lib/dispositifs/poleClassement";
import { listReportTemplates } from "../../src/lib/rapport/modeles";
import { modelFor } from "../../src/lib/ai/models";
import { relireTexte } from "../../src/lib/fr/relecture";

const LOC = process.env.BATTERY_LOCATION_ID || "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const MAX_SECONDS = Number(process.env.BATTERY_MAX_SECONDS || 30);
// BATTERY_ONLY=<mot> : ne rejoue que les cas dont la question contient ce mot (mise au point d'un outil).
const ONLY = String(process.env.BATTERY_ONLY || "").trim().toLowerCase();
// BATTERY_MODEL=<id> : rejouer la batterie avec un autre modèle que celui du registre (mesure pour la décision owner, spec § 10).
const MODEL = String(process.env.BATTERY_MODEL || "").trim() || modelFor("agent");

type Case = { q: string; tools: string[]; answerMatch: RegExp; vetted: boolean; maxSeconds?: number; blocks?: string[] };
const BATTERY: Case[] = [
  // § 2.3 — deux sujets dans une question : deux outils dans le même tour.
  { q: "Quelles familles souffrent de la pluie, et quelle est ma marge brute ?", tools: ["lire_familles_face_aux_jours", "lire_marge"], answerMatch: /marge brute/i, vetted: true },
  { q: "Combien ai-je vendu sur mes 30 derniers jours, et qu'est-ce qui a bougé par rapport à la période précédente ?", tools: ["lire_ventes"], answerMatch: /période précédente/i, vetted: true },
  { q: "Quel est mon résultat net du mois dernier, et mon seuil de rentabilité est-il atteint aujourd'hui ?", tools: ["lire_resultat"], answerMatch: /seuil de rentabilité/i, vetted: true },
  { q: "Mon CA de la semaine dernière ?", tools: ["lire_ventes"], answerMatch: /chiffre d'affaires|CA/i, vetted: true },
  // Owner 12/09 — le classement des pôles ; le registre est rapporté, pas exigé (voir l'en-tête).
  { q: "Montre-moi comment mes pôles performent au m².", tools: ["lire_poles_classement"], answerMatch: /m²/, vetted: false },
  { q: "Classe mes pôles par marge brute sur le mois dernier.", tools: ["lire_poles_classement"], answerMatch: /marge brute/i, vetted: false },
  // § 9, incrément 2 — le Rapport composé : UN outil, un bloc rapport, la Synthèse vérifiée.
  { q: "Génère le rapport des ventes de la semaine dernière : volume, panier, mix, et les pôles les plus et les moins performants en nombre de ventes.", tools: ["composer_rapport"], answerMatch: /ventes/i, vetted: true, blocks: ["rapport"] },
  { q: "Fais-moi mon rapport de ventes du mois dernier.", tools: ["composer_rapport"], answerMatch: /chiffre d'affaires|CA/i, vetted: true, blocks: ["rapport"] },
  // § 9, incrément 4 — un Modèle enregistré du site, nommé (« Hebdo pôles » existe sur le compte de test depuis le 12/09).
  { q: "Compose mon rapport « Hebdo pôles ».", tools: ["composer_rapport"], answerMatch: /pôle|ventes/i, vetted: true, blocks: ["rapport"] },
  // § 7 couche 2 (13/09) — ex _top_familles_v1 : le mix par famille d'une période nommée, les K premières nommées par le modèle.
  { q: "Mes top 3 produits en août ?", tools: ["lire_ventes"], answerMatch: /famille/i, vetted: true, blocks: ["table"] },
  // § 7 couche 3 (13/09) — ex _dispositifs_v1 et _dispositif_famille_v1.
  { q: "Quelles bonnes pratiques ai-je documentées ?", tools: ["lire_dispositifs_documentes"], answerMatch: /documenté|dispositif/i, vetted: true },
  { q: "Pendant le Corner de vente producteur, qu'a fait la famille Coffee ?", tools: ["lire_operation_famille"], answerMatch: /Coffee/, vetted: true, blocks: ["table"] },
  // § 9 incrément 6 — une question COMPOSÉE : lire (familles face aux jours) puis préparer une Proposition d'opération sur ce qui a été lu.
  { q: "Quelle famille souffre le plus de la pluie ? Propose-moi une opération sur cette famille pour samedi prochain.", tools: ["lire_familles_face_aux_jours", "proposer_operation"], answerMatch: /Préparer l'opération|proposition/i, vetted: true, blocks: ["proposition_operation"], maxSeconds: 40 },
];

const bq = makeBQClient("muse-square-open-data");
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

async function ask(q: string) {
  const t0 = Date.now();
  const calls: ToolCallRecord[] = [];
  let firstBlockAt: number | null = null;   // l'instant où le premier bloc vérifié est disponible (streamé au client)
  const tools = buildAgentTools({
    location_id: LOC, author: { user_id: "battery", role: "owner" },
    listPoles: () => listPoles(bq, LOC, 12), readFamilies: () => readSiteFamilies30d(bq, LOC),
    readPhotos: async () => [], readPhotoBytes: async () => null,
    readMemory: (s) => readSiteMemory(bq, LOC, s ? { subject: s } : {}), writeMemory: async () => {},
    runFamily: (key, date) => FAMILIES[key].run(bq, LOC, date),
    runMarge: (jours, date) => readMargeLecture(bq, LOC, date, jours),
    listDispositifsDocumentes: () => listClassDispositifs(bq, LOC, null, 6),
    siteEntities: () => loadSiteEntities(bq, LOC, ""),
    operationLife: (sid) => operationLife(bq, LOC, sid, today()),
    runOperationFamille: (op, fams, s, e, kpi) => readDispositifFamille(bq, LOC, op, fams, s, e, today(), kpi),
    runVentes: (s, e) => computeSalesReport(bq, { location_id: LOC, owned: [LOC], start: s, end: e }),
    runResultat: () => readResultat(bq, LOC),
    runPolesClassement: (s, e) => readPoleClassement(bq, LOC, s, e),
    listModeles: () => listReportTemplates(bq, LOC),
    today, record: (r) => { calls.push(r); if (firstBlockAt == null && r.blocks && r.blocks.length) firstBlockAt = (Date.now() - t0) / 1000; },
    faitsDuTour: () => calls.flatMap((c) => c.facts ?? []),
  });
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const runner = client.beta.messages.toolRunner({
    // haiku-4-5 refuse le thinking adaptatif (400, mesuré 12/09) : on ne l'envoie qu'aux modèles qui le portent (models.ts capsFor).
    model: MODEL, max_tokens: 16000, ...(/haiku/.test(MODEL) ? {} : { thinking: { type: "adaptive" as const } }),
    system: [{ type: "text", text: SYSTEME_FR, cache_control: { type: "ephemeral" } }],
    // 13/09 : la date du jour sur le dernier tour, comme runAgentTurn (le modèle cherchait « août » en 2024 puis 2025).
    messages: toApiMessages([{ role: "user", content: q }], [], today()), tools, max_iterations: 8,
  });
  const final = await runner.runUntilDone();
  const brut = final.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
  const relecture = relireTexte(brut);   // la même relecture que la route : les phrases fautives ne se montrent pas
  const text = relecture.texte;
  const g = groundAgentText(text, calls.flatMap((c) => c.facts ?? []));
  const blocks = assembleAnswerBlocks(calls.map((c) => c.blocks ?? []), g);
  return { seconds: (Date.now() - t0) / 1000, firstBlockAt, model: final.model, text, calls, grounding: g, blocks, relecture };
}

(async () => {
  if (!process.env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY absente"); process.exit(2); }
  const rows: string[] = [];
  let hardFails = 0;
  for (const c of BATTERY.filter((c) => !ONLY || c.q.toLowerCase().includes(ONLY))) {
    let r: Awaited<ReturnType<typeof ask>> | null = null; let err = "";
    try { r = await ask(c.q); } catch (e: any) { err = String(e?.message || e); }
    const used = r ? r.calls.map((x) => x.name) : [];
    const gates: Array<[string, boolean]> = [
      ["outils", c.tools.every((t) => used.includes(t))],
      ["fait", !!r && c.answerMatch.test(r.text)],
      ["durée", !!r && r.seconds <= (c.maxSeconds ?? MAX_SECONDS)],
      ["registre", !c.vetted || (!!r && r.grounding.register === "vetted")],
      ["blocs", !c.blocks || (!!r && c.blocks.every((t) => r.blocks.some((b: any) => b.type === t)))],
    ];
    const failed = gates.filter(([, ok]) => !ok).map(([n]) => n);
    if (failed.length) hardFails++;
    const line = `${failed.length ? "FAIL" : "OK  "} ${r ? r.seconds.toFixed(1).padStart(5) : "  —  "} s (premier bloc ${r && r.firstBlockAt != null ? r.firstBlockAt.toFixed(1) + " s" : "—"}) · ${r ? r.grounding.register.padEnd(6) : "erreur"} · ${used.map((n) => OUTILS_FR[n] ?? n).join(" ; ") || "aucun outil"}${failed.length ? " · portes : " + failed.join(", ") : ""}${err ? " · " + err : ""}`;
    console.log(`\nQ: ${c.q}\n  ${line}`);
    if (r) console.log("  " + r.text.slice(0, 500).replace(/\n+/g, " / "));
    if (r && r.grounding.ungrounded_numbers.length) console.log("  nombres non fondés :", r.grounding.ungrounded_numbers.join(", "));
    if (r && r.relecture.fautes.length) console.log("  relecture — phrases retirées :", r.relecture.phrases_retirees, "·", r.relecture.fautes.map((f) => f.motif).join(" ; "));
    rows.push(`| ${c.q} | ${r ? r.seconds.toFixed(1) : "—"} (1er bloc ${r && r.firstBlockAt != null ? r.firstBlockAt.toFixed(1) : "—"}) | ${r ? r.grounding.register : "erreur"} | ${used.join(", ")} | ${r ? r.blocks.map((b: any) => b.type).join(", ") : ""} | ${failed.length ? "FAIL " + failed.join(", ") : "OK"} |`);
  }
  const report = [
    `# Batterie de l'agent Explorer — ${new Date().toISOString().slice(0, 16).replace("T", " ")} (compte ${LOC.slice(0, 8)}, modèle ${MODEL})`,
    "", "| Question | s | registre | outils | blocs | portes |", "|---|---|---|---|---|---|", ...rows, "",
    `${hardFails} cas en échec sur ${BATTERY.length}. Budget owner : 3 s (mesuré, pas atteint : décision modèle en attente, spec § 10).`,
  ].join("\n");
  fs.mkdirSync("data/shots", { recursive: true });
  fs.writeFileSync(`data/shots/explorer-agent-battery-report${process.env.BATTERY_MODEL ? "-" + MODEL : ""}.md`, report);
  console.log(`\n${hardFails ? `${hardFails} cas en échec` : "Tout vert"} — rapport : data/shots/explorer-agent-battery-report.md`);
  process.exit(hardFails ? 1 : 0);
})();
