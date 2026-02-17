export type PackagerOutput = {
  headline: string;
  summary: string;
  key_facts: [string, string, string];
  caveat: string | null;
};

export type PackagerResult =
  | {
      ok: true;
      mode: "company_centered" | "competition_centered";
      output: PackagerOutput;
      warnings?: string[];
      raw_text?: string;
    }
  | {
      ok: false;
      mode: "company_centered" | "competition_centered";
      errors: string[];
      raw_text?: string;
    };

export type SelectedDaysPackagerResult = {
  ok: true;
  mode: "company_centered" | "competition_centered";
  outputs: PackagerResult[]; // one per selected day row
};
