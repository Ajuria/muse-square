// src/lib/import/costCsv.ts
// =====================================================
// Fichier de PRIX D'ACHAT (docs/catalogue-de-couts-et-marge.md M1, décision owner 3 et 5 du 11/09) —
// parse et validation PURS, sans destination. Une ligne = un article × une date d'effet × un prix
// d'achat HT par unité (pièce ou kg). Standards français : dates JJ/MM/AAAA (l'ISO reste lu), décimales
// à la virgule, séparateur ; ou , ; sans date d'effet, la date d'import fait foi.
// Le cœur (encodage, séparateur, en-têtes, nombres, dates) est celui de salesCsv.ts — jamais recopié.
// =====================================================
import { detectEncoding, decodeBytes, detectDelimiter, parseDelimited, normalizeHeader, normalizeNumber, parseDate } from './salesCsv';

export type CostField = 'item_code' | 'item_description' | 'unit_cost_ht' | 'effective_from' | 'supplier' | 'cost_unit';
export const COST_REQUIRED: CostField[] = ['item_code', 'unit_cost_ht'];

// Candidats d'en-tête (normalisés : minuscules, sans accent). Les exports réels compléteront la liste ;
// la règle reste : lire l'export AVANT d'écrire le mapping (une caisse = un nom).
export const COST_MAPPING: Record<CostField, string[]> = {
  item_code: ['code article', 'code', 'reference', 'ref', 'ref article', 'reference article', 'sku', 'ean', 'code produit', 'article', 'item_code', 'code_article'],
  item_description: ['libelle', 'designation', 'description', 'produit', 'nom', 'libelle article', 'item_description', 'nom article'],
  unit_cost_ht: ["prix d'achat", 'prix d achat', "prix d'achat ht", 'prix d achat ht', 'pa ht', 'pa', 'prix achat', 'prix achat ht', 'cout', 'cout ht', "cout d'achat", 'cout d achat', 'cout unitaire', 'prix unitaire achat', 'unit_cost_ht', 'cost', 'purchase price'],
  effective_from: ["date d'effet", 'date d effet', 'date', 'a partir du', 'valable du', 'effective_from', 'date effet'],
  supplier: ['fournisseur', 'supplier', 'fournisseur principal'],
  cost_unit: ['unite', 'unit', 'unite de prix', 'par', 'cost_unit'],
};

export interface CostRow {
  row: number;
  item_code: string;
  item_description: string | null;
  unit_cost_ht: number;
  effective_from: string;         // AAAA-MM-JJ
  supplier: string | null;
  cost_unit: 'piece' | 'kg';
}
export interface CostRejected { row: number; code: string; reason: string }
export interface CostParseResult {
  columns_detected: CostField[];
  missing_required: CostField[];
  unmapped_headers: string[];
  rows_total: number;
  accepted: CostRow[];
  rejected: CostRejected[];
}

export function mapCostHeaders(headers: string[]): { resolved: Partial<Record<CostField, number>>; columnsDetected: CostField[]; unmappedHeaders: string[]; missingRequired: CostField[] } {
  const norm = headers.map(normalizeHeader);
  const resolved: Partial<Record<CostField, number>> = {};
  const used = new Set<number>();
  for (const field of Object.keys(COST_MAPPING) as CostField[]) {
    for (const cand of COST_MAPPING[field]) {
      const idx = norm.findIndex((h, i) => !used.has(i) && h === cand);
      if (idx >= 0) { resolved[field] = idx; used.add(idx); break; }
    }
  }
  const columnsDetected = Object.keys(resolved) as CostField[];
  return {
    resolved, columnsDetected,
    unmappedHeaders: headers.filter((_, i) => !used.has(i)),
    missingRequired: COST_REQUIRED.filter((f) => resolved[f] == null),
  };
}

/** Unité de prix : « kg », « kilo », « au kg », « /kg » ⇒ kg ; tout le reste ⇒ pièce. */
export function parseCostUnit(raw: string | undefined): 'piece' | 'kg' {
  const s = normalizeHeader(String(raw ?? ''));
  return /\bkg\b|kilo/.test(s) ? 'kg' : 'piece';
}

export function validateCostGrid(grid: string[][], opts: { today?: string } = {}): CostParseResult {
  const rows = grid.filter((r) => !(r.length === 0 || (r.length === 1 && r[0].trim() === '')));
  if (rows.length === 0) return { columns_detected: [], missing_required: [...COST_REQUIRED], unmapped_headers: [], rows_total: 0, accepted: [], rejected: [] };
  const headers = rows[0]; const data = rows.slice(1);
  const { resolved, columnsDetected, unmappedHeaders, missingRequired } = mapCostHeaders(headers);
  if (missingRequired.length) return { columns_detected: columnsDetected, missing_required: missingRequired, unmapped_headers: unmappedHeaders, rows_total: data.length, accepted: [], rejected: [] };
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const cell = (r: string[], f: CostField) => (resolved[f] == null ? undefined : r[resolved[f] as number]);
  const accepted: CostRow[] = []; const rejected: CostRejected[] = [];
  const seen = new Map<string, number>();
  data.forEach((r, i) => {
    const lineNo = i + 2;
    const code = String(cell(r, 'item_code') ?? '').trim();
    if (!code) { rejected.push({ row: lineNo, code: 'ITEM_CODE_MISSING', reason: 'Code article absent' }); return; }
    const cost = normalizeNumber(cell(r, 'unit_cost_ht'));
    if (cost == null) { rejected.push({ row: lineNo, code: 'COST_INVALID', reason: `Prix d'achat illisible : « ${(cell(r, 'unit_cost_ht') ?? '').trim()} »` }); return; }
    if (cost <= 0) { rejected.push({ row: lineNo, code: 'COST_NOT_POSITIVE', reason: `Prix d'achat nul ou négatif : ${cost}` }); return; }
    const rawDate = cell(r, 'effective_from');
    let effective_from = today;
    if (rawDate != null && rawDate.trim() !== '') {
      const d = parseDate(rawDate);
      if (!d) { rejected.push({ row: lineNo, code: 'DATE_INVALID', reason: `Date d'effet illisible : « ${rawDate.trim()} » (attendu JJ/MM/AAAA)` }); return; }
      effective_from = d;
    }
    const key = `${code}|${effective_from}`;
    const prev = seen.get(key);
    if (prev != null) { rejected.push({ row: lineNo, code: 'DUPLICATE', reason: `Article ${code} déjà présent à la date ${effective_from.split('-').reverse().join('/')} (ligne ${prev})` }); return; }
    seen.set(key, lineNo);
    const desc = String(cell(r, 'item_description') ?? '').trim();
    const supplier = String(cell(r, 'supplier') ?? '').trim();
    accepted.push({ row: lineNo, item_code: code.slice(0, 120), item_description: desc ? desc.slice(0, 200) : null, unit_cost_ht: cost, effective_from, supplier: supplier ? supplier.slice(0, 120) : null, cost_unit: parseCostUnit(cell(r, 'cost_unit')) });
  });
  return { columns_detected: columnsDetected, missing_required: [], unmapped_headers: unmappedHeaders, rows_total: data.length, accepted, rejected };
}

export function parseCostCsv(bytes: Uint8Array, opts: { today?: string } = {}): CostParseResult {
  const text = decodeBytes(bytes, detectEncoding(bytes));
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const grid = parseDelimited(text, detectDelimiter(firstLine));
  return validateCostGrid(grid, opts);
}
