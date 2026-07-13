// src/lib/import/salesCsv.ts
//
// Deterministic CSV parse + validation for sales-data uploads.
// PURE: no BigQuery, no I/O beyond the bytes handed in. Unit-testable in isolation.
// Handles French POS exports: ';' separators, ',' decimals, Latin-1 or UTF-8.
//
// Canonical schema = the 3 REQUIRED fields every upload must yield, plus an
// OPTIONAL "intelligence" set captured whenever the source export carries it
// (feeds segmentation / offering / conditions-adjusted causal surfaces downstream).
// The write layer maps canonical -> raw.client_transactions columns and owns the
// DELETE-supersede + load; this module never knows the destination column names
// nor the write mechanism.

export type CanonicalField =
  | 'date'
  | 'revenue'
  // optional — a transaction row carries date (+ time); ticket_count only appears
  // in pre-aggregated daily exports. Each row = one transaction otherwise.
  | 'time'
  | 'ticket_count'
  // optional intelligence columns
  | 'item_category'
  | 'quantity'
  | 'unit_price'
  | 'discount_amount'
  | 'discount_flag'
  | 'channel'
  | 'customer_type'
  | 'transaction_hour'
  | 'visitor_count'
  | 'payment_method'
  | 'currency';

export const REQUIRED_FIELDS: CanonicalField[] = ['date', 'revenue'];

// A mapping resolves each canonical field to one or more candidate source headers.
// Headers are matched after normalization (trim, lowercase, accent-fold, collapse
// whitespace). Per-source mappings live in sourceMappings.ts (built once real
// headers land); this module is mapping-agnostic and takes a ColumnMapping as input.
export type ColumnMapping = Partial<Record<CanonicalField, string[]>>;

export interface CanonicalRow {
  row: number;           // source line number (1-based; header = line 1, first data row = 2)
  date: string;          // normalized YYYY-MM-DD
  revenue: number;
  // optionals present only when the source carried a valid value
  time?: string;         // normalized HH:MM:SS (assigns the row to an hour)
  ticket_count?: number;
  item_category?: string;
  quantity?: number;
  unit_price?: number;
  discount_amount?: number;
  discount_flag?: boolean;
  channel?: string;
  customer_type?: string;
  transaction_hour?: number;
  visitor_count?: number;
  payment_method?: string;
  currency?: string;
}

export interface RejectedRow {
  row: number;           // source line number (1-based)
  code: string;          // stable machine code (testable)
  reason: string;        // French, human-facing (surfaced on the prompt page)
}

export interface ParseResult {
  columns_detected: string[];          // canonical fields resolved from the header
  unmapped_headers: string[];          // source headers with no canonical match
  missing_required: CanonicalField[];  // required canonical fields absent after mapping
  accepted: CanonicalRow[];
  rejected: RejectedRow[];
  date_range: [string, string] | null; // [min, max] accepted date, YYYY-MM-DD
  rows_total: number;                  // data rows seen (excludes header)
  encoding: 'utf-8' | 'latin1';
  delimiter: string;
}

export interface ParseOptions {
  // reference "today" for the not-in-future check; injected for determinism/testability.
  // YYYY-MM-DD; defaults to the server date when omitted.
  today?: string;
}

// ── Encoding ────────────────────────────────────────────────────────────────

// UTF-8 BOM, else strict UTF-8 decode; if the bytes aren't valid UTF-8, Latin-1.
export function detectEncoding(bytes: Uint8Array): 'utf-8' | 'latin1' {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return 'utf-8';
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return 'utf-8';
  } catch {
    return 'latin1';
  }
}

export function decodeBytes(bytes: Uint8Array, encoding: 'utf-8' | 'latin1'): string {
  const text = new TextDecoder(encoding).decode(bytes);
  // strip a leading UTF-8 BOM if the decoder kept it
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// ── Delimiter + CSV grid ─────────────────────────────────────────────────────

// French exports default to ';'. Pick the candidate most present on the header line.
export function detectDelimiter(headerLine: string): string {
  const candidates = [';', ',', '\t', '|'];
  let best = ';';
  let bestCount = -1;
  for (const d of candidates) {
    const count = headerLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return bestCount > 0 ? best : ';';
}

// Quote-aware RFC-4180-style parser: handles quoted fields with embedded
// delimiters/newlines and "" escapes. Tolerates \r\n and \n line endings.
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let started = false; // any char seen for the current record (guards trailing newline)

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; started = true; continue; }
    if (ch === delimiter) { record.push(field); field = ''; started = true; continue; }
    if (ch === '\r') { continue; }
    if (ch === '\n') {
      if (started || field.length > 0 || record.length > 0) {
        record.push(field);
        rows.push(record);
      }
      record = []; field = ''; started = false;
      continue;
    }
    field += ch; started = true;
  }
  if (started || field.length > 0 || record.length > 0) {
    record.push(field);
    rows.push(record);
  }
  return rows;
}

// ── Normalizers ──────────────────────────────────────────────────────────────

export function normalizeHeader(h: string): string {
  return h
    .replace(/^﻿/, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

// French/EU numeric: decimal comma, space/NBSP thousands, optional currency glyphs.
// "1 234,56" -> 1234.56 ; "1.234,56" -> 1234.56 ; "12.50" -> 12.5 ; "" -> null.
export function normalizeNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (s === '') return null;
  s = s.replace(/[€$£%\s ]/g, '');
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // both present: '.' is thousands, ',' is decimal (EU convention)
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    s = s.replace(',', '.');
  }
  if (!/^[+-]?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Accepts ISO (YYYY-MM-DD, YYYY/MM/DD) and French (DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY).
// Returns normalized YYYY-MM-DD, or null if unparseable or not a real calendar date.
export function parseDate(raw: string | undefined): string | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (s === '') return null;
  let y: number, mo: number, d: number;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/))) {
    y = +m[1]; mo = +m[2]; d = +m[3];
  } else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) {
    d = +m[1]; mo = +m[2]; y = +m[3];
  } else {
    return null;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // reject impossible dates (e.g. 31/02) via round-trip
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Extracts HH:MM:SS from a time or datetime string: "14:32", "14h32", "14:32:05",
// "23/06/2026 14:32:05". Returns null if no valid time is present.
export function parseTime(raw: string | undefined): string | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (s === '') return null;
  const m = s.match(/(\d{1,2})[:hH](\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const hh = +m[1], mm = +m[2], ss = m[3] ? +m[3] : 0;
  if (hh > 23 || mm > 59 || ss > 59) return null;
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

const TRUE_TOKENS = new Set(['1', 'true', 'vrai', 'oui', 'o', 'yes', 'y', 'x']);
const FALSE_TOKENS = new Set(['0', 'false', 'faux', 'non', 'n', 'no', '']);

function parseBool(raw: string): boolean | undefined {
  const s = raw.trim().toLowerCase();
  if (TRUE_TOKENS.has(s)) return true;
  if (FALSE_TOKENS.has(s)) return false;
  return undefined;
}

// ── Header mapping ───────────────────────────────────────────────────────────

export interface MapResult {
  resolved: Partial<Record<CanonicalField, number>>; // canonical field -> column index
  columnsDetected: CanonicalField[];
  unmappedHeaders: string[];
  missingRequired: CanonicalField[];
}

export function mapHeaders(headers: string[], mapping: ColumnMapping): MapResult {
  const normHeaders = headers.map(normalizeHeader);
  const resolved: Partial<Record<CanonicalField, number>> = {};
  const usedIdx = new Set<number>();

  for (const field of Object.keys(mapping) as CanonicalField[]) {
    const candidates = (mapping[field] ?? []).map(normalizeHeader);
    for (let idx = 0; idx < normHeaders.length; idx++) {
      if (usedIdx.has(idx)) continue;
      if (candidates.includes(normHeaders[idx])) {
        resolved[field] = idx;
        usedIdx.add(idx);
        break;
      }
    }
  }

  const columnsDetected = Object.keys(resolved) as CanonicalField[];
  const unmappedHeaders = headers.filter((_, idx) => !usedIdx.has(idx));
  const missingRequired = REQUIRED_FIELDS.filter((f) => !(f in resolved));
  return { resolved, columnsDetected, unmappedHeaders, missingRequired };
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

export interface GridValidation {
  columns_detected: string[];
  unmapped_headers: string[];
  missing_required: CanonicalField[];
  accepted: CanonicalRow[];
  rejected: RejectedRow[];
  date_range: [string, string] | null;
  rows_total: number;
}

// Shared validation core. CSV and Excel both produce a string grid (row 0 = header)
// and feed it here. Pure — no I/O, no format knowledge.
export function validateGrid(
  grid: string[][],
  mapping: ColumnMapping,
  opts: ParseOptions = {},
): GridValidation {
  const rows = grid.filter((r) => !(r.length === 0 || (r.length === 1 && r[0].trim() === '')));

  if (rows.length === 0) {
    return {
      columns_detected: [], unmapped_headers: [], missing_required: [...REQUIRED_FIELDS],
      accepted: [], rejected: [], date_range: null, rows_total: 0,
    };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);
  const rows_total = dataRows.length;
  const { resolved, columnsDetected, unmappedHeaders, missingRequired } = mapHeaders(headers, mapping);

  if (missingRequired.length > 0) {
    return {
      columns_detected: columnsDetected, unmapped_headers: unmappedHeaders,
      missing_required: missingRequired, accepted: [], rejected: [],
      date_range: null, rows_total,
    };
  }

  const today = opts.today ?? serverToday();
  const accepted: CanonicalRow[] = [];
  const rejected: RejectedRow[] = [];
  let minDate: string | null = null;
  let maxDate: string | null = null;

  const cell = (r: string[], f: CanonicalField): string | undefined => {
    const idx = resolved[f];
    return idx == null ? undefined : r[idx];
  };

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const lineNo = i + 2; // header is line/row 1

    // ── required: date ──
    const rawDate = cell(r, 'date');
    const date = parseDate(rawDate);
    if (!date) {
      rejected.push({ row: lineNo, code: 'DATE_INVALID', reason: `Date invalide ou absente : « ${(rawDate ?? '').trim()} »` });
      continue;
    }
    if (date > today) {
      rejected.push({ row: lineNo, code: 'DATE_FUTURE', reason: `Date dans le futur : ${date}` });
      continue;
    }
    // No duplicate-date check: rows are transactions stamped with a date (and time);
    // many rows per day is normal. transaction_date/hour place each in a day/hour.

    // ── required: revenue ──
    const revRaw = cell(r, 'revenue');
    const revenue = normalizeNumber(revRaw);
    if (revenue == null) {
      rejected.push({ row: lineNo, code: 'REVENUE_INVALID', reason: `Chiffre d'affaires non numérique : « ${(revRaw ?? '').trim()} »` });
      continue;
    }
    if (revenue < 0) {
      rejected.push({ row: lineNo, code: 'REVENUE_NEGATIVE', reason: `Chiffre d'affaires négatif : ${revenue}` });
      continue;
    }

    // row passes required checks (date + revenue)
    const canonical: CanonicalRow = { row: lineNo, date, revenue };

    // ── optionals: lenient — null/skip on invalid, never reject the row ──
    // ticket_count only appears in pre-aggregated daily exports; a transaction row
    // has none (each row = one transaction, transaction_count defaults to 1).
    setNum(canonical, 'ticket_count', cell(r, 'ticket_count'));
    const t = parseTime(cell(r, 'time'));
    if (t) canonical.time = t;
    setStr(canonical, 'item_category', cell(r, 'item_category'));
    setNum(canonical, 'quantity', cell(r, 'quantity'));
    setNum(canonical, 'unit_price', cell(r, 'unit_price'));
    setNum(canonical, 'discount_amount', cell(r, 'discount_amount'));
    const df = cell(r, 'discount_flag');
    if (df != null) {
      const b = parseBool(df);
      if (b !== undefined) canonical.discount_flag = b;
    }
    setStr(canonical, 'channel', cell(r, 'channel'));
    setStr(canonical, 'customer_type', cell(r, 'customer_type'));
    setNum(canonical, 'transaction_hour', cell(r, 'transaction_hour'));
    setNum(canonical, 'visitor_count', cell(r, 'visitor_count'));
    setStr(canonical, 'payment_method', cell(r, 'payment_method'));
    setStr(canonical, 'currency', cell(r, 'currency'));

    accepted.push(canonical);
    if (minDate == null || date < minDate) minDate = date;
    if (maxDate == null || date > maxDate) maxDate = date;
  }

  return {
    columns_detected: columnsDetected,
    unmapped_headers: unmappedHeaders,
    missing_required: [],
    accepted,
    rejected,
    date_range: minDate != null && maxDate != null ? [minDate, maxDate] : null,
    rows_total,
  };
}

// CSV entry point: detect encoding + delimiter, split into a grid, then validate.
export function parseSalesCsv(
  bytes: Uint8Array,
  mapping: ColumnMapping,
  opts: ParseOptions = {},
): ParseResult {
  const encoding = detectEncoding(bytes);
  const text = decodeBytes(bytes, encoding);
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = detectDelimiter(firstLine);
  const grid = parseDelimited(text, delimiter);
  return { ...validateGrid(grid, mapping, opts), encoding, delimiter };
}

// ── small assignment helpers (keep optionals absent rather than undefined-valued) ──

type StrField = 'item_category' | 'channel' | 'customer_type' | 'payment_method' | 'currency';
type NumField = 'ticket_count' | 'quantity' | 'unit_price' | 'discount_amount' | 'transaction_hour' | 'visitor_count';

function setStr(row: CanonicalRow, field: StrField, raw: string | undefined): void {
  if (raw == null) return;
  const v = raw.trim();
  if (v !== '') row[field] = v;
}

function setNum(row: CanonicalRow, field: NumField, raw: string | undefined): void {
  if (raw == null) return;
  const n = normalizeNumber(raw);
  if (n != null && n >= 0) row[field] = n; // these optionals are non-negative by definition
}

function serverToday(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
