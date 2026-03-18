import type { APIRoute } from "astro";
import { BigQuery } from "@google-cloud/bigquery";

export const prerender = false;

function makeBQClient(projectId: string) {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    try {
      const credentials = JSON.parse(raw);
      return new BigQuery({ projectId, credentials });
    } catch {}
  }
  const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyFilename) return new BigQuery({ projectId, keyFilename });
  return new BigQuery({ projectId });
}

export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get("q") ?? "").trim();

  if (q.length < 2) {
    return new Response(JSON.stringify([]), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const projectId = (process.env.BQ_OPENDATA_PROJECT_ID || process.env.BQ_PROJECT_ID || "").trim();
  const dataset = (process.env.BQ_OPENDATA_DATASET || process.env.BQ_DATASET || "").trim();
  const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();
  const bigquery = makeBQClient(projectId);

  const sql = `
    SELECT
      stop_name,
      ANY_VALUE(stop_id) AS stop_id,
      ANY_VALUE(nom_commune) AS nom_commune,
      ANY_VALUE(mode) AS mode,
      STRING_AGG(DISTINCT route_long_name, ', ' ORDER BY route_long_name) AS lines
    FROM \`${projectId}.${dataset}.dim_idf_stops_lines\`
    WHERE LOWER(stop_name) LIKE LOWER(@prefix)
    GROUP BY stop_name
    ORDER BY stop_name ASC
    LIMIT 10
  `;

  try {
    const [rows] = await bigquery.query({
      query: sql,
      location: BQ_LOCATION,
      params: { prefix: `${q}%` },
      types: { prefix: "STRING" },
    });

    const results = (rows as any[]).map((r) => ({
      stop_name: r.stop_name,
      stop_id: r.stop_id,
      mode: r.mode,
      nom_commune: r.nom_commune,
      lines: r.lines,
    }));

    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};