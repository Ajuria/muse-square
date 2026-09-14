// Les cas du retrait, et surtout ceux où la VERSION ne doit PAS tomber.
import { describe, it, expect } from "vitest";
import { planDeRetrait } from "./photoRetrait";
import type { PhotoRow } from "./dispositifPhotoRows";

const photo = (o: Partial<PhotoRow> & { photo_id: string; version_no: number; created_at: string }): PhotoRow => ({
  photo_id: o.photo_id, location_id: "loc", dispositif_id: "disp", component_key: o.component_key ?? "p45",
  version_no: o.version_no, walk_id: null, seq: null, t_offset_s: null, gcs_uri: "gs://b/x.jpg",
  dispositif_type: "rayonnage", dispositif_role: null, status: "read", checklist: {}, items_matched: [],
  items_confirmed: null, prices_seen: [], coverage_flag: "entier", model: "m", prompt_version: "v",
  created_by: "u", created_at: o.created_at, exposition: null, levels: null, families_present: [], fixture_no: null,
} as PhotoRow);

const versions = [{ commitment_id: "c1", version_no: 1 }, { commitment_id: "c2", version_no: 2 }];

describe("planDeRetrait", () => {
  it("une photo inconnue ne rend aucun plan", () => {
    expect(planDeRetrait({ photo_id: "absent", photos: [photo({ photo_id: "a", version_no: 1, created_at: "2026-09-14T10:00:00Z" })], versions })).toBeNull();
  });

  it("les quatre endroits : la ligne et les TROIS objets, toujours", () => {
    const p = planDeRetrait({ photo_id: "a", photos: [photo({ photo_id: "a", version_no: 1, created_at: "2026-09-14T10:00:00Z" })], versions })!;
    expect(p.variantes).toEqual(["full", "band", "square"]);
  });

  it("LA VERSION 1 N'EST JAMAIS TOUCHÉE — c'est le pôle lui-même", () => {
    const p = planDeRetrait({ photo_id: "a", photos: [photo({ photo_id: "a", version_no: 1, created_at: "2026-09-14T10:00:00Z" })], versions })!;
    expect(p.version).toBeNull();
    expect(p.version_gardee).toBe("version_1");
  });

  it("la photo qui a FAIT NAÎTRE la version 2, seule dedans : la version tombe avec elle", () => {
    const photos = [
      photo({ photo_id: "a", version_no: 1, created_at: "2026-09-14T10:00:00Z" }),
      photo({ photo_id: "b", version_no: 2, created_at: "2026-09-14T11:00:00Z" }),
    ];
    const p = planDeRetrait({ photo_id: "b", photos, versions })!;
    expect(p.version).toEqual({ commitment_id: "c2", version_no: 2 });
    expect(p.version_gardee).toBeNull();
    // le pôle revient en v1, donc la photo « a » redevient celle du composant
    expect(p.redevient_courante).toBe("a");
  });

  it("d'autres photos vivent dans la version 2 : la version RESTE, et le plan dit pourquoi", () => {
    const photos = [
      photo({ photo_id: "a", version_no: 1, created_at: "2026-09-14T10:00:00Z" }),
      photo({ photo_id: "b", version_no: 2, created_at: "2026-09-14T11:00:00Z" }),
      photo({ photo_id: "c", version_no: 2, component_key: "p50", created_at: "2026-09-14T11:30:00Z" }),
    ];
    const p = planDeRetrait({ photo_id: "b", photos, versions })!;
    expect(p.version).toBeNull();
    expect(p.version_gardee).toBe("autres_photos");
    // on reste en v2, où ce composant n'a plus de photo
    expect(p.redevient_courante).toBeNull();
  });

  it("une photo POSTÉRIEURE dans la version 2 ne fait pas tomber la version (elle ne l'a pas créée)", () => {
    const photos = [
      photo({ photo_id: "b", version_no: 2, created_at: "2026-09-14T11:00:00Z" }),
      photo({ photo_id: "d", version_no: 2, created_at: "2026-09-14T12:00:00Z" }),
    ];
    const p = planDeRetrait({ photo_id: "d", photos, versions })!;
    expect(p.version).toBeNull();
    expect(p.version_gardee).toBe("autres_photos");
    expect(p.redevient_courante).toBe("b");
  });

  it("la version n'est pas connue : rien n'est supprimé à l'aveugle", () => {
    const photos = [photo({ photo_id: "b", version_no: 3, created_at: "2026-09-14T11:00:00Z" })];
    const p = planDeRetrait({ photo_id: "b", photos, versions })!;
    expect(p.version).toBeNull();
    expect(p.version_gardee).toBe("version_inconnue");
  });

  it("la photo la plus RÉCENTE du composant redevient courante, pas la première", () => {
    const photos = [
      photo({ photo_id: "a1", version_no: 1, created_at: "2026-09-14T09:00:00Z" }),
      photo({ photo_id: "a2", version_no: 1, created_at: "2026-09-14T10:00:00Z" }),
      photo({ photo_id: "a3", version_no: 1, created_at: "2026-09-14T11:00:00Z" }),
    ];
    const p = planDeRetrait({ photo_id: "a3", photos, versions })!;
    expect(p.redevient_courante).toBe("a2");
  });
});
