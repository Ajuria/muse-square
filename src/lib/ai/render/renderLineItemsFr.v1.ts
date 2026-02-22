// src/lib/ai/render/renderLineItemsFr.v1.ts
// =====================================================
// Shared deterministic renderer (V1 IR -> RenderLineV1[])
// =====================================================
// - Accepts ONLY structured IR (line_items + facts_by_date).
// - Builds a single facts index (Map) for O(1) lookups.
// - NEVER parses numbers from label_fr.
// - All numeric rendering must come from li.params.
// - Returns ONLY RenderLineV1[].
// =====================================================

import type {
  FactV1,
  LineItemV1,
  RenderLineV1,
} from "../contracts/facts_v1";

// -----------------------------------------------------
// Internal helpers
// -----------------------------------------------------

function buildFactsIndex(
  facts_by_date: Record<string, FactV1[]>
): Map<string, FactV1> {
  const idx = new Map<string, FactV1>();
  for (const date of Object.keys(facts_by_date)) {
    for (const f of facts_by_date[date] ?? []) {
      idx.set(f.fact_id, f);
    }
  }
  return idx;
}

function assertLineItemsWellFormed(
  line_items: LineItemV1[],
  factsIndex: Map<string, FactV1>
): void {
  for (let i = 0; i < line_items.length; i++) {
    const li = line_items[i];

    if (!li || typeof li.template_id !== "string") {
      throw new Error(`LineItem[${i}] missing template_id`);
    }

    if (!Array.isArray(li.fact_ids) || li.fact_ids.length < 1) {
      throw new Error(`LineItem[${i}] has no fact_ids`);
    }

    for (const fid of li.fact_ids) {
      if (!factsIndex.has(fid)) {
        throw new Error(
          `LineItem[${i}] references unknown fact_id: ${fid}`
        );
      }
    }
  }
}

// FIX 1 — strict numeric coercion
function safeNum(v: any): string {
  if (v === null || v === undefined) return "ND";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "ND";
}

function safeRounded(v: any): string {
  if (v === null || v === undefined) return "ND";
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n)) : "ND";
}

// -----------------------------------------------------
// Public renderer
// -----------------------------------------------------

export function renderLineItemsFrV1(args: {
  line_items: LineItemV1[];
  facts_by_date: Record<string, FactV1[]>;
}): RenderLineV1[] {
  const { line_items, facts_by_date } = args;

  const factsIndex = buildFactsIndex(facts_by_date);

  assertLineItemsWellFormed(line_items, factsIndex);

  const lines: RenderLineV1[] = [];

  for (const li of line_items) {
    const facts = li.fact_ids
      .map((id) => factsIndex.get(id))
      .filter(Boolean) as FactV1[];

    // -------------------------------------------------
    // RAW TEXT OVERRIDE (DayWhy support)
    // -------------------------------------------------
    const textOverride =
      typeof li.params?.text_override === "string"
        ? li.params.text_override.trim()
        : "";

    if (textOverride.length > 0) {
      lines.push({
        kind: li.kind ?? "fact",
        text_fr: textOverride,
        fact_ids: li.fact_ids,
      });
      continue; // IMPORTANT: skip switch safely
    }

    switch (li.template_id) {

      // -------------------------------------------------
      // HEADLINE
      // -------------------------------------------------
      case "HEADLINE_COMPARE": {
        if (li.params?.mode === "missing_dates") {
          lines.push({
            kind: "headline",
            text_fr: "Comparaison impossible",
            fact_ids: li.fact_ids,
          });
        } else {
          lines.push({
            kind: "headline",
            text_fr: `Meilleure date: ${String(
              li.params?.winner_date ?? "ND"
            )}`,
            fact_ids: li.fact_ids,
          });
        }
        break;
      }

      // -------------------------------------------------
      // TIE
      // -------------------------------------------------
      case "TIE_EQUIVALENT_DATES": {
        lines.push({
          kind: "caveat",
          text_fr: `Jours équivalents sur les signaux disponibles; choix par défaut: ${String(
            li.params?.default_choice_date ?? "ND"
          )}.`,
          fact_ids: li.fact_ids,
        });
        break;
      }

      // -------------------------------------------------
      // WINNER VERDICT
      // -------------------------------------------------
      case "WINNER_VERDICT": {
        const f = facts[0];
        lines.push({
          kind: "fact",
          text_fr: `Meilleur choix: ${String(
            li.params?.date ?? "ND"
          )} (${f?.label_fr ?? "Verdict ND"})`,
          fact_ids: li.fact_ids,
        });
        break;
      }

      // -------------------------------------------------
      // WORST VERDICT
      // -------------------------------------------------
      case "WORST_VERDICT": {
        const f = facts[0];
        lines.push({
          kind: "fact",
          text_fr: `Date la moins favorable: ${String(
            li.params?.date ?? "ND"
          )} (${f?.label_fr ?? "Verdict ND"})`,
          fact_ids: li.fact_ids,
        });
        break;
      }

      // -------------------------------------------------
      // WINNER WEATHER (numeric from params)
      // -------------------------------------------------
      case "WINNER_WEATHER_ALERT": {
        const alert = li.params?.alert_level_max;
        lines.push({
          kind: "fact",
          text_fr: `Risque météo: alerte max ${safeNum(alert)}`,
          fact_ids: li.fact_ids,
        });
        break;
      }

      // -------------------------------------------------
      // WORST WEATHER (numeric from params)
      // -------------------------------------------------
      case "WORST_WEATHER_ALERT": {
        const alert = li.params?.alert_level_max;
        lines.push({
          kind: "fact",
          text_fr: `Risque météo: alerte max ${safeNum(alert)}`,
          fact_ids: li.fact_ids,
        });
        break;
      }

      // -------------------------------------------------
      // WINNER COMPETITION (numeric from params)
      // -------------------------------------------------
      case "WINNER_COMPETITION_LOCAL_REGIONAL": {
        const localR = li.params?.local_radius_km ?? 10;
        const regionalR = li.params?.regional_radius_km ?? 50;
        const c10 = li.params?.c10;
        const c50 = li.params?.c50;

        lines.push({
          kind: "fact",
          text_fr:
            `Concurrence: ${safeNum(c10)} événement(s) ≤${String(
              localR
            )}km, ` +
            `${safeNum(c50)} dans un rayon de ${String(regionalR)}km.`,
          fact_ids: li.fact_ids,
        });
        break;
      }

      // -------------------------------------------------
      // WORST COMPETITION (numeric from params)
      // -------------------------------------------------
      case "WORST_COMPETITION_LOCAL_REGIONAL": {
        const localR = li.params?.local_radius_km ?? 10;
        const regionalR = li.params?.regional_radius_km ?? 50;
        const c10 = li.params?.c10;
        const c50 = li.params?.c50;

        lines.push({
          kind: "fact",
          text_fr:
            `Concurrence: ${safeNum(c10)} événement(s) ≤${String(
              localR
            )}km, ` +
            `${safeNum(c50)} dans un rayon de ${String(regionalR)}km.`,
          fact_ids: li.fact_ids,
        });
        break;
      }

      // -------------------------------------------------
      // WINNER PRIMARY DRIVER
      // -------------------------------------------------
      case "WINNER_PRIMARY_DRIVER": {
        const f = facts[0];
        lines.push({
          kind: "fact",
          text_fr: f?.label_fr ?? "Driver principal: ND",
          fact_ids: li.fact_ids,
        });
        break;
      }

      // -------------------------------------------------
      // WORST PRIMARY DRIVER
      // -------------------------------------------------
      case "WORST_PRIMARY_DRIVER": {
        const f = facts[0];
        lines.push({
          kind: "fact",
          text_fr: f?.label_fr ?? "Driver principal: ND",
          fact_ids: li.fact_ids,
        });
        break;
      }

      // -------------------------------------------------
      // EVIDENCE INCOMPLETE
      // -------------------------------------------------
      case "EVIDENCE_INCOMPLETE": {
        lines.push({
          kind: "caveat",
          text_fr:
            "Preuves incomplètes: certaines dimensions peuvent être absentes; rester prudent dans l’interprétation.",
          fact_ids: li.fact_ids,
        });
        break;
      }

      // -------------------------------------------------
      // ALTERNATIVE SUMMARY (numeric from params)
      // -------------------------------------------------
      case "ALTERNATIVE_SUMMARY": {
        const date = String(li.params?.date ?? "ND");

        // FIX 3 — sanitize regime formatting
        const regime = String(li.params?.regime ?? "ND")
          .replace(/^R(é|e)gime\s*/i, "");

        const score = li.params?.score;
        const alert = li.params?.alert_level_max;
        const c10 = li.params?.c10;
        const localR = li.params?.local_radius_km ?? 10;

        lines.push({
          kind: "fact",
          text_fr:
            `Alternative: ${date} ` +
            `(Régime ${regime}, ` +
            `score ${safeRounded(score)}, ` +
            `météo ${safeNum(alert)}, ` +
            `concurrence ≤${String(localR)}km ${safeNum(c10)})`,
          fact_ids: li.fact_ids,
        });
        break;
      }

      // -------------------------------------------------
      // LOOKUP EVENT FOUND
      // -------------------------------------------------
      case "LOOKUP_EVENT_FOUND": {
        const label = String(li.params?.event_label ?? "Événement");
        const date = String(li.params?.event_date ?? "");
        const city = String(li.params?.city_name ?? "");
        const distM = li.params?.distance_m;
        const source = String(li.params?.source_system ?? "");

        const parts: string[] = [];
        if (date) parts.push(date);
        if (city) parts.push(city);
        if (typeof distM === "number" && Number.isFinite(distM)) {
          parts.push(`${Math.round(distM)} m`);
        }
        if (source) parts.push(source);

        const suffix = parts.length ? ` — ${parts.join(" · ")}` : "";

        lines.push({
          kind: "headline",
          text_fr: `Événement trouvé : ${label}${suffix}`,
          fact_ids: li.fact_ids,
        });
        break;
      }

      // -------------------------------------------------
      // LOOKUP EVENT NOT FOUND
      // -------------------------------------------------
      case "LOOKUP_EVENT_NOT_FOUND": {
        lines.push({
          kind: "headline",
          text_fr: `Aucun événement correspondant n’a été trouvé.`,
          fact_ids: li.fact_ids,
        });
        break;
      }

      // -------------------------------------------------
      // Default fallback (hardened)
      // -------------------------------------------------
      default: {
        // FIX 2 — enforce valid kind fallback
        const kind = li.kind ?? "fact";
        lines.push({
          kind,
          text_fr: facts[0]?.label_fr ?? "ND",
          fact_ids: li.fact_ids,
        });
        break;
      }
    }
  }

  return lines;
}
