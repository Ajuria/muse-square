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
