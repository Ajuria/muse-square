import type { ImpactAssertionAssetV1 } from "./impact_assertion_asset.v1";

type CompileMonthImpactArgs = {
  intent: "WINDOW_TOP_DAYS" | "WINDOW_WORST_DAYS";
  horizon: "month";
  used_dates: string[]; // ISO, already selected
  decision_signals: any; // decision_payload.signals
  assertions: ImpactAssertionAssetV1[];
};

export function compileMonthImpactNarrationV1(
  args: CompileMonthImpactArgs
): { key_facts: string[] } {
  const facts: string[] = [];
    function norm(s: unknown): string {
    return String(s ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function isApplicable(sig: any): boolean {
    return sig?.applicable === true;
  }

  function canonicalDimension(d: unknown): "weather" | "competition" | "calendar" | null {
    const x = norm(d);

    // Weather
    if (x === "weather" || x === "meteo" || x === "météo") return "weather";

    // Competition
    if (
      x === "competitive_proximity" ||
      x === "competition" ||
      x.includes("proximite") ||
      x.includes("concurrent")
    )
      return "competition";

    // Calendar / seasonality
    if (
      x === "seasonality_and_calendar" ||
      x === "calendar" ||
      x.includes("vacances") ||
      x.includes("saisonnalite") ||
      x.includes("evenements commerciaux")
    )
      return "calendar";

    return null;
  }

  // ---- Dimension selection (NO TEXT HERE) ----
  function pickSignal(s: any, keys: string[]): any {
    for (const k of keys) {
      if (s?.[k] && typeof s[k] === "object") return s[k];
    }
    return null;
  }

  const s0 = args.decision_signals ?? {};
  const s1 = s0.signals ?? s0;
  const s2 = s1.dimensions ?? s1;

  const sigWeather =
    pickSignal(s2, ["weather", "WEATHER"]) ??
    pickSignal(s1, ["weather", "WEATHER"]) ??
    null;

  const sigCompetition =
    pickSignal(s2, ["competition", "COMPETITION", "nearby_events", "NEARBY_EVENTS"]) ??
    pickSignal(s1, ["competition", "COMPETITION", "nearby_events", "NEARBY_EVENTS"]) ??
    null;

  const sigCalendar =
    pickSignal(s2, ["calendar", "CALENDAR", "seasonality_and_calendar", "SEASONALITY_AND_CALENDAR"]) ??
    pickSignal(s1, ["calendar", "CALENDAR", "seasonality_and_calendar", "SEASONALITY_AND_CALENDAR"]) ??
    null;

  const applicableDimensions: ImpactAssertionAssetV1[] = args.assertions.filter((a) => {
    const dim = canonicalDimension((a as any).dimension);
    if (dim === "weather") return isApplicable(sigWeather);
    if (dim === "competition") return isApplicable(sigCompetition);
    if (dim === "calendar") return isApplicable(sigCalendar);
    return false;
  });

  // ---- Implication selection (VERBATIM ONLY) ----
  for (const asset of applicableDimensions) {
    if (facts.length >= 3) break;

    // deterministic rule: take the FIRST implication
    // (later you can refine, but MVP = deterministic)
    const imp = asset.implications?.[0];
    if (imp) facts.push(imp);
  }

  return {
    key_facts: facts.slice(0, 3),
  };
}
