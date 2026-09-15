import { describe, expect, it } from "vitest";
import { lineageFor } from "./actionCommitments";

describe("lineageFor — l'identité du dispositif et l'héritage de version", () => {
  it("une racine s'auto-désigne : dispositif_id = son propre id, V1, rien d'hérité", () => {
    expect(lineageFor(null, "c-root")).toEqual({
      dispositif_id: "c-root", version_no: 1, inherited_measured_scope: null, inherited_metric: null, inherited_saved_item_id: null,
    });
  });

  it("un enfant hérite : l'identité du parent, la version suivante, LE KPI, l'événement ancré", () => {
    const parent: any = {
      commitment_id: "c-v1", dispositif_id: "c-v1", version_no: 1,
      measured_metric: "family_revenue", saved_item_id: "evt-1",
    };
    expect(lineageFor(parent, "c-v2")).toEqual({
      dispositif_id: "c-v1", version_no: 2, inherited_measured_scope: null, inherited_metric: "family_revenue", inherited_saved_item_id: "evt-1",
    });
  });

  it("une V3 garde l'identité de la RACINE, pas celle de la V2", () => {
    const v2: any = { commitment_id: "c-v2", dispositif_id: "c-v1", version_no: 2, measured_metric: "basket", saved_item_id: null };
    const l = lineageFor(v2, "c-v3");
    expect(l.dispositif_id).toBe("c-v1");
    expect(l.version_no).toBe(3);
  });

  it("parent d'AVANT les colonnes (dispositif_id/version_no nuls) : la racine se reconstruit", () => {
    const legacy: any = { commitment_id: "c-old", dispositif_id: null, version_no: null, measured_metric: "family_revenue", saved_item_id: "evt-9" };
    expect(lineageFor(legacy, "c-new")).toEqual({
      dispositif_id: "c-old", version_no: 2, inherited_measured_scope: null, inherited_metric: "family_revenue", inherited_saved_item_id: "evt-9",
    });
  });

  it("un parent sans KPI (historique pré-colonne) n'hérite rien — la dérivation carte reprend la main", () => {
    const p: any = { commitment_id: "c-x", dispositif_id: "c-x", version_no: 1, measured_metric: null, saved_item_id: null };
    expect(lineageFor(p, "c-y").inherited_metric).toBeNull();
  });
});

// ── Pôles & natures (spec 27/08) — les termes selon la nature ─────────────────────────────────

import { assertTermsPresent } from "./actionCommitments";

it("un dispositif PERMANENT s'écrit sans fenêtre ni objectif — levier + familles suffisent", () => {
  expect(() => assertTermsPresent({
    commitment_id: "p1", dispositif_nature: "permanent",
    committed_action_text: "Pôle périssables — vendeur dédié",
    pole_families: '["Coffee","Bakery"]',
  } as any)).not.toThrow();
});

it("un permanent SANS familles est refusé (le périmètre est ce qui le définit)", () => {
  expect(() => assertTermsPresent({
    commitment_id: "p2", dispositif_nature: "permanent",
    committed_action_text: "Pôle sans périmètre",
  } as any)).toThrow(/pole_families/);
});

it("une opération datée garde TOUS ses termes obligatoires (la nature n'exempte qu'un permanent)", () => {
  expect(() => assertTermsPresent({
    commitment_id: "p3", dispositif_nature: "operation",
    committed_action_text: "x", pole_families: null,
  } as any)).toThrow(/window_kind/);
});

// ── L'IDENTITÉ SE REPORTE, LIGNE APRÈS LIGNE (13/09) ─────────────────────────────────────────
// Journal append-only : une ligne écrite après la création doit porter le dispositif que portait
// la précédente. Défaut mesuré sur le parc le 13/09 — 3 lignes amputées, 2 engagements, écrites
// par le cron de résolution les 28 et 29/08 : la ligne du 29/08 n'a fait qu'hériter du NULL de
// celle du 28/08, et la page de l'engagement 610d7c02 n'affiche plus son « Historique du
// dispositif » (buildLineage court-circuité, evolution.ts:168).

import { assertIdentityCarried, assertSpecCoversRow, readMergeWrite } from "./actionCommitments";

const TERMES = {
  measured_metric: "family_revenue", window_kind: "day_of",
  window_start: "2026-08-27", window_end: "2026-08-27", window_days_expected: 1,
  threshold_level: "standard", threshold_basis: "residual", threshold_value: 1,
  committed_action_text: "Tête de gondole — fromages", owner_person_name: "Julen",
};

it("une ligne de transition qui perd le dispositif est REFUSÉE", () => {
  expect(() => assertIdentityCarried(
    { dispositif_id: "d-root", version_no: 3 } as any,
    { commitment_id: "610d7c02", dispositif_id: null, version_no: null },
  )).toThrow(/dispositif_id, version_no/);
});

it("le numéro de version perdu seul est refusé aussi", () => {
  expect(() => assertIdentityCarried(
    { dispositif_id: "d-root", version_no: 3 } as any,
    { commitment_id: "c", dispositif_id: "d-root", version_no: null },
  )).toThrow(/version_no/);
});

it("l'identité reportée passe", () => {
  expect(() => assertIdentityCarried(
    { dispositif_id: "d-root", version_no: 3 } as any,
    { commitment_id: "c", dispositif_id: "d-root", version_no: 3 },
  )).not.toThrow();
});

it("une CRÉATION n'a rien à reporter — lineageFor() pose l'identité au POST", () => {
  expect(() => assertIdentityCarried(null, { commitment_id: "c" })).not.toThrow();
});

it("un engagement sans identité (créé par un cron, ou d'avant les colonnes) n'est pas bloqué", () => {
  expect(() => assertIdentityCarried(
    { dispositif_id: null, version_no: null } as any,
    { commitment_id: "c", dispositif_id: null, version_no: null },
  )).not.toThrow();
});

it("une colonne que la ligne porte mais que COLUMN_SPEC ignore est REFUSÉE (ALTER déployé avant le code)", () => {
  expect(() => assertSpecCoversRow({ commitment_id: "c", colonne_future: "valeur" } as any))
    .toThrow(/colonne_future/);
});

it("une ligne dont COLUMN_SPEC couvre toutes les colonnes passe", () => {
  expect(() => assertSpecCoversRow({ commitment_id: "c", dispositif_id: "d", version_no: 2 } as any))
    .not.toThrow();
});

// Le CHEMIN d'écriture du cron, bout à bout : ce qui compte est ce qui part dans les PARAMS de
// l'INSERT — c'est là que les 28-29/08 ont perdu l'identité, pas dans la fusion en mémoire.
function fauxBq(prior: any) {
  const ecrits: any[] = [];
  return {
    ecrits,
    timestamp: (v: any) => ({ ts: v }),
    date: (v: any) => ({ d: v }),
    async query(o: any) {
      if (String(o.query).includes("INSERT INTO")) { ecrits.push(o.params); return [[]]; }
      return [[{ ...prior }]];
    },
  };
}

it("le cron de résolution ÉCRIT l'identité du dispositif dans sa ligne", async () => {
  const prior = {
    ...TERMES, commitment_id: "610d7c02", user_id: "u", location_id: "f10c3e58",
    status: "open", authorship: "user_authored",
    created_at: "2026-08-27T12:51:16.000Z", updated_at: "2026-08-27T12:51:16.000Z",
    transition_type: "created", dispositif_id: "49a325dd", version_no: 3,
  };
  const bq: any = fauxBq(prior);
  const row = await readMergeWrite(bq, {
    commitmentId: "610d7c02", transitionType: "resolved",
    patch: { status: "resolved", verdict: "missed", window_days_resolved: 1, resolved_at: "2026-08-29T02:01:09.000Z" },
  });
  expect(row.dispositif_id).toBe("49a325dd");
  expect(bq.ecrits).toHaveLength(1);
  expect(bq.ecrits[0].dispositif_id).toBe("49a325dd");
  expect(bq.ecrits[0].version_no).toBe(3);
});
