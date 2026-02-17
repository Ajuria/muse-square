// src/lib/ai/contracts/uiPackagingV3.ts

export type UiSectionIdV3 =
  | "alertes"
  | "meteo_faisabilite"
  | "concurrence"
  | "calendrier"
  | "mobilite"
  | "tourisme"
  | "autre";

export type UiPackagingV3 = {
  v: 3;
  header: {
    title: string;
    timeframe_label?: string;
    summary_bullets: string[]; // for now: deterministic (can be empty)
  };

  dates: Array<{
    date: string;       // YYYY-MM-DD
    date_label: string; // from semantic display_label
    score?: { regime: "A" | "B" | "C"; score?: number };
    sections: Array<{
      id: UiSectionIdV3;
      title: string;        // FR label, deterministic
      facts: string[];      // truth lines (deterministic, no invented values)
      implications: string[]; // ONLY if you already have governed implications; otherwise []
    }>;
  }>;

  warnings?: string[];
};
