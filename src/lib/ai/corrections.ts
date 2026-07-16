// src/lib/ai/corrections.ts
// Phase 2.3 — persistent user corrections to a venue's business identity.
// Append-only EVENT LOG (analytics.consulter_correction_events): every assert/supersede/clear is an
// immutable row. The CURRENT identity is the latest active event per (location_id, correction_type);
// a latest 'clear' means the correction is inactive. The full history is the learning corpus (dbt
// models it downstream). The app owns write (append) + read (latest-active); never overwrites/deletes.
//
// Lives in `analytics`, NOT `raw`: house convention puts APP-OWNED append-only logs there (raw is for
// ingestions — Airbyte/client/crawl/static). Exact same pattern as analytics.action_commitments
// (INSERT DML, latest-state via ROW_NUMBER, dbt-sourced into a learning chain).
//
// Identity priority (Phase 2.3): user correction > measured sales (Phase 1) > crawled > declared.

import { makeBQClient } from "../bq";
import { randomUUID } from "crypto";
import { callClaudeMessagesAPI } from "./runtime/claude";
import { modelFor } from "./models";

const PROJECT = "muse-square-open-data";
const TABLE = `\`${PROJECT}.analytics.consulter_correction_events\``;

// Item 4 (16/07): "declared_margin_pct" is a DECLARED METRIC, not an identity correction — same
// event log, same latest-active/supersede/clear lifecycle, but it must never enter the identity
// brief (correctionsBrief filters declared_* out). correction_text holds the bare percent ("62").
export type CorrectionType = "activity" | "zone" | "nouveau_meaning" | "other" | "declared_margin_pct";
export type CorrectionAction = "assert" | "supersede" | "clear";
export type ActiveCorrection = { correction_type: CorrectionType; correction_text: string; declarant_name: string | null; corrected_at: string | null };

const str = (v: any): string =>
  (v == null ? "" : String(v && typeof v === "object" && "value" in v ? (v as any).value : v)).trim();

// Latest ACTIVE correction per type for a location. A latest 'clear' event -> that type is inactive.
export async function getActiveCorrections(location_id: string): Promise<ActiveCorrection[]> {
  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
    const [rows] = await bq.query({
      query: `
        WITH ranked AS (
          SELECT correction_type, correction_text, event_action, declarant_name,
                 FORMAT_TIMESTAMP('%Y-%m-%d', created_at) AS corrected_at,
                 ROW_NUMBER() OVER (PARTITION BY correction_type ORDER BY created_at DESC) AS rn
          FROM ${TABLE}
          WHERE location_id = @location_id
        )
        SELECT correction_type, correction_text, declarant_name, corrected_at
        FROM ranked
        WHERE rn = 1 AND event_action != 'clear' AND correction_text IS NOT NULL`,
      params: { location_id }, types: { location_id: "STRING" }, location: "EU",
    });
    return (rows ?? []).map((r: any) => ({
      correction_type: str(r.correction_type) as CorrectionType,
      correction_text: str(r.correction_text),
      declarant_name: str(r.declarant_name) || null,
      corrected_at: str(r.corrected_at) || null,
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
  // WHO made the change — a name from the profile's Destinataires roster (owner decision 16/07:
  // roster identity, not login identity — accounts are shared). Nullable: unknown stays an honest NULL.
  declarant_name?: string | null;
}): Promise<void> {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
  await bq.query({
    query: `
      INSERT INTO ${TABLE}
        (event_id, event_action, location_id, correction_type, correction_text, prior_value, raw_turn, source, declarant_name, created_at)
      VALUES
        (@event_id, @event_action, @location_id, @correction_type, @correction_text, @prior_value, @raw_turn, @source, @declarant_name, CURRENT_TIMESTAMP())`,
    params: {
      event_id: randomUUID(),
      event_action: e.event_action,
      location_id: e.location_id,
      correction_type: e.correction_type,
      correction_text: e.correction_text ?? null,
      prior_value: e.prior_value ?? null,
      raw_turn: e.raw_turn ?? null,
      source: e.source ?? "chat_hybrid",
      declarant_name: e.declarant_name ?? null,
    },
    types: {
      event_id: "STRING", event_action: "STRING", location_id: "STRING", correction_type: "STRING",
      correction_text: "STRING", prior_value: "STRING", raw_turn: "STRING", source: "STRING",
      declarant_name: "STRING",
    },
    location: "EU",
  });
}

// Format active corrections as the TOP identity-brief lines — authoritative, above measured sales.
// The "CORRIGÉE PAR VOUS" label tells the prompt to lead on it and acknowledge it out loud.
export function correctionsBrief(corrections: ActiveCorrection[]): string {
  // Declared METRICS (declared_*) are numbers the user handed us, not identity — they are consumed
  // by their own deterministic answerers (prompt.ts), never folded into the identity brief.
  const identity = corrections.filter((c) => !c.correction_type.startsWith("declared_"));
  if (!identity.length) return "";
  const LABEL: Partial<Record<CorrectionType, string>> = {
    activity: "Activité (CORRIGÉE PAR VOUS — fait autorité, prime sur vos ventes mesurées et votre profil)",
    zone: "Zone (CORRIGÉE PAR VOUS — prime sur la localisation par défaut)",
    nouveau_meaning: "Sens de « nouveau » (précisé par vous)",
    other: "Précision (indiquée par vous)",
  };
  return identity
    .map((c) => `- ${LABEL[c.correction_type] ?? LABEL.other} : ${c.correction_text}`)
    .join("\n");
}

// ── Item 4 — declared-metric helpers ─────────────────────────────────────────
// The one read path for a declared margin: latest active declared_margin_pct event, parsed + range-
// guarded. Returns null when absent/invalid — callers fall back to the elicit.
export async function getDeclaredMarginPct(
  location_id: string,
): Promise<{ pct: number; declarant_name: string | null; corrected_at: string | null } | null> {
  const c = (await getActiveCorrections(location_id)).find((x) => x.correction_type === "declared_margin_pct");
  if (!c) return null;
  const pct = Number(String(c.correction_text).replace(",", "."));
  if (!(Number.isFinite(pct) && pct >= 1 && pct <= 95)) return null;
  return { pct, declarant_name: c.declarant_name, corrected_at: c.corrected_at };
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
