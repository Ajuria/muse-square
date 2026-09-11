// src/pages/api/import/costs-csv.ts
// Dépôt du fichier de PRIX D'ACHAT (docs/catalogue-de-couts-et-marge.md M1, § 4.2 ; décisions owner 3 et 5 du 11/09).
// POST multipart { file, location_id? } → analytics.item_cost_catalog (append-only ; remplacement des lignes
// de MÊME (site, article, date d'effet) — un re-dépôt corrige, ne double pas), puis la COUVERTURE : la part du
// CA des 30 derniers jours dont l'article est au catalogue — c'est le chiffre que l'exploitant lit en premier,
// et celui qui décide si la marge se montre (seuil 90 %, M8). Reconstruction de la chaîne marge par dbt Cloud.
// Parse pur : lib/import/costCsv.ts (le cœur de salesCsv.ts). Excel accepté comme pour les ventes.
import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { makeBQClient } from '../../../lib/bq';
import { parseCostCsv, validateCostGrid, type CostRow } from '../../../lib/import/costCsv';
import { triggerCostRefresh } from '../../../lib/dbt-trigger';

export const prerender = false;

const PROJECT = 'muse-square-open-data';
const TABLE = `\`${PROJECT}.analytics.item_cost_catalog\``;
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_ROWS = 60000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
const EXCEL_EXT = /\.(xlsx|xls|xlsm|xlsb)$/i;
function isExcel(name: string, bytes: Uint8Array): boolean {
  if (EXCEL_EXT.test(name)) return true;
  if (/\.csv$/i.test(name)) return false;
  return (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) || (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0);
}
function isoDate(d: Date): string { const p = (n: number) => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`; }
function xlsxToGrid(bytes: Uint8Array): string[][] {
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true });
  const first = wb.SheetNames[0]; if (!first) return [];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[first], { header: 1, raw: true, defval: '', blankrows: false }) as unknown[][];
  return rows.map((r) => (Array.isArray(r) ? r : []).map((c) => (c instanceof Date ? isoDate(c) : c == null ? '' : String(c))));
}

function toBqRow(r: CostRow, locationId: string, userId: string, createdAt: string, sourceFile: string | null) {
  return { cost_id: randomUUID(), location_id: locationId, item_code: r.item_code, item_description: r.item_description, unit_cost_ht: r.unit_cost_ht, cost_unit: r.cost_unit, effective_from: r.effective_from, supplier: r.supplier, source: 'csv_import', source_file: sourceFile, declarant_user_id: userId, created_at: createdAt };
}

async function loadRows(bq: ReturnType<typeof makeBQClient>, rows: Record<string, unknown>[]): Promise<void> {
  const tmp = join(tmpdir(), `costs-csv-${Date.now()}-${Math.random().toString(36).slice(2)}.ndjson`);
  await writeFile(tmp, rows.map((r) => JSON.stringify(r)).join('\n'), 'utf-8');
  try { await bq.dataset('analytics').table('item_cost_catalog').load(tmp, { sourceFormat: 'NEWLINE_DELIMITED_JSON', writeDisposition: 'WRITE_APPEND' }); }
  finally { await unlink(tmp).catch(() => {}); }
}

/** Couverture : part du CA des 30 derniers jours de vente dont l'article est au catalogue (semantic seulement). */
export async function costCoverage(bq: ReturnType<typeof makeBQClient>, locationId: string): Promise<{ revenue_30d: number; revenue_costed_30d: number; pct: number | null; items_sold_30d: number; items_costed_30d: number; window_start: string | null; window_end: string | null }> {
  const flat = (x: any): any => (x && typeof x === 'object' && 'value' in x ? x.value : x);
  const [rows] = await bq.query({
    query: `WITH w AS (SELECT MAX(transaction_date) AS d1 FROM \`${PROJECT}.semantic.vw_insight_event_client_sales_lines\` WHERE location_id = @loc),
            l AS (SELECT s.item_code, s.revenue FROM \`${PROJECT}.semantic.vw_insight_event_client_sales_lines\` s, w
                  WHERE s.location_id = @loc AND s.transaction_date BETWEEN DATE_SUB(w.d1, INTERVAL 29 DAY) AND w.d1),
            c AS (SELECT DISTINCT item_code FROM ${TABLE} WHERE location_id = @loc)
            SELECT SUM(l.revenue) AS revenue_30d, SUM(IF(c.item_code IS NOT NULL, l.revenue, 0)) AS revenue_costed_30d,
                   COUNT(DISTINCT l.item_code) AS items_sold_30d, COUNT(DISTINCT IF(c.item_code IS NOT NULL, l.item_code, NULL)) AS items_costed_30d,
                   CAST(DATE_SUB(ANY_VALUE(w.d1), INTERVAL 29 DAY) AS STRING) AS window_start, CAST(ANY_VALUE(w.d1) AS STRING) AS window_end
            FROM l LEFT JOIN c USING (item_code), w`,
    params: { loc: locationId }, location: 'EU',
  });
  const r: any = (rows as any[])[0] ?? {};
  const rev = Number(flat(r.revenue_30d) ?? 0), costed = Number(flat(r.revenue_costed_30d) ?? 0);
  return { revenue_30d: Math.round(rev), revenue_costed_30d: Math.round(costed), pct: rev > 0 ? Math.round((costed / rev) * 1000) / 10 : null, items_sold_30d: Number(flat(r.items_sold_30d) ?? 0), items_costed_30d: Number(flat(r.items_costed_30d) ?? 0), window_start: flat(r.window_start) ?? null, window_end: flat(r.window_end) ?? null };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const userId = (locals as any).clerk_user_id as string | undefined;
  if (!userId) return json({ status: 'rejected', error: 'UNAUTHORIZED' }, 401);
  let form: FormData;
  try { form = await request.formData(); } catch { return json({ status: 'rejected', error: 'INVALID_FORM' }, 400); }
  const owned: string[] = Array.isArray((locals as any).all_location_ids) ? (locals as any).all_location_ids : [];
  const activeLoc = ((locals as any).location_id as string | undefined) ?? null;
  const requestedLoc = form.get('location_id') ? String(form.get('location_id')) : null;
  let locationId: string;
  if (requestedLoc) { if (requestedLoc !== activeLoc && !owned.includes(requestedLoc)) return json({ status: 'rejected', error: 'LOCATION_FORBIDDEN' }, 403); locationId = requestedLoc; }
  else if (activeLoc) locationId = activeLoc;
  else return json({ status: 'rejected', error: 'NO_LOCATION' }, 400);

  const file = form.get('file');
  if (!(file instanceof File)) return json({ status: 'rejected', error: 'NO_FILE' }, 400);
  if (file.size === 0) return json({ status: 'rejected', error: 'EMPTY_FILE' }, 400);
  if (file.size > MAX_BYTES) return json({ status: 'rejected', error: 'FILE_TOO_LARGE' }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let parsed;
  try { parsed = isExcel(file.name, bytes) ? validateCostGrid(xlsxToGrid(bytes)) : parseCostCsv(bytes); }
  catch { return json({ status: 'rejected', error: 'UNREADABLE_FILE' }, 400); }
  if (parsed.rows_total > MAX_ROWS) return json({ status: 'rejected', rows_total: parsed.rows_total, rows_accepted: 0, rows_rejected: parsed.rows_total, errors: [{ row: 1, reason: `Fichier trop volumineux : ${parsed.rows_total} lignes (maximum ${MAX_ROWS}).` }] });
  if (parsed.missing_required.length) return json({ status: 'rejected', rows_total: parsed.rows_total, rows_accepted: 0, rows_rejected: parsed.rows_total, columns_detected: parsed.columns_detected, missing_columns: parsed.missing_required, errors: [{ row: 1, reason: `Colonnes obligatoires manquantes : ${parsed.missing_required.map((f) => (f === 'item_code' ? 'code article' : "prix d'achat HT")).join(', ')}` }] });
  const errors = parsed.rejected.map((r) => ({ row: r.row, reason: r.reason }));
  if (parsed.accepted.length === 0) return json({ status: 'rejected', rows_total: parsed.rows_total, rows_accepted: 0, rows_rejected: parsed.rejected.length, columns_detected: parsed.columns_detected, errors });

  const createdAt = new Date().toISOString();
  const sourceFile = file.name ? String(file.name).slice(0, 200) : null;
  const bqRows = parsed.accepted.map((r) => toBqRow(r, locationId, userId, createdAt, sourceFile));
  const bq = makeBQClient(PROJECT);
  try {
    // Remplacement par (site, article, date d'effet) : un re-dépôt corrige un prix, il ne le double pas.
    await bq.query({
      query: `DELETE FROM ${TABLE} WHERE location_id = @loc AND source = 'csv_import'
                AND CONCAT(item_code, '|', CAST(effective_from AS STRING)) IN UNNEST(@keys)`,
      params: { loc: locationId, keys: parsed.accepted.map((r) => `${r.item_code}|${r.effective_from}`) }, types: { keys: ['STRING'] }, location: 'EU',
    });
    await loadRows(bq, bqRows);
  } catch (err: any) {
    console.error('costs-csv import error:', JSON.stringify(err?.errors || err));
    return json({ status: 'rejected', error: err?.errors?.[0]?.message || err?.message || 'BQ_WRITE_FAILED' }, 500);
  }
  let coverage = null;
  try { coverage = await costCoverage(bq, locationId); } catch (e: any) { console.error('costs-csv coverage error:', e?.message); }
  let refresh = { triggered: false };
  try { refresh = await triggerCostRefresh(locationId); } catch { /* non-fatal */ }
  return json({ status: parsed.rejected.length === 0 ? 'ok' : 'partial', rows_total: parsed.rows_total, rows_accepted: parsed.accepted.length, rows_rejected: parsed.rejected.length, columns_detected: parsed.columns_detected, unmapped_headers: parsed.unmapped_headers, effective_from_range: [parsed.accepted.map((r) => r.effective_from).sort()[0], parsed.accepted.map((r) => r.effective_from).sort().at(-1)], errors, coverage, refresh });
};
