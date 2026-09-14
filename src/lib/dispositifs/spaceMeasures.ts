// src/lib/dispositifs/spaceMeasures.ts
// =====================================================
// MESURES D'ESPACE — le foyer unique côté PRODUCTEUR (docs/espace-et-pole.md E3, E4, E5).
// Une mesure vit à part du dispositif (table app-write append-only `analytics.space_measures`),
// jamais dans le JSON `components` : elle se corrige sans re-versionner le dispositif, et le N° sur
// le plan relie la mesure à la photo du même composant. Deux grains :
//   · composant (component_key posé) : N° sur le plan, longueur (m), profondeur (m), faces de
//     préhension (1 ou 2) → mètres linéaires de façade = longueur × faces ; Part de linéaire par
//     famille (families_share, Σ = 1) quand le pôle porte plusieurs familles — sans part déclarée,
//     dbt répartit à parts égales et le dit (share_source = 'defaut', E5) ;
//   · pôle (component_key NULL) : surface de vente du pôle (m²), mesurée sur le plan (E4).
// La mesure en vigueur = la dernière created_at par dispositif × version × composant — la même règle
// que dbt (int_client_component_space, int_client_pole_space), qui l'expose dans
// semantic.vw_insight_event_component_space / vw_insight_event_pole_space. Ici : écrire, et relire
// ce qu'on a écrit (comme lib/kpi/declaredParameters.ts) — jamais une lecture métier.
//
// Sources admises = la liste fermée de dbt (stg_space_measures, accepted_values) : plan | ruban | saisie.
// families_share s'écrit au format que dbt lit : [{"family": "…", "share": 0.6}, …].
// =====================================================
import { randomUUID } from "node:crypto";
import { makeBQClient } from "../bq";
import { parseFrNumber } from "../kpi/declaredParameters";

const PROJECT = "muse-square-open-data";
const TABLE = `\`${PROJECT}.analytics.space_measures\``;

export const MEASURE_SOURCES = ["plan", "ruban", "saisie"] as const;
export type MeasureSource = (typeof MEASURE_SOURCES)[number];

/** Bornes de saisie — une longueur de meuble, pas une longueur de magasin. */
export const LENGTH_M_MAX = 100;
export const DEPTH_M_MAX = 20;
export const SURFACE_M2_MAX = 100_000;
/** Tolérance sur Σ parts = 1 (des pourcentages entiers arrondis : 33 + 33 + 34). */
export const SHARE_SUM_TOLERANCE = 0.011;

export interface FamilyShare { family: string; share: number }

/** Une mesure au grain composant, validée. */
export interface ComponentMeasure {
  component_key: string;
  fixture_no: number | null;
  length_m: number | null;
  depth_m: number | null;
  faces: 1 | 2 | null;
  /** longueur × faces, arrondi au cm ; null si l'une des deux manque. */
  linear_m_facade: number | null;
  families_share: FamilyShare[] | null;
}

/** Une mesure au grain pôle, validée. */
export interface PoleMeasure { surface_m2: number }

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

function num(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  return typeof raw === "number" ? (Number.isFinite(raw) ? raw : null) : parseFrNumber(raw);
}

/** Validation PURE d'une mesure de composant (formulaire, one-off). Un champ vide = non mesuré, jamais 0. */
export function validateComponentMeasure(input: {
  component_key: unknown; fixture_no?: unknown; length_m?: unknown; depth_m?: unknown; faces?: unknown;
  families_share?: unknown;
}): Validated<ComponentMeasure> {
  const key = String(input.component_key ?? "").trim();
  if (!key) return { ok: false, error: "Il manque le composant de la mesure." };

  let fixture_no: number | null = null;
  if (input.fixture_no != null && input.fixture_no !== "") {
    const n = num(input.fixture_no);
    if (n == null || !Number.isInteger(n) || n < 1 || n > 9999) return { ok: false, error: "Le N° sur le plan est un entier de 1 à 9999." };
    fixture_no = n;
  }
  let length_m: number | null = null;
  if (input.length_m != null && input.length_m !== "") {
    const n = num(input.length_m);
    if (n == null || n <= 0 || n > LENGTH_M_MAX) return { ok: false, error: `La longueur est en mètres, entre 0 et ${LENGTH_M_MAX} (virgule décimale).` };
    length_m = Math.round(n * 100) / 100;
  }
  let depth_m: number | null = null;
  if (input.depth_m != null && input.depth_m !== "") {
    const n = num(input.depth_m);
    if (n == null || n <= 0 || n > DEPTH_M_MAX) return { ok: false, error: `La profondeur est en mètres, entre 0 et ${DEPTH_M_MAX} (virgule décimale).` };
    depth_m = Math.round(n * 100) / 100;
  }
  let faces: 1 | 2 | null = null;
  if (input.faces != null && input.faces !== "") {
    const n = num(input.faces);
    if (n !== 1 && n !== 2) return { ok: false, error: "Faces de préhension : 1 ou 2." };
    faces = n;
  }
  let families_share: FamilyShare[] | null = null;
  if (input.families_share != null) {
    if (!Array.isArray(input.families_share)) return { ok: false, error: "Part de linéaire : une liste {family, share}." };
    const out: FamilyShare[] = [];
    const seen = new Set<string>();
    for (const raw of input.families_share as unknown[]) {
      const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const family = String(r.family ?? "").trim();
      const share = num(r.share);
      if (!family) return { ok: false, error: "Part de linéaire : une famille sans nom." };
      if (seen.has(family)) return { ok: false, error: `Part de linéaire : la famille « ${family} » apparaît deux fois.` };
      if (share == null || share <= 0 || share > 1) return { ok: false, error: `Part de linéaire de « ${family} » : entre 0 et 100 %.` };
      seen.add(family);
      out.push({ family, share: Math.round(share * 10_000) / 10_000 });
    }
    if (out.length) {
      const sum = out.reduce((a, s) => a + s.share, 0);
      if (Math.abs(sum - 1) > SHARE_SUM_TOLERANCE) return { ok: false, error: `Les parts de linéaire font ${Math.round(sum * 100)} % — elles doivent faire 100 %.` };
      families_share = out;
    }
  }
  if (fixture_no == null && length_m == null && depth_m == null && faces == null && families_share == null) {
    return { ok: false, error: "Aucune mesure : N° sur le plan, longueur, profondeur, faces ou Part de linéaire." };
  }
  const linear_m_facade = length_m != null && faces != null ? Math.round(length_m * faces * 100) / 100 : null;
  return { ok: true, value: { component_key: key, fixture_no, length_m, depth_m, faces, linear_m_facade, families_share } };
}

/** Validation PURE de la surface de vente d'un pôle (m²). */
export function validatePoleMeasure(input: { surface_m2: unknown }): Validated<PoleMeasure> {
  const n = num(input.surface_m2);
  if (n == null || n <= 0 || n > SURFACE_M2_MAX) return { ok: false, error: `La surface de vente est en m², entre 0 et ${SURFACE_M2_MAX} (virgule décimale).` };
  return { ok: true, value: { surface_m2: Math.round(n * 100) / 100 } };
}

export function parseMeasureSource(raw: unknown, fallback: MeasureSource = "saisie"): MeasureSource {
  const s = String(raw ?? "").trim();
  return (MEASURE_SOURCES as readonly string[]).includes(s) ? (s as MeasureSource) : fallback;
}

/** Le JSON que dbt lit (json_query_array, $.family / $.share). */
export function familiesShareJson(shares: FamilyShare[] | null): string | null {
  return shares && shares.length ? JSON.stringify(shares.map((s) => ({ family: s.family, share: s.share }))) : null;
}

/** Le corps d'un POST /api/commitments (pôle) ou de la route space-measures → mesures validées. */
export function parseSpaceMeasuresBody(raw: unknown): Validated<{ components: ComponentMeasure[]; pole: PoleMeasure | null }> {
  if (raw == null) return { ok: true, value: { components: [], pole: null } };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "space_measures : un objet {components: [...], surface_m2}." };
  const r = raw as Record<string, unknown>;
  const components: ComponentMeasure[] = [];
  if (r.components != null) {
    if (!Array.isArray(r.components)) return { ok: false, error: "space_measures.components : une liste." };
    if (r.components.length > 50) return { ok: false, error: "space_measures : 50 composants au plus." };
    const seen = new Set<string>();
    for (const c of r.components as unknown[]) {
      const v = validateComponentMeasure((c && typeof c === "object" ? c : { component_key: "" }) as any);
      if (!v.ok) return v;
      if (seen.has(v.value.component_key)) return { ok: false, error: `space_measures : composant « ${v.value.component_key} » mesuré deux fois.` };
      seen.add(v.value.component_key);
      components.push(v.value);
    }
  }
  let pole: PoleMeasure | null = null;
  if (r.surface_m2 != null && r.surface_m2 !== "") {
    const v = validatePoleMeasure({ surface_m2: r.surface_m2 });
    if (!v.ok) return v;
    pole = v.value;
  }
  return { ok: true, value: { components, pole } };
}

export interface SpaceMeasureRow {
  measure_id: string; location_id: string; dispositif_id: string; version_no: number;
  component_key: string | null; fixture_no: number | null; length_m: number | null; depth_m: number | null;
  faces: number | null; linear_m_facade: number | null; surface_m2: number | null;
  families_share: FamilyShare[] | null; measured_at: string | null; source: string;
  declarant_user_id: string | null; created_at: string;
}

const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const numOrNull = (v: any): number | null => (flat(v) == null ? null : Number(flat(v)));

/** Une écriture = N lignes, une par mesure (append-only ; jamais de mise à jour ni de suppression). */
export async function appendSpaceMeasures(e: {
  location_id: string; dispositif_id: string; version_no: number;
  components: ComponentMeasure[]; pole: PoleMeasure | null;
  source: MeasureSource; measured_at?: string | null; declarant_user_id?: string | null;
}): Promise<string[]> {
  const rows: Array<Record<string, unknown>> = [];
  for (const c of e.components) {
    rows.push({
      measure_id: randomUUID(), component_key: c.component_key, fixture_no: c.fixture_no, length_m: c.length_m,
      depth_m: c.depth_m, faces: c.faces, linear_m_facade: c.linear_m_facade, surface_m2: null,
      families_share: familiesShareJson(c.families_share),
    });
  }
  if (e.pole) {
    rows.push({
      measure_id: randomUUID(), component_key: null, fixture_no: null, length_m: null, depth_m: null, faces: null,
      linear_m_facade: null, surface_m2: e.pole.surface_m2, families_share: null,
    });
  }
  if (!rows.length) return [];
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
  const params: Record<string, unknown> = {
    location_id: e.location_id, dispositif_id: e.dispositif_id, version_no: e.version_no,
    measured_at: e.measured_at ?? null, source: e.source, declarant_user_id: e.declarant_user_id ?? null,
  };
  const types: Record<string, string> = {
    location_id: "STRING", dispositif_id: "STRING", version_no: "INT64", measured_at: "STRING", source: "STRING", declarant_user_id: "STRING",
  };
  const values: string[] = [];
  rows.forEach((r, i) => {
    const p = (k: string) => `r${i}_${k}`;
    for (const k of ["measure_id", "component_key", "fixture_no", "length_m", "depth_m", "faces", "linear_m_facade", "surface_m2", "families_share"]) {
      params[p(k)] = r[k] ?? null;
    }
    types[p("measure_id")] = "STRING"; types[p("component_key")] = "STRING"; types[p("fixture_no")] = "INT64";
    types[p("length_m")] = "FLOAT64"; types[p("depth_m")] = "FLOAT64"; types[p("faces")] = "INT64";
    types[p("linear_m_facade")] = "FLOAT64"; types[p("surface_m2")] = "FLOAT64"; types[p("families_share")] = "STRING";
    values.push(`(@${p("measure_id")}, @location_id, @dispositif_id, @version_no, @${p("component_key")}, @${p("fixture_no")}, @${p("length_m")}, @${p("depth_m")}, @${p("faces")}, @${p("linear_m_facade")}, @${p("surface_m2")}, @${p("families_share")}, SAFE.PARSE_DATE('%Y-%m-%d', @measured_at), @source, @declarant_user_id, CURRENT_TIMESTAMP())`);
  });
  await bq.query({
    query: `INSERT INTO ${TABLE}
              (measure_id, location_id, dispositif_id, version_no, component_key, fixture_no, length_m, depth_m, faces, linear_m_facade, surface_m2, families_share, measured_at, source, declarant_user_id, created_at)
            VALUES ${values.join(",\n")}`,
    params, types, location: "EU",
  });
  return rows.map((r) => String(r.measure_id));
}

/** Le journal d'un site (ou d'un dispositif) — le producteur relit ce qu'il a écrit. */
export async function listSpaceMeasures(location_id: string, dispositif_id?: string | null): Promise<SpaceMeasureRow[]> {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
  const [rows] = await bq.query({
    query: `SELECT measure_id, location_id, dispositif_id, version_no, component_key, fixture_no, length_m, depth_m, faces,
                   linear_m_facade, surface_m2, families_share, CAST(measured_at AS STRING) AS measured_at, source,
                   declarant_user_id, CAST(created_at AS STRING) AS created_at
            FROM ${TABLE}
            WHERE location_id = @location_id ${dispositif_id ? "AND dispositif_id = @dispositif_id" : ""}
            ORDER BY created_at`,
    params: dispositif_id ? { location_id, dispositif_id } : { location_id }, location: "EU",
  });
  return (rows as any[]).map((r) => {
    let shares: FamilyShare[] | null = null;
    if (flat(r.families_share) != null) {
      try { shares = JSON.parse(String(flat(r.families_share))); } catch { shares = null; }
    }
    return {
      measure_id: String(flat(r.measure_id)), location_id: String(flat(r.location_id)), dispositif_id: String(flat(r.dispositif_id)),
      version_no: Number(flat(r.version_no)), component_key: flat(r.component_key) == null ? null : String(flat(r.component_key)),
      fixture_no: numOrNull(r.fixture_no), length_m: numOrNull(r.length_m), depth_m: numOrNull(r.depth_m), faces: numOrNull(r.faces),
      linear_m_facade: numOrNull(r.linear_m_facade), surface_m2: numOrNull(r.surface_m2), families_share: shares,
      measured_at: flat(r.measured_at) == null ? null : String(flat(r.measured_at)), source: String(flat(r.source)),
      declarant_user_id: flat(r.declarant_user_id) == null ? null : String(flat(r.declarant_user_id)), created_at: String(flat(r.created_at)),
    };
  });
}

/** La mesure en vigueur par (dispositif, version, composant | pôle) — dernière created_at, la règle de dbt. */
export function currentMeasures(rows: SpaceMeasureRow[]): SpaceMeasureRow[] {
  const byKey = new Map<string, SpaceMeasureRow>();
  for (const r of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    byKey.set(`${r.dispositif_id}|${r.version_no}|${r.component_key ?? ""}`, r);
  }
  return Array.from(byKey.values());
}
