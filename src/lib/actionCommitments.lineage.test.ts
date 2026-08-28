import { describe, expect, it } from "vitest";
import { lineageFor } from "./actionCommitments";

describe("lineageFor — l'identité du dispositif et l'héritage de version", () => {
  it("une racine s'auto-désigne : dispositif_id = son propre id, V1, rien d'hérité", () => {
    expect(lineageFor(null, "c-root")).toEqual({
      dispositif_id: "c-root", version_no: 1, inherited_metric: null, inherited_saved_item_id: null,
    });
  });

  it("un enfant hérite : l'identité du parent, la version suivante, LE KPI, l'événement ancré", () => {
    const parent: any = {
      commitment_id: "c-v1", dispositif_id: "c-v1", version_no: 1,
      measured_metric: "family_revenue", saved_item_id: "evt-1",
    };
    expect(lineageFor(parent, "c-v2")).toEqual({
      dispositif_id: "c-v1", version_no: 2, inherited_metric: "family_revenue", inherited_saved_item_id: "evt-1",
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
      dispositif_id: "c-old", version_no: 2, inherited_metric: "family_revenue", inherited_saved_item_id: "evt-9",
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
