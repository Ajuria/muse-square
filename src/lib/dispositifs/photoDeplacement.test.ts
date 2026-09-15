import { describe, expect, it } from "vitest";
import { planDeDeplacement, STATUT_DEPLACEE, type MeublePourDeplacement } from "./photoDeplacement";
import type { PhotoRow } from "./dispositifPhotoRows";

// Les NOMS sont ceux que porte la base du compte (`component_label`) — « N° 2 — Vin & Spiritueux ».
// Ils ne se recomposent pas à partir du numéro et du pôle : c'est la faute du 15/09, et le test la
// garde en montrant que le plan rend le nom LU, jamais un nom fabriqué.
const MEUBLES: MeublePourDeplacement[] = [
  { component_key: "p4", fixture_no: 4, nom: "N° 4 — Vin & Spiritueux", pole_label: "Cave", dispositif_id: "d-cave" },
  { component_key: "p7", fixture_no: 7, nom: "N° 7 — Vin & Spiritueux", pole_label: "Cave", dispositif_id: "d-cave" },
  { component_key: "p3", fixture_no: 3, nom: "N° 3 — Récipients", pole_label: "Cuisine", dispositif_id: "d-cuisine" },
];
const photo = (o: Partial<PhotoRow> = {}): PhotoRow => ({
  photo_id: "ph1", location_id: "loc", dispositif_id: "d-cave", version_no: 1, component_key: "p4",
  walk_id: null, seq: null, t_offset_s: null, gcs_uri: "gs://b/x.jpg", dispositif_type: null,
  dispositif_role: null, status: "read", checklist: null,
  items_matched: [{ item_code: "a", confidence: "high" }, { item_code: "b", confidence: "low" }],
  items_confirmed: null, prices_seen: null, coverage_flag: null, model: null, prompt_version: null,
  created_by: null, created_at: "2026-09-14T20:12:00Z", deplacee_vers: null, ...o,
} as PhotoRow);

describe("planDeDeplacement — la règle du déplacement d'une photo", () => {
  it("le cas simple : la photo part vers le meuble qui porte ce numéro, avec son NOM lu en base", () => {
    const r = planDeDeplacement({ photo_id: "ph1", vers_fixture_no: 7, photos: [photo()], meubles: MEUBLES });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.vers).toMatchObject({ component_key: "p7", nom: "N° 7 — Vin & Spiritueux", fixture_no: 7 });
    expect(r.plan.depuis).toMatchObject({ component_key: "p4", nom: "N° 4 — Vin & Spiritueux" });
    expect(r.plan.change_de_pole).toBe(false);
    expect(r.plan.articles_suivis).toBe(2);
  });

  it("le numéro traverse les pôles, et le plan LE DIT — c'est ce que la page annonce avant de confirmer", () => {
    // Mesuré sur le compte : n° 1, 2, 4, 7 sont en Cave ; n° 3, 5, 6 en Cuisine. Un numéro tapé de
    // travers ne change pas seulement de meuble, il emmène les articles lus dans un AUTRE pôle.
    const r = planDeDeplacement({ photo_id: "ph1", vers_fixture_no: 3, photos: [photo()], meubles: MEUBLES });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.change_de_pole).toBe(true);
    expect(r.plan.vers.pole_label).toBe("Cuisine");
    expect(r.plan.vers.dispositif_id).toBe("d-cuisine");
  });

  it("le numéro saisi de travers REFUSE, il ne devine pas", () => {
    const p = [photo()];
    for (const v of ["", null, undefined, "abc", 0, -3, 2.5]) {
      const r = planDeDeplacement({ photo_id: "ph1", vers_fixture_no: v, photos: p, meubles: MEUBLES });
      expect(r.ok, `« ${String(v)} » doit être refusé`).toBe(false);
      if (!r.ok) expect(r.refus).toBe("numero_absent");
    }
    expect(planDeDeplacement({ photo_id: "ph1", vers_fixture_no: 99, photos: p, meubles: MEUBLES }))
      .toMatchObject({ ok: false, refus: "numero_inconnu" });
    expect(planDeDeplacement({ photo_id: "absente", vers_fixture_no: 7, photos: p, meubles: MEUBLES }))
      .toMatchObject({ ok: false, refus: "photo_introuvable" });
    expect(planDeDeplacement({ photo_id: "ph1", vers_fixture_no: 4, photos: p, meubles: MEUBLES }))
      .toMatchObject({ ok: false, refus: "deja_la" });
  });

  it("deux meubles sous le même numéro : on REFUSE, on ne choisit pas à sa place", () => {
    // Impossible sur le compte aujourd'hui (52 numéros distincts) — donc jamais exercé en vrai. C'est
    // exactement pour ça que le cas se teste : deux photos rangées au hasard coûtent plus cher qu'un
    // geste qui ne part pas.
    const jumeaux = [...MEUBLES, { component_key: "p99", fixture_no: 7, nom: "N° 7 — Bis", pole_label: "Cave", dispositif_id: "d-cave" }];
    expect(planDeDeplacement({ photo_id: "ph1", vers_fixture_no: 7, photos: [photo()], meubles: jumeaux }))
      .toMatchObject({ ok: false, refus: "numero_ambigu" });
  });

  it("le numéro arrive en TEXTE depuis un champ de saisie, avec ses espaces", () => {
    const r = planDeDeplacement({ photo_id: "ph1", vers_fixture_no: "  7 ", photos: [photo()], meubles: MEUBLES });
    expect(r.ok).toBe(true);
  });

  it("le statut stocké est en bon français, accentué (owner 15/09)", () => {
    expect(STATUT_DEPLACEE).toBe("déplacée");
  });
});
