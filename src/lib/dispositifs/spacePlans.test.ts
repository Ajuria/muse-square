import { describe, expect, it } from "vitest";
import { refusDeDepot, planEnVigueur, planObjectPath, planApiUrl, PLAN_MAX_BYTES, type SpacePlanRow } from "./spacePlans";

const p = (o: Partial<SpacePlanRow>): SpacePlanRow => ({
  plan_id: "a", location_id: "loc", gcs_uri: "gs://b/x.pdf", content_type: "application/pdf",
  bytes: 1000, original_name: null, created_by: null, created_at: "2026-09-15T10:00:00Z", ...o,
});

describe("spacePlans — le plan du magasin déposé par l'exploitant", () => {
  it("les types acceptés : le PDF d'abord, c'est ce que rend un architecte", () => {
    for (const ct of ["application/pdf", "image/png", "image/jpeg", "image/webp"]) {
      expect(refusDeDepot({ content_type: ct, bytes: 1000 }), ct).toBeNull();
    }
    // L'en-tête d'un navigateur porte souvent un paramètre : « image/png; charset=binary ».
    expect(refusDeDepot({ content_type: "image/png; charset=binary", bytes: 10 })).toBeNull();
    expect(refusDeDepot({ content_type: "APPLICATION/PDF", bytes: 10 })).toBeNull();
  });

  it("ce qui est refusé l'est AVANT d'écrire quoi que ce soit", () => {
    expect(refusDeDepot({ content_type: "image/gif", bytes: 10 })).toBe("type_refuse");
    expect(refusDeDepot({ content_type: "text/html", bytes: 10 })).toBe("type_refuse");
    expect(refusDeDepot({ content_type: "", bytes: 10 })).toBe("type_refuse");
    expect(refusDeDepot({ content_type: null, bytes: 10 })).toBe("type_refuse");
    expect(refusDeDepot({ content_type: "application/pdf", bytes: 0 })).toBe("vide");
    expect(refusDeDepot({ content_type: "application/pdf", bytes: PLAN_MAX_BYTES + 1 })).toBe("trop_lourd");
    expect(refusDeDepot({ content_type: "application/pdf", bytes: PLAN_MAX_BYTES })).toBeNull();
  });

  it("le DERNIER déposé fait foi, quel que soit l'ordre d'entrée", () => {
    const rows = [p({ plan_id: "vieux", created_at: "2026-09-01T10:00:00Z" }),
                  p({ plan_id: "neuf", created_at: "2026-09-15T10:00:00Z" }),
                  p({ plan_id: "moyen", created_at: "2026-09-10T10:00:00Z" })];
    expect(planEnVigueur(rows)?.plan_id).toBe("neuf");
    expect(planEnVigueur([])).toBeNull();
  });

  it("le chemin ne dépend JAMAIS du nom de fichier de l'exploitant", () => {
    // Un nom d'utilisateur dans un chemin de bucket est une injection qui attend son tour.
    expect(planObjectPath("loc", "id1", "application/pdf")).toBe("loc/plan/id1.pdf");
    expect(planObjectPath("loc", "id1", "image/png")).toBe("loc/plan/id1.png");
    expect(planObjectPath("loc", "id1", "image/jpeg")).toBe("loc/plan/id1.jpg");
  });

  it("l'adresse porte l'identifiant du plan EN VIGUEUR — un plan remplacé n'est pas servi du cache", () => {
    const a = planApiUrl("loc", "id1"), b = planApiUrl("loc", "id2");
    expect(a).not.toBe(b);
    expect(a).toContain("location_id=loc");
    expect(a).toContain("file=id1");
  });
});
