// src/lib/ai/decision/day_why/day_why_v1.ts
// =====================================================
// DayWhy v1 — Deterministic, Fact-Anchored
// =====================================================

import { renderPointsClesV1 } from "../../render/shared/render_points_cles_v1";

export type DayWhyV1Input = {
  date: string;
  day_row: any | null;
  location_context: any | null;
};

export type FactV1 = {
  fact_id: string;
  dimension: "WEATHER" | "NEARBY_EVENTS" | "CALENDAR" | "SCORE" | "OTHER";
  label: string;
  value?: string | number | null;
  coverage?: "observed" | "forecast" | "none";
};

export type LineItemV1 = {
  fact_id: string;
  text_fr: string;
  kind?: "fact" | "risk" | "action";
};

export type DayWhyIRV1 = {
  v: 1;
  date: string;
  headline_fr: string;
  facts: FactV1[];
  line_items: LineItemV1[];
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toNum(v: any): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function deriveCompetitionNearTotal(r: any) {
  const near =
    (toNum(r?.events_within_500m_count) ?? 0) +
    (toNum(r?.events_within_5km_count) ?? 0) +
    (toNum(r?.events_within_10km_count) ?? 0);

  const total = near + (toNum(r?.events_within_50km_count) ?? 0);

  return { near, total };
}

export function renderDayWhyV1(
  input: DayWhyV1Input
): DayWhyIRV1 | null {
  const date = input?.date?.slice(0, 10);
  if (!date || !ISO_DATE_RE.test(date)) return null;

  const r = input?.day_row;
  const ctx = input?.location_context;

  const facts: FactV1[] = [];

  if (!r) {
    return {
      v: 1,
      date,
      headline_fr: `Pourquoi ce jour ? — ${date}`,
      facts: [
        {
          fact_id: "day.data.missing",
          dimension: "OTHER",
          label: "Disponibilité des données",
          value: "missing",
          coverage: "none",
        },
      ],
      line_items: [
        {
          fact_id: "day.data.missing",
          kind: "risk",
          text_fr: "Données du jour indisponibles.",
        },
      ],
    };
  }

  const items: {
    fact_ids: string[];
    text: string;
    kind: "verdict" | "primary" | "secondary" | "action";
  }[] = [];


  // ---------------------------------------------------
  // SCORE / VERDICT
  // ---------------------------------------------------

  const regime = String(r?.opportunity_regime ?? "").toUpperCase();
  const verdictText =
    regime === "A"
      ? "Jour globalement favorable (catégorie A)."
      : regime === "B"
      ? "Jour correct mais non optimal (catégorie B)."
      : regime === "C"
      ? "Jour défavorable (catégorie C)."
      : null;

  facts.push({
    fact_id: "day.score.verdict",
    dimension: "SCORE",
    label: "Régime",
    value: regime || null,
    coverage: "observed",
  });

  if (verdictText) {
    items.push({
      fact_ids: ["day.score.verdict"],
      text: verdictText,
      kind: "verdict",
    });
  }

  // ---------------------------------------------------
  // COMPETITION
  // ---------------------------------------------------

  const { near, total } = deriveCompetitionNearTotal(r);

  facts.push({
    fact_id: "day.competition.summary",
    dimension: "NEARBY_EVENTS",
    label: "Concurrence",
    value: total,
    coverage: "observed",
  });

  const competitionText =
    near > 0
      ? "Risque de cannibalisation directe ce jour-là."
      : total > 0
      ? "Concurrence présente, mais peu susceptible d’impacter directement votre événement."
      : "Aucune pression concurrentielle significative.";

  items.push({
    fact_ids: ["day.competition.summary"],
    text: competitionText,
    kind: near > 0 ? "primary" : "secondary",
  });

  // ---------------------------------------------------
  // WEATHER
  // ---------------------------------------------------

  const alert = toNum(r?.alert_level_max);
  const pp = toNum(r?.precipitation_probability_max_pct);

  facts.push({
    fact_id: "day.weather.summary",
    dimension: "WEATHER",
    label: "Alerte météo max",
    value: alert,
    coverage: "forecast",
  });

  const weatherText =
    alert && alert >= 3
      ? "Risque météo élevé : prévoir un plan B."
      : pp && pp >= 60
      ? "Probabilité de précipitations élevée."
      : "Pas de signal météo critique.";

  items.push({
    fact_ids: ["day.weather.summary"],
    text: weatherText,
    kind: alert && alert >= 3 ? "primary" : "secondary",
  });

  // ---------------------------------------------------
  // ACTION
  // ---------------------------------------------------

  let actionText: string | null = null;

  if (alert && alert >= 3) {
    actionText =
      "Action : sécuriser une option de repli (format indoor ou report).";
  } else if (near > 0) {
    actionText =
      "Action : renforcer la différenciation (angle, horaires, communication).";
  } else if (regime === "C") {
    actionText =
      "Action : envisager une date alternative ou compenser par un levier fort.";
  }

  if (actionText) {
    items.push({
      fact_ids: ["day.score.verdict"],
      text: actionText,
      kind: "action",
    });
  }

  // ---------------------------------------------------
  // SHARED RENDERER
  // ---------------------------------------------------

  const rendered = renderPointsClesV1({
    items,
    max_points: 5,
  });

  const finalLineItems: LineItemV1[] = rendered.map((ln) => ({
    fact_id: ln.fact_ids[0],
    text_fr: ln.text,
    kind:
      ln.kind === "action"
        ? "action"
        : ln.kind === "primary"
        ? "risk"
        : "fact",
  }));

  if (finalLineItems.length === 0) {
    facts.push({
      fact_id: "day.other.no_signal",
      dimension: "OTHER",
      label: "Signal exploitable",
      value: "none",
      coverage: "observed",
    });

    finalLineItems.push({
      fact_id: "day.other.no_signal",
      text_fr: "Aucun signal exploitable.",
      kind: "risk",
    });
  }

  return {
    v: 1,
    date,
    headline_fr: `Pourquoi ce jour ? — ${date}`,
    facts,
    line_items: finalLineItems,
  };
}
