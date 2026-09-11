// src/lib/explorer/agentTurns.ts — les TOURS de conversation de l'agent Explorer (docs/explorer-agentique-spec.md § 2).
//
// L'API est sans état : le client renvoie l'historique complet à chaque tour. Chaque tour reçu ou rendu
// s'écrit dans raw.explorer_agent_turns (app-write, insertion en flux, append-only) — jamais les octets
// d'un fichier joint, seulement son nom et son type. Personne ne LIT cette table depuis l'app en
// incrément 1 : c'est une trace, lisible en BigQuery, en attendant une vue semantic si un lecteur naît.
import { randomUUID } from "node:crypto";

export type TurnRole = "user" | "assistant";

export interface AgentTurnRow {
  turn_id: string;
  location_id: string;
  thread_id: string;
  turn_index: number;
  role: TurnRole;
  content: string;          // JSON : { text, files?: [{name, kind, media_type}], tool_calls?: [...] }
  user_id: string | null;
  created_at: string;       // ISO
}

export interface AgentTurnContent {
  text: string;
  files?: Array<{ name: string; kind: string; media_type: string }>;
  tool_calls?: Array<{ name: string; input: unknown; ok: boolean; summary: string; ms: number }>;
  stop_reason?: string | null;
}

/** PUR : la ligne à insérer. */
export function newAgentTurnRow(input: {
  location_id: string;
  thread_id: string;
  turn_index: number;
  role: TurnRole;
  content: AgentTurnContent;
  user_id?: string | null;
  now?: Date;
}): AgentTurnRow {
  const location_id = String(input.location_id ?? "").trim();
  const thread_id = String(input.thread_id ?? "").trim();
  if (!location_id) throw new Error("agentTurns: location_id requis");
  if (!thread_id) throw new Error("agentTurns: thread_id requis");
  if (!Number.isInteger(input.turn_index) || input.turn_index < 0) throw new Error("agentTurns: turn_index entier ≥ 0");
  if (input.role !== "user" && input.role !== "assistant") throw new Error("agentTurns: role user | assistant");
  return {
    turn_id: randomUUID(),
    location_id,
    thread_id,
    turn_index: input.turn_index,
    role: input.role,
    content: JSON.stringify(input.content),
    user_id: input.role === "user" ? (input.user_id ?? null) : null,
    created_at: (input.now ?? new Date()).toISOString(),
  };
}

/** Insertion en flux dans la table raw que l'app produit. Jette si BigQuery refuse. */
export async function writeAgentTurns(bq: any, rows: AgentTurnRow[]): Promise<void> {
  if (!rows.length) return;
  await bq.dataset("raw").table("explorer_agent_turns").insert(rows);
}
