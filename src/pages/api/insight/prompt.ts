console.log("API route loaded");
import type { APIRoute } from "astro";
import { BigQuery } from "@google-cloud/bigquery";
import { runAIPackagerClaude } from "../../../lib/ai/runtime/runPackager";
import { compareDatesDeterministicV1 } from "../../../lib/ai/decision/engines/compare_dates";
import { renderLineItemsFrV1 } from "../../../lib/ai/render/renderLineItemsFr.v1";
import { renderDayWhyV1 } from "../../../lib/ai/decision/day_why/day_why_v1";
import { windowTopDaysDeterministic } from "../../../lib/ai/decision/top_days/window_top_days";
import { windowWorstDaysDeterministic } from "../../../lib/ai/decision/worst_days/window_worst_days";
import { buildUiPackagingV3Month } from "../../../lib/ai/ui_packaging_v3/buildUiPackagingV3Month";
import { buildUiNormalizedV2 } from "../../../lib/ai/ui_normalized/ui_normalized_v2";
import { buildLookupIRV1FromRow } from "../../../components/ai/ir/lookup_ir_v1";
import { assertNoSentenceWithoutFactIdV1 } from "../../../lib/ai/assertions/assertions_v1"; 
import type { FactV1, LineItemV1 } from "../../../lib/ai/contracts/facts_v1";
import { buildWindowIRV1 } from "../../../lib/ai/decision/window/window_ir_v1";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

const DEV_BYPASS_PROMPT = import.meta.env.DEV && process.env.MS_AUTH_BYPASS === "1";

function requireString(v: unknown, name: string): string {
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`Missing or invalid field: ${name}`);
  }
  return v.trim();
}

type ResolvedHorizon =
  | "month"              // rolling 30d
  | "calendar_month"     // explicit named month (e.g. "en février")
  | "day"
  | "selected_days"
  | "lookup_event";      // informational (non-scoring)

const SUPPORTED_DIMS = new Set<string>(["WEATHER", "NEARBY_EVENTS", "CALENDAR"]);

type ScoringIntent =
  | "WINDOW_TOP_DAYS"
  | "WINDOW_WORST_DAYS"
  | "WINDOW_FILTER_DAYS"
  | "WINDOW_PATTERNS"
  | "WINDOW_COMBINED_TRADEOFF"
  | "DAY_WHY"
  | "DAY_DIMENSION_DETAIL"
  | "COMPARE_DATES"
  | "DRIVER_PRIMARY"
  | "INTENT_UNKNOWN";

type Intent = ScoringIntent | "EVENT_LOOKUP" | "LOOKUP_EVENT";

function isScoringIntent(i: Intent): i is ScoringIntent {
  return i !== "EVENT_LOOKUP" && i !== "LOOKUP_EVENT";
}

function isScoringPayload(p: DecisionPayload): p is Extract<DecisionPayload, { kind: "scoring" }> {
  return p.kind === "scoring";
}

type ApiAction = { type: "redirect"; url: string; label: string };
type ApiActions = {
  month_redirect_url: string | null; // backward compatible
  primary: ApiAction | null;
  secondary: ApiAction[];
};

type AiResponseV1 = {
  headline: string;
  answer: string;
  reasons: string[];
  key_facts: string[];
  actions: ApiActions;
  caveats: string[];
  meta: {
    horizon: ResolvedHorizon;
    intent: Intent;
    used_dates: string[];

    // 🔐 Canonical link to truth-based decision
    decision_payload_ref?: {
      horizon: ResolvedHorizon;
      intent: Intent;
      used_dates: string[];
      source: "decision_payload";
    };
  };
};

type ThreadContextV1 = {
  v: 1;
  location_id: string;
  turn: number;
  last: null | {
    horizon: ResolvedHorizon | null;
    intent: Intent | null;
    used_dates: string[]; // YYYY-MM-DD[]
    top_dates: { date: string; regime: string | null; score: number | null }[];
    month_redirect_url: string | null;
    selected_date?: string | null; // optional anchor
  };
};

// ----------------------------
// DECISION PAYLOAD (CANONICAL, TRUTH-BASED)
// ----------------------------

type DecisionSignalDriver =
  | "weather_precipitation"
  | "weather_wind"
  | "weather_temperature"
  | "weather_alert"
  | "competition_local"
  | "competition_regional"
  | "tourism_pressure"
  | "mobility_disruption"
  | "calendar_constraint";

type DecisionSignalImpact = "neutral" | "risk" | "blocking";

type DecisionSignal = {
  // If false: the signal is explicitly present but cannot be computed from available truth fields.
  applicable: boolean;

  // Must be non-empty when applicable=true.
  primary_drivers: DecisionSignalDriver[];

  // Contextual interpretation, but MUST remain truth-based / derived from available fields.
  impact: DecisionSignalImpact;

  // Raw facts used to compute the signal (directly traceable to semantic views / context).
  facts: Record<string, number | string | boolean | null>;

  // 1 short factual sentence, no marketing, no hidden heuristics.
  explanation: string;
};

type DecisionSignals = {
  weather?: DecisionSignal;
  competition?: DecisionSignal;
  tourism?: DecisionSignal;
  mobility?: DecisionSignal;
  calendar?: DecisionSignal;
};

type DecisionPayload =
  | {
      kind: "scoring";
      horizon: "month" | "calendar_month" | "day" | "selected_days";
      intent: ScoringIntent;
      used_dates: string[];
      signals: DecisionSignals;
    }
  | {
      kind: "lookup";
      horizon: "lookup_event";
      intent: "EVENT_LOOKUP";
      used_dates: string[]; // keep for meta symmetry; empty
      signals: {};          // or omit, but keeping avoids churn in JSON shape
    };


function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x : String(x))).filter((s) => s.trim().length > 0);
}

function normalizeAiOutput(
  ai: any,
  meta: AiResponseV1["meta"],
  actions: ApiActions
): AiResponseV1 {
  const out = ai?.output;

  const metaWithDecisionRef: AiResponseV1["meta"] = {
    ...meta,
    decision_payload_ref: {
      horizon: meta.horizon,
      intent: meta.intent,
      used_dates: meta.used_dates,
      source: "decision_payload",
    },
  };

  // Case 1: already normalized (strict)
  if (
    out &&
    typeof out === "object" &&
    typeof out.headline === "string" &&
    typeof out.answer === "string" &&
    Array.isArray(out.reasons) &&
    Array.isArray(out.key_facts) &&
    out.actions &&
    typeof out.actions === "object" &&
    "primary" in out.actions &&
    "secondary" in out.actions
  ) {
    return {
      headline: out.headline,
      answer: out.answer,
      reasons: asStringArray(out.reasons),
      key_facts: asStringArray(out.key_facts),
      actions,
      caveats: asStringArray(out.caveats),
      meta: metaWithDecisionRef,
    };
  }

  // Case 2: deterministic objects: {headline, summary|answer, key_facts, caveat|caveats}
  if (out && typeof out === "object") {
    const headline =
      typeof out.headline === "string" && out.headline.trim()
        ? out.headline.trim()
        : "Résumé";

    const bulletsTxt =
      Array.isArray(out.bullets) && out.bullets.length
        ? asStringArray(out.bullets).filter(Boolean)
        : [];
    
    // Build key_facts early so we can use them as a truth-based answer fallback.
    const key_facts =
      Array.isArray(out.key_facts) ? asStringArray(out.key_facts)
      : Array.isArray(out.facts) ? asStringArray(out.facts)
      : Array.isArray(out.bullets) ? asStringArray(out.bullets)
      : [];

    const answer =
      typeof out.answer === "string" && out.answer.trim()
        ? out.answer.trim()
        : (typeof out.summary === "string" && out.summary.trim()
            ? out.summary.trim()
            : (bulletsTxt.length
                ? `• ${bulletsTxt.slice(0, 5).join("\n• ")}`
                : (key_facts.length
                    ? `• ${key_facts.slice(0, 5).join("\n• ")}`
                    : "Résumé basé sur les données disponibles.")));

    const reasons =
      Array.isArray(out.reasons) ? asStringArray(out.reasons)
      : Array.isArray(out.why) ? asStringArray(out.why)
      : Array.isArray(out.reasons_short) ? asStringArray(out.reasons_short)
      : [];

    const caveats =
      typeof out.caveat === "string" && out.caveat.trim()
        ? [out.caveat.trim()]
        : Array.isArray(out.caveats) ? asStringArray(out.caveats)
        : [];

    const isDeterministicMode =
      typeof ai?.mode === "string" && ai.mode.startsWith("deterministic_");

    return {
      headline,
      answer, // ✅ use the computed answer (summary/bullets/key_facts fallback)
      // Deterministic engines are allowed to ship user-facing key_facts.
      // We control duplication elsewhere (conversation layer / deterministic_reasons).
      reasons: isDeterministicMode ? [] : (
        (Array.isArray(out.reasons) && out.reasons.length)
          ? asStringArray(out.reasons)
          : bulletsTxt
      ),
      key_facts: key_facts,
      actions,
      caveats,
      meta: metaWithDecisionRef,
    };
  }

  // Case 3: out is a string (raw)
  if (typeof out === "string" && out.trim()) {
    return {
      headline: "Résumé",
      answer: out.trim(),
      reasons: [],
      key_facts: [],
      actions,
      caveats: [],
      meta: metaWithDecisionRef,
    };
  }

  // Fallback: use raw_text if present
  const raw = typeof ai?.raw_text === "string" ? ai.raw_text.trim() : "";
  return {
    headline: "Résumé",
    answer: raw || "Je n’ai pas pu produire une réponse utile avec les données disponibles.",
    reasons: [],
    key_facts: [],
    actions,
    caveats: raw ? ["Sortie AI brute utilisée (raw_text)."] : ["Sortie AI vide ou illisible."],
    meta: metaWithDecisionRef,
  };
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/\s+/g, " ")
    .trim();
}

function resolveIntentFromText(qRaw: string, horizon: ResolvedHorizon): ScoringIntent {
  const q = norm(qRaw);

  // Comparison dominates everything
  if (
    horizon === "selected_days" ||
    q.includes("entre ces") ||
    q.includes("compar") ||
    q.includes("difference") ||
    q.includes("laquelle") ||
    q.includes(" vs ")
  ) return "COMPARE_DATES";

  // Day-level intents
  if (horizon === "day") {
    if (q.includes("pourquoi") || q.includes("qu est-ce qui") || q.includes("3 elements")) {
      return "DAY_WHY";
    }

    if (
      q.includes("meteo") || q.includes("pluie") || q.includes("vent") || q.includes("alerte") ||
      q.includes("evenement") || q.includes("concurrence") ||
      q.includes("tourisme") || q.includes("affluence") ||
      q.includes("mobilite") || q.includes("trafic") || q.includes("deplacement") || q.includes("transport")
    ) {
      return "DAY_DIMENSION_DETAIL";
    }

    return "DAY_WHY";
  }

  // Primary driver / factor
  if (
    q.includes("principal") ||
    q.includes("facteur") ||
    q.includes("point de vigilance") ||
    q.includes("complique le plus") ||
    q.includes("surtout a cause")
  ) return "DRIVER_PRIMARY";

  // Patterns / streaks / trends
  if (
    q.includes("periode") ||
    q.includes("plusieurs jours") ||
    q.includes("consecut") ||
    q.includes("fenetre") ||
    q.includes("tendance") ||
    q.includes("a partir de quand") ||
    q.includes("s ameliore") ||
    q.includes("devient")
  ) return "WINDOW_PATTERNS";

  // Combined / tradeoff
  if (
    q.includes("equilibre") ||
    q.includes("compromis") ||
    q.includes("cumul") ||
    q.includes("plusieurs contraintes") ||
    q.includes("moins de contraintes")
  ) return "WINDOW_COMBINED_TRADEOFF";

  // Worst / avoid
  if (
    q.includes("a eviter") ||
    q.includes("a éviter") ||
    q.includes("deconseille") ||
    q.includes("déconseillé") ||
    q.includes("defavorable") ||
    q.includes("défavorable") ||
    q.includes("moins favorable") ||
    q.includes("moins favorables") ||
    q.includes("moins adapte") ||
    q.includes("moins adapté") ||
    q.includes("plus complique") ||
    q.includes("plus compliqué") ||
    q.includes("plus risque") ||
    q.includes("plus risqué") ||
    q.includes("pire") ||
    q.includes("pires") ||
    q.includes("pirs") ||
    q.includes("mauvais jours") ||
    q.includes("jours a eviter") ||
    q.includes("jours à éviter")
  ) return "WINDOW_WORST_DAYS";

  // ✅ Explicit “filter” intent (ONLY when user asks to filter/match criteria)
  // IMPORTANT: mere mention of a dimension (concurrence/pluie/vent/...) must NOT flip to filter.
  const asksToFilter =
    q.includes("correspond") ||            // "jours correspondant à..."
    q.includes("filtr") ||                 // "filtrer"
    q.includes("tri") ||                   // "trier"
    q.includes("uniquement") ||            // "uniquement"
    q.includes("seulement") ||             // "seulement"
    q.includes("montre moi") ||            // "montre-moi les jours..."
    q.includes("liste") ||                 // "liste des jours..."
    q.includes("quels jours") ||           // typical filter ask
    q.includes("jours ou") || q.includes("jours où") || // "jours où il pleut"
    q.includes("sans ") ||                 // "sans pluie"
    q.includes("pas de ") ||               // "pas de pluie"
    q.includes("aucun ") || q.includes("aucune ") ||    // "aucune concurrence"
    q.includes("peu de ") ||               // "peu de vent"
    q.includes("hors ");                   // "hors week-end"

  const mentionsDimensions =
    q.includes("meteo") || q.includes("météo") || q.includes("pluie") || q.includes("vent") || q.includes("alerte") || q.includes("temperature") || q.includes("température") ||
    q.includes("evenement") || q.includes("événement") || q.includes("evenements") || q.includes("événements") || q.includes("concurrence") || q.includes("festival") || q.includes("marche") || q.includes("marché") ||
    q.includes("tourisme") || q.includes("affluence") ||
    q.includes("mobilite") || q.includes("mobilité") || q.includes("trafic") || q.includes("transport") || q.includes("deplacement") || q.includes("déplacement");

  if (asksToFilter && mentionsDimensions) return "WINDOW_FILTER_DAYS";

  // Default: best days
  return "WINDOW_TOP_DAYS";
}

/**
 * Truth-based routing only (no AI).
 * - month: planning / window questions
 * - day: "why this day", "ce jour", or a specific date is provided
 * - selected_days: explicit comparison / multiple dates
 */
function resolveHorizonFromText(q: string): ResolvedHorizon {
  const s = norm(q);

  const dateMatches = [
    ...String(q ?? "").matchAll(/\b\d{4}-\d{2}-\d{2}\b/g),
    ...String(q ?? "").matchAll(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g),
  ];
  const hasTwoDates = dateMatches.length >= 2;

  if (
    hasTwoDates ||
    s.includes("compar") ||
    s.includes("entre") ||
    s.includes(" vs ") ||
    s.includes("vs ")
  ) {
    return "selected_days";
  }

  const hasExplicitDate = dateMatches.length >= 1;

  const hasRelativeWeekday =
    /\b(ce|cette)\s+(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/.test(s) ||
    /\b(aujourd'hui|aujourdhui|demain)\b/.test(s);

  if (
    s.includes("pourquoi") ||
    s.includes("ce jour") ||
    s.includes("date precise") ||
    hasExplicitDate ||
    hasRelativeWeekday
  ) {
    return "day";
  }

  return "month";
}

function resolveTopKFromText(qRaw: string): number {
  const s = norm(qRaw);

  // patterns explicites
  const m = s.match(/\btop\s*(\d{1,2})\b/);
  if (m?.[1]) {
    const k = Number(m[1]);
    if (Number.isFinite(k)) return Math.max(1, Math.min(7, Math.floor(k)));
  }

  const m2 = s.match(/\b(\d{1,2})\s*(meilleur|meilleurs|meilleures|premier|premiers|premières)\b/);
  if (m2?.[1]) {
    const k = Number(m2[1]);
    if (Number.isFinite(k)) return Math.max(1, Math.min(7, Math.floor(k)));
  }

  // formes littérales FR (minimal, déterministe)
  if (s.includes("les deux") || s.includes("deux meilleurs") || s.includes("deux meilleures") || s.includes("top deux")) return 2;
  if (s.includes("les trois") || s.includes("trois meilleurs") || s.includes("trois meilleures") || s.includes("top trois")) return 3;

  // défaut (ton comportement actuel)
  return 3;
}

function wantsWeekendOnly(qRaw: string): boolean {
  const q = norm(qRaw);
  return q.includes("weekend") || q.includes("week-end") || q.includes("week end");
}

function addDaysYmd(ymd: string, deltaDays: number): string {
  // ymd: YYYY-MM-DD (UTC)
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

function toBoolOrNullStrict(v: any): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : null;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
    return null;
  }
  return null;
}

function toBoolOrNullLocal(v: any): boolean | null {
  return toBoolOrNullStrict(v);
}

function isEventLookupQuestion(q: string): boolean {
  const s = norm(q ?? "");

  const lookupPhrase =
    s.includes("a quelle date") ||
    s.includes("c est quand") ||
    s.includes("quand a lieu") ||
    s.includes("dates de ") ||
    s.includes("date de debut") ||
    s.includes("date de fin");

  if (!lookupPhrase) return false;

  const hasScoringKeywords =
    s.includes("meilleur") ||
    s.includes("meilleurs") ||
    s.includes("top") ||
    s.includes("pire") ||
    s.includes("eviter") ||
    s.includes("defavorable") ||
    s.includes("periode stable") ||
    s.includes("tendance") ||
    s.includes("sequence") ||
    s.includes("compar") ||
    s.includes("entre") ||
    s.includes(" vs ") ||
    s.includes("vs ");

  return !hasScoringKeywords;
}

function adaptDayFactsByDate(ir: any): Record<string, any[]> {
  if (!ir?.date || !Array.isArray(ir?.facts)) {
    throw new Error("DayWhy IR missing date or facts");
  }
  return { [ir.date]: ir.facts };
}

function adaptDayLineItems(
  irLineItems: any[]
): import("../../../lib/ai/contracts/facts_v1").LineItemV1[] {

  return (irLineItems ?? []).map((li, idx) => {

    // Accept legacy DayWhy shape: { fact_id, text_fr, kind }
    if (typeof li?.fact_id === "string" && li.fact_id.trim() !== "") {
      return {
        kind:
          li.kind === "action"
            ? "implication"
            : li.kind === "risk"
            ? "caveat"
            : "fact",

        template_id: "HEADLINE_DAY_WHY",

        fact_ids: [li.fact_id],

        params: {
          text_override: li.text_fr ?? "",
        },
      };
    }

    // Accept already-canonical shape (future-proof)
    if (Array.isArray(li?.fact_ids) && li.fact_ids.length > 0) {
      return {
        kind: li.kind ?? "fact",
        template_id: li.template_id ?? "HEADLINE_DAY_WHY",
        fact_ids: li.fact_ids,
        params: li.params ?? {},
      };
    }

    throw new Error(`DayWhy LineItem[${idx}] invalid shape`);
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  // ----------------------------
  // CONVERSATION LAYER (V1) — shapes normalized_ai only (no truth changes)
  // ----------------------------
  
  // DATE EXTRACTION (V1) — supports YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY
  function ymdFromYyyyMmDd(y: number, m: number, d: number): string | null {
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    if (y < 1900 || y > 2100) return null;
    if (m < 1 || m > 12) return null;
    if (d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    // Reject invalid rollovers (e.g. 31/02)
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== (m - 1) || dt.getUTCDate() !== d) return null;
    return dt.toISOString().slice(0, 10);
  }

  type DateMentions = {
    dates: string[];               // YYYY-MM-DD
    hasDateToken: boolean;         // detected something date-like (numeric OR FR month words)
    unparsedDateToken: boolean;    // had a token but could not produce any date
  };

  // Drop-in replacement. Keep your existing helper:
  // function ymdFromYyyyMmDd(y: number, m: number, d: number): string | null { ... }

  function extractDateMentions(qRaw: string, anchorYmd?: string): DateMentions {
    const q = String(qRaw ?? "");
    const out: string[] = [];
    let hasToken = false;
    let unparsedToken = false;

    const anchor =
      typeof anchorYmd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(anchorYmd)
        ? anchorYmd
        : null;

    const anchorYear = anchor ? Number(anchor.slice(0, 4)) : null;
    const anchorMonth = anchor ? Number(anchor.slice(5, 7)) : null;

    // Default year for FR "1 juin" tokens when the query contains a year somewhere ("... 2026")
    const yearHit = q.match(/\b(20\d{2})\b/);
    const defaultYearFromQuery: number | null = yearHit ? Number(yearHit[1]) : null;

    function yearForMonthNoYear(mo: number): number | null {
      // priority: explicit year in query, else anchor year
      const baseYear = defaultYearFromQuery ?? anchorYear;
      if (!baseYear) return null;

      // roll to next year only when year is not explicit in question
      if (anchorMonth && mo < anchorMonth && defaultYearFromQuery == null) {
        return baseYear + 1;
      }
      return baseYear;
    }

    // Normalize for robust French month matching (strip accents)
    const qNorm = q
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    // ---------- Numeric / ISO ----------
    // YYYY-MM-DD
    for (const m of q.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
      hasToken = true;
      const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
      const ymd = ymdFromYyyyMmDd(y, mo, d);
      if (ymd) out.push(ymd);
    }

    // YYYY/MM/DD
    for (const m of q.matchAll(/\b(\d{4})\/(\d{1,2})\/(\d{1,2})\b/g)) {
      hasToken = true;
      const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
      const ymd = ymdFromYyyyMmDd(y, mo, d);
      if (ymd) out.push(ymd);
    }

    // DD/MM/YYYY
    for (const m of q.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) {
      hasToken = true;
      const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
      const ymd = ymdFromYyyyMmDd(y, mo, d);
      if (ymd) out.push(ymd);
    }

    // DD-MM-YYYY (FR common)
    for (const m of q.matchAll(/\b(\d{1,2})-(\d{1,2})-(\d{4})\b/g)) {
      hasToken = true;
      const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
      const ymd = ymdFromYyyyMmDd(y, mo, d);
      if (ymd) out.push(ymd);
    }

    // ---------- French natural language (robust to accents) ----------
    // ASCII-only month keys (since qNorm is de-accented)
    const MONTHS_FR: Record<string, number> = {
      janvier: 1,
      fevrier: 2,
      mars: 3,
      avril: 4,
      mai: 5,
      juin: 6,
      juillet: 7,
      aout: 8,
      septembre: 9,
      octobre: 10,
      novembre: 11,
      decembre: 12,
    };

    const monthAlternation = Object.keys(MONTHS_FR)
      .map((s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
      .join("|");

    // Token detection: any French month word anywhere (in normalized string)
    const monthWordRe = new RegExp(`(?:^|[^a-z])(${monthAlternation})(?=[^a-z]|$)`, "i");
    if (monthWordRe.test(qNorm)) hasToken = true;

    // Helper: allow "1er" (in either raw or norm; norm keeps "1er")
    const dayAtom = "(?:\\d{1,2}|1er)";
    const weekdayOpt = "(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)";

    // Case B first (list), but STRICT: must contain at least a comma OR 'et'/'&'
    // "1, 2 et 3 juin 2026" / "1 et 3 juin 2026" / "1,2,3 juin 2026"
    // IMPORTANT: requires (,|et|&) so it won't match a single date.
    const frListRe = new RegExp(
      `((?:${dayAtom})(?:\\s*,\\s*(?:${dayAtom}))*\\s*(?:\\s*(?:et|&)\\s*(?:${dayAtom}))?)\\s+(${monthAlternation})\\s+(\\d{4})(?=[^0-9a-z]|$)`,
      "gi"
    );

    // We'll only accept list matches where the "listPart" actually contains a separator.
    for (const m of qNorm.matchAll(frListRe)) {
      const listPart = m[1];
      const hasSep = /,|\bet\b|&/i.test(listPart);
      if (!hasSep) continue; // prevents double-match of single dates

      hasToken = true;
      const mo = MONTHS_FR[m[2]];
      const y0 = Number(m[3]);
      const y = Number.isFinite(y0) ? y0 : defaultYearFromQuery;

      // If we have day+month but still no year, we cannot produce YYYY-MM-DD deterministically.
      if (!y) {
        unparsedToken = true;
        continue;
      }

      for (const dm of listPart.matchAll(new RegExp(`\\b(\\d{1,2}|1er)\\b`, "g"))) {
        const dayRaw = dm[1] === "1er" ? "1" : dm[1];
        const d = Number(dayRaw);
        const ymd = ymdFromYyyyMmDd(y, mo, d);
        if (ymd) out.push(ymd);
      }
    }

    // Case B2: "1, 2 et 3 juin" (no year) => anchor year
    const frListNoYearRe = new RegExp(
      `((?:${dayAtom})(?:\\s*,\\s*(?:${dayAtom}))*\\s*(?:\\s*(?:et|&)\\s*(?:${dayAtom}))?)\\s+(${monthAlternation})(?=[^a-z]|$)`,
      "gi"
    );

    for (const m of qNorm.matchAll(frListNoYearRe)) {
      const listPart = m[1];
      const hasSep = /,|\bet\b|&/i.test(listPart);
      if (!hasSep) continue;

      hasToken = true;
      const mo = MONTHS_FR[m[2]];

      const y = yearForMonthNoYear(mo);
      if (!y) {
        unparsedToken = true;
        continue;
      }

      for (const dm of listPart.matchAll(new RegExp(`\\b(\\d{1,2}|1er)\\b`, "g"))) {
        const dayRaw = dm[1] === "1er" ? "1" : dm[1];
        const d = Number(dayRaw);
        const ymd = ymdFromYyyyMmDd(y, mo, d);
        if (ymd) out.push(ymd);
        else unparsedToken = true;
      }
    }

    // Case A: "mardi 2 juin 2026" or "2 juin 2026" or "1er juin 2026"
    // Use normalized string; boundary via non-letter guards, not \b.
    const frSingleRe = new RegExp(
      `(?:^|[^a-z])(?:${weekdayOpt}\\s+)?(${dayAtom})\\s+(${monthAlternation})\\s+(\\d{4})(?=[^0-9a-z]|$)`,
      "gi"
    );

    for (const m of qNorm.matchAll(frSingleRe)) {
      hasToken = true;
      const dayRaw = m[1] === "1er" ? "1" : m[1];
      const d = Number(dayRaw);
      const mo = MONTHS_FR[m[2]];
      const y = Number(m[3]);
      const ymd = ymdFromYyyyMmDd(y, mo, d);
      if (ymd) out.push(ymd);
    }

    // Case A2: "mardi 2 juin" / "2 juin" / "1er juin" (no year) => anchor year
    const frSingleNoYearRe = new RegExp(
      `(?:^|[^a-z])(?:${weekdayOpt}\\s+)?(${dayAtom})\\s+(${monthAlternation})(?=[^a-z]|$)`,
      "gi"
    );

    for (const m of qNorm.matchAll(frSingleNoYearRe)) {
      hasToken = true;

      const dayRaw = m[1] === "1er" ? "1" : m[1];
      const d = Number(dayRaw);
      const mo = MONTHS_FR[m[2]];

      const y = yearForMonthNoYear(mo);
      if (!y) {
        unparsedToken = true;
        continue;
      }

      const ymd = ymdFromYyyyMmDd(y, mo, d);
      if (ymd) out.push(ymd);
      else unparsedToken = true;
    }

    // ---------- Unique, stable order ----------
    const seen = new Set<string>();
    const uniq: string[] = [];
    for (const d of out) {
      if (!seen.has(d)) {
        seen.add(d);
        uniq.push(d);
      }
    }

    const unparsed = unparsedToken || (hasToken && uniq.length === 0);
    return { dates: uniq, hasDateToken: hasToken, unparsedDateToken: unparsed };
  }

  function formatDateFr(d: any): string | null {
    if (!d) return null;

    const raw =
      typeof d === "string"
        ? d
        : typeof d === "object" && typeof d.value === "string"
        ? d.value
        : null;

    if (!raw) return null;

    const date = new Date(raw);
    if (isNaN(date.getTime())) return raw; // fallback safe

    return date.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }

  function fmtDateFrFull(ymd: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
    const [y, m, d] = ymd.split("-").map((x) => Number(x));
    const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
    return new Intl.DateTimeFormat("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(dt);
  }

  function fmtDateFr(ymd: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
    const [y, m, d] = ymd.split("-").map((x) => Number(x));
    const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
    return new Intl.DateTimeFormat("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "long",
    }).format(dt);
  }

  function toFiniteNumOrNullLocal(v: any): number | null {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function buildCompareKeyFactsFallback(selectedRows: any[]): string[] {
    const rows = Array.isArray(selectedRows) ? selectedRows : [];

    return rows
      .slice()
      .sort((a, b) => ymdFromAnyDateLocal(a?.date).localeCompare(ymdFromAnyDateLocal(b?.date)))
      .map((r) => {
        const d = ymdFromAnyDateLocal(r?.date);
        const dFr = fmtDateFr(d);

        const reg = String(r?.opportunity_regime ?? "ND");
        const score = toFiniteNumOrNullLocal(r?.opportunity_score_final_local);
        const alert = toFiniteNumOrNullLocal(
          r?.alert_level_max ??            // selected_days surface (common)
          r?.weather_alert_level ??        // month/day surface
          r?.weather_alert?.level ??       // nested struct (if any)
          r?.weather_alert_level_max       // alt naming
        );
        const pr = toFiniteNumOrNullLocal(
          r?.precip_probability_max_pct ??
          r?.precipitation_probability_max_pct
        );

        const wi = toFiniteNumOrNullLocal(r?.wind_speed_10m_max);
        const c10 = toFiniteNumOrNullLocal(r?.events_within_10km_count);
        const c50 = toFiniteNumOrNullLocal(r?.events_within_50km_count);

        const scoreTxt = score === null ? "ND" : String(Math.round(score));
        const alertTxt = alert === null ? "ND" : String(Math.round(alert));
        const prTxt = pr === null ? "ND" : String(Math.round(pr));
        const wiTxt = wi === null ? "ND" : String(Math.round(wi));
        const c10Txt = c10 === null ? "ND" : String(Math.round(c10));
        const c50Txt = c50 === null ? "ND" : String(Math.round(c50));

        return `${dFr} — Régime ${reg}, score ${scoreTxt} · Météo: alerte ${alertTxt}, pluie ${prTxt}%, vent ${wiTxt} · Concurrence: ≤10km ${c10Txt}, ≤50km ${c50Txt}`;
      });
  }
  
  // ----------------------------
  // DECISION SIGNALS (CONTEXTUAL, TRUTH-BASED)
  // ----------------------------

  type SignalKey = keyof DecisionSignals;

  // ---- local helpers (must live here because the rest are declared inside try{}) ----
  function toNumLocal(v: unknown): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function ymdFromAnyDateLocal(v: any): string {
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 10);
    if (v && typeof v === "object" && typeof v.value === "string") return v.value.trim().slice(0, 10);
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
    return "(date inconnue)";
  }

  type CompetitionScopeLocal = "local" | "regional" | "none";

  function deriveCompetitionScopeLocal(r: any): CompetitionScopeLocal {
    const c5 = toNumLocal(r?.events_within_5km_count);
    const c10 = toNumLocal(r?.events_within_10km_count);
    const c50 = toNumLocal(r?.events_within_50km_count);

    const has5 = Number.isFinite(c5) && c5 > 0;
    const has10 = Number.isFinite(c10) && c10 > 0;
    const has50 = Number.isFinite(c50) && c50 > 0;

    if (has5) return "local";
    if (has10) return "local";
    if (has50) return "regional";
    return "none";
  }

  function deriveCompetitionExplainLocal(r: any): string {
    const c5 = toNumLocal(r?.events_within_5km_count);
    const c10 = toNumLocal(r?.events_within_10km_count);
    const c50 = toNumLocal(r?.events_within_50km_count);

    const c5Txt = Number.isFinite(c5) ? String(Math.round(c5)) : "ND";
    const c10Txt = Number.isFinite(c10) ? String(Math.round(c10)) : "ND";
    const c50Txt = Number.isFinite(c50) ? String(Math.round(c50)) : "ND";

    const scope = deriveCompetitionScopeLocal(r);

    if (scope === "none") return "Concurrence: aucune pression détectée (≤10/50km à 0 ou ND).";
    if (scope === "local") return `Concurrence directe: ${c5Txt} évts ≤5km | ${c10Txt} évts ≤10km | ${c50Txt} évts ≤50km.`;
    return `Concurrence régionale: 0 à ≤10km; ${c50Txt} évts ≤50km.`;
  }

  function qHasAny(q: string, needles: string[]): boolean {
    const s = norm(q);
    return needles.some((n) => s.includes(n));
  }

  function requestedSignalKeys(q: string, intent: ScoringIntent): Set<SignalKey> {
    const keys = new Set<SignalKey>();

    // Explicit dimension questions
    if (qHasAny(q, ["meteo", "météo", "pluie", "vent", "temperature", "température", "alerte"])) keys.add("weather");
    if (qHasAny(q, ["evenement", "événement", "evenements", "événements", "concurrence", "festival", "marché", "marche"])) keys.add("competition");
    if (qHasAny(q, ["week-end", "weekend", "férié", "ferie", "vacances", "calendrier"])) keys.add("calendar");
    if (qHasAny(q, ["tourisme", "touristes", "affluence"])) keys.add("tourism");
    if (qHasAny(q, ["mobilite", "mobilité", "trafic", "transport", "deplacement", "déplacement", "circulation"])) keys.add("mobility");

    // Driver intent implies we return what we can compute today
    if (intent === "DRIVER_PRIMARY") {
      keys.add("competition");
      keys.add("weather");
      keys.add("calendar");
    }

    // Combined/tradeoff implies we return all available truth-driven dimensions
    if (intent === "WINDOW_COMBINED_TRADEOFF") {
      keys.add("competition");
      keys.add("weather");
      keys.add("calendar");
    }

    // ✅ Default signals for month "top/worst" planning questions (truth-based; no hidden heuristics)
    // Rationale: user asked for "best dates" => they implicitly ask "why these dates".
    if (keys.size === 0 && (intent === "WINDOW_TOP_DAYS" || intent === "WINDOW_WORST_DAYS")) {
      keys.add("weather");
      keys.add("competition");
      keys.add("calendar");
    }

    return keys;
  }

  type VenueExposure = "indoor" | "outdoor" | "unknown";

  function inferVenueExposureFromContext(ctx: any): { exposure: VenueExposure; basis: string } {
    const lt = String(ctx?.location_type ?? "").toLowerCase();
    const ca = String(ctx?.company_activity_type ?? "").toLowerCase();
    const ep = String(ctx?.event_time_profile ?? "").toLowerCase();

    const hay = [lt, ca, ep].filter(Boolean).join(" | ");

    // Truth-based: only string evidence, no guess beyond tokens
    if (hay.includes("outdoor") || hay.includes("exterieur") || hay.includes("extérieur") || hay.includes("plein air") || hay.includes("plein_air")) {
      return { exposure: "outdoor", basis: "vw_insight_event_ai_location_context: location_type/company_activity_type/event_time_profile contient un marqueur extérieur" };
    }
    if (hay.includes("indoor") || hay.includes("interieur") || hay.includes("intérieur")) {
      return { exposure: "indoor", basis: "vw_insight_event_ai_location_context: location_type/company_activity_type/event_time_profile contient un marqueur intérieur" };
    }

    return { exposure: "unknown", basis: "vw_insight_event_ai_location_context ne permet pas d’inférer intérieur/extérieur (aucun marqueur explicite)" };
  }

  function buildWeatherSignal(row: any, ctx: any): DecisionSignal {
    const { exposure, basis } = inferVenueExposureFromContext(ctx);

    const alert = row?.weather_alert_level ?? null;
    const precipProb = row?.precip_probability_max_pct ?? null;
    const wind = row?.wind_speed_10m_max ?? null;
    const wxCode = row?.weather_code ?? null;

    const alertNum = typeof alert === "number" ? alert : Number(alert);
    const precipNum = typeof precipProb === "number" ? precipProb : Number(precipProb);
    const windNum = typeof wind === "number" ? wind : Number(wind);

    const facts: Record<string, number | string | boolean | null> = {
      weather_alert_level: Number.isFinite(alertNum) ? alertNum : null,
      precip_probability_max_pct: Number.isFinite(precipNum) ? precipNum : null,
      wind_speed_10m_max: Number.isFinite(windNum) ? windNum : null,
      weather_code: typeof wxCode === "string" && wxCode.trim() ? wxCode.trim() : (wxCode ?? null),
      venue_exposure: exposure,
      venue_exposure_basis: basis,
    };

    // Applicability = we can at least compute alert OR (precip/wind) + some context info.
    const hasAlert = facts.weather_alert_level !== null;
    const hasPrecip = facts.precip_probability_max_pct !== null;
    const hasWind = facts.wind_speed_10m_max !== null;

    const applicable = hasAlert || hasPrecip || hasWind;

    // Primary drivers: only the ones we have as facts
    const primary_drivers: DecisionSignalDriver[] = [];
    if (hasAlert) primary_drivers.push("weather_alert");
    if (hasPrecip) primary_drivers.push("weather_precipitation");
    if (hasWind) primary_drivers.push("weather_wind");

    // Impact rules: ONLY truth-based, minimal, and explicit
    // - alert >=3 => blocking (consistent with your hard exclusion)
    // - else if any non-zero precip/wind AND exposure is outdoor/unknown => risk
    // - if indoor, precip/wind do not automatically create "risk" (contextual)
    let impact: DecisionSignalImpact = "neutral";

    if (Number.isFinite(alertNum) && alertNum >= 3) {
      impact = "blocking";
    } else {
      const precipNonZero = Number.isFinite(precipNum) && precipNum > 0;
      const windNonZero = Number.isFinite(windNum) && windNum > 0;

      if (exposure !== "indoor" && (precipNonZero || windNonZero)) {
        impact = "risk";
      }
      if (exposure === "indoor" && (Number.isFinite(alertNum) && alertNum >= 1)) {
        // alert still matters even indoor (truth: alert exists)
        impact = "risk";
      }
    }

    const explanation =
      !applicable
        ? "Signal météo non calculable: champs météo absents sur la ligne truth."
        : impact === "blocking"
          ? "Signal météo bloquant: niveau d’alerte météo ≥ 3 (règle hard v1)."
          : impact === "risk"
            ? (exposure === "indoor"
                ? "Signal météo à risque: présence d’une alerte météo (même en intérieur)."
                : (() => {
                    const parts: string[] = [];
                    const precipNonZero = Number.isFinite(precipNum) && precipNum > 0;
                    const windNonZero = Number.isFinite(windNum) && windNum > 0;
                    if (precipNonZero) parts.push("pluie");
                    if (windNonZero) parts.push("vent");
                    const what = parts.length ? parts.join(" et ") : "météo";
                    return `Signal météo à risque: ${what} non nul(s) et lieu non confirmé intérieur.`;
                  })())
            : "Signal météo neutre: aucune alerte bloquante et pas de risque météo détectable via les champs disponibles.";

    return {
      applicable,
      primary_drivers: applicable ? (primary_drivers.length ? primary_drivers : ["weather_alert"]) : [],
      impact,
      facts,
      explanation,
    };
  }

  function buildCompetitionSignal(row: any): DecisionSignal {
    const c5 = row?.events_within_5km_count ?? null;
    const c10 = row?.events_within_10km_count ?? null;
    const c50 = row?.events_within_50km_count ?? null;

    const n5 = typeof c5 === "number" ? c5 : Number(c5);
    const n10 = typeof c10 === "number" ? c10 : Number(c10);
    const n50 = typeof c50 === "number" ? c50 : Number(c50);

    const facts: Record<string, number | string | boolean | null> = {
      events_within_5km_count: Number.isFinite(n5) ? n5 : null,
      events_within_10km_count: Number.isFinite(n10) ? n10 : null,
      events_within_50km_count: Number.isFinite(n50) ? n50 : null,
      competition_scope: deriveCompetitionScopeLocal(row),

    };

    const applicable =
      facts.events_within_5km_count !== null ||
      facts.events_within_10km_count !== null ||
      facts.events_within_50km_count !== null;

    const scope = deriveCompetitionScopeLocal(row);
    const hasCompetition =
      (Number.isFinite(n5) && n5 > 0) ||
      (Number.isFinite(n10) && n10 > 0) ||
      (Number.isFinite(n50) && n50 > 0);

    const primary_drivers: DecisionSignalDriver[] =
      scope === "local" ? ["competition_local"]
      : scope === "regional" ? ["competition_regional"]
      : ["competition_regional"];

    const impact: DecisionSignalImpact =
      !applicable ? "neutral"
      : hasCompetition ? "risk"
      : "neutral";

    const explanation =
      !applicable
        ? "Signal concurrence non calculable: compteurs d’événements absents sur la ligne truth."
        : hasCompetition
          ? deriveCompetitionExplainLocal(row)
          : "Concurrence neutre: aucun événement détecté (selon les compteurs disponibles).";

    return {
      applicable,
      primary_drivers: applicable ? primary_drivers : [],
      impact,
      facts,
      explanation,
    };
  }

  function buildCalendarSignal(row: any): DecisionSignal {
    const wk = toBoolOrNullLocal(row?.is_weekend);
    const ph = toBoolOrNullLocal(row?.is_public_holiday_fr_flag);
    const sc = toBoolOrNullLocal(row?.is_school_holiday_flag);
    const ce = toBoolOrNullLocal(row?.is_commercial_event_flag);

    // applicable = at least one calendar-like flag is present and parseable
    const applicable = (wk !== null) || (ph !== null) || (sc !== null) || (ce !== null);

    const facts: Record<string, number | string | boolean | null> = {
      is_weekend: wk,
      is_public_holiday_fr_flag: ph,
      is_school_holiday_flag: sc,
      is_commercial_event_flag: ce,
    };

    // anyConstraint is true only if at least one flag is explicitly true
    const anyConstraint = (wk === true) || (ph === true) || (sc === true) || (ce === true);

    const impact: DecisionSignalImpact =
      !applicable ? "neutral"
      : anyConstraint ? "risk"
      : "neutral";
    
    const explanation = (() => {
      if (!applicable) {
        return "Signal calendrier non calculable: flags calendrier absents sur la ligne truth.";
      }

      const positives: string[] = [];
      if (wk === true) positives.push("week-end");
      if (ph === true) positives.push("jour férié");
      if (sc === true) positives.push("vacances scolaires");
      if (ce === true) positives.push("événement commercial");

      if (positives.length > 0) {
        return `Calendrier contraignant: ${positives.join(", ")}.`;
      }

      // If nothing is true, only mention missing parts (instead of spamming “non”).
      const unknowns: string[] = [];
      if (wk === null) unknowns.push("week-end");
      if (ph === null) unknowns.push("jour férié");
      if (sc === null) unknowns.push("vacances scolaires");
      if (ce === null) unknowns.push("événement commercial");

      return unknowns.length > 0
        ? `Calendrier: données partielles (non renseigné : ${unknowns.join(", ")}).`
        : "Calendrier neutre: rien à signaler via les flags disponibles.";
    })();

    return {
      applicable,
      primary_drivers: applicable ? ["calendar_constraint"] : [],
      impact,
      facts,
      explanation,
    };
  }

  function buildUnavailableSignal(label: string): DecisionSignal {
    return {
      applicable: false,
      primary_drivers: [],
      impact: "neutral",
      facts: { reason: `${label}: pas de champs truth exposés dans les vues utilisées par cette route.` },
      explanation: `${label}: non disponible avec les champs actuellement exposés (truth).`,
    };
  }

  // Select a single "focus row" for signals (truth-only).
  function pickSignalFocusRow(args: {
    horizon: ResolvedHorizon;
    intent: Intent;
    shortlist_rows: any[];
    worstlist_rows: any[];
    day_row: any | null;
    selected_days_rows: any[];
  }): any | null {
    if (args.horizon === "day") return args.day_row ?? null;

    if (args.horizon === "selected_days") {
      // (unchanged) ...
      const rows = Array.isArray(args.selected_days_rows) ? args.selected_days_rows : [];
      if (rows.length === 0) return null;

      const regimeRank = (v: unknown): number => {
        const s = typeof v === "string" ? v.trim().toUpperCase() : "";
        if (s === "A") return 0;
        if (s === "B") return 1;
        if (s === "C") return 2;
        return 9;
      };
      const num = (v: unknown): number => {
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n : NaN;
      };

      const cmp = (a: any, b: any): number => {
        const ra = regimeRank(a?.opportunity_regime);
        const rb = regimeRank(b?.opportunity_regime);
        if (ra !== rb) return ra - rb;

        const sa = num(a?.opportunity_score_final_local);
        const sb = num(b?.opportunity_score_final_local);
        const saOk = Number.isFinite(sa);
        const sbOk = Number.isFinite(sb);
        if (saOk !== sbOk) return saOk ? -1 : 1;
        if (saOk && sbOk && sa !== sb) return sb - sa;

        const wa = num(a?.alert_level_max);
        const wb = num(b?.alert_level_max);
        const wa2 = Number.isFinite(wa) ? wa : num(a?.weather_alert_level);
        const wb2 = Number.isFinite(wb) ? wb : num(b?.weather_alert_level);
        const waOk = Number.isFinite(wa2);
        const wbOk = Number.isFinite(wb2);
        if (waOk !== wbOk) return waOk ? -1 : 1;
        if (waOk && wbOk && wa2 !== wb2) return wa2 - wb2;

        const ca = num(a?.events_within_5km_count);
        const cb = num(b?.events_within_5km_count);
        const ca2 = Number.isFinite(ca) ? ca : num(a?.events_within_10km_count);
        const cb2 = Number.isFinite(cb) ? cb : num(b?.events_within_10km_count);
        const caOk = Number.isFinite(ca2);
        const cbOk = Number.isFinite(cb2);
        if (caOk !== cbOk) return caOk ? -1 : 1;
        if (caOk && cbOk && ca2 !== cb2) return ca2 - cb2;

        const da = ymdFromAnyDateLocal(a?.date);
        const db = ymdFromAnyDateLocal(b?.date);
        return da.localeCompare(db);
      };

      return [...rows].sort(cmp)[0] ?? null;
    }

    // month: pick focus row consistent with intent
    if (args.intent === "WINDOW_WORST_DAYS") {
      const wl = Array.isArray(args.worstlist_rows) ? args.worstlist_rows : [];
      return wl[0] ?? null;
    }

    const sl = Array.isArray(args.shortlist_rows) ? args.shortlist_rows : [];
    return sl[0] ?? null;
  }

  function buildDecisionSignals(args: {
    q: string;
    intent: ScoringIntent;
    horizon: ResolvedHorizon;
    internal_context: any;
    shortlist_rows: any[];
    worstlist_rows: any[];
    day_row: any | null;
    selected_days_rows: any[];
  }): DecisionSignals {
    const wanted = requestedSignalKeys(args.q, args.intent);
    if (wanted.size === 0) return {};

    const focusRow = pickSignalFocusRow({
      horizon: args.horizon,
      intent: args.intent,
      shortlist_rows: args.shortlist_rows,
      worstlist_rows: args.worstlist_rows,
      day_row: args.day_row,
      selected_days_rows: args.selected_days_rows,
    });

    const signals: DecisionSignals = {};

    for (const k of wanted) {
      if (k === "weather") {
        signals.weather = focusRow ? buildWeatherSignal(focusRow, args.internal_context) : buildUnavailableSignal("Météo");
      } else if (k === "competition") {
        signals.competition = focusRow ? buildCompetitionSignal(focusRow) : buildUnavailableSignal("Concurrence");
      } else if (k === "calendar") {
        signals.calendar = focusRow ? buildCalendarSignal(focusRow) : buildUnavailableSignal("Calendrier");
      } else if (k === "tourism") {
        signals.tourism = buildUnavailableSignal("Tourisme");
      } else if (k === "mobility") {
        signals.mobility = buildUnavailableSignal("Mobilité");
      }
    }

    return signals;
  }

  type WindowAggregatesV3 = {
    window_start_date: string; // YYYY-MM-DD
    window_end_date: string;   // YYYY-MM-DD
    days_count: number;

    score_min: number | null;
    score_max: number | null;

    days_a: number | null;
    days_b: number | null;
    days_c: number | null;

    days_missing_calendar_flags: number | null; // ex: any of weekend/holiday/school/commercial null
    days_missing_weather: number | null;        // ex: weather_code or key fields null
  };

  function ymdFromBqDate(v: any): string | null {
    if (!v) return null;

    // BigQuery DATE often comes as "YYYY-MM-DD"
    if (typeof v === "string") {
      const s = v.trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : s.slice(0, 10);
    }

    // BigQuery DATE can also be { value: "YYYY-MM-DD" }
    if (typeof v === "object" && typeof v.value === "string") {
      const s = v.value.trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : s.slice(0, 10);
    }

    // JS Date
    if (v instanceof Date && !Number.isNaN(v.getTime())) {
      return v.toISOString().slice(0, 10);
    }

    return null;
  }

  function buildWindowAggregatesV3(args: {
    month_window: any | null;
    month_days: any[];
  }): WindowAggregatesV3 | null {
    const mw = args.month_window;
    const days = Array.isArray(args.month_days) ? args.month_days : [];
    const ws = ymdFromBqDate(mw?.window_start_date) ?? null;
    const we = ymdFromBqDate(mw?.window_end_date) ?? null;
    if (!ws || !we) return null;

    const scores = days
      .map((r) => {
        const n = typeof r?.opportunity_score_final_local === "number"
          ? r.opportunity_score_final_local
          : Number(r?.opportunity_score_final_local);
        return Number.isFinite(n) ? n : null;
      })
      .filter((x): x is number => x !== null)
      .sort((a, b) => a - b);

    const days_a = days.filter((r) => String(r?.opportunity_regime ?? "") === "A").length;
    const days_b = days.filter((r) => String(r?.opportunity_regime ?? "") === "B").length;
    const days_c = days.filter((r) => String(r?.opportunity_regime ?? "") === "C").length;

    const missingWeather = days.filter((r) => r?.weather_code == null).length;

    // Calendar flags can come under slightly different column names depending on the surface/view.
    // Coalesce across known aliases to avoid false "missing" counts.
    function getPath(obj: any, path: string): any {
      if (!obj || !path) return undefined;
      if (!path.includes(".")) return obj?.[path];
      let cur: any = obj;
      for (const k of path.split(".")) {
        cur = cur?.[k];
        if (cur == null) return cur;
      }
      return cur;
    }

    function pickBool(r: any, paths: string[]): boolean | null {
      for (const p of paths) {
        const b = toBoolOrNullLocal(getPath(r, p));
        if (b !== null) return b;
      }
      return null;
    }

    const missingCalendar = days.filter((r) => {
      const wk = pickBool(r, ["is_weekend", "calendar.is_weekend", "calendar_weekend_flag"]);
      const ph = pickBool(r, [
        "is_public_holiday_fr_flag",
        "is_public_holiday_flag",
        "public_holiday_fr_flag",
        "calendar.is_public_holiday_fr_flag",
      ]);
      const sc = pickBool(r, [
        "is_school_holiday_flag",
        "is_school_vacation_flag",
        "school_holiday_flag",
        "calendar.is_school_holiday_flag",
      ]);
      const ce = pickBool(r, [
        "is_commercial_event_flag",
        "has_commercial_event_flag",
        "commercial_event_flag",
        "calendar.is_commercial_event_flag",
      ]);

      return wk === null || ph === null || sc === null || ce === null;
    }).length;

    return {
      window_start_date: ws,
      window_end_date: we,
      days_count: days.length,

      score_min: scores.length ? Math.round(scores[0]) : null,
      score_max: scores.length ? Math.round(scores[scores.length - 1]) : null,

      days_a,
      days_b,
      days_c,

      days_missing_calendar_flags: missingCalendar,
      days_missing_weather: missingWeather,
    };
  }

  function windowFilterDaysDeterministic(args: {
      q: string;
      month_days: any[];
    }): { headline: string; summary: string; key_facts: string[]; caveat: string } {
      const qn = norm(args.q);
      const days = Array.isArray(args.month_days) ? args.month_days : [];

      // --- intent parsing (minimal, explicit) ---
      const wantsWeather =
        qn.includes("meteo") || qn.includes("météo") || qn.includes("pluie") || qn.includes("vent") || qn.includes("alerte") || qn.includes("temperature") || qn.includes("température");

      const wantsCompetition =
        qn.includes("concurrence") || qn.includes("evenement") || qn.includes("événement") || qn.includes("evenements") || qn.includes("événements") || qn.includes("festival") || qn.includes("marche") || qn.includes("marché");

      const wantsCalendar =
        qn.includes("weekend") || qn.includes("week-end") || qn.includes("ferie") || qn.includes("férié") || qn.includes("vacances") || qn.includes("calendrier");

      // Negations / “low” qualifiers (deterministic keywords)
      const negPluie = qn.includes("sans pluie") || qn.includes("pas de pluie") || qn.includes("0 pluie") || qn.includes("zero pluie") || qn.includes("aucune pluie");
      const negVent  = qn.includes("sans vent")  || qn.includes("pas de vent")  || qn.includes("peu de vent") || qn.includes("vent faible");
      const negAlerte = qn.includes("sans alerte") || qn.includes("pas d alerte") || qn.includes("pas d'alerte") || qn.includes("aucune alerte");

      const lowCompetition =
        qn.includes("peu de concurrence") ||
        qn.includes("faible concurrence") ||
        qn.includes("sans concurrence") ||
        qn.includes("pas de concurrence") ||
        qn.includes("aucun evenement") ||
        qn.includes("aucun événement") ||
        qn.includes("0 evenement") ||
        qn.includes("0 événement");

      const excludeWeekend = qn.includes("hors week") || qn.includes("en semaine") || qn.includes("pas le week") || qn.includes("sans week");
      const excludeHolidays = qn.includes("hors ferie") || qn.includes("hors férié") || qn.includes("pas ferie") || qn.includes("pas férié") || qn.includes("sans ferie") || qn.includes("sans férié");
      const excludeSchoolHolidays = qn.includes("hors vacances") || qn.includes("pas vacances") || qn.includes("sans vacances");

      // If user asks a filter but gives no explicit dimension keywords, default to weather+competition+calendar
      const impliedFilter = wantsWeather || wantsCompetition || wantsCalendar || excludeWeekend || excludeHolidays || excludeSchoolHolidays || negPluie || negVent || negAlerte || lowCompetition;
      const activeWeather = wantsWeather || negPluie || negVent || negAlerte || (!impliedFilter ? true : false);
      const activeComp = wantsCompetition || lowCompetition || (!impliedFilter ? true : false);
      const activeCal = wantsCalendar || excludeWeekend || excludeHolidays || excludeSchoolHolidays || (!impliedFilter ? true : false);

      // --- explicit, documented thresholds (v1) ---
      // Keep these constants visible so behavior is stable and reviewable.
      const THRESHOLDS = {
        precipProbMaxPct_noRain: 0,     // “sans pluie” => prob max = 0
        windMax_kmh_lowWind: 15,        // “peu de vent” => wind max <= 15 km/h
        alertLevel_noAlert: 0,          // “sans alerte” => alert level <= 0
        comp10km_low: 0,                // “sans concurrence” => events_within_10km_count <= 0
      };

      const toNum = (v: any): number => {
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n : NaN;
      };

      const toBool = (v: any): boolean | null => toBoolOrNullLocal(v);

      const keep = (r: any): boolean => {
        // Weather filters
        if (activeWeather) {
          const alert = toNum(r?.weather_alert_level);
          const pr = toNum(r?.precip_probability_max_pct);
          const wi = toNum(r?.wind_speed_10m_max);

          if (negAlerte) {
            if (!Number.isFinite(alert)) return false;
            if (alert > THRESHOLDS.alertLevel_noAlert) return false;
          }
          if (negPluie) {
            if (!Number.isFinite(pr)) return false;
            if (pr > THRESHOLDS.precipProbMaxPct_noRain) return false;
          }
          if (negVent) {
            if (!Number.isFinite(wi)) return false;
            if (wi > THRESHOLDS.windMax_kmh_lowWind) return false;
          }
        }

        // Competition filters
        if (activeComp) {
          if (lowCompetition) {
            const c10 = toNum(r?.events_within_10km_count);
            if (!Number.isFinite(c10)) return false;
            if (c10 > THRESHOLDS.comp10km_low) return false;
          }
        }

        // Calendar filters
        if (activeCal) {
          const wk = toBool(r?.is_weekend);
          const ph = toBool(r?.is_public_holiday_fr_flag);
          const sc = toBool(r?.is_school_holiday_flag);

          if (excludeWeekend) {
            if (wk === null) return false;
            if (wk === true) return false;
          }
          if (excludeHolidays) {
            if (ph === null) return false;
            if (ph === true) return false;
          }
          if (excludeSchoolHolidays) {
            if (sc === null) return false;
            if (sc === true) return false;
          }
        }

        return true;
      };

      const kept = days.filter(keep);

      const top3 = kept
        .slice(0, 3)
        .map((r: any) => fmtDateFr(ymdFromAnyDateLocal(r?.date)))
        .filter(Boolean);

      const criteria: string[] = [];
      if (negPluie) criteria.push("sans pluie");
      if (negVent) criteria.push("peu de vent");
      if (negAlerte) criteria.push("sans alerte météo");
      if (lowCompetition) criteria.push("faible concurrence");
      if (excludeWeekend) criteria.push("hors week-end");
      if (excludeHolidays) criteria.push("hors jours fériés");
      if (excludeSchoolHolidays) criteria.push("hors vacances scolaires");
      if (criteria.length === 0) {
        if (activeWeather) criteria.push("météo");
        if (activeComp) criteria.push("concurrence");
        if (activeCal) criteria.push("calendrier");
      }

      const headline = "Jours correspondant à vos critères";
      const summary =
        kept.length === 0
          ? `Je ne trouve aucun jour correspondant (${criteria.join(", ")}) sur la période analysée.`
          : `J’ai trouvé ${kept.length} jour(s) correspondant (${criteria.join(", ")}). Exemples : ${top3.join(", ")}.`;

      const key_facts: string[] = [];
      key_facts.push(`Critères: ${criteria.join(", ")}.`);
      key_facts.push(`Période analysée: ${days.length} jour(s) disponibles côté truth.`);
      key_facts.push(
        `Seuils v1: pluie=${THRESHOLDS.precipProbMaxPct_noRain}% ; vent≤${THRESHOLDS.windMax_kmh_lowWind} km/h ; alerte≤${THRESHOLDS.alertLevel_noAlert} ; concurrence(≤10km)≤${THRESHOLDS.comp10km_low}.`
      );

      const caveat =
        "Filtrage v1 strict: si un champ est ND (null/absent) sur un critère demandé, le jour est exclu (comportement déterministe).";

      return { headline, summary, key_facts: key_facts.slice(0, 4), caveat };
    }

  function windowPatternsDeterministic(args: {
    month_days: any[];
  }): { headline: string; summary: string; key_facts: string[]; caveat: string } {
    const days = Array.isArray(args.month_days) ? args.month_days : [];

    // Sort by date ASC (stable)
    const sorted = [...days].sort((a, b) => {
      const da = ymdFromAnyDateLocal(a?.date);
      const db = ymdFromAnyDateLocal(b?.date);
      return da.localeCompare(db);
    });

    // Longest streak of "solid" days = regime A or B
    type Streak = { start: string; end: string; len: number };
    let best: Streak | null = null;

    let curStart: string | null = null;
    let curEnd: string | null = null;
    let curLen = 0;

    const isSolid = (r: any): boolean => {
      const reg = String(r?.opportunity_regime ?? "").trim().toUpperCase();
      return reg === "A" || reg === "B";
    };

    for (const r of sorted) {
      const d = ymdFromAnyDateLocal(r?.date);
      if (!d || d === "(date inconnue)") continue;

      if (isSolid(r)) {
        if (curLen === 0) curStart = d;
        curEnd = d;
        curLen += 1;
      } else {
        if (curLen > 0 && curStart && curEnd) {
          const cand: Streak = { start: curStart, end: curEnd, len: curLen };
          if (!best || cand.len > best.len) best = cand;
        }
        curStart = null;
        curEnd = null;
        curLen = 0;
      }
    }

    // finalize last run
    if (curLen > 0 && curStart && curEnd) {
      const cand: Streak = { start: curStart, end: curEnd, len: curLen };
      if (!best || cand.len > best.len) best = cand;
    }

    // Basic “stability” signals from truth fields (no guessing)
    const nAlert = sorted.filter((r) => {
      const a = toNumLocal(r?.weather_alert_level);
      return Number.isFinite(a) && a >= 1;
    }).length;

    const nComp = sorted.filter((r) => {
      const c10 = toNumLocal(r?.events_within_10km_count);
      return Number.isFinite(c10) && c10 > 0;
    }).length;

    const headline = "Tendances sur la période";

    if (!best) {
      return {
        headline,
        summary: "Je ne détecte pas de séquence continue de jours A/B sur la période analysée.",
        key_facts: [
          `Période analysée: ${sorted.length} jour(s).`,
          `Alertes météo (≥1): ${nAlert} jour(s).`,
          `Concurrence (≤10km >0): ${nComp} jour(s).`,
        ],
        caveat:
          "Lecture déterministe: basée uniquement sur les champs truth disponibles (régime, alerte météo, concurrence).",
      };
    }

    const startFr = fmtDateFr(best.start);
    const endFr = fmtDateFr(best.end);

    const span =
      best.start === best.end
        ? `${startFr}`
        : `${startFr} → ${endFr}`;

    return {
      headline,
      summary: `Meilleure séquence continue A/B détectée: ${best.len} jour(s) (${span}).`,
      key_facts: [
        `Séquence A/B: ${span} (${best.len} jour(s)).`,
        `Alertes météo (≥1): ${nAlert} jour(s) sur ${sorted.length}.`,
        `Concurrence (≤10km >0): ${nComp} jour(s) sur ${sorted.length}.`,
      ],
      caveat:
        "Lecture déterministe: ne déduit pas de causes; décrit seulement les motifs observables dans les champs truth.",
    };
  }

  function driverPrimaryDeterministic(args: {
      q: string;
      decision_payload: DecisionPayload;
    }): { headline: string; summary: string; key_facts: string[]; caveat: string } {
      const s: DecisionSignals =
        args.decision_payload.kind === "scoring"
          ? args.decision_payload.signals
          : {};

      type Cand = { k: keyof DecisionSignals; impact: DecisionSignalImpact; explanation: string };
      const cands: Cand[] = [];

      if (s.weather) cands.push({ k: "weather", impact: s.weather.impact, explanation: s.weather.explanation });
      if (s.competition) cands.push({ k: "competition", impact: s.competition.impact, explanation: s.competition.explanation });
      if (s.calendar) cands.push({ k: "calendar", impact: s.calendar.impact, explanation: s.calendar.explanation });

      const impactRank = (i: DecisionSignalImpact): number =>
        i === "blocking" ? 0 : i === "risk" ? 1 : 2;

      cands.sort((a, b) => impactRank(a.impact) - impactRank(b.impact));

      const best = cands[0];

      const label = (k: string) =>
        k === "weather" ? "Météo"
        : k === "competition" ? "Concurrence"
        : k === "calendar" ? "Calendrier"
        : k;

      const headline = "Facteur principal";
      if (!best) {
        return {
          headline,
          summary: "Je ne peux pas isoler un facteur principal: aucun signal calculable avec les champs truth disponibles.",
          key_facts: [],
          caveat: "Ajoutez un critère explicite (météo / concurrence / calendrier) ou vérifiez la couverture des champs.",
        };
      }

      const summary = `${label(String(best.k))} ressort comme facteur principal (${best.impact}).`;
      const key_facts = [best.explanation];

      const caveat =
        "Facteur principal déterminé uniquement à partir des signaux truth calculables (blocking > risk > neutral).";

      return { headline, summary, key_facts, caveat };
    }

  

  try {

    // ---- REQUEST BODY (parse first so dev bypass can read thread_context) ----
    const body = await request.json().catch(() => null);
    const qRaw = requireString(body?.q, "body.q");
    const q = norm(qRaw);
    const top_k = resolveTopKFromText(qRaw);

    // ---- AUTH + CONTEXT (SOURCE OF TRUTH) ----
    // In prod: require Clerk locals.
    // In dev bypass: allow no Clerk session, but require thread_context.location_id.
    type LocalsAuth = { clerk_user_id?: unknown; location_id?: unknown };
    const l = locals as LocalsAuth;

    const bypass = DEV_BYPASS_PROMPT === true;

    // clerk_user_id: required in prod, optional in dev-bypass
    const clerk_user_id = bypass
      ? (typeof l.clerk_user_id === "string" ? l.clerk_user_id.trim() : null)
      : requireString(l.clerk_user_id, "locals.clerk_user_id");

    // location_id: required in both modes, but source differs
    const location_id = bypass
      ? requireString(body?.thread_context?.location_id, "thread_context.location_id")
      : requireString(l.location_id, "locals.location_id");

    // ----------------------------
    // THREAD CONTEXT (V1) — conversational routing inputs
    // Deterministic, truth-safe: only used when request is ambiguous.
    // ----------------------------
    const thread_context: ThreadContextV1 | null =
      body?.thread_context && typeof body.thread_context === "object"
        ? (body.thread_context as ThreadContextV1)
        : null;

    function safeYmd10(s: any): string | null {
      if (typeof s !== "string") return null;
      const x = s.trim().slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null;
    }

    function threadUsedDates(ctx: ThreadContextV1 | null): string[] {
      const u = ctx?.last?.used_dates;
      if (!Array.isArray(u)) return [];
      const out = u.map((d) => safeYmd10(d)).filter((d): d is string => !!d);
      return out.slice(0, 7);
    }

    function threadTopDates(ctx: ThreadContextV1 | null): string[] {
      const t = ctx?.last?.top_dates;
      if (!Array.isArray(t)) return [];
      const out = t.map((x) => safeYmd10(x?.date)).filter((d): d is string => !!d);
      return out.slice(0, 7);
    }

    function inferSelectedDateFromMonthMention(qRaw: string): string | null {
      const qn = norm(qRaw);

      const months: Record<string, number> = {
        // FR
        "janvier": 1,
        "fevrier": 2, "février": 2,
        "mars": 3,
        "avril": 4,
        "mai": 5,
        "juin": 6,
        "juillet": 7,
        "aout": 8, "août": 8,
        "septembre": 9,
        "octobre": 10,
        "novembre": 11,
        "decembre": 12, "décembre": 12,

        // EN
        "january": 1,
        "february": 2,
        "march": 3,
        "april": 4,
        "may": 5,
        "june": 6,
        "july": 7,
        "august": 8,
        "september": 9,
        "october": 10,
        "november": 11,
        "december": 12,
      };

      let m: number | null = null;
      for (const k of Object.keys(months)) {
        if (qn.includes(k)) { m = months[k]; break; }
      }
      if (!m) return null;

      const ym = qRaw.match(/\b(20\d{2})\b/);
      const explicitYear = ym ? Number(ym[1]) : null;

      const now = new Date();
      const yNow = now.getUTCFullYear();
      const mNow = now.getUTCMonth() + 1;

      const y = explicitYear ?? (m < mNow ? yNow + 1 : yNow);

      return new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
    }

    // selected_date precedence:
    // 1) explicit payload
    // 2) inferred from question month (e.g. "en juin")
    // 3) thread_context last selected_date
    // 4) today
    const inferred_selected_date = inferSelectedDateFromMonthMention(q);

    const selected_date =
      (typeof body?.selected_date === "string" && body.selected_date.trim())
        ? body.selected_date.trim().slice(0, 10)
        : (inferred_selected_date ??
          safeYmd10(thread_context?.last?.selected_date) ??
          new Date().toISOString().slice(0, 10));

    const date =
      typeof body?.date === "string" && body.date.trim() ? body.date.trim() : null;

    const dates =
      Array.isArray(body?.dates) && body.dates.length > 0
        ? body.dates.map((d: any) => String(d)).filter((d: string) => d.trim())
        : [];
      
    // Production guard: Selected Days is 1..7 in your UX. Prevent accidental abuse.
    if (dates.length > 7) {
      throw new Error("dates[] too large (max 7)");
    }

    const dateMentions = extractDateMentions(qRaw, selected_date.slice(0, 10));
    const extracted_dates = dateMentions.dates;

    // Base effective_dates precedence:
    // 1) dates[] payload
    // 2) dates extracted from q
    // 3) thread_context last used_dates (fallback for follow-ups)
    const thread_used_dates = threadUsedDates(thread_context);
    const thread_top_dates = threadTopDates(thread_context);

    const effective_dates: string[] =
      (Array.isArray(dates) && dates.length > 0)
        ? dates.map((d: any) => String(d).trim()).filter(Boolean).map((d) => d.slice(0, 10))
        : (extracted_dates.length > 0 ? extracted_dates : thread_used_dates);

    // Only force comparison when the user explicitly provided 2+ dates (payload or question).
    // Do NOT force compare from thread_context fallback dates (prevents "jours à éviter ?" from becoming COMPARE_DATES).
    const force_compare =
      (Array.isArray(dates) && dates.length >= 2) ||
      (Array.isArray(extracted_dates) && extracted_dates.length >= 2);

    // Initial resolution from text (truth-only)
    let resolved_horizon: ResolvedHorizon =
      force_compare ? "selected_days" : resolveHorizonFromText(qRaw);

    let resolved_intent: ScoringIntent | "LOOKUP_EVENT" =
      force_compare ? "COMPARE_DATES" : resolveIntentFromText(qRaw, resolved_horizon);

    // ✅ Hard routing: if exactly 1 explicit date is extractable, it’s a DAY question (unless compare)
    if (!force_compare && extracted_dates.length === 1) {
      resolved_horizon = "day";
      resolved_intent = resolveIntentFromText(qRaw, "day");
    }


    // Only force DAY when a date token includes both day + month
    const hasExplicitDayAndMonth =
      dateMentions.dates.length === 1 &&
      /\b(\d{1,2}|1er)\b/i.test(qRaw) &&
      /\b(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\b/i.test(qRaw);

    if (hasExplicitDayAndMonth) {
      resolved_horizon = "day";
      resolved_intent = "DAY_WHY";
    }
    
    // ----------------------------
    // Conversational overrides (V1) — deterministic, no guessing
    // Only when user asks follow-up without explicit dates.
    // ----------------------------
    const qn = norm(q);

    // If query contains a single explicit year (e.g. "... 1er mars 2026"),
    // use it as default for other day+month tokens missing a year.
    const yearHit = qn.match(/\b(20\d{2})\b/);
    const defaultYearFromQuery = yearHit ? Number(yearHit[1]) : null;

    const hasExplicitAnyDate =
      dateMentions.hasDateToken ||
      (Array.isArray(dates) && dates.length > 0) ||
      (typeof date === "string" && date.trim().length > 0);

    const refersToRank1 =
      qn.includes("#1") ||
      qn.includes("1er") ||
      qn.includes("premier") ||
      qn.includes("meilleur") ||
      qn.includes("top 1");

    const refersToTop2 =
      qn.includes("top 2") ||
      qn.includes("les 2") ||
      qn.includes("deux premiers");

    const asksWhy =
      qn.includes("pourquoi") ||
      qn.includes("qu est ce qui") ||
      qn.includes("qu'est-ce qui") ||
      qn.includes("explique");

    const asksCompare =
      qn.includes("compar") ||
      qn.includes("difference") ||
      qn.includes("différence") ||
      qn.includes("entre");

    const asksNextDay =
      qn.includes("lendemain") ||
      qn.includes("jour apres") ||
      qn.includes("jour après") ||
      qn.includes("suivant");

    // Rule 1 — "pourquoi le #1 ?" after month top days => treat as DAY_WHY on top_dates[0]
    if (!hasExplicitAnyDate && asksWhy && refersToRank1 && thread_top_dates.length >= 1) {
      resolved_horizon = "day";
      resolved_intent = "DAY_WHY";
      // set date hint deterministically for downstream (we reuse existing `date` variable via a local)
      // We do not mutate `date` const; we use `effective_day_date_override` later.
    }

    // Rule 2 — "compare les 2 premiers" after month top days => selected_days compare on top2
    if (!hasExplicitAnyDate && asksCompare && refersToTop2 && thread_top_dates.length >= 2) {
      resolved_horizon = "selected_days";
      resolved_intent = "COMPARE_DATES";
    }

    // Rule 3 — "et le lendemain ?" when previous used_dates exists => day on next date
    // We only allow this when prior context exists.
    if (!hasExplicitAnyDate && asksNextDay && thread_used_dates.length >= 1) {
      resolved_horizon = "day";
      resolved_intent = "DAY_WHY";
    }

    // Deterministic date overrides driven by thread_context conversational rules
    const override_day_date: string | null =
      (!hasExplicitAnyDate && asksWhy && refersToRank1 && thread_top_dates.length >= 1)
        ? thread_top_dates[0]
        : (!hasExplicitAnyDate && asksNextDay && thread_used_dates.length >= 1)
          ? (() => {
              // next day after the last used date (UTC ymd)
              const base = thread_used_dates[0];
              return addDaysYmd(base, 1);
            })()
          : null;

    const override_compare_dates: string[] =
      (!hasExplicitAnyDate && asksCompare && refersToTop2 && thread_top_dates.length >= 2)
        ? thread_top_dates.slice(0, 2)
        : [];

    // ---- BIGQUERY CLIENT ----
    const projectId = requireString(process.env.BQ_PROJECT_ID, "BQ_PROJECT_ID");

    // Semantic project: defaults to BQ_PROJECT_ID unless explicitly overridden.
    const semanticProjectId =
      (typeof process.env.BQ_SEMANTIC_PROJECT_ID === "string" &&
        process.env.BQ_SEMANTIC_PROJECT_ID.trim())
        ? process.env.BQ_SEMANTIC_PROJECT_ID.trim()
        : projectId;

    const bigquery = makeBQClient(projectId);


    async function bqOne(query: string, params: Record<string, any>) {
      const [rows] = await bigquery.query({
        query,
        location: "EU",
        params,
      });
      return rows && rows.length > 0 ? rows[0] : null;
    }

    async function bqAll(query: string, params: Record<string, any>) {
      const [rows] = await bigquery.query({
        query,
        location: "EU",
        params,
      });
      return rows ?? [];
    }

    async function bqShortlist(params: {
      location_id: string;
      window_start_date: string; // YYYY-MM-DD
      hard_only?: boolean;
      limit?: number; // 1..7
    }) {
      const hard_only = params.hard_only === false ? false : true;

      const limitRaw = Number(params.limit ?? 7);
      const limit = Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(7, Math.floor(limitRaw)))
        : 7;

      const query = `
        WITH win AS (
          SELECT
            DATE(@window_start_date) AS window_start_date,
            DATE_ADD(DATE(@window_start_date), INTERVAL 29 DAY) AS window_end_date
        ),
        base AS (
          SELECT
            date,
            location_id,
            opportunity_score_final_local,
            opportunity_medal,
            opportunity_regime,
            weather_code,
            weather_alert_level,
            precipitation_probability_max_pct AS precip_probability_max_pct,
            wind_speed_10m_max,
            events_within_5km_count,
            events_within_10km_count,
            events_within_50km_count,
            is_public_holiday_fr_flag,
            is_school_holiday_flag,
            is_weekend,
            commercial_events,
            is_commercial_event_flag,
            is_selected_day,
            available_next_views,
            relative_rank_bucket
          FROM \`${semanticProjectId}.semantic.vw_insight_event_30d_day_surface\`
          WHERE location_id = @location_id
            AND date BETWEEN (SELECT window_start_date FROM win)
                        AND (SELECT window_end_date   FROM win)
        ),
        filtered AS (
          SELECT *
          FROM base
          WHERE
            @hard_only = FALSE
            OR (
              -- hard exclusions (v1)
              COALESCE(opportunity_regime, '') != 'C'
              AND COALESCE(CAST(weather_alert_level AS INT64), 0) < 3
            )
        ),
        dedup AS (
          -- One row per (location_id, date). Pick the "best" candidate deterministically.
          SELECT *
          FROM filtered
          QUALIFY ROW_NUMBER() OVER (
            PARTITION BY location_id, date
            ORDER BY
              opportunity_score_final_local DESC,
              CAST(weather_alert_level AS INT64) ASC NULLS LAST,
              events_within_10km_count ASC NULLS LAST
          ) = 1
        )
        SELECT *
        FROM dedup
        ORDER BY
          opportunity_score_final_local DESC,
          CAST(weather_alert_level AS INT64) ASC NULLS LAST,
          CAST(precip_probability_max_pct AS FLOAT64) ASC NULLS LAST,
          CAST(wind_speed_10m_max AS FLOAT64) ASC NULLS LAST,
          CAST(events_within_5km_count AS INT64) ASC NULLS LAST,
          CAST(events_within_10km_count AS INT64) ASC NULLS LAST,
          CAST(events_within_50km_count AS INT64) ASC NULLS LAST,
          date ASC
        LIMIT @limit
      `;
    
      const [rows] = await bigquery.query({
        query,
        location: "EU",
        params: {
          location_id: params.location_id,
          window_start_date: params.window_start_date,
          hard_only,
          limit,
        },
      });

      return rows ?? [];
    }

    async function bqWorstlist(params: {
      location_id: string;
      window_start_date: string; // YYYY-MM-DD
      hard_only?: boolean;
      limit?: number; // 1..7
    }) {
      const hard_only = params.hard_only === true ? true : false;

      const limitRaw = Number(params.limit ?? 7);
      const limit = Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(7, Math.floor(limitRaw)))
        : 7;

      const query = `
        WITH win AS (
          SELECT
            DATE(@window_start_date) AS window_start_date,
            DATE_ADD(DATE(@window_start_date), INTERVAL 29 DAY) AS window_end_date
        ),
        base AS (
          SELECT
            date,
            location_id,
            opportunity_score_final_local,
            opportunity_medal,
            opportunity_regime,
            weather_code,
            weather_alert_level,
            precipitation_probability_max_pct AS precip_probability_max_pct,
            wind_speed_10m_max,
            events_within_5km_count,
            events_within_10km_count,
            events_within_50km_count,
            is_public_holiday_fr_flag,
            is_school_holiday_flag,
            is_weekend,
            commercial_events,
            is_commercial_event_flag,
            is_selected_day,
            available_next_views,
            relative_rank_bucket
          FROM \`${semanticProjectId}.semantic.vw_insight_event_30d_day_surface\`
          WHERE location_id = @location_id
            AND date BETWEEN (SELECT window_start_date FROM win)
                        AND (SELECT window_end_date   FROM win)
        ),
        filtered AS (
          SELECT *
          FROM base
          WHERE
            @hard_only = FALSE
            OR (
              COALESCE(opportunity_regime, '') != 'C'
              AND COALESCE(CAST(weather_alert_level AS INT64), 0) < 3
            )
        ),
        dedup AS (
          SELECT *
          FROM filtered
          QUALIFY ROW_NUMBER() OVER (
            PARTITION BY location_id, date
            ORDER BY
              opportunity_score_final_local ASC,
              CAST(weather_alert_level AS INT64) DESC NULLS LAST,
              events_within_10km_count DESC NULLS LAST
          ) = 1
        )
        SELECT *
        FROM dedup
        ORDER BY opportunity_score_final_local ASC, date ASC
        LIMIT @limit
      `;

      const [rows] = await bigquery.query({
        query,
        location: "EU",
        params: {
          location_id: params.location_id,
          window_start_date: params.window_start_date,
          hard_only,
          limit,
        },
      });

      return rows ?? [];
    }

    function bqParams(p: Record<string, any>) {
      return Object.fromEntries(
        Object.entries(p).filter(([, v]) => v !== null && v !== undefined)
      );
    }

    function buildMonthRedirectUrl(opts: {
      window_start_date: string; // YYYY-MM-DD
      focus?: string; // e.g. "shortlist"
      from_prompt?: boolean;
      preselect_dates?: string[]; // YYYY-MM-DD[]
    }) {
      const u = new URL("/app/insightevent/month", request.url);

      u.searchParams.set("focus", opts.focus ?? "shortlist");
      u.searchParams.set("from_prompt", String(opts.from_prompt ?? true));

      u.searchParams.set("selected_date", opts.window_start_date);
      u.searchParams.set("anchor_date", opts.window_start_date);

      // ✅ truth-based: pass the shortlist dates so Month can actually preselect them
      if (Array.isArray(opts.preselect_dates) && opts.preselect_dates.length) {
        u.searchParams.set("preselect_dates", opts.preselect_dates.slice(0, 7).join(","));
      }

      return u.pathname + u.search;
    }

    // ----------------------------
    // POLICY (truth: decision_policy_rules rows)
    // ----------------------------
    type Policy = {
      priority_dimensions: string[]; // ordered, uppercase tokens
      auto_constraints: Set<string>; // raw tokens, e.g. 'exclude_public_holidays'
    };

    function parseDimList(v: unknown): string[] {
      if (typeof v !== "string") return [];
      return v
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => s.toUpperCase());
    }

    function buildPolicy(rows: any[]): Policy {
      const r = Array.isArray(rows) ? rows : [];

      const baseRow = r.find((x) => String(x?.rule_key ?? "") === "location_type");
      const base = parseDimList(baseRow?.base_priority_dimensions);

      const baseDefault = ["SCORE","CALENDAR","STABILITY","WEATHER","NEARBY_EVENTS","TOURISM","DRIVER"];
      const baseFinal = base.length > 0 ? base : baseDefault;

      const boosts: string[] = [];
      for (const x of r) {
        if (String(x?.rule_key ?? "") === "location_type") continue;
        const b = parseDimList(x?.boost_priority_dimensions);
        for (const t of b) boosts.push(t);
      }

      const seen = new Set<string>();
      const priority_dimensions: string[] = [];

      for (const t of boosts) {
        if (!seen.has(t)) { seen.add(t); priority_dimensions.push(t); }
      }
      for (const t of baseFinal) {
        if (!seen.has(t)) { seen.add(t); priority_dimensions.push(t); }
      }

      const auto_constraints = new Set<string>();
      for (const x of r) {
        const c = typeof x?.auto_constraints === "string" ? x.auto_constraints.trim() : "";
        if (c) auto_constraints.add(c);
      }

      return { priority_dimensions, auto_constraints };
    }

    type RankedRow = {
      row: any;
      reasons: string[]; // truth-based reasons used for ranking
    };

    function toNum(v: unknown): number {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : NaN;
    }

    function ymdFromAnyDate(v: any): string {
      if (typeof v === "string" && v.trim()) return v.trim().slice(0, 10);
      if (v && typeof v === "object" && typeof v.value === "string") return v.value.trim().slice(0, 10);
      if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
      return "(date inconnue)";
    }

    function clampFallbackWindow(bestYmd: string, winStart: string, winEnd: string) {
      // propose best..best+4, clamped to [winStart, winEnd]
      const start = bestYmd < winStart ? winStart : bestYmd;
      const rawEnd = addDaysYmd(bestYmd, 4);
      const end = rawEnd > winEnd ? winEnd : rawEnd;
      return { start, end };
    }

    type CompetitionScope = "local" | "regional" | "none";

    function deriveCompetitionScope(r: any): CompetitionScope {
      const c5 = toNum(r?.events_within_5km_count);
      const c10 = toNum(r?.events_within_10km_count);
      const c50 = toNum(r?.events_within_50km_count);

      const has5 = Number.isFinite(c5) && c5 > 0;
      const has10 = Number.isFinite(c10) && c10 > 0;
      const has50 = Number.isFinite(c50) && c50 > 0;

      if (has5) return "local";
      if (has10) return "local";
      if (has50) return "regional";
      return "none";
    }

    function deriveCompetitionExplain(r: any): string {
      const c5 = toNum(r?.events_within_5km_count);
      const c10 = toNum(r?.events_within_10km_count);
      const c50 = toNum(r?.events_within_50km_count);

      const c5Txt = Number.isFinite(c5) ? String(Math.round(c5)) : "ND";
      const c10Txt = Number.isFinite(c10) ? String(Math.round(c10)) : "ND";
      const c50Txt = Number.isFinite(c50) ? String(Math.round(c50)) : "ND";

      const scope = deriveCompetitionScope(r);

      if (scope === "none") {
        return "Concurrence: aucune pression détectée (≤10/50km à 0 ou ND).";
      }
      if (scope === "local") {
        return `Concurrence directe: ${c5Txt} évts ≤5km | ${c10Txt} évts ≤10km | ${c50Txt} évts ≤50km.`;
      }
      return `Concurrence régionale: 0 à ≤10km; ${c50Txt} évts ≤50km.`;
    }

    function rankNonDiscriminativeRows(
      candidateRows: any[],
      policy: Policy,
      limit: number
    ): RankedRow[] {
      const rows = Array.isArray(candidateRows) ? candidateRows : [];
      const lim = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 3;

      // ----------------------------
      // Apply auto-constraints (truth-only)
      // ----------------------------
      const constraints = policy.auto_constraints;

      const filtered = rows.filter((r) => {
        const ph = toBoolOrNullLocal(r?.is_public_holiday_fr_flag);
        const wk = toBoolOrNullLocal(r?.is_weekend);
        const sc = toBoolOrNullLocal(r?.is_school_holiday_flag);
        const ce = toBoolOrNullLocal(r?.is_commercial_event_flag);

        // exclude_public_holidays
        if (constraints.has("exclude_public_holidays") && ph === true) {
          return false;
        }

        // filter_weekend_only
        if (constraints.has("filter_weekend_only") && wk !== true) {
          return false;
        }

        // filter_school_holidays_only
        if (constraints.has("filter_school_holidays_only") && sc !== true) {
          return false;
        }

        // exclude_dates_with_weather_alert (treat any alert >= 1 as "has alert")
        if (constraints.has("exclude_dates_with_weather_alert")) {
          const wx = toNum(r?.weather_alert_level);
          if (Number.isFinite(wx) && wx >= 1) return false;
        }

        // exclude_commercial_events
        if (constraints.has("exclude_commercial_events") && ce === true) {
          return false;
        }

        return true;
      });

      // If constraints over-filter to < lim, fall back to unfiltered rows (still deterministic).
      const pool = filtered.length >= lim ? filtered : rows;

      const boolRank = (v: boolean | null): number => (v === null ? 2 : v ? 1 : 0);

      // ----------------------------
      // Deterministic ordering driven by priority_dimensions
      // ----------------------------
      // Available truth fields on vw_insight_event_30d_day_surface:
      // - weather_alert_level, precip_probability_max_pct, wind_speed_10m_max
      // - events_within_10km_count
      // - is_weekend, is_public_holiday_fr_flag, is_school_holiday_flag
      //
      // For flat-score months, we ignore score/regime for ranking unless needed as tie-breakers.
      const dims = policy.priority_dimensions.filter((d) => SUPPORTED_DIMS.has(d));

      function cmp(a: any, b: any): number {
        for (const d of dims) {
          // WEATHER: prefer lower alert, then lower precip prob, then lower wind
          if (d === "WEATHER") {
            const aAlert = toNum(a?.weather_alert_level);
            const bAlert = toNum(b?.weather_alert_level);
            const aOk = Number.isFinite(aAlert);
            const bOk = Number.isFinite(bAlert);
            if (aOk !== bOk) return aOk ? -1 : 1;
            if (aOk && bOk && aAlert !== bAlert) return aAlert - bAlert;

            const aP = toNum(a?.precip_probability_max_pct);
            const bP = toNum(b?.precip_probability_max_pct);
            const aPOk = Number.isFinite(aP);
            const bPOk = Number.isFinite(bP);
            if (aPOk !== bPOk) return aPOk ? -1 : 1;
            if (aPOk && bPOk && aP !== bP) return aP - bP;

            const aW = toNum(a?.wind_speed_10m_max);
            const bW = toNum(b?.wind_speed_10m_max);
            const aWOk = Number.isFinite(aW);
            const bWOk = Number.isFinite(bW);
            if (aWOk !== bWOk) return aWOk ? -1 : 1;
            if (aWOk && bWOk && aW !== bW) return aW - bW;
          }

          // NEARBY_EVENTS: lower competition is better
          if (d === "NEARBY_EVENTS") {
            const a5 = toNum(a?.events_within_5km_count);
            const b5 = toNum(b?.events_within_5km_count);
            const a5Ok = Number.isFinite(a5);
            const b5Ok = Number.isFinite(b5);
            if (a5Ok !== b5Ok) return a5Ok ? -1 : 1;
            if (a5Ok && b5Ok && a5 !== b5) return a5 - b5;

            const a10 = toNum(a?.events_within_10km_count);
            const b10 = toNum(b?.events_within_10km_count);
            const a10Ok = Number.isFinite(a10);
            const b10Ok = Number.isFinite(b10);
            if (a10Ok !== b10Ok) return a10Ok ? -1 : 1;
            if (a10Ok && b10Ok && a10 !== b10) return a10 - b10;

            const a50 = toNum(a?.events_within_50km_count);
            const b50 = toNum(b?.events_within_50km_count);
            const a50Ok = Number.isFinite(a50);
            const b50Ok = Number.isFinite(b50);
            if (a50Ok !== b50Ok) return a50Ok ? -1 : 1;
            if (a50Ok && b50Ok && a50 !== b50) return a50 - b50;
          }

          if (d === "CALENDAR") {
            const aWeekend = toBoolOrNullLocal(a?.is_weekend);
            const bWeekend = toBoolOrNullLocal(b?.is_weekend);
            const aHol = toBoolOrNullLocal(a?.is_public_holiday_fr_flag);
            const bHol = toBoolOrNullLocal(b?.is_public_holiday_fr_flag);
            const aSch = toBoolOrNullLocal(a?.is_school_holiday_flag);
            const bSch = toBoolOrNullLocal(b?.is_school_holiday_flag);
            const aCe = toBoolOrNullLocal(a?.is_commercial_event_flag);
            const bCe = toBoolOrNullLocal(b?.is_commercial_event_flag);

            // Prefer: false (best) < null (unknown) < true (worst)
            const rank = (v: boolean | null): number => (v === false ? 0 : v === null ? 1 : 2);

            const rw = rank(aWeekend) - rank(bWeekend);
            if (rw !== 0) return rw;

            const rh = rank(aHol) - rank(bHol);
            if (rh !== 0) return rh;

            const rs = rank(aSch) - rank(bSch);
            if (rs !== 0) return rs;

            const rce = rank(aCe) - rank(bCe);
            if (rce !== 0) return rce;
          }
        }

        // Tie-breakers (truthy, stable): lower weather alert, lower events, then earlier date
        const aAlert = toNum(a?.weather_alert_level);
        const bAlert = toNum(b?.weather_alert_level);
        if (Number.isFinite(aAlert) && Number.isFinite(bAlert) && aAlert !== bAlert) return aAlert - bAlert;

        const aC = toNum(a?.events_within_10km_count);
        const bC = toNum(b?.events_within_10km_count);
        if (Number.isFinite(aC) && Number.isFinite(bC) && aC !== bC) return aC - bC;

        return ymdFromAnyDate(a?.date).localeCompare(ymdFromAnyDate(b?.date));
      }

      const sorted = [...pool].sort(cmp).slice(0, lim);

      return sorted.map((r) => {
        const wx = Number.isFinite(toNum(r?.weather_alert_level))
          ? String(toNum(r?.weather_alert_level))
          : "ND";
        const pr = Number.isFinite(toNum(r?.precip_probability_max_pct))
          ? String(toNum(r?.precip_probability_max_pct))
          : "ND";
        const wi = Number.isFinite(toNum(r?.wind_speed_10m_max))
          ? String(toNum(r?.wind_speed_10m_max))
          : "ND";

        const reasons: string[] = [];

        if (policy.priority_dimensions.includes("WEATHER")) {
          reasons.push(`météo: alerte ${wx}, pluie ${pr}%, vent ${wi}`);
        }

        if (policy.priority_dimensions.includes("NEARBY_EVENTS")) {
          reasons.push(deriveCompetitionExplain(r));
        }

        if (policy.priority_dimensions.includes("CALENDAR")) {
          const wk = toBoolOrNullLocal(r?.is_weekend);
          const ph = toBoolOrNullLocal(r?.is_public_holiday_fr_flag);
          const sc = toBoolOrNullLocal(r?.is_school_holiday_flag);
          const ce = toBoolOrNullLocal(r?.is_commercial_event_flag);

          const yn = (v: boolean | null): string => (v === null ? "ND" : v ? "oui" : "non");

          reasons.push(
            `calendrier: week-end=${yn(wk)}, férié=${yn(ph)}, vacances=${yn(sc)}, évènement commercial=${yn(ce)}`
          );
        }

        return { row: r, reasons };
      });
    }

    // ---- INTERNAL CONTEXT (truth: semantic surface) ----
    const internal_context = await bqOne(
      `
      SELECT *
      FROM \`${semanticProjectId}.semantic.vw_insight_event_ai_location_context\`
      WHERE location_id = @location_id
      LIMIT 1
      `,
      { location_id }
    );

    if (!internal_context) {
      throw new Error(
        `Missing semantic internal context: vw_insight_event_ai_location_context for location_id=${location_id}`
      );
    }

    // ---- DECISION POLICY RULES (truth: semantic surface) ----
    // These are UI enum tokens (possible_value), stored in internal context.
    const rule_values: string[] = [
      String((internal_context as any).location_type ?? ""),
      String((internal_context as any).event_time_profile ?? ""),
      String((internal_context as any).primary_audience_1 ?? ""),
      String((internal_context as any).primary_audience_2 ?? ""),
    ].filter((v) => v && v.trim().length > 0);

    const decision_policy_rules =
      rule_values.length === 0
        ? []
        : await bqAll(
            `
            SELECT
              rule_key,
              rule_value,
              base_priority_dimensions,
              boost_priority_dimensions,
              blocker_focus,
              auto_constraints,
              rule_version
            FROM \`${semanticProjectId}.semantic.vw_ms_insight_ai_decision_policy_rules\`
            WHERE rule_value IN UNNEST(@rule_values)
            `,
            { rule_values }
          );

    // ---- HORIZON-SPECIFIC TRUTH FETCH + AI BUILD (single controlled structure) ----
    let month_window: any = null;
    let month_days: any[] = [];
    let day_row: any = null;
    let selected_days_rows: any[] = [];
    let selected_query_dates: string[] = [];
    let shortlist: any[] = [];
    let worstlist: any[] = [];
    let month_redirect_url: string | null = null;
    let month_ws: string | null = null;
    let shortlist_rows: any[] = [];
    let worstlist_rows: any[] = [];

    // ---- AI PACKAGER (truth -> JSON narration) ----
    let ai: any = null;
    let lookup_hit: any = null;
    let lookup_mode: "scoped" | "fallback_global" | null = null;
    let lookup_sql_used: "scoped" | "fallback_global" | null = null;

    let window_aggregates_v3: WindowAggregatesV3 | null = null;
    let ui_packaging_v3: any = null;

    type ProducerMeta = "v3_claude" | "v3_fallback_deterministic" | "v3_fallback" | "deterministic";
    let producer: ProducerMeta = "deterministic";



    switch (resolved_horizon) {
      case "month": {
        month_window = await bqOne(
          `
          WITH win AS (
            SELECT
              COALESCE(DATE(@selected_date), CURRENT_DATE()) AS window_start_date,
              DATE_ADD(COALESCE(DATE(@selected_date), CURRENT_DATE()), INTERVAL 29 DAY) AS window_end_date
          )
          SELECT *
          FROM \`${semanticProjectId}.semantic.vw_insight_event_30d_window_surface\`
          WHERE location_id = @location_id
            AND window_start_date = (SELECT window_start_date FROM win)
          LIMIT 1
          `,
          bqParams({ location_id, selected_date })
        );

        // Fallback: derive a window row from the daily surface (still semantic truth)
        if (!month_window) {
          month_window = await bqOne(
            `
            WITH win AS (
              SELECT
                COALESCE(DATE(@selected_date), CURRENT_DATE()) AS window_start_date,
                DATE_ADD(COALESCE(DATE(@selected_date), CURRENT_DATE()), INTERVAL 29 DAY) AS window_end_date
            ),
            base AS (
              SELECT *
              FROM \`${semanticProjectId}.semantic.vw_insight_event_30d_day_surface\`
              WHERE location_id = @location_id
                AND date BETWEEN (SELECT window_start_date FROM win)
                             AND (SELECT window_end_date   FROM win)
            )
            SELECT
              ANY_VALUE(semantic_contract_version) AS semantic_contract_version,
              'month' AS display_horizon,
              CONCAT(
                'Fenêtre 30 jours: ',
                FORMAT_DATE('%d/%m/%Y', (SELECT window_start_date FROM win)),
                ' → ',
                FORMAT_DATE('%d/%m/%Y', (SELECT window_end_date FROM win))
              ) AS display_label,
              'navigation_summary' AS ai_analysis_scope_guard,
              CAST(NULL AS STRING) AS key_takeaway,
              @location_id AS location_id,
              (SELECT window_start_date FROM win) AS window_start_date,
              (SELECT window_end_date   FROM win) AS window_end_date,
              COUNT(*) AS days_count,
              COUNTIF(opportunity_regime = 'A') AS days_a,
              COUNTIF(opportunity_regime = 'B') AS days_b,
              COUNTIF(opportunity_regime = 'C') AS days_c,
              COUNTIF(relative_rank_bucket = 'risk') AS days_risk,
              COUNTIF(relative_rank_bucket = 'top')  AS days_top_bucket,
              MIN(opportunity_score_final_local) AS score_min,
              MAX(opportunity_score_final_local) AS score_max,
              COUNTIF(weather_code IS NULL) AS days_missing_weather,
              ARRAY_AGG(
                STRUCT(
                  date,
                  opportunity_regime,
                  opportunity_score_final_local,
                  opportunity_medal,
                  weather_code
                )
                ORDER BY best_day_rank_excl_forced_c ASC, date ASC
                LIMIT 3
              ) AS top_days
            FROM base
            `,
            bqParams({ location_id, selected_date })
          );
        }

        if (!month_window?.window_start_date) {
          ai = {
            ok: false,
            mode: "company_centered",
            output: null,
            errors: ["month_window is null (no window row found)"],
            warnings: [],
            raw_text: "",
          };
          break;
        }

        const ws = ymdFromBqDate(month_window.window_start_date);
        month_ws = ws;

        if (!ws) {
          throw new Error("Invalid month_window.window_start_date (cannot normalize to YYYY-MM-DD)");
        }

        const monthConstraintYmd = inferSelectedDateFromMonthMention(q); // YYYY-MM-01 or null
        const monthConstraintYm = monthConstraintYmd ? monthConstraintYmd.slice(0, 7) : null;

        shortlist = await bqAll(
          `
          WITH win AS (
            SELECT
              DATE(@window_start_date) AS window_start_date,
              DATE_ADD(DATE(@window_start_date), INTERVAL 29 DAY) AS window_end_date
          )
          SELECT *
          FROM \`${semanticProjectId}.semantic.vw_insight_event_30d_day_surface\`
          WHERE location_id = @location_id
            AND date BETWEEN (SELECT window_start_date FROM win)
                        AND (SELECT window_end_date   FROM win)
            AND (
              @month_constraint_ym = ""
              OR FORMAT_DATE('%Y-%m', date) = @month_constraint_ym
            )
            AND COALESCE(opportunity_regime, '') != 'C'
            AND COALESCE(CAST(weather_alert_level AS INT64), 0) < 3
          ORDER BY
            opportunity_score_final_local DESC,
            CAST(weather_alert_level AS INT64) ASC NULLS LAST,
            CAST(events_within_10km_count AS INT64) ASC NULLS LAST,
            date ASC
          LIMIT 7
          `,
          bqParams({
            location_id,
            window_start_date: ws,
            month_constraint_ym: monthConstraintYm ?? "",
          })
        );

        shortlist_rows = shortlist ?? [];

        if (resolved_intent === "WINDOW_WORST_DAYS") {
          worstlist = await bqWorstlist({
            location_id,
            window_start_date: ws,
            hard_only: false,
            limit: 7,
          });
        }

        const shortlist0 = Array.isArray(shortlist) ? shortlist : [];
        const worstlist0 = Array.isArray(worstlist) ? worstlist : [];

        shortlist_rows = monthConstraintYm
          ? shortlist0.filter((r: any) => ymdFromAnyDate(r?.date).slice(0, 7) === monthConstraintYm)
          : shortlist0;

        if (resolved_intent === "WINDOW_TOP_DAYS") {
          shortlist_rows = shortlist_rows.slice(0, top_k);
        }
        // ---- V3: Per-day deterministic driver enrichment ----
        shortlist_rows = shortlist_rows.map((r: any) => {
          const weather = buildWeatherSignal(r, internal_context);
          const competition = buildCompetitionSignal(r);
          const calendar = buildCalendarSignal(r);
          const rank = (i: DecisionSignalImpact) => (i === "blocking" ? 3 : i === "risk" ? 2 : 1);
          const drivers = [
            { k: "weather", s: weather },
            { k: "competition", s: competition },
            { k: "calendar", s: calendar },
          ].filter((x) => x.s.applicable);
          const best = drivers.sort((a, b) => rank(b.s.impact) - rank(a.s.impact))[0];
          const confidence =
            best?.s.impact === "blocking" ? "high" :
            best?.s.impact === "risk" && Object.values(best.s.facts).filter((v) => v != null).length >= 2 ? "high" :
            best?.s.impact === "risk" ? "medium" : "low";
          return {
            ...r,
            v3_primary_driver: best?.k ?? null,
            v3_driver_impact: best?.s.impact ?? "neutral",
            v3_driver_confidence: confidence,
            v3_signals: { weather, competition, calendar },
          };
        });

        worstlist_rows = monthConstraintYm
          ? worstlist0.filter((r: any) => ymdFromAnyDate(r?.date).slice(0, 7) === monthConstraintYm)
          : worstlist0;

        month_days = await bqAll(
          `
          WITH win AS (
            SELECT
              COALESCE(DATE(@selected_date), CURRENT_DATE()) AS window_start_date,
              DATE_ADD(COALESCE(DATE(@selected_date), CURRENT_DATE()), INTERVAL 29 DAY) AS window_end_date
          )
          SELECT *
          FROM \`${semanticProjectId}.semantic.vw_insight_event_30d_day_surface\`
          WHERE location_id = @location_id
            AND date BETWEEN (SELECT window_start_date FROM win)
                        AND (SELECT window_end_date   FROM win)
            AND (
              @month_constraint_ym = ""
              OR FORMAT_DATE('%Y-%m', date) = @month_constraint_ym
            )
          ORDER BY date ASC
          `,
          bqParams({ location_id, selected_date, month_constraint_ym: monthConstraintYm ?? "" })
        );

        const source_rows =
          resolved_intent === "WINDOW_WORST_DAYS"
            ? worstlist_rows
            : shortlist_rows;

        const preselect_dates_for_url = source_rows
          .map((r: any) => ymdFromAnyDate(r?.date))
          .filter(Boolean)
          .slice(0, 7);

        month_redirect_url = buildMonthRedirectUrl({
          window_start_date: ws,
          focus: resolved_intent === "WINDOW_WORST_DAYS" ? "worstlist" : "shortlist",
          from_prompt: true,
          preselect_dates: preselect_dates_for_url,
        });

        if (resolved_intent === "WINDOW_WORST_DAYS") {
          // Defer to V3 month producer (Claude once) AFTER the switch.
          // We still compute worstlist_rows above for decision_payload + UI packaging.
          ai = {
            ok: true,
            mode: "month_pending_packaging",
            output: null,
            raw_text: "",
            errors: [],
            warnings: [],
          };
          break;
        }

        if (resolved_intent === "WINDOW_PATTERNS") {
          const out = windowPatternsDeterministic({ month_days });
          ai = {
            ok: true,
            mode: "deterministic_window_patterns_v1",
            output: {
              headline: out.headline,
              summary: out.summary,
              key_facts: out.key_facts,
              caveat: out.caveat,
            },
            raw_text: "",
            errors: [],
            warnings: [],
          };
          break;
        }

        if (resolved_intent === "WINDOW_FILTER_DAYS") {
          const out = windowFilterDaysDeterministic({ q, month_days });
          ai = {
            ok: true,
            mode: "deterministic_window_filter_days_v1",
            output: { headline: out.headline, summary: out.summary, key_facts: out.key_facts, caveat: out.caveat },
            raw_text: "",
            errors: [],
            warnings: [],
          };
          break;
        }

        if (resolved_intent === "DRIVER_PRIMARY") {
          const signals = buildDecisionSignals({
            q,
            intent: resolved_intent,
            horizon: resolved_horizon,
            internal_context,
            shortlist_rows,
            worstlist_rows,
            day_row,
            selected_days_rows,
          });

          const local_decision_payload: DecisionPayload = {
            kind: "scoring",
            horizon: resolved_horizon as "month" | "calendar_month" | "day" | "selected_days",
            intent: resolved_intent as ScoringIntent,
            used_dates: shortlist_rows.map((r: any) => ymdFromAnyDate(r?.date)).slice(0, 7),
            signals,
          };

          const out = driverPrimaryDeterministic({ q, decision_payload: local_decision_payload });

          ai = {
            ok: true,
            mode: "deterministic_driver_primary_v1",
            output: { headline: out.headline, summary: out.summary, key_facts: out.key_facts, caveat: out.caveat },
            raw_text: "",
            errors: [],
            warnings: [],
          };
          break;
        }

        // Default month path:
        // V2 normalization + Claude packaging are done AFTER the switch
        // (once decision_payload + ui_v2 are built with correct scope).
        ai = {
          ok: true,
          mode: "month_pending_packaging",
          output: null,
          raw_text: "",
          errors: [],
          warnings: [],
        };

        break;
      }

      case "day": {

        const isDayLike =
          resolved_horizon === "day" ||
          resolved_intent === "DAY_WHY" ||
          resolved_intent === "DAY_DIMENSION_DETAIL";

        // normalize/validate any explicit "date" field (do NOT trust non-empty strings)
        const dateFieldYmd = safeYmd10(date); // returns YYYY-MM-DD or null/undefined
        const hasParsedDate = dateMentions.dates.length > 0 || !!dateFieldYmd;

        if (isDayLike) {
          // User likely wrote a date (e.g. "mardi 2 juin 2026") but parsing produced nothing.
          // Prevent silent fallback to selected_date => wrong-day 200.
          if (dateMentions.unparsedDateToken && !hasParsedDate) {
            // Prefer your existing 400 mechanism. If you don't have one, return Response 400 here.
            throw new Error(
              "Impossible d’identifier la date demandée. Écrivez-la au format JJ/MM/AAAA ou YYYY-MM-DD."
            );
          }
        }

        const effective_date = (
          override_day_date ??
          dateFieldYmd ??
          dateMentions.dates[0] ??
          selected_date
        ).slice(0, 10);

        day_row = await bqOne(
          `
          SELECT *
          FROM \`${semanticProjectId}.semantic.vw_insight_event_day_surface\`
          WHERE location_id = @location_id
            AND date = DATE(@date)
          LIMIT 1
          `,
          bqParams({ location_id, date: effective_date })
        );

        const ir = renderDayWhyV1({
          date: effective_date,
          day_row,
          location_context: internal_context,
        });

        if (!ir) {
          throw new Error("DAY_WHY: null IR");
        }

        // ✅ Adapt DayWhy IR -> canonical Facts V1 boundary shape
        const dayFactsByDate = adaptDayFactsByDate(ir);
        const dayLineItems = adaptDayLineItems(ir.line_items);

        // ✅ Assert BEFORE rendering
        assertNoSentenceWithoutFactIdV1(dayFactsByDate, dayLineItems);

        // ✅ Render via canonical renderer (same as selected_days / lookup)
        const render_lines = renderLineItemsFrV1({
          facts_by_date: dayFactsByDate,
          line_items: dayLineItems,
        });

        const headline =
          render_lines.find((l) => l.kind === "headline")?.text_fr ??
          "Pourquoi ce jour";

        const key_facts =
          render_lines
            .filter((l) => l.kind !== "headline")
            .map((l) => String(l.text_fr ?? "").trim())
            .filter(Boolean);

        ai = {
          ok: true,
          mode: "deterministic_daywhy_ir_v1",
          output: {
            headline,
            answer: "",
            key_facts,
            reasons: [],
            caveats: [],
          },
          raw_text: "",
          errors: [],
          warnings: [],
        };

        break;
      }
      case "selected_days": {
        selected_query_dates =
          (override_compare_dates.length > 0 ? override_compare_dates : effective_dates)
            .map((d) => String(d).slice(0, 10))
            .slice(0, 7);

        const query_dates = selected_query_dates;
        
        if (query_dates.length < 2) {

          const month_redirect_url = buildMonthRedirectUrl({
            window_start_date: selected_date.slice(0,10),
            from_prompt: true
          });

          const ai_missing_dates = {
            ok: true,
            mode: "deterministic_missing_dates_v1",
            output: {
              headline: "J’ai besoin d’au moins 2 dates",
              summary:
                "Sélectionnez 2 à 7 jours dans le calendrier, ou écrivez-les en toutes lettres (ex: 1 juin 2026) ou au format 02/06/2026.",
              key_facts: [],
              caveat:
                "Sans 2 dates, je ne peux pas comparer les impacts (logistique, affluence, communication).",
            },
            raw_text: "",
            errors: [],
            warnings: [],
          };

          const actions_missing: ApiActions = {
            month_redirect_url,
            primary: month_redirect_url
              ? {
                  type: "redirect",
                  url: month_redirect_url,
                  label: "Ouvrir le mois"
                }
              : null,
            secondary: [],
          };

          const normalized_ai_missing = normalizeAiOutput(
            ai_missing_dates,
            { horizon: resolved_horizon, intent: resolved_intent, used_dates: [] },
            actions_missing
          );

          return new Response(
            JSON.stringify({
              ok: true,
              meta: {
                location_id,
                resolved_horizon,
                resolved_intent,
                month_redirect_url,
                producer: "deterministic_missing_dates_v1",
              },
              ai: {
                ...normalized_ai_missing,
                output: {
                  headline: normalized_ai_missing.headline,
                  answer:
                    typeof normalized_ai_missing.answer === "string"
                      ? normalized_ai_missing.answer
                      : "",
                  key_facts: Array.isArray(normalized_ai_missing.key_facts)
                    ? normalized_ai_missing.key_facts
                    : [],
                  reasons: Array.isArray(normalized_ai_missing.reasons)
                    ? normalized_ai_missing.reasons
                    : [],
                  caveats: Array.isArray(normalized_ai_missing.caveats)
                    ? normalized_ai_missing.caveats.filter(Boolean)
                    : [],
                },
              },
              actions: actions_missing,
              top_dates: [],
              decision_payload: {
                kind: "scoring",
                horizon: resolved_horizon as
                  | "month"
                  | "calendar_month"
                  | "day"
                  | "selected_days",
                intent: resolved_intent as ScoringIntent,
                used_dates: [],
                signals: {},
              },
              window_aggregates_v3: null,
              ui_packaging_v3: null,
            }),
            {
              status: 200,
              headers: { "content-type": "application/json; charset=utf-8" },
            }
          );
        }

        selected_days_rows = await bqAll(
          `
          SELECT *
          FROM \`${semanticProjectId}.semantic.vw_insight_event_selected_days_surface\`
          WHERE location_id = @location_id
            AND date IN UNNEST(
              ARRAY(SELECT DATE(x) FROM UNNEST(@dates) AS x)
            )
          ORDER BY date ASC
          `,
          bqParams({ location_id, dates: query_dates })
        );

        const v1 = compareDatesDeterministicV1({
          rows: Array.isArray(selected_days_rows) ? selected_days_rows : [],
        });

        assertNoSentenceWithoutFactIdV1(v1.facts_by_date, v1.line_items);

        // Render IR → French (deterministic renderer only)
        const render_lines = renderLineItemsFrV1({
          line_items: v1.line_items,
          facts_by_date: v1.facts_by_date,
        });

        // --- API boundary enforcement (single authoritative contract check) ---
        const allFactIds = new Set<string>();
        for (const d of Object.keys(v1.facts_by_date)) {
          for (const f of v1.facts_by_date[d] ?? []) {
            allFactIds.add(f.fact_id);
          }
        }

        for (let i = 0; i < render_lines.length; i++) {
          const rl = render_lines[i];

          if (!Array.isArray(rl.fact_ids) || rl.fact_ids.length === 0) {
            throw new Error(`RenderLine[${i}] has no fact_ids`);
          }

          for (const fid of rl.fact_ids) {
            if (!allFactIds.has(fid)) {
              throw new Error(`RenderLine[${i}] references unknown fact_id: ${fid}`);
            }
          }

          if (typeof rl.text_fr !== "string" || !rl.text_fr.trim()) {
            throw new Error(`RenderLine[${i}] has empty text_fr`);
          }
        }

        // --- Map render_lines → legacy UI shape (compare-only) ---
        const ALLOWED_COMPARE_KINDS = new Set(["headline", "fact", "implication", "caveat"]);

        const compare_lines = render_lines.filter((l) => ALLOWED_COMPARE_KINDS.has(l.kind));

        const headline =
          compare_lines.find((l) => l.kind === "headline")?.text_fr ??
          "Comparaison";

        const caveat =
          compare_lines.find((l) => l.kind === "caveat")?.text_fr ?? null;

        const key_facts_raw =
          compare_lines
            .filter((l) => l.kind === "fact" || l.kind === "implication")
            .map((l) => String(l.text_fr ?? "").trim())
            .filter(Boolean);

        // Strip month-style “best choice / alternative” lines that should never appear in compare
        const DROP_PREFIX_RE = /^(meilleur choix:|risque meteo:|risque météo:|concurrence:|driver principal:|alternative:)/i;

        const key_facts_filtered = key_facts_raw.filter((t) => !DROP_PREFIX_RE.test(t));

        // Fallback: if renderer collapses to month-style blocks, build 1 fact row per selected date (truth-only)
        const key_facts =
          key_facts_filtered.length > 0
            ? key_facts_filtered
            : buildCompareKeyFactsFallback(selected_days_rows);

        ai = {
          ok: true,
          mode: "deterministic_compare_dates_v1",
          output: {
            headline,
            answer: "Comparaison des points clés ci-dessous.",
            key_facts,
            caveat,
            reasons: [],
            caveats: caveat ? [caveat] : [],
          },
          raw_text: "",
          errors: [],
          warnings: [],
        };
        break;
      }

      case "lookup_event": {
        // ---- truth scope only: vw_insight_eventcalendar_event_lookup ----
        const region_insee =
          (internal_context as any)?.region_code_insee ??
          (internal_context as any)?.row?.region_code_insee ??
          null;

        const city_id =
          (internal_context as any)?.city_id ??
          (internal_context as any)?.row?.city_id ??
          null;

        const q_lookup_raw = String(qRaw ?? "").toLowerCase();

        const q_entity = q_lookup_raw
          // remove common question shells
          .replace(/^a quelle date a lieu\s+/i, "")
          .replace(/^à quelle date a lieu\s+/i, "")
          .replace(/^quand a lieu\s+/i, "")
          .replace(/^c['’]est quand\s+/i, "")
          .replace(/^dates de\s+/i, "")
          .replace(/^date de\s+/i, "")
          // remove leading french determiners / contractions that break LIKE
          .replace(/^(le|la|les|un|une|des)\s+/i, "")
          .replace(/^l['’]\s*/i, "")
          .replace(/^d['’]\s*/i, "")
          .replace(/^du\s+/i, "")
          .replace(/^de\s+/i, "")
          .replace(/^de la\s+/i, "")
          .replace(/^des\s+/i, "")
          // strip trailing punctuation
          .replace(/[?!.,;:]+$/g, "")
          .trim();

        const lookupSqlScoped = `
          SELECT
            event_name,
            event_start_date,
            event_end_date
          FROM \`${semanticProjectId}.semantic.vw_insight_eventcalendar_event_lookup\`
          WHERE location_id = @location_id
            AND LOWER(event_name) LIKE CONCAT('%', @q_entity, '%')
          LIMIT 1
        `;

        const lookupSqlGlobal = `
          SELECT
            event_name,
            event_start_date,
            event_end_date
          FROM \`${semanticProjectId}.semantic.vw_insight_eventcalendar_event_lookup\`
          WHERE location_id IS NULL
            AND LOWER(event_name) LIKE CONCAT('%', @q_entity, '%')
          LIMIT 1
        `;

        const rows_scoped = await bqAll(
          lookupSqlScoped,
          bqParams({ q_entity, location_id })
        );

        let rows = rows_scoped;

        if (!Array.isArray(rows_scoped) || rows_scoped.length === 0) {
          const rows_global = await bqAll(
            lookupSqlGlobal,
            bqParams({ q_entity })
          );
          rows = rows_global;
        }

        lookup_mode = Array.isArray(rows_scoped) && rows_scoped.length ? "scoped" : "fallback_global";
        lookup_sql_used = lookup_mode;

        const hit = Array.isArray(rows) && rows.length ? rows[0] : null;
        const lookup_result = {
          event_name: hit?.event_name ?? null,
          event_start_date: hit?.event_start_date ?? null,
          event_end_date: hit?.event_end_date ?? null,
        };
        lookup_hit = lookup_result;

        // --- V3: Shared Lookup IR builder ---
        const ir = buildLookupIRV1FromRow(hit);

        // Render via shared deterministic renderer
        const render_lines = renderLineItemsFrV1({
          line_items: ir.line_items,
          facts_by_date: ir.facts_by_date,
        });

        const headline =
          render_lines.find((l) => l.kind === "headline")?.text_fr ??
          "Résultat événement";

        const key_facts =
          render_lines
            .filter((l) => l.kind !== "headline")
            .map((l) => l.text_fr);

        ai = {
          ok: true,
          mode: "deterministic_lookup_event_ir_v1",
          output: {
            headline,
            answer: "",
            key_facts,
            reasons: [],
            caveats: [],
          },
          raw_text: "",
          errors: [],
          warnings: [],
        };

        break;
      }

      default: {
        // Exhaustive safety (should never happen)
        throw new Error(`Unsupported resolved_horizon: ${String(resolved_horizon)}`);
      }
    }
  
    const top_dates = shortlist_rows.slice(0, top_k).map((r: any) => {
      const toFiniteNumOrNull = (v: any) => {
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n : null;
      };

      return {
        date: ymdFromAnyDate(r?.date),
        regime: typeof r?.opportunity_regime === "string" ? r.opportunity_regime : null,
        score: (() => {
          const n = toFiniteNumOrNull(r?.opportunity_score_final_local);
          return n === null ? null : Math.round(n);
        })(),

        weather_alert_level: toFiniteNumOrNull(r?.weather_alert_level),
        precip_probability_max_pct: toFiniteNumOrNull(r?.precip_probability_max_pct),
        wind_speed_10m_max: toFiniteNumOrNull(r?.wind_speed_10m_max),

        events_within_5km_count: toFiniteNumOrNull(r?.events_within_5km_count),
        events_within_10km_count: toFiniteNumOrNull(r?.events_within_10km_count),

        // useful for UI decisions without inventing routes
        available_next_views: r?.available_next_views ?? null,
      };
    });

    // types: ApiAction / ApiActions are declared at file scope

    // NOTE: no route guessing. We only ever send users to the Month page with anchor_date.
    const effective_day_date =
      resolved_horizon === "day" && day_row
        ? ymdFromAnyDate(day_row?.date)
        : (override_day_date ??
            (date ?? selected_date)
          ).slice(0, 10);
    
    const first_selected_date = (effective_dates[0] ? String(effective_dates[0]).slice(0, 10) : null);

    let primary: ApiAction | null = null;
    const secondary: ApiAction[] = [];

    if (resolved_horizon === "month") {
      if (month_redirect_url) {
        primary = {
          type: "redirect",
          url: month_redirect_url,
          label: resolved_intent === "WINDOW_WORST_DAYS"
            ? "Ouvrir le mois (jours à éviter)"
            : "Ouvrir le mois (shortlist)",
        };
      }
    } else if (resolved_horizon === "day") {
      // We do not assume a Day route exists. Fallback = month anchored on the date.
      const url = buildMonthRedirectUrl({
        window_start_date: effective_day_date,
        focus: "shortlist",
        from_prompt: true,
      });
      primary = { type: "redirect", url, label: "Ouvrir le mois (ancré sur ce jour)" };
    } else if (resolved_horizon === "selected_days") {
      // No route guessing. Fallback = month anchored on first selected date.
      if (first_selected_date) {
        const url = buildMonthRedirectUrl({
          window_start_date: first_selected_date,
          focus: "shortlist",
          from_prompt: true,
        });
        primary = { type: "redirect", url, label: "Ouvrir le mois (ancré sur la 1ère date)" };
      }
    }

    const actions: ApiActions = {
      month_redirect_url: month_redirect_url ?? null,
      primary,
      secondary,
    };

    const decision_used_dates: string[] = (() => {
      if (resolved_horizon === "selected_days") {
        const qd =
          (override_compare_dates.length > 0 ? override_compare_dates : effective_dates)
            .map((d) => String(d).slice(0, 10))
            .slice(0, 7);
        return qd;
      }

      if (resolved_horizon === "day") {
        return [effective_day_date];
      }

      // month
      if (resolved_intent === "WINDOW_WORST_DAYS") {
        return worstlist_rows.map((r: any) => ymdFromAnyDate(r?.date)).slice(0, top_k);
      }

      return shortlist_rows.map((r: any) => ymdFromAnyDate(r?.date)).slice(0, top_k);
    })();

    function buildDeterministicReasons(args: {
      horizon: ResolvedHorizon;
      intent: Intent;
      signals: DecisionSignals;
      top_dates: any[];
      month_window: any | null;
    }): string[] {
      const reasons: string[] = [];
      const s = args.signals ?? {};

      // ── Anchor context for WORST_DAYS (no logic change, no refactor)
      if (args.horizon === "month" && args.intent === "WINDOW_WORST_DAYS") {
        const label =
          typeof args.month_window?.display_label === "string"
            ? args.month_window.display_label
            : "les 30 prochains jours";

        reasons.push(
          `Analyse basée sur ${label}. En l’absence de précision contraire, cette réponse concerne ce lieu sur la période à venir.`
        );
      }

      // Only attach "Shortlist (top k)" to TOP_DAYS (never to WORST_DAYS).
      if (args.horizon === "month" && args.intent === "WINDOW_TOP_DAYS") {
        if (Array.isArray(args.top_dates) && args.top_dates.length) {
          const k = Math.max(1, Math.min(7, args.top_dates.length));
          const lines = args.top_dates
            .slice(0, k)
            .map((d: any, i: number) => `#${i + 1} ${d.date}: score ${d.score ?? "ND"}, régime ${d.regime ?? "ND"}`);
          reasons.push(`Shortlist (top ${k}): ${lines.join(" | ")}`);
        }
      }

      // Avoid duplication: month WORST/TOP already expresses the signals in key_facts (conversation layer)
      const convoAlreadyCoversSignals =
        args.horizon === "month" && (args.intent === "WINDOW_TOP_DAYS" || args.intent === "WINDOW_WORST_DAYS");

      if (!convoAlreadyCoversSignals) {
        if (s.weather) reasons.push(s.weather.explanation);
        if (s.competition) reasons.push(s.competition.explanation);
        if (s.calendar) reasons.push(s.calendar.explanation);
      }

      // Only attach month window key_takeaway to TOP_DAYS (avoid “synthèse” spam for worst-days).
      if (args.horizon === "month" && args.intent === "WINDOW_TOP_DAYS") {
        const kt = typeof args.month_window?.key_takeaway === "string" ? args.month_window.key_takeaway.trim() : "";
        if (kt) reasons.push(kt);
      }

      return reasons;
    }

    const decision_payload: DecisionPayload = (() => {
      if (!isScoringIntent(resolved_intent)) {
        return {
          kind: "lookup",
          horizon: "lookup_event",
          intent: "EVENT_LOOKUP",
          used_dates: [],
          signals: {},
        };
      }

      // ✅ Narrow horizon to the scoring union (no casts)
      const scoring_horizon: Extract<ResolvedHorizon, "month" | "calendar_month" | "day" | "selected_days"> =
        resolved_horizon === "lookup_event" ? "month" : resolved_horizon;

      return {
        kind: "scoring",
        horizon: scoring_horizon,
        intent: resolved_intent,
        used_dates: decision_used_dates,
        signals: buildDecisionSignals({
          q,
          intent: resolved_intent,
          horizon: scoring_horizon,
          internal_context,
          shortlist_rows,
          worstlist_rows,
          day_row,
          selected_days_rows,
        }),
      };
    })();

    // ---- DETERMINISTIC REASONS (computed before any UI normalization) ----
    const deterministic_reasons = buildDeterministicReasons({
      horizon: resolved_horizon,
      intent: resolved_intent,
      signals:
        decision_payload.kind === "scoring"
          ? decision_payload.signals
          : {},      
      top_dates,
      month_window,
    });

    // ----------------------------
  // V3 MONTH → NarrativeInputV3 → Claude
  // ----------------------------

  const shouldRunWindowNarrativeV3 =
    resolved_horizon === "month" &&
    (resolved_intent === "WINDOW_TOP_DAYS" || resolved_intent === "WINDOW_WORST_DAYS") &&
    ai?.mode === "month_pending_packaging";

  if (shouldRunWindowNarrativeV3) {

    const rows =
      resolved_intent === "WINDOW_WORST_DAYS"
        ? (Array.isArray(worstlist_rows) ? worstlist_rows : [])
        : (Array.isArray(shortlist_rows) ? shortlist_rows : []);

    const window_start = ymdFromBqDate(month_window?.window_start_date);
    if (!window_start) {
      throw new Error("window_start_date missing or invalid (month_window)");
    }

    const winner = rows.length ? rows[0] : null;
    if (!winner) {
      throw new Error("No ranked rows available for month narrative V3");
    }

    // ------------------------------------
    // 1️⃣ Build deterministic signals
    // ------------------------------------

    const weather = buildWeatherSignal(winner, internal_context);
    const competition = buildCompetitionSignal(winner);
    const calendar = buildCalendarSignal(winner);

    const candidates = [
      { dimension: "weather", signal: weather },
      { dimension: "competition", signal: competition },
      { dimension: "calendar", signal: calendar },
    ].filter(x => x.signal.applicable);

    const impactRank = (i: DecisionSignalImpact) =>
      i === "blocking" ? 0 :
      i === "risk" ? 1 :
      2;

    candidates.sort((a, b) => {
      const diff = impactRank(a.signal.impact) - impactRank(b.signal.impact);
      if (diff !== 0) return diff;

      // deterministic tie-break
      const order = ["weather", "competition", "calendar"];
      return order.indexOf(a.dimension) - order.indexOf(b.dimension);
    });

    const dominant = candidates[0];

    const secondary = candidates
      .slice(1)
      .map(x => ({
        dimension: x.dimension,
        impact: x.signal.impact,
        signal_summary: x.signal.facts,
      }));

    const confidence =
      dominant?.signal.impact === "blocking" ? "high" :
      dominant?.signal.impact === "risk" &&
      Object.values(dominant.signal.facts).filter(v => v !== null).length >= 2
        ? "high"
        : dominant?.signal.impact === "risk"
          ? "medium"
          : "low";

    // ------------------------------------
    // 2️⃣ NarrativeInputV3 (LEAN)
    // ------------------------------------

    const narrative_input_v3 = {
      horizon: resolved_horizon,
      intent: resolved_intent,

      used_period: {
        month: window_start.slice(0, 7),
        total_days: Array.isArray(month_days) ? month_days.length : 30,
      },

      dominant_driver: {
        dimension: dominant?.dimension ?? "calendar",
        impact: dominant?.signal.impact ?? "neutral",
        confidence,
        structural_reason: dominant?.signal.primary_drivers?.[0] ?? null,
        signal_summary: dominant?.signal.facts ?? {},
      },

      secondary_drivers: secondary,

      business_profile: {
        location_type: internal_context?.location_type ?? null,
        event_time_profile: internal_context?.event_time_profile ?? null,
        primary_audience_1: internal_context?.primary_audience_1 ?? null,
        primary_audience_2: internal_context?.primary_audience_2 ?? null,
      },
    };

    // ------------------------------------
    // 3️⃣ Claude Call (safe wrapper)
    // ------------------------------------

    try {
      ai = await runAIPackagerClaude({
        mode: "v3_narrative",
        row: narrative_input_v3,
      });

      producer = "v3_claude";

    } catch (e) {

      // Hard fallback: minimal deterministic winner IR (no rewrite)
      const winner_date = ymdFromAnyDate(winner.date);

      ai = {
        ok: true,
        mode: "v3_fallback_deterministic",
        output: {
          headline: resolved_intent === "WINDOW_WORST_DAYS"
            ? "Date la moins favorable"
            : "Fenêtre favorable détectée",
          answer: "",
          key_facts: [
            `Régime ${winner.opportunity_regime ?? "ND"}`,
          ],
          reasons: [],
          caveats: [],
        },
        raw_text: "",
        errors: [],
        warnings: [],
      };

      producer = "v3_fallback_deterministic";
    }
  }

    // ---- NORMALIZED AI (stable contract for UI) ----
    const normalized_ai_base = normalizeAiOutput(
      ai,
      {
        horizon: resolved_horizon,
        intent: resolved_intent,
        used_dates: decision_used_dates,
      },
      actions
    );

    // ----------------------------
    // Truth-only rules (attach for ALL horizons)
    // ----------------------------
    function signalRulesFr(signals: DecisionSignals): string[] {
      const rules: string[] = [];
      const s = signals ?? {};

      if (s.weather) {
        rules.push(
          "Règle météo v1 (truth): alerte météo ≥ 3 ⇒ impact 'blocking'; sinon pluie/vent non nuls ⇒ impact 'risk' si lieu non confirmé intérieur."
        );
      }
      if (s.competition) {
        rules.push(
          "Règle concurrence v1 (truth): si un compteur d’événements > 0 (≤5/10/50 km) ⇒ impact 'risk'; sinon 'neutral'."
        );
      }
      if (s.calendar) {
        rules.push(
          "Règle calendrier v1 (truth): si au moins un flag est true (week-end/férié/vacances/promo) ⇒ impact 'risk'; sinon 'neutral'."
        );
      }

      return rules.slice(0, 3);
    }

    // ---- normalized_ai (stable contract for UI) ----
    const normalized_ai: AiResponseV1 = {
      ...normalized_ai_base,

      caveats: asStringArray(normalized_ai_base.caveats),

      // Reasons: only for day / selected_days (fallback to deterministic if AI has none)
      reasons:
        (resolved_horizon === "day" || resolved_horizon === "selected_days")
          ? (
              Array.isArray(normalized_ai_base.reasons) && normalized_ai_base.reasons.length > 0
                ? normalized_ai_base.reasons
                : deterministic_reasons
            )
          : [],
    };

    // ---- RESPONSE (truth payload ready for AI) ----
    return new Response(
      JSON.stringify({
        ok: true,

        meta: {
          location_id,
          resolved_horizon,
          resolved_intent,
          producer,
        },

        // ✅ Backward-compat UI contract: keep legacy ai.output.*
        // Keep normalized_ai as the canonical v1 contract you control.
        ai: {
          ...normalized_ai,

          // Legacy UI readers often detect "displayable content" via ai.output.summary/headline
          output: {
            headline: normalized_ai.headline,
            answer: (typeof normalized_ai.answer === "string" ? normalized_ai.answer : ""),
            key_facts: Array.isArray(normalized_ai.key_facts) ? normalized_ai.key_facts : [],
            reasons: Array.isArray(normalized_ai.reasons) ? normalized_ai.reasons : [],
            caveats: Array.isArray(normalized_ai.caveats) ? normalized_ai.caveats.filter(Boolean) : [],
          },
        },

        actions,
        top_dates,
        decision_payload,

        window_aggregates_v3,
        ui_packaging_v3,

        // ✅ keep raw only for debugging
        debug: {
          ai_raw: ai,
          lookup_hit,
          lookup_mode,
          lookup_sql_used,

          thread_context_out: {
            v: 1,
            location_id,
            turn:
              thread_context && typeof thread_context.turn === "number"
                ? thread_context.turn + 1
                : 1,            
            selected_date:
              resolved_horizon === "day" && day_row
                ? ymdFromAnyDate(day_row?.date)
                : selected_date.slice(0, 10),            
            last: {
              horizon: resolved_horizon,
              intent: resolved_intent,
              used_dates: decision_used_dates,
              top_dates,
            },
          },

          internal_context: {
            source_view: `${semanticProjectId}.semantic.vw_insight_event_ai_location_context`,
            row: internal_context,
          },

          daywhy_input:
            resolved_horizon === "day"
              ? {
                  date: day_row ? ymdFromAnyDate(day_row?.date) : null,
                  day_row,
                  location_context: internal_context
                }
              : null,

          decision_policy_rules: {
            source_view: `${semanticProjectId}.semantic.vw_ms_insight_ai_decision_policy_rules`,
            rows: decision_policy_rules,
          },

          score_debug: (() => {
            const rows = Array.isArray(month_days) ? month_days : [];
            const scores = rows
              .map((r: any) => {
                const n =
                  typeof r?.opportunity_score_final_local === "number"
                    ? r.opportunity_score_final_local
                    : Number(r?.opportunity_score_final_local);
                return Number.isFinite(n) ? n : null;
              })
              .filter((x: any) => x !== null) as number[];

            scores.sort((a, b) => a - b);

            const min = scores.length ? Math.round(scores[0]) : null;
            const max = scores.length ? Math.round(scores[scores.length - 1]) : null;

            return { min, max, n_scored_days: scores.length, n_month_days: rows.length };
          })(),

          calendar_coverage_debug: (() => {
            const rows = Array.isArray(month_days) ? month_days : [];
            const isNull = (v: any) => v === null || v === undefined;

            const miss = (key: string) => rows.filter((r: any) => isNull(r?.[key])).length;

            return {
              n_month_days: rows.length,
              miss_is_weekend: miss("is_weekend"),
              miss_is_public_holiday_fr_flag: miss("is_public_holiday_fr_flag"),
              miss_is_school_holiday_flag: miss("is_school_holiday_flag"),
              miss_is_commercial_event_flag: miss("is_commercial_event_flag"),
            };
          })(),

          semantic_truth: {
            month_window,
            month_days,
            day: day_row,
            selected_days: selected_days_rows,
            shortlist,
          },
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("PROMPT_API_ERROR:", err);

    return new Response(
      JSON.stringify({
        ok: false,
        error: err?.message ?? "Unknown error",
        stack: process.env.NODE_ENV === "development" ? String(err?.stack ?? "") : undefined,
      }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      }
    );
  }
};
