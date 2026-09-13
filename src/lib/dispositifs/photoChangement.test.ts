// src/lib/dispositifs/photoChangement.test.ts — le déclencheur du versionning automatique d'un pôle.
// Ce que ces tests gardent : un écart FRANC crée une version, le bruit n'en crée pas, et une première
// photo ne remplace jamais la version qu'elle documente.
import { describe, expect, it } from "vitest";
import { changementDePhoto, dernierePhotoDuComposant } from "./photoChangement";
import type { PhotoRow } from "./dispositifPhotoRows";

const photo = (over: Partial<PhotoRow> = {}): PhotoRow => ({
  photo_id: "p1", location_id: "loc", dispositif_id: "d1", version_no: 2, component_key: "k1",
  walk_id: null, seq: null, t_offset_s: null, gcs_uri: "gs://b/o",
  dispositif_type: "lineaire", dispositif_role: null, status: "read",
  checklist: {}, items_matched: [], items_confirmed: null, prices_seen: [],
  coverage_flag: "entier", model: "m", prompt_version: "photo_extract_v2",
  created_by: "u1", created_at: "2026-09-13T10:00:00Z",
  exposition: "rayonnage", levels: 4, families_present: ["Coffee"], fixture_no: 8,
  ...over,
});

describe("changementDePhoto — ce qui fait passer un pôle à la version suivante", () => {
  it("aucune photo précédente dans cette version : la photo DOCUMENTE la version, elle ne la remplace pas", () => {
    expect(changementDePhoto(null, photo())).toEqual({ change: false, raisons: [] });
  });

  it("deux photos identiques : aucun changement", () => {
    expect(changementDePhoto(photo({ photo_id: "a" }), photo({ photo_id: "b" })).change).toBe(false);
  });

  it("une famille part et une autre arrive : changement, avec les deux noms", () => {
    const r = changementDePhoto(photo({ families_present: ["Coffee"] }), photo({ families_present: ["Tea"] }));
    expect(r.change).toBe(true);
    expect(r.raisons).toEqual([{ quoi: "familles", partis: ["Coffee"], venus: ["Tea"], avant: null, apres: null }]);
  });

  it("une famille s'ajoute sans qu'aucune ne parte : changement (le meuble porte autre chose)", () => {
    const r = changementDePhoto(photo({ families_present: ["Coffee"] }), photo({ families_present: ["Coffee", "Tea"] }));
    expect(r.change).toBe(true);
    expect(r.raisons[0]).toMatchObject({ quoi: "familles", partis: [], venus: ["Tea"] });
  });

  it("les MÊMES familles dans un autre ordre, ou en double : aucun changement", () => {
    const r = changementDePhoto(photo({ families_present: ["Coffee", "Tea"] }), photo({ families_present: ["Tea", "Coffee", "Tea"] }));
    expect(r.change).toBe(false);
  });

  it("l'exposition change (rayonnage → vitrine) : changement", () => {
    const r = changementDePhoto(photo({ exposition: "rayonnage" }), photo({ exposition: "vitrine" }));
    expect(r.raisons).toEqual([{ quoi: "exposition", partis: [], venus: [], avant: "rayonnage", apres: "vitrine" }]);
  });

  it("le nombre d'étagères change : changement", () => {
    const r = changementDePhoto(photo({ levels: 4 }), photo({ levels: 5 }));
    expect(r.raisons).toEqual([{ quoi: "etageres", partis: [], venus: [], avant: 4, apres: 5 }]);
  });

  it("une exposition ou un nombre d'étagères INCONNU d'un côté ne fait jamais un changement", () => {
    expect(changementDePhoto(photo({ exposition: null }), photo({ exposition: "vitrine" })).change).toBe(false);
    expect(changementDePhoto(photo({ levels: null }), photo({ levels: 5 })).change).toBe(false);
    expect(changementDePhoto(photo({ levels: 4 }), photo({ levels: null })).change).toBe(false);
  });

  it("PLANCHER DE CADRAGE : un cadrage partiel d'un côté ne prouve aucune disparition", () => {
    const av = photo({ families_present: ["Coffee", "Tea"] });
    const ap = photo({ families_present: ["Coffee"], coverage_flag: "partiel" });
    expect(changementDePhoto(av, ap).change).toBe(false);
    expect(changementDePhoto({ ...av, coverage_flag: "partiel" }, { ...ap, coverage_flag: "entier" }).change).toBe(false);
  });

  it("les articles reconnus par le modèle ne font PAS une version — la reconnaissance varie sur un meuble identique", () => {
    const av = photo({ items_matched: [{ item_code: "A", confidence: "haute" }, { item_code: "B", confidence: "moyenne" }] });
    const ap = photo({ items_matched: [{ item_code: "A", confidence: "haute" }] });
    expect(changementDePhoto(av, ap).change).toBe(false);
  });

  it("la réponse du modèle à « a-t-il changé ? » ne déclenche rien — il n'a jamais vu la photo précédente", () => {
    const av = photo({ checklist: { vt_change_depuis: "non" } });
    const ap = photo({ checklist: { vt_change_depuis: "oui" } });
    expect(changementDePhoto(av, ap).change).toBe(false);
  });

  it("gardes d'identité : autre composant, autre version, autre dispositif, lecture en erreur → aucun changement", () => {
    const av = photo({ families_present: ["Coffee"] });
    const autre = (o: Partial<PhotoRow>) => changementDePhoto(av, photo({ families_present: ["Tea"], ...o })).change;
    expect(autre({ component_key: "k2" })).toBe(false);
    expect(autre({ version_no: 3 })).toBe(false);
    expect(autre({ dispositif_id: "d2" })).toBe(false);
    expect(autre({ status: "error" })).toBe(false);
    expect(changementDePhoto({ ...av, status: "error" }, photo({ families_present: ["Tea"] })).change).toBe(false);
  });

  it("plusieurs écarts à la fois : chacun est dit", () => {
    const r = changementDePhoto(
      photo({ families_present: ["Coffee"], exposition: "rayonnage", levels: 4 }),
      photo({ families_present: ["Tea"], exposition: "vitrine", levels: 5 }),
    );
    expect(r.change).toBe(true);
    expect(r.raisons.map((x) => x.quoi)).toEqual(["familles", "exposition", "etageres"]);
  });
});

describe("dernierePhotoDuComposant — l'unique terme de comparaison", () => {
  const rows: PhotoRow[] = [
    photo({ photo_id: "vieille", created_at: "2026-09-10T08:00:00Z" }),
    photo({ photo_id: "recente", created_at: "2026-09-12T08:00:00Z" }),
    photo({ photo_id: "autre_composant", component_key: "k2", created_at: "2026-09-13T08:00:00Z" }),
    photo({ photo_id: "autre_version", version_no: 1, created_at: "2026-09-13T09:00:00Z" }),
    photo({ photo_id: "en_erreur", status: "error", created_at: "2026-09-13T09:30:00Z" }),
  ];
  it("rend la plus récente du composant DANS la version, jamais celle d'un autre composant ni d'une autre version", () => {
    expect(dernierePhotoDuComposant(rows, "k1", 2)?.photo_id).toBe("recente");
  });
  it("aucune photo de ce composant dans cette version : null (la suivante documentera la version)", () => {
    expect(dernierePhotoDuComposant(rows, "k3", 2)).toBeNull();
    expect(dernierePhotoDuComposant([], "k1", 2)).toBeNull();
  });
});
