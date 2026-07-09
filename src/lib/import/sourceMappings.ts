// src/lib/import/sourceMappings.ts
//
// Per-source header -> canonical-field mappings for the sales CSV importer.
// salesCsv.mapHeaders matches headers accent-folded + lowercased, so candidates
// are listed in plain human spelling; case/accents need not be duplicated.
//
// Design: a broad GENERIC synonym layer is the fallback for any source AND the
// base every named source extends. A named source config ADDS its EXACT real
// export headers on top (confirmed from a real file) — it never replaces the
// generic layer. resolveMapping() concatenates the two so a source gains its
// real headers without losing the generic synonyms.

import type { CanonicalField, ColumnMapping } from './salesCsv';

export const GENERIC_MAPPING: ColumnMapping = {
  // ── required ──
  date: ['date', 'jour', 'journee', 'date de vente', 'date vente', 'day', 'transaction date'],
  // ── optional but structural: time-of-day (assigns each row to an hour) ──
  time: ['heure', 'time', 'horaire', 'heure de vente', 'date et heure', 'datetime', 'timestamp', 'horodatage'],
  revenue: [
    "chiffre d'affaires", 'chiffre affaires', 'ca', 'ca ttc', 'ca ht',
    'montant', 'montant ttc', 'total ttc', 'total ht', 'revenue', 'sales', 'turnover',
  ],
  ticket_count: [
    'tickets', 'nb tickets', 'nombre de tickets', 'nb ventes', 'nombre de ventes',
    'transactions', 'nb transactions', 'nombre de transactions',
    'ticket count', 'receipts', 'nb clients', 'nombre de clients', 'clients',
  ],
  // ── optional intelligence columns ──
  item_category: ['categorie', 'famille', 'rayon', 'gamme', 'category', 'product category', 'type produit'],
  quantity: ['quantite', 'qte', 'nb articles', 'nombre articles', 'quantity', 'qty', 'units'],
  unit_price: ['prix unitaire', 'pu', 'unit price'],
  discount_amount: ['remise', 'montant remise', 'reduction', 'discount', 'discount amount'],
  discount_flag: ['en promo', 'promo', 'soldes', 'discounted'],
  channel: ['canal', 'circuit', 'mode de vente', 'channel', 'sales channel'],
  customer_type: ['type client', 'segment client', 'clientele', 'customer type', 'client type'],
  transaction_hour: ['heure', 'heure de vente', 'tranche horaire', 'hour', 'transaction hour'],
  visitor_count: ['visiteurs', 'nb visiteurs', 'affluence', 'entrees', 'footfall', 'visitors', 'visitor count'],
  payment_method: ['mode de paiement', 'paiement', 'reglement', 'payment method', 'payment'],
  currency: ['devise', 'monnaie', 'currency'],
};

// Per-source overrides: the EXACT headers from a real export, appended to the
// generic candidates. Empty = falls back to generic (functional but loose).
// ISAVIGNE real export arrives Mon 2026-07-13 — fill from the actual header row.
export const SOURCE_OVERRIDES: Record<string, ColumnMapping> = {
  isavigne: {}, // TODO 2026-07-13: exact headers from first real ISAVIGNE export
  tpvin: {},    // TODO: exact headers from a real TP'vin export
  sumup: {},    // TODO: exact headers from a real SumUp export
};

export type SourceId = 'generic' | keyof typeof SOURCE_OVERRIDES;

// Merge generic + source overrides, CONCATENATING candidate lists per field so a
// source adds its real headers without dropping the generic synonyms. Overrides
// are listed first (matched-first is irrelevant to correctness; kept for clarity).
export function resolveMapping(source: SourceId = 'generic'): ColumnMapping {
  const overrides: ColumnMapping = source === 'generic' ? {} : (SOURCE_OVERRIDES[source] ?? {});
  const fields = new Set<CanonicalField>([
    ...(Object.keys(GENERIC_MAPPING) as CanonicalField[]),
    ...(Object.keys(overrides) as CanonicalField[]),
  ]);
  const out: ColumnMapping = {};
  for (const f of fields) {
    out[f] = [...(overrides[f] ?? []), ...(GENERIC_MAPPING[f] ?? [])];
  }
  return out;
}
