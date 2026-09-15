// La mémoire visuelle du dispositif (13/09, owner : « garder la mémoire visuelle des dispositifs qui ont
// fonctionné ou non au niveau de l'agencement ») : par version, la dernière photo de chaque composant.
import { describe, expect, it } from "vitest";
import { nomsDuComposant, photosParVersion, type PhotoRow } from "./dispositifPhotoRows";

const row = (o: Partial<PhotoRow>): PhotoRow => ({
  photo_id: "p", location_id: "l", dispositif_id: "d", version_no: 1, component_key: "c", walk_id: null, seq: null,
  t_offset_s: null, gcs_uri: "gs://x", dispositif_type: null, dispositif_role: null, status: "read", checklist: null,
  items_matched: null, items_confirmed: null, prices_seen: null, coverage_flag: null, model: null, prompt_version: null,
  created_by: null, created_at: "2026-09-03T10:00:00Z", exposition: null, levels: null, families_present: [], fixture_no: null, deplacee_vers: null, ...o,
});
const LABEL = (t: string | null) => (t === "vitrine" ? "Vitrine" : t === "lineaire" ? "Linéaire" : "");

describe("photosParVersion — la mémoire visuelle par version", () => {
  it("range chaque photo sous SA version, et garde la plus récente par composant", () => {
    const out = photosParVersion([
      row({ photo_id: "v1-a-vieille", version_no: 1, component_key: "a", created_at: "2026-08-01T09:00:00Z" }),
      row({ photo_id: "v1-a-recente", version_no: 1, component_key: "a", created_at: "2026-08-20T09:00:00Z" }),
      row({ photo_id: "v2-a", version_no: 2, component_key: "a", created_at: "2026-09-05T09:00:00Z" }),
    ], LABEL);
    expect(out[1].photos.map((p) => p.photo_id)).toEqual(["v1-a-recente"]);
    expect(out[2].photos.map((p) => p.photo_id)).toEqual(["v2-a"]);
  });

  it("le libellé est celui du TYPE du composant, jamais la clé technique ; l'adresse est celle de l'API", () => {
    const out = photosParVersion([row({ photo_id: "px", component_key: "k_7f3c", dispositif_type: "vitrine" })], LABEL);
    expect(out[1].photos[0].label_fr).toBe("Vitrine");
    expect(out[1].photos[0].url).toBe("/api/dispositifs/photos?dispositif_id=d&file=px");
    expect(out[1].photos[0].url).not.toContain("k_7f3c");
  });

  it("un type inconnu dit « Composant » plutôt que rien", () => {
    expect(photosParVersion([row({ dispositif_type: "inconnu" })], LABEL)[1].photos[0].label_fr).toBe("Composant");
  });

  it("une photo en erreur de lecture n'entre pas dans la mémoire", () => {
    const out = photosParVersion([row({ photo_id: "ko", component_key: "a", status: "error" }), row({ photo_id: "ok", component_key: "b" })], LABEL);
    expect(out[1].photos.map((p) => p.photo_id)).toEqual(["ok"]);
  });

  it("au-delà de la rangée, les photos restantes sont COMPTÉES, jamais perdues en silence", () => {
    const rows = ["a", "b", "c", "d", "e", "f"].map((k, i) => row({ photo_id: `p${k}`, component_key: k, created_at: `2026-09-0${i + 1}T09:00:00Z` }));
    const out = photosParVersion(rows, LABEL, 4);
    expect(out[1].photos).toHaveLength(4);
    expect(out[1].autres).toBe(2);
  });

  it("aucune photo = aucune version au registre (la page ne rend alors aucun emplacement)", () => {
    expect(photosParVersion([], LABEL)).toEqual({});
  });
});

// ── 13/09 (owner, légende A + nom court) — le nom d'un composant vu par une photo ──
describe("nomsDuComposant", () => {
  it("UNE famille reconnue : le nom complet compose le type et la famille, le court garde la famille", () => {
    expect(nomsDuComposant("Vitrine", ["Couteaux"])).toEqual({ complet: "Vitrine — Couteaux", court: "Couteaux" });
  });
  it("DEUX familles ne font pas un nom : le type seul, court et complet identiques", () => {
    expect(nomsDuComposant("Linéaire", ["Épices", "Thé"])).toEqual({ complet: "Linéaire", court: "Linéaire" });
  });
  it("aucune famille reconnue : le type seul", () => {
    expect(nomsDuComposant("Comptoir", [])).toEqual({ complet: "Comptoir", court: "Comptoir" });
  });
  it("un type inconnu ne laisse jamais un nom vide", () => {
    expect(nomsDuComposant("", ["Vin"])).toEqual({ complet: "Composant — Vin", court: "Vin" });
  });
});

describe("photosParVersion — l'identité affichable", () => {
  const r = (o: Partial<PhotoRow>): PhotoRow => ({
    photo_id: "p", location_id: "l", dispositif_id: "d", version_no: 1, component_key: "c", walk_id: null, seq: null,
    t_offset_s: null, gcs_uri: "gs://x", dispositif_type: "vitrine", dispositif_role: null, status: "read", checklist: null,
    items_matched: null, items_confirmed: null, prices_seen: null, coverage_flag: null, model: null, prompt_version: null,
    created_by: null, created_at: "2026-09-03T10:00:00Z", exposition: null, levels: null, families_present: [], fixture_no: null, deplacee_vers: null, ...o,
  });
  it("porte le nom court, le N° du plan et le NOM de l'auteur — jamais son identifiant", () => {
    const out = photosParVersion(
      [r({ photo_id: "px", families_present: ["Couteaux"], fixture_no: 27, created_by: "user_abc" })],
      () => "Vitrine", 4, { user_abc: "Camille" },
    );
    expect(out[1].photos[0]).toMatchObject({ label_fr: "Vitrine — Couteaux", label_court: "Couteaux", fixture_no: 27, auteur: "Camille" });
    expect(JSON.stringify(out)).not.toContain("user_abc");
  });
  it("un auteur inconnu du roster rend null — la légende l'omet, elle n'affiche pas un identifiant", () => {
    const out = photosParVersion([r({ created_by: "user_zzz" })], () => "Vitrine", 4, {});
    expect(out[1].photos[0].auteur).toBeNull();
  });
});
