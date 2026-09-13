// src/lib/explorer/agentTurn.ts — UN TOUR DE LA BOUCLE D'EXPLORER, comme fonction (13/09, docs/explorer-outil-spec.md § 7).
//
// Extrait de api/explorer/agent.ts pour que l'aiguillage PAR CAPACITÉ de insight/prompt.ts (§ 7 : « tant qu'une couche
// n'est pas rentrée, prompt.ts la sert ») appelle la MÊME boucle que la route de l'agent — mêmes outils, même porte
// (groundAgentText), même relecture, même trace des tours — jamais une copie. La route garde l'HTTP (auth, corps,
// SSE) ; ici, le tour : les messages entrent, le texte relu, ses blocs, son registre et les appels d'outils sortent.
import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlockParam, BetaMessageParam } from "@anthropic-ai/sdk/resources/beta";
import { modelFor } from "../ai/models";
import { listPoles } from "../dispositifs/poleReading";
import { buildAgentTools, readSiteFamilies30d, type AgentToolDeps, type PhotoBytes, type PhotoInfo, type ToolCallRecord } from "./agentTools";
import { readSiteMemory, writeSiteMemory, type AuthorRole } from "./siteMemory";
import { newAgentTurnRow, writeAgentTurns } from "./agentTurns";
import { OUTILS_FR, SYSTEME_FR } from "./agentSystem.fr";
import { FAMILIES } from "../insightFamilies";
import { assembleAnswerBlocks, groundAgentText, type AnswerBlock, type Grounding } from "./blocks";
import { computeSalesReport } from "../rapport/ventes";
import { readResultat } from "../kpi/resultat";
import { readPoleClassement } from "../dispositifs/poleClassement";
import { listReportTemplates } from "../rapport/modeles";
import { readMargeLecture, type MargesDeclarees } from "../kpi/margeLecture";
import { relireTexte, type Relecture } from "../fr/relecture";
import { listClassDispositifs } from "../dispositifs/bestPractices";
import { loadSiteEntities } from "./entityResolver";
import { operationLife, readDispositifFamille } from "../dispositifs/dispositifFamille";

export const MAX_ITERATIONS = 8;
export const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export type ImageType = PhotoBytes["media_type"];
export type FileIn = { kind: "image" | "pdf"; media_type: string; data_base64: string; name: string };
export type MsgIn = { role: "user" | "assistant"; content: string };

/** « Aujourd'hui : samedi 13/09/2026 » — le modèle ne connaît pas la date (mesuré 13/09 : « août » cherché en 2024 puis 2025). */
export function aujourdhuiFr(today: string): string {
  const d = new Date(`${today}T12:00:00Z`);
  const jour = new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone: "UTC" }).format(d);
  return `Aujourd'hui : ${jour} ${today.slice(8, 10)}/${today.slice(5, 7)}/${today.slice(0, 4)}.`;
}

/**
 * L'historique tel que le client l'a renvoyé ; les fichiers ne s'attachent qu'au DERNIER tour (celui-ci), qui porte
 * aussi la date du jour (jamais dans le prompt système, stable et en cache ; jamais dans la trace : c'est le contexte
 * de l'appel, pas ce que l'exploitant a écrit).
 */
export function toApiMessages(messages: MsgIn[], files: FileIn[], today?: string): BetaMessageParam[] {
  return messages.map((m, i) => {
    const dernier = i === messages.length - 1;
    const text = dernier && today ? `${m.content}\n\n(${aujourdhuiFr(today)})` : m.content;
    if (!dernier || !files.length) return { role: m.role, content: text };
    const blocks: BetaContentBlockParam[] = files.map((f) =>
      f.kind === "pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data_base64 }, title: f.name }
        : { type: "image", source: { type: "base64", media_type: f.media_type as ImageType, data: f.data_base64 } },
    );
    blocks.push({ type: "text", text });
    return { role: "user", content: blocks };
  });
}

export interface AgentTurnInput {
  location_id: string;
  user_id: string;
  role: AuthorRole;
  ownedIds: string[];
  messages: MsgIn[];
  files: FileIn[];
  thread_id: string;
  readPhotos: (dispositif_id: string) => Promise<PhotoInfo[]>;
  readPhotoBytes: (dispositif_id: string, photo_id: string) => Promise<PhotoBytes | null>;
  onTool?: (r: ToolCallRecord & { label_fr: string }) => void;
  /** Une marge globale déclarée dans le MÊME tour (prompt.ts, déclare-et-demande) : lire_marge la lit avant le journal. */
  margeDeclareeCeTour?: MargesDeclarees["globale"];
}
export interface AgentTurnResult {
  text: string;
  brut: string;
  refused: boolean;
  stop_reason: string | null;
  grounding: Grounding;
  relecture: Relecture;
  blocks: AnswerBlock[];
  tool_calls: ToolCallRecord[];
  final: Anthropic.Beta.BetaMessage;
}

/** Les dépendances des outils — LE registre FAMILIES et les libs, jamais une copie (agent.ts et prompt.ts y passent). */
export function agentDeps(bq: any, inp: AgentTurnInput, tool_calls: ToolCallRecord[]): AgentToolDeps {
  const { location_id } = inp;
  return {
    location_id,
    author: { user_id: inp.user_id, role: inp.role },
    listPoles: () => listPoles(bq, location_id, 12),
    readFamilies: () => readSiteFamilies30d(bq, location_id),
    readPhotos: inp.readPhotos,
    readPhotoBytes: inp.readPhotoBytes,
    readMemory: (subject) => readSiteMemory(bq, location_id, subject ? { subject } : {}),
    writeMemory: (row) => writeSiteMemory(bq, row),
    runFamily: (key, date) => FAMILIES[key].run(bq, location_id, date),
    // 13/09 (§ 7, couche 1) — lire_marge : mesure d'abord, sinon marges déclarées ; les jours de la question.
    runMarge: (jours, date) => readMargeLecture(bq, location_id, date, jours, inp.margeDeclareeCeTour ?? null),
    runVentes: (start, end) => computeSalesReport(bq, { location_id, owned: inp.ownedIds, start, end }),
    runResultat: () => readResultat(bq, location_id),
    runPolesClassement: (start, end) => readPoleClassement(bq, location_id, start, end),
    listModeles: () => listReportTemplates(bq, location_id),
    // 13/09 (§ 7, couche 3) — les fiches de l'atelier et « une opération × des familles » : LES lecteurs existants, jamais une copie.
    listDispositifsDocumentes: () => listClassDispositifs(bq, location_id, null, 6),
    siteEntities: () => loadSiteEntities(bq, location_id, inp.user_id),
    operationLife: (sid) => operationLife(bq, location_id, sid, new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" })),
    runOperationFamille: (op, fams, start, end, kpi) => readDispositifFamille(bq, location_id, op, fams, start, end, new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }), kpi),
    today: () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }),
    record: (r) => { tool_calls.push(r); inp.onTool?.({ ...r, label_fr: OUTILS_FR[r.name] ?? r.name }); },
    faitsDuTour: () => tool_calls.flatMap((c) => c.facts ?? []),
  };
}

/**
 * Le tour : la boucle du SDK sur les outils, puis la relecture (lexique), la porte (chaque nombre du texte vient des
 * faits des outils), l'assemblage des blocs (registre d'abord), la Synthèse posée sur un bloc rapport, la trace des
 * deux tours en base. Jette les erreurs de l'API : l'appelant les traduit en statut HTTP.
 */
export async function runAgentTurn(bq: any, inp: AgentTurnInput): Promise<AgentTurnResult> {
  const tool_calls: ToolCallRecord[] = [];
  const deps = agentDeps(bq, inp, tool_calls);
  const tools = buildAgentTools(deps);
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const runner = client.beta.messages.toolRunner({
    model: modelFor("agent"),
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: [{ type: "text", text: SYSTEME_FR, cache_control: { type: "ephemeral" } }],
    messages: toApiMessages(inp.messages, inp.files, deps.today()),
    tools,
    max_iterations: MAX_ITERATIONS,
  });
  const final = await runner.runUntilDone();
  const brut = final.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
  const relecture = relireTexte(brut);
  const text = relecture.texte;
  // La porte : chaque nombre du texte vient des faits des outils — ou de la QUESTION elle-même (« mes 3 premières
  // familles » : le 3 est celui de l'exploitant, pas une invention du modèle ; la règle R2-4 du validateur du chat).
  // Les faits cités comptés restent ceux des outils.
  const toolFacts = tool_calls.flatMap((r) => r.facts ?? []);
  const grounding = { ...groundAgentText(text, [...toolFacts, inp.messages[inp.messages.length - 1].content]), facts_cited: toolFacts.length };
  const blocks = assembleAnswerBlocks(tool_calls.map((r) => r.blocks ?? []), grounding);
  for (const b of blocks) if (b.type === "rapport" && text) b.synthese = { text, register: grounding.register };

  const lastIdx = inp.messages.length - 1;
  const rows = [
    newAgentTurnRow({ location_id: inp.location_id, thread_id: inp.thread_id, turn_index: lastIdx, role: "user", user_id: inp.user_id, content: { text: inp.messages[lastIdx].content, files: inp.files.map((f) => ({ name: f.name, kind: f.kind, media_type: f.media_type })) } }),
    newAgentTurnRow({ location_id: inp.location_id, thread_id: inp.thread_id, turn_index: lastIdx + 1, role: "assistant", content: { text: brut, tool_calls, stop_reason: final.stop_reason ?? null } }),
  ];
  await writeAgentTurns(bq, rows).catch((e: any) => console.error("[explorer/agentTurn] turns non écrits :", e?.message || e));
  return { text, brut, refused: final.stop_reason === "refusal", stop_reason: final.stop_reason ?? null, grounding, relecture, blocks, tool_calls, final };
}
