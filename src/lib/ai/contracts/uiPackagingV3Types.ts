// src/lib/ai/contracts/uiPackagingV3Types.ts

export type UiPackagingV3SectionId =
  | "calendrier"
  | "tourisme"
  | "alertes"
  | "concurrence"
  | "mobilite"
  | "meteo_faisabilite"
  | "autre";

export type UiPackagingV3LookupStatus =
  | "found_internal"
  | "not_found_internal"
  | "found_external"
  | "error";

export type UiPackagingV3EvidenceSourceType =
  // MVP internal truth (extend later)
  | "calendar"
  | "competition"
  | "weather"
  | "mobility"
  | "other_internal"
  // later (external mode)
  | "external";

export type UiPackagingV3Evidence = {
  source_type: UiPackagingV3EvidenceSourceType;
  source_label: string;

  // Exact dates extracted (YYYY-MM-DD).
  dates: string[];

  // Extracted facts ONLY (no new claims).
  extracted_facts: string[];

  // What matched (optional but useful)
  match_label?: string;
};

export type UiPackagingV3DataPoint = {
  key: string; // allowlisted per section in validator
  label: string;
  value: string | number;
  unit?: string;
};

export type UiPackagingV3Section = {
  id: UiPackagingV3SectionId;
  title: string;

  facts: string[]; // must be >= 1 (validator)
  data_points?: UiPackagingV3DataPoint[];

  // Governed operational reading; no causality, no recommendation.
  implications?: string[]; // 1–3 if present (validator)
};

export type UiPackagingV3DateBlock = {
  date: string; // YYYY-MM-DD (validator: must be in trace.used_dates)
  date_label: string; // FR label (validator: non-empty)
  sections: UiPackagingV3Section[]; // must be >= 1 (validator)
};

export type UiPackagingV3LookupBlock = {
  query: string;
  status: UiPackagingV3LookupStatus;

  short_answer: string; // 1–2 sentences
  dates?: string[]; // YYYY-MM-DD when found (optional but consistent)

  // required when found_internal/found_external (validator)
  evidence?: UiPackagingV3Evidence[];
};

export type UiPackagingV3Header = {
  title: string;
  summary: string;

  timeframe?: {
    display_label?: string;
    highlights?: string[];
  };
};

export type UiPackagingV3Trace = {
  horizon: "month" | "day" | "selected_days" | "window_30d";
  intent: string;
  used_dates: string[]; // authoritative list from decision engine
  source: "decision_payload";
};

export type UiPackagingV3 = {
  v: 3;

  kind: "window_list" | "day_detail" | "compare_dates" | "lookup";

  constraints?: {
    requested_k?: number; // 2 or 3 when user asks explicitly
  };

  trace: UiPackagingV3Trace;

  header: UiPackagingV3Header;
  dates: UiPackagingV3DateBlock[]; // can be empty for lookup-only
  lookup: UiPackagingV3LookupBlock[]; // can be empty for non-lookup
};
