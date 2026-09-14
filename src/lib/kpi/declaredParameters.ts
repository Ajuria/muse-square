// src/lib/kpi/declaredParameters.ts
// =====================================================
// PARAMÈTRES DÉCLARÉS À DATE D'EFFET — le foyer unique (docs/catalogue-de-couts-et-marge.md M5,
// docs/espace-et-pole.md E4). Un montant mensuel change (un loyer en mars) : le journal des corrections
// (un scalaire par site et par type, sans unité ni date d'effet) ne peut pas le porter. Table app-write
// append-only `analytics.declared_parameters` ; la valeur en vigueur à une date = la dernière
// déclaration dont effective_from <= date (départage created_at) — la même règle que dbt
// (int_location_declared_parameters_daily), qui l'expose par jour de vente dans
// semantic.vw_insight_event_declared_parameters. Ici, côté PRODUCTEUR : écrire, et relire ce qu'on a
// écrit (comme lib/ai/corrections.ts sur son journal) — jamais une lecture métier.
//
// Clés = la liste fermée de dbt (stg_declared_parameters, accepted_values) : une clé de plus s'ajoute
// ICI et dans le yml dbt dans le même train, jamais l'un sans l'autre.
// =====================================================
import { randomUUID } from "node:crypto";
import { makeBQClient } from "../bq";

const PROJECT = "muse-square-open-data";
const TABLE = `\`${PROJECT}.analytics.declared_parameters\``;

export type ParameterKey = "revenue_basis" | "fixed_costs_month_eur" | "payroll_month_eur" | "sales_area_m2";

export interface ParameterSpec {
  key: ParameterKey;
  /** LE mot (docs/lexique.md) — jamais improvisé. */
  label_fr: string;
  kind: "number" | "text";
  unit: string | null;
  /** Bornes inclusives pour un nombre ; valeurs admises pour un texte. */
  min?: number;
  max?: number;
  values?: string[];
}

export const PARAMETERS: ParameterSpec[] = [
  { key: "fixed_costs_month_eur", label_fr: "charges fixes", kind: "number", unit: "€ par mois", min: 0, max: 10_000_000 },
  { key: "payroll_month_eur",     label_fr: "masse salariale", kind: "number", unit: "€ par mois", min: 0, max: 10_000_000 },
  { key: "sales_area_m2",         label_fr: "surface de vente", kind: "number", unit: "m²", min: 1, max: 100_000 },
  // Base du CA de la caisse : déduite de la caisse quand la règle d'ingestion la fixe (crisalid ⇒ HT),
  // sinon déclarée (décision owner 3, 11/09). Le mot de l'interface reste à arbitrer (lexique).
  { key: "revenue_basis",         label_fr: "base du chiffre d'affaires", kind: "text", unit: null, values: ["HT", "TTC"] },
];

export const PARAMETER_KEYS: ParameterKey[] = PARAMETERS.map((p) => p.key);

export function parameterSpec(key: string): ParameterSpec | null {
  return PARAMETERS.find((p) => p.key === key) ?? null;
}

/** Nombre français (« 8 500 », « 8500,50 ») → number ; null si illisible. */
export function parseFrNumber(raw: unknown): number | null {
  const s = String(raw ?? "").replace(/\s| | /g, "").replace(/€|m²|m2/gi, "").replace(",", ".").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Date JJ/MM/AAAA (forme française) ou AAAA-MM-JJ (valeur interne) → AAAA-MM-JJ ; null si illisible. */
export function parseEffectiveFrom(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  let y: number, m: number, d: number;
  let mm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mm) { d = Number(mm[1]); m = Number(mm[2]); y = Number(mm[3]); }
  else {
    mm = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!mm) return null;
    y = Number(mm[1]); m = Number(mm[2]); d = Number(mm[3]);
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export type ValidatedValue = { value_num: number | null; value_text: string | null };

/** Valide une valeur pour une clé ; lève une Error en français lisible (renvoyée telle quelle par l'API). */
export function validateValue(spec: ParameterSpec, raw: unknown): ValidatedValue {
  if (spec.kind === "number") {
    const n = parseFrNumber(raw);
    if (n == null) throw new Error(`Valeur illisible pour ${spec.label_fr}`);
    if ((spec.min != null && n < spec.min) || (spec.max != null && n > spec.max)) {
      throw new Error(`${spec.label_fr} : valeur attendue entre ${spec.min} et ${spec.max}${spec.unit ? " " + spec.unit : ""}`);
    }
    return { value_num: n, value_text: null };
  }
  const t = String(raw ?? "").trim().toUpperCase();
  if (!spec.values || !spec.values.includes(t)) throw new Error(`${spec.label_fr} : valeur attendue ${spec.values?.join(" ou ") ?? ""}`);
  return { value_num: null, value_text: t };
}

export interface DeclaredParameterRow {
  parameter_id: string;
  location_id: string;
  param_key: ParameterKey;
  value_num: number | null;
  value_text: string | null;
  unit: string | null;
  effective_from: string;     // AAAA-MM-JJ
  declarant_user_id: string | null;
  source: string;
  created_at: string;          // ISO
}

/** Valeur en vigueur par clé à une date (défaut : aujourd'hui) — PURE, la règle de dbt à l'identique :
 *  dernière effective_from <= date, départage created_at décroissant. */
export function currentByKey(rows: DeclaredParameterRow[], asOfIso?: string): Partial<Record<ParameterKey, DeclaredParameterRow>> {
  const asOf = asOfIso ?? new Date().toISOString().slice(0, 10);
  const out: Partial<Record<ParameterKey, DeclaredParameterRow>> = {};
  for (const r of rows) {
    if (r.effective_from > asOf) continue;
    const cur = out[r.param_key];
    if (!cur || r.effective_from > cur.effective_from || (r.effective_from === cur.effective_from && r.created_at > cur.created_at)) out[r.param_key] = r;
  }
  return out;
}

const flat = (x: any): any => (x && typeof x === "object" && "value" in x ? x.value : x);

/** Toutes les déclarations d'un site (le producteur relit son journal). */
export async function listDeclaredParameters(location_id: string): Promise<DeclaredParameterRow[]> {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
  const [rows] = await bq.query({
    query: `SELECT parameter_id, location_id, param_key, value_num, value_text, unit,
                   CAST(effective_from AS STRING) AS effective_from, declarant_user_id, source,
                   CAST(created_at AS STRING) AS created_at
            FROM ${TABLE} WHERE location_id = @location_id
            ORDER BY effective_from, created_at`,
    params: { location_id }, location: "EU",
  });
  return (rows as any[]).map((r) => ({
    parameter_id: String(flat(r.parameter_id)), location_id: String(flat(r.location_id)),
    param_key: String(flat(r.param_key)) as ParameterKey,
    value_num: flat(r.value_num) == null ? null : Number(flat(r.value_num)),
    value_text: flat(r.value_text) == null ? null : String(flat(r.value_text)),
    unit: flat(r.unit) == null ? null : String(flat(r.unit)),
    effective_from: String(flat(r.effective_from)),
    declarant_user_id: flat(r.declarant_user_id) == null ? null : String(flat(r.declarant_user_id)),
    source: String(flat(r.source)), created_at: String(flat(r.created_at)),
  }));
}

/** Une déclaration = UNE ligne (append-only ; jamais de mise à jour ni de suppression). */
export async function appendDeclaredParameter(e: {
  location_id: string; key: ParameterKey; value: ValidatedValue; effective_from: string;
  declarant_user_id?: string | null; source?: string;
}): Promise<string> {
  const spec = parameterSpec(e.key);
  if (!spec) throw new Error("Clé de paramètre inconnue");
  const parameter_id = randomUUID();
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
  await bq.query({
    query: `INSERT INTO ${TABLE}
              (parameter_id, location_id, param_key, value_num, value_text, unit, effective_from, declarant_user_id, source, created_at)
            VALUES (@parameter_id, @location_id, @param_key, @value_num, @value_text, @unit, DATE(@effective_from), @declarant_user_id, @source, CURRENT_TIMESTAMP())`,
    params: {
      parameter_id, location_id: e.location_id, param_key: e.key,
      value_num: e.value.value_num, value_text: e.value.value_text, unit: spec.unit,
      effective_from: e.effective_from, declarant_user_id: e.declarant_user_id ?? null, source: e.source ?? "piloter_inline",
    },
    types: { parameter_id: "STRING", location_id: "STRING", param_key: "STRING", value_num: "FLOAT64", value_text: "STRING", unit: "STRING", effective_from: "STRING", declarant_user_id: "STRING", source: "STRING" },
    location: "EU",
  });
  return parameter_id;
}
