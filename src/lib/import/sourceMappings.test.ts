// src/lib/import/sourceMappings.test.ts
//
// Le défaut que ces tests attrapent (mesuré le 10/09) : une caisse déclarée au registre
// analytics.pos_systems avec import_source = <clé>, une clé présente dans SOURCE_OVERRIDES, et
// une route qui ne la connaît pas → l'import retombe sur 'generic' et écrit
// source_system = 'csv_manual'. Le delete-supersede de sales-csv est clé par
// (location_id, source_system, dates) : deux caisses différentes partagent alors le même seau.

import { describe, it, expect } from 'vitest';
import { GENERIC_MAPPING, SOURCE_OVERRIDES, VALID_SOURCES, resolveMapping } from './sourceMappings';

describe('sources d’import nommées', () => {
  it('VALID_SOURCES = generic + TOUTES les clés d’overrides, sans exception', () => {
    const attendu = new Set(['generic', ...Object.keys(SOURCE_OVERRIDES)]);
    expect(new Set(VALID_SOURCES)).toEqual(attendu);
  });

  it('crisalid est une source valide (caisse d’Épices et Tout, profil du 09/09)', () => {
    expect(VALID_SOURCES.has('crisalid')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(SOURCE_OVERRIDES, 'crisalid')).toBe(true);
  });

  it('override vide = mapping générique intact (aucun en-tête inventé avant le vrai export)', () => {
    const g = resolveMapping('generic');
    const c = resolveMapping('crisalid');
    expect(Object.keys(c).sort()).toEqual(Object.keys(g).sort());
    for (const f of Object.keys(g) as Array<keyof typeof GENERIC_MAPPING>) {
      expect(c[f]).toEqual(g[f]);
    }
  });

  it('une source nommée n’écrase jamais les synonymes génériques', () => {
    // Invariant de conception : les candidats de l'override sont AJOUTÉS devant les génériques.
    for (const src of Object.keys(SOURCE_OVERRIDES) as Array<keyof typeof SOURCE_OVERRIDES>) {
      const m = resolveMapping(src);
      for (const f of Object.keys(GENERIC_MAPPING) as Array<keyof typeof GENERIC_MAPPING>) {
        for (const cand of GENERIC_MAPPING[f] ?? []) expect(m[f]).toContain(cand);
      }
    }
  });
});
