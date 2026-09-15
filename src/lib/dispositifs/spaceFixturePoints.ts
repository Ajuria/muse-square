// src/lib/dispositifs/spaceFixturePoints.ts
// =====================================================
// OÙ SE TROUVE CHAQUE COMPOSANT SUR LE PLAN (owner 15/09 : « le tap sur le plan pendant la marche »).
//
// LA DONNÉE QUI MANQUAIT DEPUIS LE DÉBUT. `space_zones` tient les contours au grain PÔLE — 11
// polygones pour 7 pôles — et rien au grain composant. C'est pour ça qu'on ne peut pas dessiner un
// plan numéroté, que « déplacer une photo » a dû passer par une liste, et que la voie automatique a
// été écartée (mesuré le 15/09 : 40 % d'appariement, et ce n'était pas un réglage).
//
// POURQUOI LE TAP PENDANT LA MARCHE, ET PAS 52 CLICS AU BUREAU. L'exploitant vient de longer ces
// composants, dans cet ordre, il y a deux minutes. Il ne décode pas une liste : il refait un trajet
// frais. Et le RANG décide là aussi — le composant à placer est annoncé, il tape, ça passe au suivant
// (même principe que l'attribution des photos, arbitrage owner du 14/09).
//
// APPEND-ONLY, LE DERNIER POINT FAIT FOI. Un composant déplacé dans le magasin se replace ; l'ancien
// point reste, parce que les photos d'avant ont été prises quand il était là. Même patron que
// `space_measures`, `space_zones` et `space_plans`.
//
// LES COORDONNÉES SONT CELLES DU PLAN DÉPOSÉ, en fraction de sa largeur et de sa hauteur (0 à 1) —
// jamais en pixels. Un plan réaffiché à une autre taille, sur un téléphone ou un portable, garde ses
// points au bon endroit ; des pixels ne survivraient pas au premier changement d'écran.
import { randomUUID } from "node:crypto";

const BQ_PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
export const POINTS_TABLE = `${BQ_PROJECT}.analytics.space_fixture_points`;

export interface FixturePointRow {
  point_id: string;
  location_id: string;
  dispositif_id: string;
  component_key: string;
  plan_id: string;
  /** Fraction de la largeur du plan, 0 à 1. */
  x: number;
  /** Fraction de la hauteur du plan, 0 à 1. */
  y: number;
  created_by: string | null;
  created_at: string;
}

/** Un composant à placer, tel que la page le connaît. */
export interface ComposantAPlacer {
  component_key: string;
  fixture_no: number | null;
  nom: string;
  length_m: number | null;
}

/** PUR : ce qui empêche d'écrire un point, ou null. */
export function refusDePoint(e: { x: unknown; y: unknown; component_key: unknown; plan_id: unknown }): "hors_plan" | "composant_absent" | "plan_absent" | null {
  if (!String(e.component_key || "").trim()) return "composant_absent";
  if (!String(e.plan_id || "").trim()) return "plan_absent";
  const x = Number(e.x), y = Number(e.y);
  // Un point hors du plan n'est pas une approximation : c'est un tap à côté, et l'écrire poserait un
  // numéro dans le vide au prochain affichage.
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return "hors_plan";
  return null;
}

/** PUR : le dernier point de chaque composant, et rien d'autre ne fait foi. */
export function pointsEnVigueur(rows: FixturePointRow[]): Map<string, FixturePointRow> {
  const out = new Map<string, FixturePointRow>();
  for (const r of [...rows].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))) {
    out.set(r.component_key, r);   // le plus récent écrase, puisqu'on remonte le temps
  }
  return out;
}

/**
 * PUR : le prochain composant à placer, et l'avancement.
 * L'ordre est celui du NUMÉRO (qui est le rang dans la marche) ; un composant sans numéro passe en
 * dernier, dans l'ordre de sa clé, pour que la sortie soit stable d'un affichage à l'autre.
 */
export function prochainAPlacer(e: { composants: ComposantAPlacer[]; points: Map<string, FixturePointRow> }):
  { prochain: ComposantAPlacer | null; places: number; total: number } {
  const ordonnes = [...e.composants].sort((a, b) => {
    const an = a.fixture_no == null ? Number.POSITIVE_INFINITY : a.fixture_no;
    const bn = b.fixture_no == null ? Number.POSITIVE_INFINITY : b.fixture_no;
    if (an !== bn) return an - bn;
    return a.component_key.localeCompare(b.component_key);
  });
  const places = ordonnes.filter((c) => e.points.has(c.component_key)).length;
  return { prochain: ordonnes.find((c) => !e.points.has(c.component_key)) ?? null, places, total: ordonnes.length };
}

const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

/** La table naît à la première écriture — patron de `bestPractices.ts`. */
export async function ensurePointsTable(bq: any): Promise<void> {
  await bq.query({
    query: `CREATE TABLE IF NOT EXISTS \`${POINTS_TABLE}\` (
              point_id STRING NOT NULL, location_id STRING NOT NULL, dispositif_id STRING NOT NULL,
              component_key STRING NOT NULL, plan_id STRING NOT NULL,
              x FLOAT64 NOT NULL, y FLOAT64 NOT NULL,
              created_by STRING, created_at TIMESTAMP NOT NULL)
            CLUSTER BY location_id`,
    location: "EU",
  });
}

export async function appendPoint(bq: any, row: Omit<FixturePointRow, "point_id" | "created_at">): Promise<FixturePointRow> {
  await ensurePointsTable(bq);
  const complet: FixturePointRow = { ...row, point_id: randomUUID(), created_at: new Date().toISOString() };
  const [job] = await bq.createQueryJob({
    query: `INSERT INTO \`${POINTS_TABLE}\` (point_id, location_id, dispositif_id, component_key, plan_id, x, y, created_by, created_at)
            VALUES (@point_id, @location_id, @dispositif_id, @component_key, @plan_id, @x, @y, @created_by, @created_at)`,
    params: { ...complet, created_at: new Date(complet.created_at) },
    types: { point_id: "STRING", location_id: "STRING", dispositif_id: "STRING", component_key: "STRING",
             plan_id: "STRING", x: "FLOAT64", y: "FLOAT64", created_by: "STRING", created_at: "TIMESTAMP" },
    location: "EU",
  });
  await job.getQueryResults();
  return complet;
}

export async function listPoints(bq: any, location_id: string): Promise<FixturePointRow[]> {
  const rows = await bq.query({
    query: `SELECT point_id, location_id, dispositif_id, component_key, plan_id, x, y, created_by,
                   CAST(created_at AS STRING) AS created_at
            FROM \`${POINTS_TABLE}\` WHERE location_id = @l ORDER BY created_at LIMIT 2000`,
    params: { l: location_id }, types: { l: "STRING" }, location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  return (rows as any[]).map((r) => ({
    point_id: String(flat(r.point_id)), location_id: String(flat(r.location_id)),
    dispositif_id: String(flat(r.dispositif_id)), component_key: String(flat(r.component_key)),
    plan_id: String(flat(r.plan_id)), x: Number(flat(r.x)), y: Number(flat(r.y)),
    created_by: r.created_by != null ? String(flat(r.created_by)) : null,
    created_at: String(flat(r.created_at)),
  }));
}
