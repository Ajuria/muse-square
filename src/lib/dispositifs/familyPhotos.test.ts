import { describe, it, expect } from "vitest";
import { pickFamilyPhoto, familyPhotoPayload, photoProxyUrl, FAMILY_PHOTO_CARD_TYPES, type FamilyPhotoRow } from "./familyPhotos";
const row = (o: Partial<FamilyPhotoRow>): FamilyPhotoRow => ({ dispositif_id: "d1", photo_id: "p1", component_label: "Étagère du fond", created_at: "2026-09-11 10:00:00+00", families_present: ["Thé"], fixture_no: 7, ...o });

describe("pickFamilyPhoto — la photo d'une carte famille", () => {
  it("égalité EXACTE du nom : ni casse, ni sous-chaîne", () => {
    const rows = [row({ families_present: ["Thé vert"] }), row({ photo_id: "p2", families_present: ["thé"] })];
    expect(pickFamilyPhoto(rows, "Thé")).toBeNull();
  });
  it("la plus SPÉCIFIQUE gagne (le moins de familles), même plus ancienne", () => {
    const rows = [
      row({ photo_id: "large", families_present: ["Thé", "Café", "Épices"], created_at: "2026-09-11 12:00:00+00" }),
      row({ photo_id: "precise", families_present: ["Thé"], created_at: "2026-09-01 12:00:00+00" }),
    ];
    expect(pickFamilyPhoto(rows, "Thé")?.photo_id).toBe("precise");
  });
  it("à spécificité égale, la plus récente ; puis l'id, pour un choix stable", () => {
    const rows = [
      row({ photo_id: "b", created_at: "2026-09-10 12:00:00+00" }),
      row({ photo_id: "c", created_at: "2026-09-11 12:00:00+00" }),
      row({ photo_id: "a", created_at: "2026-09-11 12:00:00+00" }),
    ];
    expect(pickFamilyPhoto(rows, "Thé")?.photo_id).toBe("a");
  });
  it("famille absente, vide ou nulle → aucune photo", () => {
    expect(pickFamilyPhoto([row({})], "Café")).toBeNull();
    expect(pickFamilyPhoto([row({})], "")).toBeNull();
    expect(pickFamilyPhoto([row({})], null)).toBeNull();
  });
});

describe("familyPhotoPayload — ce que la carte reçoit", () => {
  it("la variante « band » du proxy, le nom du composant, le numéro sur le plan, la date ISO", () => {
    expect(familyPhotoPayload(row({ dispositif_id: "d 1", photo_id: "p/1" }))).toEqual({
      family_photo: "/api/dispositifs/photos?dispositif_id=d%201&file=p%2F1&variant=band",
      family_photo_label: "Étagère du fond", family_photo_fixture_no: 7, family_photo_date: "2026-09-11",
    });
  });
  it("un numéro nul ou absent ne s'écrit pas", () => {
    expect(familyPhotoPayload(row({ fixture_no: 0 })).family_photo_fixture_no).toBeNull();
    expect(familyPhotoPayload(row({ fixture_no: null })).family_photo_fixture_no).toBeNull();
  });
  it("l'URL entière n'a pas de paramètre variant ; les quatre cartes famille, et elles seules", () => {
    expect(photoProxyUrl("d", "p")).toBe("/api/dispositifs/photos?dispositif_id=d&file=p");
    expect([...FAMILY_PHOTO_CARD_TYPES].sort()).toEqual(["family_discount_move", "family_price_move", "family_space_underuse", "offering_mix_shift"]);
  });
});
