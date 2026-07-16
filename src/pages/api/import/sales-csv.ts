import type { APIRoute } from 'astro';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { makeBQClient } from '../../../lib/bq';
import { parseSalesCsv, validateGrid, type CanonicalRow } from '../../../lib/import/salesCsv';
import { resolveMapping, type SourceId } from '../../../lib/import/sourceMappings';
import { triggerSalesRefresh } from '../../../lib/dbt-trigger';

export const prerender = false;

const PROJECT = 'muse-square-open-data';
const DATASET = 'raw';
const TABLE = 'client_transactions';
const MAX_BYTES = 4 * 1024 * 1024; // ~4.19 MB — under Vercel's ~4.5 MB serverless body limit
const MAX_ROWS = 60000; // ~1 year of line-level data fits well under this; guards pathological files
const VALID_SOURCES = new Set<SourceId>(['generic', 'isavigne', 'tpvin', 'sumup', 'sage100']);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const toInt = (n: number | undefined): number | null => (n == null ? null : Math.round(n));

// ── Excel support ────────────────────────────────────────────────────────────
const EXCEL_EXT = /\.(xlsx|xls|xlsm|xlsb)$/i;

function isExcel(name: string, bytes: Uint8Array): boolean {
  if (EXCEL_EXT.test(name)) return true;
  if (/\.csv$/i.test(name)) return false;
  // magic bytes: xlsx/xlsm/xlsb = ZIP ("PK"); legacy xls = OLE (D0 CF 11 E0)
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) return true;
  if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return true;
  return false;
}

function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

// First worksheet -> string grid (row 0 = header). Dates come back as JS Date
// (cellDates) and are normalized to YYYY-MM-DD; everything else is stringified,
// so the shared validateGrid core handles Excel and CSV identically.
function xlsxToGrid(bytes: Uint8Array): string[][] {
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true });
  const first = wb.SheetNames[0];
  if (!first) return [];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[first], {
    header: 1, raw: true, defval: '', blankrows: false,
  }) as unknown[][];
  return rows.map((r) =>
    (Array.isArray(r) ? r : []).map((c) => (c instanceof Date ? isoDate(c) : c == null ? '' : String(c))),
  );
}

// Canonical (daily-summary) row -> raw.client_transactions column shape.
// One row per day. Line-item columns (item_code, invoice_number, …) stay null;
// item_category/quantity/etc. are populated only when the export carried them.
function canonicalToBqRow(
  r: CanonicalRow,
  locationId: string,
  clientId: string,
  sourceSystem: string,
  ingestedAt: string,
): Record<string, unknown> {
  return {
    location_id: locationId,
    client_id: clientId,
    transaction_date: r.date,
    transaction_datetime: `${r.date}T${r.time ?? '00:00:00'}`,
    transaction_hour: r.time ? Number(r.time.slice(0, 2)) : toInt(r.transaction_hour),
    revenue: r.revenue,
    discount_amount: r.discount_amount ?? 0,
    transaction_count: toInt(r.ticket_count),
    visitor_count: toInt(r.visitor_count),
    item_category: r.item_category ?? null,
    unit_price: r.unit_price ?? null,
    quantity: toInt(r.quantity),
    customer_type: r.customer_type ?? null,
    channel: r.channel ?? null,
    payment_method: r.payment_method ?? null,
    discount_flag: r.discount_flag ?? false,
    source_system: sourceSystem,
    source_type: 'pos',
    currency: r.currency ?? 'EUR',
    ingested_at: ingestedAt,
  };
}

// Non-streaming append via a load job (NDJSON temp file). A load job — unlike
// table.insert()'s streaming buffer — is immediately consistent, so the DELETE
// that precedes it is honoured and the data is queryable at once.
async function loadRows(bq: ReturnType<typeof makeBQClient>, rows: Record<string, unknown>[]): Promise<void> {
  const ndjson = rows.map((r) => JSON.stringify(r)).join('\n');
  const tmp = join(tmpdir(), `sales-csv-${Date.now()}-${Math.random().toString(36).slice(2)}.ndjson`);
  await writeFile(tmp, ndjson, 'utf-8');
  try {
    await bq.dataset(DATASET).table(TABLE).load(tmp, {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      writeDisposition: 'WRITE_APPEND',
    });
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const userId = (locals as any).clerk_user_id as string | undefined;
  if (!userId) return json({ status: 'rejected', error: 'UNAUTHORIZED' }, 401);

  // ── multipart body ──
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ status: 'rejected', error: 'INVALID_FORM' }, 400);
  }

  // ── resolve + authorize target establishment ──
  // The chosen location must be one the signed-in user owns; fall back to the
  // active site when the client sends none (single-establishment users).
  const owned: string[] = Array.isArray((locals as any).all_location_ids) ? (locals as any).all_location_ids : [];
  const activeLoc = ((locals as any).location_id as string | undefined) ?? null;
  const requestedLoc = form.get('location_id') ? String(form.get('location_id')) : null;
  let locationId: string;
  if (requestedLoc) {
    if (requestedLoc !== activeLoc && !owned.includes(requestedLoc)) {
      return json({ status: 'rejected', error: 'LOCATION_FORBIDDEN' }, 403);
    }
    locationId = requestedLoc;
  } else if (activeLoc) {
    locationId = activeLoc;
  } else {
    return json({ status: 'rejected', error: 'NO_LOCATION' }, 400);
  }

  const file = form.get('file');
  const sourceRaw = String(form.get('source') ?? 'generic') as SourceId;
  const source: SourceId = VALID_SOURCES.has(sourceRaw) ? sourceRaw : 'generic';

  if (!(file instanceof File)) return json({ status: 'rejected', error: 'NO_FILE' }, 400);
  if (file.size === 0) return json({ status: 'rejected', error: 'EMPTY_FILE' }, 400);
  if (file.size > MAX_BYTES) return json({ status: 'rejected', error: 'FILE_TOO_LARGE' }, 400);

  // ── parse + validate (CSV or Excel → shared grid core) ──
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mapping = resolveMapping(source);
  let parsed;
  try {
    parsed = isExcel(file.name, bytes)
      ? validateGrid(xlsxToGrid(bytes), mapping)
      : parseSalesCsv(bytes, mapping);
  } catch {
    return json({ status: 'rejected', error: 'UNREADABLE_FILE' }, 400);
  }

  if (parsed.rows_total > MAX_ROWS) {
    return json({
      status: 'rejected',
      rows_total: parsed.rows_total, rows_accepted: 0, rows_rejected: parsed.rows_total,
      date_range: null, columns_detected: parsed.columns_detected,
      errors: [{ row: 1, reason: `Fichier trop volumineux : ${parsed.rows_total} lignes (maximum ${MAX_ROWS}).` }],
    });
  }

  // required column missing after mapping -> whole-file reject, no write
  if (parsed.missing_required.length > 0) {
    return json({
      status: 'rejected',
      rows_total: parsed.rows_total,
      rows_accepted: 0,
      rows_rejected: parsed.rows_total,
      date_range: null,
      columns_detected: parsed.columns_detected,
      missing_columns: parsed.missing_required,
      errors: [{ row: 1, reason: `Colonnes obligatoires manquantes : ${parsed.missing_required.join(', ')}` }],
    });
  }

  const accepted = parsed.accepted;
  const errors = parsed.rejected.map((r) => ({ row: r.row, reason: r.reason }));

  // nothing clean -> reject, no write
  if (accepted.length === 0) {
    return json({
      status: 'rejected',
      rows_total: parsed.rows_total,
      rows_accepted: 0,
      rows_rejected: parsed.rejected.length,
      date_range: null,
      columns_detected: parsed.columns_detected,
      errors,
    });
  }

  // ── write: idempotent supersede (same source, covered dates) then load ──
  const sourceSystem = source === 'generic' ? 'csv_manual' : source;
  const ingestedAt = new Date().toISOString();
  const bqRows = accepted.map((r) => canonicalToBqRow(r, locationId, userId, sourceSystem, ingestedAt));
  const dates = [...new Set(accepted.map((r) => r.date))];

  try {
    const bq = makeBQClient(PROJECT);
    // Remove prior rows from THIS source for these dates so re-uploads replace
    // rather than duplicate. Scoped to source_system => never touches seed or
    // other sources. (Seed-location double-count is a known special case.)
    await bq.query({
      query: `DELETE FROM \`${PROJECT}.${DATASET}.${TABLE}\`
              WHERE location_id = @loc
                AND source_system = @src
                AND transaction_date IN UNNEST(@dates)`,
      params: { loc: locationId, src: sourceSystem, dates },
      types: { dates: ['DATE'] },
      location: 'EU',
    });
    await loadRows(bq, bqRows);
  } catch (err: any) {
    const msg = err?.errors?.[0]?.message || err?.message || 'BQ_WRITE_FAILED';
    console.error('sales-csv import error:', JSON.stringify(err?.errors || err));
    return json({ status: 'rejected', error: msg }, 500);
  }

  // Kick off the dbt Cloud refresh so cards + report reflect the new rows.
  // Awaited (so the POST fires before the function freezes) but non-fatal —
  // the data is already loaded; a trigger failure must not fail the upload.
  let refresh = { triggered: false };
  try { refresh = await triggerSalesRefresh(locationId, sourceSystem); } catch { /* non-fatal */ }

  return json({
    status: parsed.rejected.length === 0 ? 'ok' : 'partial',
    rows_total: parsed.rows_total,
    rows_accepted: accepted.length,
    rows_rejected: parsed.rejected.length,
    date_range: parsed.date_range,
    columns_detected: parsed.columns_detected,
    refresh_requested: refresh.triggered,
    errors,
  });
};
