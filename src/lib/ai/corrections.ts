// src/lib/ai/corrections.ts
// Phase 2.3 — persistent user corrections to a venue's business identity.
// Append-only EVENT LOG (raw.consulter_correction_events): every assert/supersede/clear is an immutable
// row. The CURRENT identity is the latest active event per (location_id, correction_type); a latest
// 'clear' means the correction is inactive. The full history is the learning corpus (dbt models it
// downstream). The app owns write (append) + read (latest-active); it never overwrites or deletes.
//
// Identity priority (Phase 2.3): user correction > measured sales (Phase 1) > crawled > declared.

import { makeBQClient } from "../bq";
import { randomUUID } from "crypto";
import { callClaudeMessagesAPI } from "./runtime/claude";
import { modelFor } from "./models";

const PROJECT = "muse-square-open-data";
const TABLE = `\`${PROJECT}.raw.consulter_correction_events\``;

export type CorrectionType = "activity" | "zone" | "nouveau_meaning" | "other";
export type CorrectionAction = "assert" | "supersede" | "clear";
export type ActiveCorrection = { correction_type: CorrectionType; correction_text: string };

const str = (v: any): string =>
  (v == null ? "" : String(v && typeof v === "object" && "value" in v ? (v as any).value : v)).trim();

// Latest ACTIVE correction per type for a location. A latest 'clear' event -> that type is inactive.
export async function getActiveCorrections(location_id: string): Promise<ActiveCorrection[]> {
  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
    const [rows] = await bq.query({
      query: `
        WITH ranked AS (
          SELECT correction_type, correction_text, event_action,
                 ROW_NUMBER() OVER (PARTITION BY correction_type ORDER BY created_at DESC) AS rn
          FROM ${TABLE}
          WHERE location_id = @location_id
        )
        SELECT correction_type, correction_text
        FROM ranked
        WHERE rn = 1 AND event_action != 'clear' AND correction_text IS NOT NULL`,
      params: { location_id }, types: { location_id: "STRING" }, location: "EU",
    });
    return (rows ?? []).map((r: any) => ({
      correction_type: str(r.correction_type) as CorrectionType,
      correction_text: str(r.correction_text),
    })).filter((c: ActiveCorrection) => c.correction_text);
  } catch (e: any) {
    console.warn("[corrections] read failed:", e?.message);
    return [];   // never break the answer on a memory read
  }
}

// Append one immutable event. Used by capture (increment 2) and the clear control (increment 3).
export async function appendCorrectionEvent(e: {
  location_id: string;
  event_action: CorrectionAction;
  correction_type: CorrectionType;
  correction_text?: string | null;
  prior_value?: string | null;
  raw_turn?: string | null;
  source?: string;
}): Promise<void> {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
  await bq.query({
    query: `
      INSERT INTO ${TABLE}
        (event_id, event_action, location_id, correction_type, correction_text, prior_value, raw_turn, source, created_at)
      VALUES
        (@event_id, @event_action, @location_id, @correction_type, @correction_text, @prior_value, @raw_turn, @source, CURRENT_TIMESTAMP())`,
    params: {
      event_id: randomUUID(),
      event_action: e.event_action,
      location_id: e.location_id,
      correction_type: e.correction_type,
      correction_text: e.correction_text ?? null,
      prior_value: e.prior_value ?? null,
      raw_turn: e.raw_turn ?? null,
      source: e.source ?? "chat_hybrid",
    },
    types: {
      event_id: "STRING", event_action: "STRING", location_id: "STRING", correction_type: "STRING",
      correction_text: "STRING", prior_value: "STRING", raw_turn: "STRING", source: "STRING",
    },
    location: "EU",
  });
}

// Format active corrections as the TOP identity-brief lines — authoritative, above measured sales.
// The "CORRIGÉE PAR VOUS" label tells the prompt to lead on it and acknowledge it out loud.
export function correctionsBrief(corrections: ActiveCorrection[]): string {
  if (!corrections.length) return "";
  const LABEL: Record<CorrectionType, string> = {
    activity: "Activité (CORRIGÉE PAR VOUS — fait autorité, prime sur vos ventes mesurées et votre profil)",
    zone: "Zone (CORRIGÉE PAR VOUS — prime sur la localisation par défaut)",
    nouveau_meaning: "Sens de « nouveau » (précisé par vous)",
    other: "Précision (indiquée par vous)",
  };
  return corrections
    .map((c) => `- ${LABEL[c.correction_type] ?? LABEL.other} : ${c.correction_text}`)
    .join("\n");
}

// ── Hybrid capture (Phase 2.3 increment 2) ────────────────────────────────────
// Cheap regex gate flags turns that LOOK like an identity correction; only then does a small Haiku
// call extract the structured fact. Normal turns pay nothing. Everything is wrapped so a slow/failed
// capture can never delay or break the answer.
const CORRECTION_HINTS = /(en fait|en r[eé]alit[eé]|je ne (vends?|suis|fais|tiens) (plus |pas)|je (vends|suis|tiens|g[eè]re) (plut[oô]t |surtout |maintenant |désormais |en fait )|je suis plut[oô]t|c'est plut[oô]t|pas (un |une )|ma zone|mon quartier|mon secteur|je voulais dire|par .{0,20} je veux dire|je me suis reconverti|on est (devenu|plut[oô]t))/i;

export function looksLikeCorrection(qRaw: string): boolean {
  return CORRECTION_HINTS.test(String(qRaw ?? ""));
}

const EXTRACT_SYSTEM = `Tu détectes si le message de l'utilisateur CORRIGE l'identité de SON commerce : son activité, sa zone géographique, ou le sens qu'il donne au mot « nouveau ». Retourne UNIQUEMENT du JSON, sans texte autour :
{ "is_correction": boolean, "type": "activity" | "zone" | "nouveau_meaning" | "other" | null, "fact": string | null }
- is_correction = true UNIQUEMENT si l'utilisateur affirme/rectifie un fait sur SON commerce (ex: « en fait je tiens une librairie », « je ne vends plus de café », « ma zone c'est le 15e », « par nouveau je veux dire un concurrent que je ne suis pas encore »).
- Une simple question, une demande, ou un commentaire général n'est PAS une correction -> is_correction = false, type = null, fact = null.
- fact = le fait corrigé, concis et au format identité (ex: « librairie indépendante », « 15e arrondissement », « un concurrent que je ne suis pas encore »). PAS une phrase.`;

// Detect + extract + append a correction from ONE user turn. Gated by the heuristic; safe to await
// (only correction-like turns invoke Haiku) and never throws. Records prior_value (the delta) and
// supersedes an existing active correction of the same type.
export async function captureCorrectionFromTurn(
  location_id: string,
  qRaw: string,
  history?: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<void> {
  try {
    if (!location_id || !qRaw || !looksLikeCorrection(qRaw)) return;
    const lastAssistant = [...(history ?? [])].reverse().find((m) => m.role === "assistant")?.content ?? "";
    const call = await callClaudeMessagesAPI({
      system: EXTRACT_SYSTEM,
      userText: `Dernière réponse de l'assistant (contexte) : ${String(lastAssistant).slice(0, 300)}\n\nMessage de l'utilisateur : ${qRaw}`,
      model: modelFor("classifier"),
      maxTokens: 150,
      temperature: 0,
      cacheSystem: false,
    });
    if (!call.ok) return;
    let parsed: any = null;
    try { parsed = JSON.parse(call.rawText.replace(/```json|```/g, "").trim()); } catch { return; }
    const fact = typeof parsed?.fact === "string" ? parsed.fact.trim() : "";
    if (parsed?.is_correction !== true || !fact) return;
    const type = (["activity", "zone", "nouveau_meaning", "other"].includes(parsed?.type) ? parsed.type : "other") as CorrectionType;
    const existing = (await getActiveCorrections(location_id)).find((c) => c.correction_type === type);
    await appendCorrectionEvent({
      location_id,
      event_action: existing ? "supersede" : "assert",
      correction_type: type,
      correction_text: fact.slice(0, 300),
      prior_value: existing?.correction_text ?? null,
      raw_turn: String(qRaw).slice(0, 500),
      source: "chat_hybrid",
    });
  } catch (e: any) {
    console.warn("[corrections] capture failed:", e?.message);
  }
}
