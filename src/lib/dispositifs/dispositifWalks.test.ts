import { describe, it, expect } from "vitest";
import { construireMarche, contexteDeLUA } from "./dispositifWalks";

// L'user agent RÉEL du téléphone de l'owner, relevé dans son compte rendu de marche du 14/09.
const UA_OWNER = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1";
const WALK = "3f2b1a90-1c4d-4e5f-8a9b-0c1d2e3f4a5b";
const base = {
  walk_id: WALK,
  started_at: "2026-09-14T18:16:58.979Z",
  ended_at: "2026-09-14T18:18:21.254Z",
};
const faire = (extra: Record<string, unknown> = {}) =>
  construireMarche({ body: { ...base, ...extra }, location_id: "loc1", created_by: "user_1", now: "2026-09-14T18:18:30.000Z" });

describe("contexteDeLUA — ce qu'un user agent dit VRAIMENT", () => {
  it("rend la plateforme et la version d'iOS, jamais le modèle", () => {
    // Apple ne met pas « iPhone 17 » dans l'user agent : l'écrire serait une invention.
    expect(contexteDeLUA(UA_OWNER)).toEqual({ platform: "iPhone", os_version: "18.7" });
  });
  it("reconnaît Android", () => {
    expect(contexteDeLUA("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36")).toEqual({ platform: "Android", os_version: "14" });
  });
  it("rend deux nulls sur un agent vide ou inconnu", () => {
    expect(contexteDeLUA(null)).toEqual({ platform: null, os_version: null });
    expect(contexteDeLUA("curl/8.1")).toEqual({ platform: null, os_version: null });
  });
});

describe("construireMarche — la ligne d'une marche", () => {
  it("bâtit la ligne de la marche réelle du 14/09", () => {
    const r = faire({
      photos_kept: 9, photos_written: 7, problems: 0,
      user_agent: UA_OWNER, viewport_w: 402, viewport_h: 812,
      stream_w: 2160, stream_h: 3840, camera_mode: "stream+photo",
      real_photos: 9, photo_failures: 0, app_build: "afc5d16",
      pole_sequence: [{ pole: "Cave", t: 0 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.duration_s).toBe(82.3);
    expect(r.row.platform).toBe("iPhone");
    expect(r.row.os_version).toBe("18.7");
    expect(r.row.stream_w).toBe(2160);
    expect(r.row.photos_written).toBe(7);
    expect(r.row.pole_sequence).toBe('[{"pole":"Cave","t":0}]');
    expect(r.row.location_id).toBe("loc1");
    expect(r.row.created_by).toBe("user_1");
  });

  it("refuse un walk_id qui n'est pas un identifiant", () => {
    expect(construireMarche({ body: { ...base, walk_id: "marche-1" }, location_id: "l", created_by: null }).ok).toBe(false);
    expect(construireMarche({ body: { ...base, walk_id: "" }, location_id: "l", created_by: null }).ok).toBe(false);
  });

  it("refuse une marche sans bornes, ou qui finit avant de commencer", () => {
    expect(construireMarche({ body: { walk_id: WALK }, location_id: "l", created_by: null }).ok).toBe(false);
    const r = construireMarche({ body: { walk_id: WALK, started_at: base.ended_at, ended_at: base.started_at }, location_id: "l", created_by: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("avant de commencer");
  });

  it("refuse une marche de plus d'un jour — c'est un onglet resté ouvert", () => {
    const r = construireMarche({ body: { walk_id: WALK, started_at: "2026-09-10T08:00:00Z", ended_at: "2026-09-14T08:00:00Z" }, location_id: "l", created_by: null });
    expect(r.ok).toBe(false);
  });

  it("met les compteurs à 0 plutôt que null quand ils manquent", () => {
    const r = faire();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.photos_kept).toBe(0);
    expect(r.row.photos_written).toBe(0);
    expect(r.row.problems).toBe(0);
  });

  it("écarte un compteur absurde au lieu de l'écrire", () => {
    const r = faire({ photos_kept: -3, stream_w: 999999, viewport_w: "beaucoup" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.photos_kept).toBe(0);
    expect(r.row.stream_w).toBeNull();
    expect(r.row.viewport_w).toBeNull();
  });

  it("n'écrit AUCUNE position : un corps qui en porte une la voit ignorée", () => {
    const r = faire({ latitude: 48.85, longitude: 2.26, address: "12 rue de Paris" } as any);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(r.row)).not.toContain("48.85");
    expect(JSON.stringify(r.row)).not.toContain("rue de Paris");
  });

  it("garde la séquence des pôles, écarte les entrées sans nom, et borne la liste", () => {
    const r = faire({ pole_sequence: [{ pole: "Cave", t: 0 }, { t: 12 }, { pole: "Caisse", t: 30.44 }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.parse(r.row.pole_sequence as string)).toEqual([{ pole: "Cave", t: 0 }, { pole: "Caisse", t: 30.4 }]);
  });

  it("rend une séquence nulle plutôt qu'un tableau vide", () => {
    const r = faire({ pole_sequence: [] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.pole_sequence).toBeNull();
  });

  it("tronque un user agent démesuré au lieu de le refuser", () => {
    const r = faire({ user_agent: "x".repeat(900) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.row.user_agent as string).length).toBe(400);
  });
});
