// src/lib/ai/decision/window/window_ir_v1.ts
// =====================================================
// Window IR V1 (minimal, winner-only)
// =====================================================

import type {
  FactV1,
  LineItemV1,
} from "../../contracts/facts_v1";

type WindowIRInput = {
  rows: any[];
  window_start: string;
  window_end: string;
  internal_context: any | null;
};

export type WindowIRV1 = {
  v: 1;
  facts_by_date: Record<string, FactV1[]>;
  line_items: LineItemV1[];
};

function ymd(v: any): string {
  if (typeof v === "string") return v.slice(0, 10);
  if (v?.value) return String(v.value).slice(0, 10);
  return "date_inconnue";
}

function num(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function buildWindowIRV1(input: WindowIRInput): WindowIRV1 {

  const { rows, window_start, window_end, internal_context } = input;

  const winner = Array.isArray(rows) && rows.length ? rows[0] : null;

  const winner_date = winner ? ymd(winner.date) : null;
  const winner_regime = winner?.opportunity_regime ?? null;
  const winner_score = num(winner?.opportunity_score_final_local);
  const weather_alert = num(winner?.alert_level_max);
  const c10 = num(winner?.events_within_10km_count);
  const c50 = num(winner?.events_within_50km_count);

  const facts: FactV1[] = [];

  // Window facts
  facts.push({
    fact_id: "window.period",
    date: window_start,
    dimension: "meta",
    label_fr: "Fenêtre analysée",
    source_fields: [],
  });

  if (winner_date) {
    facts.push({
      fact_id: `window.winner.date.${winner_date}`,
      date: winner_date,
      dimension: "meta",
      label_fr: `Date gagnante`,
      source_fields: ["date"],
    });

    facts.push({
      fact_id: `window.winner.regime.${winner_date}`,
      date: winner_date,
      dimension: "governance",
      label_fr: "Régime",
      source_fields: ["opportunity_regime"],
    });

    facts.push({
        fact_id: `window.winner.score.${winner_date}`,
        date: winner_date,
        dimension: "meta",
        label_fr: "Score final local",
        source_fields: ["opportunity_score_final_local"],
    });

    facts.push({
      fact_id: `window.winner.weather.${winner_date}`,
      date: winner_date,
      dimension: "weather",
      label_fr: `Alerte météo max`,
      source_fields: ["alert_level_max"],
    });

    facts.push({
      fact_id: `window.winner.competition.${winner_date}`,
      date: winner_date,
      dimension: "competition",
      label_fr: `Concurrence`,
      source_fields: ["events_within_10km_count", "events_within_50km_count"],
    });
  }

  const facts_by_date: Record<string, FactV1[]> = {
    ["window_scope"]: facts,
  };

  const line_items: LineItemV1[] = [];

  line_items.push({
    kind: "headline",
    template_id: "WINNER_VERDICT",
    fact_ids: [`window.winner.regime.${winner_date}`],
    params: {
        date: winner_date,
        window_start,
        window_end,
        activity_type: internal_context?.company_activity_type ?? null,
        location_type: internal_context?.location_type ?? null,
        audience_primary: internal_context?.primary_audience_1 ?? null,
        capacity_sensitivity: internal_context?.capacity_sensitivity ?? null,
    },
  });

  if (winner_date) {
    line_items.push({
      kind: "headline",
      template_id: "WINNER_VERDICT",
      fact_ids: [`window.winner.regime.${winner_date}`],
      params: {
        date: winner_date,
      },
    });

    line_items.push({
      kind: "fact",
      template_id: "WINNER_COMPETITION_LOCAL_REGIONAL",
      fact_ids: [`window.winner.competition.${winner_date}`],
      params: {
        c10,
        c50,
        local_radius_km: 10,
        regional_radius_km: 50,
      },
    });
  }

  return {
    v: 1,
    facts_by_date,
    line_items,
  };
}